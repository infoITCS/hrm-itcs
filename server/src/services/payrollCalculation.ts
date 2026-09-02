import mongoose from 'mongoose';
import PayrollRun, { IPayrollRun } from '../models/PayrollRun';
import Payslip from '../models/Payslip';
import Employee from '../models/Employee';
import Counter from '../models/Counter';
import EmployeeRequest from '../models/EmployeeRequest';
import AttendanceRecord from '../models/AttendanceRecord';
import Company from '../models/Company';
import ExpenseClaim from '../models/ExpenseClaim';
import { getHolidayDatesInPeriod } from '../utils/holidayUtils';
import { generateCustomerReference } from '../utils/encryption';
import { formatEmployeeFullName } from '../utils/nameHelper';
import { applyFirstPenaltyExemption, statusToPenaltyType } from '../utils/attendancePenaltyPolicy';
import {
    isExpenseClaimPayrollEarning,
    payrollComponentForClaimCategory,
} from '../utils/expenseClaimPayroll';
import { buildComputedLoanMap, getLoanInfoForPayroll, loanInfoFromEmployeeRecord } from './loanManagementService';
import { PAYROLL_EXCLUDED_STATUSES } from '../utils/employmentStatus';
import { upgradeCompletedProbations } from './probationUpgradeService';

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function getEmploymentStatus(emp: any): string {
    if (!emp?.employmentStatus) return '';
    if (typeof emp.employmentStatus === 'string') return emp.employmentStatus;
    return emp.employmentStatus.status || '';
}

function resolveEmployeeEarnings(emp: any): { component: string; amount: number; type: 'fixed' | 'variable'; expenseClaim?: boolean }[] {
    const fromComponents = (emp.salaryComponents || [])
        .filter((sc: any) => sc && sc.component && (Number(sc.amount) || 0) > 0)
        .map((sc: any) => ({
            component: sc.component,
            amount: Number(sc.amount) || 0,
            type: (sc.type === 'variable' ? 'variable' : 'fixed') as 'fixed' | 'variable',
        }));

    if (fromComponents.length > 0) return fromComponents;

    const status = getEmploymentStatus(emp);
    const probationSalary = Number(emp.financeInfo?.probationSalary) || 0;
    const confirmedSalary = Number(emp.financeInfo?.confirmedSalary) || 0;

    let fallbackAmount = 0;
    let component = 'Basic Salary';

    if (status === 'Probation' && probationSalary > 0) {
        fallbackAmount = probationSalary;
        component = 'Probation Salary';
    } else if (confirmedSalary > 0) {
        fallbackAmount = confirmedSalary;
    } else if (probationSalary > 0) {
        fallbackAmount = probationSalary;
        if (status === 'Probation') component = 'Probation Salary';
    }

    if (fallbackAmount > 0) {
        return [{ component, amount: fallbackAmount, type: 'fixed' }];
    }

    return [];
}

export function computePayrollAmountTotals(payslips: any[]) {
    let totalPayableAmount = 0;
    let totalExpenseClaimsAmount = 0;

    for (const ps of payslips) {
        totalPayableAmount += Number(ps.netPay) || 0;
        for (const e of ps.earnings || []) {
            if (isExpenseClaimPayrollEarning(e)) {
                totalExpenseClaimsAmount += Number(e.amount) || 0;
            }
        }
    }

    return {
        totalPayableAmount,
        totalExpenseClaimsAmount,
        erpPayableAmount: totalPayableAmount - totalExpenseClaimsAmount,
    };
}

export interface ExpenseClaimSummary {
    _id: string;
    claimNo: string;
    employeeId: string;
    amount: number;
    erpReferenceId?: string;
    category: string;
}

export interface PayrollBuildResult {
    payslips: any[];
    usedClaimIds: mongoose.Types.ObjectId[];
    usedPfRequestIds: mongoose.Types.ObjectId[];
    missingSalary: string[];
    expenseClaimsIncluded: ExpenseClaimSummary[];
    totals: ReturnType<typeof computePayrollAmountTotals>;
}

export async function buildPayrollPayslips(
    run: IPayrollRun & { _id: mongoose.Types.ObjectId },
    options: { persist?: boolean } = {}
): Promise<PayrollBuildResult> {
    const persist = options.persist === true;
    const runId = run._id.toString();

    await upgradeCompletedProbations();

    const employees = await Employee.find({
        $or: [
            { 'employmentStatus.status': { $exists: false } },
            { 'employmentStatus.status': { $in: [null, ''] } },
            { 'employmentStatus.status': { $nin: PAYROLL_EXCLUDED_STATUSES } },
            { employmentStatus: { $type: 'string', $nin: PAYROLL_EXCLUDED_STATUSES } },
        ],
    }).select('employeeId firstName middleName lastName salaryComponents bankDetails jobInfo employmentStatus financeInfo loans');

    if (!employees.length) {
        throw Object.assign(new Error('No active employees found to generate payslips.'), { status: 400 });
    }

    if (persist) {
        await Payslip.deleteMany({ payrollRunId: runId });
        await ExpenseClaim.updateMany(
            { payrollRunId: run._id, payoutStatus: 'Included in Payroll' },
            { payoutStatus: 'Unpaid', $unset: { payrollRunId: 1 } }
        );
    }

    const defaultLastDay = new Date(run.periodYear, run.periodMonth, 0).getDate();
    const periodStart = run.startDate || `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;
    const periodEnd = run.endDate || `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-${String(defaultLastDay).padStart(2, '0')}`;

    let workingDaysCount = 0;
    const curDate = new Date(periodStart + 'T12:00:00.000Z');
    const stopDate = new Date(periodEnd + 'T12:00:00.000Z');
    while (curDate <= stopDate) {
        const dayOfWeek = curDate.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDaysCount++;
        curDate.setUTCDate(curDate.getUTCDate() + 1);
    }
    const monthlyWorkingDays = workingDaysCount > 0 ? workingDaysCount : 22;

    const mealRecords = await AttendanceRecord.find({
        date: { $gte: periodStart, $lte: periodEnd },
        status: 'Present',
        isWfh: { $ne: true },
        note: { $not: /wfh|work from home/i },
    }).select('employeeId').lean() as any[];

    const mealDaysMap: Record<string, number> = {};
    for (const r of mealRecords) {
        mealDaysMap[r.employeeId] = (mealDaysMap[r.employeeId] ?? 0) + 1;
    }

    const companyDoc = await Company.findOne().lean() as any;
    const MEAL_RATE = companyDoc?.payrollSettings?.mealRatePerDay ?? 500;

    const holidayDates = await getHolidayDatesInPeriod(periodStart, periodEnd);
    if (persist && holidayDates.size > 0) {
        for (const [holidayDate, holidayName] of holidayDates) {
            await AttendanceRecord.updateMany(
                {
                    date: holidayDate,
                    status: { $in: ['Absent', 'Late', 'Half-Day'] },
                },
                {
                    $set: {
                        status: 'Holiday',
                        note: holidayName,
                        workDurationMinutes: 0,
                        lateMinutes: 0,
                    },
                }
            );
        }
    }

    const periodRecords = await AttendanceRecord.find({
        date: { $gte: periodStart, $lte: periodEnd },
    }).select('employeeId status date').lean() as any[];

    const employeeAttendanceMap: Record<string, any> = {};
    const attendanceDeductionsMap: Record<string, { penalties: { date: string; type: 'half' | 'full' }[] }> = {};

    for (const r of periodRecords) {
        if (!employeeAttendanceMap[r.employeeId]) {
            employeeAttendanceMap[r.employeeId] = {
                workingDays: monthlyWorkingDays,
                presentDays: 0,
                lateDays: 0,
                halfDays: 0,
                absentDays: 0,
                leaveDays: 0,
            };
        }
        if (r.status === 'Present') employeeAttendanceMap[r.employeeId].presentDays++;
        else if (r.status === 'Late') employeeAttendanceMap[r.employeeId].lateDays++;
        else if (r.status === 'Half-Day') employeeAttendanceMap[r.employeeId].halfDays++;
        else if (r.status === 'Absent') employeeAttendanceMap[r.employeeId].absentDays++;
        else if (r.status === 'On Leave') employeeAttendanceMap[r.employeeId].leaveDays++;

        if (holidayDates.has(r.date)) continue;
        const penaltyType = statusToPenaltyType(r.status);
        if (!penaltyType) continue;

        if (!attendanceDeductionsMap[r.employeeId]) {
            attendanceDeductionsMap[r.employeeId] = { penalties: [] };
        }
        attendanceDeductionsMap[r.employeeId].penalties.push({ date: r.date, type: penaltyType });
    }

    const loanBalanceMap = await buildComputedLoanMap();

    const approvedLoanPauses = await EmployeeRequest.find({
        status: { $in: ['Approved', 'Completed'] },
        $or: [
            { category: { $regex: /loan.*pause|pause.*loan/i } },
            { requestType: { $regex: /loan.*pause|pause.*loan/i } },
        ],
    }).lean();

    const pausedEmployeesMap: Record<string, string> = {};
    for (const pauseReq of approvedLoanPauses) {
        const reqMonth = Number(pauseReq.details?.periodMonth || (pauseReq.details?.month ? new Date(pauseReq.details.month).getMonth() + 1 : null));
        const reqYear = Number(pauseReq.details?.periodYear || (pauseReq.details?.year ? new Date(pauseReq.details.year).getFullYear() : null));

        if ((!reqMonth || reqMonth === run.periodMonth) && (!reqYear || reqYear === run.periodYear)) {
            pausedEmployeesMap[pauseReq.employeeId] = pauseReq.details?.reason || 'Approved HR Loan Waiver / Pause';
        }
    }

    const approvedClaims = await ExpenseClaim.find({
        status: 'Approved',
        $or: [{ payoutStatus: 'Unpaid' }, { payoutStatus: { $exists: false } }],
    }).lean() as any[];

    const expenseClaimMap: Record<string, { total: number; claimIds: any[]; claims: any[] }> = {};
    for (const claim of approvedClaims) {
        const empId = claim.employeeId;
        if (!expenseClaimMap[empId]) {
            expenseClaimMap[empId] = { total: 0, claimIds: [], claims: [] };
        }
        const claimAmt = claim.approvedTotal ?? claim.amountAllowed ?? claim.amountRequested ?? 0;
        expenseClaimMap[empId].total += Number(claimAmt) || 0;
        expenseClaimMap[empId].claimIds.push(claim._id);
        expenseClaimMap[empId].claims.push(claim);
    }

    const approvedPfRequests = await EmployeeRequest.find({
        status: { $in: ['Approved', 'Completed'] },
        category: { $in: ['Provident Fund', 'PF Withdrawal', 'Request Provident Fund'] },
        $or: [{ payoutStatus: 'Unpaid' }, { payoutStatus: { $exists: false } }],
    }).lean() as any[];

    const pfRequestMap: Record<string, { total: number; requestIds: any[] }> = {};
    for (const pfr of approvedPfRequests) {
        const empId = pfr.employeeId;
        if (!pfRequestMap[empId]) {
            pfRequestMap[empId] = { total: 0, requestIds: [] };
        }
        const pfAmt = Number((pfr as any).details?.requestedAmount || (pfr as any).amount || 0);
        pfRequestMap[empId].total += pfAmt;
        pfRequestMap[empId].requestIds.push(pfr._id);
    }

    let nextSeq = 1;
    const prefix = `PS-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-`;

    if (persist) {
        const counterKey = `payslipNo_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}`;
        const counter = await Counter.findOneAndUpdate(
            { key: counterKey },
            { $inc: { seq: employees.length } },
            { upsert: true, new: true }
        );
        nextSeq = counter.seq - employees.length + 1;
    }

    const payslips: any[] = [];
    const missingSalary: string[] = [];
    const usedClaimIds: mongoose.Types.ObjectId[] = [];
    const usedPfRequestIds: mongoose.Types.ObjectId[] = [];
    const expenseClaimsIncluded: ExpenseClaimSummary[] = [];
    const includedClaimIdSet = new Set<string>();

    let empIndex = 0;
    for (const emp of employees) {
        empIndex++;
        const earnings = resolveEmployeeEarnings(emp);
        if (earnings.length === 0) {
            missingSalary.push(`${formatEmployeeFullName(emp, emp.employeeId)} (${emp.employeeId})`);
        }

        const empClaimInfo = expenseClaimMap[emp.employeeId];
        if (empClaimInfo && empClaimInfo.total > 0) {
            const byCategory: Record<string, number> = {};
            for (const claim of empClaimInfo.claims) {
                const label = payrollComponentForClaimCategory(claim.category);
                const claimAmt = Number(claim.approvedTotal ?? claim.amountAllowed ?? claim.amountRequested ?? 0) || 0;
                byCategory[label] = (byCategory[label] || 0) + claimAmt;
            }
            for (const [component, amount] of Object.entries(byCategory)) {
                if (amount <= 0) continue;
                earnings.push({
                    component,
                    amount,
                    type: 'variable',
                    expenseClaim: true,
                });
            }
            usedClaimIds.push(...empClaimInfo.claimIds);
            for (const claim of empClaimInfo.claims) {
                const idStr = String(claim._id);
                if (includedClaimIdSet.has(idStr)) continue;
                includedClaimIdSet.add(idStr);
                expenseClaimsIncluded.push({
                    _id: idStr,
                    claimNo: claim.claimNo,
                    employeeId: claim.employeeId,
                    amount: Number(claim.approvedTotal ?? claim.amountAllowed ?? claim.amountRequested ?? 0),
                    erpReferenceId: claim.erpReferenceId,
                    category: claim.category,
                });
            }
        }

        let pfPayoutAmount = 0;
        const empPfInfo = pfRequestMap[emp.employeeId];
        if (empPfInfo && empPfInfo.total > 0) {
            pfPayoutAmount = empPfInfo.total;
            earnings.push({
                component: 'PF Withdrawal (Non-Taxable)',
                amount: pfPayoutAmount,
                type: 'variable',
            });
            usedPfRequestIds.push(...empPfInfo.requestIds);
        }

        let hasAnniversaryInMonth = false;
        let yearsCompleted = 0;
        if (emp.jobInfo?.joiningDate) {
            const joiningDate = new Date(emp.jobInfo.joiningDate);
            const joiningMonth = joiningDate.getMonth() + 1;
            const joiningYear = joiningDate.getFullYear();

            if (joiningMonth === run.periodMonth && joiningYear < run.periodYear) {
                hasAnniversaryInMonth = true;
                yearsCompleted = run.periodYear - joiningYear;
            }
        }

        let notes = '';
        if (hasAnniversaryInMonth) {
            earnings.push({
                component: 'Anniversary Bonus',
                amount: 0,
                type: 'fixed',
            });
            notes = `Eligible for Work Anniversary Bonus (${yearsCompleted} Year${yearsCompleted > 1 ? 's' : ''} completed).`;
        }

        const isEntitledToMeal = emp.financeInfo?.entitledForMealAllowance !== false;
        const mealDays = isEntitledToMeal ? (mealDaysMap[emp.employeeId] ?? 0) : 0;
        if (isEntitledToMeal) {
            earnings.push({
                component: 'Meal Allowance',
                amount: mealDays * MEAL_RATE,
                type: 'variable',
            });
        }


        const grossPay = earnings.reduce((sum: number, e: any) => sum + e.amount, 0);

        const deductions: any[] = [];
        let totalDeductions = 0;
        let attendancePenaltyNote = '';

        const attInfo = attendanceDeductionsMap[emp.employeeId];
        if (attInfo?.penalties?.length) {
            const basicComp = earnings.find((c) => (c.component || '').toLowerCase().includes('basic'));
            const basicSal = basicComp ? basicComp.amount : (earnings[0]?.amount || 0);
            const dailyRate = basicSal / monthlyWorkingDays;

            const { halfDays, fullDays, exempted } = applyFirstPenaltyExemption(attInfo.penalties);
            if (exempted) {
                attendancePenaltyNote = 'First attendance penalty exempted this period.';
            }

            if (halfDays > 0) {
                const halfDayAmount = Math.round(halfDays * 0.5 * dailyRate);
                if (halfDayAmount > 0) {
                    const unitStr = halfDays === 1 ? 'half-day' : 'half-days';
                    deductions.push({
                        component: `Half-Day Penalty (${halfDays} ${unitStr})`,
                        amount: halfDayAmount,
                    });
                    totalDeductions += halfDayAmount;
                }
            }

            if (fullDays > 0) {
                const absentAmount = Math.round(fullDays * 1.0 * dailyRate);
                if (absentAmount > 0) {
                    const unitStr = fullDays === 1 ? 'day' : 'days';
                    deductions.push({
                        component: `Absence Penalty (${fullDays} ${unitStr})`,
                        amount: absentAmount,
                    });
                    totalDeductions += absentAmount;
                }
            }
        }

        let loanDeductAmount = 0;
        let loanPauseNote = '';
        const loanInfo = getLoanInfoForPayroll(emp.employeeId, emp, loanBalanceMap);
        if (loanInfo && loanInfo.balance > 0) {
            if (pausedEmployeesMap[emp.employeeId]) {
                loanDeductAmount = 0;
                loanPauseNote = `Loan deduction paused for ${MONTH_NAMES[run.periodMonth] || 'month'} ${run.periodYear} (Approved Request)`;
            } else {
                const amountToDeduct = Math.min(loanInfo.balance, loanInfo.monthlyDeduction);
                if (amountToDeduct > 0) {
                    loanDeductAmount = amountToDeduct;
                    deductions.push({
                        component: 'Loan Deduction',
                        amount: amountToDeduct,
                    });
                    totalDeductions += amountToDeduct;
                }
            }
        }

        const netPay = grossPay - totalDeductions;
        const payslipNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
        nextSeq++;

        const customerReference = generateCustomerReference(run.periodYear, run.periodMonth, empIndex);
        const beneficiaryAccount = emp.bankDetails?.accountNumber || emp.bankDetails?.iban || '';
        const beneficiaryName = formatEmployeeFullName(emp, emp.employeeId);
        const beneficiaryBank = emp.bankDetails?.bankName || companyDoc?.payrollSettings?.defaultBankName || 'Meezan Bank';

        const empAttSummary = employeeAttendanceMap[emp.employeeId] || {
            workingDays: monthlyWorkingDays,
            presentDays: 0,
            lateDays: 0,
            halfDays: 0,
            absentDays: 0,
            leaveDays: 0,
        };

        const payslipNotes = [notes, loanPauseNote, attendancePenaltyNote].filter(Boolean).join(' • ');

        payslips.push({
            payslipNo,
            employeeId: emp.employeeId,
            payrollRunId: run._id,
            periodMonth: run.periodMonth,
            periodYear: run.periodYear,
            currency: run.currency,
            beneficiaryAccount,
            beneficiaryName,
            beneficiaryBank,
            customerReference,
            taxDeduction: 0,
            loanDeduction: loanDeductAmount,
            pfPayout: pfPayoutAmount,
            earnings,
            deductions,
            grossPay,
            totalDeductions,
            netPay,
            status: 'Draft',
            paymentMethod: 'Bank Transfer',
            notes: payslipNotes || undefined,
            attendanceSummary: empAttSummary,
        });
    }

    const totals = computePayrollAmountTotals(payslips);

    if (persist) {
        await Payslip.insertMany(payslips, { ordered: false });

        if (usedClaimIds.length > 0) {
            await ExpenseClaim.updateMany(
                { _id: { $in: usedClaimIds } },
                { payoutStatus: 'Included in Payroll', payrollRunId: run._id }
            );
        }

        if (usedPfRequestIds.length > 0) {
            await EmployeeRequest.updateMany(
                { _id: { $in: usedPfRequestIds } },
                { payoutStatus: 'Included in Payroll', payrollRunId: run._id }
            );
        }

        await PayrollRun.findByIdAndUpdate(run._id, {
            totalPayableAmount: totals.totalPayableAmount,
            totalExpenseClaimsAmount: totals.totalExpenseClaimsAmount,
            erpPayableAmount: totals.erpPayableAmount,
        });
    }

    return {
        payslips,
        usedClaimIds,
        usedPfRequestIds,
        missingSalary,
        expenseClaimsIncluded,
        totals,
    };
}

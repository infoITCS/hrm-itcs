import mongoose from 'mongoose';
import PayrollRun, { IPayrollRun } from '../models/PayrollRun';
import Payslip from '../models/Payslip';
import Employee from '../models/Employee';
import Counter from '../models/Counter';
import EmployeeRequest from '../models/EmployeeRequest';
import AttendanceRecord from '../models/AttendanceRecord';
import LeaveRequest from '../models/LeaveRequest';
import Company from '../models/Company';
import ExpenseClaim from '../models/ExpenseClaim';
import { getHolidayDatesInPeriod } from '../utils/holidayUtils';
import { generateCustomerReference } from '../utils/encryption';
import { formatEmployeeFullName } from '../utils/nameHelper';
import { applyFirstPenaltyExemption, statusToPenaltyType, getWorkingDaysInMonth } from '../utils/attendancePenaltyPolicy';
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

/**
 * Calculates effective service start date, strictly starting from Probation
 * (excluding initial internship duration if the employee joined as an intern).
 */
export function getEffectiveServiceStartDate(emp: any): Date | null {
    const rawStatus = getEmploymentStatus(emp);
    const status = (rawStatus || '').trim().toLowerCase();

    // Active interns are not eligible for work anniversary bonus
    if (status === 'internship' || (emp.jobInfo?.designation || '').toLowerCase().includes('intern')) {
        return null;
    }

    // If employee transitioned through probation and has a probationEndDate recorded
    if (emp.employmentStatus?.probationEndDate) {
        const pEnd = new Date(emp.employmentStatus.probationEndDate);
        if (!isNaN(pEnd.getTime())) {
            const probationMonths = Number(emp.financeInfo?.probationMonths) || 3;
            // Safe month subtraction avoiding JS Date rollover (e.g. May 31 - 3 months -> Feb 31 -> March)
            const derivedProbationStart = new Date(pEnd.getFullYear(), pEnd.getMonth() - probationMonths, Math.min(pEnd.getDate(), 28));

            // If joiningDate was before probation started (e.g. initial internship period),
            // exclude the internship months by anchoring to the derived probation start date!
            if (emp.jobInfo?.joiningDate) {
                const jDate = new Date(emp.jobInfo.joiningDate);
                if (!isNaN(jDate.getTime()) && jDate < derivedProbationStart) {
                    return derivedProbationStart;
                }
            }
        }
    }

    if (emp.jobInfo?.joiningDate) {
        const jDate = new Date(emp.jobInfo.joiningDate);
        if (!isNaN(jDate.getTime())) return jDate;
    }

    return null;
}

/**
 * Work Anniversary Bonus Tiers:
 * - 1st Year: PKR 15,000
 * - 2nd Year: PKR 25,000
 * - 3rd Year onwards: PKR 50,000
 */
export function calculateAnniversaryBonus(yearsCompleted: number): number {
    if (yearsCompleted <= 0) return 0;
    if (yearsCompleted === 1) return 15000;
    if (yearsCompleted === 2) return 25000;
    if (yearsCompleted >= 3) return 50000;
    return 0;
}

/**
 * Safely extracts calendar year and 1-indexed month (1-12) from a Date or date string,
 * immune to UTC / local timezone boundary offsets.
 */
export function parseDateYearMonth(dateInput: any): { year: number; month: number } | null {
    if (!dateInput) return null;
    if (typeof dateInput === 'string') {
        const parts = dateInput.split('T')[0].split('-');
        if (parts.length >= 2) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
                return { year: y, month: m };
            }
        }
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    const iso = d.toISOString().slice(0, 10);
    const [y, m] = iso.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        return { year: y, month: m };
    }
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Calculates work anniversary eligibility and bonus for a specific payroll period.
 */
export function getEmployeeAnniversaryBonus(emp: any, periodYear: number, periodMonth: number): {
    isAnniversaryMonth: boolean;
    yearsCompleted: number;
    amount: number;
} {
    const rawStatus = getEmploymentStatus(emp);
    const status = (rawStatus || '').trim().toLowerCase();

    // Active interns are not eligible for work anniversary bonus
    if (status === 'internship' || (emp.jobInfo?.designation || '').toLowerCase().includes('intern')) {
        return { isAnniversaryMonth: false, yearsCompleted: 0, amount: 0 };
    }

    const joiningDate = emp.jobInfo?.joiningDate || getEffectiveServiceStartDate(emp);
    const parsed = parseDateYearMonth(joiningDate);
    if (!parsed) {
        return { isAnniversaryMonth: false, yearsCompleted: 0, amount: 0 };
    }

    if (parsed.month === periodMonth && periodYear > parsed.year) {
        const yearsCompleted = periodYear - parsed.year;
        const amount = calculateAnniversaryBonus(yearsCompleted);
        if (amount > 0) {
            return {
                isAnniversaryMonth: true,
                yearsCompleted,
                amount,
            };
        }
    }

    return { isAnniversaryMonth: false, yearsCompleted: 0, amount: 0 };
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
    let totalLoanDeductionsAmount = 0;
    let totalPfWithdrawalsAmount = 0;

    for (const ps of payslips) {
        totalPayableAmount += Number(ps.netPay) || 0;
        for (const e of ps.earnings || []) {
            if (isExpenseClaimPayrollEarning(e)) {
                totalExpenseClaimsAmount += Number(e.amount) || 0;
            }
        }
        if (ps.loanDeduction !== undefined && Number(ps.loanDeduction) > 0) {
            totalLoanDeductionsAmount += Number(ps.loanDeduction) || 0;
        } else {
            for (const d of ps.deductions || []) {
                if (d.component === 'Loan Deduction') {
                    totalLoanDeductionsAmount += Number(d.amount) || 0;
                }
            }
        }
        const pfPayout = Number(ps.pfPayout) || 0;
        if (pfPayout > 0) {
            totalPfWithdrawalsAmount += pfPayout;
        } else {
            for (const e of ps.earnings || []) {
                if (/pf withdrawal|provident fund withdrawal/i.test(e.component || '')) {
                    totalPfWithdrawalsAmount += Number(e.amount) || 0;
                }
            }
        }
    }

    return {
        totalPayableAmount,
        totalExpenseClaimsAmount,
        totalLoanDeductionsAmount,
        totalPfWithdrawalsAmount,
        erpPayableAmount: totalPayableAmount - totalExpenseClaimsAmount - totalPfWithdrawalsAmount + totalLoanDeductionsAmount,
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
    }).select('employeeId firstName middleName lastName salaryComponents bankDetails jobInfo employmentStatus financeInfo loans salaryHistory');

    if (!employees.length) {
        throw Object.assign(new Error('No active employees found to generate payslips.'), { status: 400 });
    }

    if (persist) {
        await Payslip.deleteMany({ payrollRunId: runId });
        await ExpenseClaim.updateMany(
            { payrollRunId: run._id, payoutStatus: 'Included in Payroll' },
            { payoutStatus: 'Unpaid', $unset: { payrollRunId: 1 } }
        );
        await EmployeeRequest.deleteMany({
            $or: [
                { payrollRunId: run._id },
                { employeeId: 'FINANCE-BATCH' },
            ],
        });
    }

    const defaultLastDay = new Date(run.periodYear, run.periodMonth, 0).getDate();
    const periodStart = run.startDate || `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;
    const periodEnd = run.endDate || `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-${String(defaultLastDay).padStart(2, '0')}`;

    // Standard working days (Mon-Fri) for the calendar salary month (e.g. September = 22)
    const monthlyWorkingDays = getWorkingDaysInMonth(run.periodYear, run.periodMonth);
    const todayStr = new Date().toISOString().slice(0, 10);

    // ─────────────────────────────────────────────────────────────────────────
    // Prior Period Gap Reconciliation (e.g. Leftover Oct 16–31 after early run)
    // ─────────────────────────────────────────────────────────────────────────
    const hasPriorGap = Boolean(run.includePriorPeriodAdjustment && run.priorPeriodGap?.startDate && run.priorPeriodGap?.endDate);
    const gapStart = hasPriorGap ? run.priorPeriodGap!.startDate : null;
    const gapEnd = hasPriorGap ? run.priorPeriodGap!.endDate : null;
    const gapPrevMonth = hasPriorGap ? (run.priorPeriodGap!.prevMonth || (run.periodMonth === 1 ? 12 : run.periodMonth - 1)) : 0;
    const gapPrevYear = hasPriorGap ? (run.priorPeriodGap!.prevYear || (run.periodMonth === 1 ? run.periodYear - 1 : run.periodYear)) : 0;
    const gapPrevMonthName = MONTH_NAMES[gapPrevMonth] || 'Prior Period';
    const gapWorkingDays = hasPriorGap ? getWorkingDaysInMonth(gapPrevYear, gapPrevMonth) : 22;

    // Helper to prevent double counting: if a date is within the reconciled prior period gap,
    // it will be processed exclusively under the prior period gap adjustment, not the main cycle.
    const isGapDate = (d: string) => Boolean(hasPriorGap && gapStart && gapEnd && d >= gapStart && d <= gapEnd);

    const mealRecords = await AttendanceRecord.find({
        date: { $gte: periodStart, $lte: periodEnd },
        status: 'Present',
        isWfh: { $ne: true },
        note: { $not: /wfh|work from home/i },
    }).select('employeeId date').lean() as any[];

    const mealDaysMap: Record<string, number> = {};
    for (const r of mealRecords) {
        if (isGapDate(r.date)) continue;
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

    // Fetch approved formal leaves in this period to protect employees from bogus attendance penalties on approved leave days
    const periodApprovedLeaves = await LeaveRequest.find({
        status: 'Approved',
        startDate: { $lte: new Date(`${periodEnd}T23:59:59.999Z`) },
        endDate: { $gte: new Date(`${periodStart}T00:00:00.000Z`) },
        appliedBy: { $ne: 'system' }
    }).select('employeeId startDate endDate duration').lean() as any[];

    const gapMealDaysMap: Record<string, number> = {};
    const gapPenaltiesMap: Record<string, { date: string; type: 'half' | 'full' }[]> = {};

    if (hasPriorGap && gapStart && gapEnd) {
        const gapMealRecords = await AttendanceRecord.find({
            date: { $gte: gapStart, $lte: gapEnd },
            status: 'Present',
            isWfh: { $ne: true },
            note: { $not: /wfh|work from home/i },
        }).select('employeeId').lean() as any[];

        for (const r of gapMealRecords) {
            gapMealDaysMap[r.employeeId] = (gapMealDaysMap[r.employeeId] ?? 0) + 1;
        }

        const gapHolidayDates = await getHolidayDatesInPeriod(gapStart, gapEnd);
        const gapApprovedLeaves = await LeaveRequest.find({
            status: 'Approved',
            startDate: { $lte: new Date(`${gapEnd}T23:59:59.999Z`) },
            endDate: { $gte: new Date(`${gapStart}T00:00:00.000Z`) },
            appliedBy: { $ne: 'system' }
        }).select('employeeId startDate endDate duration').lean() as any[];

        const gapRecords = await AttendanceRecord.find({
            date: { $gte: gapStart, $lte: gapEnd },
        }).select('employeeId status date').lean() as any[];

        for (const r of gapRecords) {
            if (r.date > todayStr || r.status === 'N/A') continue;
            if (gapHolidayDates.has(r.date)) continue;

            const hasFullDayLeave = gapApprovedLeaves.some(l => {
                if (l.employeeId !== r.employeeId) return false;
                const s = new Date(l.startDate).toISOString().slice(0, 10);
                const e = new Date(l.endDate).toISOString().slice(0, 10);
                return r.date >= s && r.date <= e && l.duration === 'Full Day';
            });
            if (hasFullDayLeave) continue;

            const penaltyType = statusToPenaltyType(r.status);
            if (!penaltyType) continue;

            if (!gapPenaltiesMap[r.employeeId]) gapPenaltiesMap[r.employeeId] = [];
            gapPenaltiesMap[r.employeeId].push({ date: r.date, type: penaltyType });
        }
    }

    const employeeAttendanceMap: Record<string, any> = {};
    const attendanceDeductionsMap: Record<string, { penalties: { date: string; type: 'half' | 'full' }[] }> = {};

    for (const r of periodRecords) {
        // Skip dates that are being reconciled under prior period gap adjustment (prevent double counting)
        if (isGapDate(r.date)) continue;
        // Never process attendance stats or penalties for future dates that have not arrived yet, or N/A records
        if (r.date > todayStr) continue;
        if (r.status === 'N/A') continue;

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
        else if (r.status === 'Half-Day' || r.status === 'Early Leave') employeeAttendanceMap[r.employeeId].halfDays++;
        else if (r.status === 'Half-Day Leave') employeeAttendanceMap[r.employeeId].leaveDays += 0.5;
        else if (r.status === 'Absent') employeeAttendanceMap[r.employeeId].absentDays++;
        else if (r.status === 'On Leave') employeeAttendanceMap[r.employeeId].leaveDays++;

        if (holidayDates.has(r.date)) continue;

        // Approved formal full-day leave shields employee from attendance penalties
        const hasFullDayLeave = periodApprovedLeaves.some(l => {
            if (l.employeeId !== r.employeeId) return false;
            const s = new Date(l.startDate).toISOString().slice(0, 10);
            const e = new Date(l.endDate).toISOString().slice(0, 10);
            return r.date >= s && r.date <= e && l.duration === 'Full Day';
        });
        if (hasFullDayLeave) continue;

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
        $and: [
            {
                $or: [
                    { category: { $regex: /pf|provident/i } },
                    { requestType: { $regex: /pf|provident/i } },
                ],
            },
            {
                $or: [{ payoutStatus: 'Unpaid' }, { payoutStatus: { $exists: false } }],
            },
        ],
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
    let nextBankSeq = 1;
    const prefix = `PS-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-`;

    if (persist) {
        const counterKey = `payslipNo_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}`;
        const counter = await Counter.findOneAndUpdate(
            { key: counterKey },
            { $inc: { seq: employees.length } },
            { upsert: true, new: true }
        );
        nextSeq = counter.seq - employees.length + 1;

        const bankCounter = await Counter.findOneAndUpdate(
            { key: 'bank_customer_ref_seq' },
            { $inc: { seq: employees.length } },
            { upsert: true, new: true }
        );
        nextBankSeq = bankCounter.seq - employees.length + 1;
    } else {
        const bankCounter = await Counter.findOne({ key: 'bank_customer_ref_seq' }).lean() as any;
        nextBankSeq = ((bankCounter?.seq || 0) + 1);
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

        const anniversaryBonus = getEmployeeAnniversaryBonus(emp, run.periodYear, run.periodMonth);
        let notes = '';
        if (anniversaryBonus.isAnniversaryMonth && anniversaryBonus.amount > 0) {
            const existingBonusIdx = earnings.findIndex((e: any) => e.component === 'Anniversary Bonus');
            if (existingBonusIdx >= 0) {
                earnings[existingBonusIdx].amount = anniversaryBonus.amount;
            } else {
                earnings.push({
                    component: 'Anniversary Bonus',
                    amount: anniversaryBonus.amount,
                    type: 'fixed',
                });
            }
            notes = `Work Anniversary Bonus: PKR ${anniversaryBonus.amount.toLocaleString()} (${anniversaryBonus.yearsCompleted} Year${anniversaryBonus.yearsCompleted > 1 ? 's' : ''} completed).`;
        }

        const empStatus = getEmploymentStatus(emp);
        const isPermanent = empStatus === 'Permanent';

        // Benefit Lockdown: Meal allowance stipend (PKR 500/day) is exclusively for Permanent employees
        const isEntitledToMeal = isPermanent && emp.financeInfo?.entitledForMealAllowance !== false;
        const mealDays = isEntitledToMeal ? (mealDaysMap[emp.employeeId] ?? 0) : 0;
        if (isEntitledToMeal && mealDays > 0) {
            earnings.push({
                component: 'Meal Allowance',
                amount: mealDays * MEAL_RATE,
                type: 'variable',
            });
        }

        // Prior Period Leftover Meal Allowance (e.g. October 16–31 presence credited in November)
        const gapMealDays = isEntitledToMeal ? (gapMealDaysMap[emp.employeeId] ?? 0) : 0;
        if (isEntitledToMeal && gapMealDays > 0) {
            earnings.push({
                component: `Meal Allowance (${gapPrevMonthName} Arrears: ${gapMealDays} days)`,
                amount: gapMealDays * MEAL_RATE,
                type: 'variable',
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // Retroactive Salary Arrears & PF Adjustment Calculation
        // ─────────────────────────────────────────────────────────────────────
        let totalArrearsAmount = 0;
        let retroactiveArrearsNote = '';
        const runMonthStart = new Date(Date.UTC(run.periodYear, run.periodMonth - 1, 1));

        if (Array.isArray(emp.salaryHistory) && emp.salaryHistory.length > 0) {
            for (const hist of emp.salaryHistory) {
                if (hist && !hist.arrearsProcessed && hist.effectiveDate) {
                    const effDate = new Date(hist.effectiveDate);
                    // Only process revisions whose effective date is prior to the current payroll month
                    if (effDate < runMonthStart) {
                        const newAmt = Number(hist.amount) || 0;
                        const prevAmt = Number(hist.previousAmount) || 0;
                        const diff = newAmt - prevAmt;

                        if (diff > 0) {
                            const effYear = effDate.getUTCFullYear();
                            const effMonth = effDate.getUTCMonth() + 1; // 1-12
                            const effDay = effDate.getUTCDate();

                            // Iterate each retroactive month from (effYear, effMonth) up to month before current run
                            let iterYear = effYear;
                            let iterMonth = effMonth;

                            while (
                                iterYear < run.periodYear || 
                                (iterYear === run.periodYear && iterMonth < run.periodMonth)
                            ) {
                                const daysInMonth = new Date(Date.UTC(iterYear, iterMonth, 0)).getUTCDate();
                                let monthArrears = diff;

                                // Prorate if revision started mid-month
                                if (iterYear === effYear && iterMonth === effMonth && effDay > 1) {
                                    const activeDays = daysInMonth - effDay + 1;
                                    monthArrears = Math.round((activeDays / daysInMonth) * diff);
                                }

                                if (monthArrears > 0) {
                                    totalArrearsAmount += monthArrears;
                                    const mName = MONTH_NAMES[iterMonth] || `Month ${iterMonth}`;
                                    earnings.push({
                                        component: `Salary Arrears (${mName} ${iterYear})`,
                                        amount: monthArrears,
                                        type: 'variable',
                                    });
                                }

                                iterMonth++;
                                if (iterMonth > 12) {
                                    iterMonth = 1;
                                    iterYear++;
                                }
                            }
                        }
                    }
                }
            }
        }

        const grossPay = earnings.reduce((sum: number, e: any) => sum + e.amount, 0);

        const deductions: any[] = [];
        let totalDeductions = 0;
        let attendancePenaltyNote = '';

        const isExemptFromPenalties = emp.financeInfo?.exemptFromAttendancePenalties === true;
        const attInfo = attendanceDeductionsMap[emp.employeeId];
        if (!isExemptFromPenalties && attInfo?.penalties?.length) {
            const basicComp = earnings.find((c) => (c.component || '').toLowerCase().includes('basic'));
            const basicSal = basicComp ? basicComp.amount : (earnings[0]?.amount || 0);
            const { halfDays, fullDays, exempted, billablePenalties, exemptedPenalty } = applyFirstPenaltyExemption(attInfo.penalties);
            if (exempted) {
                const exDateStr = exemptedPenalty?.date ? ` (${exemptedPenalty.date})` : '';
                attendancePenaltyNote = `First attendance penalty exempted this period${exDateStr}.`;
            }

            let halfDayAmount = 0;
            let absentAmount = 0;

            // Split penalty rates by the specific calendar month of each occurrence
            for (const p of billablePenalties) {
                const [pYearStr, pMonthStr] = (p.date || '').split('-');
                const pYear = parseInt(pYearStr, 10) || run.periodYear;
                const pMonth = parseInt(pMonthStr, 10) || run.periodMonth;
                const monthWorkingDays = getWorkingDaysInMonth(pYear, pMonth);
                const dailyRate = monthWorkingDays > 0 ? basicSal / monthWorkingDays : basicSal / 22;

                if (p.type === 'half') {
                    halfDayAmount += Math.round(0.5 * dailyRate);
                } else if (p.type === 'full') {
                    absentAmount += Math.round(1.0 * dailyRate);
                }
            }

            if (halfDays > 0 && halfDayAmount > 0) {
                const unitStr = halfDays === 1 ? 'half-day' : 'half-days';
                deductions.push({
                    component: `Half-Day Penalty (${halfDays} ${unitStr})`,
                    amount: halfDayAmount,
                });
                totalDeductions += halfDayAmount;
            }

            if (fullDays > 0 && absentAmount > 0) {
                const unitStr = fullDays === 1 ? 'day' : 'days';
                deductions.push({
                    component: `Absence Penalty (${fullDays} ${unitStr})`,
                    amount: absentAmount,
                });
                totalDeductions += absentAmount;
            }
        } else if (isExemptFromPenalties && attInfo?.penalties?.length) {
            attendancePenaltyNote = 'Attendance penalties waived (Exempt).';
        }

        // Prior Period Leftover Late / Absence Deductions (calculated with prior month working days)
        const gapPenalties = gapPenaltiesMap[emp.employeeId] || [];
        let priorAdjNote = '';
        if (!isExemptFromPenalties && gapPenalties.length > 0) {
            const basicComp = earnings.find((c) => (c.component || '').toLowerCase().includes('basic'));
            const basicSal = basicComp ? basicComp.amount : (earnings[0]?.amount || 0);
            const priorDailyRate = basicSal / gapWorkingDays;

            let gapHalfDays = 0;
            let gapFullDays = 0;
            let gapHalfDayTotal = 0;
            let gapFullDayTotal = 0;

            for (const p of gapPenalties) {
                if (p.type === 'half') {
                    gapHalfDays++;
                    gapHalfDayTotal += Math.round(0.5 * priorDailyRate);
                } else if (p.type === 'full') {
                    gapFullDays++;
                    gapFullDayTotal += Math.round(1.0 * priorDailyRate);
                }
            }

            if (gapHalfDays > 0 && gapHalfDayTotal > 0) {
                const unitStr = gapHalfDays === 1 ? 'half-day' : 'half-days';
                deductions.push({
                    component: `Half-Day Penalty (${gapPrevMonthName}: ${gapHalfDays} ${unitStr})`,
                    amount: gapHalfDayTotal,
                });
                totalDeductions += gapHalfDayTotal;
            }

            if (gapFullDays > 0 && gapFullDayTotal > 0) {
                const unitStr = gapFullDays === 1 ? 'day' : 'days';
                deductions.push({
                    component: `Absence Penalty (${gapPrevMonthName}: ${gapFullDays} ${unitStr})`,
                    amount: gapFullDayTotal,
                });
                totalDeductions += gapFullDayTotal;
            }

            priorAdjNote = `${gapPrevMonthName} attendance reconciliation applied (${gapStart} to ${gapEnd}).`;
        }

        let loanDeductAmount = 0;
        let loanPauseNote = '';
        let loanDeductionStatus: 'Deducted' | 'Skipped' | 'Paused' | 'None' = 'None';
        let loanDeductionSkipReason = '';
        const loanInfo = getLoanInfoForPayroll(emp.employeeId, emp, loanBalanceMap);
        if (loanInfo && loanInfo.balance > 0) {
            if (pausedEmployeesMap[emp.employeeId]) {
                loanDeductAmount = 0;
                loanDeductionStatus = 'Paused';
                loanDeductionSkipReason = `Loan deduction paused for ${MONTH_NAMES[run.periodMonth] || 'month'} ${run.periodYear} (Approved Request)`;
                loanPauseNote = loanDeductionSkipReason;
            } else {
                const amountToDeduct = Math.min(loanInfo.balance, loanInfo.monthlyDeduction);
                if (amountToDeduct > 0) {
                    loanDeductAmount = amountToDeduct;
                    loanDeductionStatus = 'Deducted';
                    deductions.push({
                        component: 'Loan Deduction',
                        amount: amountToDeduct,
                    });
                    totalDeductions += amountToDeduct;
                } else {
                    loanDeductionStatus = 'Skipped';
                    loanDeductionSkipReason = 'Zero monthly deduction calculated';
                }
            }
        }

        // Provident Fund calculation (Regular + Arrears Adjustment)
        let pfContributionAmount = 0;
        let pfArrearsAdjustment = 0;

        if (isPermanent) {
            const pfRate = (companyDoc?.payrollSettings?.pfContributionRate ?? 15) / 100;
            const basicComp = earnings.find((c) => (c.component || '').toLowerCase().includes('basic'));
            const baseAmount = basicComp ? basicComp.amount : (Number(emp.financeInfo?.confirmedSalary) || 0);

            const regularPf = Math.round(baseAmount * pfRate);
            pfArrearsAdjustment = Math.round(totalArrearsAmount * pfRate);
            pfContributionAmount = regularPf + pfArrearsAdjustment;

            if (totalArrearsAmount > 0) {
                retroactiveArrearsNote = `Salary Arrears of PKR ${totalArrearsAmount.toLocaleString()} added. PF contribution includes PKR ${pfArrearsAdjustment.toLocaleString()} arrears adjustment (Total PF: PKR ${pfContributionAmount.toLocaleString()}).`;
            }
        } else if (totalArrearsAmount > 0) {
            retroactiveArrearsNote = `Salary Arrears of PKR ${totalArrearsAmount.toLocaleString()} added.`;
        }

        const netPay = grossPay - totalDeductions;
        const payslipNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
        nextSeq++;

        const customerReference = generateCustomerReference(run.periodYear, run.periodMonth, nextBankSeq++);
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

        const payslipNotes = [notes, loanPauseNote, attendancePenaltyNote, priorAdjNote, retroactiveArrearsNote].filter(Boolean).join(' • ');

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
            loanDeductionStatus,
            loanDeductionSkipReason: loanDeductionSkipReason || undefined,
            pfPayout: pfPayoutAmount,
            pfContribution: pfContributionAmount,
            pfArrearsAdjustment: pfArrearsAdjustment,
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
            totalLoanDeductionsAmount: totals.totalLoanDeductionsAmount,
            totalPfWithdrawalsAmount: totals.totalPfWithdrawalsAmount,
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

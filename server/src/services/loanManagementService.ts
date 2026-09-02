import Employee from '../models/Employee';
import EmployeeRequest from '../models/EmployeeRequest';
import Payslip from '../models/Payslip';
import PayrollRun from '../models/PayrollRun';
import { formatEmployeeFullName } from '../utils/nameHelper';

export interface EmployeeLoanSummary {
    employeeId: string;
    firstName: string;
    lastName: string;
    designation?: string;
    department?: string;
    totalDisbursed: number;
    remainingBalance: number;
    monthlyInstallment: number;
    status: 'Active' | 'Paid' | 'Suspended' | 'None';
    source: 'employee_record' | 'computed';
    loanId?: string;
}

export async function buildComputedLoanMap() {
    const allApprovedLoans = await EmployeeRequest.find({
        status: { $in: ['Approved', 'Completed'] },
        $or: [
            { category: { $in: ['Loan', 'Request Loan'] } },
            { requestType: { $in: ['Loan', 'Request Loan'] } },
            { category: { $regex: /loan/i } }
        ],
    }).lean();

    const allFinalizedPayslips = await Payslip.find({ status: 'Finalized' }).lean();

    const map: Record<string, { balance: number; monthlyDeduction: number; totalDisbursed: number }> = {};

    for (const loan of allApprovedLoans) {
        const cat = (loan.category || '').toLowerCase();
        const reqType = (loan.requestType || '').toLowerCase();
        // Exclude temporary pause requests
        if (cat.includes('pause') || reqType.includes('pause')) continue;

        const empId = loan.employeeId;
        if (!map[empId]) {
            map[empId] = { balance: 0, monthlyDeduction: 0, totalDisbursed: 0 };
        }
        const amt = Number((loan as any).details?.requestedAmount || 0);
        map[empId].balance += amt;
        map[empId].totalDisbursed += amt;
        map[empId].monthlyDeduction += Number((loan as any).details?.recommendedMonthlyDeduction || 0);
    }

    for (const slip of allFinalizedPayslips) {
        const empId = slip.employeeId;
        if (!map[empId]) continue;
        const loanDeds = (slip.deductions || []).filter((d: any) => d.component === 'Loan Deduction');
        for (const d of loanDeds) {
            map[empId].balance -= Number(d.amount || 0);
        }
    }

    for (const empId of Object.keys(map)) {
        map[empId].balance = Math.max(0, map[empId].balance);
    }

    return map;
}

export function loanInfoFromEmployeeRecord(emp: any): { balance: number; monthlyDeduction: number; totalDisbursed: number; status: EmployeeLoanSummary['status']; loanId?: string } | null {
    if (!emp.loans || emp.loans.length === 0) return null;

    const activeLoans = (emp.loans || []).filter((l: any) => l.status === 'Active' && Number(l.remainingAmount) > 0);
    const totalDisbursed = (emp.loans || []).reduce((s: number, l: any) => s + Number(l.totalAmount || l.remainingAmount || 0), 0);
    const totalRemaining = activeLoans.reduce((s: number, l: any) => s + Number(l.remainingAmount || 0), 0);
    const monthlyDeduction = activeLoans.reduce((s: number, l: any) => s + Number(l.monthlyInstallment || 0), 0);

    return {
        balance: totalRemaining,
        monthlyDeduction,
        totalDisbursed: Math.max(totalDisbursed, totalRemaining),
        status: totalRemaining > 0 ? 'Active' : (totalDisbursed > 0 ? 'Paid' : 'None'),
        loanId: activeLoans[0]?.loanId || emp.loans[0]?.loanId,
    };
}

export async function buildAllEmployeeLoanSummaries(options: { activeOnly?: boolean } = {}): Promise<EmployeeLoanSummary[]> {
    const computedMap = await buildComputedLoanMap();
    const employees = await Employee.find({
        'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] },
    })
        .select('employeeId firstName lastName jobInfo loans')
        .lean();

    const summaries: EmployeeLoanSummary[] = [];

    for (const emp of employees) {
        const fromRecord = loanInfoFromEmployeeRecord(emp);
        const computed = computedMap[emp.employeeId];

        let remainingBalance = 0;
        let monthlyInstallment = 0;
        let totalDisbursed = 0;
        let status: EmployeeLoanSummary['status'] = 'None';
        let source: EmployeeLoanSummary['source'] = 'computed';
        let loanId: string | undefined;

        if (fromRecord) {
            // Explicit record in employee.loans is the source of truth
            remainingBalance = fromRecord.balance;
            monthlyInstallment = fromRecord.monthlyDeduction;
            totalDisbursed = fromRecord.totalDisbursed;
            status = fromRecord.status;
            source = 'employee_record';
            loanId = fromRecord.loanId;
        } else if (computed && computed.balance > 0) {
            remainingBalance = computed.balance;
            monthlyInstallment = computed.monthlyDeduction;
            totalDisbursed = computed.totalDisbursed;
            status = 'Active';
            source = 'computed';
        } else if (computed && computed.totalDisbursed > 0 && computed.balance <= 0) {
            remainingBalance = 0;
            monthlyInstallment = computed.monthlyDeduction;
            totalDisbursed = computed.totalDisbursed;
            status = 'Paid';
            source = 'computed';
        } else {
            continue;
        }

        if (options.activeOnly && status !== 'Active') continue;

        summaries.push({
            employeeId: emp.employeeId,
            firstName: emp.firstName,
            lastName: emp.lastName,
            designation: emp.jobInfo?.designation,
            department: emp.jobInfo?.department,
            totalDisbursed,
            remainingBalance,
            monthlyInstallment,
            status,
            source,
            loanId,
        });
    }

    summaries.sort((a, b) => {
        const nameA = formatEmployeeFullName(a, a.employeeId).toLowerCase();
        const nameB = formatEmployeeFullName(b, b.employeeId).toLowerCase();
        return nameA.localeCompare(nameB);
    });

    return summaries;
}

export async function updateEmployeeLoan(
    employeeId: string,
    payload: { remainingBalance: number; monthlyInstallment: number },
    updatedBy: string
) {
    const employee = await Employee.findOne({ employeeId });
    if (!employee) {
        throw Object.assign(new Error('Employee not found.'), { status: 404 });
    }

    const remainingBalance = Math.max(0, Number(payload.remainingBalance) || 0);
    const monthlyInstallment = Math.max(0, Number(payload.monthlyInstallment) || 0);

    if (!employee.loans) {
        (employee as any).loans = [];
    }

    if (remainingBalance === 0) {
        // Mark all active loans as Paid and zero out remaining amounts
        for (const l of employee.loans!) {
            l.remainingAmount = 0;
            l.monthlyInstallment = 0;
            l.status = 'Paid';
            l.notes = `Marked paid / zeroed by admin (${updatedBy}) on ${new Date().toISOString().slice(0, 10)}`;
        }
        if (employee.loans!.length === 0) {
            employee.loans!.push({
                loanId: `LOAN-${employeeId}-${Date.now()}`,
                totalAmount: 0,
                monthlyInstallment: 0,
                remainingAmount: 0,
                status: 'Paid',
                issueDate: new Date(),
                notes: `Zeroed by admin (${updatedBy})`,
            } as any);
        }
    } else {
        const activeLoans = employee.loans!.filter((l: { status?: string }) => l.status === 'Active');
        if (activeLoans.length === 0) {
            const newLoan = {
                loanId: `LOAN-${employeeId}-${Date.now()}`,
                totalAmount: remainingBalance,
                monthlyInstallment,
                remainingAmount: remainingBalance,
                status: 'Active',
                issueDate: new Date(),
                notes: `Updated by admin (${updatedBy})`,
            } as any;
            employee.loans!.push(newLoan);
        } else if (activeLoans.length === 1) {
            activeLoans[0].remainingAmount = remainingBalance;
            activeLoans[0].monthlyInstallment = monthlyInstallment;
            activeLoans[0].status = 'Active';
            if (!activeLoans[0].totalAmount || activeLoans[0].totalAmount < remainingBalance) {
                activeLoans[0].totalAmount = remainingBalance;
            }
        } else {
            // Update across multiple active loans
            let bal = remainingBalance;
            for (let i = 0; i < activeLoans.length; i++) {
                const l = activeLoans[i];
                if (i === activeLoans.length - 1) {
                    l.remainingAmount = bal;
                    l.status = bal > 0 ? 'Active' : 'Paid';
                } else {
                    const amt = Math.min(l.remainingAmount || l.totalAmount || 0, bal);
                    l.remainingAmount = amt;
                    l.status = amt > 0 ? 'Active' : 'Paid';
                    bal -= amt;
                }
            }
            activeLoans[activeLoans.length - 1].monthlyInstallment = monthlyInstallment;
        }
    }

    await employee.save();

    // If zeroed out, also mark any pending/approved EmployeeRequest loan items as Completed
    if (remainingBalance === 0) {
        await EmployeeRequest.updateMany(
            {
                employeeId,
                status: { $in: ['Approved', 'Completed'] },
                $or: [
                    { category: { $in: ['Loan', 'Request Loan'] } },
                    { requestType: { $in: ['Loan', 'Request Loan'] } },
                    { category: { $regex: /loan/i } }
                ]
            },
            {
                $set: {
                    status: 'Completed',
                    'details.remainingAmount': 0,
                    'details.recommendedMonthlyDeduction': 0
                }
            }
        );
    }

    return buildAllEmployeeLoanSummaries().then((all) => all.find((s) => s.employeeId === employeeId));
}

export interface IndividualLoanItem {
    loanId: string;
    totalAmount: number;
    remainingAmount: number;
    monthlyInstallment: number;
    status: 'Active' | 'Paid' | 'Cancelled';
    issueDate?: Date | string;
    category?: string;
    notes?: string;
    paybackDuration?: number;
}

export interface LoanRepaymentItem {
    payslipId: string;
    payslipNo?: string;
    periodMonth: number;
    periodYear: number;
    amount: number;
    date: Date | string;
    erpReferenceId?: string;
}

export interface EmployeeLoanDetailResult {
    employeeId: string;
    firstName: string;
    lastName: string;
    designation?: string;
    department?: string;
    summary: {
        totalDisbursed: number;
        remainingBalance: number;
        monthlyInstallment: number;
        status: EmployeeLoanSummary['status'];
    };
    loans: IndividualLoanItem[];
    repayments: LoanRepaymentItem[];
}

export async function getEmployeeLoanDetails(employeeId: string): Promise<EmployeeLoanDetailResult> {
    const employee = (await Employee.findOne({ employeeId }).lean()) as any;
    if (!employee) {
        throw Object.assign(new Error('Employee not found.'), { status: 404 });
    }

    const loanRequests = await EmployeeRequest.find({
        employeeId,
        status: { $in: ['Approved', 'Completed'] },
        $or: [
            { category: { $in: ['Loan', 'Request Loan'] } },
            { requestType: { $in: ['Loan', 'Request Loan'] } },
            { category: { $regex: /loan/i } }
        ],
    }).sort({ requestedAt: 1 }).lean();

    const payslips = await Payslip.find({
        employeeId,
        status: 'Finalized',
    }).sort({ periodYear: 1, periodMonth: 1 }).lean();

    const payrollRuns = await PayrollRun.find({
        status: { $in: ['Approved', 'Disbursed', 'Finalized', 'Draft'] }
    }).select('periodMonth periodYear loanDeductionErpId erpReferenceId').lean();

    const runErpMap: Record<string, string> = {};
    for (const r of payrollRuns as any[]) {
        const key = `${r.periodYear}-${r.periodMonth}`;
        runErpMap[key] = r.loanDeductionErpId || r.erpReferenceId || '';
    }

    const repayments: LoanRepaymentItem[] = [];
    for (const ps of payslips) {
        const loanDeds = (ps.deductions || []).filter((d: any) => d.component === 'Loan Deduction' && Number(d.amount) > 0);
        for (const d of loanDeds) {
            const key = `${ps.periodYear}-${ps.periodMonth}`;
            repayments.push({
                payslipId: String((ps as any)._id || ''),
                payslipNo: ps.payslipNo || '',
                periodMonth: ps.periodMonth,
                periodYear: ps.periodYear,
                amount: Number(d.amount),
                date: (ps as any).finalizedAt || ps.createdAt,
                erpReferenceId: runErpMap[key] || undefined,
            });
        }
    }

    const existingRecordLoans: IndividualLoanItem[] = ((employee as any).loans || []).map((l: any) => ({
        loanId: l.loanId || `LOAN-${employeeId}`,
        totalAmount: Number(l.totalAmount || l.remainingAmount || 0),
        remainingAmount: Number(l.remainingAmount || 0),
        monthlyInstallment: Number(l.monthlyInstallment || 0),
        status: (l.status || (Number(l.remainingAmount) > 0 ? 'Active' : 'Paid')) as any,
        issueDate: l.issueDate,
        notes: l.notes || '',
        category: 'Loan',
    }));

    const loans: IndividualLoanItem[] = [...existingRecordLoans];

    // Add approved EmployeeRequest loans that are not already present in employee.loans
    for (const req of loanRequests) {
        const cat = (req.category || '').toLowerCase();
        const reqType = (req.requestType || '').toLowerCase();
        if (cat.includes('pause') || reqType.includes('pause')) continue;

        const reqIdStr = req._id.toString();
        const alreadyInRecord = loans.some(l => l.loanId.includes(reqIdStr) || (l.notes && l.notes.includes(reqIdStr)));
        if (!alreadyInRecord) {
            const reqAmt = Number((req as any).details?.requestedAmount || 0);
            const duration = Number((req as any).details?.paybackDuration) || 12;
            const monthlyCut = Number((req as any).details?.recommendedMonthlyDeduction || 0) || Math.ceil(reqAmt / duration);

            loans.push({
                loanId: `LOAN-REQ-${reqIdStr}`,
                totalAmount: reqAmt,
                remainingAmount: reqAmt,
                monthlyInstallment: monthlyCut,
                status: 'Active',
                issueDate: (req as any).requestedAt || (req as any).createdAt,
                category: req.requestType || req.category,
                notes: (req as any).reason || (req as any).adminComments || `Approved Request ${reqIdStr}`,
                paybackDuration: duration,
            });
        }
    }

    // Apply finalized repayments to adjust remaining amounts if loans were loaded without previous record deduction
    if (existingRecordLoans.length === 0 && repayments.length > 0) {
        let totalPaid = repayments.reduce((s, r) => s + r.amount, 0);
        for (const l of loans) {
            if (totalPaid <= 0) break;
            const deduct = Math.min(l.remainingAmount, totalPaid);
            l.remainingAmount = Math.max(0, l.remainingAmount - deduct);
            totalPaid -= deduct;
            if (l.remainingAmount <= 0) {
                l.status = 'Paid';
            }
        }
    }

    const totalDisbursed = loans.reduce((s, l) => s + Number(l.totalAmount || 0), 0);
    const remainingBalance = loans.reduce((s, l) => s + Number(l.remainingAmount || 0), 0);
    const activeMonthlyInstallment = loans.filter(l => l.status === 'Active').reduce((s, l) => s + Number(l.monthlyInstallment || 0), 0);

    return {
        employeeId: employee.employeeId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        designation: (employee as any).jobInfo?.designation,
        department: (employee as any).jobInfo?.department,
        summary: {
            totalDisbursed,
            remainingBalance,
            monthlyInstallment: activeMonthlyInstallment,
            status: remainingBalance > 0 ? 'Active' : (totalDisbursed > 0 ? 'Paid' : 'None'),
        },
        loans,
        repayments: repayments.reverse(), // most recent repayments first
    };
}

export function getLoanInfoForPayroll(
    employeeId: string,
    emp: any,
    computedMap: Record<string, { balance: number; monthlyDeduction: number; totalDisbursed?: number }>
) {
    const fromRecord = loanInfoFromEmployeeRecord(emp);
    const computed = computedMap[employeeId];

    if (fromRecord) {
        return {
            balance: Math.max(0, fromRecord.balance),
            monthlyDeduction: Math.max(0, fromRecord.monthlyDeduction),
        };
    }
    if (computed && computed.balance > 0) {
        return { balance: computed.balance, monthlyDeduction: computed.monthlyDeduction };
    }
    return { balance: 0, monthlyDeduction: 0 };
}

export interface MonthlyLoanDeductionItem {
    employeeId: string;
    firstName: string;
    lastName: string;
    department?: string;
    designation?: string;
    payslipId: string;
    payslipNo?: string;
    amountDeducted: number;
    currentLoanBalance: number;
    deductionDate: Date | string;
    repaymentStatus: 'Deducted' | 'Completed' | 'Pending';
}

export interface MonthlyLoanLedgerResult {
    periodMonth: number;
    periodYear: number;
    payrollRunId?: string;
    payrollTitle?: string;
    payrollStatus?: string;
    totalDeducted: number;
    borrowerCount: number;
    loanDeductionErpId?: string;
    loanDeductionErpStatus: 'Pending' | 'Posted' | 'Reconciled';
    loanDeductionErpNotes?: string;
    loanDeductionErpPostedAt?: Date | string;
    items: MonthlyLoanDeductionItem[];
}

export async function getMonthlyLoanDeductionsLedger(
    periodMonth: number,
    periodYear: number
): Promise<MonthlyLoanLedgerResult> {
    const month = Number(periodMonth);
    const year = Number(periodYear);

    const run = await PayrollRun.findOne({ periodMonth: month, periodYear: year }).lean() as any;

    const payslips = await Payslip.find({
        periodMonth: month,
        periodYear: year,
    }).lean() as any[];

    const empIds = [...new Set(payslips.map(p => p.employeeId))];
    const employees = await Employee.find({ employeeId: { $in: empIds } })
        .select('employeeId firstName lastName jobInfo loans')
        .lean() as any[];

    const empMap = employees.reduce((acc: any, e: any) => {
        acc[e.employeeId] = e;
        return acc;
    }, {});

    const computedLoanMap = await buildComputedLoanMap();

    const items: MonthlyLoanDeductionItem[] = [];
    let totalDeducted = 0;

    for (const ps of payslips) {
        const loanDeds = (ps.deductions || []).filter((d: any) => d.component === 'Loan Deduction' && Number(d.amount) > 0);
        const dedAmount = loanDeds.reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
        
        if (dedAmount > 0) {
            totalDeducted += dedAmount;
            const emp = empMap[ps.employeeId];
            const loanInfo = getLoanInfoForPayroll(ps.employeeId, emp || {}, computedLoanMap);

            items.push({
                employeeId: ps.employeeId,
                firstName: emp?.firstName || ps.employeeName?.split(' ')[0] || 'Employee',
                lastName: emp?.lastName || ps.employeeName?.split(' ').slice(1).join(' ') || '',
                department: emp?.jobInfo?.department || ps.department || '—',
                designation: emp?.jobInfo?.designation || ps.designation || '—',
                payslipId: String(ps._id || ''),
                payslipNo: ps.payslipNo || '',
                amountDeducted: dedAmount,
                currentLoanBalance: loanInfo.balance,
                deductionDate: ps.finalizedAt || ps.createdAt || new Date(),
                repaymentStatus: 'Deducted',
            });
        }
    }

    // Sort by employee name
    items.sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.trim().toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
    });

    return {
        periodMonth: month,
        periodYear: year,
        payrollRunId: run ? String(run._id) : undefined,
        payrollTitle: run?.title,
        payrollStatus: run?.status || (payslips.length > 0 ? 'Payslips Generated' : 'No Run Created'),
        totalDeducted,
        borrowerCount: items.length,
        loanDeductionErpId: run?.loanDeductionErpId || '',
        loanDeductionErpStatus: run?.loanDeductionErpStatus || (run?.loanDeductionErpId ? 'Posted' : 'Pending'),
        loanDeductionErpNotes: run?.loanDeductionErpNotes || '',
        loanDeductionErpPostedAt: run?.loanDeductionErpPostedAt,
        items,
    };
}

export async function updateMonthlyLoanDeductionErpId(
    periodMonth: number,
    periodYear: number,
    erpReferenceId: string,
    notes?: string,
    updatedBy?: string
) {
    const month = Number(periodMonth);
    const year = Number(periodYear);

    let run = await PayrollRun.findOne({ periodMonth: month, periodYear: year });
    const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (!run) {
        run = new PayrollRun({
            title: `${MONTH_NAMES[month] || month} ${year} Payroll`,
            periodMonth: month,
            periodYear: year,
            currency: 'PKR',
            status: 'Draft',
            createdBy: updatedBy || 'System',
        });
    }

    const cleanId = String(erpReferenceId || '').trim();
    run.loanDeductionErpId = cleanId;
    run.loanDeductionErpStatus = cleanId ? 'Posted' : 'Pending';
    run.loanDeductionErpPostedAt = cleanId ? new Date() : undefined;
    if (notes !== undefined) run.loanDeductionErpNotes = notes.trim();

    await run.save();
    return run;
}

/**
 * Completely clear and remove all active and historical loans for an employee
 */
export async function removeEmployeeLoans(employeeId: string) {
    // 1. Clear loans on Employee model
    const emp = await Employee.findOne({ employeeId });
    if (emp) {
        emp.loans = [];
        await emp.save();
    }

    // 2. Cancel any pending or approved loan requests for this employee
    await EmployeeRequest.updateMany(
        {
            employeeId,
            $or: [
                { category: { $in: ['Loan', 'Request Loan'] } },
                { requestType: { $in: ['Loan', 'Request Loan'] } },
                { category: { $regex: /loan/i } }
            ]
        },
        {
            $set: {
                status: 'Cancelled',
                payoutStatus: 'Unpaid',
                updatedAt: new Date()
            }
        }
    );

    return { success: true, message: `Loans cleared for employee ${employeeId}` };
}

/**
 * Remove Shahzaib's loan from the system
 */
export async function cleanupShahzaibLoans() {
    try {
        const shahzaibEmployees = await Employee.find({
            $or: [
                { firstName: { $regex: /shahzaib/i } },
                { lastName: { $regex: /shahzaib/i } }
            ]
        });

        for (const emp of shahzaibEmployees) {
            await removeEmployeeLoans(emp.employeeId);
        }

        if (shahzaibEmployees.length > 0) {
            console.log(`[Loan Cleanup] Successfully cleared loans for ${shahzaibEmployees.length} Shahzaib record(s).`);
        }
    } catch (err: any) {
        console.error('[Loan Cleanup Error]:', err.message);
    }
}

// Auto-run cleanup on service initialize
cleanupShahzaibLoans();


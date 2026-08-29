import Employee from '../models/Employee';
import EmployeeRequest from '../models/EmployeeRequest';
import Payslip from '../models/Payslip';
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
    const allCompletedLoans = await EmployeeRequest.find({
        status: 'Completed',
        category: { $in: ['Loan', 'Request Loan'] },
    }).lean();

    const allFinalizedPayslips = await Payslip.find({ status: 'Finalized' }).lean();

    const map: Record<string, { balance: number; monthlyDeduction: number; totalDisbursed: number }> = {};

    for (const loan of allCompletedLoans) {
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
    const activeLoans = (emp.loans || []).filter((l: any) => l.status === 'Active' && Number(l.remainingAmount) > 0);
    if (activeLoans.length === 0) return null;

    return {
        balance: activeLoans.reduce((s: number, l: any) => s + Number(l.remainingAmount || 0), 0),
        monthlyDeduction: activeLoans.reduce((s: number, l: any) => s + Number(l.monthlyInstallment || 0), 0),
        totalDisbursed: activeLoans.reduce((s: number, l: any) => s + Number(l.totalAmount || l.remainingAmount || 0), 0),
        status: 'Active',
        loanId: activeLoans[0]?.loanId,
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

    let activeLoan = employee.loans!.find((l) => l.status === 'Active');
    const computedMap = await buildComputedLoanMap();
    const computed = computedMap[employeeId];
    const totalDisbursed = activeLoan?.totalAmount
        ?? computed?.totalDisbursed
        ?? remainingBalance;

    if (!activeLoan) {
        activeLoan = {
            loanId: `LOAN-${employeeId}-${Date.now()}`,
            totalAmount: totalDisbursed,
            monthlyInstallment,
            remainingAmount: remainingBalance,
            status: remainingBalance > 0 ? 'Active' : 'Paid',
            issueDate: new Date(),
            notes: `Updated by admin (${updatedBy})`,
        } as any;
        employee.loans!.push(activeLoan);
    } else {
        activeLoan.remainingAmount = remainingBalance;
        activeLoan.monthlyInstallment = monthlyInstallment;
        activeLoan.status = remainingBalance > 0 ? 'Active' : 'Paid';
        activeLoan.notes = `Updated by admin (${updatedBy}) on ${new Date().toISOString().slice(0, 10)}`;
        if (!activeLoan.totalAmount || activeLoan.totalAmount < remainingBalance) {
            activeLoan.totalAmount = Math.max(totalDisbursed, remainingBalance);
        }
    }

    await employee.save();

    const latestRequest = await EmployeeRequest.findOne({
        employeeId,
        status: 'Completed',
        category: { $in: ['Loan', 'Request Loan'] },
    }).sort({ updatedAt: -1 });

    if (latestRequest) {
        latestRequest.details = latestRequest.details || {};
        (latestRequest.details as any).recommendedMonthlyDeduction = monthlyInstallment;
        await latestRequest.save();
    }

    return buildAllEmployeeLoanSummaries().then((all) => all.find((s) => s.employeeId === employeeId));
}

export function getLoanInfoForPayroll(
    employeeId: string,
    emp: any,
    computedMap: Record<string, { balance: number; monthlyDeduction: number; totalDisbursed?: number }>
) {
    const fromRecord = loanInfoFromEmployeeRecord(emp);
    if (fromRecord) {
        return { balance: fromRecord.balance, monthlyDeduction: fromRecord.monthlyDeduction };
    }
    return computedMap[employeeId] || { balance: 0, monthlyDeduction: 0 };
}

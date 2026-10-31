import assert from 'assert';
import { computeSingleEmployeeLoanSummaryFromPreloadedData } from '../services/loanManagementService';

console.log('🧪 Starting Loan Dashboard vs Modal Consistency Self-Check...');

const mockEmployee = {
    employeeId: 'itcs-044',
    firstName: 'Zulqarnain',
    lastName: 'Hafeez',
    jobInfo: { department: 'Software Development', designation: 'Developer' },
    loans: [
        {
            loanId: 'LOAN-1',
            totalAmount: 30000,
            remainingAmount: 30000,
            monthlyInstallment: 10000,
            status: 'Active',
            issueDate: new Date('2026-08-29')
        },
        {
            loanId: 'LOAN-2',
            totalAmount: 20000,
            remainingAmount: 20000,
            monthlyInstallment: 0,
            status: 'Active',
            issueDate: new Date('2026-09-02')
        },
        {
            loanId: 'LOAN-3',
            totalAmount: 23000,
            remainingAmount: 23000,
            monthlyInstallment: 0,
            status: 'Active',
            issueDate: new Date('2026-09-10')
        }
    ]
};

const mockPayslips = [
    {
        deductions: [{ component: 'Loan Deduction', amount: 10000 }]
    },
    {
        deductions: [{ component: 'Loan Deduction', amount: 10000 }]
    }
];

const mockManualRepayments = [
    {
        amount: 23000,
        repaymentDate: new Date('2026-09-15')
    }
];

// Calculation with manual repayments (both modal and now dashboard)
const summaryWithManual = computeSingleEmployeeLoanSummaryFromPreloadedData(
    mockEmployee,
    [],
    mockPayslips as any,
    mockManualRepayments as any
);

assert.strictEqual(summaryWithManual.totalDisbursed, 73000, 'Total disbursed should be 73,000');
assert.strictEqual(summaryWithManual.remainingBalance, 30000, 'Remaining balance with manual repayment must be 30,000');
console.log('✅ Test 1 Passed: Correct remaining balance (30,000) computed with manual repayment included');

// Calculation without manual repayments (what dashboard was doing before the fix)
const summaryWithoutManual = computeSingleEmployeeLoanSummaryFromPreloadedData(
    mockEmployee,
    [],
    mockPayslips as any,
    []
);

assert.strictEqual(summaryWithoutManual.remainingBalance, 53000, 'Without manual repayments balance is higher');
console.log('✅ Test 2 Passed: Verified that passing manual repayments is required for accurate balance');

console.log('🎉 All Loan Consistency checks passed successfully!');


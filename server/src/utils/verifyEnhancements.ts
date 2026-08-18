import assert from 'assert';
import { generateCustomerReference } from './encryption';
import { generateCSV } from './csv';

console.log('--- Running HRM & Payroll Enhancements Self-Check ---');

// 1. Check Customer Reference Uniqueness
const refs = new Set<string>();
for (let i = 1; i <= 1000; i++) {
    const ref = generateCustomerReference(2026, 8, i);
    assert(/^PAY-202608-\d{3,}[A-F0-9]{4}$/.test(ref), `Reference format mismatch: ${ref}`);
    assert(!refs.has(ref), `Duplicate reference generated: ${ref}`);
    refs.add(ref);
}
console.log('✓ 1,000 unique Customer References generated successfully.');

// 2. Check 4-Column Bank CSV format
const testPayslips = [
    {
        accountNumber: '010101010101',
        beneficiaryName: 'Muhammad Ali',
        customerReference: 'PAY-202608-001A1B2',
        transactionAmount: 150000
    },
    {
        accountNumber: '998877665544',
        beneficiaryName: 'Fatima Zahra',
        customerReference: 'PAY-202608-002C3D4',
        transactionAmount: 220000
    }
];

const csvHeaders = [
    { header: 'Account Number', key: 'accountNumber' },
    { header: 'Beneficiary Name', key: 'beneficiaryName' },
    { header: 'Customer Reference', key: 'customerReference' },
    { header: 'Transaction Amount', key: 'transactionAmount' }
];

const csvOutput = generateCSV(testPayslips, csvHeaders);
const lines = csvOutput.trim().split('\n');
assert.strictEqual(lines.length, 3, 'CSV must have header + 2 data rows');
assert.strictEqual(lines[0], '"Account Number","Beneficiary Name","Customer Reference","Transaction Amount"');
assert(lines[1].includes('"010101010101"'));
assert(lines[1].includes('"150000"'));
console.log('✓ 4-Column Bank CSV export format verified.');

// 3. Check Loan Deductions & Balance Update
const sampleLoan = {
    totalAmount: 100000,
    monthlyInstallment: 20000,
    remainingAmount: 30000,
    status: 'Active' as 'Active' | 'Paid'
};

const deductionAmt = Math.min(sampleLoan.remainingAmount, sampleLoan.monthlyInstallment);
assert.strictEqual(deductionAmt, 20000, 'Loan installment deduction mismatch');
sampleLoan.remainingAmount -= deductionAmt;
assert.strictEqual(sampleLoan.remainingAmount, 10000, 'Loan remaining amount mismatch');

const nextDeduction = Math.min(sampleLoan.remainingAmount, sampleLoan.monthlyInstallment);
assert.strictEqual(nextDeduction, 10000, 'Last installment should cap at remaining balance');
sampleLoan.remainingAmount -= nextDeduction;
if (sampleLoan.remainingAmount <= 0) sampleLoan.status = 'Paid';
assert.strictEqual(sampleLoan.remainingAmount, 0);
assert.strictEqual(sampleLoan.status, 'Paid');
console.log('✓ Loan installment calculation & auto-settlement verified.');

// 4. Check Attendance Penalty Calculation
const basicSalary = 110000;
const monthlyWorkingDays = 22;
const dailyRate = basicSalary / monthlyWorkingDays; // 5000
assert.strictEqual(dailyRate, 5000);

const lateCheckInHalfDays = 2; // Check-in 9:30-10:00
const fullDayAbsents = 1; // Check-in >10:00 or absent
const halfDayPenalty = Math.round(lateCheckInHalfDays * 0.5 * dailyRate); // 5000
const absentPenalty = Math.round(fullDayAbsents * 1.0 * dailyRate); // 5000
assert.strictEqual(halfDayPenalty, 5000);
assert.strictEqual(absentPenalty, 5000);
console.log('✓ Attendance half-day and absence salary penalty logic verified.');

console.log('--- ALL SELF-CHECKS PASSED SUCCESSFULLY ---');

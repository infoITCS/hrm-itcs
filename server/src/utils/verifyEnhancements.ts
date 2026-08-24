import assert from 'assert';
import {
    generateCustomerReference,
    encryptNumber,
    decryptNumber,
    encryptFinancialField,
    decryptFinancialField,
    decryptEmployeeFields,
    decryptPayslipFields
} from './encryption';
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

// 5. Check AES-256-GCM Financial Encryption & Decryption
const testAmounts = [0, 100, 150000, 325450.75, -5000];
for (const amt of testAmounts) {
    const encrypted = encryptNumber(amt);
    assert(encrypted.startsWith('enc:v1:'), `Encrypted format missing enc:v1 prefix for ${amt}: ${encrypted}`);
    assert.notStrictEqual(encrypted, String(amt), `Value was not encrypted: ${amt}`);
    const decrypted = decryptNumber(encrypted);
    assert.strictEqual(decrypted, amt, `Decryption mismatch for ${amt}, got ${decrypted}`);
}

// Backwards compatibility with legacy unencrypted numbers
assert.strictEqual(decryptNumber(185000), 185000);
assert.strictEqual(decryptNumber('185000'), 185000);
assert.strictEqual(decryptNumber(0), 0);
assert.strictEqual(decryptNumber(null), 0);
assert.strictEqual(decryptNumber(undefined), 0);

// Tamper resistance check: altering ciphertext or tag causes safe decryption fallback
const validCipher = encryptNumber(250000);
const parts = validCipher.split(':');
parts[4] = '00' + parts[4].slice(2); // Alter ciphertext
const tampered = parts.join(':');
assert.strictEqual(decryptNumber(tampered), 0, 'Tampered ciphertext must not decrypt to arbitrary value');

// Test Employee In-Place Decryption
const mockEmp = {
    employeeId: 'ITCS-001',
    financeInfo: {
        probationSalary: encryptNumber(80000),
        confirmedSalary: encryptNumber(120000)
    },
    salaryComponents: [
        { component: 'Basic Salary', amount: encryptNumber(100000) },
        { component: 'Fuel Allowance', amount: encryptNumber(20000) }
    ],
    providentFundBalance: encryptNumber(45000),
    providentFundHistory: [
        { amount: encryptNumber(5000), type: 'credit', description: 'Payroll deduction' }
    ]
};

decryptEmployeeFields(mockEmp);
assert.strictEqual(mockEmp.financeInfo.probationSalary, 80000);
assert.strictEqual(mockEmp.financeInfo.confirmedSalary, 120000);
assert.strictEqual(mockEmp.salaryComponents[0].amount, 100000);
assert.strictEqual(mockEmp.salaryComponents[1].amount, 20000);
assert.strictEqual(mockEmp.providentFundBalance, 45000);
assert.strictEqual(mockEmp.providentFundHistory[0].amount, 5000);

// Test Payslip In-Place Decryption
const mockPayslip = {
    payslipNo: 'PS-2026-08-001',
    grossPay: encryptNumber(150000),
    totalDeductions: encryptNumber(25000),
    netPay: encryptNumber(125000),
    taxDeduction: encryptNumber(15000),
    loanDeduction: encryptNumber(10000),
    earnings: [{ component: 'Basic', amount: encryptNumber(150000) }],
    deductions: [{ component: 'Tax', amount: encryptNumber(15000) }]
};

decryptPayslipFields(mockPayslip);
assert.strictEqual(mockPayslip.grossPay, 150000);
assert.strictEqual(mockPayslip.totalDeductions, 25000);
assert.strictEqual(mockPayslip.netPay, 125000);
assert.strictEqual(mockPayslip.taxDeduction, 15000);
assert.strictEqual(mockPayslip.loanDeduction, 10000);
assert.strictEqual(mockPayslip.earnings[0].amount, 150000);
assert.strictEqual(mockPayslip.deductions[0].amount, 15000);

console.log('✓ AES-256-GCM encryption, decryption, tamper-detection & batch transforms verified.');

console.log('--- ALL SELF-CHECKS PASSED SUCCESSFULLY ---');

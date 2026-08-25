import assert from 'assert';

console.log('--- Running Payroll Corrections Self-Check Tests ---');

// 1. Role permission verification test
function isAdmin(role: string): boolean {
    const normalized = (role || '').toLowerCase().trim();
    return ['super-admin', 'admin', 'finance'].includes(normalized);
}

assert.strictEqual(isAdmin('super-admin'), true, 'super-admin should have admin access');
assert.strictEqual(isAdmin('admin'), true, 'admin should have admin access');
assert.strictEqual(isAdmin('Admin '), true, 'Admin with whitespace/casing should have admin access');
assert.strictEqual(isAdmin('finance'), true, 'finance should have admin access');
assert.strictEqual(isAdmin('manager'), false, 'manager should not have admin access');
assert.strictEqual(isAdmin('employee'), false, 'employee should not have admin access');
console.log('✓ isAdmin role permission checks passed');

// 2. Company Dynamic Settings & PF calculation test
const mockCompany = {
    payrollSettings: {
        mealRatePerDay: 600,
        pfContributionRate: 10,
        defaultBankName: 'Meezan Bank'
    }
};

const baseSalary = 100000;
const pfRate = (mockCompany.payrollSettings.pfContributionRate ?? 15) / 100;
const pfContribution = Math.round(baseSalary * pfRate);
assert.strictEqual(pfContribution, 10000, 'PF contribution should correctly compute 10% of base salary');
console.log('✓ PF dynamic calculation check passed');

// 3. Meal Allowance calculation test
const presentDays = 20;
const mealRate = mockCompany.payrollSettings.mealRatePerDay ?? 500;
const totalMealAllowance = presentDays * mealRate;
assert.strictEqual(totalMealAllowance, 12000, 'Meal allowance should correctly compute 20 * 600 = 12000');
console.log('✓ Meal allowance calculation check passed');

// 4. PF Rollback on deletion test
let employeePfBalance = 50000;
let employeePfHistory = [
    { amount: 15000, type: 'credit', payrollRunId: 'run-1', periodMonth: 1, periodYear: 2026 },
    { amount: 10000, type: 'credit', payrollRunId: 'run-2', periodMonth: 2, periodYear: 2026 }
];

const targetRunId = 'run-2';
const runPfEntries = employeePfHistory.filter((pf: any) => pf.payrollRunId === targetRunId);
const totalCredited = runPfEntries.reduce((sum: number, pf: any) => sum + (pf.type === 'credit' ? pf.amount : -pf.amount), 0);

employeePfBalance = Math.max(0, employeePfBalance - totalCredited);
employeePfHistory = employeePfHistory.filter((pf: any) => pf.payrollRunId !== targetRunId);

assert.strictEqual(employeePfBalance, 40000, 'PF balance should rollback by 10000 to 40000');
assert.strictEqual(employeePfHistory.length, 1, 'PF history entry for run-2 should be removed');
assert.strictEqual(employeePfHistory[0].payrollRunId, 'run-1', 'Only run-1 history entry should remain');
console.log('✓ PF rollback calculation check passed');

console.log('--- All Self-Check Tests Passed Successfully ---');

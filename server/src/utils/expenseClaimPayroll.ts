/** Legacy single-line label used before per-category payroll mapping */
export const LEGACY_EXPENSE_CLAIM_COMPONENT = 'Expense Reimbursements';

const CATEGORY_TO_PAYROLL_COMPONENT: Record<string, string> = {
    Medical: 'Medical Allowance',
    Travel: 'Travel Allowance',
    'Training & Certification': 'Training & Certification',
    'Sales/Customer Gifts': 'Sales/Customer Gifts',
    Other: 'Other Allowance',
};

/** Map an approved expense-claim category to the payslip earning component name */
export function payrollComponentForClaimCategory(category: string): string {
    const key = (category || '').trim();
    if (!key) return 'Other Allowance';
    if (CATEGORY_TO_PAYROLL_COMPONENT[key]) return CATEGORY_TO_PAYROLL_COMPONENT[key];
    if (/allowance/i.test(key)) return key;
    return `${key} Allowance`;
}

/** True for claim-derived earnings (supports legacy payslips) */
export function isExpenseClaimPayrollEarning(earning: { component?: string; expenseClaim?: boolean }): boolean {
    if (earning.expenseClaim === true) return true;
    return earning.component === LEGACY_EXPENSE_CLAIM_COMPONENT;
}

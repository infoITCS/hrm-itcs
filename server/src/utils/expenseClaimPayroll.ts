/** Legacy single-line label used before per-category payroll mapping */
export const LEGACY_EXPENSE_CLAIM_COMPONENT = 'Expense Reimbursements';

const CATEGORY_TO_PAYROLL_COMPONENT: Record<string, string> = {
    Medical: 'Medical Expense Reimbursement',
    Travel: 'Travel Expense Reimbursement',
    'Training & Certification': 'Training & Certification Reimbursement',
    'Sales/Customer Gifts': 'Sales/Customer Gifts Reimbursement',
    Other: 'Expense Reimbursements',
};

/** Map an approved expense-claim category to the payslip earning component name */
export function payrollComponentForClaimCategory(category: string): string {
    const key = (category || '').trim();
    if (!key) return 'Expense Reimbursements';
    if (CATEGORY_TO_PAYROLL_COMPONENT[key]) return CATEGORY_TO_PAYROLL_COMPONENT[key];
    if (/reimbursement/i.test(key)) return key;
    if (/allowance/i.test(key)) return key.replace(/allowance/i, 'Reimbursement');
    return `${key} Reimbursement`;
}

/** True for claim-derived earnings (supports legacy payslips) */
export function isExpenseClaimPayrollEarning(earning: { component?: string; expenseClaim?: boolean }): boolean {
    if (earning.expenseClaim === true) return true;
    if (/reimbursement/i.test(earning.component || '')) return true;
    return earning.component === LEGACY_EXPENSE_CLAIM_COMPONENT;
}

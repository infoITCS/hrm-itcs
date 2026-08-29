export const LEGACY_EXPENSE_CLAIM_COMPONENT = 'Expense Reimbursements';

export function isExpenseClaimPayrollEarning(earning: { component?: string; expenseClaim?: boolean }): boolean {
    if (earning.expenseClaim === true) return true;
    return earning.component === LEGACY_EXPENSE_CLAIM_COMPONENT;
}

export const FUEL_ALLOWANCE_AMOUNT = 4000;

export const DEFAULT_EMPLOYEE_SALARY_COMPONENTS = [
    { component: 'Basic Salary', amount: 0, type: 'fixed' as const },
    { component: 'Medical Allowance', amount: 0, type: 'fixed' as const },
    { component: 'Fuel Allowance', amount: FUEL_ALLOWANCE_AMOUNT, type: 'fixed' as const },
];

/** Ensure every employee has Fuel Allowance at the standard monthly amount. */
export function ensureFuelAllowance(components: any[] | undefined | null): any[] {
    const list = Array.isArray(components) ? components.map(c => ({ ...c })) : [];

    const idx = list.findIndex(
        (c) => String(c?.component || '').toLowerCase() === 'fuel allowance'
    );

    if (idx >= 0) {
        list[idx] = {
            ...list[idx],
            component: 'Fuel Allowance',
            amount: FUEL_ALLOWANCE_AMOUNT,
            type: list[idx].type === 'variable' ? 'variable' : 'fixed',
        };
    } else {
        list.push({
            component: 'Fuel Allowance',
            amount: FUEL_ALLOWANCE_AMOUNT,
            type: 'fixed',
        });
    }

    return list;
}

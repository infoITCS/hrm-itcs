export const FUEL_ALLOWANCE_AMOUNT = 4000;

export const DEFAULT_EMPLOYEE_SALARY_COMPONENTS = [
    { component: 'Basic Salary', amount: 0, type: 'fixed' as const },
    { component: 'Medical Allowance', amount: 0, type: 'fixed' as const },
    { component: 'Fuel Allowance', amount: FUEL_ALLOWANCE_AMOUNT, type: 'fixed' as const },
];

/** Employment status options for HR edit forms */
export const EMPLOYMENT_STATUS_OPTIONS = [
    'Probation',
    'Permanent',
    'Internship',
    'Contract',
    'Part-time',
    'On Hold',
    'Terminated',
    'Resigned',
] as const;

export type EmploymentStatusOption = (typeof EMPLOYMENT_STATUS_OPTIONS)[number];

export const PAYROLL_EXCLUDED_STATUSES = ['Terminated', 'Resigned', 'On Hold'] as const;

export function isPayrollExcludedStatus(status: string | undefined | null): boolean {
    return PAYROLL_EXCLUDED_STATUSES.includes((status || '') as (typeof PAYROLL_EXCLUDED_STATUSES)[number]);
}

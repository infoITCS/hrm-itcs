/** Employment statuses stored on employee records */
export const EMPLOYMENT_STATUSES = [
    'Probation',
    'Permanent',
    'Internship',
    'Contract',
    'Part-time',
    'On Hold',
    'Terminated',
    'Resigned',
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Left the company — excluded from active workforce lists where applicable */
export const OFFBOARDED_EMPLOYMENT_STATUSES = ['Terminated', 'Resigned'] as const;

/** Excluded from payroll generate / preview employee lists */
export const PAYROLL_EXCLUDED_STATUSES = [...OFFBOARDED_EMPLOYMENT_STATUSES, 'On Hold'] as const;

export function getEmploymentStatusValue(emp: { employmentStatus?: string | { status?: string } } | null | undefined): string {
    if (!emp?.employmentStatus) return '';
    if (typeof emp.employmentStatus === 'string') return emp.employmentStatus;
    return emp.employmentStatus.status || '';
}

export function isPayrollEligibleStatus(status: string): boolean {
    const normalized = (status || '').trim();
    if (!normalized) return true;
    return !PAYROLL_EXCLUDED_STATUSES.includes(normalized as (typeof PAYROLL_EXCLUDED_STATUSES)[number]);
}

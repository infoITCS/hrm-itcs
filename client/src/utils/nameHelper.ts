/**
 * Safely formats an employee or user's full name from firstName, middleName, and lastName parts.
 * Trims whitespace, eliminates empty components, and guarantees accurate display across all modules.
 */
export function formatEmployeeFullName(
    emp?: { firstName?: string; middleName?: string; lastName?: string; [key: string]: any } | any | null,
    fallback = '—'
): string {
    if (!emp) return fallback;
    const parts = [emp.firstName, emp.middleName, emp.lastName]
        .map(s => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean);
    return parts.join(' ') || fallback;
}

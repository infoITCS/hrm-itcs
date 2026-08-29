import Employee from '../models/Employee';
import AuditLog from '../models/AuditLog';
import logger from '../utils/logger';

export interface ProbationUpgradeResult {
    upgradedCount: number;
    employeeIds: string[];
}

/** True when the probation end calendar day is today or earlier. */
export function isProbationPeriodEnded(probationEndDate: Date | string | undefined | null, asOf: Date = new Date()): boolean {
    if (!probationEndDate) return false;
    const end = new Date(probationEndDate);
    if (Number.isNaN(end.getTime())) return false;

    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    return today >= endDay;
}

function employmentStatusValue(emp: any): string {
    if (!emp?.employmentStatus) return '';
    if (typeof emp.employmentStatus === 'string') return emp.employmentStatus;
    return emp.employmentStatus.status || '';
}

/**
 * Promote employees whose probation end date has passed from Probation → Permanent.
 * Runs in bulk (cron/payroll) or for a single employee (profile load self-heal).
 */
export async function upgradeCompletedProbations(options: { employeeId?: string } = {}): Promise<ProbationUpgradeResult> {
    const asOf = new Date();
    const endOfToday = new Date(asOf);
    endOfToday.setHours(23, 59, 59, 999);

    const filter: Record<string, unknown> = {
        'employmentStatus.probationEndDate': { $lte: endOfToday, $ne: null },
        'employmentStatus.status': 'Probation',
        'employmentStatus.autoUpdated': { $ne: true },
        isDeleted: { $ne: true },
    };

    if (options.employeeId) {
        filter.employeeId = options.employeeId;
    }

    const eligibleEmployees = await Employee.find(filter).select('_id employeeId employmentStatus').lean();

    const toUpgrade = eligibleEmployees.filter((emp) =>
        isProbationPeriodEnded(emp.employmentStatus?.probationEndDate, asOf)
    );

    if (toUpgrade.length === 0) {
        return { upgradedCount: 0, employeeIds: [] };
    }

    const bulkOps = toUpgrade.map((emp) => ({
        updateOne: {
            filter: { _id: emp._id },
            update: {
                $set: {
                    'employmentStatus.status': 'Permanent',
                    'employmentStatus.autoUpdated': true,
                },
            },
        },
    }));
    await Employee.bulkWrite(bulkOps);

    const auditEntries = toUpgrade.map((emp) => ({
        action: 'UPDATE',
        targetResource: 'Employee',
        targetId: emp.employeeId,
        performedBy: 'System',
        timestamp: asOf,
        details: {
            diff: {
                'employmentStatus.status': { old: 'Probation', new: 'Permanent' },
                'employmentStatus.autoUpdated': { old: false, new: true },
            },
            reason: 'Automatic probation period completion',
        },
    }));
    await AuditLog.insertMany(auditEntries);

    const employeeIds = toUpgrade.map((e) => e.employeeId);
    logger.info(`Auto-upgraded ${employeeIds.length} employee(s) from Probation to Permanent: ${employeeIds.join(', ')}`);

    return { upgradedCount: employeeIds.length, employeeIds };
}

/** Self-heal a single employee document before returning it to the client. */
export async function ensureProbationUpgraded(employee: any): Promise<any> {
    if (!employee?.employeeId) return employee;

    const status = employmentStatusValue(employee);
    if (status !== 'Probation') return employee;
    if (employee.employmentStatus?.autoUpdated) return employee;
    if (!isProbationPeriodEnded(employee.employmentStatus?.probationEndDate)) return employee;

    await upgradeCompletedProbations({ employeeId: employee.employeeId });
    return Employee.findOne({ employeeId: employee.employeeId }).select('-attachments.fileData').lean();
}

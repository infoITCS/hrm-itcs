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
        isDeleted: { $ne: true },
    };

    if (options.employeeId) {
        filter.employeeId = options.employeeId;
    } else {
        filter.$or = [
            { 'employmentStatus.status': { $regex: /^probation$/i } },
            { employmentStatus: { $regex: /^probation$/i } }
        ];
    }

    const eligibleEmployees = await Employee.find(filter).select('_id employeeId employmentStatus jobInfo').lean();

    const toUpgrade: any[] = [];
    const bulkOps: any[] = [];

    for (const emp of eligibleEmployees) {
        const joining = emp.jobInfo?.joiningDate ? new Date(emp.jobInfo.joiningDate) : null;
        const probationEnd = emp.employmentStatus?.probationEndDate ? new Date(emp.employmentStatus.probationEndDate) : null;
        const currentStatus = employmentStatusValue(emp).trim();
        const isProbation = currentStatus.toLowerCase() === 'probation';

        let shouldUpgrade = false;
        let correctedEnd: Date | null = null;

        // Check if joining date indicates probation has passed (90 days)
        if (joining && !Number.isNaN(joining.getTime())) {
            const expectedEnd = new Date(joining.getTime() + 90 * 24 * 60 * 60 * 1000);
            if (expectedEnd <= endOfToday) {
                if (isProbation) {
                    shouldUpgrade = true;
                }
                if (!probationEnd || probationEnd > endOfToday) {
                    correctedEnd = expectedEnd;
                }
            }
        }

        // Standard check on probationEndDate
        if (!shouldUpgrade && isProbation && isProbationPeriodEnded(probationEnd, asOf)) {
            shouldUpgrade = true;
        }

        if (shouldUpgrade || correctedEnd) {
            toUpgrade.push(emp);
            const statusObj = (typeof emp.employmentStatus === 'object' && emp.employmentStatus !== null)
                ? emp.employmentStatus
                : {};

            bulkOps.push({
                updateOne: {
                    filter: { _id: emp._id },
                    update: {
                        $set: {
                            employmentStatus: {
                                ...statusObj,
                                ...(shouldUpgrade ? { status: 'Permanent', autoUpdated: true } : {}),
                                ...(correctedEnd ? { probationEndDate: correctedEnd } : {}),
                            },
                        },
                    },
                },
            });
        }
    }

    if (bulkOps.length === 0) {
        return { upgradedCount: 0, employeeIds: [] };
    }

    await Employee.bulkWrite(bulkOps);

    const auditEntries = toUpgrade.filter(emp => employmentStatusValue(emp).trim().toLowerCase() === 'probation').map((emp) => ({
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
            reason: 'Automatic probation period completion based on joining date/probation end date',
        },
    }));
    if (auditEntries.length > 0) {
        await AuditLog.insertMany(auditEntries);
    }

    const employeeIds = toUpgrade.map((e) => e.employeeId);
    logger.info(`Processed/auto-upgraded ${employeeIds.length} employee(s) for probation completion: ${employeeIds.join(', ')}`);

    return { upgradedCount: employeeIds.length, employeeIds };
}

/** Self-heal a single employee document before returning it to the client. */
export async function ensureProbationUpgraded(employee: any): Promise<any> {
    if (!employee?.employeeId) return employee;

    const joining = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate) : null;
    const currentProbationEnd = employee.employmentStatus?.probationEndDate ? new Date(employee.employmentStatus.probationEndDate) : null;
    const status = employmentStatusValue(employee).trim();
    const isProbation = status.toLowerCase() === 'probation';

    if (!isProbation) return employee;

    const probationEnded = isProbationPeriodEnded(currentProbationEnd) || 
        (joining && !Number.isNaN(joining.getTime()) && (joining.getTime() + 90 * 24 * 60 * 60 * 1000) <= Date.now());

    if (probationEnded) {
        await upgradeCompletedProbations({ employeeId: employee.employeeId });
        const updated = await Employee.findOne({ employeeId: employee.employeeId }).select('-attachments.fileData').lean();
        return updated || employee;
    }

    return employee;
}

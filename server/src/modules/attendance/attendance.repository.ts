/**
 * attendance.repository.ts
 * ALL Mongoose queries for the attendance module live here.
 * Services never import models directly — they call this repository.
 */
import AttendancePunch from '../../models/AttendancePunch';
import AttendanceRecord from '../../models/AttendanceRecord';
import DeviceLocation from '../../models/DeviceLocation';
import Employee from '../../models/Employee';
import { findHolidayForDate as lookupHolidayForDate } from '../../utils/holidayUtils';
import LeaveRequest, { LeaveStatus } from '../../models/LeaveRequest';
import ZktSyncState from '../../models/ZktSyncState';
import { startOfDay, endOfDay } from '../../shared/utils/dateUtils';
import type { RecordFilter, ShiftConfig } from './attendance.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function translateFilter(filter: RecordFilter): any {
    const query: any = {};
    if (filter.employeeId) {
        query.employeeId = Array.isArray(filter.employeeId) ? { $in: filter.employeeId } : filter.employeeId;
    }
    if (filter.date) {
        if (typeof filter.date === 'string') {
            query.date = filter.date;
        } else {
            query.date = { $gte: filter.date.from, $lte: filter.date.to };
        }
    }
    if (filter.status) {
        query.status = Array.isArray(filter.status) ? { $in: filter.status } : filter.status;
    }
    if (filter.location) {
        query.location = filter.location;
    }
    if (filter.lateMinutes) {
        query.lateMinutes = {};
        if (filter.lateMinutes.min !== undefined) query.lateMinutes.$gte = filter.lateMinutes.min;
        if (filter.lateMinutes.max !== undefined) query.lateMinutes.$lte = filter.lateMinutes.max;
        if (Object.keys(query.lateMinutes).length === 0) delete query.lateMinutes;
    }
    return query;
}

// ─── Attendance Records ────────────────────────────────────────────────────────

export async function findRecords(filter: RecordFilter, skip: number, limit: number) {
    const query = translateFilter(filter);
    return AttendanceRecord.find(query)
        .sort({ date: -1, employeeId: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
}

export async function countRecords(filter: RecordFilter): Promise<number> {
    const query = translateFilter(filter);
    return AttendanceRecord.countDocuments(query);
}

export async function upsertRecord(employeeId: string, date: string, data: Record<string, any>) {
    return AttendanceRecord.findOneAndUpdate(
        { employeeId, date },
        { $set: { employeeId, date, ...data } },
        { upsert: true, new: true }
    );
}

export async function findRecordById(id: string) {
    return AttendanceRecord.findById(id);
}

export async function findRecordsForDate(date: string, extraFilter: Record<string, any> = {}) {
    return AttendanceRecord.find({ date, ...extraFilter }).lean();
}

export async function findRecordsForDateRange(startDate: string, endDate: string, extraFilter: Record<string, any> = {}) {
    return AttendanceRecord.find({ 
        date: { $gte: startDate, $lte: endDate },
        ...extraFilter 
    }).lean();
}

export async function distinctRecordedIds(date: string, extraFilter: Record<string, any> = {}): Promise<string[]> {
    return AttendanceRecord.find({ date, ...extraFilter }).distinct('employeeId');
}

export async function findIncompleteRecords(date: string) {
    return AttendanceRecord.find({
        date,
        status: 'Incomplete',
        manuallyAdjusted: { $ne: true },
    }).lean();
}

// ─── Attendance Punches ────────────────────────────────────────────────────────

export async function findPunchesForDay(employeeId: string, dateStr: string) {
    return AttendancePunch.find({
        employeeId,
        punchTime: { $gte: startOfDay(dateStr), $lte: endOfDay(dateStr) },
    })
        .sort({ punchTime: 1 })
        .lean();
}

export async function upsertPunch(
    deviceSN: string,
    machineUserId: string,
    punchTime: Date,
    data: Record<string, any>
) {
    return AttendancePunch.findOneAndUpdate(
        { deviceSN, machineUserId, punchTime },
        { $setOnInsert: data },
        { upsert: true, new: false }
    );
}

export async function markPunchesProcessed(employeeId: string, dateStr: string) {
    return AttendancePunch.updateMany(
        {
            employeeId,
            punchTime: { $gte: startOfDay(dateStr), $lte: endOfDay(dateStr) },
        },
        { $set: { processed: true } }
    );
}

export async function distinctPunchedIds(dateStr: string, extraFilter: Record<string, any> = {}): Promise<string[]> {
    return AttendancePunch.distinct('employeeId', {
        punchTime: { $gte: startOfDay(dateStr), $lte: endOfDay(dateStr) },
        ...extraFilter,
    });
}

export async function aggregateLivePunches(dateStr: string, extraFilter: Record<string, any> = {}) {
    return AttendancePunch.aggregate([
        {
            $match: {
                punchTime: { $gte: startOfDay(dateStr), $lte: endOfDay(dateStr) },
                ...extraFilter,
            },
        },
        { $sort: { punchTime: 1 } },
        {
            $group: {
                _id: '$employeeId',
                firstPunch: { $first: '$punchTime' },
                lastPunch: { $last: '$punchTime' },
                count: { $sum: 1 },
                name: { $first: '$employeeName' },
                location: { $first: '$location' },
            },
        },
    ]);
}

export async function findRecentPunches(dateStr: string, limit: number, extraFilter: Record<string, any> = {}) {
    return AttendancePunch.find({
        punchTime: { $gte: startOfDay(dateStr), $lte: endOfDay(dateStr) },
        ...extraFilter,
    })
        .sort({ punchTime: -1 })
        .limit(limit)
        .lean();
}

// ─── Employees ────────────────────────────────────────────────────────────────

export async function findEmployeeByUserId(userId: string) {
    return Employee.findOne({ userId, isDeleted: { $ne: true } })
        .select('employeeId firstName lastName')
        .lean() as Promise<{ employeeId: string; firstName: string; lastName: string } | null>;
}

export async function findEmployeeByPin(pin: string) {
    return Employee.findOne({ biometricPin: pin, isDeleted: { $ne: true } }, { employeeId: 1, firstName: 1, lastName: 1 }).lean() as Promise<{
        employeeId: string;
        firstName: string;
        lastName: string;
    } | null>;
}

export async function findEmployeesByPins(pins: string[], location?: string) {
    const filter: any = { biometricPin: { $in: pins }, isDeleted: { $ne: true } };
    if (location) filter['jobInfo.workLocation'] = location;
    return Employee.find(filter).lean();
}

export async function findSubordinateIds(managerEmployeeId: string): Promise<string[]> {
    const subordinates = await Employee.find(
        { 'jobInfo.reportingManager': managerEmployeeId, isDeleted: { $ne: true } },
        { employeeId: 1 }
    ).lean();
    return subordinates.map((e: any) => e.employeeId);
}

export async function findActiveEmployees(extraFilter: Record<string, any> = {}) {
    return Employee.find({
        'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] },
        isDeleted: { $ne: true },
        ...extraFilter,
    })
        .select('employeeId firstName lastName jobInfo.workLocation')
        .lean();
}

export async function countActiveEmployees(extraFilter: Record<string, any> = {}): Promise<number> {
    return Employee.countDocuments({
        'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] },
        isDeleted: { $ne: true },
        ...extraFilter,
    });
}

export async function findEmployeeWithShift(employeeId: string) {
    return Employee.findOne({ employeeId, isDeleted: { $ne: true } }).populate('jobInfo.shift').lean();
}

export async function findEmployeeById(employeeId: string) {
    return Employee.findOne({ employeeId, isDeleted: { $ne: true } }).lean();
}

export async function findEmployeesByIds(employeeIds: string[]) {
    return Employee.find({ employeeId: { $in: employeeIds }, isDeleted: { $ne: true } })
        .select('employeeId firstName lastName avatar')
        .lean();
}

// ─── Leave & Holiday ──────────────────────────────────────────────────────────

/** Returns a map of employeeId → leaveType for all approved leaves covering dateStr */
export async function findApprovedLeavesForDate(
    dateStr: string,
    employeeIds?: string[]
): Promise<Map<string, string>> {
    const filter: Record<string, any> = {
        startDate: { $lte: dateStr },
        endDate: { $gte: dateStr },
        status: LeaveStatus.APPROVED,
    };
    
    if (employeeIds) {
        // Resolve both readable employeeId and userIds to check in LeaveRequest
        const emps = await Employee.find({
            $or: [
                { employeeId: { $in: employeeIds } },
                { userId: { $in: employeeIds.filter(id => id.length === 24) } }
            ]
        }).select('employeeId userId').lean();

        const allPossibleIds = new Set<string>();
        employeeIds.forEach(id => allPossibleIds.add(id));
        emps.forEach(e => {
            if (e.employeeId) allPossibleIds.add(e.employeeId);
            if (e.userId) allPossibleIds.add(e.userId);
        });

        filter.employeeId = { $in: Array.from(allPossibleIds) };
    }

    const leaves = await LeaveRequest.find(filter).lean() as any[];
    const resultMap = new Map<string, string>();

    if (leaves.length > 0) {
        const leaveEmpIds = leaves.map(l => l.employeeId);
        const emps = await Employee.find({
            $or: [
                { employeeId: { $in: leaveEmpIds } },
                { userId: { $in: leaveEmpIds.filter(id => id.length === 24) } }
            ]
        }).select('employeeId userId').lean();

        const idToReadable = new Map<string, string>();
        emps.forEach(e => {
            if (e.userId) idToReadable.set(e.userId, e.employeeId);
        });

        leaves.forEach((l) => {
            resultMap.set(l.employeeId, l.type);
            const readableId = idToReadable.get(l.employeeId);
            if (readableId) {
                resultMap.set(readableId, l.type);
            }
        });
    }

    return resultMap;
}

export async function findHolidayForDate(dateStr: string, location?: string): Promise<string | null> {
    return lookupHolidayForDate(dateStr, location);
}

// ─── Device / Location ────────────────────────────────────────────────────────

export async function findDeviceConfig(deviceSN: string) {
    return DeviceLocation.findOne({ deviceSN, isActive: true }).lean();
}

export async function findLocationConfig(locationName: string) {
    return DeviceLocation.findOne({ locationName, isActive: true }).lean();
}

export async function findLocationConfigs(locationNames: string[]) {
    return DeviceLocation.find({ locationName: { $in: locationNames }, isActive: true }).lean();
}

export async function findAllDevices() {
    return DeviceLocation.find().sort({ locationName: 1 }).lean();
}

export async function upsertDevice(deviceSN: string, data: Record<string, any>) {
    return DeviceLocation.findOneAndUpdate({ deviceSN }, { $set: data }, { upsert: true, new: true });
}

/** Returns the shift config with fallback chain: WorkShift → DeviceLocation → defaults */
export function resolveShiftConfig(employee: any, deviceConfig: any): ShiftConfig {
    const shift = employee?.jobInfo?.shift;
    return {
        shiftStart: shift?.startTime ?? deviceConfig?.shiftStart ?? '09:00',
        shiftEnd: shift?.endTime ?? deviceConfig?.shiftEnd ?? '18:00',
        graceMinutes: shift?.graceMinutes ?? deviceConfig?.graceMinutes ?? 30,
        halfDayThresholdHours: shift?.halfDayThreshold ?? deviceConfig?.halfDayThresholdHours ?? 4,
        locationName: deviceConfig?.locationName ?? 'ISB-Office',
        enableLunchDeduction: shift?.enableLunchDeduction ?? true,
        lunchDeductionMinutes: shift?.lunchDeductionMinutes ?? 60,
        lunchThresholdHours: shift?.lunchThresholdHours ?? 5,
    };
}

// ─── ZKT Sync State ───────────────────────────────────────────────────────────

export async function getOrCreateSyncState() {
    return ZktSyncState.findOneAndUpdate(
        { key: 'default' },
        { $setOnInsert: { key: 'default', totalSynced: 0, lastSyncAt: null, lastTransactionId: null } },
        { upsert: true, new: true }
    );
}

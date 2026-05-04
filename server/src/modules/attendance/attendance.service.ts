import * as repo from './attendance.repository';
import { fetchReport } from '../../services/zktCloudService';
import logger from '../../utils/logger';
import {
    pktHHMMtoUtc, isWeekend, applyLunchDeduction,
    isValidCheckout, toPKTTimeString, startOfDay, endOfDay, todayPKT, nowPKT
} from '../../shared/utils/dateUtils';
import type {
    ShiftConfig, DashboardSummary, RecordsPage,
    RecordFilter, AttendanceRecordDTO, WeeklyDay, AutoCloseResult
} from './attendance.types';
import { AttendanceStatus } from '../../models/AttendanceRecord';

// ─── Shift Logic ──────────────────────────────────────────────────────────────

function computeStatus(
    workMins: number,
    lateMinutes: number,
    isEarlyLeave: boolean,
    hasCheckout: boolean,
    halfDayHrs: number
): AttendanceStatus {
    if (!hasCheckout) return 'Incomplete';
    if (workMins < halfDayHrs * 60) return 'Half-Day';
    if (isEarlyLeave) return 'Early Leave';
    if (lateMinutes > 0) return 'Late';
    return 'Present';
}

// ─── Core Punch Processor ─────────────────────────────────────────────────────

export async function processEmployeePunches(
    employeeId: string,
    dateStr: string,
    deviceSN: string
): Promise<void> {
    try {
        const [deviceConfig, employee] = await Promise.all([
            repo.findDeviceConfig(deviceSN),
            repo.findEmployeeWithShift(employeeId),
        ]);

        const cfg: ShiftConfig = repo.resolveShiftConfig(employee, deviceConfig);
        const punches = await repo.findPunchesForDay(employeeId, dateStr);

        // ── No punches: classify as Absent / On Leave / Holiday / Weekend ──
        if (punches.length === 0) {
            const [holidayName, leaveMap] = await Promise.all([
                repo.findHolidayForDate(dateStr, cfg.locationName),
                repo.findApprovedLeavesForDate(dateStr, [employeeId]),
            ]);
            const leaveType = leaveMap.get(employeeId) ?? null;
            const weekend = isWeekend(dateStr);

            let status: AttendanceStatus = 'Absent';
            if (holidayName) status = 'Holiday';
            else if (leaveType) status = 'On Leave';
            else if (weekend) status = 'Weekend';

            await repo.upsertRecord(employeeId, dateStr, {
                location: cfg.locationName,
                status,
                shiftStart: cfg.shiftStart,
                shiftEnd: cfg.shiftEnd,
                leaveType: leaveType ?? undefined,
                isHalfDay: false,
                note: holidayName || leaveType || (weekend ? 'Weekend' : undefined),
                workDurationMinutes: 0,
                lateMinutes: 0,
                overtimeMinutes: 0,
                allPunches: [],
            });
            return;
        }

        // ── Has punches: compute check-in, check-out, durations ──
        const allPunchTimes = (punches as any[]).map((p) => p.punchTime as Date);
        const checkIn = allPunchTimes[0];

        let checkOut: Date | undefined;
        if (allPunchTimes.length > 1) {
            const last = allPunchTimes[allPunchTimes.length - 1];
            if (isValidCheckout(checkIn, last)) checkOut = last;
        }

        const shiftStartTime = pktHHMMtoUtc(dateStr, cfg.shiftStart);
        const shiftEndTime = pktHHMMtoUtc(dateStr, cfg.shiftEnd);

        const diffMins = Math.floor((checkIn.getTime() - shiftStartTime.getTime()) / 60000);
        const lateMinutes = diffMins > cfg.graceMinutes ? diffMins - cfg.graceMinutes : 0;

        let workDurationMinutes = 0;
        let overtimeMinutes = 0;
        let isEarlyLeave = false;

        if (checkOut) {
            const rawMins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
            workDurationMinutes = applyLunchDeduction(rawMins);

            const otDiff = Math.floor((checkOut.getTime() - shiftEndTime.getTime()) / 60000);
            if (otDiff > 0) overtimeMinutes = otDiff;

            const earlyDiff = Math.floor((shiftEndTime.getTime() - checkOut.getTime()) / 60000);
            if (earlyDiff > 10) isEarlyLeave = true;
        }

        const leaveMap = await repo.findApprovedLeavesForDate(dateStr, [employeeId]);
        const leaveType = leaveMap.get(employeeId) ?? null;

        const status = computeStatus(
            workDurationMinutes,
            lateMinutes,
            isEarlyLeave,
            !!checkOut,
            cfg.halfDayThresholdHours
        );

        await repo.upsertRecord(employeeId, dateStr, {
            location: cfg.locationName,
            checkIn,
            checkOut,
            shiftStart: cfg.shiftStart,
            shiftEnd: cfg.shiftEnd,
            workDurationMinutes,
            status,
            lateMinutes,
            overtimeMinutes,
            leaveType: leaveType ?? undefined,
            isHalfDay: status === 'Half-Day',
            allPunches: allPunchTimes,
        });

        await repo.markPunchesProcessed(employeeId, dateStr);
    } catch (err) {
        logger.error(`[AttendanceService] Error processing ${employeeId} on ${dateStr}:`, err);
        throw err; // Re-throw to allow caller to handle failure
    }
}

// ─── Today Roster (smart first-in / last-out per employee) ─────────────────

const VERIFY_LABELS: Record<number, string> = {
    0: 'Password', 1: 'Fingerprint', 3: 'Card', 4: 'Face', 15: 'Face',
};

export async function getTodayRoster(
    dateStr: string,
    location?: string,
    teamScope?: string[] | null
): Promise<import('./attendance.types').TodayRosterEntry[]> {
    // 1. Fetch ALL punches for the day in one query
    const punchFilter: Record<string, any> = {
        punchTime: { $gte: startOfDay(dateStr), $lte: endOfDay(dateStr) },
    };
    if (teamScope !== null && teamScope !== undefined) {
        punchFilter.employeeId = { $in: teamScope };
    }

    const allPunches = await repo.findRecentPunches(dateStr, 9999, punchFilter) as any[];

    // 2. Also get existing records (for employees who have been fully processed)
    const recFilter: Record<string, any> = {};
    if (teamScope !== null && teamScope !== undefined) recFilter.employeeId = { $in: teamScope };
    const existingRecords = await repo.findRecordsForDate(dateStr, recFilter) as any[];
    const recMap = new Map(existingRecords.map((r: any) => [r.employeeId, r]));

    // 3. Group punches by employeeId
    const punchMap = new Map<string, any[]>();
    for (const p of allPunches) {
        const empId = p.employeeId;
        if (!empId) {
            // Unlinked punch — group by machineUserId to show in roster as "Not Linked"
            const unlinkedId = `unlinked_${p.machineUserId}`;
            if (!punchMap.has(unlinkedId)) punchMap.set(unlinkedId, []);
            punchMap.get(unlinkedId)!.push(p);
            continue;
        }
        if (!punchMap.has(empId)) punchMap.set(empId, []);
        punchMap.get(empId)!.push(p);
    }

    // 4. Resolve employee names from biometric PINs
    const allPins = [...new Set(allPunches.map((p: any) => String(p.machineUserId)).filter(Boolean))];
    const allEmpIds = [...new Set([...[...punchMap.keys()].filter(id => !id.startsWith('unlinked_')), ...recMap.keys()])];
    
    // Fetch ONLY the employees this manager is authorized to see
    const activeFilter: any = { 
        'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] },
        isDeleted: { $ne: true }
    };
    if (location) activeFilter['jobInfo.workLocation'] = location;
    if (teamScope) activeFilter.employeeId = { $in: teamScope };

    const activeEmployees = await repo.findActiveEmployees(activeFilter) as any[];
    const activeEmpIds = activeEmployees.map(e => e.employeeId);
    
    const [pinEmployees, idEmployees] = await Promise.all([
        allPins.length > 0 ? repo.findEmployeesByPins(allPins) : Promise.resolve([]),
        repo.findEmployeesByIds([...new Set([...allEmpIds, ...activeEmpIds])]),
    ]);
    const pinToEmp = new Map((pinEmployees as any[]).map(e => [e.biometricPin, e]));
    const idToEmp = new Map((idEmployees as any[]).map(e => [e.employeeId, e]));

    // 5. Get location config for shift/grace info
    const locationCfg = await repo.findLocationConfig(location || 'ISB-Office') as any;
    const shiftStartStr = locationCfg?.shiftStart || '09:00';
    const graceMinutes = locationCfg?.graceMinutes ?? 30;
    const shiftStartTime = pktHHMMtoUtc(dateStr, shiftStartStr);

    // 6. Build roster entries
    const roster: import('./attendance.types').TodayRosterEntry[] = [];
    const processedEmpIds = new Set<string>();

    for (const [key, punches] of punchMap.entries()) {
        // Sort punches chronologically
        punches.sort((a: any, b: any) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime());

        const firstPunch = punches[0];
        const lastPunch = punches[punches.length - 1];
        
        const isUnlinked = key.startsWith('unlinked_');
        const empId = isUnlinked ? null : key;
        if (empId) processedEmpIds.add(empId);

        // Use existing processed record if available
        const rec = empId ? recMap.get(empId) as any : null;
        const checkInTime = rec?.checkIn ? new Date(rec.checkIn) : new Date(firstPunch.punchTime);

        // Determine if last punch qualifies as a valid checkout
        let checkOutTime: Date | null = rec?.checkOut ? new Date(rec.checkOut) : null;
        if (!checkOutTime && punches.length > 1) {
            const lastTime = new Date(lastPunch.punchTime);
            const diffMins = Math.floor((lastTime.getTime() - checkInTime.getTime()) / 60000);
            if (diffMins >= 60 && isValidCheckout(checkInTime, lastTime)) {
                checkOutTime = lastTime;
            }
        }

        // Compute late minutes
        const diffFromShift = Math.floor((checkInTime.getTime() - shiftStartTime.getTime()) / 60000);
        const lateMinutes = rec?.lateMinutes ?? (diffFromShift > graceMinutes ? diffFromShift - graceMinutes : 0);

        // Compute work duration
        let workDurationMinutes = rec?.workDurationMinutes ?? 0;
        if (!rec && checkOutTime) {
            const rawMins = Math.floor((checkOutTime.getTime() - checkInTime.getTime()) / 60000);
            workDurationMinutes = applyLunchDeduction(rawMins);
        } else if (!rec && !checkOutTime) {
            const now = nowPKT();
            const rawMins = Math.floor((now.getTime() - checkInTime.getTime()) / 60000);
            workDurationMinutes = Math.max(0, rawMins);
        }

        // Determine status
        let status = rec?.status || 'Incomplete';
        if (!rec) {
            if (checkOutTime) status = lateMinutes > 0 ? 'Late' : 'Present';
            else status = 'Incomplete';
        }

        // Resolve employee name
        let employeeName = `Not Linked (Pin: ${firstPunch.machineUserId})`;
        let avatar = undefined;

        const emp = empId ? idToEmp.get(empId) : pinToEmp.get(String(firstPunch.machineUserId));
        if (emp) {
            employeeName = `${(emp as any).firstName} ${(emp as any).lastName || ''}`.trim();
            avatar = (emp as any).avatar;
        }

        roster.push({
            employeeId: empId || `unlinked_${firstPunch.machineUserId}`,
            employeeName,
            avatar,
            location: firstPunch.location || location || 'ISB-Office',
            checkIn: checkInTime.toISOString(),
            checkOut: checkOutTime?.toISOString(),
            totalPunches: punches.length,
            workDurationMinutes,
            lateMinutes,
            status,
            verifyType: VERIFY_LABELS[firstPunch.verifyType] || 'Biometric',
        });
    }

    // Add employees who have NO PUNCHES (Absent / On Leave / Records with no punches)
    const allExpectedEmps = [...new Set([...activeEmpIds, ...recMap.keys()])];
    for (const empId of allExpectedEmps) {
        if (processedEmpIds.has(empId)) continue;

        const rec = recMap.get(empId) as any;
        const emp = idToEmp.get(empId);
        const name = emp ? `${(emp as any).firstName} ${(emp as any).lastName || ''}`.trim() : 'Unknown';

        roster.push({
            employeeId: empId,
            employeeName: name,
            avatar: emp?.avatar,
            location: rec?.location || location || 'ISB-Office',
            checkIn: rec?.checkIn?.toISOString?.() || rec?.checkIn,
            checkOut: rec?.checkOut?.toISOString?.() || rec?.checkOut,
            totalPunches: 0,
            workDurationMinutes: rec?.workDurationMinutes || 0,
            lateMinutes: rec?.lateMinutes || 0,
            status: rec?.status || (isWeekend(dateStr) ? 'Weekend' : 'Absent'),
        });
    }

    // Sort: Incomplete (still in) first, then by check-in time descending
    roster.sort((a, b) => {
        if (a.status === 'Incomplete' && b.status !== 'Incomplete') return -1;
        if (b.status === 'Incomplete' && a.status !== 'Incomplete') return 1;
        return new Date(b.checkIn || 0).getTime() - new Date(a.checkIn || 0).getTime();
    });

    return roster;
}

// ─── Dashboard Summary ────────────────────────────────────────────────────────

export async function getDashboardSummary(
    dateStr: string,
    location?: string,
    teamScope?: string[] | null
): Promise<DashboardSummary> {
    // Use the smart roster as the single source of truth for all counts
    const roster = await getTodayRoster(dateStr, location, teamScope);

    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalOnLeave = 0;
    let totalIncomplete = 0;
    let totalHalfDay = 0;
    let totalEarlyLeave = 0;
    let totalWorkMins = 0;
    let workCount = 0;

    for (const entry of roster) {
        if (entry.status === 'Present') totalPresent++;
        else if (entry.status === 'Late') totalLate++;
        else if (entry.status === 'Absent') totalAbsent++;
        else if (entry.status === 'On Leave') totalOnLeave++;
        else if (entry.status === 'Incomplete') totalIncomplete++;
        else if (entry.status === 'Half-Day') totalHalfDay++;
        else if (entry.status === 'Early Leave') totalEarlyLeave++;

        if (entry.checkIn) {
            totalWorkMins += entry.workDurationMinutes || 0;
            workCount++;
        }
    }

    const avgWorkMins = workCount > 0 ? Math.round(totalWorkMins / workCount) : 0;

    return {
        totalPresent,
        totalLate,
        totalAbsent,
        totalOnLeave,
        totalIncomplete,
        totalHalfDay,
        totalEarlyLeave,
        avgWorkMins,
    };
}

// ─── Weekly Trend ─────────────────────────────────────────────────────────────

export async function getWeeklyTrend(endDate: string, location?: string, teamScope?: string[] | null): Promise<WeeklyDay[]> {
    const activeFilter: any = location ? { 'jobInfo.workLocation': location } : {};
    if (teamScope) activeFilter.employeeId = { $in: teamScope };

    const activeCount = await repo.countActiveEmployees(activeFilter);
    const todayStr = todayPKT();
    
    // Calculate start date (6 days ago)
    const end = new Date(endDate + 'T00:00:00.000Z');
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 6);
    const startStr = start.toISOString().slice(0, 10);

    // Fetch all records for the week in a single batch
    const recordFilter: any = location ? { location } : {};
    if (teamScope) recordFilter.employeeId = { $in: teamScope };
    const allRecords = await repo.findRecordsForDateRange(startStr, endDate, recordFilter);
    
    // Group records by date
    const dateMap = new Map<string, any[]>();
    allRecords.forEach(r => {
        if (!dateMap.has(r.date)) dateMap.set(r.date, []);
        dateMap.get(r.date)!.push(r);
    });

    const days: WeeklyDay[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(endDate + 'T00:00:00.000Z');
        d.setUTCDate(d.getUTCDate() - i);
        const dStr = d.toISOString().slice(0, 10);
        
        const records = dateMap.get(dStr) || [];
        const present = records.filter((r) => ['Present', 'Late', 'Half-Day', 'Incomplete'].includes(r.status)).length;
        const late = records.filter((r) => r.lateMinutes > 0).length;
        const incomplete = records.filter((r) => r.status === 'Incomplete').length;

        let absent = records.filter((r) => r.status === 'Absent').length;
        if (absent === 0 && dStr === todayStr) {
            absent = Math.max(0, activeCount - present);
        }

        days.push({ date: dStr, present, late, absent, incomplete });
    }
    return days;
}

// ─── Paginated Records ────────────────────────────────────────────────────────

export async function getAttendanceRecords(
    filter: RecordFilter,
    page: number,
    limit: number
): Promise<RecordsPage> {
    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
        repo.findRecords(filter, skip, limit),
        repo.countRecords(filter),
    ]);

    // Hydrate employee names
    const empIds = [...new Set((records as any[]).map((r) => r.employeeId))];
    const employees = await repo.findEmployeesByIds(empIds);
    const empMap = new Map((employees as any[]).map((e) => [e.employeeId, e]));

    const data: AttendanceRecordDTO[] = (records as any[]).map((r) => {
        const emp = empMap.get(r.employeeId) as any;
        return {
            ...r,
            _id: r._id.toString(),
            employeeName: emp ? `${emp.firstName} ${emp.lastName || ''}`.trim() : r.employeeName || 'Unknown',
        };
    });

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

// ─── Daily Absenteeism (batch — no N+1) ──────────────────────────────────────

export async function processDailyAbsenteeism(dateStr: string): Promise<number> {
    try {
        const [activeEmployees, existingRecords] = await Promise.all([
            repo.findActiveEmployees(),
            repo.distinctRecordedIds(dateStr),
        ]);

        const existingSet = new Set(existingRecords);
        const missing = (activeEmployees as any[]).filter((e) => !existingSet.has(e.employeeId));
        if (missing.length === 0) return 0;

        for (const emp of missing) {
            await processEmployeePunches(emp.employeeId, dateStr, 'SYSTEM-TASK');
        }
        return missing.length;
    } catch (err) {
        logger.error('[AttendanceService] Error in absenteeism worker:', err);
        return 0;
    }
}

// ─── Auto-Close Incomplete (batch — no N+1) ───────────────────────────────────

export async function autoCloseIncompleteRecords(dateStr: string): Promise<AutoCloseResult> {
    // 1. Use the smart roster to find EVERYONE who is incomplete (punches OR records)
    const roster = await getTodayRoster(dateStr);
    const incomplete = roster.filter(r => r.status === 'Incomplete' && r.checkIn);

    if (incomplete.length === 0) return { processed: 0, skipped: 0, details: [] };

    // 2. Batch fetch configs/employees
    const uniqueLocations = [...new Set(incomplete.map(r => r.location).filter(Boolean))];
    const locationConfigs = await repo.findLocationConfigs(uniqueLocations) as any[];
    const configMap = new Map(locationConfigs.map(c => [c.locationName, c]));

    const uniqueEmpIds = [...new Set(incomplete.map(r => r.employeeId))];
    const employees = await Promise.all(uniqueEmpIds.map(id => repo.findEmployeeWithShift(id)));
    const empMap = new Map(employees.filter(Boolean).map((e: any) => [e.employeeId, e]));

    let processed = 0, skipped = 0;
    const details: AutoCloseResult['details'] = [];

    for (const entry of incomplete) {
        const checkInTime = new Date(entry.checkIn!);
        const deviceConfig = configMap.get(entry.location);
        const employee = empMap.get(entry.employeeId);
        const cfg = repo.resolveShiftConfig(employee, deviceConfig);

        const autoCheckOut = pktHHMMtoUtc(dateStr, cfg.shiftEnd);
        // If they checked in AFTER the shift end, give them 30 mins, otherwise use shift end
        const effectiveCheckOut = autoCheckOut > checkInTime
            ? autoCheckOut
            : new Date(checkInTime.getTime() + 30 * 60000);

        const rawMins = Math.floor((effectiveCheckOut.getTime() - checkInTime.getTime()) / 60000);
        const workDurationMinutes = applyLunchDeduction(rawMins);

        const shiftStartTime = pktHHMMtoUtc(dateStr, cfg.shiftStart);
        const shiftEndTime = pktHHMMtoUtc(dateStr, cfg.shiftEnd);
        const diffMins = Math.floor((checkInTime.getTime() - shiftStartTime.getTime()) / 60000);
        const lateMinutes = diffMins > cfg.graceMinutes ? diffMins - cfg.graceMinutes : 0;
        
        const earlyDiff = Math.floor((shiftEndTime.getTime() - effectiveCheckOut.getTime()) / 60000);
        const isEarlyLeave = earlyDiff > 10;

        const status = computeStatus(workDurationMinutes, lateMinutes, isEarlyLeave, true, cfg.halfDayThresholdHours);
        const checkOutStr = toPKTTimeString(effectiveCheckOut);

        // Upsert the record (create if missing, update if exists)
        await repo.upsertRecord(entry.employeeId, dateStr, {
            checkIn: checkInTime,
            checkOut: effectiveCheckOut,
            workDurationMinutes,
            status,
            lateMinutes,
            note: `Auto-closed: assumed ${checkOutStr}`,
            location: entry.location,
            manuallyAdjusted: false
        });

        processed++;
        details.push({ employeeId: entry.employeeId, autoCheckOut: checkOutStr, status });
    }

    return { processed, skipped, details };
}

// ─── Sync from Machine Report (batch — no N+1) ───────────────────────────────

export async function syncFromMachineReport(dateStr: string): Promise<number> {
    try {
        const report = await fetchReport(dateStr, dateStr);
        if (report.length === 0) return 0;

        // Batch-fetch holidays and leaves ONCE before the loop
        const uniquePins = [...new Set(report.map((r) => r.emp_code))];
        const matchedEmployees = await repo.findEmployeesByPins(uniquePins) as any[];
        const pinToId = new Map(matchedEmployees.map((e) => [e.biometricPin, e.employeeId]));

        // Use first employee's location as a heuristic for holiday lookup if not specified
        const primaryLocation = matchedEmployees[0]?.jobInfo?.workLocation;
        const holiday = await repo.findHolidayForDate(dateStr, primaryLocation);
        
        const hrmIds = [...pinToId.values()];
        const leaveMap = await repo.findApprovedLeavesForDate(dateStr, hrmIds);
        const weekend = isWeekend(dateStr);

        const upsertPromises = report.map(async (entry) => {
            const hrmEmpId = pinToId.get(entry.emp_code);
            if (!hrmEmpId) return null;

            const leaveType = leaveMap.get(hrmEmpId) ?? null;
            let status: AttendanceStatus;
            let note = entry.status;

            if (holiday) { status = 'Holiday'; note = holiday; }
            else if (leaveType) { status = 'On Leave'; note = leaveType; }
            else if (entry.status === 'Absent' && weekend) { status = 'Weekend'; note = 'Weekend'; }
            else {
                if (entry.status === 'Present') status = 'Present';
                else if (entry.status === 'Absent') status = 'Absent';
                else if (entry.status === 'Late') status = 'Late';
                else if (entry.status.includes('Early')) status = 'Half-Day';
                else status = 'Present';
            }

            let workMins = 0;
            if (entry.work_time) {
                const [h, m] = entry.work_time.split(':').map(Number);
                workMins = (h || 0) * 60 + (m || 0);
            }

            return repo.upsertRecord(hrmEmpId, dateStr, {
                status, workDurationMinutes: workMins, note: note || undefined,
                checkIn: entry.clock_in ? pktHHMMtoUtc(dateStr, entry.clock_in) : undefined,
                checkOut: entry.clock_out ? pktHHMMtoUtc(dateStr, entry.clock_out) : undefined,
                manuallyAdjusted: false,
            });
        });

        const results = await Promise.all(upsertPromises);
        return results.filter(Boolean).length;
    } catch (err) {
        logger.error('[AttendanceService] Error syncing from machine report:', err);
        return 0;
    }
}

// ─── Employee Monthly Details ────────────────────────────────────────────────

export async function getEmployeeMonthlyAttendance(
    employeeId: string,
    monthStr: string // YYYY-MM
): Promise<import('./attendance.types').EmployeeMonthlyDetail> {
    const start = `${monthStr}-01`;
    const [year, month] = monthStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const [employee, records] = await Promise.all([
        repo.findEmployeeById(employeeId),
        repo.findRecords({ employeeId, date: { from: start, to: end } }, 0, 100),
    ]);

    if (!employee) throw new Error('Employee not found');

    const summary = {
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
        totalWorkMins: 0,
    };

    const days: import('./attendance.types').MonthlyDayEntry[] = (records as any[]).map(r => {
        if (['Present', 'Late', 'Half-Day'].includes(r.status)) {
            summary.presentDays++;
            if (r.lateMinutes > 0) summary.lateDays++;
        } else if (r.status === 'Absent') {
            summary.absentDays++;
        }
        summary.totalWorkMins += r.workDurationMinutes || 0;

        return {
            date: r.date,
            checkIn: r.checkIn?.toISOString(),
            checkOut: r.checkOut?.toISOString(),
            workDurationMinutes: r.workDurationMinutes,
            lateMinutes: r.lateMinutes,
            status: r.status,
            note: r.note
        };
    });

    const hours = Math.floor(summary.totalWorkMins / 60);
    const mins = summary.totalWorkMins % 60;
    const avgMins = summary.presentDays > 0 ? Math.round(summary.totalWorkMins / summary.presentDays) : 0;

    return {
        employeeId,
        employeeName: `${(employee as any).firstName} ${(employee as any).lastName || ''}`.trim(),
        month: monthStr,
        summary: {
            presentDays: summary.presentDays,
            lateDays: summary.lateDays,
            absentDays: summary.absentDays,
            totalWorkHours: `${hours}h ${mins}m`,
            avgWorkHours: `${Math.floor(avgMins / 60)}h ${avgMins % 60}m`
        },
        days: days.sort((a, b) => b.date.localeCompare(a.date))
    };
}

/**
 * Escape CSV fields by doubling any double quotes and wrapping in double quotes.
 */
function escapeCsvField(value: any): string {
    const str = (value === null || value === undefined) ? '' : String(value);
    return `"${str.replace(/"/g, '""')}"`;
}

export async function generateMonthlyCSV(monthStr: string, employeeId?: string): Promise<string> {
    const start = `${monthStr}-01`;
    const [year, month] = monthStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    let records: any[] = [];
    let employees: any[] = [];

    if (employeeId) {
        const [emp, recs] = await Promise.all([
            repo.findEmployeeById(employeeId),
            repo.findRecords({ employeeId, date: { from: start, to: end } }, 0, 1000)
        ]);
        if (!emp) throw new Error('Employee not found');
        employees = [emp];
        records = recs;
    } else {
        // Fetch employees and records with pagination to avoid truncation
        const activeEmps = await repo.findActiveEmployees();
        employees = activeEmps;
        
        let allRecs: any[] = [];
        let skip = 0;
        const limit = 5000;
        
        while (true) {
            const batch = await repo.findRecords({ date: { from: start, to: end } }, skip, limit);
            if (batch.length === 0) break;
            allRecs = allRecs.concat(batch);
            skip += limit;
            if (batch.length < limit) break;
        }
        records = allRecs;
    }

    const headers = ['Employee ID', 'Name', 'Date', 'Day', 'Status', 'Check In', 'Check Out', 'Work Hours', 'Late Mins'];
    const rows = [headers.join(',')];

    // Map records for fast lookup
    const recordMap = new Map<string, any>();
    records.forEach(r => recordMap.set(`${r.employeeId}_${r.date}`, r));

    for (const emp of employees) {
        for (let day = 1; day <= lastDay; day++) {
            const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
            const record = recordMap.get(`${emp.employeeId}_${dateStr}`);
            
            const dateObj = new Date(dateStr);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

            const checkIn = record?.checkIn ? new Date(record.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' }) : '';
            const checkOut = record?.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' }) : '';
            const workHrs = record?.workDurationMinutes ? (record.workDurationMinutes / 60).toFixed(2) : '0';
            const status = record?.status || (isWeekend(dateStr) ? 'Weekend' : 'Absent');

            const row = [
                escapeCsvField(emp.employeeId),
                escapeCsvField(`${emp.firstName} ${emp.lastName || ''}`),
                escapeCsvField(dateStr),
                escapeCsvField(dayName),
                escapeCsvField(status),
                escapeCsvField(checkIn),
                escapeCsvField(checkOut),
                escapeCsvField(workHrs),
                escapeCsvField(record?.lateMinutes || 0)
            ];
            rows.push(row.join(','));
        }
    }

    return rows.join('\n');
}

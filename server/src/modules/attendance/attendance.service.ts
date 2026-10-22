import * as repo from './attendance.repository';
import { fetchReport, fetchTransactionsForRange } from '../../services/zktCloudService';
import logger from '../../utils/logger';
import { sendAutoCloseAlertEmail } from '../../utils/email';
import {
    pktHHMMtoUtc, isWeekend, applyLunchDeduction,
    isValidCheckout, toPKTTimeString, startOfDay, endOfDay,
    deduplicatePunches, normalizeBiometricPin, matchShiftPunches,
    pktDateTimeToUtc
} from '../../shared/utils/dateUtils';
import type {
    ShiftConfig, DashboardSummary, RecordsPage,
    RecordFilter, AttendanceRecordDTO, WeeklyDay, AutoCloseResult
} from './attendance.types';
import AttendanceRecord, { AttendanceStatus } from '../../models/AttendanceRecord';
import AttendancePunch from '../../models/AttendancePunch';
import Employee from '../../models/Employee';
import '../../models/WorkShift';
import { formatEmployeeFullName } from '../../utils/nameHelper';

// ─── Shift Logic ──────────────────────────────────────────────────────────────

function computeStatus(
    lateMinutes: number,
    isEarlyLeave: boolean,
    hasCheckout: boolean,
    diffMins?: number
): AttendanceStatus {
    if (!hasCheckout) return 'Incomplete';
    if (diffMins !== undefined) {
        if (diffMins > 60) return 'Half-Day';
        if (diffMins > 30) return 'Late';
    }
    if (isEarlyLeave) return 'Early Leave';
    return 'Present';
}

// ─── Core Punch Processor ─────────────────────────────────────────────────────

export async function processEmployeePunches(
    employeeId: string,
    dateStr: string,
    deviceSN: string
): Promise<void> {
    try {
        let resolvedEmployeeId = employeeId;
        if (employeeId && employeeId.length === 24) {
            const emp = await repo.findEmployeeByUserId(employeeId);
            if (emp) resolvedEmployeeId = emp.employeeId;
        }

        const [deviceConfig, employee] = await Promise.all([
            repo.findDeviceConfig(deviceSN),
            repo.findEmployeeWithShift(resolvedEmployeeId),
        ]);

        const cfg: ShiftConfig = repo.resolveShiftConfig(employee, deviceConfig);
        const isOvernight = !!cfg.isOvernight;
        const punches = await repo.findPunchesForDay(resolvedEmployeeId, dateStr, isOvernight);

        // ── No punches: classify as Absent / On Leave / Holiday / Weekend ──
        if (punches.length === 0) {
            const [holidayName, leaveMap] = await Promise.all([
                repo.findHolidayForDate(dateStr, cfg.locationName),
                repo.findApprovedLeavesForDate(dateStr, [resolvedEmployeeId]),
            ]);
            const leaveType = leaveMap.get(resolvedEmployeeId) ?? null;
            const weekend = isWeekend(dateStr);
            const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
            const isFuture = dateStr > todayStr;

            // Upcoming dates with no punches and no approved leave or holiday:
            // Never mark as Absent! Clean up any system-generated placeholder record.
            if (isFuture && !leaveType && !holidayName && !weekend) {
                await AttendanceRecord.deleteOne({
                    employeeId: resolvedEmployeeId,
                    date: dateStr,
                    manuallyAdjusted: { $ne: true }
                });
                return;
            }

            let status: AttendanceStatus = isFuture ? 'N/A' : 'Absent';
            if (holidayName) status = 'Holiday';
            else if (leaveType) status = 'On Leave';
            else if (weekend) status = 'Weekend';

            await repo.upsertRecord(resolvedEmployeeId, dateStr, {
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

        // ── Has punches: compute check-in, check-out, durations using matchShiftPunches ──
        const rawPunchTimes = (punches as any[]).map((p) => new Date(p.punchTime));
        const matched = matchShiftPunches(rawPunchTimes, dateStr, cfg);

        const checkIn = matched.checkIn;
        const checkOut = matched.checkOut;
        const lateMinutes = matched.lateMinutes;
        const workDurationMinutes = matched.workDurationMinutes;
        const overtimeMinutes = matched.overtimeMinutes;
        const isEarlyLeave = matched.isEarlyLeave;

        const leaveMap = await repo.findApprovedLeavesForDate(dateStr, [resolvedEmployeeId]);
        const leaveType = leaveMap.get(resolvedEmployeeId) ?? null;

        const shiftStartTime = pktHHMMtoUtc(dateStr, cfg.shiftStart);
        let shiftEndTime = pktHHMMtoUtc(dateStr, cfg.shiftEnd);
        if (isOvernight) {
            shiftEndTime = new Date(shiftEndTime.getTime() + 24 * 60 * 60 * 1000);
        }

        const diffFromShift = checkIn ? Math.floor((checkIn.getTime() - shiftStartTime.getTime()) / 60000) : 0;

        let status: AttendanceStatus;
        let note: string | undefined = undefined;

        if (leaveType) {
            status = 'On Leave';
            note = leaveType;
        } else if (!checkIn) {
            // Employee only punched off-shift (e.g. 12 AM midnight for morning shift), absent during real shift
            status = 'Absent';
            note = matched.offShiftPunches.length > 0
                ? `Off-shift punch at ${toPKTTimeString(matched.offShiftPunches[0])}, absent during shift`
                : 'Absent';
        } else if (diffFromShift > cfg.graceMinutes) {
            const monthStart = `${dateStr.slice(0, 7)}-01`;
            const priorLate = await AttendanceRecord.findOne({
                employeeId: resolvedEmployeeId,
                date: { $gte: monthStart, $lt: dateStr },
                $or: [
                    { status: 'Late' },
                    { note: { $regex: /First Late Exemption/i } }
                ]
            }).lean();

            if (!priorLate) {
                status = 'Present';
                note = 'First Late Exemption';
            } else {
                status = 'Late';
                note = diffFromShift > 60
                    ? 'Arrived >1 hour late (Full day salary & leave cut per HR Policy)'
                    : 'Arrived late (Half day salary & leave cut per HR Policy)';
            }
        } else if (!checkOut) {
            status = 'Incomplete';
        } else if (workDurationMinutes < (cfg.halfDayThresholdHours || 4) * 60 && checkOut) {
            status = 'Half-Day';
            note = 'Worked less than half-day threshold (Half day salary & leave cut per HR Policy)';
        } else if (isEarlyLeave) {
            status = 'Early Leave';
            note = 'Early departure (Half day salary & leave cut per HR Policy)';
        } else {
            status = 'Present';
        }

        const finalLateMinutes = status === 'Present' ? 0 : lateMinutes;

        await repo.upsertRecord(resolvedEmployeeId, dateStr, {
            location: cfg.locationName,
            checkIn,
            checkOut,
            shiftStart: cfg.shiftStart,
            shiftEnd: cfg.shiftEnd,
            workDurationMinutes,
            status,
            lateMinutes: finalLateMinutes,
            overtimeMinutes,
            leaveType: leaveType ?? undefined,
            isHalfDay: status === 'Half-Day',
            note,
            allPunches: matched.allPunches,
        });

        await repo.markPunchesProcessed(resolvedEmployeeId, dateStr, isOvernight);
    } catch (err) {
        logger.error(`[AttendanceService] Error processing ${employeeId} on ${dateStr}:`, err);
        throw err; // Re-throw to allow caller to handle failure
    }
}

// ─── Today Roster (smart first-in / last-out per employee) ─────────────────

const VERIFY_LABELS: Record<number, string> = {
    0: 'Password', 1: 'Fingerprint', 3: 'Card', 4: 'Face', 5: 'Dashboard', 15: 'Face',
};

export async function getTodayRoster(
    dateStr: string,
    location?: string,
    teamScope?: string[] | null
): Promise<import('./attendance.types').TodayRosterEntry[]> {
    // 1. Fetch ALL punches for the day in one query (extended to 36 hours to cover overnight shifts)
    const punchFilter: Record<string, any> = {
        punchTime: { $gte: startOfDay(dateStr), $lte: new Date(startOfDay(dateStr).getTime() + 36 * 3600 * 1000) },
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

    const punchMap = new Map<string, any[]>();
    for (const p of allPunches) {
        const empId = p.employeeId;
        // Never group or display punches for unmapped / non-employees
        if (!empId || empId.startsWith('unlinked_')) continue;
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
    
    const [pinEmployees, idEmployees, allDevices] = await Promise.all([
        allPins.length > 0 ? repo.findEmployeesByPins(allPins) : Promise.resolve([]),
        repo.findEmployeesByIds([...new Set([...allEmpIds, ...activeEmpIds])]),
        repo.findAllDevices(),
    ]);

    // Build device SN to location map
    const snToLoc = new Map((allDevices as any[]).map(d => [d.deviceSN, d.locationName]));

    // Composite key for pin resolution: location_pin
    const pinToEmp = new Map((pinEmployees as any[]).map(e => [`${e.jobInfo?.workLocation}_${e.biometricPin}`, e]));
    const idToEmp = new Map((idEmployees as any[]).map(e => [e.employeeId, e]));

    // 5. Resolve location configs once and evaluate timing per employee shift
    const inferredLocations = [...new Set(
        allPunches.map((p: any) => snToLoc.get(p.deviceSN) || p.location || location || 'ISB-Office')
    )];
    const locationConfigs = await repo.findLocationConfigs(inferredLocations as string[]) as any[];
    const locationCfgMap = new Map(locationConfigs.map((cfg: any) => [cfg.locationName, cfg]));

    // 6. Build roster entries
    const roster: import('./attendance.types').TodayRosterEntry[] = [];
    const processedEmpIds = new Set<string>();

    for (const [empId, punches] of punchMap.entries()) {
        // Sort punches chronologically
        punches.sort((a: any, b: any) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime());

        const firstPunch = punches[0];
        const punchLoc = snToLoc.get(firstPunch.deviceSN) || firstPunch.location || location || 'ISB-Office';
        const deviceConfig = locationCfgMap.get(punchLoc);

        const emp = idToEmp.get(empId);
        // Never show punches for non-employees / unmapped PINs on the portal
        if (!emp) continue;

        const cfg = repo.resolveShiftConfig(emp, deviceConfig);
        const isOvernight = !!cfg.isOvernight;

        // Use matchShiftPunches to select correct shift check-in and check-out
        const matched = matchShiftPunches(
            punches.map((p: any) => new Date(p.punchTime)),
            dateStr,
            cfg
        );

        // Use existing processed record if available
        const rec = empId ? recMap.get(empId) as any : null;
        const checkInTime: Date | null = rec?.checkIn ? new Date(rec.checkIn) : (matched.checkIn || null);
        let checkOutTime: Date | null = rec?.checkOut ? new Date(rec.checkOut) : (matched.checkOut || null);

        // A punch cannot be its own checkout; checkout must be at least 15 minutes after check-in
        if (checkInTime && checkOutTime && Math.abs(checkOutTime.getTime() - checkInTime.getTime()) < 15 * 60 * 1000) {
            checkOutTime = null;
        }

        if (!checkInTime && !rec?.checkIn) {
            // No valid shift check-in (e.g. only off-shift morning checkout punch for overnight worker)
            // Do NOT mark as processed; let loop 2 add them as scheduled/unpunched
            continue;
        }

        if (empId) processedEmpIds.add(empId);

        const shiftStartTime = pktHHMMtoUtc(dateStr, cfg.shiftStart);
        let shiftEndTime = pktHHMMtoUtc(dateStr, cfg.shiftEnd);
        if (isOvernight) {
            shiftEndTime = new Date(shiftEndTime.getTime() + 24 * 60 * 60 * 1000);
        }

        // Compute late minutes
        const diffFromShift = checkInTime ? Math.floor((checkInTime.getTime() - shiftStartTime.getTime()) / 60000) : 0;
        const lateMinutes = rec?.manuallyAdjusted
            ? (rec.lateMinutes ?? 0)
            : (rec?.lateMinutes ?? (diffFromShift > cfg.graceMinutes ? diffFromShift - cfg.graceMinutes : 0));

        // Compute work duration
        let workDurationMinutes = rec?.workDurationMinutes ?? matched.workDurationMinutes;
        if (!rec && checkInTime && !checkOutTime) {
            const now = new Date();
            const rawMins = Math.floor((now.getTime() - checkInTime.getTime()) / 60000);
            workDurationMinutes = Math.max(0, rawMins);
        }

        // Determine status
        let status = rec?.status || 'Incomplete';
        let note = rec?.note;
        if (!rec || status === 'Incomplete') {
            if (diffFromShift > cfg.graceMinutes) {
                const monthStart = `${dateStr.slice(0, 7)}-01`;
                const priorLate = await AttendanceRecord.findOne({
                    employeeId: emp.employeeId,
                    date: { $gte: monthStart, $lt: dateStr },
                    $or: [
                        { status: 'Late' },
                        { note: { $regex: /First Late Exemption/i } }
                    ]
                }).lean();

                if (!priorLate) {
                    status = 'Present';
                    note = 'First Late Exemption';
                } else {
                    status = 'Late';
                    note = diffFromShift > 60
                        ? 'Arrived >1 hour late (Full day salary & leave cut per HR Policy)'
                        : 'Arrived late (Half day salary & leave cut per HR Policy)';
                }
            } else if (checkOutTime) {
                const earlyDiff = Math.floor((shiftEndTime.getTime() - checkOutTime.getTime()) / 60000);
                const isEarlyLeave = earlyDiff > 10;
                status = isEarlyLeave ? 'Early Leave' : 'Present';
                if (isEarlyLeave) {
                    note = 'Early departure (Half day salary & leave cut per HR Policy)';
                }
            } else {
                status = 'Incomplete';
            }
        }

        // Resolve employee name
        let employeeName = `Not Linked (Pin: ${firstPunch.machineUserId})`;
        let avatar = undefined;

        if (emp) {
            employeeName = `${(emp as any).firstName} ${(emp as any).lastName || ''}`.trim();
            avatar = (emp as any).avatar;
        }

        const isNonWorking = ['Absent', 'On Leave', 'Holiday', 'Weekend', 'N/A'].includes(status);

        roster.push({
            employeeId: emp.employeeId,
            employeeName,
            avatar,
            location: punchLoc,
            checkIn: isNonWorking ? undefined : checkInTime?.toISOString(),
            checkOut: isNonWorking ? undefined : checkOutTime?.toISOString(),
            totalPunches: isNonWorking ? 0 : punches.length,
            workDurationMinutes: isNonWorking ? 0 : workDurationMinutes,
            lateMinutes: isNonWorking ? 0 : lateMinutes,
            status,
            verifyType: firstPunch.deviceSN === 'WEB-PORTAL' ? 'Dashboard' : (VERIFY_LABELS[firstPunch.verifyType] || 'Biometric'),
            note: note || rec?.note,
            isWfh: isNonWorking ? false : (Boolean(rec?.isWfh) || /wfh|work from home/i.test(rec?.note || '')),
        });
    }

    // Add employees who have NO PUNCHES (Absent / On Leave / Records with no punches / Scheduled)
    const allExpectedEmps = [...new Set([...activeEmpIds, ...recMap.keys()])];
    const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const now = new Date();

    for (const empId of allExpectedEmps) {
        if (processedEmpIds.has(empId)) continue;

        const rec = recMap.get(empId) as any;
        const emp = idToEmp.get(empId);
        const name = emp ? `${(emp as any).firstName} ${(emp as any).lastName || ''}`.trim() : 'Unknown';

        // Resolve shift config to know when shift starts
        const shiftCfg = repo.resolveShiftConfig(emp, null);
        const shiftStartTime = pktHHMMtoUtc(dateStr, shiftCfg.shiftStart);
        const shiftNotStartedYet = isToday && now.getTime() < shiftStartTime.getTime();

        let effectiveStatus = rec?.status;
        if (!effectiveStatus) {
            if (isWeekend(dateStr)) effectiveStatus = 'Weekend';
            else if (isFuture || shiftNotStartedYet) effectiveStatus = 'N/A';
            else effectiveStatus = 'Absent';
        }

        const isNonWorking = ['Absent', 'On Leave', 'Holiday', 'Weekend', 'N/A'].includes(effectiveStatus);

        let unpunchedLateMins = rec?.lateMinutes || 0;
        if (!rec?.manuallyAdjusted && rec?.checkIn) {
            const shiftStartTime = pktHHMMtoUtc(dateStr, rec?.shiftStart || '09:00');
            const diffFromShift = Math.floor((new Date(rec.checkIn).getTime() - shiftStartTime.getTime()) / 60000);
            unpunchedLateMins = diffFromShift > 30 ? diffFromShift - 30 : 0;
        }

        let note = rec?.note;
        if (!note && shiftNotStartedYet) {
            note = `Shift: ${shiftCfg.shiftStart} - ${shiftCfg.shiftEnd}`;
        }

        roster.push({
            employeeId: empId,
            employeeName: name,
            avatar: emp?.avatar,
            location: rec?.location || location || 'ISB-Office',
            checkIn: isNonWorking ? undefined : (rec?.checkIn?.toISOString?.() || rec?.checkIn),
            checkOut: isNonWorking ? undefined : (rec?.checkOut?.toISOString?.() || rec?.checkOut),
            totalPunches: isNonWorking ? 0 : (rec?.allPunches?.length || 0),
            workDurationMinutes: isNonWorking ? 0 : (rec?.workDurationMinutes || 0),
            lateMinutes: isNonWorking ? 0 : unpunchedLateMins,
            status: effectiveStatus,
            note,
            isWfh: isNonWorking ? false : (Boolean(rec?.isWfh) || /wfh|work from home/i.test(rec?.note || '')),
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
        else if (entry.status === 'Absent') totalAbsent++;
        else if (entry.status === 'On Leave') totalOnLeave++;
        else if (entry.status === 'Incomplete') totalIncomplete++;
        else if (entry.status === 'Half-Day') totalHalfDay++;
        else if (entry.status === 'Early Leave') totalEarlyLeave++;

        // Late is treated as a violation flag after finalized checkout,
        // so HR can see late arrivals even when primary status is Early Leave.
        if (entry.status !== 'Incomplete' && (entry.lateMinutes || 0) > 0) totalLate++;

        if (entry.checkIn && !['Absent', 'On Leave', 'Holiday', 'Weekend'].includes(entry.status)) {
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
    const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    
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
            employeeName: emp ? formatEmployeeFullName(emp, r.employeeName || 'Unknown') : (r.employeeName || 'Unknown'),
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

    const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

    for (const entry of incomplete) {
        const checkInTime = new Date(entry.checkIn!);
        const deviceConfig = configMap.get(entry.location);
        const employee = empMap.get(entry.employeeId);
        const cfg = repo.resolveShiftConfig(employee, deviceConfig);
        const isOvernight = !!cfg.isOvernight;

        let autoCheckOut = pktHHMMtoUtc(dateStr, cfg.shiftEnd);
        if (isOvernight) {
            autoCheckOut = new Date(autoCheckOut.getTime() + 24 * 60 * 60 * 1000);
        }

        // If current time is still before the shift end time + buffer (60 mins), skip (employee may still be working or about to clock out)
        const now = new Date();
        if (now.getTime() < autoCheckOut.getTime() + 60 * 60 * 1000) {
            skipped++;
            continue;
        }
        // If they checked in AFTER the shift end, give them 30 mins, otherwise use shift end
        const effectiveCheckOut = autoCheckOut > checkInTime
            ? autoCheckOut
            : new Date(checkInTime.getTime() + 30 * 60000);

        const rawMins = Math.floor((effectiveCheckOut.getTime() - checkInTime.getTime()) / 60000);
        const workDurationMinutes = applyLunchDeduction(rawMins, cfg);

        const shiftStartTime = pktHHMMtoUtc(dateStr, cfg.shiftStart);
        let shiftEndTime = pktHHMMtoUtc(dateStr, cfg.shiftEnd);
        if (isOvernight) {
            shiftEndTime = new Date(shiftEndTime.getTime() + 24 * 60 * 60 * 1000);
        }
        const diffMins = Math.floor((checkInTime.getTime() - shiftStartTime.getTime()) / 60000);
        const lateMinutes = diffMins > cfg.graceMinutes ? diffMins - cfg.graceMinutes : 0;
        
        const earlyDiff = Math.floor((shiftEndTime.getTime() - effectiveCheckOut.getTime()) / 60000);
        const isEarlyLeave = earlyDiff > 10;

        const status = computeStatus(lateMinutes, isEarlyLeave, true);
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

        // Trigger email notification asynchronously
        if (employee) {
            const empEmail = employee.workEmail || employee.email;
            if (empEmail) {
                sendAutoCloseAlertEmail(
                    empEmail,
                    employee.firstName,
                    dateStr,
                    checkOutStr
                ).catch(err => {
                    logger.error(`[AutoClose Alert] Failed to send email to ${empEmail}:`, err);
                });
            }
        }

        processed++;
        details.push({ employeeId: entry.employeeId, autoCheckOut: checkOutStr, status });
    }

    return { processed, skipped, details };
}

// ─── Sync from Machine Report (batch — no N+1) ───────────────────────────────

export async function syncFromMachineReport(dateStr: string): Promise<number> {
    try {
        const nextDate = new Date(`${dateStr}T12:00:00.000Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        const nextDateStr = nextDate.toISOString().slice(0, 10);

        const startRange = `${dateStr} 00:00:00`;
        const endRange = `${nextDateStr} 12:00:00`;

        // 1. Pull ALL raw machine punches for this date range directly from BioTime
        const txns = await fetchTransactionsForRange(startRange, endRange).catch((err) => {
            logger.error('[AttendanceService] fetchTransactionsForRange error:', err);
            return [];
        });

        // 2. Fetch all active employees to map machine PINs to HRM employees
        const allEmployees = await Employee.find(
            { 'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] } },
            { employeeId: 1, biometricPin: 1, firstName: 1, lastName: 1, 'jobInfo.shift': 1, 'jobInfo.workLocation': 1 }
        ).populate('jobInfo.shift').lean() as any[];

        const pinToEmp = new Map<string, any>();
        for (const e of allEmployees) {
            if (e.biometricPin) {
                const raw = String(e.biometricPin).trim();
                const norm = raw.replace(/^0+/, '') || raw;
                pinToEmp.set(raw, e);
                pinToEmp.set(norm, e);
            }
        }

        const affectedEmps = new Set<string>();

        // 3. Ingest raw punches into AttendancePunch
        for (const txn of txns) {
            const punchTime = pktDateTimeToUtc(txn.punch_time);
            if (isNaN(punchTime.getTime())) continue;

            const rawCode = String(txn.emp_code).trim();
            const normCode = rawCode.replace(/^0+/, '') || rawCode;
            const matchedEmp = pinToEmp.get(rawCode) || pinToEmp.get(normCode);

            const hrmEmpId = matchedEmp ? matchedEmp.employeeId : `unlinked_${rawCode}`;
            const empName = matchedEmp
                ? `${matchedEmp.firstName} ${matchedEmp.lastName || ''}`.trim()
                : (txn.first_name || `PIN ${rawCode}`);

            let punchStatus = parseInt(txn.punch_state ?? '0', 10);
            if (punchStatus === 255) punchStatus = 0;

            const sn = txn.terminal_sn ?? 'ZKT_CLOUD';

            await AttendancePunch.findOneAndUpdate(
                { deviceSN: sn, machineUserId: txn.emp_code, punchTime },
                {
                    $setOnInsert: {
                        machineUserId: txn.emp_code,
                        employeeId: hrmEmpId,
                        employeeName: empName,
                        punchTime,
                        punchStatus,
                        verifyType: txn.verify_type ?? 15,
                        deviceSN: sn,
                        location: txn.area_alias ?? 'ISB-Office',
                        processed: false,
                    }
                },
                { upsert: true, new: false }
            );

            if (matchedEmp) {
                affectedEmps.add(matchedEmp.employeeId);
            }
        }

        // 4. Reprocess punches for all affected employees on dateStr
        for (const empId of affectedEmps) {
            await processEmployeePunches(empId, dateStr, 'ZKT_CLOUD').catch((err) => {
                logger.error(`[AttendanceService] Error processing punches for ${empId}:`, err);
            });
        }

        logger.info(`[AttendanceService] Synced ${txns.length} raw punches across ${affectedEmps.size} employees for ${dateStr}`);
        return affectedEmps.size;
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

    const recordMap = new Map<string, any>();
    (records as any[]).forEach(r => recordMap.set(r.date, r));

    const days: import('./attendance.types').MonthlyDayEntry[] = [];

    // Construct entries for every single day of the month
    for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
        const r = recordMap.get(dateStr);

        if (r) {
            const isNonWorking = ['Absent', 'On Leave', 'Holiday', 'Weekend', 'N/A'].includes(r.status);

            if (['Present', 'Late', 'Half-Day'].includes(r.status)) {
                summary.presentDays++;
                if (r.lateMinutes > 0) summary.lateDays++;
            } else if (r.status === 'Absent') {
                const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
                if (dateStr <= todayStr) {
                    summary.absentDays++;
                }
            }

            // Only count work duration towards monthly total for working days
            if (!isNonWorking) {
                summary.totalWorkMins += r.workDurationMinutes || 0;
            }

            days.push({
                date: r.date,
                checkIn: isNonWorking ? undefined : (r.checkIn ? (typeof r.checkIn === 'string' ? r.checkIn : r.checkIn.toISOString()) : undefined),
                checkOut: isNonWorking ? undefined : (r.checkOut ? (typeof r.checkOut === 'string' ? r.checkOut : r.checkOut.toISOString()) : undefined),
                workDurationMinutes: isNonWorking ? 0 : (r.workDurationMinutes || 0),
                lateMinutes: isNonWorking ? 0 : (r.lateMinutes || 0),
                status: r.status,
                note: r.note,
                isWfh: isNonWorking ? false : (Boolean(r.isWfh) || /wfh|work from home/i.test(r.note || '')),
            });
        } else {
            const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
            const isFuture = dateStr > todayStr;
            const weekend = isWeekend(dateStr);
            const defaultStatus = weekend ? 'Weekend' : 'N/A';
            days.push({
                date: dateStr,
                checkIn: undefined,
                checkOut: undefined,
                workDurationMinutes: 0,
                lateMinutes: 0,
                status: defaultStatus as any,
                note: weekend ? undefined : (isFuture ? undefined : 'No Punch')
            });
        }
    }

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

function buildAttendanceExportCsv(employees: any[], records: any[], dates: string[]): string {
    const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    const headers = ['Employee ID', 'Name', 'Date', 'Day', 'Status', 'Check In', 'Check Out', 'Work Hours', 'Late Mins'];
    const rows = [headers.join(',')];

    const recordMap = new Map<string, any>();
    records.forEach(r => recordMap.set(`${r.employeeId}_${r.date}`, r));

    for (const emp of employees) {
        for (const dateStr of dates) {
            const record = recordMap.get(`${emp.employeeId}_${dateStr}`);
            const dateObj = new Date(dateStr);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const isFuture = dateStr > todayStr;
            const status = record?.status || (isWeekend(dateStr) ? 'Weekend' : (isFuture ? 'N/A' : 'Absent'));
            const isNonWorking = ['Absent', 'On Leave', 'Holiday', 'Weekend', 'N/A'].includes(status);
            const checkIn = !isNonWorking && record?.checkIn ? new Date(record.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' }) : '';
            const checkOut = !isNonWorking && record?.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' }) : '';
            const workHrs = !isNonWorking && record?.workDurationMinutes ? (record.workDurationMinutes / 60).toFixed(2) : '0';

            rows.push([
                escapeCsvField(emp.employeeId),
                escapeCsvField(formatEmployeeFullName(emp, emp.employeeId)),
                escapeCsvField(dateStr),
                escapeCsvField(dayName),
                escapeCsvField(status),
                escapeCsvField(checkIn),
                escapeCsvField(checkOut),
                escapeCsvField(workHrs),
                escapeCsvField(record?.lateMinutes || 0)
            ].join(','));
        }
    }

    return rows.join('\n');
}

async function fetchEmployeesAndRecords(
    start: string,
    end: string,
    employeeId?: string
): Promise<{ employees: any[]; records: any[] }> {
    if (employeeId) {
        const [emp, recs] = await Promise.all([
            repo.findEmployeeById(employeeId),
            repo.findRecords({ employeeId, date: { from: start, to: end } }, 0, 1000)
        ]);
        if (!emp) throw new Error('Employee not found');
        return { employees: [emp], records: recs };
    }

    const employees = await repo.findActiveEmployees();
    let records: any[] = [];
    let skip = 0;
    const limit = 5000;

    while (true) {
        const batch = await repo.findRecords({ date: { from: start, to: end } }, skip, limit);
        if (batch.length === 0) break;
        records = records.concat(batch);
        skip += limit;
        if (batch.length < limit) break;
    }

    return { employees, records };
}

function buildAttendanceMonthlyMatrixCsv(employees: any[], records: any[], dates: string[]): string {
    const dayHeaders = dates.map(d => d.slice(8)); // '01', '02', ... '31'
    const headers = [
        'Employee ID',
        'Name',
        'Department',
        'Location',
        ...dayHeaders,
        'Total Present',
        'Total Late',
        'Total Absent',
        'Total Half-Day',
        'Total Leave',
        'Total Work Hours',
        'Late Penalties'
    ];
    const rows = [headers.join(',')];

    const recordMap = new Map<string, any>();
    records.forEach(r => recordMap.set(`${r.employeeId}_${r.date}`, r));

    for (const emp of employees) {
        let presentCount = 0;
        let lateCount = 0;
        let absentCount = 0;
        let halfDayCount = 0;
        let leaveCount = 0;
        let totalWorkMinutes = 0;

        const dayCells: string[] = [];

        for (const dateStr of dates) {
            const record = recordMap.get(`${emp.employeeId}_${dateStr}`);
            const weekend = isWeekend(dateStr);
            const status = record?.status || (weekend ? 'Weekend' : 'Absent');

            let code = '—';
            if (status === 'Present') {
                code = 'P';
                presentCount++;
            } else if (status === 'Late') {
                code = 'L';
                presentCount++;
                lateCount++;
            } else if (status === 'Absent') {
                code = 'A';
                absentCount++;
            } else if (status === 'Half-Day') {
                code = 'HD';
                halfDayCount++;
                presentCount += 0.5;
            } else if (status === 'Early Leave') {
                code = 'EL';
                presentCount++;
            } else if (status === 'On Leave') {
                code = 'LV';
                leaveCount++;
            } else if (status === 'Holiday') {
                code = 'H';
            } else if (status === 'Weekend') {
                code = 'OFF';
            } else if (status === 'Incomplete') {
                code = 'INC';
                presentCount++;
            }

            if (record && record.lateMinutes > 0 && status !== 'Late') {
                lateCount++;
            }

            if (!['Absent', 'On Leave', 'Holiday', 'Weekend'].includes(status)) {
                totalWorkMinutes += record?.workDurationMinutes || 0;
            }
            dayCells.push(escapeCsvField(code));
        }

        const penalties = Math.floor(lateCount / 3);
        const workHours = (totalWorkMinutes / 60).toFixed(1);

        rows.push([
            escapeCsvField(emp.employeeId),
            escapeCsvField(formatEmployeeFullName(emp, emp.employeeId)),
            escapeCsvField(emp.jobInfo?.department || '—'),
            escapeCsvField(emp.jobInfo?.workLocation || 'ISB-Office'),
            ...dayCells,
            escapeCsvField(presentCount),
            escapeCsvField(lateCount),
            escapeCsvField(absentCount),
            escapeCsvField(halfDayCount),
            escapeCsvField(leaveCount),
            escapeCsvField(workHours),
            escapeCsvField(penalties)
        ].join(','));
    }

    return rows.join('\n');
}

export async function generateDailyCSV(dateStr: string, employeeId?: string): Promise<string> {
    const { employees, records } = await fetchEmployeesAndRecords(dateStr, dateStr, employeeId);
    return buildAttendanceExportCsv(employees, records, [dateStr]);
}

export async function generateMonthlyCSV(monthStr: string, employeeId?: string): Promise<string> {
    const start = `${monthStr}-01`;
    const [year, month] = monthStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const { employees, records } = await fetchEmployeesAndRecords(start, end, employeeId);
    const dates = Array.from({ length: lastDay }, (_, i) =>
        `${monthStr}-${String(i + 1).padStart(2, '0')}`
    );

    return buildAttendanceMonthlyMatrixCsv(employees, records, dates);
}

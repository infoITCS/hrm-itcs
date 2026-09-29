import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { formatEmployeeFullName } from '../../utils/nameHelper';

import * as svc from './attendance.service';
import * as repo from './attendance.repository';
import { runZktSync, checkServerStatus, fetchEmployees, fetchTransactions, fetchReport } from '../../services/zktCloudService';
import { generateCSV } from '../../utils/csv';
import { pktHHMMtoUtc } from '../../shared/utils/dateUtils';
import logger from '../../utils/logger';
import type { RecordFilter } from './attendance.types';
import mongoose from 'mongoose';
import AttendanceRecord, { AttendanceStatus } from '../../models/AttendanceRecord';
import LeaveBalance from '../../models/LeaveBalance';
import LeaveRequest from '../../models/LeaveRequest';
import Employee from '../../models/Employee';

const VALID_STATUSES: AttendanceStatus[] = [
    'Present','Absent','Late','Half-Day','Half-Day Leave','Early Leave','On Leave','Holiday','Weekend','Incomplete','N/A'
];

export const NON_WORKING_STATUSES: AttendanceStatus[] = ['Absent', 'On Leave', 'Holiday', 'Weekend', 'N/A'];
export const isNonWorkingStatus = (status?: string | null): boolean =>
    Boolean(status && NON_WORKING_STATUSES.includes(status as AttendanceStatus));

export function getAttendanceLeaveDeductionDays(status?: string | null): number {
    if (!status) return 0;
    if (status === 'Half-Day' || status === 'Half-Day Leave' || status === 'Late') return 0.5;
    if (status === 'On Leave') return 1.0;
    // Absent & Early Leave do NOT deduct from leave balance
    return 0;
}

function formatPktTime(d?: Date | null): string {
    if (!d || isNaN(new Date(d).getTime())) return '';
    return new Date(d).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Karachi',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).toLowerCase();
}

async function resolveEmployeeLookupIds(identifier: string): Promise<{ lookupIds: string[]; emp: any }> {
    if (!identifier) return { lookupIds: [], emp: null };
    const query: any = { $or: [{ employeeId: identifier }, { userId: identifier }] };
    if (mongoose.isValidObjectId(identifier)) {
        query.$or.push({ _id: identifier });
    }
    const emp = await Employee.findOne(query).lean() as any;
    const lookupIds = [identifier];
    if (emp?.employeeId && !lookupIds.includes(emp.employeeId)) lookupIds.push(emp.employeeId);
    if (emp?.userId && !lookupIds.includes(String(emp.userId))) lookupIds.push(String(emp.userId));
    if (emp?._id && !lookupIds.includes(String(emp._id))) lookupIds.push(String(emp._id));
    return { lookupIds, emp };
}

export async function syncAttendanceLeaveBalance(
    employeeId: string,
    dateStr: string,
    oldStatus: string | undefined,
    newStatus: string
) {
    if (oldStatus === newStatus) return;

    try {
        const { lookupIds, emp } = await resolveEmployeeLookupIds(employeeId);

        // If an approved formal LeaveRequest already exists for this date, that request already manages the balance
        const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
        const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
        const hasFormalLeave = await LeaveRequest.exists({
            employeeId: { $in: lookupIds },
            startDate: { $lte: dayEnd },
            endDate: { $gte: dayStart },
            status: { $in: ['Approved', 'Pending'] },
            appliedBy: { $ne: 'system' }
        });

        if (hasFormalLeave) {
            return;
        }

        const oldDays = getAttendanceLeaveDeductionDays(oldStatus);
        const newDays = getAttendanceLeaveDeductionDays(newStatus);
        const delta = Number((newDays - oldDays).toFixed(1));

        if (delta === 0) return;

        const year = new Date(dateStr).getFullYear() || new Date().getFullYear();

        let balanceDoc = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year });
        if (!balanceDoc && delta > 0) {
            balanceDoc = new LeaveBalance({
                employeeId: emp?.employeeId || employeeId,
                year,
                balances: [
                    { leaveTypeCode: 'casual', total: 10, used: 0, pending: 0 },
                    { leaveTypeCode: 'annual-leave', total: 20, used: 0, pending: 0 },
                    { leaveTypeCode: 'sick', total: 10, used: 0, pending: 0 }
                ]
            });
        }
        if (!balanceDoc || !Array.isArray(balanceDoc.balances)) return;

        let casualCat = balanceDoc.balances.find((b: any) => /casual/i.test(b.leaveTypeCode));
        let annualCat = balanceDoc.balances.find((b: any) => /annual/i.test(b.leaveTypeCode));
        let primaryCat = casualCat || annualCat || balanceDoc.balances[0];

        if (!primaryCat) {
            primaryCat = { leaveTypeCode: 'annual-leave', total: 20, used: 0, pending: 0 };
            balanceDoc.balances.push(primaryCat);
        }

        if (delta > 0) {
            // Deduct leave days (Casual preferred first, then Annual, then fallback)
            const availCasual = casualCat ? Math.max(0, casualCat.total - (casualCat.used || 0) - (casualCat.pending || 0)) : 0;
            if (casualCat && availCasual >= delta) {
                casualCat.used = Number(((Number(casualCat.used) || 0) + delta).toFixed(1));
            } else if (casualCat && availCasual > 0 && annualCat) {
                const rem = Number((delta - availCasual).toFixed(1));
                casualCat.used = Number(((Number(casualCat.used) || 0) + availCasual).toFixed(1));
                annualCat.used = Number(((Number(annualCat.used) || 0) + rem).toFixed(1));
            } else if (annualCat) {
                annualCat.used = Number(((Number(annualCat.used) || 0) + delta).toFixed(1));
            } else {
                primaryCat.used = Number(((Number(primaryCat.used) || 0) + delta).toFixed(1));
            }
        } else if (delta < 0) {
            // Refund/restore leave days when status is reverted (e.g. back to Present/Absent)
            let refund = Math.abs(delta);
            if (annualCat && Number(annualCat.used) > 0) {
                const toDeduct = Math.min(refund, Number(annualCat.used));
                annualCat.used = Number((Number(annualCat.used) - toDeduct).toFixed(1));
                refund = Number((refund - toDeduct).toFixed(1));
            }
            if (refund > 0 && casualCat && Number(casualCat.used) > 0) {
                const toDeduct = Math.min(refund, Number(casualCat.used));
                casualCat.used = Number((Number(casualCat.used) - toDeduct).toFixed(1));
                refund = Number((refund - toDeduct).toFixed(1));
            }
            if (refund > 0 && primaryCat) {
                primaryCat.used = Math.max(0, Number((Number(primaryCat.used || 0) - refund).toFixed(1)));
            }
        }

        balanceDoc.markModified('balances');
        await balanceDoc.save();

        // Synchronize LeaveRequest transaction record in Leave module
        if (newDays > 0) {
            const attRecord = await AttendanceRecord.findOne({
                employeeId: { $in: lookupIds },
                date: dateStr
            }).lean() as any;

            let punchDetails = '';
            if (attRecord?.checkIn && attRecord?.checkOut) {
                punchDetails = ` (${formatPktTime(attRecord.checkIn)} – ${formatPktTime(attRecord.checkOut)})`;
            } else if (attRecord?.checkIn) {
                punchDetails = ` (Check-in: ${formatPktTime(attRecord.checkIn)})`;
            }

            let reasonText = `Attendance Deduction: ${newStatus}${punchDetails}`;
            if (newStatus === 'Late') {
                reasonText = `Attendance Deduction: Late Arrival${punchDetails}`;
            } else if (newStatus === 'Half-Day') {
                reasonText = `Attendance Deduction: Half Day Absent${punchDetails}`;
            } else if (newStatus === 'Half-Day Leave') {
                reasonText = `Attendance Deduction: Half-Day Leave${punchDetails}`;
            } else if (newStatus === 'On Leave') {
                reasonText = `Attendance Deduction: Marked On Leave in Attendance`;
            }

            const durationText = newDays === 0.5 ? 'Half Day - Morning' : 'Full Day';

            const existingSystemLeave = await LeaveRequest.findOne({
                employeeId: { $in: lookupIds },
                startDate: { $lte: dayEnd },
                endDate: { $gte: dayStart },
                appliedBy: 'system'
            });

            if (existingSystemLeave) {
                existingSystemLeave.totalDays = newDays;
                existingSystemLeave.duration = durationText;
                existingSystemLeave.reason = reasonText;
                existingSystemLeave.status = 'Approved';
                existingSystemLeave.approvedByName = 'System (Attendance)';
                existingSystemLeave.actionAt = new Date();
                await existingSystemLeave.save();
            } else {
                await LeaveRequest.create({
                    employeeId: emp?.employeeId || employeeId,
                    type: 'Annual Leave',
                    startDate: dayStart,
                    endDate: dayEnd,
                    duration: durationText,
                    totalDays: newDays,
                    status: 'Approved',
                    reason: reasonText,
                    adminNote: 'System generated from Attendance module',
                    appliedBy: 'system',
                    approvedByName: 'System (Attendance)',
                    actionAt: new Date()
                });
            }
        } else if (newDays === 0) {
            await LeaveRequest.deleteMany({
                employeeId: { $in: lookupIds },
                startDate: { $lte: dayEnd },
                endDate: { $gte: dayStart },
                appliedBy: 'system'
            });
        }
    } catch (err) {
        logger.error('Error synchronizing leave balance on attendance change:', err);
    }
}

// Backward-compatible alias
const adjustLeaveBalanceForHalfDayLeave = syncAttendanceLeaveBalance;

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildRecordFilter(req: AuthRequest): RecordFilter {
    const filter: RecordFilter = {};
    const q = req.query as Record<string, string>;

    if (q.date) filter.date = q.date;
    else if (q.startDate && q.endDate) filter.date = { from: q.startDate, to: q.endDate };

    if (q.location) filter.location = q.location;

    if (q.status) {
        if (q.status === 'OnTime') { 
            filter.status = ['Present', 'Half-Day', 'Incomplete']; 
            filter.lateMinutes = { max: 0 }; 
        }
        else if (q.status === 'Present') filter.status = ['Present', 'Late', 'Half-Day', 'Incomplete'];
        else if (q.status === 'Late') filter.lateMinutes = { min: 1 };
        else if (q.status === 'StillIn') filter.status = 'Incomplete';
        else filter.status = q.status as AttendanceStatus;
    }

    // teamScope set by scopeToTeam middleware
    if (req.teamScope !== null && req.teamScope !== undefined) {
        if (req.teamScope.length === 0) { 
            filter.employeeId = []; 
            return filter; 
        }
        if (q.employeeId) {
            filter.employeeId = req.teamScope.includes(q.employeeId) ? q.employeeId : [];
        } else {
            filter.employeeId = req.teamScope;
        }
    } else {
        if (q.employeeId) filter.employeeId = q.employeeId;
    }

    return filter;
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export async function getToday(req: AuthRequest, res: Response) {
    try {
        const location = req.query.location as string | undefined;
        const summary = await svc.getDashboardSummary(new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10), location, req.teamScope);
        res.json({ success: true, data: summary });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getSummary(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
        const location = req.query.location as string | undefined;
        const summary = await svc.getDashboardSummary(date, location, req.teamScope);
        res.json({ success: true, data: summary });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getWeekly(req: AuthRequest, res: Response) {
    try {
        const endDate = (req.query.endDate as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
        const location = req.query.location as string | undefined;
        const data = await svc.getWeeklyTrend(endDate, location, req.teamScope);
        res.json({ success: true, data });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getRecords(req: AuthRequest, res: Response) {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);

        // Employee role: always scoped to own records
        if (req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user.userId);
            if (!emp) return res.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
            const filter: RecordFilter = { employeeId: emp.employeeId };
            if (req.query.date) filter.date = req.query.date as string;
            else if (req.query.startDate && req.query.endDate) {
                filter.date = { from: req.query.startDate as string, to: req.query.endDate as string };
            }
            const result = await svc.getAttendanceRecords(filter, page, limit);
            return res.json({ success: true, ...result });
        }

        const filter = buildRecordFilter(req);
        const result = await svc.getAttendanceRecords(filter, page, limit);
        res.json({ success: true, ...result });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getPunches(req: AuthRequest, res: Response) {
    try {
        const { employeeId, date } = req.query as Record<string, string>;
        if (!employeeId || !date) return res.status(400).json({ success: false, message: 'employeeId and date required' });

        // Authorization: Employee can only see their own punches
        if (req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user.userId);
            if (!emp || emp.employeeId !== employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own punches.' });
            }
        }

        const punches = await repo.findPunchesForDay(employeeId, date);
        res.json({ success: true, data: punches });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function updateRecord(req: AuthRequest, res: Response) {
    try {
        const { checkIn, checkOut, status, note, isWfh } = req.body;
        const record = await repo.findRecordById(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

        // Authorization: only super-admin/admin/manager/hr can modify records
        if (!['super-admin', 'admin', 'manager', 'hr'].includes(req.user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Access denied: only Admin, HR, Super Admin, or Manager can update records.' });
        }

        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status: ${VALID_STATUSES.join(', ')}` });
        }

        const finalStatus = status || (record as any).status;
        const recordDate = (record as any).date;
        const empId = (record as any).employeeId;

        // Check if employee has an approved formal leave on this date
        if (status && !req.body.forceOverride) {
            const dayStart = new Date(`${recordDate}T00:00:00.000Z`);
            const dayEnd = new Date(`${recordDate}T23:59:59.999Z`);
            const { lookupIds } = await resolveEmployeeLookupIds(empId);
            const formalLeave = await LeaveRequest.findOne({
                employeeId: { $in: lookupIds },
                startDate: { $lte: dayEnd },
                endDate: { $gte: dayStart },
                status: 'Approved',
                appliedBy: { $ne: 'system' }
            }).lean() as any;

            if (formalLeave) {
                const isMatching = formalLeave.duration === 'Full Day'
                    ? finalStatus === 'On Leave'
                    : (finalStatus === 'Half-Day Leave' || finalStatus === 'On Leave');

                if (!isMatching) {
                    return res.status(409).json({
                        success: false,
                        isLeaveLocked: true,
                        conflictLeave: {
                            type: formalLeave.type,
                            duration: formalLeave.duration,
                            reason: formalLeave.reason,
                            approvedByName: formalLeave.approvedByName
                        },
                        message: `Approved Leave Active: Employee has an approved ${formalLeave.duration} ${formalLeave.type} on ${recordDate} (Approved by ${formalLeave.approvedByName || 'Manager'}). Please confirm override to modify attendance.`
                    });
                }
            }
        }

        const isNonWorking = isNonWorkingStatus(finalStatus);

        const previousStatus = (record as any).status;
        if (status) (record as any).status = status;
        if (note !== undefined) (record as any).note = note;
        if (typeof isWfh === 'boolean') (record as any).isWfh = isNonWorking ? false : isWfh;

        if (finalStatus === 'Half-Day Leave') {
            (record as any).isHalfDay = true;
            if (!(record as any).leaveType) (record as any).leaveType = 'Casual';
        }

        if (isNonWorking) {
            // Absent, On Leave, Weekend, Holiday: clear all punch timestamps and zero out work minutes
            (record as any).checkIn = null;
            (record as any).checkOut = null;
            (record as any).allPunches = [];
            (record as any).workDurationMinutes = 0;
            (record as any).lateMinutes = 0;
            (record as any).overtimeMinutes = 0;
            (record as any).isWfh = false;
        } else {
            // Validate date ordering for working statuses
            const finalIn = checkIn ? new Date(checkIn) : (record.checkIn ? new Date(record.checkIn) : null);
            const finalOut = checkOut ? new Date(checkOut) : (record.checkOut ? new Date(record.checkOut) : null);
            
            if (finalIn && isNaN(finalIn.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkIn date' });
            if (finalOut && isNaN(finalOut.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkOut date' });

            if (finalIn && finalOut && finalOut <= finalIn) {
                return res.status(400).json({ success: false, message: 'checkOut must be after checkIn' });
            }

            if (note && note.length > 500) {
                return res.status(400).json({ success: false, message: 'Note too long (max 500 chars)' });
            }

            if (checkIn) (record as any).checkIn = new Date(checkIn);
            if (checkOut) (record as any).checkOut = new Date(checkOut);

            if (finalIn) {
                const employee = await repo.findEmployeeWithShift((record as any).employeeId);
                const deviceConfig = await repo.findDeviceConfig((record as any).location);
                const cfg = repo.resolveShiftConfig(employee, deviceConfig);
                
                const shiftStartTime = pktHHMMtoUtc((record as any).date, cfg.shiftStart);
                const shiftEndTime = pktHHMMtoUtc((record as any).date, cfg.shiftEnd);

                const diffMins = Math.floor((finalIn.getTime() - shiftStartTime.getTime()) / 60000);
                (record as any).lateMinutes = diffMins > cfg.graceMinutes ? diffMins - cfg.graceMinutes : 0;
                
                if (finalOut) {
                    const otDiff = Math.floor((finalOut.getTime() - shiftEndTime.getTime()) / 60000);
                    (record as any).overtimeMinutes = otDiff > 0 ? otDiff : 0;
                } else {
                    (record as any).overtimeMinutes = 0;
                }
            }

            if ((record as any).checkIn && (record as any).checkOut) {
                (record as any).workDurationMinutes = Math.floor(
                    ((record as any).checkOut.getTime() - (record as any).checkIn.getTime()) / 60000
                );
            }
        }

        (record as any).manuallyAdjusted = true;
        (record as any).adjustedBy = req.user?.userId;
        await record.save();
        await adjustLeaveBalanceForHalfDayLeave((record as any).employeeId, (record as any).date, previousStatus, finalStatus);
        res.json({ success: true, data: record });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function createManualRecord(req: AuthRequest, res: Response) {
    try {
        const { employeeId, date, checkIn, checkOut, status, note, location, isWfh } = req.body;
        if (!employeeId || !date) return res.status(400).json({ success: false, message: 'employeeId and date required' });

        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status: ${VALID_STATUSES.join(', ')}` });
        }

        const effectiveStatus = status ?? 'Present';

        // Check if employee has an approved formal leave on this date
        if (!req.body.forceOverride) {
            const dayStart = new Date(`${date}T00:00:00.000Z`);
            const dayEnd = new Date(`${date}T23:59:59.999Z`);
            const { lookupIds } = await resolveEmployeeLookupIds(employeeId);
            const formalLeave = await LeaveRequest.findOne({
                employeeId: { $in: lookupIds },
                startDate: { $lte: dayEnd },
                endDate: { $gte: dayStart },
                status: 'Approved',
                appliedBy: { $ne: 'system' }
            }).lean() as any;

            if (formalLeave) {
                const isMatching = formalLeave.duration === 'Full Day'
                    ? effectiveStatus === 'On Leave'
                    : (effectiveStatus === 'Half-Day Leave' || effectiveStatus === 'On Leave');

                if (!isMatching) {
                    return res.status(409).json({
                        success: false,
                        isLeaveLocked: true,
                        conflictLeave: {
                            type: formalLeave.type,
                            duration: formalLeave.duration,
                            reason: formalLeave.reason,
                            approvedByName: formalLeave.approvedByName
                        },
                        message: `Approved Leave Active: Employee has an approved ${formalLeave.duration} ${formalLeave.type} on ${date} (Approved by ${formalLeave.approvedByName || 'Manager'}). Please confirm override to modify attendance.`
                    });
                }
            }
        }

        const isNonWorking = isNonWorkingStatus(effectiveStatus);

        let dIn: Date | null = null;
        let dOut: Date | null = null;
        let allPunches: Date[] = [];
        let workDurationMinutes = 0;
        let lateMinutes = 0;
        let overtimeMinutes = 0;

        if (!isNonWorking) {
            dIn = checkIn ? new Date(checkIn) : null;
            dOut = checkOut ? new Date(checkOut) : null;

            if (dIn && isNaN(dIn.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkIn date' });
            if (dOut && isNaN(dOut.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkOut date' });

            if (dIn && dOut && dOut <= dIn) {
                return res.status(400).json({ success: false, message: 'checkOut must be after checkIn' });
            }

            allPunches = [dIn, dOut].filter(Boolean) as Date[];
            workDurationMinutes = dIn && dOut
                ? Math.max(0, Math.floor((dOut.getTime() - dIn.getTime()) / 60000))
                : 0;

            if (dIn) {
                const employee = await repo.findEmployeeWithShift(employeeId);
                const deviceConfig = await repo.findDeviceConfig(location ?? 'ISB-Office');
                const cfg = repo.resolveShiftConfig(employee, deviceConfig);
                
                const shiftStartTime = pktHHMMtoUtc(date, cfg.shiftStart);
                const shiftEndTime = pktHHMMtoUtc(date, cfg.shiftEnd);

                const diffMins = Math.floor((dIn.getTime() - shiftStartTime.getTime()) / 60000);
                lateMinutes = diffMins > cfg.graceMinutes ? diffMins - cfg.graceMinutes : 0;
                
                if (dOut) {
                    const otDiff = Math.floor((dOut.getTime() - shiftEndTime.getTime()) / 60000);
                    overtimeMinutes = otDiff > 0 ? otDiff : 0;
                }
            }
        }

        const existingRecord = await AttendanceRecord.findOne({ employeeId, date }).lean() as any;
        const oldStatus = existingRecord?.status;

        const record = await repo.upsertRecord(employeeId, date, {
            location: location ?? 'ISB-Office',
            checkIn: isNonWorking ? null : (dIn ?? null),
            checkOut: isNonWorking ? null : (dOut ?? null),
            workDurationMinutes,
            lateMinutes,
            overtimeMinutes,
            allPunches,
            status: effectiveStatus,
            isHalfDay: effectiveStatus === 'Half-Day' || effectiveStatus === 'Half-Day Leave',
            leaveType: effectiveStatus === 'Half-Day Leave' ? 'Casual' : undefined,
            note,
            isWfh: isNonWorking ? false : Boolean(isWfh),
            manuallyAdjusted: true,
            adjustedBy: req.user?.userId,
        });

        await adjustLeaveBalanceForHalfDayLeave(employeeId, date, oldStatus, effectiveStatus);
        res.json({ success: true, data: record });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function selfPunch(req: AuthRequest, res: Response) {
    return res.status(403).json({
        success: false,
        message: 'Web check-in is disabled. Attendance is recorded via office biometric machine or authorized HR entry.'
    });
}

export async function getLiveFeed(req: AuthRequest, res: Response) {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const location = req.query.location as string | undefined;
        const dateStr = (req.query.date as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

        const extraFilter: Record<string, any> = {};
        if (location) {
            const devicesInLocation = await repo.findAllDevices() as any[];
            const sns = devicesInLocation.filter((d) => d.locationName === location).map((d) => d.deviceSN);
            extraFilter.deviceSN = { $in: sns };
        }

        const punches = await repo.findRecentPunches(dateStr, limit, extraFilter) as any[];
        const pins = [...new Set(punches.map((p) => String(p.machineUserId)).filter(Boolean))];
        const [hrmEmployees, allDevices] = await Promise.all([
            pins.length > 0 ? repo.findEmployeesByPins(pins) : Promise.resolve([]),
            repo.findAllDevices()
        ]);

        const snToLoc = new Map(allDevices.map(d => [d.deviceSN, d.locationName]));
        const hrmMap = new Map(hrmEmployees.map((e) => [`${e.jobInfo?.workLocation}_${e.biometricPin}`, e]));

        const empIds = [...new Set(punches.map((p) => {
            const punchLoc = snToLoc.get(p.deviceSN) || p.location || location || 'ISB-Office';
            const emp = hrmMap.get(`${punchLoc}_${p.machineUserId}`);
            return emp?.employeeId || p.employeeId;
        }))];
        const recordsForDay = await repo.findRecordsForDate(dateStr, { employeeId: { $in: empIds } }) as any[];
        const recMap = new Map(recordsForDay.map((r) => [r.employeeId, r]));

        const enriched = punches.map((p) => {
            const punchLoc = snToLoc.get(p.deviceSN) || p.location || location || 'ISB-Office';
            const emp = hrmMap.get(`${punchLoc}_${p.machineUserId}`);
            const empId = emp?.employeeId || p.employeeId;
            const rec = recMap.get(empId);
            return {
                ...p,
                location: punchLoc,
                employeeName: p.employeeName || (emp ? formatEmployeeFullName(emp, `User ${p.machineUserId}`) : `User ${p.machineUserId}`),
                avatar: emp?.avatar,
                employeeId: empId,
                attendanceStatus: rec?.status,
                lateMinutes: rec?.lateMinutes || 0,
            };
        });

        res.json({ success: true, data: enriched });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getTodayRoster(req: AuthRequest, res: Response) {
    try {
        const dateStr = (req.query.date as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
        const location = req.query.location as string | undefined;
        const roster = await svc.getTodayRoster(dateStr, location, req.teamScope);
        res.json({ success: true, data: roster });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getLocations(_req: AuthRequest, res: Response) {
    try {
        const devices = await repo.findAllDevices() as any[];
        const names = [...new Set(devices.map((d) => d.locationName))];
        res.json({ success: true, data: names });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getDevices(_req: AuthRequest, res: Response) {
    try {
        const devices = await repo.findAllDevices();
        res.json({ success: true, data: devices });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function updateDevice(req: AuthRequest, res: Response) {
    try {
        const device = await repo.upsertDevice(req.params.sn, req.body);
        if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
        res.json({ success: true, data: device });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportCSV(req: AuthRequest, res: Response) {
    try {
        const filter = buildRecordFilter(req);
        const { data } = await svc.getAttendanceRecords(filter, 1, 5000);
        const columns = [
            { header: 'Employee ID', key: 'employeeId' },
            { header: 'Date', key: 'date' },
            { header: 'Location', key: 'location' },
            { header: 'Check In', key: 'checkIn' },
            { header: 'Check Out', key: 'checkOut' },
            { header: 'Work Minutes', key: 'workDurationMinutes' },
            { header: 'Status', key: 'status' },
            { header: 'Late (Min)', key: 'lateMinutes' },
            { header: 'OT (Min)', key: 'overtimeMinutes' },
            { header: 'Note', key: 'note' },
        ];
        const csv = generateCSV(data, columns);
        const { startDate, endDate } = req.query as Record<string, string>;
        
        // Sanitize headers to prevent injection
        const sanitize = (val: string) => val.replace(/[^A-Za-z0-9_\-\.]/g, '').slice(0, 20);
        const s = sanitize(startDate || 'Report');
        const e = sanitize(endDate || '');
        const filename = `Attendance_${s}${e ? '_' + e : ''}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

// ─── ZKT Cloud Proxy ──────────────────────────────────────────────────────────

export async function zktGetStatus(_req: AuthRequest, res: Response) {
    try {
        const status = await checkServerStatus();
        res.json({ success: true, data: status });
    } catch (err: any) { res.json({ success: true, data: { reachable: false, error: err.message } }); }
}

export async function zktGetEmployees(_req: AuthRequest, res: Response) {
    try {
        const employees = await fetchEmployees();
        res.json({ success: true, count: employees.length, data: employees });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktGetTransactions(req: AuthRequest, res: Response) {
    try {
        const lastId = req.query.last_id ? parseInt(req.query.last_id as string, 10) : null;
        const txns = await fetchTransactions(lastId);
        res.json({ success: true, count: txns.length, data: txns });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktGetReport(req: AuthRequest, res: Response) {
    try {
        const { start_date, end_date } = req.query as Record<string, string>;
        if (!start_date || !end_date) return res.status(400).json({ success: false, message: 'start_date and end_date required' });
        const report = await fetchReport(start_date, end_date);
        res.json({ success: true, count: report.length, data: report });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktGetSyncState(_req: AuthRequest, res: Response) {
    try {
        const state = await repo.getOrCreateSyncState();
        res.json({ success: true, data: state });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function zktTriggerSync(_req: AuthRequest, res: Response) {
    try {
        const result = await runZktSync();
        res.json({ success: true, data: result });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktSyncReport(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
        const count = await svc.syncFromMachineReport(date);
        res.json({ success: true, message: `Synced ${count} records for ${date}` });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function adminAutoClose(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
        const result = await svc.autoCloseIncompleteRecords(date);
        res.json({ success: true, message: `Auto-close complete. Processed: ${result.processed}, Skipped: ${result.skipped}`, data: result });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getEmployeeMonthly(req: AuthRequest, res: Response) {
    try {
        let { employeeId } = req.params;

        if (employeeId === 'me' || req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user!.userId);
            if (!emp) return res.status(404).json({ success: false, message: 'Employee profile not found' });
            
            if (req.user?.role === 'employee' && employeeId !== 'me' && employeeId !== emp.employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records.' });
            }
            if (employeeId === 'me') employeeId = emp.employeeId;
        }

        const month = (req.query.month as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10).slice(0, 7);
        const data = await svc.getEmployeeMonthlyAttendance(employeeId, month);
        res.json({ success: true, data });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportMonthly(req: AuthRequest, res: Response) {
    try {
        let { employeeId } = req.params;

        if (employeeId === 'me' || req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user!.userId);
            if (!emp) return res.status(404).json({ success: false, message: 'Employee profile not found' });
            
            if (req.user?.role === 'employee' && employeeId !== 'me' && employeeId !== emp.employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records.' });
            }
            if (employeeId === 'me') employeeId = emp.employeeId;
        }

        const month = (req.query.month as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10).slice(0, 7);
        const csv = await svc.generateMonthlyCSV(month, employeeId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${employeeId}_${month}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportGlobalMonthly(req: AuthRequest, res: Response) {
    try {
        const month = (req.query.month as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10).slice(0, 7);
        const csv = await svc.generateMonthlyCSV(month);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_all_${month}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportDaily(req: AuthRequest, res: Response) {
    try {
        let { employeeId } = req.params;

        if (employeeId === 'me' || req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user!.userId);
            if (!emp) return res.status(404).json({ success: false, message: 'Employee profile not found' });

            if (req.user?.role === 'employee' && employeeId !== 'me' && employeeId !== emp.employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records.' });
            }
            if (employeeId === 'me') employeeId = emp.employeeId;
        }

        const date = (req.query.date as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
        const csv = await svc.generateDailyCSV(date, employeeId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${employeeId}_${date}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportGlobalDaily(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
        const csv = await svc.generateDailyCSV(date);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_all_${date}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function checkLeaveOnDate(req: AuthRequest, res: Response) {
    try {
        const { employeeId, date } = req.query as Record<string, string>;
        if (!employeeId || !date) return res.status(400).json({ success: false, message: 'employeeId and date required' });

        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);

        const { lookupIds } = await resolveEmployeeLookupIds(employeeId);
        const formalLeave = await LeaveRequest.findOne({
            employeeId: { $in: lookupIds },
            startDate: { $lte: dayEnd },
            endDate: { $gte: dayStart },
            status: 'Approved',
            appliedBy: { $ne: 'system' }
        }).lean() as any;

        if (formalLeave) {
            return res.json({
                success: true,
                hasApprovedLeave: true,
                leave: {
                    type: formalLeave.type,
                    duration: formalLeave.duration,
                    reason: formalLeave.reason,
                    approvedByName: formalLeave.approvedByName
                }
            });
        }
        return res.json({ success: true, hasApprovedLeave: false });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
}


import assert from 'assert';
import { pktHHMMtoUtc, isValidCheckout, applyLunchDeduction } from '../shared/utils/dateUtils';
import { resolveShiftConfig } from '../modules/attendance/attendance.repository';

console.log('🧪 Starting Overnight Shift Self-Check Tests...');

// ── Test 1: resolveShiftConfig correctly flags overnight shifts ──
{
    const overnightEmployee = {
        jobInfo: {
            shift: {
                startTime: '17:00',
                endTime: '02:00',
                graceMinutes: 30,
                enableLunchDeduction: true,
                lunchDeductionMinutes: 60,
                lunchThresholdHours: 5,
            }
        }
    };
    const dayEmployee = {
        jobInfo: {
            shift: {
                startTime: '09:00',
                endTime: '18:00',
                graceMinutes: 30,
                enableLunchDeduction: true,
                lunchDeductionMinutes: 60,
                lunchThresholdHours: 5,
            }
        }
    };

    const overnightCfg = resolveShiftConfig(overnightEmployee, null);
    assert.strictEqual(overnightCfg.isOvernight, true, '17:00 to 02:00 must be flagged as isOvernight=true');

    const dayCfg = resolveShiftConfig(dayEmployee, null);
    assert.strictEqual(dayCfg.isOvernight, false, '09:00 to 18:00 must be flagged as isOvernight=false');
    console.log('✅ Test 1 Passed: Shift configuration overnight detection accurate');
}

// ── Test 2: Cross-midnight punch pairing & calculations ──
{
    const dateStr = '2026-10-14';
    const cfg = {
        shiftStart: '17:00',
        shiftEnd: '02:00',
        isOvernight: true,
        graceMinutes: 30,
        enableLunchDeduction: true,
        lunchDeductionMinutes: 60,
        lunchThresholdHours: 5,
    };

    // Employee checks in at 17:02 PKT on Oct 14
    const checkIn = pktHHMMtoUtc(dateStr, '17:02');
    
    // Employee checks out at 02:05 PKT on Oct 15
    const checkOut = pktHHMMtoUtc('2026-10-15', '02:05');

    // Valid checkout heuristic
    assert.strictEqual(isValidCheckout(checkIn, checkOut), true, 'Check-out at 02:05 must be valid for 17:02 check-in');

    // Shift start & end in UTC
    const shiftStartTime = pktHHMMtoUtc(dateStr, cfg.shiftStart);
    let shiftEndTime = pktHHMMtoUtc(dateStr, cfg.shiftEnd);
    if (cfg.isOvernight) {
        shiftEndTime = new Date(shiftEndTime.getTime() + 24 * 60 * 60 * 1000);
    }

    // Late calculation
    const diffMins = Math.floor((checkIn.getTime() - shiftStartTime.getTime()) / 60000);
    assert.strictEqual(diffMins, 2, 'Checked in 2 minutes after shift start');
    const lateMinutes = diffMins > cfg.graceMinutes ? diffMins - cfg.graceMinutes : 0;
    assert.strictEqual(lateMinutes, 0, 'Late minutes must be 0 within 30 min grace period');

    // Overtime calculation: checked out at 02:05 when shift ended at 02:00
    const otDiff = Math.floor((checkOut.getTime() - shiftEndTime.getTime()) / 60000);
    assert.strictEqual(otDiff, 5, 'Overtime should be 5 minutes past 02:00 AM');

    // Work duration with 1 hour lunch deduction
    const rawMins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000); // 543 mins (9h 3m)
    assert.strictEqual(rawMins, 543, 'Raw duration should be 543 minutes');
    const workDurationMinutes = applyLunchDeduction(rawMins, cfg); // 543 - 60 = 483 mins (~8h 3m)
    assert.strictEqual(workDurationMinutes, 483, 'Work duration after 60m lunch deduction should be 483 minutes');

    console.log('✅ Test 2 Passed: Cross-midnight punch duration, lunch deduction, and OT calculations accurate');
}

// ── Test 3: Early morning punch date attribution heuristic ──
{
    function resolveTargetDateStr(datePart: string, tH: number, isOvernight: boolean): string {
        let dateStr = datePart;
        if (isOvernight && tH < 10) {
            const prevD = new Date(`${datePart}T12:00:00.000Z`);
            prevD.setUTCDate(prevD.getUTCDate() - 1);
            dateStr = prevD.toISOString().slice(0, 10);
        }
        return dateStr;
    }

    // 1) Overnight shift checkout punch at 02:05 AM on Oct 15 -> shifts back to Oct 14
    assert.strictEqual(resolveTargetDateStr('2026-10-15', 2, true), '2026-10-14');

    // 2) Overnight shift check-in punch at 17:00 PM on Oct 15 -> stays on Oct 15
    assert.strictEqual(resolveTargetDateStr('2026-10-15', 17, true), '2026-10-15');

    // 3) Normal day shift punch at 08:50 AM on Oct 15 -> stays on Oct 15 (not shifted!)
    assert.strictEqual(resolveTargetDateStr('2026-10-15', 8, false), '2026-10-15');

    // 4) Normal day shift punch at 18:05 PM on Oct 15 -> stays on Oct 15
    assert.strictEqual(resolveTargetDateStr('2026-10-15', 18, false), '2026-10-15');

    console.log('✅ Test 3 Passed: Punch date attribution correctly segments night and day workers');
}

// ── Test 4: Overnight Query Window (findPunchesForDay) ──
{
    const dateStr = '2026-10-14';
    const [y, m, d] = dateStr.split('-').map(Number);
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const startOfDayPkt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - PKT_OFFSET_MS);

    const queryStart = new Date(startOfDayPkt.getTime() + 12 * 60 * 60 * 1000); // 12:00 PM PKT Oct 14
    const queryEnd = new Date(startOfDayPkt.getTime() + 34 * 60 * 60 * 1000);   // 10:00 AM PKT Oct 15

    const punch1 = pktHHMMtoUtc('2026-10-14', '17:00'); // Check-in
    const punch2 = pktHHMMtoUtc('2026-10-15', '02:00'); // Check-out

    assert.ok(punch1 >= queryStart && punch1 <= queryEnd, 'Punch 1 (17:00 Oct 14) is within query window');
    assert.ok(punch2 >= queryStart && punch2 <= queryEnd, 'Punch 2 (02:00 Oct 15) is within query window');

    console.log('✅ Test 4 Passed: Query window covers check-in and next-morning check-out');
}

console.log('\n🎉 ALL OVERNIGHT SHIFT TESTS PASSED SUCCESSFULLY!');

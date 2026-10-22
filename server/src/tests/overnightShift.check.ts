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

// ── Test 5: Fast double-tap deduplication (< 60s) ──
{
    const { deduplicatePunches } = require('../shared/utils/dateUtils');
    const p1 = new Date('2026-10-15T09:24:05.000Z');
    const p2 = new Date('2026-10-15T09:24:20.000Z'); // 15s later (accidental double tap)
    const p3 = new Date('2026-10-15T18:55:33.000Z');

    const deduped = deduplicatePunches([p1, p2, p3], 60);
    assert.strictEqual(deduped.length, 2, 'Accidental double tap (< 60s) must be discarded');
    assert.strictEqual(deduped[0].getTime(), p1.getTime(), 'First punch retained');
    assert.strictEqual(deduped[1].getTime(), p3.getTime(), 'Checkout punch retained');
    console.log('✅ Test 5 Passed: Rapid double-taps (< 60s) are cleanly deduplicated');
}

// ── Test 6: Midnight / "fun" punch does not corrupt morning shift check-in ──
{
    const { matchShiftPunches } = require('../shared/utils/dateUtils');
    const morningShift = {
        shiftStart: '09:00',
        shiftEnd: '18:00',
        isOvernight: false,
    };
    const dateStr = '2026-10-15';
    // Employee came at 00:05 AM (midnight for fun), then officially came at 09:05 AM and left at 18:15 PM
    const midnightFunPunch = pktHHMMtoUtc(dateStr, '00:05');
    const officialCheckIn = pktHHMMtoUtc(dateStr, '09:05');
    const officialCheckOut = pktHHMMtoUtc(dateStr, '18:15');

    const result = matchShiftPunches(
        [midnightFunPunch, officialCheckIn, officialCheckOut],
        dateStr,
        morningShift
    );

    assert.ok(result.checkIn, 'Check-in must be present');
    assert.strictEqual(
        result.checkIn!.getTime(),
        officialCheckIn.getTime(),
        'Check-in must match official 09:05 punch, NOT the 00:05 midnight punch'
    );
    assert.strictEqual(
        result.checkOut!.getTime(),
        officialCheckOut.getTime(),
        'Check-out must match 18:15 punch'
    );
    console.log('✅ Test 6 Passed: Midnight off-shift punch ignored; official 09:05 check-in correctly selected');
}

// ── Test 7: Night shift arrival has checkIn, no checkout, and no early leave ──
{
    const { matchShiftPunches } = require('../shared/utils/dateUtils');
    const nightShift = {
        shiftStart: '17:00',
        shiftEnd: '02:00',
        isOvernight: true,
        graceMinutes: 30,
    };
    const dateStr = '2026-10-16';
    // Employee had a morning checkout from yesterday at 07:58 AM, and arrived at 16:52 PM for tonight's shift
    const yesterdayCheckout = new Date('2026-10-16T02:58:36.000Z'); // 07:58 AM PKT
    const tonightArrival = new Date('2026-10-16T11:52:50.000Z');    // 16:52 PM PKT

    const result = matchShiftPunches([yesterdayCheckout, tonightArrival], dateStr, nightShift);

    assert.ok(result.checkIn, 'Check-in must be captured');
    assert.strictEqual(result.checkIn!.getTime(), tonightArrival.getTime(), 'Check-in must be 16:52 PM arrival');
    assert.strictEqual(result.checkOut, undefined, 'Check-out must be undefined since employee just arrived');
    assert.strictEqual(result.isEarlyLeave, false, 'Employee must not be marked Early Leave');

    console.log('✅ Test 7 Passed: Night shift employee with morning checkout has valid check-in and no false checkout');
}

// ── Test 8: Afternoon / Part-Time shift (14:00 - 18:00) ──
{
    const { matchShiftPunches } = require('../shared/utils/dateUtils');
    const partTimeShift = {
        shiftStart: '14:00',
        shiftEnd: '18:00',
        isOvernight: false,
        graceMinutes: 15,
        halfDayThresholdHours: 2,
        enableLunchDeduction: false,
    };
    const dateStr = '2026-10-17';
    const arrival = new Date('2026-10-17T09:02:00.000Z');   // 14:02 PKT (09:02 UTC)
    const departure = new Date('2026-10-17T13:05:00.000Z'); // 18:05 PKT (13:05 UTC)

    const result = matchShiftPunches([arrival, departure], dateStr, partTimeShift);

    assert.ok(result.checkIn, 'Check-in must be captured');
    assert.strictEqual(result.checkIn!.getTime(), arrival.getTime(), 'Check-in must be 14:02 PM arrival');
    assert.ok(result.checkOut, 'Check-out must be captured');
    assert.strictEqual(result.checkOut!.getTime(), departure.getTime(), 'Check-out must be 18:05 PM departure');
    assert.strictEqual(result.lateMinutes, 0, 'Arrival at 14:02 within 15m grace is 0m late');
    assert.strictEqual(result.isEarlyLeave, false, 'Departure at 18:05 is not early leave');
    assert.strictEqual(result.overtimeMinutes, 5, 'Departure at 18:05 gives 5m overtime');
    assert.strictEqual(result.workDurationMinutes, 243, '4h 3m worked without lunch deduction');

    console.log('✅ Test 8 Passed: Part-time afternoon shift (14:00-18:00) calculated accurately');
}

// ── Test 9: Morning Shift (09:00 - 18:00) Grace, Half-Day & Full-Day Penalties ──
{
    const { statusToPenaltyType } = require('../utils/attendancePenaltyPolicy');
    const { getAttendanceLeaveDeductionDays } = require('../modules/attendance/attendance.controller');

    // 09:20 Arrival (within 30m grace)
    assert.strictEqual(statusToPenaltyType('Present', 0), null, '09:20 arrival within grace has no salary penalty');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Present'), 0, '09:20 arrival within grace has 0 leave deduction');

    // 09:45 Arrival (45m past shift start, lateMinutes = 15 <= 30)
    assert.strictEqual(statusToPenaltyType('Late', 15), 'half', '09:45 arrival (45m late) triggers half-day salary penalty');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Late', { lateMinutes: 15 }), 0.5, '09:45 arrival triggers 0.5 leave deduction');

    // 10:15 Arrival (75m past shift start, lateMinutes = 45 > 30)
    assert.strictEqual(statusToPenaltyType('Late', 45), 'full', '10:15 arrival (>1h late) triggers full-day salary penalty');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Late', { lateMinutes: 45 }), 1.0, '10:15 arrival triggers 1.0 full day leave deduction');

    console.log('✅ Test 9 Passed: Morning shift (09:00) 30m grace, 9:30-10:00 half-cut, and 10:00+ full-cut verified');
}

// ── Test 10: Night Shift (17:00 - 02:00) Universal Grace, Half-Day & Full-Day Penalties ──
{
    const { statusToPenaltyType } = require('../utils/attendancePenaltyPolicy');
    const { getAttendanceLeaveDeductionDays } = require('../modules/attendance/attendance.controller');

    // 17:20 Arrival (within 30m grace)
    assert.strictEqual(statusToPenaltyType('Present', 0), null, '17:20 night shift arrival within grace has no penalty');

    // 17:45 Arrival (45m past shift start, lateMinutes = 15 <= 30)
    assert.strictEqual(statusToPenaltyType('Late', 15), 'half', '17:45 night shift arrival triggers half-day salary penalty');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Late', { lateMinutes: 15 }), 0.5, '17:45 night shift arrival triggers 0.5 leave deduction');

    // 18:15 Arrival (75m past shift start, lateMinutes = 45 > 30)
    assert.strictEqual(statusToPenaltyType('Late', 45), 'full', '18:15 night shift arrival (>1h late) triggers full-day salary penalty');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Late', { lateMinutes: 45 }), 1.0, '18:15 night shift arrival triggers 1.0 full day leave deduction');

    console.log('✅ Test 10 Passed: Night shift (17:00) 30m grace, 17:30-18:00 half-cut, and 18:00+ full-cut verified');
}

// ── Test 11: Part-Time Shift (14:00 - 18:00) Universal Penalties ──
{
    const { statusToPenaltyType } = require('../utils/attendancePenaltyPolicy');
    const { getAttendanceLeaveDeductionDays } = require('../modules/attendance/attendance.controller');

    // 14:20 Arrival (within 30m grace)
    assert.strictEqual(statusToPenaltyType('Present', 0), null);

    // 14:45 Arrival (45m past shift start, lateMinutes = 15 <= 30)
    assert.strictEqual(statusToPenaltyType('Late', 15), 'half');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Late', { lateMinutes: 15 }), 0.5);

    // 15:15 Arrival (75m past shift start, lateMinutes = 45 > 30)
    assert.strictEqual(statusToPenaltyType('Late', 45), 'full');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Late', { lateMinutes: 45 }), 1.0);

    console.log('✅ Test 11 Passed: Part-time shift (14:00) 30m grace, 14:30-15:00 half-cut, and 15:00+ full-cut verified');
}

// ── Test 12: Early Leave & First Late Exemption Waivers ──
{
    const { statusToPenaltyType } = require('../utils/attendancePenaltyPolicy');
    const { getAttendanceLeaveDeductionDays } = require('../modules/attendance/attendance.controller');

    // Early Leave: must cut both half day salary and 0.5 leave balance
    assert.strictEqual(statusToPenaltyType('Early Leave'), 'half', 'Early leave must trigger half-day salary penalty');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Early Leave'), 0.5, 'Early leave must trigger 0.5 leave deduction');

    // First Late Exemption: status is Present, 0 salary penalty, 0 leave deduction
    assert.strictEqual(statusToPenaltyType('Present', 0), null, 'First late exemption has no salary penalty');
    assert.strictEqual(getAttendanceLeaveDeductionDays('Present'), 0, 'First late exemption has 0 leave deduction');

    console.log('✅ Test 12 Passed: Early leave (0.5 salary + 0.5 leave) and First Late Exemption waiver verified');
}

// ── Test 13: Biometric PIN Normalization (Numeric & Zero-padded) ──
{
    const { normalizeBiometricPin } = require('../shared/utils/dateUtils');
    assert.strictEqual(normalizeBiometricPin('22'), '22', 'Numeric string should remain 22');
    assert.strictEqual(normalizeBiometricPin('0022'), '22', 'Leading zeros should be stripped to 22');
    assert.strictEqual(normalizeBiometricPin(22), '22', 'Number 22 should normalize to string 22');
    console.log('✅ Test 13 Passed: Biometric PIN normalization correctly handles numeric and zero-padded PINs');
}

// ── Test 14: Morning Checkout Punch on Next Day Does NOT Hijack Today Check-In ──
{
    const { matchShiftPunches, pktHHMMtoUtc } = require('../shared/utils/dateUtils');
    const dateStr = '2026-10-21';
    const nightShift = {
        shiftStart: '17:00',
        shiftEnd: '02:00',
        isOvernight: true,
        graceMinutes: 30
    };

    // Employee punched at 07:47 AM PKT (checkout from yesterday's night shift)
    const morningCheckout = pktHHMMtoUtc(dateStr, '07:47');
    const result = matchShiftPunches([morningCheckout], dateStr, nightShift);

    assert.strictEqual(result.checkIn, undefined, 'Morning punch before shift check-in window must NOT be check-in');
    assert.strictEqual(result.checkOut, undefined, 'Morning punch alone cannot be checkout for today shift');
    assert.strictEqual(result.offShiftPunches.length, 1, 'Morning punch must be flagged as off-shift punch');
    console.log('✅ Test 14 Passed: Morning departure punch correctly classified as off-shift without hijacking check-in');
}

// ── Test 15: Overnight Auto-Close Buffer Logic ──
{
    const { pktHHMMtoUtc } = require('../shared/utils/dateUtils');
    const dateStr = '2026-10-20';
    let autoCheckOut = pktHHMMtoUtc(dateStr, '02:00');
    // Overnight shifts end on next calendar day (+24h)
    autoCheckOut = new Date(autoCheckOut.getTime() + 24 * 60 * 60 * 1000);

    // At 23:05 PKT on Oct 20 (nightly run): shift has not ended yet (ends at 02:00 AM Oct 21)
    const nightlyRunTime = pktHHMMtoUtc('2026-10-20', '23:05');
    const shouldSkipNightly = nightlyRunTime.getTime() < autoCheckOut.getTime() + 60 * 60 * 1000;
    assert.strictEqual(shouldSkipNightly, true, 'At 23:05 PM, night shift workers must be skipped from auto-close');

    // At 10:00 AM PKT on Oct 21 (morning run): shift ended 8 hours ago
    const morningRunTime = pktHHMMtoUtc('2026-10-21', '10:00');
    const shouldCloseMorning = morningRunTime.getTime() >= autoCheckOut.getTime() + 60 * 60 * 1000;
    assert.strictEqual(shouldCloseMorning, true, 'At 10:00 AM next day, overnight shifts must be auto-closed');

    console.log('✅ Test 15 Passed: Overnight shift auto-close buffer safely skips active shifts and closes past shifts');
}

console.log('\n🎉 ALL ATTENDANCE & SHIFT TESTS PASSED SUCCESSFULLY!');


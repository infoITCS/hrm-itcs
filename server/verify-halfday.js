const mongoose = require('mongoose');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'hrm' });
  const AttendanceRecord = mongoose.connection.db.collection('attendancerecords');
  const LeaveBalance = mongoose.connection.db.collection('leavebalances');

  const empId = 'itcs-002';
  const year = 2026;
  const testDate = '2026-06-15';

  // 1. Initial leave balance
  let bal = await LeaveBalance.findOne({ employeeId: empId, year });
  if (!bal) {
    await LeaveBalance.insertOne({
      employeeId: empId,
      year,
      balances: [{ leaveTypeCode: 'casual', total: 10, used: 0, pending: 0 }]
    });
    bal = await LeaveBalance.findOne({ employeeId: empId, year });
  }
  const initialUsed = bal.balances.find(b => b.leaveTypeCode === 'casual')?.used || 0;
  console.log('Initial casual leave used:', initialUsed);

  // 2. Simulate saving Half-Day Leave
  const { createManualRecord } = require('./dist/modules/attendance/attendance.controller');
  const reqAdd = {
    body: {
      employeeId: empId,
      date: testDate,
      status: 'Half-Day Leave',
      note: 'Doctor appointment'
    },
    user: { userId: 'admin-test' }
  };
  let responseData = null;
  const res = {
    json: (d) => { responseData = d; },
    status: (code) => ({ json: (d) => { responseData = { code, ...d }; } })
  };

  await createManualRecord(reqAdd, res);
  console.log('Saved Half-Day Leave record response success:', responseData?.success);

  const recAfterAdd = await AttendanceRecord.findOne({ employeeId: empId, date: testDate });
  console.log('Attendance Record status:', recAfterAdd?.status, 'isHalfDay:', recAfterAdd?.isHalfDay);

  const balAfterAdd = await LeaveBalance.findOne({ employeeId: empId, year });
  const usedAfterAdd = balAfterAdd.balances.find(b => b.leaveTypeCode === 'casual')?.used || 0;
  console.log('Casual leave used after adding Half-Day Leave:', usedAfterAdd, '(diff:', usedAfterAdd - initialUsed, ')');

  // 3. Test Payroll calculation
  const { buildPayrollPayslips } = require('./dist/services/payrollCalculation');
  const PayrollRun = mongoose.connection.db.collection('payrollruns');
  let mockRun = await PayrollRun.findOne({ periodMonth: 6, periodYear: 2026 });
  if (!mockRun) {
    mockRun = {
      _id: new mongoose.Types.ObjectId(),
      periodMonth: 6,
      periodYear: 2026,
      title: 'June 2026',
      currency: 'PKR',
      status: 'Draft'
    };
  }
  const payrollResult = await buildPayrollPayslips(mockRun, { persist: false });
  const slip = payrollResult.payslips.find(p => p.employeeId === empId);
  const halfDayPenalties = (slip?.deductions || []).filter(d => d.component && d.component.toLowerCase().includes('half'));
  console.log('Payroll half-day deductions for employee:', halfDayPenalties);

  // 4. Simulate changing status back to Present
  const reqRevert = {
    body: {
      employeeId: empId,
      date: testDate,
      status: 'Present',
      checkIn: '2026-06-15T04:00:00.000Z',
      checkOut: '2026-06-15T13:00:00.000Z'
    },
    user: { userId: 'admin-test' }
  };
  await createManualRecord(reqRevert, res);
  const balAfterRevert = await LeaveBalance.findOne({ employeeId: empId, year });
  const usedAfterRevert = balAfterRevert.balances.find(b => b.leaveTypeCode === 'casual')?.used || 0;
  console.log('Casual leave used after reverting to Present:', usedAfterRevert, '(restored to initial:', usedAfterRevert === initialUsed, ')');

  // Clean up test attendance record
  await AttendanceRecord.deleteOne({ employeeId: empId, date: testDate });
  console.log('Cleaned up test record');

  process.exit(0);
}
test().catch(err => {
  console.error(err);
  process.exit(1);
});

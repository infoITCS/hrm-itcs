import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../server/.env') });

import Employee from '../server/src/models/Employee';
import AttendanceRecord from '../server/src/models/AttendanceRecord';

async function debug() {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'hrm' });
    
    // 1. Find the employee for the user who is logged in
    const employees = await Employee.find({ userId: { $exists: true } }).lean();
    console.log('Employees with userId:', JSON.stringify(employees.map((e: any) => ({ id: e._id, eid: e.employeeId, userId: e.userId, name: e.firstName })), null, 2));
    
    // 2. Check attendance records for today (2026-04-28)
    const today = '2026-04-28';
    const records = await AttendanceRecord.find({ date: today }).lean();
    console.log(`Records for ${today}:`, JSON.stringify(records, null, 2));
    
    await mongoose.disconnect();
}

debug();

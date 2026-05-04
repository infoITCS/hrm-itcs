const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../server/.env') });

async function debug() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: 'hrm' });
        console.log('Connected to DB');

        // Define schemas briefly to avoid "MissingSchemaError"
        const Employee = mongoose.models.Employee || mongoose.model('Employee', new mongoose.Schema({ userId: String, employeeId: String, firstName: String }));
        const AttendanceRecord = mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', new mongoose.Schema({ employeeId: String, date: String, status: String }));

        // 1. List employees with userId
        const employees = await Employee.find({ userId: { $exists: true } }).lean();
        console.log('Employees with userId:', JSON.stringify(employees.map(e => ({ id: e._id, eid: e.employeeId, userId: e.userId, name: e.firstName })), null, 2));
        
        // 2. Check attendance records for today (2026-04-28)
        const today = '2026-04-28';
        const records = await AttendanceRecord.find({ date: today }).lean();
        console.log(`Records for ${today}:`, JSON.stringify(records, null, 2));
        
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

debug();

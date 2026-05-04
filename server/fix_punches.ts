import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, 'src', '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

import AttendancePunch from './src/models/AttendancePunch';
import Employee from './src/models/Employee';

async function fixPunches() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error("CRITICAL: MONGODB_URI is not defined in environment variables.");
        process.exit(1);
    }

    console.log("Connecting to DB...");
    await mongoose.connect(mongoUri);
    console.log("Connected.");

    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(todayStr + 'T00:00:00.000Z');

    console.log("Fetching employees...");
    const employees = await Employee.find({ biometricPin: { $exists: true, $ne: '' } }).lean();
    console.log(`Found ${employees.length} employees with biometric pins.`);

    let updated = 0;
    for (const emp of employees as any[]) {
        const result = await AttendancePunch.updateMany(
            { 
                machineUserId: emp.biometricPin,
                employeeId: { $ne: emp.employeeId },
                punchTime: { $gte: startOfDay }
            },
            {
                $set: { employeeId: emp.employeeId }
            }
        );
        if (result.modifiedCount > 0) {
            const maskedPin = emp.biometricPin.length > 4 
                ? `****${emp.biometricPin.slice(-4)}` 
                : '****';
            console.log(`Updated ${result.modifiedCount} punches for employee ${emp.employeeId} (PIN: ${maskedPin})`);
            updated += result.modifiedCount;
        }
    }

    console.log(`Total punches fixed: ${updated}`);
    try {
        await mongoose.disconnect();
        console.log("Disconnected.");
    } catch (err) {
        console.error("Error during disconnect:", err);
    }
}

fixPunches().catch(console.error);

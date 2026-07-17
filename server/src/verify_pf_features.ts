import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { AuthUtils } from './middleware/auth.utils';
import User from './models/User.model';
import Employee from './models/Employee';
import mongoose from 'mongoose';

async function run() {
    // CRITICAL: Must connect with dbName: 'hrm' to match the server's database!
    await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'hrm' });
    console.log("Connected to MongoDB database 'hrm'");

    // Find an admin user
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
        console.error("No admin user found in DB");
        await mongoose.disconnect();
        return;
    }

    const token = AuthUtils.generateToken({
        userId: admin._id.toString(),
        email: admin.email,
        role: admin.role
    });

    console.log("Using token for admin:", admin.email);

    // Dynamic employee selection: Find any active employee in the DB
    const employee = await Employee.findOne({ isDeleted: { $ne: true } });
    if (!employee) {
        console.error("No employee found in DB");
        await mongoose.disconnect();
        return;
    }

    const empId = employee.employeeId;
    const initialBalance = employee.providentFundBalance || 0;
    const initialHistory = employee.providentFundHistory || [];
    console.log(`Found Employee: ${employee.firstName} ${employee.lastName || ''} (ID: ${empId})`);
    console.log(`Initial PF Balance: Rs. ${initialBalance}`);

    // Test 1: POST /api/employees/:id/pf-adjust (Manual Adjustment)
    const adjustUrl = `http://localhost:5000/api/employees/${empId}/pf-adjust`;
    console.log(`Testing POST /api/employees/${empId}/pf-adjust...`);
    
    try {
        const adjustRes = await fetch(adjustUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: 5000,
                type: 'credit',
                description: 'Test manual script adjustment credit',
                periodMonth: 7,
                periodYear: 2026
            })
        });

        console.log("Adjust Response Status:", adjustRes.status);
        const adjustBody = await adjustRes.json();
        console.log("Adjust Response Message:", adjustBody.message);
        console.log("Adjusted Employee Balance:", adjustBody.employee?.providentFundBalance);

        // Verify balance in database updated
        const updatedEmployee = await Employee.findOne({ employeeId: empId });
        console.log(`Verified DB Balance: Rs. ${updatedEmployee?.providentFundBalance}`);

        // Test 2: GET /api/employees/:id/pf-statement-pdf (PDF Statement Download)
        const pdfUrl = `http://localhost:5000/api/employees/${empId}/pf-statement-pdf?token=${token}`;
        console.log(`Testing GET /api/employees/${empId}/pf-statement-pdf...`);

        const pdfRes = await fetch(pdfUrl);
        console.log("PDF Response Status:", pdfRes.status);
        console.log("PDF Content-Type:", pdfRes.headers.get('content-type'));
        console.log("PDF Content-Disposition:", pdfRes.headers.get('content-disposition'));

        // Clean up: use updateOne to bypass mongoose required-validation failures on other fields (e.g. lastName)
        await Employee.updateOne(
            { employeeId: empId },
            {
                $set: {
                    providentFundBalance: initialBalance,
                    providentFundHistory: initialHistory
                }
            }
        );
        console.log("Restored test employee original PF state successfully via updateOne");

    } catch (err: any) {
        console.error("Test failed with error:", err.message);
    }

    await mongoose.disconnect();
}

run().catch(console.error);

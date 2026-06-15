const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: __dirname + '/.env' });

async function fixBalances() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // We can just find the LeaveBalance collection and set all negative used to 0, and clear pending
        // Better: let's recalculate from LeaveRequest collection

        const db = mongoose.connection.db;
        const leaveRequests = await db.collection('leaverequests').find({}).toArray();
        const leaveTypes = await db.collection('leavetypes').find({ isActive: true }).toArray();

        // Group requests by employee and year
        const balances = {}; // employeeId_year_leaveTypeCode -> { used: 0, pending: 0 }

        for (const leave of leaveRequests) {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            
            const reqCode = leave.type.toLowerCase().trim();
            const type = leaveTypes.find(t => t.name === leave.type || t.code === reqCode);
            const code = type ? type.code : reqCode;

            const dates = [];
            let cur = new Date(start);
            while (cur <= end) {
                dates.push(new Date(cur));
                cur.setDate(cur.getDate() + 1);
            }

            const yearDaysMap = new Map();
            for (let i = 0; i < dates.length; i++) {
                const d = dates[i];
                let isSandwiched = false;
                if (d.getDay() !== 0 && d.getDay() !== 6) {
                    isSandwiched = true;
                } else {
                    let hasBefore = false;
                    let hasAfter = false;
                    for (let j = 0; j < i; j++) {
                        if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) { hasBefore = true; break; }
                    }
                    for (let j = i + 1; j < dates.length; j++) {
                        if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) { hasAfter = true; break; }
                    }
                    if (hasBefore && hasAfter) isSandwiched = true;
                }

                if (isSandwiched) {
                    const year = d.getFullYear();
                    let dayDeduction = 1;
                    if (leave.duration && leave.duration !== 'Full Day' && dates.length === 1) {
                        dayDeduction = leave.totalDays || 0.5;
                    }
                    yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + dayDeduction);
                }
            }

            for (const [year, days] of yearDaysMap.entries()) {
                const key = `${leave.employeeId}_${year}_${code}`;
                if (!balances[key]) balances[key] = { used: 0, pending: 0 };
                
                if (leave.status === 'Approved') {
                    balances[key].used += days;
                } else if (leave.status === 'Pending') {
                    balances[key].pending += days;
                }
            }
        }

        const leaveBalances = await db.collection('leavebalances').find({}).toArray();
        for (const balance of leaveBalances) {
            let modified = false;
            if (!balance.balances || !Array.isArray(balance.balances)) continue;
            for (let cat of balance.balances) {
                const key = `${balance.employeeId}_${balance.year}_${cat.leaveTypeCode}`;
                const calc = balances[key] || { used: 0, pending: 0 };
                if (cat.used !== calc.used || cat.pending !== calc.pending) {
                    console.log(`Fixing ${balance.employeeId} year ${balance.year} category ${cat.leaveTypeCode}: used ${cat.used}->${calc.used}, pending ${cat.pending}->${calc.pending}`);
                    cat.used = calc.used;
                    cat.pending = calc.pending;
                    modified = true;
                }
            }
            if (modified) {
                await db.collection('leavebalances').updateOne(
                    { _id: balance._id },
                    { $set: { balances: balance.balances } }
                );
            }
        }

        console.log('Done fixing balances');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixBalances();

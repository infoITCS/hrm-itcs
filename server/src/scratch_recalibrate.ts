import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../server/.env') });

async function run() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrm';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
        console.error('No DB connection');
        process.exit(1);
    }

    const employees = await db.collection('employees').find({}).toArray();
    console.log(`Found ${employees.length} employees:`);
    employees.forEach(e => {
        console.log(`- ${e.employeeId}: ${e.firstName} ${e.lastName} (isDeleted: ${e.isDeleted})`);
    });

    // Check counters collection
    const counters = await db.collection('counters').find({}).toArray();
    console.log('Current Counters:', counters);

    // Calculate real highest number
    let maxSeq = 0;
    for (const emp of employees) {
        if (emp.isDeleted) continue;
        const match = (emp.employeeId || '').match(/^itcs-(\d+)$/i);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxSeq) maxSeq = num;
        }
    }

    console.log(`New accurate seq counter will be set to: ${maxSeq}`);
    await db.collection('counters').updateOne(
        { key: 'employeeId' },
        { $set: { seq: maxSeq } },
        { upsert: true }
    );

    console.log('Counter successfully recalibrated to', maxSeq);
    await mongoose.disconnect();
}

run().catch(console.error);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyIndices() {
    const MONGO_URI = process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('MONGODB_URI missing');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI, { dbName: 'hrm' });
        const db = mongoose.connection.db;
        if (!db) throw new Error('DB not found');

        const depts = await db.collection('departments').indexes();
        const desigs = await db.collection('designations').indexes();

        console.log('Departments Indices:', JSON.stringify(depts, null, 2));
        console.log('Designations Indices:', JSON.stringify(desigs, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

verifyIndices();

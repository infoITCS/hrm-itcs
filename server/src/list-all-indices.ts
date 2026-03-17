import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function listAllIndices() {
    const MONGO_URI = process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('MONGODB_URI missing');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI, { dbName: 'hrm' });
        const db = mongoose.connection.db;
        if (!db) throw new Error('DB not found');

        const collections = await db.listCollections().toArray();
        for (const col of collections) {
            const indexes = await db.collection(col.name).indexes();
            console.log(`--- Collection: ${col.name} ---`);
            console.log(JSON.stringify(indexes, null, 2));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

listAllIndices();

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function dropIndexAcrossAll() {
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
            const collection = db.collection(col.name);
            const indexes = await collection.indexes();
            if (indexes.some(idx => idx.name === 'code_1')) {
                console.log(`Dropping code_1 from ${col.name}...`);
                await collection.dropIndex('code_1');
                console.log(`Dropped from ${col.name}`);
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

dropIndexAcrossAll();

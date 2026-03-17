import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function findCodeIndex() {
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
            const hasCode = indexes.some(idx => idx.name === 'code_1');
            if (hasCode) {
                console.log(`FOUND code_1 in collection: ${col.name}`);
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

findCodeIndex();

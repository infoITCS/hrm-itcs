import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function dropPhantomIndex() {
    const MONGO_URI = process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('MONGODB_URI missing');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI, { dbName: 'hrm' });
        console.log('Connected to DB (hrm)');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database not found');
        }
        const collections = ['departments', 'designations'];

        for (const colName of collections) {
            console.log(`Checking collection: ${colName}`);
            const collection = db.collection(colName);
            const indexes = await collection.indexes();
            console.log(`Current indexes for ${colName}:`, JSON.stringify(indexes, null, 2));

            const hasCodeIndex = indexes.some(idx => idx.name === 'code_1');
            if (hasCodeIndex) {
                console.log(`Dropping code_1 from ${colName}...`);
                await collection.dropIndex('code_1');
                console.log(`Successfully dropped code_1 from ${colName}`);
            } else {
                console.log(`No code_1 index found in ${colName}`);
            }
        }

        await mongoose.disconnect();
        console.log('Done');
    } catch (err) {
        console.error('Error:', err);
    }
}

dropPhantomIndex();

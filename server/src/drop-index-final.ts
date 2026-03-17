import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function dropIndexProperly() {
    const MONGO_URI = process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('MONGODB_URI missing');
        process.exit(1);
    }

    try {
        console.log('Connecting to hrm database...');
        await mongoose.connect(MONGO_URI, { dbName: 'hrm' });
        
        const db = mongoose.connection.db;
        if (!db) throw new Error('DB connection failed');

        const collections = ['departments', 'designations'];

        for (const colName of collections) {
            console.log(`Working on collection: ${colName}`);
            const collection = db.collection(colName);
            
            try {
                // List indices first
                const indices = await collection.indexes();
                console.log(`Found indices for ${colName}:`, indices.map(i => i.name));

                if (indices.some(i => i.name === 'code_1')) {
                    console.log(`Dropping code_1 from ${colName}...`);
                    await collection.dropIndex('code_1');
                    console.log(`Success! code_1 dropped from ${colName}`);
                } else {
                    console.log(`code_1 not found in ${colName}`);
                }
            } catch (err: any) {
                console.error(`Error in ${colName}:`, err.message);
            }
        }

        await mongoose.disconnect();
        console.log('Disconnected.');
    } catch (err: any) {
        console.error('Fatal Error:', err.message);
    }
}

dropIndexProperly();

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { runZktSync } from './services/zktCloudService';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function triggerSync() {
    try {
        console.log('Connecting to DB...');
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI environment variable not set');
        }
        await mongoose.connect(mongoUri, {
            dbName: 'hrm',
            serverSelectionTimeoutMS: 5000
        });
        console.log('Connected to DB');
        
        if (process.env.NODE_ENV !== 'production') {
            console.log('ZKTECO_API_URL:', process.env.ZKTECO_API_URL);
        }
        console.log('ZKTECO_TOKEN_PREFIX:', (process.env.ZKTECO_TOKEN_PREFIX || '').slice(0, 4) + '***');

        console.log('Triggering ZKT Sync...');
        const result = await runZktSync();
        console.log('Sync Result:', JSON.stringify(result, null, 2));
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (err: any) {
        console.error('CRITICAL Sync Error:', err.message);
        if (err.response) {
            try {
                const body = await err.response.text();
                console.error('Response Body:', body);
            } catch {}
        }
        await mongoose.disconnect();
        process.exit(1);
    }
}

triggerSync();

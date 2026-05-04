import dotenv from 'dotenv';
import path from 'path';
import { checkServerStatus } from './services/zktCloudService';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
    console.log('Checking status of:', process.env.ZKTECO_API_URL);
    try {
        const status = await checkServerStatus();
        console.log('Status Result:', JSON.stringify(status, null, 2));
        process.exit(0);
    } catch (error: any) {
        console.error('Failed to check server status:', error.message || error);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

check();

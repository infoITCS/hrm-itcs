import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Holiday from '../models/Holiday';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function migrate() {
    try {
        console.log('Connecting to MongoDB...');
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error('CRITICAL ERROR: MONGODB_URI is not defined in environment.');
            process.exit(1);
        }
        await mongoose.connect(uri);
        console.log('Connected.');

        console.log('Migrating Holiday locations from "Main Office" to "ISB-Office"...');
        
        // Find documents with 'Main Office'
        const mainOfficeHolidays = await Holiday.find({ location: 'Main Office' });
        console.log(`Found ${mainOfficeHolidays.length} holidays to migrate.`);

        for (const holiday of mainOfficeHolidays) {
            try {
                // Check if a holiday with same date and 'ISB-Office' already exists
                const existing = await Holiday.findOne({ 
                    date: holiday.date, 
                    location: 'ISB-Office' 
                });

                if (existing) {
                    console.log(`Conflict found for date ${holiday.date}. Deleting old 'Main Office' record.`);
                    await Holiday.deleteOne({ _id: holiday._id });
                } else {
                    holiday.location = 'ISB-Office';
                    await holiday.save();
                    console.log(`Migrated holiday: ${holiday.name} (${holiday.date})`);
                }
            } catch (err) {
                console.error(`Failed to migrate holiday ${holiday._id}:`, err);
            }
        }

        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

migrate();

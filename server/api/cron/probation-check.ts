// Vercel Cron Job for probation status updates
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Employee from '../../src/models/Employee';

dotenv.config();

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        // Connect to MongoDB
        if (!mongoose.connections[0].readyState) {
            await mongoose.connect(process.env.MONGODB_URI as string, {
                dbName: 'hrm'
            });
        }

        const today = new Date();
        
        // Find employees whose probation ends today or has passed
        const result = await Employee.updateMany(
            {
                'employmentStatus.probationEndDate': { $lte: today },
                'employmentStatus.status': 'Probation',
                'employmentStatus.autoUpdated': { $ne: true }
            },
            {
                $set: {
                    'employmentStatus.status': 'Permanent',
                    'employmentStatus.autoUpdated': true
                }
            }
        );

        return res.status(200).json({ 
            message: 'Probation check completed',
            updated: result.modifiedCount 
        });
    } catch (error: any) {
        console.error('Error in probation check:', error);
        return res.status(500).json({ message: error.message });
    }
}


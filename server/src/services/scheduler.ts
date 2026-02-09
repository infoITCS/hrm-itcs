
import cron from 'node-cron';
import Employee from '../models/Employee';

// Run every day at midnight
export const initScheduler = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily probation check...');
        try {
            const today = new Date();
            // Find employees whose probation ends today or has passed, AND are still in "Probation"
            // Note: In real app, you might want to match "Probation" exact string or ID
            const result = await Employee.updateMany(
                {
                    'employmentStatus.probationEndDate': { $lte: today },
                    'employmentStatus.status': 'Probation',
                    'employmentStatus.autoUpdated': { $ne: true } // Prevent double updating
                },
                {
                    $set: {
                        'employmentStatus.status': 'Permanent',
                        'employmentStatus.autoUpdated': true
                    }
                }
            );

            if (result.modifiedCount > 0) {
                console.log(`Updated ${result.modifiedCount} employees from Probation to Permanent.`);
            }
        } catch (error) {
            console.error('Error in probation scheduler:', error);
        }
    });
};

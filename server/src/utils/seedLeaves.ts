import LeaveType from '../models/LeaveType';
import logger from '../utils/logger';

export async function seedLeaveTypes() {
    try {
        await LeaveType.updateOne(
            { name: 'Annual Leave' },
            { $setOnInsert: { code: 'annual', defaultDays: 20, isPaid: true, isActive: true } },
            { upsert: true }
        );

        await LeaveType.updateOne(
            { name: 'Sick Leave' },
            { $setOnInsert: { code: 'sick', defaultDays: 10, isPaid: true, isActive: true } },
            { upsert: true }
        );

        // Ensure Unpaid Leave is completely removed from database
        await LeaveType.deleteMany({
            $or: [
                { name: { $regex: /^unpaid leave$/i } },
                { code: 'unpaid' }
            ]
        });
        
        // Remove unpaid leave balances from employee balances if present
        const LeaveBalance = require('../models/LeaveBalance').default;
        if (LeaveBalance) {
            await LeaveBalance.updateMany(
                { 'balances.leaveTypeCode': 'unpaid' },
                { $pull: { balances: { leaveTypeCode: 'unpaid' } } }
            );
        }
    } catch (err) {
        logger.error('Error seeding leave types:', err);
    }
}
export default seedLeaveTypes;

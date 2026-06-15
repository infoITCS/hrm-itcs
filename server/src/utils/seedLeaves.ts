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
    } catch (err) {
        logger.error('Error seeding leave types:', err);
    }
}
export default seedLeaveTypes;

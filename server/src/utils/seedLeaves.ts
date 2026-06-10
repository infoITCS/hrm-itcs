import LeaveType from '../models/LeaveType';
import logger from '../utils/logger';

export async function seedLeaveTypes() {
    try {
        const annualCount = await LeaveType.countDocuments({ code: 'annual' });
        if (annualCount === 0) {
            await LeaveType.create({
                name: 'Annual Leave',
                code: 'annual',
                defaultDays: 20,
                isPaid: true,
                isActive: true
            });
            logger.info('Seeded default Annual Leave');
        }

        const sickCount = await LeaveType.countDocuments({ code: 'sick' });
        if (sickCount === 0) {
            await LeaveType.create({
                name: 'Sick Leave',
                code: 'sick',
                defaultDays: 10,
                isPaid: true,
                isActive: true
            });
            logger.info('Seeded default Sick Leave');
        }
    } catch (err) {
        logger.error('Error seeding leave types:', err);
    }
}
export default seedLeaveTypes;

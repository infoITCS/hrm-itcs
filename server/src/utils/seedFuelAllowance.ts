import Employee from '../models/Employee';
import Counter from '../models/Counter';
import logger from './logger';
import { ensureFuelAllowance } from './defaultSalaryComponents';

const MIGRATION_KEY = 'migration_fuel_allowance_4000_v1';

/**
 * One-time migration: add Fuel Allowance (PKR 4,000) to every employee salary structure.
 */
export async function seedFuelAllowanceForAllEmployees(): Promise<void> {
    try {
        const marker = await Counter.findOne({ key: MIGRATION_KEY }).lean();
        if (marker) return;

        const employees = await Employee.find({ isDeleted: { $ne: true } })
            .select('_id salaryComponents')
            .lean();

        let updated = 0;
        for (const emp of employees) {
            const next = ensureFuelAllowance(emp.salaryComponents as any[]);
            const changed = JSON.stringify(next) !== JSON.stringify(emp.salaryComponents || []);
            if (changed) {
                await Employee.updateOne({ _id: emp._id }, { $set: { salaryComponents: next } });
                updated++;
            }
        }

        await Counter.findOneAndUpdate(
            { key: MIGRATION_KEY },
            { $set: { seq: 1 } },
            { upsert: true }
        );

        logger.info(`Fuel Allowance (PKR 4,000) applied to ${updated} employee(s).`);
    } catch (err) {
        logger.error('Failed to seed Fuel Allowance for employees:', err);
    }
}

import ExpenseCategory from '../models/ExpenseCategory';
import logger from '../utils/logger';

export async function seedExpenseCategories() {
    try {
        const count = await ExpenseCategory.countDocuments();
        if (count === 0) {
            const defaults = [
                {
                    name: 'Medical',
                    isActive: true,
                    policyLimit: 60000,
                    subCategories: ['Consultation', 'Pharmacy / Medicines', 'Lab Test / Diagnostics', 'Hospitalization', 'Dental Treatment', 'Optical / Glasses', 'Other Medical'],
                    requiresReceipt: true
                },
                {
                    name: 'Training & Certification',
                    isActive: true,
                    policyLimit: 0,
                    subCategories: ['Course Fee', 'Certification Exam Fee', 'Books / Study Material', 'Workshop / Seminar Fee', 'Other Training'],
                    requiresReceipt: false
                },
                {
                    name: 'Travel',
                    isActive: true,
                    policyLimit: 0,
                    subCategories: ['Hotel Accommodation', 'Flight / Train Ticket', 'Fuel / Mileage', 'Taxi / Ride Share', 'Meals / Per Diem', 'Other Travel'],
                    requiresReceipt: false
                },
                {
                    name: 'Sales/Customer Gifts',
                    isActive: true,
                    policyLimit: 0,
                    subCategories: ['Customer Lunch / Dinner', 'Client Entertainment', 'Corporate Gift Item', 'Other Sales Expense'],
                    requiresReceipt: false
                },
                {
                    name: 'Other',
                    isActive: true,
                    policyLimit: 0,
                    subCategories: ['Office Supplies', 'Software Subscription', 'Internet / Mobile Bill', 'Miscellaneous'],
                    requiresReceipt: false
                }
            ];

            await ExpenseCategory.insertMany(defaults);
            logger.info('Seeded default Expense Categories');
        }
    } catch (err) {
        logger.error('Error seeding expense categories:', err);
    }
}

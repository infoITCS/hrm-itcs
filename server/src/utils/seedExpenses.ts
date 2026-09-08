import ExpenseCategory from '../models/ExpenseCategory';
import logger from '../utils/logger';

export async function seedExpenseCategories() {
    try {
        const defaults = [
            {
                name: 'Office Rent',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Karachi', 'Lahore', 'Islamabad'],
                requiresReceipt: true,
                assignedTo: 'Finance'
            },
            {
                name: 'Utilities',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Telephone', 'UAN', 'Electricity', 'Gas', 'Water', 'Other utilities'],
                requiresReceipt: true,
                assignedTo: 'Finance'
            },
            {
                name: 'Postage Charges',
                isActive: true,
                policyLimit: 0,
                subCategories: ['All postage-related expenses', 'Courier Charges', 'Mailing / Postage Stamps'],
                requiresReceipt: true,
                assignedTo: 'Finance'
            },
            {
                name: 'Postage and Delivery',
                isActive: true,
                policyLimit: 0,
                subCategories: ['TCS', 'Leopards', 'M&P', 'By Air', 'Air Lift', 'By Land', 'By Sea', 'Daewoo FastEx', 'BlueEx', 'Other'],
                requiresReceipt: true,
                assignedTo: 'Finance'
            },
            {
                name: 'Meal Allowance',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Employee Meal', 'Customer Meal', 'Other Meal'],
                requiresReceipt: true,
                assignedTo: 'Finance'
            },
            {
                name: 'Other',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Miscellaneous expenses', 'Office Supplies', 'Software Subscription', 'Internet / Mobile Bill'],
                requiresReceipt: false,
                assignedTo: 'Finance'
            },
            {
                name: 'Medical',
                isActive: true,
                policyLimit: 60000,
                subCategories: ['Consultation', 'Pharmacy / Medicines', 'Lab Test / Diagnostics', 'Hospitalization', 'Dental Treatment', 'Optical / Glasses', 'Other Medical'],
                requiresReceipt: true,
                assignedTo: 'HR'
            },
            {
                name: 'Training & Certification',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Course Fee', 'Certification Exam Fee', 'Books / Study Material', 'Workshop / Seminar Fee', 'Other Training'],
                requiresReceipt: false,
                assignedTo: 'HR'
            },
            {
                name: 'Travel',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Hotel Accommodation', 'Flight / Train Ticket', 'Fuel / Mileage', 'Taxi / Ride Share', 'Meals / Per Diem', 'Other Travel'],
                requiresReceipt: false,
                assignedTo: 'HR'
            },
            {
                name: 'Sales/Customer Gifts',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Customer Lunch / Dinner', 'Client Entertainment', 'Corporate Gift Item', 'Other Sales Expense'],
                requiresReceipt: false,
                assignedTo: 'HR'
            }
        ];

        for (const cat of defaults) {
            const existing = await ExpenseCategory.findOne({ name: cat.name });
            if (!existing) {
                await ExpenseCategory.create(cat);
            } else {
                const mergedSubCats = Array.from(new Set([...(existing.subCategories || []), ...cat.subCategories]));
                existing.assignedTo = cat.assignedTo as 'HR' | 'Finance';
                existing.subCategories = mergedSubCats;
                if (!existing.requiresReceipt && cat.requiresReceipt) {
                    existing.requiresReceipt = cat.requiresReceipt;
                }
                await existing.save();
            }
        }
        logger.info('Seeded and synchronized Expense Categories with Finance/HR routing');
    } catch (err) {
        logger.error('Error seeding expense categories:', err);
    }
}

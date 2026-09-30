import ExpenseCategory from '../models/ExpenseCategory';
import ExpenseClaim from '../models/ExpenseClaim';
import Employee from '../models/Employee';
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
                assignedTo: 'Finance' as const
            },
            {
                name: 'Utilities',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Telephone', 'UAN', 'Electricity', 'Gas', 'Water', 'Other utilities'],
                requiresReceipt: true,
                assignedTo: 'Finance' as const
            },
            {
                name: 'Postage and Delivery',
                isActive: true,
                policyLimit: 0,
                subCategories: [
                    'TCS',
                    'Leopards',
                    'M&P',
                    'Courier Charges',
                    'Mailing / Postage Stamps',
                    'By Air',
                    'Air Lift',
                    'By Land',
                    'By Sea',
                    'Daewoo FastEx',
                    'BlueEx',
                    'All postage-related expenses',
                    'Other'
                ],
                requiresReceipt: true,
                assignedTo: 'Finance' as const
            },
            {
                name: 'Meal Allowance / Kitchen Expenses',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Employee Meal', 'Customer Meal', 'Kitchen Expenses', 'Groceries / Pantry', 'Tea & Coffee', 'Other Meal'],
                requiresReceipt: true,
                assignedTo: 'Finance' as const
            },
            {
                name: 'Other',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Miscellaneous expenses', 'Office Supplies', 'Software Subscription', 'Internet / Mobile Bill'],
                requiresReceipt: false,
                assignedTo: 'Finance' as const
            },
            {
                name: 'Medical',
                isActive: true,
                policyLimit: 60000,
                subCategories: ['Consultation', 'Pharmacy / Medicines', 'Lab Test / Diagnostics', 'Hospitalization', 'Dental Treatment', 'Optical / Glasses', 'Other Medical'],
                requiresReceipt: true,
                assignedTo: 'HR' as const
            },
            {
                name: 'Training & Certification',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Course Fee', 'Certification Exam Fee', 'Books / Study Material', 'Workshop / Seminar Fee', 'Other Training'],
                requiresReceipt: false,
                assignedTo: 'Manager' as const
            },
            {
                name: 'Travel & Fuel',
                isActive: true,
                policyLimit: 0,
                fuelRatePerUnit: 35,
                subCategories: [
                    'Fuel / Mileage',
                    'Petrol / Diesel / CNG',
                    'Taxi / Ride Share',
                    'Hotel Accommodation',
                    'Flight / Train Ticket',
                    'Meals / Per Diem',
                    'Other Travel & Fuel'
                ],
                requiresReceipt: false,
                assignedTo: 'Manager' as const
            },
            {
                name: 'Sales/Customer Gifts',
                isActive: true,
                policyLimit: 0,
                subCategories: ['Customer Lunch / Dinner', 'Client Entertainment', 'Corporate Gift Item', 'Other Sales Expense'],
                requiresReceipt: false,
                assignedTo: 'Manager' as const
            }
        ];

        // 1. Rename 'Meal Allowance' category to 'Meal Allowance / Kitchen Expenses' if exists
        const oldMealCat = await ExpenseCategory.findOne({ name: 'Meal Allowance' });
        if (oldMealCat) {
            oldMealCat.name = 'Meal Allowance / Kitchen Expenses';
            await oldMealCat.save();
            await ExpenseClaim.updateMany({ category: 'Meal Allowance' }, { $set: { category: 'Meal Allowance / Kitchen Expenses' } });
        }

        // 2. Remove obsolete 'Postage Charges' category and remap any claims to 'Postage and Delivery'
        const oldPostageCat = await ExpenseCategory.findOne({ name: 'Postage Charges' });
        if (oldPostageCat) {
            await ExpenseCategory.deleteOne({ _id: oldPostageCat._id });
            await ExpenseClaim.updateMany({ category: 'Postage Charges' }, { $set: { category: 'Postage and Delivery' } });
        }

        // 3. Merge legacy 'Travel' and 'Fuel' categories into single 'Travel & Fuel'
        const legacyTravel = await ExpenseCategory.findOne({ name: 'Travel' });
        const legacyFuel = await ExpenseCategory.findOne({ name: 'Fuel' });
        if (legacyTravel || legacyFuel) {
            let combinedCat = await ExpenseCategory.findOne({ name: 'Travel & Fuel' });
            const allSubCats = new Set<string>([
                'Fuel / Mileage',
                'Petrol / Diesel / CNG',
                'Taxi / Ride Share',
                'Hotel Accommodation',
                'Flight / Train Ticket',
                'Meals / Per Diem',
                'Other Travel & Fuel'
            ]);
            if (legacyTravel?.subCategories) legacyTravel.subCategories.forEach((sc: string) => allSubCats.add(sc));
            if (legacyFuel?.subCategories) legacyFuel.subCategories.forEach((sc: string) => allSubCats.add(sc));

            if (!combinedCat) {
                combinedCat = await ExpenseCategory.create({
                    name: 'Travel & Fuel',
                    isActive: true,
                    policyLimit: 0,
                    fuelRatePerUnit: legacyFuel?.fuelRatePerUnit || legacyTravel?.fuelRatePerUnit || 35,
                    subCategories: Array.from(allSubCats),
                    requiresReceipt: false,
                    assignedTo: 'Manager'
                });
            } else {
                combinedCat.subCategories = Array.from(new Set([...(combinedCat.subCategories || []), ...allSubCats]));
                if (!combinedCat.fuelRatePerUnit || combinedCat.fuelRatePerUnit === 0) {
                    combinedCat.fuelRatePerUnit = legacyFuel?.fuelRatePerUnit || legacyTravel?.fuelRatePerUnit || 35;
                }
                await combinedCat.save();
            }

            // Remap existing claims
            await ExpenseClaim.updateMany(
                { category: { $in: ['Travel', 'Fuel'] } },
                { $set: { category: 'Travel & Fuel' } }
            );

            // Clean up obsolete categories
            await ExpenseCategory.deleteMany({ name: { $in: ['Travel', 'Fuel'] } });
        }

        // 4. Auto-heal and migrate any legacy 'teamLead' / 'Pending Team Lead' data
        try {
            await ExpenseClaim.updateMany(
                { status: 'Pending Team Lead' },
                { $set: { status: 'Pending Line Manager' } }
            );
            await ExpenseClaim.updateMany(
                { 'approvals.stage': 'teamLead' },
                { $set: { 'approvals.$[elem].stage': 'lineManager' } },
                { arrayFilters: [{ 'elem.stage': 'teamLead' }] }
            );

            const stuckClaims = await ExpenseClaim.find({
                status: 'Pending Finance',
                'approvals': {
                    $elemMatch: {
                        stage: { $in: ['lineManager', 'hr'] },
                        status: 'Pending'
                    }
                }
            });

            for (const claim of stuckClaims) {
                let modified = false;
                for (const a of (claim.approvals || [])) {
                    if (a.stage !== 'finance' && a.status === 'Pending') {
                        a.status = 'Approved';
                        a.comments = a.comments || 'Bypassed by Admin for Finance review';
                        a.decidedAt = a.decidedAt || new Date();
                        modified = true;
                    }
                }
                if (!claim.approvals?.some((a: any) => a.stage === 'finance')) {
                    claim.approvals = claim.approvals || [];
                    claim.approvals.push({
                        stage: 'finance',
                        status: 'Pending',
                        amountAllowed: claim.amountAllowed,
                    } as any);
                    modified = true;
                }
                if (modified) {
                    claim.markModified('approvals');
                    await claim.save();
                    console.log(`[AutoHeal] Unlocked stuck claim ${claim.claimNo} for Finance approval`);
                }
            }
        } catch (healErr) {
            console.error('[AutoHeal] Error healing stuck Pending Finance claims:', healErr);
        }

        // 5. Seed / sync categories
        for (const cat of defaults) {
            const existing = await ExpenseCategory.findOne({ name: cat.name });
            if (!existing) {
                await ExpenseCategory.create(cat);
            } else {
                const mergedSubCats = Array.from(new Set([...(existing.subCategories || []), ...cat.subCategories]));
                existing.assignedTo = cat.assignedTo;
                existing.subCategories = mergedSubCats;
                if (!existing.requiresReceipt && cat.requiresReceipt) {
                    existing.requiresReceipt = cat.requiresReceipt;
                }
                if (cat.fuelRatePerUnit && (!existing.fuelRatePerUnit || existing.fuelRatePerUnit === 0)) {
                    existing.fuelRatePerUnit = cat.fuelRatePerUnit;
                }
                await existing.save();
            }
        }

        // 5. One-time Migration for existing pending claims to match updated workflow
        // A) Manager-assigned categories: Travel & Fuel, Training & Certification, Sales/Customer Gifts
        const managerCategories = ['Travel & Fuel', 'Training & Certification', 'Sales/Customer Gifts'];
        const pendingManagerClaims = await ExpenseClaim.find({
            category: { $in: managerCategories },
            status: 'Pending HR'
        });

        for (const claim of pendingManagerClaims) {
            let reportingManagerId = '';
            const emp = await Employee.findOne({
                $or: [
                    { employeeId: claim.employeeId },
                    { userId: claim.employeeUserId }
                ]
            }).select('jobInfo.reportingManager').lean() as any;

            if (emp?.jobInfo?.reportingManager) {
                const mgrDoc = await Employee.findOne({
                    $or: [
                        { employeeId: emp.jobInfo.reportingManager },
                        { userId: emp.jobInfo.reportingManager }
                    ]
                }).select('employeeId').lean() as any;
                reportingManagerId = mgrDoc?.employeeId || String(emp.jobInfo.reportingManager);
            }

            claim.status = 'Pending Line Manager';
            (claim as any).approvals = [
                {
                    stage: 'lineManager',
                    status: 'Pending',
                    assignedToEmployeeId: reportingManagerId || undefined,
                    amountAllowed: claim.amountAllowed,
                    requiresAuthorization: false
                } as any,
                {
                    stage: 'finance',
                    status: 'Pending',
                    amountAllowed: claim.amountAllowed,
                    requiresAuthorization: false
                } as any
            ];
            await claim.save();
        }

        // B) Finance direct categories: Office Rent, Utilities, Postage and Delivery, Meal Allowance / Kitchen Expenses, Other
        const financeCategories = ['Office Rent', 'Utilities', 'Postage and Delivery', 'Meal Allowance / Kitchen Expenses', 'Other'];
        const pendingFinanceClaims = await ExpenseClaim.find({
            category: { $in: financeCategories },
            status: 'Pending HR'
        });

        for (const claim of pendingFinanceClaims) {
            claim.status = 'Pending Finance';
            (claim as any).approvals = [
                {
                    stage: 'finance',
                    status: 'Pending',
                    amountAllowed: claim.amountAllowed,
                    requiresAuthorization: false
                } as any
            ];
            await claim.save();
        }

        logger.info('Seeded and synchronized Expense Categories with Manager/HR/Finance routing');
    } catch (err) {
        logger.error('Error seeding expense categories:', err);
    }
}

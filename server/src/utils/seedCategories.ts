import CustomRequestCategory from '../models/CustomRequestCategory';

export const seedRequestCategories = async () => {
    try {
        const defaultCategories = [
            {
                title: 'Generate Document',
                description: 'Instantly generate verifiable letters and salary slips.',
                icon: 'FileText',
                options: [
                    'Job Offer Letter',
                    'Internship Offer Letter',
                    'Appointment Letter',
                    'Employment Contract',
                    'Pay Slip',
                    'Consolidated Pay Slip (3 Months)',
                    'Consolidated Pay Slip (6 Months)',
                    'No Objection Certificate (NOC)',
                    'Character Certificate',
                    'Income Verification Letter',
                    'Experience Letter',
                    'Employment Certificate',
                    'Internship Completion Certificate',
                    'Relieving Letter'
                ],
                systemType: 'document',
                isDeletable: false
            },
            {
                title: 'Request Loan',
                description: 'Apply for a loan against your Provident Fund balance.',
                icon: 'Banknote',
                options: [],
                systemType: 'loan',
                isDeletable: false
            },
            {
                title: 'Request Asset',
                description: 'Request business cards, employee books, and pens.',
                icon: 'Package',
                options: ['Employee Card', 'Employee Book', 'Employee Pen', 'Business Cards'],
                systemType: 'generic',
                isDeletable: false
            },
            {
                title: 'Loan Pause Request',
                description: 'Request emergency temporary waiver / pause of your monthly loan deduction.',
                icon: 'PauseCircle',
                options: [],
                systemType: 'generic',
                isDeletable: false
            }
        ];

        for (const cat of defaultCategories) {
            await CustomRequestCategory.findOneAndUpdate(
                { title: cat.title },
                {
                    $set: {
                        description: cat.description,
                        icon: cat.icon,
                        options: cat.options,
                        systemType: cat.systemType,
                        isDeletable: cat.isDeletable
                    }
                },
                { upsert: true, new: true }
            );
        }
    } catch (error) {
        console.error('Error seeding request categories:', error);
    }
};

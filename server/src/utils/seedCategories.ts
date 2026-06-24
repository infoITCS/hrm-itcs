import CustomRequestCategory from '../models/CustomRequestCategory';

export const seedRequestCategories = async () => {
    try {
        const count = await CustomRequestCategory.countDocuments({ isDeletable: false });
        if (count === 0) {
            console.log('Seeding default request categories...');

            const defaultCategories = [
                {
                    title: 'Generate Document',
                    description: 'Instantly generate verifiable letters and salary slips.',
                    icon: 'FileText',
                    options: ['Experience Letter', 'Financial Experience Letter', 'Salary Slip', 'Offer Letter'],
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
                }
            ];

            for (const cat of defaultCategories) {
                await CustomRequestCategory.findOneAndUpdate(
                    { title: cat.title },
                    cat,
                    { upsert: true, new: true }
                );
            }
            
            console.log('Successfully seeded request categories.');
        }
    } catch (error) {
        console.error('Error seeding request categories:', error);
    }
};

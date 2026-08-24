import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { encryptNumber } from '../utils/encryption';

async function runMigration() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hrm-itcs';
    console.log('Connecting to MongoDB for Financial Encryption Migration...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully to MongoDB.');

    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established.');
    }

    // 1. Migrate Employees
    const employeeCol = db.collection('employees');
    const rawEmployees = await employeeCol.find({}).toArray();
    console.log(`Found ${rawEmployees.length} employees to check for encryption.`);

    let encryptedEmpCount = 0;

    for (const emp of rawEmployees) {
        let modified = false;
        const updates: any = {};

        // Finance Info
        if (emp.financeInfo) {
            if (typeof emp.financeInfo.probationSalary === 'number' || (typeof emp.financeInfo.probationSalary === 'string' && !emp.financeInfo.probationSalary.startsWith('enc:v1:'))) {
                updates['financeInfo.probationSalary'] = encryptNumber(emp.financeInfo.probationSalary);
                modified = true;
            }
            if (typeof emp.financeInfo.confirmedSalary === 'number' || (typeof emp.financeInfo.confirmedSalary === 'string' && !emp.financeInfo.confirmedSalary.startsWith('enc:v1:'))) {
                updates['financeInfo.confirmedSalary'] = encryptNumber(emp.financeInfo.confirmedSalary);
                modified = true;
            }
        }

        // Salary Components
        if (Array.isArray(emp.salaryComponents)) {
            let scModified = false;
            const updatedSc = emp.salaryComponents.map((sc: any) => {
                if (typeof sc?.amount === 'number' || (typeof sc?.amount === 'string' && !sc.amount.startsWith('enc:v1:'))) {
                    scModified = true;
                    return { ...sc, amount: encryptNumber(sc.amount) };
                }
                return sc;
            });
            if (scModified) {
                updates.salaryComponents = updatedSc;
                modified = true;
            }
        }

        // Provident Fund Balance
        if (typeof emp.providentFundBalance === 'number' || (typeof emp.providentFundBalance === 'string' && !emp.providentFundBalance.startsWith('enc:v1:'))) {
            updates.providentFundBalance = encryptNumber(emp.providentFundBalance);
            modified = true;
        }

        // Provident Fund History
        if (Array.isArray(emp.providentFundHistory)) {
            let pfModified = false;
            const updatedPf = emp.providentFundHistory.map((pf: any) => {
                if (typeof pf?.amount === 'number' || (typeof pf?.amount === 'string' && !pf.amount.startsWith('enc:v1:'))) {
                    pfModified = true;
                    return { ...pf, amount: encryptNumber(pf.amount) };
                }
                return pf;
            });
            if (pfModified) {
                updates.providentFundHistory = updatedPf;
                modified = true;
            }
        }

        // Salary History
        if (Array.isArray(emp.salaryHistory)) {
            let shModified = false;
            const updatedSh = emp.salaryHistory.map((sh: any) => {
                let itemModified = false;
                const newSh = { ...sh };
                if (typeof sh?.amount === 'number' || (typeof sh?.amount === 'string' && !sh.amount.startsWith('enc:v1:'))) {
                    newSh.amount = encryptNumber(sh.amount);
                    itemModified = true;
                }
                if (typeof sh?.previousAmount === 'number' || (typeof sh?.previousAmount === 'string' && !sh.previousAmount.startsWith('enc:v1:'))) {
                    newSh.previousAmount = encryptNumber(sh.previousAmount);
                    itemModified = true;
                }
                if (Array.isArray(sh?.components)) {
                    newSh.components = sh.components.map((c: any) => {
                        if (typeof c?.amount === 'number' || (typeof c?.amount === 'string' && !c.amount.startsWith('enc:v1:'))) {
                            itemModified = true;
                            return { ...c, amount: encryptNumber(c.amount) };
                        }
                        return c;
                    });
                }
                if (itemModified) shModified = true;
                return newSh;
            });
            if (shModified) {
                updates.salaryHistory = updatedSh;
                modified = true;
            }
        }

        if (modified) {
            await employeeCol.updateOne({ _id: emp._id }, { $set: updates });
            encryptedEmpCount++;
        }
    }
    console.log(`✓ Migrated ${encryptedEmpCount} employee records to encrypted format.`);

    // 2. Migrate Payslips
    const payslipCol = db.collection('payslips');
    const rawPayslips = await payslipCol.find({}).toArray();
    console.log(`Found ${rawPayslips.length} payslips to check for encryption.`);

    let encryptedPayslipCount = 0;

    for (const p of rawPayslips) {
        let modified = false;
        const updates: any = {};

        const scalarFields = ['grossPay', 'netPay', 'totalDeductions', 'taxDeduction', 'loanDeduction', 'pfPayout'];
        scalarFields.forEach(field => {
            if (typeof p[field] === 'number' || (typeof p[field] === 'string' && !p[field].startsWith('enc:v1:'))) {
                updates[field] = encryptNumber(p[field]);
                modified = true;
            }
        });

        // Earnings
        if (Array.isArray(p.earnings)) {
            let earnModified = false;
            const updatedEarnings = p.earnings.map((e: any) => {
                if (typeof e?.amount === 'number' || (typeof e?.amount === 'string' && !e.amount.startsWith('enc:v1:'))) {
                    earnModified = true;
                    return { ...e, amount: encryptNumber(e.amount) };
                }
                return e;
            });
            if (earnModified) {
                updates.earnings = updatedEarnings;
                modified = true;
            }
        }

        // Deductions
        if (Array.isArray(p.deductions)) {
            let dedModified = false;
            const updatedDeductions = p.deductions.map((d: any) => {
                if (typeof d?.amount === 'number' || (typeof d?.amount === 'string' && !d.amount.startsWith('enc:v1:'))) {
                    dedModified = true;
                    return { ...d, amount: encryptNumber(d.amount) };
                }
                return d;
            });
            if (dedModified) {
                updates.deductions = updatedDeductions;
                modified = true;
            }
        }

        if (modified) {
            await payslipCol.updateOne({ _id: p._id }, { $set: updates });
            encryptedPayslipCount++;
        }
    }
    console.log(`✓ Migrated ${encryptedPayslipCount} payslip records to encrypted format.`);

    console.log('--- MIGRATION COMPLETED SUCCESSFULLY ---');
    await mongoose.disconnect();
    process.exit(0);
}

runMigration().catch((err) => {
    console.error('Migration failed with error:', err);
    process.exit(1);
});

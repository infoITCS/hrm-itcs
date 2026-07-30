import EmployeeRequest from '../models/EmployeeRequest';
import ExpenseClaim from '../models/ExpenseClaim';
import PayrollRun from '../models/PayrollRun';
import User from '../models/User.model';
import { sendPendingErpTasksReminderEmail } from '../utils/email';
import logger from '../utils/logger';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_AGO = () => new Date(Date.now() - 48 * 60 * 60 * 1000);

export async function checkPendingErpTasksAndNotify() {
    try {
        const thresholdDate = FORTY_EIGHT_HOURS_AGO();

        // 1. Fetch Finance team user emails strictly
        const financeUsers = await User.find({ role: 'finance' }).select('email').lean();
        let financeEmails = financeUsers.map((u: any) => u.email).filter(Boolean);

        if (financeEmails.length === 0 && process.env.FINANCE_EMAILS) {
            financeEmails = process.env.FINANCE_EMAILS.split(',').map(e => e.trim()).filter(Boolean);
        }

        if (financeEmails.length === 0) {
            return;
        }

        const taskItems: Array<{ type: string; description: string; ageHours: number }> = [];

        // 2. Query Approved Loans without ERP ID > 48h
        const pendingLoans = await EmployeeRequest.find({
            status: 'Approved',
            category: { $in: ['Loan', 'Request Loan'] },
            $or: [{ erpReferenceId: { $exists: false } }, { erpReferenceId: null }, { erpReferenceId: '' }],
            updatedAt: { $lte: thresholdDate }
        }).lean();

        for (const loan of pendingLoans) {
            const ageHours = Math.round((Date.now() - new Date(loan.updatedAt).getTime()) / (1000 * 60 * 60));
            const amt = loan.details?.requestedAmount ? `Rs. ${loan.details.requestedAmount.toLocaleString()}` : '';
            taskItems.push({
                type: 'Loan Payout',
                description: `Employee #${loan.employeeId} - ${amt} Loan`,
                ageHours
            });
        }

        // 3. Query Approved Claims without ERP ID > 48h
        const pendingClaims = await ExpenseClaim.find({
            status: 'Approved',
            $or: [{ erpReferenceId: { $exists: false } }, { erpReferenceId: null }, { erpReferenceId: '' }],
            updatedAt: { $lte: thresholdDate }
        }).lean();

        for (const claim of pendingClaims) {
            const ageHours = Math.round((Date.now() - new Date(claim.updatedAt).getTime()) / (1000 * 60 * 60));
            const amt = claim.approvedTotal || claim.amountAllowed ? `Rs. ${(claim.approvedTotal || claim.amountAllowed).toLocaleString()}` : '';
            taskItems.push({
                type: `${claim.category || 'Expense'} Claim`,
                description: `Claim #${claim.claimNo} - ${amt}`,
                ageHours
            });
        }

        // 4. Query Disbursed Payroll Runs without ERP ID > 48h
        const pendingPayroll = await PayrollRun.find({
            status: 'Disbursed',
            $or: [{ erpReferenceId: { $exists: false } }, { erpReferenceId: null }, { erpReferenceId: '' }],
            updatedAt: { $lte: thresholdDate }
        }).lean();

        for (const run of pendingPayroll) {
            const ageHours = Math.round((Date.now() - new Date(run.updatedAt).getTime()) / (1000 * 60 * 60));
            taskItems.push({
                type: 'Payroll Run',
                description: `${run.title} Disbursed`,
                ageHours
            });
        }

        if (taskItems.length > 0) {
            const recipientStr = [...new Set(financeEmails)].join(', ');
            await sendPendingErpTasksReminderEmail(recipientStr, taskItems.length, taskItems);
            logger.info(`[CronService] Sent pending ERP task reminder to Finance (${recipientStr}) for ${taskItems.length} item(s).`);
        }
    } catch (err: any) {
        logger.error('[CronService] Failed to check pending ERP tasks:', err.message);
    }
}

export function initCronService() {
    logger.info('[CronService] Initializing 24-hour background task reminder scheduler for Finance.');
    
    // Initial check on server start after 30 seconds
    setTimeout(() => {
        void checkPendingErpTasksAndNotify();
    }, 30000);

    // Recurring 24-hour interval timer
    setInterval(() => {
        void checkPendingErpTasksAndNotify();
    }, TWENTY_FOUR_HOURS_MS);
}

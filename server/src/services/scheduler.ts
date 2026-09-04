import cron from 'node-cron';
import Employee from '../models/Employee';
import User from '../models/User.model';
import AuditLog from '../models/AuditLog';
import { sendProfileReminderEmail, sendBirthdayEmail, sendWorkAnniversaryEmail } from '../utils/email';
import { runZktSync } from './zktCloudService';
import { syncFromMachineReport, autoCloseIncompleteRecords, processDailyAbsenteeism } from './attendanceProcessor';
import { upgradeCompletedProbations } from './probationUpgradeService';
import logger from '../utils/logger';


let isSchedulerInitialized = false;

// Note: Vercel serverless functions have execution time limits.
// For production on Vercel, disable this and use Vercel Cron Jobs instead.
export const initScheduler = () => {
    if (process.env.VERCEL) {
        logger.info('Scheduler disabled on Vercel. Use Vercel Cron Jobs for scheduled tasks.');
        return;
    }

    if (isSchedulerInitialized) {
        return;
    }
    isSchedulerInitialized = true;

    // ── Probation Auto-Upgrade: Run every day at midnight ─────────────────────────
    cron.schedule('0 0 * * *', async () => {
        logger.info('Running daily probation check...');
        try {
            await upgradeCompletedProbations();
        } catch (error) {
            logger.error('Error in probation scheduler:', error);
        }
    }, { timezone: 'Asia/Karachi' });

const isEmployeeProfileComplete = (emp: any, user?: any): boolean => {
    if (!emp) return false;

    // 1. Personal Information (20%)
    const hasPersonal = !!(
        emp.firstName &&
        emp.lastName &&
        (emp.cnic || emp.nationalId) &&
        emp.dateOfBirth
    );
    if (!hasPersonal) return false;

    // 2. Contact & Emergency (20%)
    const hasContact = !!(
        (emp.address?.city || emp.address?.streetAddress || emp.address?.street || emp.phone) &&
        (Array.isArray(emp.emergencyContacts) && emp.emergencyContacts.some((ec: any) => ec.name || ec.phone || ec.relation))
    );
    if (!hasContact) return false;

    // 3. Education & Employment History (20%)
    const hasHistory = !!(
        (Array.isArray(emp.education) && emp.education.some((edu: any) => edu.level || edu.institute)) ||
        (Array.isArray(emp.employmentHistory) && emp.employmentHistory.some((eh: any) => eh.companyName || eh.jobTitle))
    );
    if (!hasHistory) return false;

    // 4. Skills & Profiles (20%)
    const hasSkills = !!(
        (Array.isArray(emp.skills) && emp.skills.length > 0) ||
        (Array.isArray(emp.socialProfiles) && emp.socialProfiles.some((sp: any) => sp.link || sp.url))
    );
    if (!hasSkills) return false;

    // 5. Identity Documents (20%)
    const attachments = emp.attachments || [];
    const hasCnicFront = attachments.some((a: any) => 
        /cnic.*front|front.*cnic|national.*id.*front|identity.*front/i.test(a.fileType || '') || 
        /cnic.*front|front.*cnic|national.*id.*front/i.test(a.fileName || a.name || a.originalName || '') ||
        a.fileType === 'CNIC Front' || 
        a.fileType === 'CNIC (Front)'
    );

    const hasCnicBack = attachments.some((a: any) => 
        /cnic.*back|back.*cnic|national.*id.*back|identity.*back/i.test(a.fileType || '') || 
        /cnic.*back|back.*cnic|national.*id.*back/i.test(a.fileName || a.name || a.originalName || '') ||
        a.fileType === 'CNIC Back' || 
        a.fileType === 'CNIC (Back)'
    );

    const hasDegree = attachments.some((a: any) => 
        /degree|transcript|certificate|mark\s*sheet|education/i.test(a.fileType || '') || 
        /degree|transcript|certificate|mark\s*sheet|education|bachelor|master|matric|inter|diploma|graduation/i.test(a.fileName || a.name || a.originalName || '') ||
        a.fileType?.startsWith('Education') ||
        a.fileType?.startsWith('Certification') ||
        (a.fileType === 'Other Documents' || a.fileType === 'Other' || a.fileType?.includes('Other'))
    );

    const hasPicture = !!emp.avatar || !!user?.avatar || attachments.some((a: any) => 
        /picture|avatar|photo|profile/i.test(a.fileType || '') ||
        /picture|avatar|photo|profile/i.test(a.fileName || a.name || a.originalName || '')
    );

    return !!(hasCnicFront && hasCnicBack && hasDegree && hasPicture);
};

    // ── Profile Completion Reminder: Run every day at 12:20 PM ──────────────────────
    cron.schedule('20 12 * * *', async () => {
        logger.info('Running daily onboarding profile completion reminder check...');
        try {
            const activeUsers = await User.find({ isActive: true, role: 'employee' }).select('email firstName avatar').lean();
            const activeEmployees = await Employee.find({
                'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] }
            }).select('-attachments.fileData').lean() as any[];

            // Map employees by both userId (string & ObjectId) and email addresses
            const empByUserId = new Map<string, any>();
            const empByEmail = new Map<string, any>();

            for (const emp of activeEmployees) {
                if (emp.userId) {
                    empByUserId.set(String(emp.userId), emp);
                }
                if (emp.email) {
                    empByEmail.set(emp.email.toLowerCase().trim(), emp);
                }
                if (emp.workEmail) {
                    empByEmail.set(emp.workEmail.toLowerCase().trim(), emp);
                }
            }

            // Filter down to only users whose profile is truly incomplete (< 100%)
            const incompleteUsers = activeUsers.filter((u: any) => {
                const uidStr = String(u._id);
                const uEmail = (u.email || '').toLowerCase().trim();
                const matchedEmp = empByUserId.get(uidStr) || empByEmail.get(uEmail);

                // If no employee profile exists or required fields are not complete (< 100%), send reminder
                return !isEmployeeProfileComplete(matchedEmp, u);
            });

            const results = await Promise.allSettled(
                incompleteUsers.map((u: any) =>
                    u.email ? sendProfileReminderEmail(u.email, u.firstName || 'Employee') : Promise.resolve()
                )
            );

            const sent = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            if (sent > 0 || failed > 0) {
                logger.info(`Profile reminders: ${sent} sent, ${failed} failed (out of ${incompleteUsers.length} incomplete profiles).`);
            }
        } catch (error) {
            logger.error('Error in profile reminder scheduler:', error);
        }
    }, { timezone: 'Asia/Karachi' });

    // ── Birthday & Anniversary: Run every day at 8 AM ────────────────────────────
    cron.schedule('0 8 * * *', async () => {
        logger.info('Running daily birthday and anniversary check...');
        try {
            const today = new Date();
            const currentMonth = today.getMonth() + 1;
            const currentDay = today.getDate();

            const employees = await Employee.find({
                $or: [
                    {
                        $expr: {
                            $and: [
                                { $eq: [{ $month: '$dateOfBirth' }, currentMonth] },
                                { $eq: [{ $dayOfMonth: '$dateOfBirth' }, currentDay] }
                            ]
                        }
                    },
                    {
                        $expr: {
                            $and: [
                                { $eq: [{ $month: '$jobInfo.joiningDate' }, currentMonth] },
                                { $eq: [{ $dayOfMonth: '$jobInfo.joiningDate' }, currentDay] }
                            ]
                        }
                    }
                ]
            }).select('firstName workEmail email dateOfBirth jobInfo.joiningDate').lean();

            await Promise.allSettled(employees.map(async (emp) => {
                const isBirthday = emp.dateOfBirth &&
                    (new Date(emp.dateOfBirth).getMonth() + 1 === currentMonth) &&
                    (new Date(emp.dateOfBirth).getDate() === currentDay);

                const isAnniversary = emp.jobInfo?.joiningDate &&
                    (new Date(emp.jobInfo.joiningDate).getMonth() + 1 === currentMonth) &&
                    (new Date(emp.jobInfo.joiningDate).getDate() === currentDay);

                const email = emp.workEmail || (emp.email as string);
                if (!email) return;

                if (isBirthday) {
                    await sendBirthdayEmail(email, emp.firstName);
                }

                if (isAnniversary && emp.jobInfo?.joiningDate) {
                    const years = today.getFullYear() - new Date(emp.jobInfo.joiningDate).getFullYear();
                    if (years > 0) {
                        await sendWorkAnniversaryEmail(email, emp.firstName, years);
                    }
                }
            }));
        } catch (error) {
            logger.error('Error in birthday/anniversary scheduler:', error);
        }
    }, { timezone: 'Asia/Karachi' });

    // ── Daily Absenteeism Check: Run every day at 11:00 PM ─────────────────────
    cron.schedule('0 23 * * *', async () => {
        const today = new Date().toISOString().slice(0, 10);
        logger.info(`[Scheduler] Running daily absenteeism check for ${today}...`);
        try {
            const count = await processDailyAbsenteeism(today);
            if (count > 0) {
                logger.info(`[Scheduler] Daily absenteeism check: Marked ${count} employees as absent/on-leave/weekend.`);
            }
        } catch (error) {
            logger.error('[Scheduler] Error in daily absenteeism check:', error);
        }
    }, { timezone: 'Asia/Karachi' });

    // ── Nightly Machine Sync: Run every day at 11:30 PM ─────────────────────
    cron.schedule('30 23 * * *', async () => {
        const today = new Date().toISOString().slice(0, 10);
        logger.info(`[Scheduler] Starting machine-report sync for ${today}...`);
        try {
            const processedCount = await syncFromMachineReport(today);
            logger.info(`[Scheduler] Machine-report sync complete. Processed ${processedCount} records.`);
        } catch (error) {
            logger.error('[Scheduler] Error in nightly report sync task:', error);
        }
    }, { timezone: 'Asia/Karachi' });

    // ── Auto-Close Incomplete Records: Run every day at 11:05 PM PKT (18:05 UTC) ─
    cron.schedule('5 23 * * *', async () => {
        const dateStr = new Date().toISOString().slice(0, 10);
        logger.info(`[Scheduler] Running auto-close for ${dateStr}...`);
        try {
            const result = await autoCloseIncompleteRecords();
            logger.info(`[Scheduler] Auto-close done. Processed: ${result.processed}, Skipped: ${result.skipped}`);
        } catch (error) {
            logger.error('[Scheduler] Error in auto-close task:', error);
        }
    }, { timezone: 'Asia/Karachi' });

    // ── ZKTeco Cloud API Auto-Sync: Every 5 seconds ───────────────────────────
    if (process.env.ZKTECO_API_TOKEN || process.env.BIOTIME_USER) {
        let zktSyncRunning = false;
        const ZKT_INTERVAL_MS = parseInt(process.env.ZKTECO_SYNC_INTERVAL_SECONDS || '5', 10) * 1000;

        setInterval(async () => {
            if (zktSyncRunning) return;
            zktSyncRunning = true;
            try {
                const result = await runZktSync();
                if (result.newRecords > 0) {
                    logger.info(`[ZKT Sync] ✅ ${result.newRecords} new punch(es) synced. Last ID: ${result.lastTransactionId}`);
                }
            } catch (err: any) {
                logger.warn(`[ZKT Sync] ⚠️ Sync failed: ${err.message}`);
            } finally {
                zktSyncRunning = false;
            }
        }, ZKT_INTERVAL_MS);

        logger.info(`[ZKT Sync] Auto-sync started. Polling every ${ZKT_INTERVAL_MS / 1000}s.`);
    }
};

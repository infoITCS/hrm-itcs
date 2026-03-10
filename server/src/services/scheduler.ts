import cron from 'node-cron';
import Employee from '../models/Employee';
import User from '../models/User.model';
import AuditLog from '../models/AuditLog';
import { sendProfileReminderEmail, sendBirthdayEmail, sendWorkAnniversaryEmail } from '../utils/email';

// Run every day at midnight
// Note: Vercel serverless functions have execution time limits
// For production, consider using Vercel Cron Jobs or external scheduler
export const initScheduler = () => {
    // Only run scheduler if not on Vercel (use Vercel Cron Jobs instead)
    if (process.env.VERCEL) {
        console.log('Scheduler disabled on Vercel. Use Vercel Cron Jobs for scheduled tasks.');
        return;
    }
    
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily probation check...');
        try {
            const today = new Date();
            // Find employees whose probation ends today or has passed, AND are still in "Probation"
            const eligibleEmployees = await Employee.find({
                'employmentStatus.probationEndDate': { $lte: today },
                'employmentStatus.status': 'Probation',
                'employmentStatus.autoUpdated': { $ne: true }
            });

            for (const emp of eligibleEmployees) {
                emp.employmentStatus = {
                    ...emp.employmentStatus,
                    status: 'Permanent',
                    autoUpdated: true
                } as any;
                await emp.save();

                // Create a traceable audit log entry for each auto-upgrade
                await AuditLog.create({
                    action: 'UPDATE',
                    targetResource: 'Employee',
                    targetId: emp.employeeId,
                    performedBy: 'System',
                    details: {
                        diff: {
                            'employmentStatus.status': { old: 'Probation', new: 'Permanent' },
                            'employmentStatus.autoUpdated': { old: false, new: true }
                        },
                        reason: 'Automatic probation period completion'
                    }
                });
            }

            if (eligibleEmployees.length > 0) {
                console.log(`Auto-upgraded ${eligibleEmployees.length} employees from Probation to Permanent.`);
            }
        } catch (error) {
            console.error('Error in probation scheduler:', error);
        }
    });

    // Reminder Scheduler: Run every day at 10 AM
    cron.schedule('0 10 * * *', async () => {
        console.log('Running daily onboarding profile completion reminder check...');
        try {
            // Only send reminders to active users with 'employee' role
            // Admins, managers, and super-admins are excluded intentionally
            const users = await User.find({ isActive: true, role: 'employee' });
            const employees = await Employee.find();

            for (const user of users) {
                const emp = employees.find(e => e.userId === user._id.toString());
                let isComplete = false;

                if (emp) {
                    const personalComplete = !!(emp.firstName && emp.lastName && emp.cnic && emp.dateOfBirth);
                    const jobComplete = !!(emp.jobInfo && emp.jobInfo.designation !== "Employee" && emp.jobInfo.department !== "General");
                    const bankComplete = !!(emp.bankDetails?.bankName && emp.bankDetails?.accountNumber);

                    // Simplistic check. You could refine to match exactly the frontend
                    isComplete = personalComplete && jobComplete && bankComplete;
                }

                // If not complete, send email
                if (!isComplete && user.email) {
                    console.log(`Sending profile reminder to: ${user.email}`);
                    await sendProfileReminderEmail(user.email, user.firstName || 'Employee');
                }
            }
        } catch (error) {
            console.error('Error in profile reminder scheduler:', error);
        }
    });

    // Birthday & Anniversary Scheduler: Run every day at 8 AM
    cron.schedule('0 8 * * *', async () => {
        console.log('Running daily birthday and anniversary check...');
        try {
            const today = new Date();
            const currentMonth = today.getMonth() + 1;
            const currentDay = today.getDate();

            const employees = await Employee.find({
                $or: [
                    {
                        $expr: {
                            $and: [
                                { $eq: [{ $month: "$dateOfBirth" }, currentMonth] },
                                { $eq: [{ $dayOfMonth: "$dateOfBirth" }, currentDay] }
                            ]
                        }
                    },
                    {
                        $expr: {
                            $and: [
                                { $eq: [{ $month: "$jobInfo.joiningDate" }, currentMonth] },
                                { $eq: [{ $dayOfMonth: "$jobInfo.joiningDate" }, currentDay] }
                            ]
                        }
                    }
                ]
            });

            const todayStr = `${currentMonth}-${currentDay}`;

            for (const emp of employees) {
                // Determine if it's birthday or anniversary
                const isBirthday = emp.dateOfBirth && 
                                 (emp.dateOfBirth.getMonth() + 1 === currentMonth) && 
                                 (emp.dateOfBirth.getDate() === currentDay);
                
                const isAnniversary = emp.jobInfo?.joiningDate && 
                                    (emp.jobInfo.joiningDate.getMonth() + 1 === currentMonth) && 
                                    (emp.jobInfo.joiningDate.getDate() === currentDay);

                // Use private/work email prefer work email
                const email = emp.workEmail || (emp.email as string);
                if (!email) continue;

                if (isBirthday) {
                    console.log(`Sending birthday email to: ${email}`);
                    await sendBirthdayEmail(email, emp.firstName);
                }

                if (isAnniversary) {
                    const joiningDate = emp.jobInfo?.joiningDate;
                    if (joiningDate) {
                        const years = today.getFullYear() - joiningDate.getFullYear();
                        if (years > 0) {
                            console.log(`Sending anniversary email to: ${email} for ${years} years`);
                            await sendWorkAnniversaryEmail(email, emp.firstName, years);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in birthday/anniversary scheduler:', error);
        }
    });

};

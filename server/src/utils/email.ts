import nodemailer from 'nodemailer';
import logger from './logger';


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false // Often required for Office 365 on cloud environments
    }
});

/**
 * Helper to determine the frontend URL.
 * Priority: 
 * 1. Provided URL (e.g. from request headers)
 * 2. process.env.FRONTEND_URL
 * 3. process.env.CLIENT_URL
 * 4. Default localhost
 */
const getBaseUrl = (providedUrl?: string) => {
    const envUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL;

    // 1. Prioritize any configured URL that ISN'T localhost (from .env)
    if (envUrl && !envUrl.includes('localhost')) {
        return envUrl;
    }

    // 2. Fallback to provided URL (from request headers) ONLY if it's not localhost
    if (providedUrl && !providedUrl.includes('localhost')) {
        return providedUrl;
    }

    // 3. Absolute fallback: The production live link
    // This ensures that even when testing locally, emails contain working live links.
    return 'https://hrm-itcs-client.vercel.app';
};

const getSenderName = (defaultSuffix: string = 'Team') => {
    return process.env.EMAIL_FROM_NAME || `ITCS HRM ${defaultSuffix}`;
};

export const sendPasswordResetEmail = async (to: string, resetToken: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5; text-align: center;">Password Reset Request</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello,</p>
                <p style="color: #4b5563; font-size: 16px;">We received a request to reset your password. Click the button below to choose a new one:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Reset Password</a>
                </div>
                <p style="color: #4b5563; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
                <hr style="border: none; border-top: 1px solid #eaeaec; margin: 20px 0;" />
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">This link will expire in 1 hour.</p>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.warn('⚠️ SMTP_USER is not configured. Email will not be actually sent.');
        logger.info(`\n================= PASSWORD RESET EMAIL ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Reset URL: [REDACTED]`);
        logger.info(`==========================================================\n`);
        return { success: process.env.NODE_ENV !== 'production' };
    }

    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error: any) {
        logger.error(`❌ Email sending failed to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
};

export const sendWelcomeEmail = async (to: string, tempPassword?: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const loginUrl = `${clientUrl}/login`;

    const credentialsSection = tempPassword ? `
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-family: monospace;"><strong>Email:</strong> ${to}</p>
            <p style="margin: 10px 0 0 0; font-family: monospace;"><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p style="color: #ef4444; font-size: 14px;"><strong>Please change your password immediately after logging in.</strong></p>
    ` : `
        <p style="color: #4b5563; font-size: 16px;">You can log in using your Microsoft account via Single Sign-On (SSO).</p>
    `;

    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: 'Welcome to ITCS HRM - Account Created',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5; text-align: center;">Welcome to ITCS HRM!</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello,</p>
                <p style="color: #4b5563; font-size: 16px;">Your account has been successfully created. Please log in to complete your onboarding profile.</p>
                ${credentialsSection}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Login to Dashboard</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= WELCOME EMAIL ===================`);
        logger.info(`To: ${to}`);
        // H6 FIX: Do NOT log tempPassword — it may appear in shared/exported logs
        logger.info(`Has temporary password: ${!!tempPassword}`);
        logger.info(`Login URL: ${loginUrl}`);
        logger.info(`====================================================\n`);
        return process.env.NODE_ENV !== 'production';
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Email sending error:', error);
        return false;
    }
};

export const sendHRNotificationEmail = async (to: string, employeeName: string, actionDesc: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    
    const mailOptions = {
        from: `"ITCS HRM Alerts" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `HR Alert: ${employeeName} - ${actionDesc}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5;">Employee Update Notification</h2>
                <p style="color: #4b5563; font-size: 16px;"><strong>${employeeName}</strong> has ${actionDesc.toLowerCase()}.</p>
                <div style="margin: 30px 0;">
                    <a href="${clientUrl}/pim" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View Employee Profiles</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= HR NOTIFICATION EMAIL ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Action: ${employeeName} has ${actionDesc}`);
        logger.info(`===========================================================\n`);
        return process.env.NODE_ENV !== 'production';
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Email sending error:', error);
        return false;
    }
};

export const sendProfileReminderEmail = async (to: string, userName: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: 'Action Required: Complete Your Employee Profile',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5;">Profile Completion Reminder</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello ${userName},</p>
                <p style="color: #4b5563; font-size: 16px;">We noticed that your employee onboarding profile is not yet complete. Please log in to the dashboard to finish updating your details so that we can process your records.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${clientUrl}/my-info?onboarding=true" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Complete Profile Now</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= PROFILE REMINDER EMAIL ===================`);
        logger.info(`To: ${to}`);
        logger.info(`===========================================================\n`);
        return process.env.NODE_ENV !== 'production';
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Email sending error:', error);
        return false;
    }
};

export const sendBirthdayEmail = async (to: string, firstName: string) => {
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Happy Birthday, ${firstName}! 🎂`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px; background-color: #fdf2f8;">
                <h2 style="color: #db2777; text-align: center;">Happy Birthday, ${firstName}! 🎂🎉</h2>
                <div style="text-align: center; margin: 20px 0;">
                    <span style="font-size: 60px;">🎈</span>
                </div>
                <p style="color: #4b5563; font-size: 16px; text-align: center;">Wishing you a wonderful day filled with joy and celebration! We're lucky to have you as part of our team.</p>
                <div style="text-align: center; font-size: 14px; color: #9ca3af; margin-top: 30px;">
                    Best regards,<br/>The ITCS HRM Team
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= BIRTHDAY EMAIL ===================`);
        logger.info(`To: ${to}`);
        logger.info(`====================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending birthday email:', error);
        return false;
    }
};

export const sendWorkAnniversaryEmail = async (to: string, firstName: string, years: number) => {
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Congratulations on ${years} Year${years > 1 ? 's' : ''} at ITCS! 🎊`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px; background-color: #f0f9ff;">
                <h2 style="color: #0369a1; text-align: center;">Happy Work Anniversary! 🎊</h2>
                <p style="color: #4b5563; font-size: 16px; text-align: center;">Congratulations ${firstName} on completing <strong>${years} year${years > 1 ? 's' : ''}</strong> with ITCS! Thank you for your continued dedication and contributions.</p>
                <div style="text-align: center; margin: 20px 0;">
                    <span style="font-size: 60px;">🏆</span>
                </div>
                <div style="text-align: center; font-size: 14px; color: #9ca3af; margin-top: 30px;">
                    Best regards,<br/>The ITCS HRM Team
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= ANNIVERSARY EMAIL ===================`);
        logger.info(`To: ${to} (${years} years)`);
        logger.info(`========================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending anniversary email:', error);
        return false;
    }
};

export const sendLeaveSubmittedEmail = async (
    to: string,
    employeeName: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    totalDays: number,
    reason?: string,
    baseUrl?: string
) => {
    const clientUrl = getBaseUrl(baseUrl);
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `New Leave Request: ${employeeName} (${leaveType})`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5; margin-top: 0;">New Leave Request Received</h2>
                <p style="color: #4b5563; font-size: 16px;"><strong>${employeeName}</strong> has applied for <strong>${leaveType}</strong>.</p>
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
                    <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Leave Type:</strong> ${leaveType}</p>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #4b5563;"><strong>Start Date:</strong> ${startDate}</p>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #4b5563;"><strong>End Date:</strong> ${endDate}</p>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #4b5563;"><strong>Total Days:</strong> ${totalDays}</p>
                    ${reason ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #4b5563;"><strong>Reason:</strong> ${reason}</p>` : ''}
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${clientUrl}/leave" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Review Leave Request</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= LEAVE SUBMITTED EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${employeeName}, Leave Type: ${leaveType}, Days: ${totalDays}, Reason: ${reason}`);
        logger.info(`==================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending leave submitted email:', error);
        return false;
    }
};

export const sendLeaveStatusEmail = async (
    to: string,
    employeeName: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    status: string,
    actionBy?: string,
    adminNote?: string,
    baseUrl?: string
) => {
    const clientUrl = getBaseUrl(baseUrl);
    const statusColor = status === 'Approved' ? '#10b981' : (status === 'Rejected' ? '#ef4444' : '#6b7280');
    const actionByText = actionBy ? ` by <strong>${actionBy}</strong>` : '';

    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Leave Request ${status}: ${leaveType} (${startDate} to ${endDate})`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: ${statusColor}; margin-top: 0;">Leave Request ${status}</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello ${employeeName},</p>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">Your request for <strong>${leaveType}</strong> (${startDate} to ${endDate}) has been <span style="color: ${statusColor}; font-weight: bold;">${status}</span>${actionByText}.</p>
                ${adminNote ? `
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px dashed #e5e7eb; font-style: italic;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;"><strong>Remarks/Reason:</strong> "${adminNote}"</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${clientUrl}/leave" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">View Leave History</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= LEAVE STATUS EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${employeeName}, Status: ${status}, ActionBy: ${actionBy}, Note: ${adminNote}`);
        logger.info(`================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending leave status email:', error);
        return false;
    }
};

export const sendExpenseClaimSubmittedEmail = async (to: string, employeeName: string, category: string, amount: number, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `New Expense Claim: ${employeeName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5;">New Expense Claim Submitted</h2>
                <p style="color: #4b5563; font-size: 16px;"><strong>${employeeName}</strong> has submitted a new expense claim for review.</p>
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
                    <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Category:</strong> ${category}</p>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: #4b5563;"><strong>Amount:</strong> PKR ${amount.toLocaleString()}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${clientUrl}/claim" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Review Claim</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= EXPENSE CLAIM SUBMITTED EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${employeeName}, Category: ${category}, Amount: PKR ${amount}`);
        logger.info(`========================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending expense claim submitted email:', error);
        return false;
    }
};

export const sendExpenseClaimStatusEmail = async (to: string, employeeName: string, category: string, amount: number, status: string, approvedAmount?: number, adminNote?: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const statusColor = status === 'Approved' || status === 'Pending Finance' ? '#10b981' : (status === 'Declined' ? '#ef4444' : '#6b7280');
    const displayStatus = status === 'Pending Finance' ? 'Approved by HR (Awaiting Finance Disbursement)' : status;
    
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Expense Claim Update: ${category} - ${displayStatus}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5;">Expense Claim Update</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello ${employeeName},</p>
                <p style="color: #4b5563; font-size: 16px;">Your expense claim for <strong>${category}</strong> (PKR ${amount.toLocaleString()}) status is now: <span style="color: ${statusColor}; font-weight: bold;">${displayStatus}</span>.</p>
                ${approvedAmount !== undefined && approvedAmount > 0 ? `
                <div style="background-color: #ecfdf5; padding: 12px 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #a7f3d0; color: #065f46;">
                    <strong>Approved Amount:</strong> PKR ${approvedAmount.toLocaleString()}
                </div>
                ` : ''}
                ${adminNote ? `
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px dashed #e5e7eb; font-style: italic;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;"><strong>Remarks:</strong> "${adminNote}"</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${clientUrl}/claim" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">View Claims History</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= EXPENSE CLAIM STATUS EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${employeeName}, Status: ${status}, Approved Amount: ${approvedAmount}, Note: ${adminNote}`);
        logger.info(`======================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending expense claim status email:', error);
        return false;
    }
};

export const sendExpenseClaimActionRequiredEmail = async (to: string, employeeName: string, claimNo: string, category: string, amount: number, reviewerComments: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const mailOptions = {
        from: `"${getSenderName('Alerts')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Action Required: Expense Claim ${claimNo} - ${category}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fef3c7; border-radius: 10px; background-color: #fffdfa;">
                <h2 style="color: #d97706; margin-top: 0;">⚠️ Action Required on Your Claim</h2>
                <p style="color: #4b5563; font-size: 15px;">Hello ${employeeName},</p>
                <p style="color: #4b5563; font-size: 15px;">Your claim <strong>${claimNo}</strong> (${category}, PKR ${amount.toLocaleString()}) has been sent back for your review and amendment.</p>
                <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fde68a;">
                    <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: bold;">Reviewer Feedback / Requested Action:</p>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #78350f; font-style: italic;">"${reviewerComments}"</p>
                </div>
                <p style="color: #4b5563; font-size: 14px;">Please open the claim in your portal, update the necessary receipts or notes, and resubmit.</p>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${clientUrl}/claim?tab=mine" style="background-color: #d97706; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Review & Amend Claim</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= EXPENSE CLAIM ACTION REQUIRED EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Claim: ${claimNo}, Employee: ${employeeName}, Feedback: ${reviewerComments}`);
        logger.info(`===============================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending action required email:', error);
        return false;
    }
};

export const sendExpenseClaimAmendedEmail = async (to: string, employeeName: string, claimNo: string, category: string, amount: number, employeeNote?: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const mailOptions = {
        from: `"${getSenderName('Alerts')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Claim Resubmitted: ${claimNo} - ${employeeName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5; margin-top: 0;">Claim Resubmitted by Employee</h2>
                <p style="color: #4b5563; font-size: 15px;"><strong>${employeeName}</strong> has amended and resubmitted expense claim <strong>${claimNo}</strong> (${category}, PKR ${amount.toLocaleString()}).</p>
                ${employeeNote ? `
                <div style="background-color: #f9fafb; padding: 12px 15px; border-radius: 8px; margin: 15px 0; border: 1px dashed #e5e7eb; font-style: italic;">
                    <p style="margin: 0; font-size: 13px; color: #4b5563;"><strong>Employee Response:</strong> "${employeeNote}"</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${clientUrl}/claim?tab=approvals" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Review in Approvals Queue</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= EXPENSE CLAIM AMENDED & RESUBMITTED EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Claim: ${claimNo}, Employee: ${employeeName}, Note: ${employeeNote}`);
        logger.info(`====================================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending claim resubmitted email:', error);
        return false;
    }
};

export const sendAutoCloseAlertEmail = async (to: string, firstName: string, dateStr: string, autoCheckOutTime: string) => {
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Attendance Notice: Shift Auto-Closed`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px; background-color: #fffbeb;">
                <h2 style="color: #b45309; text-align: center;">Forgot to Clock Out? ⏰</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello ${firstName},</p>
                <p style="color: #4b5563; font-size: 16px;">We noticed you checked in on <strong>${dateStr}</strong> but did not check out. The system has automatically closed your shift for today at <strong>${autoCheckOutTime}</strong>.</p>
                <p style="color: #4b5563; font-size: 14px;">If this automatic checkout time is incorrect or you worked additional hours, please submit an attendance correction or contact your reporting manager.</p>
                <div style="text-align: center; font-size: 14px; color: #9ca3af; margin-top: 30px;">
                    Best regards,<br/>The ITCS HRM Team
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= AUTO CLOSE ALERT EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${firstName}, Date: ${dateStr}, Closed At: ${autoCheckOutTime}`);
        logger.info(`===================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending auto close alert email:', error);
        return false;
    }
};

export const sendEmployeeRequestSubmittedEmail = async (to: string, employeeName: string, category: string, requestType: string, details: any, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const detailRows = [];
    const isLoanPause = category === 'Loan Pause Request' || category.toLowerCase().includes('loan pause');
    if (isLoanPause && details?.periodMonth) {
        const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        detailRows.push(`<p style="margin: 5px 0;"><strong>Target Payroll Period:</strong> ${MONTHS[details.periodMonth] || details.periodMonth} ${details.periodYear || ''}</p>`);
        detailRows.push(`<p style="margin: 5px 0; color: #d97706;"><strong>Request:</strong> One-month temporary loan installment waiver / pause</p>`);
    } else if (category === 'Loan' || category === 'Request Loan' || requestType === 'Loan') {
        if (details?.requestedAmount) detailRows.push(`<p style="margin: 5px 0;"><strong>Requested Amount:</strong> Rs. ${details.requestedAmount.toLocaleString()}</p>`);
        if (details?.paybackDuration) detailRows.push(`<p style="margin: 5px 0;"><strong>Payback Duration:</strong> ${details.paybackDuration} Months</p>`);
        if (details?.recommendedMonthlyDeduction) detailRows.push(`<p style="margin: 5px 0;"><strong>Monthly Installment:</strong> Rs. ${details.recommendedMonthlyDeduction.toLocaleString()}</p>`);
    } else if (details?.quantity) {
        detailRows.push(`<p style="margin: 5px 0;"><strong>Quantity:</strong> ${details.quantity}</p>`);
    }
    if (details?.reason) {
        detailRows.push(`<p style="margin: 10px 0 0 0;"><strong>Reason / Purpose:</strong> <em>"${details.reason}"</em></p>`);
    }

    const mailOptions = {
        from: `"ITCS HRM Alerts" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `New Request for Approval: ${employeeName} - ${category}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5;">New Request Submitted</h2>
                <p style="color: #4b5563; font-size: 16px;"><strong>${employeeName}</strong> has submitted a new request for <strong>${category}</strong> (${requestType}).</p>
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6; font-size: 14px; color: #4b5563;">
                    ${detailRows.join('') || '<p>No extra details provided.</p>'}
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${clientUrl}/my-requests/manage" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Review Request</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= REQUEST SUBMITTED EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${employeeName}, Category: ${category}, Type: ${requestType}`);
        logger.info(`====================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending request submitted email:', error);
        return false;
    }
};

export const sendEmployeeRequestStatusEmail = async (to: string, employeeName: string, category: string, status: string, adminComments?: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const statusColor = status === 'Approved' || status === 'Completed' ? '#10b981' : (status === 'Rejected' ? '#ef4444' : '#6b7280');
    
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Request Status Update: ${category} - ${status}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5;">Request Status Update</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello ${employeeName},</p>
                <p style="color: #4b5563; font-size: 16px;">Your request for <strong>${category}</strong> has been <span style="color: ${statusColor}; font-weight: bold;">${status}</span>.</p>
                ${adminComments ? `
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px dashed #e5e7eb; font-style: italic;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;"><strong>Remarks:</strong> "${adminComments}"</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${clientUrl}/my-requests" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">View My Requests</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= REQUEST STATUS EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${employeeName}, Status: ${status}, Comments: ${adminComments}`);
        logger.info(`==================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending request status email:', error);
        return false;
    }
};

export const sendPendingErpTasksReminderEmail = async (to: string, pendingCount: number, taskItems: Array<{ type: string; description: string; ageHours: number }>, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const itemsHtml = taskItems.map(item => `
        <li style="margin-bottom: 10px; color: #374151;">
            <strong>${item.type}:</strong> ${item.description} <span style="color: #ef4444; font-weight: bold;">(Pending ${item.ageHours} hrs)</span>
        </li>
    `).join('');

    const mailOptions = {
        from: `"ITCS HRM Automated Alert" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `[Action Required] ${pendingCount} Pending ERP Task(s) Requiring Reference ID`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5; margin-top: 0;">Pending ERP Tasks Reminder</h2>
                <p style="color: #4b5563; font-size: 15px;">Hello Finance Team,</p>
                <p style="color: #4b5563; font-size: 15px;">You have <strong>${pendingCount}</strong> approved item(s) pending for over 48 hours without an ERP Reference ID:</p>
                
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb;">
                    <ul style="padding-left: 20px; margin: 0;">
                        ${itemsHtml}
                    </ul>
                </div>

                <p style="color: #6b7280; font-size: 14px;">Please log into the HRM system to post the transaction reference IDs to clear these pending tasks.</p>
                
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${clientUrl}/my-requests/manage" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Open Finance Dashboard</a>
                </div>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= PENDING ERP TASKS EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Pending Tasks (${pendingCount}): ${JSON.stringify(taskItems)}`);
        logger.info(`====================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        logger.error('Error sending pending ERP tasks email:', error);
        return false;
    }
};

export const sendTestEmail = async (to: string) => {
    const mailOptions = {
        from: `"ITCS HRM Test" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: 'ITCS HRM - Email System Test',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px; background-color: #f9fafb;">
                <h2 style="color: #4f46e5; text-align: center;">Email Delivery Test Successful! 🎉</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello,</p>
                <p style="color: #4b5563; font-size: 16px;">If you received this message, your ITCS HRM email server configuration (SMTP) is functioning correctly and delivering emails!</p>
                <div style="background-color: #e0e7ff; padding: 12px; border-radius: 8px; margin: 20px 0; font-size: 13px; color: #3730a3;">
                    <strong>Sender Account:</strong> ${process.env.SMTP_USER || 'Not set'}<br/>
                    <strong>SMTP Host:</strong> ${process.env.SMTP_HOST || 'smtp.office365.com'}:${process.env.SMTP_PORT || '587'}
                </div>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true, message: `Test email sent successfully to ${to}` };
    } catch (error: any) {
        logger.error('Error sending test email:', error);
        return { success: false, error: error.message || String(error) };
    }
};

export const sendPayslipDisbursedEmail = async (
    to: string,
    employeeName: string,
    monthYear: string,
    netPayFormatted: string,
    pdfBuffer: Buffer,
    filename: string,
    baseUrl?: string
) => {
    const clientUrl = getBaseUrl(baseUrl);

    const mailOptions = {
        from: `"ITCS Payroll Team" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Salary Disbursed - ${monthYear} Payslip (${employeeName})`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px; background-color: #ffffff;">
                <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center; color: #ffffff;">
                    <h2 style="margin: 0; font-size: 22px;">Salary Disbursed 🎉</h2>
                    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">${monthYear} Payroll</p>
                </div>
                <div style="padding: 24px; color: #374151;">
                    <p style="font-size: 16px; margin-top: 0;">Hello <strong>${employeeName}</strong>,</p>
                    <p style="font-size: 15px; line-height: 1.5;">Your salary for <strong>${monthYear}</strong> has been successfully processed and disbursed.</p>
                    
                    <div style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 13px; color: #6b7280; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Net Disbursed Pay</p>
                        <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: bold; color: #111827;">${netPayFormatted}</p>
                    </div>

                    <p style="font-size: 14px; color: #4b5563;">Your detailed official payslip PDF is attached to this email for your records.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${clientUrl}/my-payslips" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">View My Payslips Portal</a>
                    </div>
                </div>
                <div style="border-top: 1px solid #f3f4f6; padding-top: 15px; text-align: center; font-size: 12px; color: #9ca3af;">
                    This is an automated notification from ITCS HRM System. Please do not reply directly to this email.
                </div>
            </div>
        `,
        attachments: [
            {
                filename: filename || `Payslip_${monthYear.replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            },
        ],
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= PAYSLIP EMAIL (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`Employee: ${employeeName}, Period: ${monthYear}, Net: ${netPayFormatted}`);
        logger.info(`Attachment: ${filename} (${pdfBuffer.length} bytes)`);
        logger.info(`=========================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`✅ Payslip email sent successfully to ${to} (${employeeName})`);
        return true;
    } catch (error) {
        logger.error(`❌ Error sending payslip email to ${to}:`, error);
        return false;
    }
};

export const sendMasterPinResetOtpEmail = async (to: string, otp: string) => {
    const mailOptions = {
        from: `"${getSenderName('Security')}" <${process.env.SMTP_USER || 'security@itcs.com'}>`,
        to,
        subject: '🔒 Critical Security Alert: Master Financial PIN Reset OTP',
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 16px; background-color: #fee2e2; color: #dc2626; font-size: 28px;">
                        🛡️
                    </div>
                    <h2 style="color: #0f172a; margin: 12px 0 4px; font-size: 22px; font-weight: 800;">Master Security PIN Reset</h2>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Authorized Request for Universal Financial PIN</p>
                </div>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                    <p style="color: #475569; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px;">Your 6-Digit Verification OTP</p>
                    <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #4f46e5; font-family: monospace; padding: 8px 0;">
                        ${otp}
                    </div>
                    <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">⏱️ Valid for 10 minutes • Never share this code with anyone</p>
                </div>

                <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.5;">
                        <strong>Security Notice:</strong> Changing the Universal Master PIN affects all financial masking, PIM Step 7 salary data, and payroll authorization across the entire organization.
                    </p>
                </div>

                <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 20px;">
                    If you did not initiate this request, someone may be attempting to access your system. Please audit your server logs immediately.
                </p>

                <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
                    ITCS HRM Enterprise Security • Automated System Dispatch
                </p>
            </div>
        `,
    };

    if (!process.env.SMTP_USER) {
        logger.info(`\n================= MASTER PIN RESET OTP (MOCK) ===================`);
        logger.info(`To: ${to}`);
        logger.info(`OTP Code: ${otp}`);
        logger.info(`=================================================================\n`);
        return true;
    }

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`✅ Master PIN OTP email sent successfully to ${to}`);
        return true;
    } catch (error) {
        logger.error(`❌ Error sending Master PIN OTP email to ${to}:`, error);
        return false;
    }
};

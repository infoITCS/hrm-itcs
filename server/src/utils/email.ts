import nodemailer from 'nodemailer';
import logger from './logger';


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
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

export const sendPasswordResetEmail = async (to: string, resetToken: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
        from: `"ITCS HRM Team" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
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
        from: `"ITCS HRM Team" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
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
        from: `"ITCS HRM Team" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
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
        from: `"ITCS HRM Team" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
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
        from: `"ITCS HRM Team" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
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

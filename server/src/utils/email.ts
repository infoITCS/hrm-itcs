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
 * 1. Provided URL (e.g. from request headers / origin)
 * 2. process.env.FRONTEND_URL
 * 3. process.env.CLIENT_URL
 * 4. Default http://localhost:5173
 */
const getBaseUrl = (providedUrl?: string) => {
    if (providedUrl) {
        return providedUrl.replace(/\/+$/, '');
    }
    const envUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL;
    if (envUrl) {
        return envUrl.replace(/\/+$/, '');
    }
    return 'http://localhost:5173';
};

const getSenderName = (defaultSuffix: string = 'Team') => {
    return process.env.EMAIL_FROM_NAME || `ITCS HRM ${defaultSuffix}`;
};

// ── Microsoft Graph API Integration ──────────────────────────────────────────
let cachedGraphToken: string | null = null;
let graphTokenExpiresAt = 0;

async function getGraphAccessToken(): Promise<string | null> {
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'organizations';
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) return null;

    if (cachedGraphToken && Date.now() < graphTokenExpiresAt - 60000) {
        return cachedGraphToken;
    }

    try {
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
            scope: 'https://graph.microsoft.com/.default'
        });

        const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!res.ok) {
            const errText = await res.text();
            logger.warn(`[Microsoft Graph] Token error (${res.status}): ${errText}`);
            return null;
        }

        const data: any = await res.json();
        if (data.access_token) {
            cachedGraphToken = data.access_token;
            graphTokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
            return cachedGraphToken;
        }
        return null;
    } catch (err: any) {
        logger.warn(`[Microsoft Graph] Token request failed: ${err?.message || err}`);
        return null;
    }
}

export interface DispatchMailOptions {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
    attachments?: Array<{
        filename: string;
        content: any;
        contentType?: string;
    }>;
}

async function sendViaGraph(mailOptions: DispatchMailOptions): Promise<{ success: boolean; error?: string }> {
    const token = await getGraphAccessToken();
    if (!token) return { success: false, error: 'Graph access token unavailable' };

    const senderEmail = process.env.MICROSOFT_SENDER_EMAIL || process.env.SMTP_USER || 'abdul.raheem@itcs.com.pk';
    const recipients = (Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to])
        .filter(Boolean)
        .map(email => ({ emailAddress: { address: email.trim() } }));

    if (recipients.length === 0) return { success: false, error: 'No recipients provided' };

    const messagePayload: any = {
        subject: mailOptions.subject,
        body: {
            contentType: 'HTML',
            content: mailOptions.html
        },
        toRecipients: recipients
    };

    if (mailOptions.attachments && mailOptions.attachments.length > 0) {
        messagePayload.attachments = mailOptions.attachments.map(att => {
            const base64 = Buffer.isBuffer(att.content)
                ? att.content.toString('base64')
                : Buffer.from(att.content || '').toString('base64');
            return {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: att.filename,
                contentType: att.contentType || 'application/octet-stream',
                contentBytes: base64
            };
        });
    }

    try {
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: messagePayload,
                saveToSentItems: false
            })
        });

        if (res.status === 202 || (res.status >= 200 && res.status < 300)) {
            logger.info(`✅ [Microsoft Graph] Email sent to ${recipients.map(r => r.emailAddress.address).join(', ')}: "${mailOptions.subject}"`);
            return { success: true };
        }

        const errText = await res.text();
        logger.warn(`⚠️ [Microsoft Graph] sendMail failed (${res.status}): ${errText}`);
        return { success: false, error: `Graph API (${res.status}): ${errText}` };
    } catch (err: any) {
        logger.warn(`⚠️ [Microsoft Graph] sendMail exception: ${err?.message || err}`);
        return { success: false, error: err?.message || String(err) };
    }
}

async function sendViaBrevo(mailOptions: DispatchMailOptions): Promise<{ success: boolean; error?: string }> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return { success: false, error: 'Brevo API key not set' };

    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'hrms@itcs.com.pk';
    const senderName = process.env.BREVO_SENDER_NAME || getSenderName('Team');

    const recipients = (Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to])
        .filter(Boolean)
        .map(email => ({ email: email.trim() }));

    if (recipients.length === 0) return { success: false, error: 'No recipients provided' };

    const body: any = {
        sender: { name: senderName, email: senderEmail },
        to: recipients,
        subject: mailOptions.subject,
        htmlContent: mailOptions.html
    };

    if (mailOptions.attachments && mailOptions.attachments.length > 0) {
        body.attachment = mailOptions.attachments.map(att => {
            const base64 = Buffer.isBuffer(att.content)
                ? att.content.toString('base64')
                : Buffer.from(att.content || '').toString('base64');
            return {
                name: att.filename,
                content: base64
            };
        });
    }

    try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (res.status === 201 || (res.status >= 200 && res.status < 300)) {
            const data: any = await res.json().catch(() => ({}));
            logger.info(`✅ [Brevo API] Email sent to ${recipients.map(r => r.email).join(', ')}: "${mailOptions.subject}" (messageId: ${data.messageId || 'ok'})`);
            return { success: true };
        }

        const errText = await res.text();
        logger.warn(`⚠️ [Brevo API] sendMail failed (${res.status}): ${errText}`);
        return { success: false, error: `Brevo API (${res.status}): ${errText}` };
    } catch (err: any) {
        logger.warn(`⚠️ [Brevo API] sendMail exception: ${err?.message || err}`);
        return { success: false, error: err?.message || String(err) };
    }
}

/**
 * Unified email dispatcher:
 * 1. Tries Brevo (Sendinblue) API first (fast, secure, isolated from M365, 300 free/day).
 * 2. Falls back to Microsoft Graph API if Brevo is not configured or fails.
 * 3. Falls back to Nodemailer SMTP if neither is configured.
 * 4. Falls back to console mock in development if none is configured.
 */
export async function dispatchEmail(
    mailOptions: DispatchMailOptions,
    debugNote?: string
): Promise<{ success: boolean; error?: string }> {
    // ── Local Development Terminal Mock ──────────────────────────────────────
    // In local development, all emails print directly to terminal without calling Brevo.
    // This protects employee mailboxes and preserves Brevo daily quota.
    // (Set ENABLE_REAL_EMAILS_IN_DEV=true in .env if you ever want real emails sent from local)
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_REAL_EMAILS_IN_DEV !== 'true') {
        const recipients = Array.isArray(mailOptions.to) ? mailOptions.to.join(', ') : mailOptions.to;
        logger.info(`\n📧 ================= [DEV TERMINAL EMAIL] =================`);
        logger.info(`To: ${recipients}`);
        logger.info(`Subject: ${mailOptions.subject}`);
        if (debugNote) {
            logger.info(`Note: ${debugNote}`);
        }
        const linkMatch = mailOptions.html.match(/href="([^"]+)"/);
        if (linkMatch && linkMatch[1]) {
            logger.info(`🔗 Action Link: ${linkMatch[1]}`);
        }
        logger.info(`==========================================================\n`);
        return { success: true };
    }

    // 1. Try Brevo API first (Recommended for security & zero M365 dependency)
    if (process.env.BREVO_API_KEY) {
        const brevoResult = await sendViaBrevo(mailOptions);
        if (brevoResult.success) {
            return { success: true };
        }
        logger.info(`🔄 [Email Dispatcher] Brevo failed (${brevoResult.error}). Trying next provider...`);
    }

    // 2. Try Microsoft Graph API
    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
        const graphResult = await sendViaGraph(mailOptions);
        if (graphResult.success) {
            return { success: true };
        }
        logger.info(`🔄 [Email Dispatcher] Falling back to SMTP...`);
    }

    // 3. Try Nodemailer SMTP
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            await transporter.sendMail(mailOptions);
            logger.info(`✅ [SMTP] Email sent to ${Array.isArray(mailOptions.to) ? mailOptions.to.join(', ') : mailOptions.to}: "${mailOptions.subject}"`);
            return { success: true };
        } catch (smtpErr: any) {
            logger.error(`❌ [SMTP] Failed to send email:`, smtpErr.message);
            if (process.env.NODE_ENV === 'production') {
                return { success: false, error: smtpErr.message };
            }
        }
    }

    // 4. Dev mock fallback
    if (process.env.NODE_ENV !== 'production') {
        logger.info(`\n📧 [EMAIL MOCK] (${debugNote || mailOptions.subject})`);
        logger.info(`To: ${Array.isArray(mailOptions.to) ? mailOptions.to.join(', ') : mailOptions.to}`);
        logger.info(`Subject: ${mailOptions.subject}`);
        logger.info(`====================================================\n`);
        return { success: true };
    }

    return {
        success: false,
        error: 'No working email transport configured. Please configure BREVO_API_KEY or SMTP.'
    };
}

export const sendPasswordResetEmail = async (to: string, resetToken: string, baseUrl?: string) => {
    const clientUrl = getBaseUrl(baseUrl);
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || process.env.MICROSOFT_SENDER_EMAIL || 'abdul.raheem@itcs.com.pk'}>`,
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

    logger.info(`\n🔑 ================= PASSWORD RESET EMAIL ===================`);
    logger.info(`To: ${to}`);
    logger.info(`Reset URL: ${resetUrl}`);
    logger.info(`==========================================================\n`);

    return await dispatchEmail(mailOptions, `Password reset link: ${resetUrl}`);
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

    const dispatchResult = await dispatchEmail(mailOptions, `Welcome Email: ${to}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `HR Alert: ${employeeName}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Profile Reminder: ${to}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Birthday: ${firstName}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Anniversary: ${firstName}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Leave Submitted: ${employeeName}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Leave Status: ${employeeName} - ${status}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Expense Submitted: ${employeeName}`);
    return dispatchResult.success;
};

export const sendExpenseClaimStatusEmail = async (
    to: string, 
    employeeName: string, 
    category: string, 
    amount: number, 
    status: string, 
    approvedAmount?: number, 
    adminNote?: string, 
    actionBy?: string,
    baseUrl?: string
) => {
    const clientUrl = getBaseUrl(baseUrl);
    const statusColor = status === 'Approved' || status === 'Pending Finance' ? '#10b981' : (status === 'Declined' ? '#ef4444' : '#6b7280');
    
    let displayStatus: string;
    if (status === 'Pending Finance') {
        displayStatus = actionBy 
            ? `Approved by ${actionBy} (Awaiting Finance Disbursement)` 
            : 'Approved (Awaiting Finance Disbursement)';
    } else if (status === 'Approved') {
        displayStatus = actionBy ? `Approved by ${actionBy}` : 'Approved';
    } else if (status === 'Declined') {
        displayStatus = actionBy ? `Declined by ${actionBy}` : 'Declined';
    } else {
        displayStatus = status;
    }
    
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

    const dispatchResult = await dispatchEmail(mailOptions, `Expense Status: ${employeeName} - ${status}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Claim Action Required: ${claimNo}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Claim Resubmitted: ${claimNo}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Auto Close Alert: ${firstName}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Request Submitted: ${employeeName}`);
    return dispatchResult.success;
};

export const sendEmployeeRequestStatusEmail = async (
    to: string, 
    employeeName: string, 
    category: string, 
    status: string, 
    adminComments?: string, 
    actionBy?: string,
    baseUrl?: string
) => {
    const clientUrl = getBaseUrl(baseUrl);
    const statusColor = status === 'Approved' || status === 'Completed' ? '#10b981' : (status === 'Rejected' ? '#ef4444' : '#6b7280');
    const actionByText = actionBy ? ` by <strong>${actionBy}</strong>` : '';
    
    const mailOptions = {
        from: `"${getSenderName('Team')}" <${process.env.SMTP_USER || 'noreply@itcs.com'}>`,
        to,
        subject: `Request Status Update: ${category} - ${status}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 10px;">
                <h2 style="color: #4f46e5;">Request Status Update</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello ${employeeName},</p>
                <p style="color: #4b5563; font-size: 16px;">Your request for <strong>${category}</strong> has been <span style="color: ${statusColor}; font-weight: bold;">${status}</span>${actionByText}.</p>
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

    const dispatchResult = await dispatchEmail(mailOptions, `Request Status: ${employeeName} - ${status}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, `Pending ERP Tasks (${pendingCount})`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, 'Test Email');
    if (dispatchResult.success) {
        return { success: true, message: `Test email sent successfully to ${to}` };
    }
    return { success: false, error: dispatchResult.error || 'Failed to send test email' };
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

    const dispatchResult = await dispatchEmail(mailOptions, `Payslip Email: ${employeeName}`);
    return dispatchResult.success;
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

    const dispatchResult = await dispatchEmail(mailOptions, 'Master PIN Reset OTP');
    return dispatchResult.success;
};

import Company from '../models/Company';
import WorkflowTask from '../models/WorkflowTask';
import { dispatchEmail } from '../utils/email';
import logger from '../utils/logger';

const getBaseUrl = (providedUrl?: string) => {
    if (providedUrl) return providedUrl.replace(/\/+$/, '');
    return process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
};

/**
 * Triggers onboarding tasks & notifications when a new user is created.
 */
export async function triggerOnboardingTasks(user: any, employee?: any, originUrl?: string) {
    try {
        const company = await Company.findOne().lean() as any;
        const techEmail = company?.workflowSettings?.techEmail || process.env.TECH_TEAM_EMAIL || '';
        const baseUrl = getBaseUrl(originUrl);

        const targetName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 
            [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 
            user.email;

        const employeeId = employee?.employeeId || 'Pending Profile';
        const department = employee?.jobInfo?.department || 'Unassigned';
        const designation = employee?.jobInfo?.designation || 'New Hire';

        // 1. Create Workflow Task in Database
        const task = await WorkflowTask.create({
            type: 'Onboarding',
            targetUserId: user._id?.toString(),
            targetEmployeeId: employee?.employeeId,
            targetName,
            targetEmail: user.email,
            department: 'Tech',
            title: 'Provision Work Email & System Credentials',
            description: `Provision official work email, Microsoft 365, and portal access for ${targetName} (${user.email}).`,
            assignedEmail: techEmail || undefined,
            status: 'Pending',
        });

        logger.info(`[Workflow] Created onboarding task ${task._id} for ${targetName}`);

        // 2. Dispatch Email to Tech Team
        if (techEmail) {
            const html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                    <div style="margin-bottom: 20px; border-bottom: 2px solid #6366f1; padding-bottom: 12px;">
                        <h2 style="margin: 0; color: #4338ca; font-size: 20px;">🚀 Action Required: New User Onboarding</h2>
                        <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">IT / Tech Provisioning Request</p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6;">
                        A new user has been created in HRM. Please provision their official company email account and initial system credentials.
                    </p>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Employee Name:</td><td style="color: #0f172a; font-weight: bold;">${targetName}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">System Email:</td><td style="color: #0f172a; font-mono;">${user.email}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Employee ID:</td><td style="color: #0f172a;">${employeeId}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Department:</td><td style="color: #0f172a;">${department}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Designation:</td><td style="color: #0f172a;">${designation}</td></tr>
                        </table>
                    </div>

                    <div style="margin: 28px 0 16px; text-align: center;">
                        <a href="${baseUrl}/workflow-tasks?dept=Tech&empId=${encodeURIComponent(employee?.employeeId || user.email)}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            View Workflow Tasks in HRM
                        </a>
                    </div>

                    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; text-align: center;">
                        This is an automated workflow notification from ITCS HRM.
                    </p>
                </div>
            `;

            await dispatchEmail({
                to: techEmail,
                subject: `[Action Required] Provision Email Account for New User: ${targetName}`,
                html,
            }, `Onboarding Tech Provisioning - ${targetName}`);
        } else {
            logger.warn(`[Workflow] Tech team email not configured. Onboarding email skipped for ${targetName}`);
        }

        return task;
    } catch (err: any) {
        logger.error(`[Workflow] Failed to trigger onboarding tasks: ${err?.message || err}`);
    }
}

/**
 * Triggers offboarding tasks & notifications when an employee resigns, is terminated, or offboarded.
 */
export async function triggerOffboardingTasks(employee: any, user?: any, reason?: string, originUrl?: string) {
    try {
        const company = await Company.findOne().lean() as any;
        const workflowSettings = company?.workflowSettings || {};
        const techEmail = workflowSettings.techEmail || process.env.TECH_TEAM_EMAIL || '';
        const adminEmail = workflowSettings.adminEmail || process.env.ADMIN_TEAM_EMAIL || '';
        const hrEmail = workflowSettings.hrEmail || process.env.HR_TEAM_EMAIL || '';
        const baseUrl = getBaseUrl(originUrl);

        const targetName = [employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.employeeId;
        const employeeId = employee.employeeId;
        const targetEmail = employee.email || employee.workEmail || user?.email || '';
        const department = employee.jobInfo?.department || 'Unassigned';
        const designation = employee.jobInfo?.designation || employee.jobInfo?.jobTitle || 'Employee';
        const statusReason = employee.employmentStatus?.status || reason || 'Offboarded';

        // Standard Offboarding Checklist Tasks
        const tasksToCreate = [
            {
                type: 'Offboarding',
                targetEmployeeId: employeeId,
                targetUserId: employee.userId?.toString() || user?._id?.toString(),
                targetName,
                targetEmail,
                department: 'Tech',
                title: 'Disable Account, Microsoft 365, VPN & Revoke Access',
                description: `Deactivate corporate email (${targetEmail}), Microsoft 365 license, VPN credentials, and remove system access.`,
                assignedEmail: techEmail || undefined,
                status: 'Pending',
            },
            {
                type: 'Offboarding',
                targetEmployeeId: employeeId,
                targetUserId: employee.userId?.toString() || user?._id?.toString(),
                targetName,
                targetEmail,
                department: 'Admin',
                title: 'Collect Company Laptop, Charger & Hardware',
                description: 'Retrieve company laptop, accessories, monitor, and check physical condition.',
                assignedEmail: adminEmail || undefined,
                status: 'Pending',
            },
            {
                type: 'Offboarding',
                targetEmployeeId: employeeId,
                targetUserId: employee.userId?.toString() || user?._id?.toString(),
                targetName,
                targetEmail,
                department: 'Admin',
                title: 'Collect Fuel Card',
                description: 'Collect assigned company fuel card and report final card balance.',
                assignedEmail: adminEmail || undefined,
                status: 'Pending',
            },
            {
                type: 'Offboarding',
                targetEmployeeId: employeeId,
                targetUserId: employee.userId?.toString() || user?._id?.toString(),
                targetName,
                targetEmail,
                department: 'Admin',
                title: 'Collect Company SIM Card & Phone',
                description: 'Retrieve assigned company SIM card and mobile handset if provided.',
                assignedEmail: adminEmail || undefined,
                status: 'Pending',
            },
            {
                type: 'Offboarding',
                targetEmployeeId: employeeId,
                targetUserId: employee.userId?.toString() || user?._id?.toString(),
                targetName,
                targetEmail,
                department: 'HR',
                title: 'Conduct Exit Interview & Clearance Form',
                description: 'Complete exit interview questionnaire, knowledge handover signoff, and HR clearance.',
                assignedEmail: hrEmail || undefined,
                status: 'Pending',
            },
        ];

        const createdTasks = await WorkflowTask.insertMany(tasksToCreate);
        logger.info(`[Workflow] Created ${createdTasks.length} offboarding tasks for ${targetName} (${employeeId})`);

        // Common employee info block for emails
        const employeeInfoTable = `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 18px 0; font-size: 13px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 5px 0; color: #64748b; font-weight: 600; width: 140px;">Employee Name:</td><td style="color: #0f172a; font-weight: bold;">${targetName}</td></tr>
                    <tr><td style="padding: 5px 0; color: #64748b; font-weight: 600;">Employee ID:</td><td style="color: #0f172a;">${employeeId}</td></tr>
                    <tr><td style="padding: 5px 0; color: #64748b; font-weight: 600;">Department:</td><td style="color: #0f172a;">${department}</td></tr>
                    <tr><td style="padding: 5px 0; color: #64748b; font-weight: 600;">Designation:</td><td style="color: #0f172a;">${designation}</td></tr>
                    <tr><td style="padding: 5px 0; color: #64748b; font-weight: 600;">Status:</td><td style="color: #e11d48; font-weight: bold;">${statusReason}</td></tr>
                </table>
            </div>
        `;

        // 1. Notify Tech Team
        if (techEmail) {
            const html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                    <div style="margin-bottom: 20px; border-bottom: 2px solid #ef4444; padding-bottom: 12px;">
                        <h2 style="margin: 0; color: #b91c1c; font-size: 20px;">⚠️ Action Required: Tech Offboarding & Access Revocation</h2>
                        <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Security & System Access Task</p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6;">
                        <strong>${targetName}</strong> (${employeeId}) has been marked as <strong>${statusReason}</strong>. Please revoke all system access and accounts immediately:
                    </p>

                    ${employeeInfoTable}

                    <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 10px; padding: 14px; font-size: 13px; color: #991b1b; margin-bottom: 20px;">
                        <strong>Assigned Tech Task:</strong>
                        <ul style="margin: 8px 0 0; padding-left: 20px;">
                            <li>Disable Microsoft 365 / Corporate Email</li>
                            <li>Revoke VPN & internal system logins</li>
                            <li>Archive mailbox or setup forwarder as per policy</li>
                        </ul>
                    </div>

                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${baseUrl}/workflow-tasks?dept=Tech&empId=${encodeURIComponent(employeeId)}" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            Mark Completed in HRM
                        </a>
                    </div>
                </div>
            `;

            await dispatchEmail({
                to: techEmail,
                subject: `[Offboarding Alert] Revoke System Access: ${targetName} (${employeeId})`,
                html,
            }, `Offboarding Tech Alert - ${targetName}`);
        }

        // 2. Notify Admin Team (Assets: Laptop, Fuel Card, SIM)
        if (adminEmail) {
            const html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                    <div style="margin-bottom: 20px; border-bottom: 2px solid #f59e0b; padding-bottom: 12px;">
                        <h2 style="margin: 0; color: #b45309; font-size: 20px;">📦 Action Required: Admin Asset Collection</h2>
                        <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Company Asset Recovery Tasks</p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6;">
                        <strong>${targetName}</strong> (${employeeId}) is offboarding. Please collect all company-issued assets:
                    </p>

                    ${employeeInfoTable}

                    <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 14px; font-size: 13px; color: #92400e; margin-bottom: 20px;">
                        <strong>Assigned Admin Tasks:</strong>
                        <ul style="margin: 8px 0 0; padding-left: 20px;">
                            <li>Collect company laptop & charger</li>
                            <li>Collect fuel card</li>
                            <li>Collect company SIM card & phone</li>
                        </ul>
                    </div>

                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${baseUrl}/workflow-tasks?dept=Admin&empId=${encodeURIComponent(employeeId)}" style="display: inline-block; background: #d97706; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            Mark Assets Collected in HRM
                        </a>
                    </div>
                </div>
            `;

            await dispatchEmail({
                to: adminEmail,
                subject: `[Offboarding Alert] Collect Assets (Laptop, Fuel Card, SIM): ${targetName} (${employeeId})`,
                html,
            }, `Offboarding Admin Alert - ${targetName}`);
        }

        // 3. Notify HR Team
        if (hrEmail) {
            const html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                    <div style="margin-bottom: 20px; border-bottom: 2px solid #8b5cf6; padding-bottom: 12px;">
                        <h2 style="margin: 0; color: #6d28d9; font-size: 20px;">📋 Action Required: HR Exit Interview & Clearance</h2>
                        <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">HR Clearance Checklist</p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6;">
                        Offboarding initiated for <strong>${targetName}</strong> (${employeeId}):
                    </p>

                    ${employeeInfoTable}

                    <div style="background: #f5f3ff; border: 1px solid #ede9fe; border-radius: 10px; padding: 14px; font-size: 13px; color: #5b21b6; margin-bottom: 20px;">
                        <strong>Assigned HR Task:</strong>
                        <ul style="margin: 8px 0 0; padding-left: 20px;">
                            <li>Conduct exit interview and file clearance sign-off</li>
                            <li>Verify knowledge transfer & handover</li>
                        </ul>
                    </div>

                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${baseUrl}/workflow-tasks?dept=HR&empId=${encodeURIComponent(employeeId)}" style="display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            View Exit Checklist in HRM
                        </a>
                    </div>
                </div>
            `;

            await dispatchEmail({
                to: hrEmail,
                subject: `[Offboarding Alert] Exit Interview & Clearance: ${targetName} (${employeeId})`,
                html,
            }, `Offboarding HR Alert - ${targetName}`);
        }

        return createdTasks;
    } catch (err: any) {
        logger.error(`[Workflow] Failed to trigger offboarding tasks: ${err?.message || err}`);
    }
}

/**
 * Checks if all tasks for a given target & type are completed.
 * If all tasks are completed, sends a final clearance/completion confirmation email to HR & Admin.
 */
export async function triggerWorkflowCompletionCheck(task: any, originUrl?: string) {
    try {
        const targetQuery: any = { type: task.type };
        if (task.targetEmployeeId && task.targetEmployeeId !== 'Pending Profile' && task.targetEmployeeId !== 'No Profile') {
            targetQuery.targetEmployeeId = task.targetEmployeeId;
        } else if (task.targetUserId) {
            targetQuery.targetUserId = task.targetUserId;
        } else {
            return;
        }

        const allTasks = await WorkflowTask.find(targetQuery).lean();
        if (allTasks.length === 0) return;

        const hasPending = allTasks.some(t => t.status !== 'Completed');
        if (hasPending) {
            // Not all tasks are completed yet
            return;
        }

        // All tasks are completed! Send notification email
        const company = await Company.findOne().lean() as any;
        const workflowSettings = company?.workflowSettings || {};
        const hrEmail = workflowSettings.hrEmail || process.env.HR_TEAM_EMAIL || '';
        const adminEmail = workflowSettings.adminEmail || process.env.ADMIN_TEAM_EMAIL || '';
        const recipients = [hrEmail, adminEmail].filter(Boolean);

        if (recipients.length === 0) {
            logger.warn(`[Workflow] No HR or Admin email configured to receive completion notice for ${task.targetName}`);
            return;
        }

        const baseUrl = getBaseUrl(originUrl);
        const targetName = task.targetName || 'Staff Member';
        const empId = task.targetEmployeeId || 'N/A';

        const taskRows = allTasks.map(t => `
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #334155;">${t.department}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${t.title}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #059669; font-weight: bold;">Completed</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px;">${t.completedByName || 'Staff'}${t.notes ? ` <br/><i style="color:#475569">"${t.notes}"</i>` : ''}</td>
            </tr>
        `).join('');

        if (task.type === 'Offboarding') {
            const html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                    <div style="margin-bottom: 20px; border-bottom: 2px solid #10b981; padding-bottom: 12px;">
                        <h2 style="margin: 0; color: #059669; font-size: 20px;">✅ Offboarding Clearance Complete</h2>
                        <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">All department checklist items have been fulfilled</p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6;">
                        All offboarding workflow tasks for <strong>${targetName}</strong> (${empId}) have been marked as <strong>Completed</strong>. Tech access has been revoked, company assets retrieved, and HR exit clearance recorded.
                    </p>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin: 20px 0; overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                            <thead>
                                <tr style="background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase;">
                                    <th style="padding: 8px 12px; border-radius: 6px 0 0 6px;">Dept</th>
                                    <th style="padding: 8px 12px;">Task</th>
                                    <th style="padding: 8px 12px;">Status</th>
                                    <th style="padding: 8px 12px; border-radius: 0 6px 6px 0;">Completed By</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${taskRows}
                            </tbody>
                        </table>
                    </div>

                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${baseUrl}/workflow-tasks?empId=${encodeURIComponent(empId !== 'N/A' ? empId : '')}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            View Clearance Record in HRM
                        </a>
                    </div>

                    <p style="font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                        This employee is now cleared for final settlement and payroll closure.
                    </p>
                </div>
            `;

            await dispatchEmail({
                to: recipients,
                subject: `✅ [Clearance Complete] All Offboarding Tasks Finished: ${targetName} (${empId})`,
                html,
            }, `Offboarding Clearance Complete - ${targetName}`);
            logger.info(`[Workflow] Dispatched clearance complete email for ${targetName}`);
        } else if (task.type === 'Onboarding') {
            const html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                    <div style="margin-bottom: 20px; border-bottom: 2px solid #4f46e5; padding-bottom: 12px;">
                        <h2 style="margin: 0; color: #4338ca; font-size: 20px;">✅ Onboarding IT Provisioning Complete</h2>
                        <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">User accounts & credentials have been set up</p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6;">
                        All onboarding setup tasks for <strong>${targetName}</strong> have been marked as <strong>Completed</strong>.
                    </p>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin: 20px 0; overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                            <thead>
                                <tr style="background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase;">
                                    <th style="padding: 8px 12px; border-radius: 6px 0 0 6px;">Dept</th>
                                    <th style="padding: 8px 12px;">Task</th>
                                    <th style="padding: 8px 12px;">Status</th>
                                    <th style="padding: 8px 12px; border-radius: 0 6px 6px 0;">Completed By</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${taskRows}
                            </tbody>
                        </table>
                    </div>

                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${baseUrl}/workflow-tasks?empId=${encodeURIComponent(empId !== 'N/A' ? empId : '')}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            View Onboarding Status in HRM
                        </a>
                    </div>
                </div>
            `;

            await dispatchEmail({
                to: recipients,
                subject: `✅ [Onboarding Complete] IT Setup Finished: ${targetName}`,
                html,
            }, `Onboarding Complete - ${targetName}`);
            logger.info(`[Workflow] Dispatched onboarding complete email for ${targetName}`);
        }
    } catch (err: any) {
        logger.error(`[Workflow] Failed checking workflow completion: ${err?.message || err}`);
    }
}

/**
 * Triggers IT workflow task & notification when a Laptop Admin Access request is approved by Super Admin.
 */
export async function triggerAdminAccessTask(request: any, employee: any, originUrl?: string) {
    try {
        const company = await Company.findOne().lean() as any;
        const techEmail = company?.workflowSettings?.techEmail || process.env.TECH_TEAM_EMAIL || '';
        const baseUrl = getBaseUrl(originUrl);

        const targetName = [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || request.employeeId || 'Employee';
        const deviceName = request.details?.deviceName || 'N/A';
        const duration = request.details?.accessDuration || request.requestType || 'Permanent';
        const justification = request.details?.reason || 'N/A';

        // Check if task already exists for this request
        const existingTask = await WorkflowTask.findOne({ relatedRequestId: request._id });
        if (existingTask) {
            return existingTask;
        }

        const task = await WorkflowTask.create({
            type: 'IT Access',
            targetEmployeeId: request.employeeId,
            targetUserId: employee?.userId?.toString(),
            targetName,
            targetEmail: employee?.workEmail || employee?.personalEmail || employee?.email,
            department: 'Tech',
            title: `Grant Intune Local Admin Access - ${targetName}`,
            description: `Device / Hostname: ${deviceName}\nDuration: ${duration}\nJustification: ${justification}\nApproved by Super Admin`,
            assignedEmail: techEmail || undefined,
            status: 'Pending',
            relatedRequestId: request._id
        });

        logger.info(`[Workflow] Created IT Access task ${task._id} for ${targetName}`);

        if (techEmail) {
            const html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                    <div style="margin-bottom: 20px; border-bottom: 2px solid #6366f1; padding-bottom: 12px;">
                        <h2 style="margin: 0; color: #4338ca; font-size: 20px;">🛡️ Action Required: Grant Laptop Admin Access</h2>
                        <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Super Admin Approved Privileged Access</p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6;">
                        Super Admin has approved a request for local laptop admin privileges. Please configure the required permissions manually in <strong>Microsoft Intune</strong> and mark the task as complete in HRM.
                    </p>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Employee Name:</td><td style="color: #0f172a; font-weight: bold;">${targetName}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Employee ID:</td><td style="color: #0f172a;">${request.employeeId}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Device / Hostname:</td><td style="color: #0f172a; font-family: monospace; font-weight: bold;">${deviceName}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Access Duration:</td><td style="color: #0f172a;">${duration}</td></tr>
                            <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Justification:</td><td style="color: #0f172a;">${justification}</td></tr>
                        </table>
                    </div>

                    <div style="margin: 28px 0 16px; text-align: center;">
                        <a href="${baseUrl}/workflow-tasks?dept=Tech" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            View Workflow Tasks in HRM
                        </a>
                    </div>

                    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; text-align: center;">
                        This is an automated workflow notification from ITCS HRM.
                    </p>
                </div>
            `;

            await dispatchEmail({
                to: techEmail,
                subject: `[Action Required] Grant Laptop Admin Access: ${targetName} (${deviceName})`,
                html,
            }, `IT Access Task - ${targetName}`);
        }

        return task;
    } catch (err: any) {
        logger.error(`[Workflow] Failed to trigger admin access task: ${err?.message || err}`);
    }
}


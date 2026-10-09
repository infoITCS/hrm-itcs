import express, { Request, Response, NextFunction } from 'express';
import WorkflowTask from '../models/WorkflowTask';
import Company from '../models/Company';
import Employee from '../models/Employee';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * @route   GET /api/workflow-tasks
 * @desc    Get workflow tasks (scoped to department/assignee for non-admins)
 * @access  Private
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const role = authReq.user?.role || '';
        const userEmail = (authReq.user?.email || '').toLowerCase().trim();

        const { type, department, status, targetEmployeeId, targetUserId } = req.query;

        const query: any = {};
        if (type) query.type = type;
        if (status && status !== 'All') query.status = status;
        if (targetEmployeeId) query.targetEmployeeId = targetEmployeeId;
        if (targetUserId) query.targetUserId = targetUserId;

        let allowedDepts: string[] = [];

        // If requester is not super-admin or admin, restrict to their department/assigned tasks
        if (role !== 'super-admin' && role !== 'admin') {
            const company = await Company.findOne().lean() as any;
            const techEmail = (company?.workflowSettings?.techEmail || '').toLowerCase().trim();
            const adminEmail = (company?.workflowSettings?.adminEmail || '').toLowerCase().trim();
            const hrEmail = (company?.workflowSettings?.hrEmail || '').toLowerCase().trim();

            if (role === 'hr' || (hrEmail && userEmail === hrEmail)) allowedDepts.push('HR');
            if (role === 'finance') allowedDepts.push('Finance');
            if (techEmail && userEmail === techEmail) allowedDepts.push('Tech');
            if (adminEmail && userEmail === adminEmail) allowedDepts.push('Admin');

            const empDoc = await Employee.findOne({
                $or: [
                    { userId: authReq.user?.userId },
                    { email: userEmail },
                    { workEmail: userEmail }
                ]
            }).select('jobInfo').lean() as any;

            const empDept = (empDoc?.jobInfo?.department || '').toLowerCase();
            if (empDept.includes('it') || empDept.includes('tech') || empDept.includes('software')) {
                if (!allowedDepts.includes('Tech')) allowedDepts.push('Tech');
            }
            if (empDept.includes('admin') || empDept.includes('facility') || empDept.includes('operations')) {
                if (!allowedDepts.includes('Admin')) allowedDepts.push('Admin');
            }
            if (empDept.includes('hr') || empDept.includes('human') || empDept.includes('people')) {
                if (!allowedDepts.includes('HR')) allowedDepts.push('HR');
            }
            if (empDept.includes('finan') || empDept.includes('account')) {
                if (!allowedDepts.includes('Finance')) allowedDepts.push('Finance');
            }

            if (department && department !== 'All') {
                if (allowedDepts.includes(department as string)) {
                    query.department = department;
                } else {
                    // Not authorized for this department: strictly restrict to tasks assigned directly to their email
                    query.department = department;
                    query.assignedEmail = userEmail;
                }
            } else if (allowedDepts.length > 0) {
                query.$or = [{ department: { $in: allowedDepts } }, { assignedEmail: userEmail }];
            } else {
                query.assignedEmail = userEmail;
            }
        } else {
            if (department && department !== 'All') query.department = department;
        }

        const tasks = await WorkflowTask.find(query).sort({ createdAt: -1 }).lean();

        // Enrich each task with canEdit boolean so client UI renders appropriate controls
        const enrichedTasks = tasks.map((task: any) => {
            const isSelfTarget = Boolean(task.targetUserId && task.targetUserId.toString() === authReq.user?.userId?.toString());
            let canEdit = false;
            if (role === 'super-admin' || role === 'admin') {
                canEdit = true;
            } else if (!isSelfTarget) {
                const isAssigned = Boolean(task.assignedEmail && task.assignedEmail.toLowerCase().trim() === userEmail);
                const isDeptAllowed = allowedDepts.includes(task.department);
                canEdit = isAssigned || isDeptAllowed;
            }
            return {
                ...task,
                canEdit
            };
        });

        res.json(enrichedTasks);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PATCH /api/workflow-tasks/:id
 * @desc    Update task status (Complete / Skip / Pending) and notes (department-permission verified)
 * @access  Private
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const role = authReq.user?.role || '';
        const userEmail = (authReq.user?.email || '').toLowerCase().trim();
        const { status, notes } = req.body;

        const task = await WorkflowTask.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Prevent self-modifications on own profile (e.g. employee cannot mark own laptop as collected)
        if (task.targetUserId && task.targetUserId.toString() === authReq.user?.userId?.toString() && role !== 'super-admin' && role !== 'admin') {
            return res.status(403).json({
                message: 'Forbidden: You cannot modify checklist tasks for your own offboarding profile.'
            });
        }

        // Non-admins can only modify tasks belonging to their department or assigned to their email
        if (role !== 'super-admin' && role !== 'admin') {
            const company = await Company.findOne().lean() as any;
            const techEmail = (company?.workflowSettings?.techEmail || '').toLowerCase().trim();
            const adminEmail = (company?.workflowSettings?.adminEmail || '').toLowerCase().trim();
            const hrEmail = (company?.workflowSettings?.hrEmail || '').toLowerCase().trim();

            const isAssignedEmail = Boolean(task.assignedEmail && task.assignedEmail.toLowerCase().trim() === userEmail);
            const isDeptEmail = 
                (task.department === 'Tech' && techEmail === userEmail) ||
                (task.department === 'Admin' && adminEmail === userEmail) ||
                (task.department === 'HR' && (hrEmail === userEmail || role === 'hr')) ||
                (task.department === 'Finance' && role === 'finance');

            const empDoc = await Employee.findOne({
                $or: [
                    { userId: authReq.user?.userId },
                    { email: userEmail },
                    { workEmail: userEmail }
                ]
            }).select('jobInfo').lean() as any;

            const empDept = (empDoc?.jobInfo?.department || '').toLowerCase();
            const isDeptEmployee = 
                (task.department === 'Tech' && (empDept.includes('it') || empDept.includes('tech') || empDept.includes('software'))) ||
                (task.department === 'Admin' && (empDept.includes('admin') || empDept.includes('facility') || empDept.includes('operations'))) ||
                (task.department === 'HR' && (empDept.includes('hr') || empDept.includes('human') || role === 'hr')) ||
                (task.department === 'Finance' && (empDept.includes('finan') || empDept.includes('account') || role === 'finance'));

            if (!isAssignedEmail && !isDeptEmail && !isDeptEmployee) {
                return res.status(403).json({ 
                    message: `Forbidden: You only have permission to edit ${task.department} department tasks.` 
                });
            }
        }

        if (status) {
            task.status = status;
            if (status === 'Completed') {
                task.completedAt = new Date();
                task.completedBy = authReq.user?.userId;
                task.completedByName = authReq.user?.email || 'Staff';
            } else if (status === 'Pending') {
                task.completedAt = undefined;
                task.completedBy = undefined;
                task.completedByName = undefined;
            }
        }

        if (notes !== undefined) {
            task.notes = notes;
        }

        await task.save();
        res.json(task);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/workflow-tasks
 * @desc    Add a custom workflow task (Admin / HR)
 * @access  Private (Admin / HR)
 */
router.post('/', authenticate, authorize(['admin', 'super-admin', 'hr']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, targetEmployeeId, targetUserId, targetName, targetEmail, department, title, description, assignedEmail } = req.body;

        if (!type || !title || !department || !targetName) {
            return res.status(400).json({ message: 'Type, title, department, and targetName are required.' });
        }

        const task = await WorkflowTask.create({
            type,
            targetEmployeeId,
            targetUserId,
            targetName,
            targetEmail,
            department,
            title,
            description,
            assignedEmail,
            status: 'Pending',
        });

        res.status(201).json(task);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/workflow-tasks/:id
 * @desc    Delete a workflow task (Super-Admin / Admin only)
 * @access  Private (Admin)
 */
router.delete('/:id', authenticate, authorize(['admin', 'super-admin']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const task = await WorkflowTask.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;

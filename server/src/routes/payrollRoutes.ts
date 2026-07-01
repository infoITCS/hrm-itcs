import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth';
import PayrollRun from '../models/PayrollRun';
import Payslip from '../models/Payslip';
import Employee from '../models/Employee';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isAdmin(role: string): boolean {
    return role === 'super-admin' || role === 'admin';
}

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** Auto-generate a human-readable payslip number: PS-YYYY-MM-XXXX */
async function generatePayslipNo(year: number, month: number): Promise<string> {
    const prefix = `PS-${year}-${String(month).padStart(2, '0')}-`;
    const last = await Payslip.findOne({ payslipNo: { $regex: `^${prefix}` } })
        .sort({ createdAt: -1 })
        .lean() as any;
    const lastSeq = last?.payslipNo?.startsWith(prefix)
        ? parseInt(last.payslipNo.slice(prefix.length), 10)
        : 0;
    const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Payroll Run CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/payroll
 * @desc    Create a new Draft payroll run for a given month/year
 * @access  admin, super-admin
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const { periodMonth, periodYear, currency = 'PKR', notes } = req.body;

        if (!periodMonth || !periodYear) {
            return res.status(400).json({ message: 'periodMonth and periodYear are required.' });
        }

        const month = Number(periodMonth);
        const year = Number(periodYear);

        if (month < 1 || month > 12) {
            return res.status(400).json({ message: 'periodMonth must be between 1 and 12.' });
        }

        const existing = await PayrollRun.findOne({ periodMonth: month, periodYear: year });
        if (existing) {
            return res.status(409).json({
                message: `A payroll run for ${MONTH_NAMES[month]} ${year} already exists.`,
            });
        }

        const title = `${MONTH_NAMES[month]} ${year} Payroll`;

        const run = await PayrollRun.create({
            title,
            periodMonth: month,
            periodYear: year,
            currency,
            notes,
            createdBy: authReq.user!.userId,
            status: 'Draft',
        });

        return res.status(201).json(run);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/payroll
 * @desc    List all payroll runs (newest first)
 * @access  admin, super-admin
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const runs = await PayrollRun.find().sort({ createdAt: -1 }).lean();

        const runIds = runs.map((r: any) => r._id);
        const counts = await Payslip.aggregate([
            { $match: { payrollRunId: { $in: runIds } } },
            { $group: { _id: '$payrollRunId', count: { $sum: 1 }, totalNet: { $sum: '$netPay' } } },
        ]);
        const countMap: Record<string, { count: number; totalNet: number }> = {};
        counts.forEach((c: any) => {
            countMap[c._id.toString()] = { count: c.count, totalNet: c.totalNet };
        });

        const result = runs.map((r: any) => ({
            ...r,
            payslipCount: countMap[r._id.toString()]?.count ?? 0,
            totalNetPay: countMap[r._id.toString()]?.totalNet ?? 0,
        }));

        return res.json(result);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/payroll/my-payslips
 * @desc    Get the authenticated employee's own payslip history (Finalized only)
 * @access  all authenticated roles
 * NOTE: This route MUST be defined BEFORE /:runId to avoid being caught by that route.
 */
router.get('/my-payslips', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;

        const emp = await Employee.findOne({ userId: authReq.user!.userId })
            .select('employeeId')
            .lean() as any;

        if (!emp) {
            return res.status(404).json({ message: 'No employee record linked to your account.' });
        }

        const payslips = await Payslip.find({
            employeeId: emp.employeeId,
            status: 'Finalized',
        })
            .populate('payrollRunId', 'title periodMonth periodYear status disbursedAt currency')
            .sort({ periodYear: -1, periodMonth: -1 })
            .lean();

        return res.json(payslips);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/payroll/payslips/:payslipId
 * @desc    Get a single payslip detail (admin sees any; employee sees only their own)
 * @access  admin, super-admin, or payslip owner
 * NOTE: This route MUST be defined BEFORE /:runId to avoid ambiguity.
 */
router.get('/payslips/:payslipId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const payslip = await Payslip.findById(req.params.payslipId)
            .populate('employeeDetails', 'firstName lastName jobInfo bankDetails avatar')
            .populate('payrollRunId')
            .lean() as any;

        if (!payslip) return res.status(404).json({ message: 'Payslip not found.' });

        if (!isAdmin(authReq.user!.role)) {
            const emp = await Employee.findOne({ userId: authReq.user!.userId })
                .select('employeeId')
                .lean() as any;
            if (!emp || emp.employeeId !== payslip.employeeId) {
                return res.status(403).json({ message: 'Forbidden.' });
            }
        }

        return res.json(payslip);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   PUT /api/payroll/payslips/:payslipId
 * @desc    Edit a Draft payslip (adjust earnings, add/remove deductions, set payment method)
 * @access  admin, super-admin
 */
router.put('/payslips/:payslipId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const payslip = await Payslip.findById(req.params.payslipId);
        if (!payslip) return res.status(404).json({ message: 'Payslip not found.' });

        if (payslip.status === 'Finalized') {
            return res.status(400).json({
                message: 'Finalized payslips cannot be edited. Contact super-admin.',
            });
        }

        const { earnings, deductions, paymentMethod, notes } = req.body;

        if (earnings !== undefined) payslip.earnings = earnings;
        if (deductions !== undefined) payslip.deductions = deductions;
        if (paymentMethod !== undefined) payslip.paymentMethod = paymentMethod;
        if (notes !== undefined) payslip.notes = notes;

        payslip.grossPay = (payslip.earnings || []).reduce(
            (sum: number, e: any) => sum + (e.amount || 0), 0
        );
        payslip.totalDeductions = (payslip.deductions || []).reduce(
            (sum: number, d: any) => sum + (d.amount || 0), 0
        );
        payslip.netPay = payslip.grossPay - payslip.totalDeductions;

        await payslip.save();
        return res.json(payslip);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/payroll/:runId
 * @desc    Get a single payroll run + all its payslips (with employee details)
 * @access  admin, super-admin
 */
router.get('/:runId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const { runId } = req.params;
        if (!mongoose.isValidObjectId(runId)) {
            return res.status(400).json({ message: 'Invalid run ID.' });
        }

        const run = await PayrollRun.findById(runId).lean();
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        const payslips = await Payslip.find({ payrollRunId: runId })
            .populate('employeeDetails', 'firstName lastName jobInfo bankDetails avatar')
            .lean();

        return res.json({ run, payslips });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   POST /api/payroll/:runId/generate
 * @desc    Auto-generate payslips from Employee.salaryComponents[] for all active employees.
 * @access  admin, super-admin
 */
router.post('/:runId/generate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const { runId } = req.params;
        if (!mongoose.isValidObjectId(runId)) {
            return res.status(400).json({ message: 'Invalid run ID.' });
        }

        const run = await PayrollRun.findById(runId);
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        if (run.status !== 'Draft') {
            return res.status(400).json({
                message: `Cannot re-generate payslips for a run with status "${run.status}".`,
            });
        }

        // Fetch all active, non-deleted employees (isDeleted pre-hook on Employee handles soft-delete)
        const employees = await Employee.find({
            'employmentStatus.status': {
                $in: ['Permanent', 'Probation', 'Contract', 'Internship'],
            },
        }).select('employeeId firstName lastName salaryComponents bankDetails jobInfo');

        if (!employees.length) {
            return res.status(400).json({ message: 'No active employees found to generate payslips.' });
        }

        // Delete any previously generated payslips for this run
        await Payslip.deleteMany({ payrollRunId: runId });

        const prefix = `PS-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-`;
        const last = await Payslip.findOne({ payslipNo: { $regex: `^${prefix}` } })
            .sort({ createdAt: -1 })
            .lean() as any;
        const lastSeq = last?.payslipNo?.startsWith(prefix)
            ? parseInt(last.payslipNo.slice(prefix.length), 10)
            : 0;
        let nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;

        const payslips = [];
        for (const emp of employees) {
            // Map Employee.salaryComponents[] → Payslip.earnings[]
            const earnings = (emp.salaryComponents || []).map((sc: any) => ({
                component: sc.component || 'Basic',
                amount: sc.amount || 0,
                type: sc.type || 'fixed',
            }));

            const grossPay = earnings.reduce((sum: number, e: any) => sum + e.amount, 0);
            const payslipNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
            nextSeq++;

            payslips.push({
                payslipNo,
                employeeId: emp.employeeId,
                payrollRunId: run._id,
                periodMonth: run.periodMonth,
                periodYear: run.periodYear,
                currency: run.currency,
                earnings,
                deductions: [],
                grossPay,
                totalDeductions: 0,
                netPay: grossPay,
                status: 'Draft',
                paymentMethod: 'Bank Transfer',
            });
        }

        await Payslip.insertMany(payslips, { ordered: false });

        return res.json({
            message: `Generated ${payslips.length} payslips for ${run.title}.`,
            count: payslips.length,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   PUT /api/payroll/:runId/approve
 * @desc    Approve a Draft payroll run → status becomes "Approved"
 * @access  admin, super-admin
 */
router.put('/:runId/approve', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const run = await PayrollRun.findById(req.params.runId);
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        if (run.status !== 'Draft') {
            return res.status(400).json({
                message: `Run is already "${run.status}". Only Draft runs can be approved.`,
            });
        }

        await Payslip.updateMany(
            { payrollRunId: run._id, status: 'Draft' },
            { $set: { status: 'Finalized' } }
        );

        run.status = 'Approved';
        run.approvedBy = authReq.user!.userId;
        (run as any).approvedAt = new Date();
        await run.save();

        return res.json(run);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   PUT /api/payroll/:runId/disburse
 * @desc    Mark an Approved payroll run as Disbursed
 * @access  admin, super-admin
 */
router.put('/:runId/disburse', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const run = await PayrollRun.findById(req.params.runId);
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        if (run.status !== 'Approved') {
            return res.status(400).json({
                message: `Run must be "Approved" before disbursing. Current status: "${run.status}".`,
            });
        }

        run.status = 'Disbursed';
        run.disbursedAt = new Date();
        await run.save();

        return res.json(run);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   DELETE /api/payroll/:runId
 * @desc    Delete a Draft payroll run and all its payslips
 * @access  super-admin only
 */
router.delete('/:runId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (authReq.user!.role !== 'super-admin') {
            return res.status(403).json({ message: 'Forbidden. Super Admin access required.' });
        }

        const run = await PayrollRun.findById(req.params.runId);
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        if (run.status !== 'Draft') {
            return res.status(400).json({
                message: `Only Draft runs can be deleted. Current status: "${run.status}".`,
            });
        }

        await Payslip.deleteMany({ payrollRunId: run._id });
        await run.deleteOne();

        return res.json({ message: `Payroll run "${run.title}" deleted successfully.` });
    } catch (err) {
        next(err);
    }
});

export default router;

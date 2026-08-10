import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { authenticate, AuthRequest } from '../middleware/auth';
import PayrollRun from '../models/PayrollRun';
import Payslip from '../models/Payslip';
import Employee from '../models/Employee';
import Counter from '../models/Counter';
import EmployeeRequest from '../models/EmployeeRequest';
import AttendanceRecord from '../models/AttendanceRecord';
import Company from '../models/Company';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isAdmin(role: string): boolean {
    return ['super-admin', 'admin', 'finance', 'hr'].includes(role);
}

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** Auto-generate a human-readable payslip number: PS-YYYY-MM-XXXX */
async function generatePayslipNo(year: number, month: number): Promise<string> {
    const key = `payslipNo_${year}_${String(month).padStart(2, '0')}`;
    const counter = await Counter.findOneAndUpdate(
        { key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );
    return `PS-${year}-${String(month).padStart(2, '0')}-${String(counter.seq).padStart(4, '0')}`;
}

// Temporary endpoint to clean up orphaned payslips from deleted payroll runs
router.get('/cleanup-orphans', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user!.role)) {
        return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }
    try {
        const runs = await PayrollRun.find().select('_id').lean();
        const validRunIds = runs.map((r: any) => r._id);
        const result = await Payslip.deleteMany({
            payrollRunId: { $nin: validRunIds }
        });
        return res.json({
            message: `Successfully deleted ${result.deletedCount} orphaned payslips.`,
            validRunIds
        });
    } catch (err) {
        next(err);
    }
});

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

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 0; // 0 means return all if not specified (backwards compatible)

        let query = PayrollRun.find().sort({ createdAt: -1 });
        if (limit > 0) {
            query = query.skip((page - 1) * limit).limit(limit);
        }

        const runs = await query.lean();

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

// Helper to compute or retrieve attendance summary for a payslip
async function getOrComputeAttendanceSummary(employeeId: string, year: number, month: number, storedSummary?: any) {
    if (storedSummary && storedSummary.workingDays > 0) {
        return storedSummary;
    }
    const lastDay = new Date(year, month, 0).getDate();
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let workingDays = 0;
    for (let d = 1; d <= lastDay; d++) {
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
    }

    const records = await AttendanceRecord.find({
        employeeId,
        date: { $gte: periodStart, $lte: periodEnd }
    }).select('status note').lean() as any[];

    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;

    for (const r of records) {
        if (r.status === 'Present') presentDays++;
        else if (r.status === 'Late') lateDays++;
        else if (r.status === 'Half-Day') halfDays++;
        else if (r.status === 'Absent') absentDays++;
        else if (r.status === 'On Leave') leaveDays++;
    }

    return {
        workingDays,
        presentDays,
        lateDays,
        halfDays,
        absentDays,
        leaveDays
    };
}

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
            .lean() as any[];

        const enrichedPayslips = await Promise.all(payslips.map(async (p: any) => {
            const attSummary = await getOrComputeAttendanceSummary(p.employeeId, p.periodYear, p.periodMonth, p.attendanceSummary);
            return {
                ...p,
                attendanceSummary: attSummary
            };
        }));

        return res.json(enrichedPayslips);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/payroll/payslips/:payslipId/pdf
 * @desc    Generate and download PDF for a specific payslip
 * @access  admin, super-admin, or payslip owner
 */
router.get('/payslips/:payslipId/pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const payslip = await Payslip.findById(req.params.payslipId)
            .populate('payrollRunId')
            .lean() as any;

        if (!payslip) return res.status(404).json({ message: 'Payslip not found.' });

        const emp = await Employee.findOne({ employeeId: payslip.employeeId }).lean() as any;

        if (!isAdmin(authReq.user!.role)) {
            const userEmp = await Employee.findOne({ userId: authReq.user!.userId }).select('employeeId').lean() as any;
            if (!userEmp || userEmp.employeeId !== payslip.employeeId) {
                return res.status(403).json({ message: 'Forbidden.' });
            }
        }

        const company = await Company.findOne().lean() as any;
        const attSummary = await getOrComputeAttendanceSummary(payslip.employeeId, payslip.periodYear, payslip.periodMonth, payslip.attendanceSummary);

        const primaryColor = company?.branding?.primaryColor || '#4A148C';
        const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/${payslip._id}`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Payslip_${payslip.payslipNo}_${payslip.periodMonth}_${payslip.periodYear}.pdf"`);
        doc.pipe(res);

        // Header & Logo
        doc.save()
           .moveTo(210, 0)
           .lineTo(doc.page.width, 0)
           .lineTo(doc.page.width, 85)
           .lineTo(240, 85)
           .closePath()
           .fill(primaryColor);

        let logoDrawn = false;
        if (company?.logoUrl) {
            try {
                if (company.logoUrl.startsWith('data:image/')) {
                    const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    doc.image(buffer, 40, 20, { width: 110, height: 45, fit: [110, 45] });
                    logoDrawn = true;
                } else if (fs.existsSync(company.logoUrl)) {
                    doc.image(company.logoUrl, 40, 20, { width: 110, height: 45, fit: [110, 45] });
                    logoDrawn = true;
                } else {
                    const relPath = path.join(__dirname, '../../', company.logoUrl);
                    if (fs.existsSync(relPath)) {
                        doc.image(relPath, 40, 20, { width: 110, height: 45, fit: [110, 45] });
                        logoDrawn = true;
                    }
                }
            } catch (err) {
                console.error('Error rendering company logo in payslip:', err);
            }
        }

        if (!logoDrawn) {
            const defaultLogo = path.join(__dirname, '../../uploads/logo.png');
            if (fs.existsSync(defaultLogo)) {
                try {
                    doc.image(defaultLogo, 40, 20, { width: 110, height: 45, fit: [110, 45] });
                    logoDrawn = true;
                } catch {}
            }
        }

        if (!logoDrawn) {
            doc.fontSize(20).font('Helvetica-Bold').fillColor(primaryColor).text((company?.name || 'IT CONSULTING & SERVICES').toUpperCase(), 40, 30);
        }

        doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF').text('PAYSLIP / SALARY STATEMENT', 230, 26, { align: 'right', width: doc.page.width - 270 });
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#E9D5FF').text(`${MONTH_NAMES[payslip.periodMonth]} ${payslip.periodYear}`, 230, 50, { align: 'right', width: doc.page.width - 270 });

        doc.moveTo(40, 95).lineTo(doc.page.width - 40, 95).strokeColor('#E2E8F0').lineWidth(1).stroke();

        // Employee & Payment Details Table
        let y = 110;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569').text('EMPLOYEE DETAILS', 40, y);
        doc.text('PAYMENT DETAILS', 320, y);
        y += 15;

        doc.fontSize(9).font('Helvetica').fillColor('#1E293B');
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'N/A';

        doc.text(`Employee Name: ${empName}`, 40, y);
        doc.text(`Payslip No: ${payslip.payslipNo}`, 320, y);
        y += 14;

        doc.text(`Employee ID: ${payslip.employeeId}`, 40, y);
        doc.text(`Pay Period: ${MONTH_NAMES[payslip.periodMonth]} ${payslip.periodYear}`, 320, y);
        y += 14;

        doc.text(`Designation: ${emp?.jobInfo?.designation || 'N/A'}`, 40, y);
        doc.text(`Payment Method: ${payslip.paymentMethod || 'Bank Transfer'}`, 320, y);
        y += 14;

        doc.text(`Department: ${emp?.jobInfo?.department || 'N/A'}`, 40, y);
        doc.text(`Bank Name: ${emp?.bankDetails?.bankName || 'N/A'}`, 320, y);
        y += 14;

        doc.text(`CNIC: ${emp?.cnic || 'N/A'}`, 40, y);
        doc.text(`Account No: ${emp?.bankDetails?.accountNumber || 'N/A'}`, 320, y);
        y += 20;

        // Attendance Summary Grid
        doc.rect(40, y, doc.page.width - 80, 45).fillAndStroke('#F8FAFC', '#E2E8F0');
        const boxY = y + 10;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569');

        doc.text('WORKING DAYS', 55, boxY, { width: 75, align: 'center' });
        doc.text('PRESENT', 135, boxY, { width: 65, align: 'center' });
        doc.text('LATES', 205, boxY, { width: 65, align: 'center' });
        doc.text('HALF-DAYS', 275, boxY, { width: 65, align: 'center' });
        doc.text('ABSENTS', 345, boxY, { width: 65, align: 'center' });
        doc.text('LEAVES', 415, boxY, { width: 65, align: 'center' });

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0F172A');
        doc.text(String(attSummary.workingDays), 55, boxY + 14, { width: 75, align: 'center' });
        doc.text(String(attSummary.presentDays), 135, boxY + 14, { width: 65, align: 'center' });
        doc.text(String(attSummary.lateDays), 205, boxY + 14, { width: 65, align: 'center' });
        doc.text(String(attSummary.halfDays), 275, boxY + 14, { width: 65, align: 'center' });
        doc.text(String(attSummary.absentDays), 345, boxY + 14, { width: 65, align: 'center' });
        doc.text(String(attSummary.leaveDays), 415, boxY + 14, { width: 65, align: 'center' });

        y += 60;

        // Earnings & Deductions Tables
        const tableMargin = 40;
        const colGap = 20;
        const colWidth = (doc.page.width - (tableMargin * 2) - colGap) / 2;
        const earnLeft = tableMargin;
        const dedLeft = tableMargin + colWidth + colGap;

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B');
        doc.text('EARNINGS', earnLeft, y);
        doc.text('DEDUCTIONS', dedLeft, y);
        y += 18;

        let earnY = y;
        doc.fontSize(9).font('Helvetica').fillColor('#334155');
        for (const e of payslip.earnings || []) {
            doc.text(e.component, earnLeft, earnY, { width: colWidth - 90 });
            doc.text(`PKR ${e.amount.toLocaleString()}`, earnLeft, earnY, { align: 'right', width: colWidth });
            earnY += 16;
        }

        let dedY = y;
        for (const d of payslip.deductions || []) {
            doc.text(d.component, dedLeft, dedY, { width: colWidth - 90 });
            doc.text(`PKR ${d.amount.toLocaleString()}`, dedLeft, dedY, { align: 'right', width: colWidth });
            dedY += 16;
        }

        y = Math.max(earnY, dedY) + 15;

        // Subtotals
        doc.rect(tableMargin, y, doc.page.width - (tableMargin * 2), 25).fill('#F1F5F9');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0F172A');

        doc.text('Gross Earnings:', earnLeft + 10, y + 7, { width: 110 });
        doc.text(`PKR ${payslip.grossPay.toLocaleString()}`, earnLeft, y + 7, { align: 'right', width: colWidth - 10 });

        doc.text('Total Deductions:', dedLeft + 10, y + 7, { width: 110 });
        doc.text(`PKR ${payslip.totalDeductions.toLocaleString()}`, dedLeft, y + 7, { align: 'right', width: colWidth - 10 });

        y += 35;

        // Net Pay Banner
        doc.rect(tableMargin, y, doc.page.width - (tableMargin * 2), 40).fill(primaryColor);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text('NET TAKE-HOME SALARY:', tableMargin + 15, y + 14);
        doc.fontSize(14).font('Helvetica-Bold').text(`PKR ${payslip.netPay.toLocaleString()}`, tableMargin, y + 13, { align: 'right', width: doc.page.width - (tableMargin * 2) - 15 });

        y += 55;

        // QR Code & Signatures
        if (qrCodeDataUri) {
            doc.image(qrCodeDataUri, 40, y, { width: 65 });
            doc.fontSize(7).font('Helvetica').fillColor('#64748B').text('Scan to verify payslip authenticity', 40, y + 70);
        }

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1E293B').text('Authorized Signatory', doc.page.width - 200, y + 45, { align: 'center', width: 160 });
        doc.fontSize(8).font('Helvetica').fillColor('#64748B').text('IT Consulting and Services (ITCS)', doc.page.width - 200, y + 58, { align: 'center', width: 160 });
        doc.moveTo(doc.page.width - 200, y + 40).lineTo(doc.page.width - 40, y + 40).strokeColor('#CBD5E1').lineWidth(1).stroke();

        doc.end();
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

        const grossPay = (payslip.earnings || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
        const totalDeductions = (payslip.deductions || []).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
        payslip.grossPay = grossPay;
        payslip.totalDeductions = totalDeductions;
        payslip.netPay = grossPay - totalDeductions;

        await payslip.save();
        return res.json(payslip);
    } catch (err) {
        next(err);
    }
});

router.get('/:runId/bank-advice-pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const { runId } = req.params;
        if (!mongoose.isValidObjectId(runId)) {
            return res.status(400).json({ message: 'Invalid run ID.' });
        }

        const run = await PayrollRun.findById(runId).lean() as any;
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        const payslips = await Payslip.find({ payrollRunId: runId })
            .populate({
                path: 'employeeDetails',
                select: 'firstName lastName employeeId bankDetails jobInfo companyId'
            })
            .lean() as any[];

        if (!payslips.length) {
            return res.status(400).json({ message: 'No payslips found for this payroll run.' });
        }

        // Fetch company details for branding
        const company = await Company.findOne().lean() as any;

        const primaryColor = company?.branding?.primaryColor || '#4A148C';
        const totalNet = payslips.reduce((s, p) => s + (p.netPay || 0), 0);

        const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });

        const safeTitle = (run.title || 'Payroll').replace(/[^a-zA-Z0-9_\-]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Bank_Advice_${safeTitle}.pdf"`);
        doc.pipe(res);

        // Top Accent Graphic Ribbon (matching Payslip PDF polygon geometry & dimensions)
        doc.save()
           .moveTo(440, 0)
           .lineTo(doc.page.width, 0)
           .lineTo(doc.page.width, 85)
           .lineTo(470, 85)
           .closePath()
           .fill(primaryColor);

        // Company Logo (Top-Left)
        let logoDrawn = false;
        if (company?.logoUrl) {
            try {
                if (company.logoUrl.startsWith('data:image/')) {
                    const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    doc.image(buffer, 36, 20, { width: 95, height: 45, fit: [95, 45] });
                    logoDrawn = true;
                } else if (fs.existsSync(company.logoUrl)) {
                    doc.image(company.logoUrl, 36, 20, { width: 95, height: 45, fit: [95, 45] });
                    logoDrawn = true;
                } else {
                    const relPath = path.join(__dirname, '../../', company.logoUrl);
                    if (fs.existsSync(relPath)) {
                        doc.image(relPath, 36, 20, { width: 95, height: 45, fit: [95, 45] });
                        logoDrawn = true;
                    }
                }
            } catch (err) {
                console.error('Error rendering company logo in bank advice:', err);
            }
        }

        if (!logoDrawn) {
            const defaultLogo = path.join(__dirname, '../../uploads/logo.png');
            if (fs.existsSync(defaultLogo)) {
                try {
                    doc.image(defaultLogo, 36, 20, { width: 95, height: 45, fit: [95, 45] });
                    logoDrawn = true;
                } catch {}
            }
        }

        if (!logoDrawn) {
            doc.fontSize(18).font('Helvetica-Bold').fillColor(primaryColor).text((company?.name || 'IT CONSULTING & SERVICES').toUpperCase(), 36, 30);
        }

        // Company Full Name & Subtitle on Left (White background area, X=140 to 430)
        const companyFullName = company?.name ? company.name.toUpperCase() : 'IT CONSULTING AND SERVICES (PVT) LTD';
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text(companyFullName, 140, 28, { width: 290 });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#64748B').text('SALARY DISBURSEMENT ADVICE / MEEZAN BANK TRANSFER LETTER', 140, 48, { width: 290 });

        // Title & Subtitle inside Dark Purple Slant Ribbon (Right side, white & #E9D5FF text)
        doc.fontSize(15).font('Helvetica-Bold').fillColor('#FFFFFF').text('SALARY DISBURSEMENT ADVICE', 460, 26, { align: 'right', width: doc.page.width - 496 });
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#E9D5FF').text(`${run.title} • TOTAL: PKR ${totalNet.toLocaleString()}`, 460, 50, { align: 'right', width: doc.page.width - 496 });

        // Header Divider Line (Y = 95, matching Payslip PDF)
        doc.moveTo(36, 95).lineTo(doc.page.width - 36, 95).strokeColor('#E2E8F0').lineWidth(1).stroke();

        let y = 110;

        // Table Header
        const drawTableHeader = (startY: number) => {
            doc.rect(36, startY, doc.page.width - 72, 25).fill(primaryColor);
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF');
            
            doc.text('Sr #', 45, startY + 7, { width: 35 });
            doc.text('Emp ID', 85, startY + 7, { width: 65 });
            doc.text('Employee Name', 155, startY + 7, { width: 160 });
            doc.text('Bank Name', 320, startY + 7, { width: 135 });
            doc.text('Account Title / Number / IBAN', 460, startY + 7, { width: 200 });
            doc.text('Net Pay (PKR)', 665, startY + 7, { width: 130, align: 'right' });
        };

        drawTableHeader(y);
        y += 25;

        payslips.forEach((p: any, idx: number) => {
            if (y > doc.page.height - 85) {
                doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
                y = 36;
                drawTableHeader(y);
                y += 25;
            }

            const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            doc.rect(36, y, doc.page.width - 72, 22).fill(bg).stroke('#E2E8F0');

            const empName = p.employeeDetails 
                ? `${p.employeeDetails.firstName || ''} ${p.employeeDetails.lastName || ''}`.trim()
                : 'Employee';
            const bankName = p.employeeDetails?.bankDetails?.bankName || 'Meezan Bank';
            const acctNo = p.employeeDetails?.bankDetails?.accountNumber || 'Pending Account Info';

            doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
            doc.text(`${idx + 1}`, 45, y + 6, { width: 35 });
            doc.text(`${p.employeeId || '—'}`, 85, y + 6, { width: 65 });
            doc.text(empName, 155, y + 6, { width: 160, ellipsis: true });
            doc.text(bankName, 320, y + 6, { width: 135, ellipsis: true });
            doc.text(acctNo, 460, y + 6, { width: 200, ellipsis: true });
            
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A');
            doc.text(`PKR ${(p.netPay || 0).toLocaleString()}`, 665, y + 6, { width: 130, align: 'right' });

            y += 22;
        });

        // Grand Total Summary Banner (Matching Payslip Net Take-Home Salary Banner style!)
        if (y > doc.page.height - 120) {
            doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
            y = 36;
        } else {
            y += 8;
        }

        doc.rect(36, y, doc.page.width - 72, 32).fill(primaryColor);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text(`GRAND TOTAL (${payslips.length} Employees):`, 48, y + 10, { width: 400 });
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text(`PKR ${totalNet.toLocaleString()}`, 665, y + 8, { width: 130, align: 'right' });

        y += 50;

        if (y > doc.page.height - 70) {
            doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
            y = 70;
        }

        // Signature Lines Block
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569');
        
        doc.moveTo(50, y).lineTo(220, y).strokeColor('#CBD5E1').lineWidth(1).stroke();
        doc.text('Prepared By (HR / Finance)', 50, y + 6);

        doc.text('Verified By (Head of Finance)', 300, y + 6);

        doc.moveTo(570, y).lineTo(770, y).strokeColor('#94A3B8').lineWidth(1).stroke();
        doc.text('Authorized Signatory (Meezan Bank Transfer)', 570, y + 6);

        doc.end();
    } catch (err) {
        next(err);
    }
});

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

        // ── Meal Allowance: PKR 500 per FULL working day ('Present' only, no WFH/Late/Half-Day) ──
        const lastDay     = new Date(run.periodYear, run.periodMonth, 0).getDate();
        const periodStart = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;
        const periodEnd   = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Calculate actual working days (Monday - Friday) in the payroll month
        let workingDaysCount = 0;
        for (let d = 1; d <= lastDay; d++) {
            const dayOfWeek = new Date(run.periodYear, run.periodMonth - 1, d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Sunday, 6 = Saturday
                workingDaysCount++;
            }
        }
        const monthlyWorkingDays = workingDaysCount > 0 ? workingDaysCount : 22;
        
        // HR Policy: Meal Allowance only on full working days ('Present'), not on Lates, Half-Days, or WFH
        const mealRecords = await AttendanceRecord.find({
            date:   { $gte: periodStart, $lte: periodEnd },
            status: 'Present',
            note:   { $not: /wfh|work from home/i }
        }).select('employeeId').lean() as any[];

        const mealDaysMap: Record<string, number> = {};
        for (const r of mealRecords) {
            mealDaysMap[r.employeeId] = (mealDaysMap[r.employeeId] ?? 0) + 1;
        }
        const MEAL_RATE = 500; // PKR per full working day

        // ── Attendance Penalty Deductions: Late 9:30-10:00 (0.5 day cut), Half-Day >10:00 & Absent (1.0 day cut) ──
        const periodRecords = await AttendanceRecord.find({
            date:   { $gte: periodStart, $lte: periodEnd },
            status: { $in: ['Late', 'Half-Day', 'Absent'] }
        }).select('employeeId status').lean() as any[];

        const attendanceDeductionsMap: Record<string, { halfDays: number; absents: number }> = {};
        for (const r of periodRecords) {
            if (!attendanceDeductionsMap[r.employeeId]) {
                attendanceDeductionsMap[r.employeeId] = { halfDays: 0, absents: 0 };
            }
            if (r.status === 'Late') {
                // Check-in 9:30 AM - 10:00 AM -> 0.5 day cut
                attendanceDeductionsMap[r.employeeId].halfDays += 1;
            } else if (r.status === 'Half-Day' || r.status === 'Absent') {
                // Check-in after 10:00 AM or No punch -> 1.0 day cut
                attendanceDeductionsMap[r.employeeId].absents += 1;
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Calculate current loan balances for all employees
        const allCompletedLoans = await EmployeeRequest.find({
            status: 'Completed',
            category: { $in: ['Loan', 'Request Loan'] }
        }).lean();

        const allFinalizedPayslips = await Payslip.find({ status: 'Finalized' }).lean();

        const loanBalanceMap: Record<string, { balance: number, monthlyDeduction: number }> = {};
        for (const loan of allCompletedLoans) {
            const empId = loan.employeeId;
            if (!loanBalanceMap[empId]) {
                loanBalanceMap[empId] = { balance: 0, monthlyDeduction: 0 };
            }
            loanBalanceMap[empId].balance += Number((loan as any).details?.requestedAmount || 0);
            loanBalanceMap[empId].monthlyDeduction += Number((loan as any).details?.recommendedMonthlyDeduction || 0);
        }

        for (const slip of allFinalizedPayslips) {
            const empId = slip.employeeId;
            if (loanBalanceMap[empId]) {
                const loanDeds = (slip.deductions || []).filter((d: any) => d.component === 'Loan Deduction');
                for (const d of loanDeds) {
                    loanBalanceMap[empId].balance -= (d.amount || 0);
                }
            }
        }

        const counterKey = `payslipNo_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}`;
        const counter = await Counter.findOneAndUpdate(
            { key: counterKey },
            { $inc: { seq: employees.length } },
            { upsert: true, new: true }
        );
        let nextSeq = counter.seq - employees.length + 1;
        const prefix = `PS-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-`;

        const payslips = [];
        for (const emp of employees) {
            // Map Employee.salaryComponents[] → Payslip.earnings[]
            const earnings = (emp.salaryComponents || []).map((sc: any) => ({
                component: sc.component || 'Basic',
                amount: sc.amount || 0,
                type: sc.type || 'fixed',
            }));

            // Check if employee's work anniversary falls in the run period month
            let hasAnniversaryInMonth = false;
            let yearsCompleted = 0;
            if (emp.jobInfo?.joiningDate) {
                const joiningDate = new Date(emp.jobInfo.joiningDate);
                const joiningMonth = joiningDate.getMonth() + 1; // 1-12
                const joiningYear = joiningDate.getFullYear();

                if (joiningMonth === run.periodMonth && joiningYear < run.periodYear) {
                    hasAnniversaryInMonth = true;
                    yearsCompleted = run.periodYear - joiningYear;
                }
            }

            let notes = '';
            if (hasAnniversaryInMonth) {
                earnings.push({
                    component: 'Anniversary Bonus',
                    amount: 0, // Placeholder to be filled manually
                    type: 'fixed'
                });
                notes = `Eligible for Work Anniversary Bonus (${yearsCompleted} Year${yearsCompleted > 1 ? 's' : ''} completed).`;
            }

            // Meal Allowance — always present in payslip; 0 if no qualifying days
            const mealDays = mealDaysMap[emp.employeeId] ?? 0;
            earnings.push({
                component: 'Meal Allowance',
                amount: mealDays * MEAL_RATE,
                type: 'variable',
            });

            const grossPay = earnings.reduce((sum: number, e: any) => sum + e.amount, 0);
            
            const deductions = [];
            let totalDeductions = 0;

            // Attendance Penalty: 0.5 day cut for Half-Day, 1.0 day cut for Unpaid Absent
            const attInfo = attendanceDeductionsMap[emp.employeeId];
            if (attInfo) {
                const basicComp = (emp.salaryComponents || []).find((c: any) => (c.component || '').toLowerCase().includes('basic'));
                const basicSal = basicComp ? basicComp.amount : (earnings[0]?.amount || 0);
                const dailyRate = basicSal / monthlyWorkingDays;

                if (attInfo.halfDays > 0) {
                    const halfDayAmount = Math.round(attInfo.halfDays * 0.5 * dailyRate);
                    if (halfDayAmount > 0) {
                        const unitStr = attInfo.halfDays === 1 ? 'half-day' : 'half-days';
                        deductions.push({
                            component: `Half-Day Penalty (${attInfo.halfDays} ${unitStr})`,
                            amount: halfDayAmount
                        });
                        totalDeductions += halfDayAmount;
                    }
                }

                if (attInfo.absents > 0) {
                    const absentAmount = Math.round(attInfo.absents * 1.0 * dailyRate);
                    if (absentAmount > 0) {
                        const unitStr = attInfo.absents === 1 ? 'day' : 'days';
                        deductions.push({
                            component: `Absence Penalty (${attInfo.absents} ${unitStr})`,
                            amount: absentAmount
                        });
                        totalDeductions += absentAmount;
                    }
                }
            }
            
            const loanInfo = loanBalanceMap[emp.employeeId];
            if (loanInfo && loanInfo.balance > 0) {
                // If they still owe money, calculate deduction
                const amountToDeduct = Math.min(loanInfo.balance, loanInfo.monthlyDeduction);
                if (amountToDeduct > 0) {
                    deductions.push({
                        component: 'Loan Deduction',
                        amount: amountToDeduct
                    });
                    totalDeductions += amountToDeduct;
                }
            }
            
            const netPay = grossPay - totalDeductions;
            
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
                deductions,
                grossPay,
                totalDeductions,
                netPay,
                status: 'Draft',
                paymentMethod: 'Bank Transfer',
                notes: notes || undefined,
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

        // Process Provident Fund contributions for the employees
        const payslips = await Payslip.find({ payrollRunId: run._id });
        for (const payslip of payslips) {
            const employee = await Employee.findOne({ employeeId: payslip.employeeId });
            if (!employee) continue;

            // Check if payroll contribution already exists for this month/year for this employee
            const existingPF = employee.providentFundHistory?.some(
                (pf: any) => pf.source === 'payroll' && pf.periodMonth === run.periodMonth && pf.periodYear === run.periodYear
            );

            if (!existingPF) {
                // Determine base salary for PF calculation (Basic Salary or grossPay fallback)
                const basicSalaryComponent = employee.salaryComponents?.find(
                    (c: any) => c.component === 'Basic Salary' || c.component === 'Basic'
                );
                const baseAmount = basicSalaryComponent ? basicSalaryComponent.amount : payslip.grossPay;
                const pfContribution = Math.round(baseAmount * 0.15);

                if (pfContribution > 0) {
                    const historyEntry = {
                        amount: pfContribution,
                        type: 'credit',
                        source: 'payroll',
                        date: new Date(),
                        description: `Payroll Contribution - ${MONTH_NAMES[run.periodMonth]} ${run.periodYear}`,
                        periodMonth: run.periodMonth,
                        periodYear: run.periodYear,
                        payrollRunId: run._id.toString()
                    };

                    if (!employee.providentFundHistory) {
                        employee.providentFundHistory = [];
                    }
                    employee.providentFundHistory.push(historyEntry as any);
                    employee.providentFundBalance = (employee.providentFundBalance || 0) + pfContribution;
                    await employee.save();
                }
            }
        }

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

        const { erpReferenceId } = req.body || {};

        run.status = 'Disbursed';
        run.disbursedAt = new Date();
        if (erpReferenceId !== undefined) {
            run.erpReferenceId = erpReferenceId;
        }
        await run.save();

        return res.json(run);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   DELETE /api/payroll/:runId
 * @desc    Delete a payroll run and all its payslips (if not yet disbursed)
 * @access  admin, super-admin
 */
router.delete('/:runId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const run = await PayrollRun.findById(req.params.runId);
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        if (run.status === 'Disbursed') {
            return res.status(400).json({
                message: `Paid/Disbursed payroll runs cannot be deleted.`,
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

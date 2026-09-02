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
import { getHolidayDatesInPeriod } from '../utils/holidayUtils';
import ExpenseClaim from '../models/ExpenseClaim';
import { sendPayslipDisbursedEmail } from '../utils/email';
import { formatEmployeeFullName } from '../utils/nameHelper';
import { generateCustomerReference, encryptFinancialField, decryptFinancialField } from '../utils/encryption';
import { buildPayrollPayslips, computePayrollAmountTotals } from '../services/payrollCalculation';
import * as XLSX from 'xlsx';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isAdmin(role: string): boolean {
    const normalized = (role || '').toLowerCase().trim();
    return ['super-admin', 'admin', 'finance'].includes(normalized);
}

function getEmploymentStatus(emp: any): string {
    if (!emp?.employmentStatus) return '';
    if (typeof emp.employmentStatus === 'string') return emp.employmentStatus;
    return emp.employmentStatus.status || '';
}

/** Resolve payslip earnings from salaryComponents, falling back to financeInfo salary fields. */
function resolveEmployeeEarnings(emp: any): { component: string; amount: number; type: 'fixed' | 'variable' }[] {
    const fromComponents = (emp.salaryComponents || [])
        .filter((sc: any) => sc && sc.component && (Number(sc.amount) || 0) > 0)
        .map((sc: any) => ({
            component: sc.component,
            amount: Number(sc.amount) || 0,
            type: (sc.type === 'variable' ? 'variable' : 'fixed') as 'fixed' | 'variable',
        }));

    if (fromComponents.length > 0) return fromComponents;

    const status = getEmploymentStatus(emp);
    const probationSalary = Number(emp.financeInfo?.probationSalary) || 0;
    const confirmedSalary = Number(emp.financeInfo?.confirmedSalary) || 0;

    let fallbackAmount = 0;
    let component = 'Basic Salary';

    if (status === 'Probation' && probationSalary > 0) {
        fallbackAmount = probationSalary;
        component = 'Probation Salary';
    } else if (confirmedSalary > 0) {
        fallbackAmount = confirmedSalary;
    } else if (probationSalary > 0) {
        fallbackAmount = probationSalary;
        if (status === 'Probation') component = 'Probation Salary';
    }

    if (fallbackAmount > 0) {
        return [{ component, amount: fallbackAmount, type: 'fixed' }];
    }

    return [];
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

        const { periodMonth, periodYear, startDate, endDate, currency = 'PKR', notes } = req.body;

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

        // Calculate default startDate & endDate if not provided
        const lastDay = new Date(year, month, 0).getDate();
        const defaultStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const defaultEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const finalStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : defaultStart;
        const finalEnd = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : defaultEnd;

        if (finalStart > finalEnd) {
            return res.status(400).json({ message: 'Start date must be before or equal to End date.' });
        }

        const title = `${MONTH_NAMES[month]} ${year} Payroll`;
        const erpTaskId = `BATCH-${year}${String(month).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const run = await PayrollRun.create({
            title,
            periodMonth: month,
            periodYear: year,
            startDate: finalStart,
            endDate: finalEnd,
            currency,
            notes,
            createdBy: authReq.user!.userId,
            status: 'Draft',
            erpTaskId,
            erpStatus: 'Pending',
        });

        return res.status(201).json(run);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   PUT /api/payroll/:runId
 * @desc    Update a Draft payroll run (e.g. adjust calculation start/end date or notes)
 * @access  admin, super-admin
 */
router.put('/:runId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
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
            return res.status(400).json({ message: `Cannot modify a payroll run with status "${run.status}".` });
        }

        const { startDate, endDate, notes, title } = req.body;

        if (startDate !== undefined) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
                return res.status(400).json({ message: 'Invalid start date format (expected YYYY-MM-DD).' });
            }
            run.startDate = startDate;
        }

        if (endDate !== undefined) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
                return res.status(400).json({ message: 'Invalid end date format (expected YYYY-MM-DD).' });
            }
            run.endDate = endDate;
        }

        if (run.startDate && run.endDate && run.startDate > run.endDate) {
            return res.status(400).json({ message: 'Start date must be before or equal to End date.' });
        }

        if (notes !== undefined) run.notes = notes;
        if (title !== undefined && String(title).trim()) run.title = String(title).trim();

        await run.save();
        return res.json(run);
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
        const payslips = await Payslip.find({ payrollRunId: { $in: runIds } }).select('payrollRunId netPay').lean() as any[];
        const countMap: Record<string, { count: number; totalNet: number }> = {};
        payslips.forEach((p: any) => {
            const runId = p.payrollRunId?.toString();
            if (!runId) return;
            if (!countMap[runId]) {
                countMap[runId] = { count: 0, totalNet: 0 };
            }
            countMap[runId].count += 1;
            countMap[runId].totalNet += Number(p.netPay) || 0;
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
async function getOrComputeAttendanceSummary(employeeId: string, year: number, month: number, storedSummary?: any, customStart?: string, customEnd?: string) {
    if (storedSummary && storedSummary.workingDays > 0) {
        return storedSummary;
    }
    const lastDay = new Date(year, month, 0).getDate();
    const periodStart = customStart || `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = customEnd || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let workingDays = 0;
    const cur = new Date(periodStart + 'T12:00:00.000Z');
    const stop = new Date(periodEnd + 'T12:00:00.000Z');
    while (cur <= stop) {
        const dayOfWeek = cur.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (workingDays === 0) workingDays = 22;

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

        let emp = await Employee.findOne({ userId: authReq.user!.userId })
            .select('employeeId')
            .lean() as any;

        if (!emp && authReq.user?.email) {
            emp = await Employee.findOne({
                isDeleted: { $ne: true },
                $or: [
                    { workEmail: { $regex: new RegExp(`^${authReq.user.email}$`, 'i') } },
                    { personalEmail: { $regex: new RegExp(`^${authReq.user.email}$`, 'i') } },
                    { email: { $regex: new RegExp(`^${authReq.user.email}$`, 'i') } }
                ]
            }).select('employeeId').lean() as any;
        }

        if (!emp) {
            return res.status(404).json({ message: 'No employee record linked to your account.' });
        }

        const payslips = await Payslip.find({
            employeeId: emp.employeeId,
            status: 'Finalized',
        })
            .populate('payrollRunId', 'title periodMonth periodYear startDate endDate status disbursedAt currency')
            .sort({ periodYear: -1, periodMonth: -1 })
            .lean() as any[];

        const enrichedPayslips = await Promise.all(payslips.map(async (p: any) => {
            if (p.attendanceSummary && p.attendanceSummary.workingDays > 0) {
                return p;
            }
            const run = p.payrollRunId;
            const attSummary = await getOrComputeAttendanceSummary(p.employeeId, p.periodYear, p.periodMonth, p.attendanceSummary, run?.startDate, run?.endDate);
            // Asynchronously persist to database so subsequent loads are instant
            Payslip.updateOne({ _id: p._id }, { $set: { attendanceSummary: attSummary } }).catch(() => {});
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
async function generatePayslipPdfBuffer(payslipId: string): Promise<Buffer> {
    const payslip = await Payslip.findById(payslipId)
        .populate('payrollRunId')
        .lean() as any;

    if (!payslip) throw new Error('Payslip not found.');

    const emp = await Employee.findOne({ employeeId: payslip.employeeId }).lean() as any;
    const company = await Company.findOne().lean() as any;

    const darkPurple = company?.branding?.primaryColor || '#1C0626';
    const magentaAccent = company?.branding?.secondaryColor || '#721466';

    const attSummary = await getOrComputeAttendanceSummary(
        payslip.employeeId,
        payslip.periodYear,
        payslip.periodMonth,
        payslip.attendanceSummary,
        payslip.payrollRunId?.startDate,
        payslip.payrollRunId?.endDate
    );

    const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyUrl = `${clientHost}/verify/${payslip._id}`;
    const qrCodeDataUri = await QRCode.toDataURL(verifyUrl).catch(() => '');

    return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 65, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        // 1. Logo (Top-Left)
        let logoDrawn = false;
        if (company?.logoUrl && company.logoUrl.startsWith('data:image/')) {
            try {
                const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                doc.image(buffer, 60, 22, { width: 140, height: 60, fit: [140, 60] });
                logoDrawn = true;
            } catch (err) {
                console.error('Error rendering base64 company logo in payslip:', err);
            }
        }

        if (!logoDrawn) {
            const candidatePaths = [
                company?.logoUrl ? path.join(__dirname, '../../', company.logoUrl) : null,
                company?.logoUrl ? company.logoUrl : null,
                path.join(__dirname, '../../../client/src/assets/logo.png'),
                path.join(__dirname, '../../uploads/logo.png'),
                path.join(__dirname, '../../../client/public/logo.png')
            ].filter(Boolean) as string[];

            for (const p of candidatePaths) {
                if (fs.existsSync(p)) {
                    try {
                        doc.image(p, 60, 22, { width: 140, height: 60, fit: [140, 60] });
                        logoDrawn = true;
                        break;
                    } catch (err) {
                        console.error('Error drawing payslip logo from path:', p, err);
                    }
                }
            }
        }

        if (!logoDrawn) {
            doc.fontSize(18).font('Helvetica-Bold').fillColor(darkPurple).text((company?.name || 'IT CONSULTING & SERVICES').toUpperCase(), 60, 35);
        }

        // 2. Top-Right Geometric Purple Decoration (ITCS Official Polygon Ribbon)
        doc.save()
           .moveTo(doc.page.width - 170, 0)
           .lineTo(doc.page.width - 55, 75)
           .lineTo(doc.page.width - 55, 115)
           .lineTo(doc.page.width, 40)
           .lineTo(doc.page.width, 0)
           .closePath()
           .fill(darkPurple);

        doc.save()
           .moveTo(doc.page.width - 55, 75)
           .lineTo(doc.page.width - 55, 115)
           .lineTo(doc.page.width, 175)
           .lineTo(doc.page.width, 40)
           .closePath()
           .fill(magentaAccent);

        // 3. Header Divider Line
        doc.moveTo(60, 105)
           .lineTo(doc.page.width - 65, 105)
           .strokeColor('#888888')
           .lineWidth(0.8)
           .stroke();

        const periodSubtitle = payslip.payrollRunId?.startDate && payslip.payrollRunId?.endDate
            ? `${MONTH_NAMES[payslip.periodMonth]} ${payslip.periodYear} (${payslip.payrollRunId.startDate} to ${payslip.payrollRunId.endDate})`
            : `${MONTH_NAMES[payslip.periodMonth]} ${payslip.periodYear}`;

        // Title text in top right white region (positioned to the left of the ribbon to prevent overlap)
        doc.fontSize(11).font('Helvetica-Bold').fillColor(darkPurple).text('PAYSLIP / SALARY STATEMENT', 100, 45, { align: 'right', width: doc.page.width - 290 });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#64748B').text(periodSubtitle, 100, 62, { align: 'right', width: doc.page.width - 290 });

        // Employee & Payment Details Table
        let y = 120;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569').text('EMPLOYEE DETAILS', 60, y);
        doc.text('PAYMENT DETAILS', 310, y);
        y += 15;

        doc.fontSize(9).font('Helvetica').fillColor('#1E293B');
        const empName = formatEmployeeFullName(emp, 'N/A');

        doc.text(`Employee Name: ${empName}`, 60, y);
        doc.text(`Payslip No: ${payslip.payslipNo}`, 310, y);
        y += 14;

        doc.text(`Employee ID: ${payslip.employeeId}`, 60, y);
        doc.text(`Pay Period: ${periodSubtitle}`, 310, y, { width: 220, ellipsis: true });
        y += 14;

        doc.text(`Designation: ${emp?.jobInfo?.designation || 'N/A'}`, 60, y);
        doc.text(`Payment Method: ${payslip.paymentMethod || 'Bank Transfer'}`, 310, y);
        y += 14;

        doc.text(`Department: ${emp?.jobInfo?.department || 'N/A'}`, 60, y);
        doc.text(`Bank Name: ${emp?.bankDetails?.bankName || 'N/A'}`, 310, y);
        y += 14;

        doc.text(`CNIC: ${emp?.cnic || 'N/A'}`, 60, y);
        doc.text(`Account No: ${emp?.bankDetails?.accountNumber || 'N/A'}`, 310, y);
        y += 20;

        // Attendance Summary Grid
        doc.rect(60, y, doc.page.width - 120, 45).fillAndStroke('#F8FAFC', '#E2E8F0');
        const boxY = y + 10;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569');

        doc.text('WORKING DAYS', 65, boxY, { width: 75, align: 'center' });
        doc.text('PRESENT', 145, boxY, { width: 75, align: 'center' });
        doc.text('LATES', 225, boxY, { width: 75, align: 'center' });
        doc.text('HALF-DAYS', 305, boxY, { width: 75, align: 'center' });
        doc.text('ABSENTS', 385, boxY, { width: 75, align: 'center' });
        doc.text('LEAVES', 465, boxY, { width: 75, align: 'center' });

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0F172A');
        doc.text(String(attSummary.workingDays), 65, boxY + 14, { width: 75, align: 'center' });
        doc.text(String(attSummary.presentDays), 145, boxY + 14, { width: 75, align: 'center' });
        doc.text(String(attSummary.lateDays), 225, boxY + 14, { width: 75, align: 'center' });
        doc.text(String(attSummary.halfDays), 305, boxY + 14, { width: 75, align: 'center' });
        doc.text(String(attSummary.absentDays), 385, boxY + 14, { width: 75, align: 'center' });
        doc.text(String(attSummary.leaveDays), 465, boxY + 14, { width: 75, align: 'center' });

        y += 60;

        // Earnings & Deductions Tables
        const tableMargin = 60;
        const tableWidth = doc.page.width - (tableMargin * 2);
        const colWidth = (tableWidth / 2) - 10;
        const dedLeft = tableMargin + colWidth + 20;

        doc.rect(tableMargin, y, colWidth, 24).fill('#F1F5F9');
        doc.rect(dedLeft, y, colWidth, 24).fill('#F1F5F9');

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155');
        doc.text('EARNINGS', tableMargin + 10, y + 7);
        doc.text('AMOUNT (PKR)', tableMargin, y + 7, { align: 'right', width: colWidth - 10 });
        doc.text('DEDUCTIONS', dedLeft + 10, y + 7);
        doc.text('AMOUNT (PKR)', dedLeft, y + 7, { align: 'right', width: colWidth - 10 });

        y += 24;

        const maxRows = Math.max(payslip.earnings?.length || 0, payslip.deductions?.length || 0, 1);
        doc.fontSize(8.5).font('Helvetica').fillColor('#1E293B');

        for (let i = 0; i < maxRows; i++) {
            const earn = payslip.earnings?.[i];
            const ded = payslip.deductions?.[i];

            const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            doc.rect(tableMargin, y, colWidth, 20).fill(rowBg);
            doc.rect(dedLeft, y, colWidth, 20).fill(rowBg);

            doc.fillColor('#1E293B');

            if (earn) {
                doc.text(earn.component, tableMargin + 10, y + 5, { width: colWidth - 100 });
                doc.text(earn.amount.toLocaleString(), tableMargin, y + 5, { align: 'right', width: colWidth - 10 });
            }

            if (ded) {
                doc.text(ded.component, dedLeft + 10, y + 5, { width: colWidth - 100 });
                doc.text(ded.amount.toLocaleString(), dedLeft, y + 5, { align: 'right', width: colWidth - 10 });
            }

            y += 20;
        }

        // Totals Row
        doc.rect(tableMargin, y, colWidth, 24).fill('#E2E8F0');
        doc.rect(dedLeft, y, colWidth, 24).fill('#E2E8F0');

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0F172A');
        doc.text('Total Earnings:', tableMargin + 10, y + 7, { width: 110 });
        doc.text(`PKR ${payslip.grossPay.toLocaleString()}`, tableMargin, y + 7, { align: 'right', width: colWidth - 10 });
        doc.text('Total Deductions:', dedLeft + 10, y + 7, { width: 110 });
        doc.text(`PKR ${payslip.totalDeductions.toLocaleString()}`, dedLeft, y + 7, { align: 'right', width: colWidth - 10 });

        y += 32;

        // Net Pay Banner
        doc.rect(tableMargin, y, doc.page.width - (tableMargin * 2), 36).fill(darkPurple);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text('NET TAKE-HOME SALARY:', tableMargin + 15, y + 12);
        doc.fontSize(13).font('Helvetica-Bold').text(`PKR ${payslip.netPay.toLocaleString()}`, tableMargin, y + 11, { align: 'right', width: doc.page.width - (tableMargin * 2) - 15 });

        // Footer Section (Dashed Line + Centered Subtitle + Bottom Purple Banner)
        doc.page.margins.bottom = 0;

        doc.moveTo(60, doc.page.height - 110)
           .lineTo(doc.page.width - 60, doc.page.height - 110)
           .dash(2, { space: 2 })
           .strokeColor('#333333')
           .stroke();

        if (qrCodeDataUri) {
            try {
                const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
                const imageBuffer = Buffer.from(base64Data, 'base64');
                doc.image(imageBuffer, (doc.page.width / 2) - 22, doc.page.height - 100, { width: 44 });
            } catch (e) {}
        }

        doc.fillColor('#444444')
           .fontSize(7)
           .font('Helvetica-Bold')
           .text('I T C S   ( I T   C O N S U L T I N G   &   S E R V I C E S )', 45, doc.page.height - 52, { align: 'center', width: doc.page.width - 90, lineBreak: false });

        const bannerHeight = 38;
        const bannerY = doc.page.height - bannerHeight;

        doc.rect(0, bannerY, doc.page.width, bannerHeight).fill(darkPurple);

        doc.save()
           .moveTo(0, bannerY)
           .lineTo(85, bannerY)
           .lineTo(120, doc.page.height)
           .lineTo(0, doc.page.height)
           .closePath()
           .fill(magentaAccent);

        doc.save()
           .moveTo(doc.page.width - 85, bannerY)
           .lineTo(doc.page.width, bannerY)
           .lineTo(doc.page.width, doc.page.height)
           .lineTo(doc.page.width - 120, doc.page.height)
           .closePath()
           .fill(magentaAccent);

        doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
        doc.text('Karachi: 6/K Block 2, P.E.C.H.S, Near Model School Karachi Pakistan', 10, bannerY + 6, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        doc.text('Lahore: Office 32, 1st Floor, I.T Tower 73-E/1, Hali Rd, Block A Gulberg III', 10, bannerY + 16, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        doc.text('Islamabad: Office # 14, Ground Floor, Malik Plaza F-8 Markaz', 10, bannerY + 26, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        
        doc.fontSize(6).text('INFO@ITCS.COM.PK', 15, bannerY + 16, { width: 100, align: 'left', lineBreak: false });
        doc.fontSize(6).text('+92 21 111-482-711', doc.page.width - 115, bannerY + 16, { width: 100, align: 'right', lineBreak: false });

        doc.end();
    });
}

/**
 * @route   GET /api/payroll/payslips/:payslipId/pdf
 * @desc    Generate and download PDF payslip for a given payslip ID
 * @access  admin, super-admin, or payslip owner
 */
router.get('/payslips/:payslipId/pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const payslip = await Payslip.findById(req.params.payslipId).lean() as any;
        if (!payslip) return res.status(404).json({ message: 'Payslip not found.' });

        if (!isAdmin(authReq.user!.role)) {
            const userEmp = await Employee.findOne({ userId: authReq.user!.userId }).select('employeeId').lean() as any;
            if (!userEmp || userEmp.employeeId !== payslip.employeeId) {
                return res.status(403).json({ message: 'Forbidden.' });
            }
        }

        const pdfBuffer = await generatePayslipPdfBuffer(req.params.payslipId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Payslip_${payslip.payslipNo}_${payslip.periodMonth}_${payslip.periodYear}.pdf"`);
        return res.send(pdfBuffer);
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
            .populate('employeeDetails', 'firstName middleName lastName jobInfo bankDetails avatar')
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

        const {
            earnings, deductions, paymentMethod, notes,
            beneficiaryAccount, beneficiaryName, beneficiaryBank, customerReference,
            taxDeduction, loanDeduction, pfPayout
        } = req.body;

        if (earnings !== undefined) payslip.earnings = earnings;
        if (deductions !== undefined) payslip.deductions = deductions;
        if (paymentMethod !== undefined) payslip.paymentMethod = paymentMethod;
        if (notes !== undefined) payslip.notes = notes;
        if (beneficiaryAccount !== undefined) payslip.beneficiaryAccount = beneficiaryAccount;
        if (beneficiaryName !== undefined) payslip.beneficiaryName = beneficiaryName;
        if (beneficiaryBank !== undefined) payslip.beneficiaryBank = beneficiaryBank;
        if (customerReference) {
            payslip.customerReference = customerReference;
        } else if (!payslip.customerReference) {
            payslip.customerReference = generateCustomerReference(payslip.periodYear, payslip.periodMonth, 1);
        }
        if (loanDeduction !== undefined) payslip.loanDeduction = Number(loanDeduction) || 0;
        if (pfPayout !== undefined) payslip.pfPayout = Number(pfPayout) || 0;

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
                select: 'firstName middleName lastName employeeId bankDetails jobInfo'
            })
            .lean() as any[];

        if (!payslips.length) {
            return res.status(400).json({ message: 'No payslips found for this payroll run.' });
        }

        // Fetch company details for branding
        const company = await Company.findOne().lean() as any;

        const darkPurple = company?.branding?.primaryColor || '#1C0626';
        const magentaAccent = company?.branding?.secondaryColor || '#721466';
        const totalNet = payslips.reduce((s, p) => s + (p.netPay || 0), 0);

        const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });

        const safeTitle = (run.title || 'Payroll').replace(/[^a-zA-Z0-9_\-]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Bank_Advice_${safeTitle}.pdf"`);
        doc.pipe(res);

        // Top Accent Graphic Ribbon (matching ITCS polygon geometry)
        doc.save()
           .moveTo(doc.page.width - 240, 0)
           .lineTo(doc.page.width - 90, 75)
           .lineTo(doc.page.width - 90, 115)
           .lineTo(doc.page.width, 40)
           .lineTo(doc.page.width, 0)
           .closePath()
           .fill(darkPurple);

        doc.save()
           .moveTo(doc.page.width - 90, 75)
           .lineTo(doc.page.width - 90, 115)
           .lineTo(doc.page.width, 175)
           .lineTo(doc.page.width, 40)
           .closePath()
           .fill(magentaAccent);

        // Company Logo (Top-Left)
        let logoDrawn = false;
        if (company?.logoUrl && company.logoUrl.startsWith('data:image/')) {
            try {
                const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                doc.image(buffer, 36, 20, { width: 95, height: 45, fit: [95, 45] });
                logoDrawn = true;
            } catch (err) {
                console.error('Error rendering base64 company logo in bank advice:', err);
            }
        }

        if (!logoDrawn) {
            const candidatePaths = [
                company?.logoUrl ? path.join(__dirname, '../../', company.logoUrl) : null,
                company?.logoUrl ? company.logoUrl : null,
                path.join(__dirname, '../../../client/src/assets/logo.png'),
                path.join(__dirname, '../../uploads/logo.png'),
                path.join(__dirname, '../../../client/public/logo.png')
            ].filter(Boolean) as string[];

            for (const p of candidatePaths) {
                if (fs.existsSync(p)) {
                    try {
                        doc.image(p, 36, 20, { width: 95, height: 45, fit: [95, 45] });
                        logoDrawn = true;
                        break;
                    } catch (err) {
                        console.error('Error drawing bank advice logo from path:', p, err);
                    }
                }
            }
        }

        if (!logoDrawn) {
            doc.fontSize(18).font('Helvetica-Bold').fillColor(darkPurple).text((company?.name || 'IT CONSULTING & SERVICES').toUpperCase(), 36, 30);
        }

        // Company Full Name & Subtitle on Left (White background area, X=140 to 430)
        const companyFullName = company?.name ? company.name.toUpperCase() : 'IT CONSULTING AND SERVICES (PVT) LTD';
        const defaultBankTitle = (company?.payrollSettings?.defaultBankName || 'MEEZAN BANK').toUpperCase();
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text(companyFullName, 140, 28, { width: 290 });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#64748B').text(`SALARY DISBURSEMENT ADVICE / ${defaultBankTitle} TRANSFER LETTER`, 140, 48, { width: 290 });

        // Title & Subtitle inside Dark Purple Slant Ribbon (Right side, white & #E9D5FF text)
        doc.fontSize(15).font('Helvetica-Bold').fillColor('#FFFFFF').text('SALARY DISBURSEMENT ADVICE', 460, 26, { align: 'right', width: doc.page.width - 496 });
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#E9D5FF').text(`${run.title} • TOTAL: PKR ${totalNet.toLocaleString()}`, 460, 50, { align: 'right', width: doc.page.width - 496 });

        // Header Divider Line (Y = 95, matching Payslip PDF)
        doc.moveTo(36, 95).lineTo(doc.page.width - 36, 95).strokeColor('#E2E8F0').lineWidth(1).stroke();

        let y = 110;

        // Table Header
        const drawTableHeader = (startY: number) => {
            doc.rect(36, startY, doc.page.width - 72, 25).fill(darkPurple);
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
                ? formatEmployeeFullName(p.employeeDetails, p.employeeId || 'Employee')
                : (p.employeeId || 'Employee');
            const defaultBank = company?.payrollSettings?.defaultBankName || 'Meezan Bank';
            const bankName = p.employeeDetails?.bankDetails?.bankName || p.beneficiaryBank || defaultBank;
            const acctNo = p.employeeDetails?.bankDetails?.accountNumber || p.beneficiaryAccount || 'Pending Account Info';

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

        doc.rect(36, y, doc.page.width - 72, 32).fill(darkPurple);
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

router.get('/:runId/preview-amounts', authenticate, async (req: Request, res: Response, next: NextFunction) => {
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

        const existingPayslips = await Payslip.find({ payrollRunId: runId }).lean();

        if (existingPayslips.length > 0) {
            const totals = computePayrollAmountTotals(existingPayslips);
            const linkedClaims = await ExpenseClaim.find({
                payrollRunId: run._id,
                status: 'Approved',
            }).select('claimNo employeeId approvedTotal amountAllowed amountRequested erpReferenceId category').lean();

            const expenseClaimsIncluded = linkedClaims.map((c: any) => ({
                _id: String(c._id),
                claimNo: c.claimNo,
                employeeId: c.employeeId,
                amount: Number(c.approvedTotal ?? c.amountAllowed ?? c.amountRequested ?? 0),
                erpReferenceId: c.erpReferenceId,
                category: c.category,
            }));

            return res.json({
                source: 'payslips',
                ...totals,
                claimCount: expenseClaimsIncluded.length,
                expenseClaimsIncluded,
                hasErpReferenceId: Boolean(run.erpReferenceId?.trim()),
            });
        }

        const preview = await buildPayrollPayslips(run, { persist: false });
        return res.json({
            source: 'preview',
            ...preview.totals,
            claimCount: preview.expenseClaimsIncluded.length,
            expenseClaimsIncluded: preview.expenseClaimsIncluded,
            employeeCount: preview.payslips.length,
            missingSalary: preview.missingSalary.length ? preview.missingSalary : undefined,
            hasErpReferenceId: Boolean(run.erpReferenceId?.trim()),
        });
    } catch (err: any) {
        if (err?.status === 400) {
            return res.status(400).json({ message: err.message });
        }
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
            .populate('employeeDetails', 'firstName middleName lastName jobInfo bankDetails avatar')
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

        if (!run.erpTaskId) {
            run.erpTaskId = `BATCH-${run.periodYear}${String(run.periodMonth).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
            run.erpStatus = run.erpStatus || 'Pending';
            await run.save();
        }

        const result = await buildPayrollPayslips(run, { persist: true });

        return res.json({
            message: `Generated ${result.payslips.length} payslips for ${run.title}.`,
            count: result.payslips.length,
            missingSalary: result.missingSalary.length ? result.missingSalary : undefined,
            totalPayableAmount: result.totals.totalPayableAmount,
            totalExpenseClaimsAmount: result.totals.totalExpenseClaimsAmount,
            totalLoanDeductionsAmount: result.totals.totalLoanDeductionsAmount,
            erpPayableAmount: result.totals.erpPayableAmount,
        });
    } catch (err: any) {
        if (err?.status === 400) {
            return res.status(400).json({ message: err.message });
        }
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

        const payslipCount = await Payslip.countDocuments({ payrollRunId: run._id });
        if (payslipCount === 0) {
            return res.status(400).json({ message: 'Generate payslips before approving this payroll run.' });
        }

        const { erpReferenceId } = req.body || {};
        if (!erpReferenceId || !String(erpReferenceId).trim()) {
            return res.status(400).json({
                message: 'Payroll ERP Reference ID is required to approve. Enter the ERP ID for the payroll amount excluding expense claims.',
            });
        }

        const payslipsForTotals = await Payslip.find({ payrollRunId: run._id }).lean();
        const totals = computePayrollAmountTotals(payslipsForTotals);
        run.erpReferenceId = String(erpReferenceId).trim();
        run.erpStatus = 'Posted';
        run.erpPostedAt = new Date();
        run.totalPayableAmount = totals.totalPayableAmount;
        run.totalExpenseClaimsAmount = totals.totalExpenseClaimsAmount;
        run.totalLoanDeductionsAmount = totals.totalLoanDeductionsAmount;
        run.erpPayableAmount = totals.erpPayableAmount;

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
                const companyDoc = await Company.findOne().lean() as any;
                const pfRate = (companyDoc?.payrollSettings?.pfContributionRate ?? 15) / 100;
                const pfContribution = Math.round(baseAmount * pfRate);

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

            // Update Employee loans remainingAmount and status
            const loanDed = (payslip.deductions || []).find((d: any) => d.component === 'Loan Deduction');
            if (loanDed && loanDed.amount > 0 && employee.loans && employee.loans.length > 0) {
                let remDeduction = loanDed.amount;
                for (const loan of employee.loans) {
                    if (loan.status === 'Active' && loan.remainingAmount > 0 && remDeduction > 0) {
                        const deductThis = Math.min(loan.remainingAmount, remDeduction);
                        loan.remainingAmount -= deductThis;
                        remDeduction -= deductThis;
                        if (loan.remainingAmount <= 0) {
                            loan.remainingAmount = 0;
                            loan.status = 'Paid';
                        }
                    }
                }
                await employee.save();
            }
        }

        run.status = 'Approved';
        run.approvedBy = authReq.user!.userId;
        (run as any).approvedAt = new Date();

        // Auto-generate internal ERP Batch / Task ID if not set
        if (!run.erpTaskId) {
            run.erpTaskId = `ERP-BATCH-${run.periodYear}${String(run.periodMonth).padStart(2, '0')}-${String(run._id).slice(-4).toUpperCase()}`;
        }

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

        const { erpReferenceId } = req.body || {};

        if (run.status === 'Disbursed') {
            if (!erpReferenceId || !erpReferenceId.trim()) {
                return res.status(400).json({ message: 'ERP Transaction Reference ID is required.' });
            }
            run.erpReferenceId = erpReferenceId.trim();
            await run.save();
            return res.json(run);
        }

        if (run.status !== 'Approved') {
            return res.status(400).json({
                message: `Run must be "Approved" before disbursing. Current status: "${run.status}".`,
            });
        }

        if (!erpReferenceId || !erpReferenceId.trim()) {
            return res.status(400).json({ message: 'ERP Transaction Reference ID is required before disbursing payroll.' });
        }

        run.status = 'Disbursed';
        run.disbursedAt = new Date();
        run.erpReferenceId = erpReferenceId.trim();
        await run.save();

        await ExpenseClaim.updateMany(
            { payrollRunId: run._id },
            { $set: { payoutStatus: 'Paid', paidAt: new Date() } }
        );

        // Process PF withdrawal debits from employee balances upon disbursement
        const payslipsForPF = await Payslip.find({ payrollRunId: run._id });
        for (const slip of payslipsForPF) {
            if (slip.pfPayout && slip.pfPayout > 0) {
                const emp = await Employee.findOne({ employeeId: slip.employeeId });
                if (emp) {
                    const currentBal = emp.providentFundBalance || 0;
                    const payoutAmt = Math.min(currentBal, slip.pfPayout);
                    emp.providentFundBalance = Math.max(0, currentBal - payoutAmt);
                    if (!emp.providentFundHistory) emp.providentFundHistory = [];
                    emp.providentFundHistory.push({
                        amount: payoutAmt,
                        type: 'debit',
                        source: 'payroll',
                        date: new Date(),
                        description: `PF Withdrawal (Disbursed in Payroll - ${MONTH_NAMES[run.periodMonth]} ${run.periodYear})`,
                        periodMonth: run.periodMonth,
                        periodYear: run.periodYear,
                        payrollRunId: run._id.toString(),
                        erpReferenceId: erpReferenceId.trim()
                    } as any);
                    await emp.save();
                }
            }
        }

        await EmployeeRequest.updateMany(
            { payrollRunId: run._id, category: { $in: ['Provident Fund', 'Provident Fund Withdrawal', 'PF Withdrawal'] } },
            { status: 'Completed', payoutStatus: 'Paid', paidAt: new Date(), erpReferenceId: erpReferenceId.trim() }
        );

        // Dispatch background PDF payslip emails to employees
        (async () => {
            try {
                const payslips = await Payslip.find({ payrollRunId: run._id }).lean() as any[];
                for (const slip of payslips) {
                    const emp = await Employee.findOne({ employeeId: slip.employeeId })
                        .select('firstName lastName workEmail contactInfo userId')
                        .populate('userId', 'email')
                        .lean() as any;

                    const recipientEmail = emp?.workEmail || emp?.contactInfo?.email || emp?.userId?.email;
                    if (!recipientEmail) {
                        console.warn(`[Payroll Email] No email address found for employee ${slip.employeeId}`);
                        continue;
                    }

                    const empName = formatEmployeeFullName(emp, slip.employeeId);
                    const pdfBuf = await generatePayslipPdfBuffer(slip._id.toString());
                    const monthYear = `${MONTH_NAMES[run.periodMonth]} ${run.periodYear}`;
                    const netPayFormatted = new Intl.NumberFormat('en-PK', { style: 'currency', currency: run.currency || 'PKR', maximumFractionDigits: 0 }).format(slip.netPay || 0);
                    const filename = `Payslip_${slip.payslipNo}_${run.periodMonth}_${run.periodYear}.pdf`;

                    await sendPayslipDisbursedEmail(
                        recipientEmail,
                        empName,
                        monthYear,
                        netPayFormatted,
                        pdfBuf,
                        filename
                    );
                }
            } catch (emailErr) {
                console.error('[Payroll Email] Error processing payslip emails:', emailErr);
            }
        })();

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

        // If the run was Approved, rollback any credited Provident Fund contributions and restored loans
        if (run.status === 'Approved') {
            const payslips = await Payslip.find({ payrollRunId: run._id }).lean() as any[];
            for (const slip of payslips) {
                const emp = await Employee.findOne({ employeeId: slip.employeeId });
                if (!emp) continue;

                // Rollback PF contribution credited during approve
                if (emp.providentFundHistory && emp.providentFundHistory.length > 0) {
                    const runPfEntries = emp.providentFundHistory.filter(
                        (pf: any) => pf.payrollRunId === run._id.toString() || (pf.source === 'payroll' && pf.periodMonth === run.periodMonth && pf.periodYear === run.periodYear)
                    );
                    const totalCredited = runPfEntries.reduce((sum: number, pf: any) => sum + (pf.type === 'credit' ? Number(pf.amount) || 0 : -(Number(pf.amount) || 0)), 0);
                    if (totalCredited > 0) {
                        emp.providentFundBalance = Math.max(0, (Number(emp.providentFundBalance) || 0) - totalCredited);
                        emp.providentFundHistory = emp.providentFundHistory.filter(
                            (pf: any) => !(pf.payrollRunId === run._id.toString() || (pf.source === 'payroll' && pf.periodMonth === run.periodMonth && pf.periodYear === run.periodYear))
                        );
                    }
                }

                // Rollback Loan deduction if any was deducted
                const loanDed = (slip.deductions || []).find((d: any) => d.component === 'Loan Deduction');
                if (loanDed && loanDed.amount > 0 && emp.loans && emp.loans.length > 0) {
                    const lastLoan = emp.loans.slice().reverse().find((l: any) => l.status === 'Paid' || l.status === 'Active');
                    if (lastLoan) {
                        lastLoan.remainingAmount = (lastLoan.remainingAmount || 0) + loanDed.amount;
                        lastLoan.status = 'Active';
                    }
                }

                await emp.save();
            }
        }

        await Payslip.deleteMany({ payrollRunId: run._id });
        await ExpenseClaim.updateMany(
            { payrollRunId: run._id },
            { payoutStatus: 'Unpaid', $unset: { payrollRunId: 1 } }
        );
        await EmployeeRequest.updateMany(
            { payrollRunId: run._id },
            { payoutStatus: 'Unpaid', $unset: { payrollRunId: 1 } }
        );
        await run.deleteOne();

        return res.json({ message: `Payroll run "${run.title}" deleted successfully.` });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/payroll/:runId/export-bank-excel
 * @desc    Export Bank Disbursement Advice as real 4-column .xlsx Excel workbook
 *          Columns: ACCOUNTNUMBER, BENEFICAIRY NAME, CUSTOMERREFERENCENUMBER,  TRANSAMOUNT 
 * @access  admin, super-admin, finance
 */
router.get('/:runId/export-bank-excel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const { runId } = req.params;
        const run = await PayrollRun.findById(runId).lean() as any;
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        const payslips = await Payslip.find({ payrollRunId: runId })
            .populate('employeeDetails', 'firstName middleName lastName bankDetails')
            .lean() as any[];

        if (!payslips.length) {
            return res.status(400).json({ message: 'No payslips found for this run.' });
        }

        const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const shortMonth = MONTH_SHORT[run.periodMonth] || 'Mth';
        const shortYear = String(run.periodYear).slice(-2);
        const filename = `${shortMonth}${shortYear}Payroll.xlsx`;

        const defaultLastDay = new Date(run.periodYear, run.periodMonth, 0).getDate();

        // 4 exact bank columns
        const COL_ACCOUNT = 'ACCOUNTNUMBER';
        const COL_NAME = 'BENEFICAIRY NAME';
        const COL_REF = 'CUSTOMERREFERENCENUMBER';
        const COL_AMOUNT = ' TRANSAMOUNT ';

        const data = payslips.map((p, idx) => {
            const rawAcc = p.beneficiaryAccount || p.employeeDetails?.bankDetails?.accountNumber || p.employeeDetails?.bankDetails?.iban || '';
            const accNo = String(rawAcc).trim();
            const fullName = p.beneficiaryName || formatEmployeeFullName(p.employeeDetails, p.employeeId);
            const uppercaseName = String(fullName || '').toUpperCase().trim();

            // Pure numeric reference format: DDMMYYYYseq (e.g. 30082026001)
            let refVal = String(p.customerReference || '').replace(/\D/g, '');
            if (!refVal || refVal.length < 8) {
                refVal = generateCustomerReference(run.periodYear, run.periodMonth, idx + 1, defaultLastDay);
            }
            const refNum = Number(refVal) || Number(`${defaultLastDay}${String(run.periodMonth).padStart(2, '0')}${run.periodYear}${String(idx + 1).padStart(3, '0')}`);
            const amount = Number(p.netPay) || 0;

            return {
                [COL_ACCOUNT]: accNo,
                [COL_NAME]: uppercaseName,
                [COL_REF]: refNum,
                [COL_AMOUNT]: amount,
            };
        });

        const ws = XLSX.utils.json_to_sheet(data, {
            header: [COL_ACCOUNT, COL_NAME, COL_REF, COL_AMOUNT],
        });

        // Set explicit cell types and number formats
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:D1');
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            // Col A: ACCOUNTNUMBER (Text)
            const cellA = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
            if (cellA) {
                cellA.t = 's';
                cellA.v = String(cellA.v ?? '');
                cellA.z = '@';
            }

            // Col B: BENEFICAIRY NAME (ALL CAPS Text)
            const cellB = ws[XLSX.utils.encode_cell({ r: R, c: 1 })];
            if (cellB) {
                cellB.t = 's';
                cellB.v = String(cellB.v ?? '').toUpperCase();
            }

            // Col C: CUSTOMERREFERENCENUMBER (Number)
            const cellC = ws[XLSX.utils.encode_cell({ r: R, c: 2 })];
            if (cellC) {
                cellC.t = 'n';
                cellC.v = Number(cellC.v) || 0;
                cellC.z = '0';
            }

            // Col D:  TRANSAMOUNT  (Accounting / 2 decimal places)
            const cellD = ws[XLSX.utils.encode_cell({ r: R, c: 3 })];
            if (cellD) {
                cellD.t = 'n';
                cellD.v = Number(cellD.v) || 0;
                cellD.z = '#,##0.00';
            }
        }

        // Set column widths
        ws['!cols'] = [
            { wch: 26 }, // ACCOUNTNUMBER
            { wch: 34 }, // BENEFICAIRY NAME
            { wch: 28 }, // CUSTOMERREFERENCENUMBER
            { wch: 20 }, //  TRANSAMOUNT 
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'sheet1');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
    } catch (err) {
        next(err);
    }
});

/**
 * @route   PUT /api/payroll/:runId/erp-task
 * @desc    Finance workflow to track ERP Task ID, enter ERP reference/voucher ID, and set status
 * @access  admin, super-admin, finance
 */
router.put('/:runId/erp-task', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!isAdmin(authReq.user!.role)) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }

        const run = await PayrollRun.findById(req.params.runId);
        if (!run) return res.status(404).json({ message: 'Payroll run not found.' });

        const { erpReferenceId, erpStatus, erpNotes } = req.body;

        if (erpReferenceId !== undefined) run.erpReferenceId = String(erpReferenceId).trim();
        if (erpStatus !== undefined) {
            run.erpStatus = erpStatus;
            if (erpStatus === 'Posted') run.erpPostedAt = new Date();
        }
        if (erpNotes !== undefined) run.erpNotes = erpNotes;

        await run.save();
        return res.json(run);
    } catch (err) {
        next(err);
    }
});

export default router;

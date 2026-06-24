import express, { Request, Response, NextFunction } from 'express';
import OfficialDocument from '../models/OfficialDocument';
import Employee from '../models/Employee';
import { authenticate, AuthRequest } from '../middleware/auth';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import crypto from 'crypto';

const router = express.Router();

// Generate a document (e.g. Experience Letter, Salary Slip)
router.post('/generate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { documentType } = req.body;
        const userId = authReq.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const employee = await Employee.findOne({ userId }).lean() as any;
        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        // Generate a unique ID for the document
        const documentId = crypto.randomBytes(16).toString('hex');
        const issueDate = new Date();

        // Save to database
        const newDoc = new OfficialDocument({
            documentId,
            employeeId: employee.employeeId,
            documentType,
            issueDate,
            status: 'Valid',
            generatedBy: userId,
            details: {
                firstName: employee.firstName,
                lastName: employee.lastName,
                designation: employee.jobInfo?.designation,
                department: employee.jobInfo?.department,
                joiningDate: employee.jobInfo?.joiningDate
            }
        });

        await newDoc.save();

        // The verification URL
        // Hardcoded for now, but in production should come from env or req.get('host')
        const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/${documentId}`;

        // Generate QR code as a data URI
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        // Generate PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers to force download / open in browser
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${documentType.replace(/\s+/g, '_')}_${employee.employeeId}.pdf"`);

        doc.pipe(res);

        // --- PDF Design ---
        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('COMPANY NAME', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).font('Helvetica').text('123 Business Road, Tech City, 10001', { align: 'center' });
        doc.moveDown(2);

        // Title
        doc.fontSize(18).font('Helvetica-Bold').text(documentType.toUpperCase(), { align: 'center', underline: true });
        doc.moveDown(2);

        // Body
        doc.fontSize(12).font('Helvetica');
        doc.text(`Date: ${issueDate.toLocaleDateString()}`);
        doc.text(`Ref ID: ${documentId}`);
        doc.moveDown(2);

        doc.text('To Whom It May Concern,');
        doc.moveDown();

        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const joiningDateStr = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate).toLocaleDateString() : 'N/A';

        if (documentType === 'Experience Letter') {
            doc.text(`This is to certify that ${employeeName} (Employee ID: ${employee.employeeId}) has been employed with our organization since ${joiningDateStr}.`);
            doc.moveDown();
            doc.text(`During their tenure, their current/last designation is ${employee.jobInfo?.designation} in the ${employee.jobInfo?.department} department.`);
        } else if (documentType === 'Financial Experience Letter') {
            doc.text(`This is to certify that ${employeeName} (Employee ID: ${employee.employeeId}) has been employed with our organization since ${joiningDateStr}.`);
            doc.moveDown();
            doc.text(`During their tenure, their current/last designation is ${employee.jobInfo?.designation} in the ${employee.jobInfo?.department} department.`);
            doc.moveDown();
            // Assuming basic salary is stored in salaryComponents
            const basicSalaryObj = employee.salaryComponents?.find((c: any) => c.component === 'Basic Salary');
            const basicSalary = basicSalaryObj ? basicSalaryObj.amount : 'N/A';
            doc.text(`Their current Basic Salary is: ${basicSalary}.`);
        } else {
            doc.text(`This document is generated to confirm the employment status of ${employeeName}.`);
        }

        doc.moveDown();
        doc.text('This letter is issued upon the request of the employee and does not constitute any financial liability on behalf of the company.');
        doc.moveDown(4);

        // Footer / Signature
        doc.text('Authorized Signatory', { align: 'left' });
        doc.text('Human Resources Department', { align: 'left' });

        // Add QR Code at bottom right
        // qrcode.toDataURL generates a base64 png, PDFKit can embed base64 strings if we strip the prefix
        const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        doc.image(imageBuffer, doc.page.width - 150, doc.page.height - 150, { width: 100 });
        doc.fontSize(8).text('Scan to verify authenticity', doc.page.width - 160, doc.page.height - 45, { width: 120, align: 'center' });

        doc.end();

    } catch (err: any) {
        if (!res.headersSent) {
            next(err);
        } else {
            console.error('Error during PDF generation:', err);
        }
    }
});

// Get all generated documents
router.get('/all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const documents = await OfficialDocument.find().sort({ issueDate: -1 }).lean();
        res.json(documents);
    } catch (err: any) {
        next(err);
    }
});

// Revoke a document
router.patch('/:documentId/revoke', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;
        const doc = await OfficialDocument.findOne({ documentId });
        
        if (!doc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        doc.status = 'Revoked';
        await doc.save();

        res.json({ message: 'Document revoked successfully', document: doc });
    } catch (err: any) {
        next(err);
    }
});

// Public Endpoint to verify a document
router.get('/public/verify/:documentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;
        const doc = await OfficialDocument.findOne({ documentId }).lean();
        
        if (!doc) {
            return res.status(404).json({ message: 'Document not found or invalid' });
        }

        res.json({
            isValid: doc.status === 'Valid',
            documentType: doc.documentType,
            issueDate: doc.issueDate,
            employeeName: `${doc.details.firstName} ${doc.details.lastName}`,
            designation: doc.details.designation,
            department: doc.details.department,
            status: doc.status
        });
    } catch (err: any) {
        next(err);
    }
});

export default router;

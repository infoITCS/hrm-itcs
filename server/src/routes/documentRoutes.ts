import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import OfficialDocument from '../models/OfficialDocument';
import Employee from '../models/Employee';
import Payslip from '../models/Payslip';
import Company from '../models/Company';
import DocumentTemplate from '../models/DocumentTemplate';
import LeaveType from '../models/LeaveType';
import LeaveBalance from '../models/LeaveBalance';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Helper to determine pronouns
const getPronouns = (gender?: string) => {
    const g = (gender || '').toLowerCase();
    if (g === 'female') {
        return { 
            subject: 'she', 
            object: 'her', 
            possessive: 'her', 
            capitalizedSubject: 'She',
            capitalizedPossessive: 'Her' 
        };
    }
    return { 
        subject: 'he', 
        object: 'him', 
        possessive: 'his', 
        capitalizedSubject: 'He',
        capitalizedPossessive: 'His' 
    };
};



function parseTemplate(content: string, vars: Record<string, string>): string {
    let output = content;
    for (const [key, val] of Object.entries(vars)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        output = output.replace(regex, val || '');
    }
    return output;
}

// Helper to draw letterhead (branded design)
const drawLetterhead = (doc: any, verifyUrl: string, qrCodeDataUri: string, company?: any) => {
    const savedY = doc.y;
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const primaryColor = company?.branding?.primaryColor || '#4A148C';
    const secondaryColor = company?.branding?.secondaryColor || '#1A0933';

    // 1. Logo (Top-Left)
    let logoPath = path.join(__dirname, '../../uploads/logo.png');
    if (company?.logoUrl) {
        logoPath = path.join(__dirname, '../../', company.logoUrl);
    }
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 35, { width: 90 });
    } else {
        const companyName = company?.name || 'itcs';
        doc.fontSize(22).font('Helvetica-Bold').fillColor(primaryColor).text(companyName.toLowerCase(), 50, 45);
        if (!company) {
            doc.fontSize(8).font('Helvetica').fillColor('#64748B').text('IT CONSULTING AND SERVICES', 50, 70);
        }
    }

    // 2. Top-Right Geometric Purple Decoration
    doc.save()
       .moveTo(doc.page.width - 150, 0)
       .lineTo(doc.page.width, 150)
       .lineTo(doc.page.width, 0)
       .closePath()
       .fill(primaryColor);

    doc.save()
       .moveTo(doc.page.width - 70, 0)
       .lineTo(doc.page.width, 70)
       .lineTo(doc.page.width, 0)
       .closePath()
       .fill(secondaryColor);

    // 3. Header Divider Line
    doc.moveTo(50, 100)
       .lineTo(doc.page.width - 50, 100)
       .strokeColor('#CBD5E1')
       .lineWidth(1.5)
       .stroke();

    // 4. Footer Dashed Line
    doc.moveTo(50, doc.page.height - 110)
       .lineTo(doc.page.width - 50, doc.page.height - 110)
       .dash(4, { space: 3 })
       .strokeColor('#94A3B8')
       .stroke();

    // 5. QR Code centered above footer banner
    const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    doc.image(imageBuffer, (doc.page.width / 2) - 25, doc.page.height - 100, { width: 50 });
    
    doc.fillColor('#64748B')
       .fontSize(7)
       .font('Helvetica')
       .text('Scan to verify authenticity', 50, doc.page.height - 45, { align: 'center', width: doc.page.width - 100 });

    // 6. Bottom Purple Banner
    doc.rect(0, doc.page.height - 35, doc.page.width, 35).fill(secondaryColor);
    
    // Banner white text
    doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
    if (company?.contact) {
        const line1 = company.contact.addressLine1 || '';
        const line2 = company.contact.addressLine2 ? ` | ${company.contact.addressLine2}` : '';
        const line3 = `Info: ${company.contact.email} | Call: ${company.contact.phone}` + (company.contact.website ? ` | Web: ${company.contact.website}` : '');
        doc.text(`${line1}${line2}`, 10, doc.page.height - 25, { align: 'center', width: doc.page.width - 20 });
        doc.text(line3, 10, doc.page.height - 15, { align: 'center', width: doc.page.width - 20 });
    } else {
        doc.text('Karachi: 6/K Block 2, P.E.C.H.S, Karachi Pakistan | Lahore: Office 32, 1st Floor, I.T Tower, Hali Rd, Gulberg III', 10, doc.page.height - 25, { align: 'center', width: doc.page.width - 20 });
        doc.text('Islamabad: Office # 14, Ground Floor, Malik Plaza F-8 Markaz | Info: info@itcs.com.pk | Call: +92 21 111-482-711', 10, doc.page.height - 15, { align: 'center', width: doc.page.width - 20 });
    }

    // Restore text defaults and saved layout position
    doc.page.margins.bottom = oldBottomMargin;
    doc.y = savedY;
    doc.fillColor('#1E293B').font('Helvetica').fontSize(10);
};

// Generate a document
router.post('/generate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { documentType, reason } = req.body;
        const userId = authReq.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const employee = await Employee.findOne({ userId }).lean() as any;
        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        // Fetch Company configs
        const company = employee.companyId ? await Company.findById(employee.companyId).lean() as any : null;

        // Query DocumentTemplate before starting PDF generation
        const template = (employee.companyId ? await DocumentTemplate.findOne({
            companyId: employee.companyId,
            documentType,
            isActive: true
        }).lean() : null) as any;

        if (!template) {
            return res.status(404).json({ message: `Document template for '${documentType}' is not configured for your company. Please configure it in Admin Settings first.` });
        }

        // Generate unique Document ID
        const documentId = crypto.randomBytes(16).toString('hex');
        const issueDate = new Date();

        // Save metadata to DB
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
            },
            companyId: employee.companyId
        });
        await newDoc.save();

        const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/${documentId}`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        // Initialize PDF Kit with page margins adjusted to prevent header/footer collision
        const doc = new PDFDocument({
            margins: {
                top: 125,
                bottom: 125,
                left: 50,
                right: 50
            }
        });

        // Set response headers to force download / open in browser
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${documentType.replace(/\s+/g, '_')}_${employee.employeeId}.pdf"`);
        doc.pipe(res);

        // Draw letterhead on the first page
        drawLetterhead(doc, verifyUrl, qrCodeDataUri, company);

        // Draw letterhead on subsequent pages
        doc.on('pageAdded', () => {
            drawLetterhead(doc, verifyUrl, qrCodeDataUri, company);
        });

        // Resolve data variables
        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const joiningDateStr = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
        const lastWorkingDayStr = employee.employmentStatus?.offboardingDate ? new Date(employee.employmentStatus.offboardingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const basicSalaryObj = employee.salaryComponents?.find((c: any) => c.component === 'Basic Salary');
        const basicSalaryAmount = basicSalaryObj ? basicSalaryObj.amount : undefined;
        const totalGrossSalary = employee.salaryComponents?.length 
            ? employee.salaryComponents.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) 
            : undefined;

        const probSal = employee.financeInfo?.probationSalary 
            ? String(employee.financeInfo.probationSalary) 
            : (req.body.customVars?.probationSalary || (basicSalaryAmount !== undefined ? String(basicSalaryAmount) : ''));

        const confSal = employee.financeInfo?.confirmedSalary 
            ? String(employee.financeInfo.confirmedSalary) 
            : (req.body.customVars?.confirmedSalary || (totalGrossSalary !== undefined ? String(totalGrossSalary) : ''));

        const isHrOrAdmin = ['super-admin', 'admin', 'hr', 'finance'].includes(authReq.user?.role || '');

        const pr = getPronouns(employee.gender);
        const purposeText = reason || 'employment verification purposes';

        const addressObj = employee.address || {};
        const addressStr = [
            addressObj.street,
            addressObj.city,
            addressObj.state,
            addressObj.zipCode,
            addressObj.country
        ].filter(Boolean).join(', ') || '';

        // Resolve Reporting Manager full name
        let reportingManagerName = employee.jobInfo?.reportingManager || '';
        if (reportingManagerName) {
            const mgr = await Employee.findOne({
                $or: [
                    { employeeId: reportingManagerName },
                    { userId: reportingManagerName },
                    ...(mongoose.Types.ObjectId.isValid(reportingManagerName) ? [{ _id: reportingManagerName }] : [])
                ]
            }).lean() as any;

            if (mgr) {
                reportingManagerName = `${mgr.firstName} ${mgr.lastName}`;
            }
        }

        // Resolve Leave Entitlements dynamically from Database
        const leaveBalanceDoc = await LeaveBalance.findOne({
            employeeId: employee.employeeId,
            year: new Date().getFullYear()
        }).lean() as any;

        const activeLeaveTypes = await LeaveType.find({ isActive: true }).lean() as any[];

        let earnedLeaveDaysVal = '20';
        let sickLeaveDaysVal = '10';
        let casualLeaveDaysVal = '10';
        let casualSickLeaveDaysVal = '10';

        const annualType = activeLeaveTypes.find((t: any) => t.code === 'annual' || t.name?.toLowerCase().includes('annual') || t.name?.toLowerCase().includes('earned'));
        const sickType = activeLeaveTypes.find((t: any) => t.code === 'sick' || t.name?.toLowerCase().includes('sick'));
        const casualType = activeLeaveTypes.find((t: any) => t.code === 'casual' || t.name?.toLowerCase().includes('casual'));

        if (annualType) {
            const bal = leaveBalanceDoc?.balances?.find((b: any) => b.leaveTypeCode === annualType.code);
            earnedLeaveDaysVal = String(bal?.total ?? annualType.defaultDays ?? 20);
        }

        if (sickType) {
            const sickBal = leaveBalanceDoc?.balances?.find((b: any) => b.leaveTypeCode === sickType.code);
            sickLeaveDaysVal = String(sickBal?.total ?? sickType.defaultDays ?? 10);
        }

        if (casualType) {
            const casualBal = leaveBalanceDoc?.balances?.find((b: any) => b.leaveTypeCode === casualType.code);
            casualLeaveDaysVal = String(casualBal?.total ?? casualType.defaultDays ?? 10);
        }

        casualSickLeaveDaysVal = sickLeaveDaysVal || casualLeaveDaysVal || '10';

        const vars: Record<string, string> = {
            employeeId: employee.employeeId || '',
            employeeName,
            firstName: employee.firstName || '',
            lastName: employee.lastName || '',
            designation: employee.jobInfo?.designation || '',
            department: employee.jobInfo?.department || '',
            reportingManager: reportingManagerName,
            joiningDate: joiningDateStr !== 'N/A' ? joiningDateStr : '',
            basicSalary: basicSalaryAmount !== undefined ? String(basicSalaryAmount) : '',
            grossSalary: totalGrossSalary !== undefined ? String(totalGrossSalary) : '',
            purpose: purposeText,
            date: issueDate.toLocaleDateString(),
            pronounSubject: pr.subject,
            pronounObject: pr.object,
            pronounPossessive: pr.possessive,
            lastWorkingDay: lastWorkingDayStr,
            cnic: employee.cnic || '',
            fatherName: employee.fatherName || '',
            gender: employee.gender || '',
            maritalStatus: employee.maritalStatus || '',
            nationality: employee.nationality || '',
            personalEmail: employee.email || '',
            workEmail: employee.workEmail || '',
            phone: employee.phone || '',
            address: addressStr,
            bankName: employee.bankDetails?.bankName || '',
            bankAccountNumber: employee.bankDetails?.accountNumber || '',
            salutation: (employee.gender || '').toLowerCase() === 'female' ? 'Ms.' : 'Mr.',
            workLocation: employee.jobInfo?.workLocation || '',
            officeLocation: employee.jobInfo?.workLocation || '',
            city: employee.address?.city || employee.jobInfo?.workLocation || '',
            personalCity: employee.address?.city || '',
            internshipDuration: '3 Months',
            duration: '3 Months',
            employmentType: 'Internship',
            workingDays: 'Monday to Friday',
            workingHours: '09:00 AM - 06:00 PM',
            probationDays: employee.financeInfo?.probationDays ? String(employee.financeInfo.probationDays) : '90',
            probationMonths: employee.financeInfo?.probationMonths ? String(employee.financeInfo.probationMonths) : '3',
            probationSalary: probSal,
            companyResources: 'Official Laptop, Email Account, and ID Card',
            confirmedSalary: confSal,
            commissionStructure: 'Performance-based quarterly bonuses as per company policy',
            benefitsList: 'Meal Allowance, Employee Loan Facility, Provident Fund, Performance Bonuses, Medical OPD Claim',
            taxCondition: 'Subject to applicable income tax laws and company policy',
            noticePeriod: '30 Days',
            probationNoticePeriod: '15 Days',
            confirmedNoticePeriod: '30 Days',
            earnedLeaveDays: req.body.customVars?.earnedLeaveDays || earnedLeaveDaysVal,
            casualSickLeaveDays: req.body.customVars?.casualSickLeaveDays || casualSickLeaveDaysVal,
            sickLeaveDays: req.body.customVars?.sickLeaveDays || sickLeaveDaysVal,
            casualLeaveDays: req.body.customVars?.casualLeaveDays || casualLeaveDaysVal,
            acceptanceValidityDays: '7',
            probationDaysWords: 'Ninety',
            signatoryName: 'Authorized Signatory',
            signatoryDesignation: 'Manager Human Resources',
            hrEmail: company?.contact?.email || 'info@itcs.com.pk',
            hrPhone: company?.contact?.phone || '+92 21 111-482-711',
            ...(req.body.customVars || {}),
            ...(req.body.variables || {})
        };

        // Scan template.content to find ALL tags used in this template
        const templateContent = template.content || '';
        const tagMatches = templateContent.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
        const usedTags = Array.from(new Set(Array.from(tagMatches).map((m: any) => m[1])));

        // Filter out any tag used in template that is missing or empty in vars
        const missingTags = usedTags.filter(tag => {
            const val = vars[tag];
            return val === undefined || val === null || val === '';
        });

        if (missingTags.length > 0) {
            const TAG_LABELS: Record<string, string> = {
                employeeId: 'Employee ID',
                employeeName: 'Employee Name',
                firstName: 'First Name',
                lastName: 'Last Name',
                designation: 'Designation / Job Title',
                department: 'Department',
                reportingManager: 'Reporting Manager',
                joiningDate: 'Date of Joining',
                basicSalary: 'Basic Salary',
                grossSalary: 'Gross Salary',
                probationSalary: 'Probation Salary',
                confirmedSalary: 'Confirmed Salary (Post-Probation)',
                probationDays: 'Probation Days',
                probationMonths: 'Probation Months',
                cnic: 'CNIC / National ID',
                fatherName: "Father's Name",
                gender: 'Gender',
                maritalStatus: 'Marital Status',
                nationality: 'Nationality',
                personalEmail: 'Personal Email',
                workEmail: 'Work Email',
                phone: 'Phone Number',
                address: 'Physical Address',
                bankName: 'Bank Name',
                bankAccountNumber: 'Bank Account Number',
                bankIban: 'Bank IBAN',
                salutation: 'Salutation (Mr./Ms.)',
                workLocation: 'Appointed Work / Office Location',
                officeLocation: 'Appointed Work / Office Location',
                city: 'City (Personal / Residence)',
                personalCity: 'City (Personal / Residence)',
                internshipDuration: 'Internship Duration',
                duration: 'Duration',
                noticePeriod: 'Notice Period',
                probationNoticePeriod: 'Probation Notice Period',
                confirmedNoticePeriod: 'Confirmed Notice Period',
                earnedLeaveDays: 'Earned Leave Days',
                casualSickLeaveDays: 'Casual/Sick Leave Days',
                acceptanceValidityDays: 'Acceptance Validity Days',
                probationDaysWords: 'Probation Days in Words'
            };

            const missingLabels = missingTags.map(t => TAG_LABELS[t] || t);

            if (isHrOrAdmin) {
                return res.status(400).json({
                    code: 'MISSING_TEMPLATE_DETAILS',
                    userRole: 'admin',
                    message: `The following required employee details are missing to generate '${template.subject || documentType}': ${missingLabels.join(', ')}. Please update the employee profile to proceed.`,
                    missingFields: missingTags,
                    missingLabels
                });
            } else {
                return res.status(400).json({
                    code: 'MISSING_TEMPLATE_DETAILS',
                    userRole: 'employee',
                    message: `Your profile is missing details required for this document (${missingLabels.join(', ')}). Please contact HR to update your profile before generating this document.`,
                    missingFields: missingTags,
                    missingLabels
                });
            }
        }

        doc.y = 120; // Start printing content below the header divider

        // Draw custom template title
        doc.fontSize(16).font('Helvetica-Bold').fillColor(company?.branding?.primaryColor || '#1E293B').text(template.subject || documentType, { align: 'center' });
        doc.moveDown(1.5);
        
        // Format body content
        const parsedBody = parseTemplate(template.content, vars);
        
        // Write to PDF using PDFKit
        doc.fontSize(10).font('Helvetica').fillColor('#1E293B').text(parsedBody, {
            align: 'justify',
            lineGap: 2.5
        });

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

/**
 * @route   POST /api/documents/preview-pdf
 * @desc    Generate a transient PDF preview from unsaved template or branding state
 */
router.post('/preview-pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyData, templateData } = req.body;
        
        // Use dummy variables for parsing
        const dummyVars = {
            employeeId: 'EMP-9872',
            employeeName: 'John Doe',
            firstName: 'John',
            lastName: 'Doe',
            designation: 'Senior Software Engineer',
            department: 'Technology Department',
            reportingManager: 'Jane Smith',
            joiningDate: 'January 15, 2024',
            basicSalary: '150,000',
            grossSalary: '200,050',
            purpose: 'visa processing application',
            date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            pronounSubject: 'he',
            pronounObject: 'him',
            pronounPossessive: 'his',
            lastWorkingDay: 'July 3, 2026',
            cnic: '42101-1234567-9',
            fatherName: 'Robert Doe',
            gender: 'Male',
            maritalStatus: 'Single',
            nationality: 'Pakistani',
            personalEmail: 'john.doe@gmail.com',
            workEmail: 'john.doe@itcs.com',
            phone: '+92 300 1234567',
            address: '123 Main Street, Clifton, Karachi, Pakistan',
            bankName: 'Habib Bank Limited (HBL)',
            bankAccountNumber: '12345678901234',
            bankIban: 'PK21HABB0012345678901234',
            employmentType: 'Full-Time',
            workingDays: 'Monday to Friday',
            workingHours: '09:00 AM - 06:00 PM',
            probationDays: '90',
            probationMonths: '3',
            probationSalary: '150,000',
            companyResources: 'Official Laptop, Email Account, and ID Card',
            confirmedSalary: '200,050',
            commissionStructure: 'Performance-based quarterly bonuses as per company policy',
            benefitsList: 'Meal Allowance, Employee Loan Facility, Provident Fund, Performance Bonuses, Medical OPD Claim',
            taxCondition: 'Subject to applicable income tax laws and company policy',
            signatoryName: 'Authorized Signatory',
            signatoryDesignation: 'Manager Human Resources',
            hrEmail: companyData?.contact?.email || 'info@itcs.com.pk',
            hrPhone: companyData?.contact?.phone || '+92 21 111-482-711'
        };

        const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/preview-placeholder-id`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        const doc = new PDFDocument({
            margins: {
                top: 125,
                bottom: 125,
                left: 50,
                right: 50
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
        doc.pipe(res);

        // Draw letterhead using preview company details
        drawLetterhead(doc, verifyUrl, qrCodeDataUri, companyData);

        doc.on('pageAdded', () => {
            drawLetterhead(doc, verifyUrl, qrCodeDataUri, companyData);
        });

        doc.y = 120;

        // Render subject line
        const subject = templateData?.subject || 'SUBJECT / DOCUMENT TITLE';
        doc.fontSize(16).font('Helvetica-Bold').fillColor(companyData?.branding?.primaryColor || '#1E293B').text(subject, { align: 'center' });
        doc.moveDown(1.5);

        // Parse content
        const bodyContent = templateData?.content || 'Configure template letter content body details...';
        const parsedBody = parseTemplate(bodyContent, dummyVars);

        doc.fontSize(10).font('Helvetica').fillColor('#1E293B').text(parsedBody, {
            align: 'justify',
            lineGap: 2.5
        });

        doc.end();

    } catch (err) {
        if (!res.headersSent) {
            next(err);
        } else {
            console.error('Error during PDF preview generation:', err);
        }
    }
});

export default router;

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

// Helper for designation job details mapping
const getJobDetailsByDesignation = (designation?: string) => {
    const des = (designation || '').toLowerCase();
    if (des.includes('developer') || des.includes('engineer') || des.includes('programmer')) {
        return {
            functionalArea: 'Software Development',
            responsibilities: 'software design, coding, testing, and system architecture design',
            generalDescription: 'complex codebases, project deliverables, and quality assurance processes'
        };
    }
    if (des.includes('designer') || des.includes('ui') || des.includes('ux')) {
        return {
            functionalArea: 'UI/UX Design',
            responsibilities: 'creating wireframes, interactive user interfaces, and user journeys',
            generalDescription: 'graphic design projects, styling systems, and product layouts'
        };
    }
    if (des.includes('manager') || des.includes('lead') || des.includes('coordinator')) {
        return {
            functionalArea: 'Team Management',
            responsibilities: 'directing resource allocation, overseeing project schedules, and team coordination',
            generalDescription: 'strategic plans, operational performance, and corporate communications'
        };
    }
    return {
        functionalArea: 'Professional Operations',
        responsibilities: 'daily operations, task completions, and team support activities',
        generalDescription: 'operational requests, client interactions, and quality control procedures'
    };
};

// Helper to draw letterhead (branded design)
const drawLetterhead = (doc: any, verifyUrl: string, qrCodeDataUri: string) => {
    const savedY = doc.y;
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    // 1. Logo (Top-Left)
    const logoPath = path.join(__dirname, '../../uploads/logo.png');
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 35, { width: 90 });
    } else {
        doc.fontSize(22).font('Helvetica-Bold').fillColor('#581C87').text('itcs', 50, 45);
        doc.fontSize(8).font('Helvetica').fillColor('#64748B').text('IT CONSULTING AND SERVICES', 50, 70);
    }

    // 2. Top-Right Geometric Purple Decoration
    doc.save()
       .moveTo(doc.page.width - 150, 0)
       .lineTo(doc.page.width, 150)
       .lineTo(doc.page.width, 0)
       .closePath()
       .fill('#4A148C'); // Purple

    doc.save()
       .moveTo(doc.page.width - 70, 0)
       .lineTo(doc.page.width, 70)
       .lineTo(doc.page.width, 0)
       .closePath()
       .fill('#311B92'); // Darker purple

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
    doc.rect(0, doc.page.height - 35, doc.page.width, 35).fill('#1A0933');
    
    // Banner white text
    doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
    doc.text('Karachi: 6/K Block 2, P.E.C.H.S, Karachi Pakistan | Lahore: Office 32, 1st Floor, I.T Tower, Hali Rd, Gulberg III', 10, doc.page.height - 25, { align: 'center', width: doc.page.width - 20 });
    doc.text('Islamabad: Office # 14, Ground Floor, Malik Plaza F-8 Markaz | Info: info@itcs.com.pk | Call: +92 21 111-482-711', 10, doc.page.height - 15, { align: 'center', width: doc.page.width - 20 });

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
            }
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
        drawLetterhead(doc, verifyUrl, qrCodeDataUri);

        // Draw letterhead on subsequent pages
        doc.on('pageAdded', () => {
            drawLetterhead(doc, verifyUrl, qrCodeDataUri);
        });

        // Resolve data variables
        const payslip = await Payslip.findOne({ employeeId: employee.employeeId, status: 'Finalized' }).sort({ periodYear: -1, periodMonth: -1 }).lean() as any;
        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const joiningDateStr = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
        const lastWorkingDayStr = employee.employmentStatus?.offboardingDate ? new Date(employee.employmentStatus.offboardingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const basicSalaryObj = employee.salaryComponents?.find((c: any) => c.component === 'Basic Salary');
        const basicSalaryAmount = basicSalaryObj ? basicSalaryObj.amount : 50000;
        const totalGrossSalary = employee.salaryComponents?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 75000;

        const pr = getPronouns(employee.gender);
        const job = getJobDetailsByDesignation(employee.jobInfo?.designation);

        const purposeText = reason || 'employment verification purposes';

        doc.y = 120; // Start printing content below the header divider

        // Draw dynamic templates
        if (documentType === 'Job Offer Letter') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown(1.5);
            doc.fontSize(12).font('Helvetica-Bold').text(`Dear ${employeeName},`);
            doc.moveDown();
            doc.fontSize(10).font('Helvetica').text(
                `We are pleased to offer you the position of ${employee.jobInfo?.designation || 'Specialist'} at IT Consulting and Services (ITCS). We are confident that your skills and experience will contribute significantly to our continued success, and we look forward to welcoming you to our team.`,
                { align: 'justify', lineGap: 3 }
            );
            doc.moveDown();
            doc.font('Helvetica-Bold').text(`Position: ${employee.jobInfo?.designation || 'Specialist'}`);
            doc.text(`Employment Type: Full-Time (Monday to Friday, 9:00 AM to 6:00 PM)`);
            doc.text(`Probation Period: 90 Days`);
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('Compensation During Probation');
            doc.font('Helvetica').text(`For the period of probation, your base salary will be PKR ${(basicSalaryAmount * 0.9).toLocaleString()} per month. During this time, the company will provide the following resources to support you in performing your duties: Company Laptop, Required Accessories, Official SIM Card, Mobile Package.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('Compensation After Successful Completion of Probation');
            doc.font('Helvetica').text(`Upon successful completion of the 90-day probation period, your compensation package will be revised to be eligible for the following benefits depending on maturity:`, { align: 'justify', lineGap: 3 });
            doc.font('Helvetica-Bold').text(`Base Salary: PKR ${basicSalaryAmount.toLocaleString()} per month`);
            doc.font('Helvetica').text(`Benefits: Meal Allowance, Employee Loan Facility, Provident Fund, Performance Bonuses, Fuel Allowance, Medical OPD Claim, Anniversary Bonus, etc.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('General Terms');
            doc.font('Helvetica').text(`Your employment will be governed by the policies, procedures, and code of conduct of IT Consulting and Services (ITCS). The company reserves the right to review compensation, benefits, and performance-based incentives in accordance with business requirements and company policies.`, { align: 'justify', lineGap: 3 });
            doc.moveDown(1.5);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Internship Offer Letter') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('INTERNSHIP OFFER LETTER', { align: 'center' });
            doc.moveDown(1.5);
            
            doc.fontSize(10).font('Helvetica-Bold').text(`To: ${employeeName}`);
            doc.font('Helvetica').text(`${employee.address?.city || 'Karachi'}, Pakistan`);
            doc.text(`Email: ${employee.email || employee.workEmail}`);
            doc.moveDown();
            doc.font('Helvetica-Bold').text(`Subject: Internship Offer — ${employee.jobInfo?.department || 'Engineering'}`);
            doc.moveDown();
            
            doc.font('Helvetica').text(`Dear ${employeeName},`);
            doc.moveDown();
            doc.text(`We are pleased to offer you an Internship position with our ${employee.jobInfo?.department || 'Engineering'} team in ${employee.address?.city || 'Karachi'}.`);
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text(`Position: Internship ${employee.jobInfo?.designation || 'Associate'}`);
            doc.text(`Location: ${employee.address?.city || 'Karachi'}`);
            doc.text(`Working Days: Monday to Friday`);
            doc.text(`Working Hours: 9:00 AM to 6:00 PM`);
            doc.text(`Duration: 3 Months`);
            doc.moveDown();
            
            doc.font('Helvetica').text(`During your internship, you will work with the ${employee.jobInfo?.department || 'Engineering'} team, adhere to company policies, and maintain confidentiality. This internship does not guarantee permanent employment and may be ended by either party with reasonable notice.`, { align: 'justify', lineGap: 3 });
            doc.moveDown(1.5);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Appointment Letter') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('APPOINTMENT LETTER', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).font('Helvetica-Bold').text('Private and Confidential');
            doc.text(employeeName);
            doc.moveDown(1.5);
            
            doc.font('Helvetica').text(`Dear ${employeeName},`);
            doc.moveDown();
            doc.text(`With reference to your application for employment with ITCS (IT Consulting and Services), we are pleased to offer you the position of ${employee.jobInfo?.designation || 'Specialist'}. You will be based in ${employee.address?.city || 'Karachi'} with effect from ${joiningDateStr}, on the terms and conditions given below.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            doc.text(`Your terms of appointment will be governed by the rules and regulations applicable to the above-mentioned designation as per the Human Resources Policy Manual of the Company. The Company reserves the right to change the applicable rules and regulations at its entire discretion, without advance notice.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('Salary and Benefits:');
            doc.font('Helvetica').text(`Your monthly gross salary will be Rs. ${(totalGrossSalary * 0.9).toLocaleString()} during probation and Rs. ${totalGrossSalary.toLocaleString()} after confirmation.`, { lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('Probationary Period:');
            doc.font('Helvetica').text(`Your confirmation is subject to a satisfactory probationary period of 90 Days.`, { lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('Reporting Hierarchy:');
            doc.font('Helvetica').text(`Your reporting line will be to ${employee.jobInfo?.reportingManager || 'HR Manager'}.`, { lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('Termination of Service:');
            doc.font('Helvetica').text(`During probation, either party may terminate employment by giving 15 days notice in writing. After confirmation, either party may terminate by giving 30 days notice, or payment in lieu of notice.`, { lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('Leave Entitlement:');
            doc.font('Helvetica').text(`You will be allowed 20 working days of Earned Leave per completed year of service, and 10 working days of Casual/Sick leave per year, after confirmation.`, { lineGap: 3 });
            doc.moveDown(1.5);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Employment Contract') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('EMPLOYMENT CONTRACT', { align: 'center' });
            doc.moveDown(1.5);
            
            doc.fontSize(10).font('Helvetica').text(
                `This Employment Contract (“Contract”) is made between IT Consulting and Services (ITCS), having its registered office at 6/K, Block 2, P.E.C.H.S, Karachi (“the Company”), and ${employeeName}, holder of CNIC ${employee.cnic || 'N/A'} (“the Employee”).`,
                { align: 'justify', lineGap: 3 }
            );
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('1. Position and Duties');
            doc.font('Helvetica').text(`The Employee is engaged as ${employee.jobInfo?.designation || 'Specialist'} reporting to ${employee.jobInfo?.reportingManager || 'HR Manager'}, based in ${employee.address?.city || 'Karachi'}, effective from ${joiningDateStr}.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('2. Compensation');
            doc.font('Helvetica').text(`The Employee will receive a gross monthly salary of Rs. ${totalGrossSalary.toLocaleString()}, payable on or before the 5th of each month, subject to applicable deductions.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('3. Term and Probation');
            doc.font('Helvetica').text(`This Contract is effective from ${joiningDateStr} and shall continue subject to a probationary period of 90 days, after which confirmation will be subject to satisfactory performance.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('4. Working Hours');
            doc.font('Helvetica').text(`The Employee's standard working hours will be Monday to Friday, 9:00 AM to 6:00 PM.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('5. Confidentiality');
            doc.font('Helvetica').text(`The Employee agrees to maintain confidentiality of all proprietary Company information during and after the term of employment.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('6. Termination');
            doc.font('Helvetica').text(`Either party may terminate this Contract by providing 30 days written notice, or payment in lieu thereof, subject to the terms outlined in the Company's HR Policy Manual.`, { align: 'justify', lineGap: 3 });
            doc.moveDown();
            
            doc.font('Helvetica-Bold').text('7. Governing Law');
            doc.font('Helvetica').text(`This Contract shall be governed by the laws of Pakistan.`, { align: 'justify', lineGap: 3 });
            doc.moveDown(1.5);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Pay Slip') {
            const monthName = payslip 
                ? new Date(payslip.periodYear, payslip.periodMonth - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
                : new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

            doc.fontSize(14).font('Helvetica-Bold').text(`Pay Slip — ${monthName}`, { align: 'center' });
            doc.moveDown(1.5);

            // Details Table Block
            doc.rect(50, doc.y, doc.page.width - 100, 75).strokeColor('#E2E8F0').lineWidth(1).stroke();
            const startY = doc.y + 10;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text(`Employee Name:`, 60, startY);
            doc.font('Helvetica').text(employeeName, 170, startY);
            doc.font('Helvetica-Bold').text(`Employee ID:`, 330, startY);
            doc.font('Helvetica').text(employee.employeeId, 440, startY);

            doc.font('Helvetica-Bold').text(`Designation:`, 60, startY + 20);
            doc.font('Helvetica').text(employee.jobInfo?.designation || '-', 170, startY + 20);
            doc.font('Helvetica-Bold').text(`Department:`, 330, startY + 20);
            doc.font('Helvetica').text(employee.jobInfo?.department || '-', 440, startY + 20);

            doc.font('Helvetica-Bold').text(`Prepared By:`, 60, startY + 40);
            doc.font('Helvetica').text('HR Department', 170, startY + 40);
            doc.font('Helvetica-Bold').text(`Date:`, 330, startY + 40);
            doc.font('Helvetica').text(issueDate.toLocaleDateString(), 440, startY + 40);

            doc.y = startY + 80;

            // Earnings
            doc.moveDown();
            doc.fontSize(11).font('Helvetica-Bold').text('Earnings');
            doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor('#E2E8F0').stroke();
            doc.moveDown(0.5);

            doc.fontSize(10);
            const basicSal = payslip ? (payslip.earnings.find((e: any) => e.component === 'Basic Salary')?.amount || basicSalaryAmount) : basicSalaryAmount;
            const grossSal = payslip ? payslip.grossPay : totalGrossSalary;
            const allowancesVal = grossSal - basicSal;

            doc.font('Helvetica').text('Basic Salary:', 60, doc.y);
            doc.font('Helvetica-Bold').text(`PKR ${basicSal.toLocaleString()}`, doc.page.width - 150, doc.y, { align: 'right' });
            doc.moveDown();
            doc.font('Helvetica').text('Allowances:', 60, doc.y);
            doc.font('Helvetica-Bold').text(`PKR ${allowancesVal.toLocaleString()}`, doc.page.width - 150, doc.y, { align: 'right' });
            doc.moveDown();
            doc.font('Helvetica-Bold').text('Total Gross Earnings:', 60, doc.y);
            doc.text(`PKR ${grossSal.toLocaleString()}`, doc.page.width - 150, doc.y, { align: 'right' });

            // Deductions
            doc.moveDown(1.5);
            doc.fontSize(11).font('Helvetica-Bold').text('Deductions');
            doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor('#E2E8F0').stroke();
            doc.moveDown(0.5);

            doc.fontSize(10);
            const taxVal = payslip ? (payslip.deductions.find((d: any) => d.component.toLowerCase().includes('tax'))?.amount || 0) : 0;
            const totalDeductions = payslip ? payslip.totalDeductions : 0;
            const otherDeductions = totalDeductions - taxVal;
            const netPayVal = payslip ? payslip.netPay : grossSal - totalDeductions;

            doc.font('Helvetica').text('Tax:', 60, doc.y);
            doc.font('Helvetica-Bold').text(`PKR ${taxVal.toLocaleString()}`, doc.page.width - 150, doc.y, { align: 'right' });
            doc.moveDown();
            doc.font('Helvetica').text('Other Deductions:', 60, doc.y);
            doc.font('Helvetica-Bold').text(`PKR ${otherDeductions.toLocaleString()}`, doc.page.width - 150, doc.y, { align: 'right' });
            doc.moveDown();
            doc.font('Helvetica-Bold').text('Total Deductions:', 60, doc.y);
            doc.text(`PKR ${totalDeductions.toLocaleString()}`, doc.page.width - 150, doc.y, { align: 'right' });

            // Net Pay
            doc.moveDown(1.5);
            doc.rect(50, doc.y, doc.page.width - 100, 30).fill('#F1F5F9');
            doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold');
            doc.text('Net Pay (credited to bank account):', 60, doc.y + 10);
            doc.text(`PKR ${netPayVal.toLocaleString()}`, doc.page.width - 150, doc.y - 10, { align: 'right' });

        } else if (documentType === 'Consolidated Pay Slip (3 Months)' || documentType === 'Consolidated Pay Slip (6 Months)') {
            const limit = documentType.includes('3') ? 3 : 6;
            const payslips = await Payslip.find({ employeeId: employee.employeeId, status: 'Finalized' })
                .sort({ periodYear: -1, periodMonth: -1 })
                .limit(limit)
                .lean();

            doc.fontSize(13).font('Helvetica-Bold').text(`Consolidated Pay Slip — ${limit} Months`, { align: 'center' });
            doc.moveDown();

            doc.fontSize(10).font('Helvetica-Bold').text(`Employee Name: ${employeeName}`);
            doc.text(`Employee ID: ${employee.employeeId}`);
            doc.text(`Designation: ${employee.jobInfo?.designation || '-'}`);
            doc.text(`Department: ${employee.jobInfo?.department || '-'}`);
            doc.moveDown(1.5);

            doc.fontSize(11).font('Helvetica-Bold').text('Summary by Month');
            doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor('#E2E8F0').stroke();
            doc.moveDown(0.5);

            let totalNet = 0;

            if (payslips.length > 0) {
                for (const ps of payslips) {
                    const monthStr = new Date(ps.periodYear, ps.periodMonth - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
                    doc.fontSize(10).font('Helvetica').text(`${monthStr}:`, 60, doc.y);
                    doc.font('Helvetica-Bold').text(`Gross: PKR ${ps.grossPay.toLocaleString()} | Deductions: PKR ${ps.totalDeductions.toLocaleString()} | Net Pay: PKR ${ps.netPay.toLocaleString()}`, 150, doc.y - 12);
                    totalNet += ps.netPay;
                    doc.moveDown(0.5);
                }
            } else {
                // Generate mock entries if database is empty
                for (let i = 0; i < limit; i++) {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i - 1);
                    const monthStr = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                    doc.fontSize(10).font('Helvetica').text(`${monthStr}:`, 60, doc.y);
                    doc.font('Helvetica-Bold').text(`Gross: PKR ${totalGrossSalary.toLocaleString()} | Deductions: PKR 0 | Net Pay: PKR ${totalGrossSalary.toLocaleString()}`, 150, doc.y - 12);
                    totalNet += totalGrossSalary;
                    doc.moveDown(0.5);
                }
            }

            doc.moveDown();
            doc.rect(50, doc.y, doc.page.width - 100, 30).fill('#F1F5F9');
            doc.fillColor('#1E293B').fontSize(11).font('Helvetica-Bold');
            doc.text(`Total Net Pay (${limit} Months):`, 60, doc.y + 10);
            doc.text(`PKR ${totalNet.toLocaleString()}`, doc.page.width - 150, doc.y - 10, { align: 'right' });

        } else if (documentType === 'No Objection Certificate (NOC)') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('NO OBJECTION CERTIFICATE', { align: 'center' });
            doc.moveDown(2);
            
            doc.fontSize(10).font('Helvetica-Bold').text('To Whom It May Concern,');
            doc.moveDown();
            doc.font('Helvetica').text(`This is to certify that ${employeeName}, holder of CNIC ${employee.cnic || 'N/A'}, is currently employed with IT Consulting and Services (ITCS) as ${employee.jobInfo?.designation || 'Specialist'} since ${joiningDateStr}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`The Company has no objection to ${employeeName}'s request for ${purposeText}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`This certificate is issued upon the employee's request and does not constitute any liability on the part of IT Consulting and Services (ITCS).`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Character Certificate') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('CHARACTER CERTIFICATE', { align: 'center' });
            doc.moveDown(2);
            
            doc.fontSize(10).font('Helvetica-Bold').text('To Whom It May Concern,');
            doc.moveDown();
            doc.font('Helvetica').text(`This is to certify that ${employeeName} has been associated with IT Consulting and Services (ITCS) as ${employee.jobInfo?.designation || 'Specialist'} from ${joiningDateStr} to ${employee.employmentStatus?.status === 'Permanent' ? 'Present' : lastWorkingDayStr}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`During this period, ${pr.possessive} conduct, character, and behavior have been found to be satisfactory and in accordance with the Company's code of conduct. ${pr.capitalizedSubject} has not been involved in any disciplinary action or misconduct during ${pr.possessive} tenure with the Company.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`This certificate is issued upon the request of ${employeeName} for ${purposeText}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Income Verification Letter') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('INCOME VERIFICATION LETTER', { align: 'center' });
            doc.moveDown(2);
            
            doc.fontSize(10).font('Helvetica-Bold').text('To Whom It May Concern,');
            doc.moveDown();
            doc.font('Helvetica').text(`This is to confirm that ${employeeName}, holder of CNIC ${employee.cnic || 'N/A'}, is employed with IT Consulting and Services (ITCS) as ${employee.jobInfo?.designation || 'Specialist'} in the ${employee.jobInfo?.department || 'Operations'} department, since ${joiningDateStr}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`${pr.capitalizedPossessive} current gross monthly salary is PKR ${totalGrossSalary.toLocaleString()}, with a net monthly take-home of PKR ${(payslip ? payslip.netPay : totalGrossSalary).toLocaleString()}, paid via bank transfer to Account No. ${employee.bankDetails?.accountNumber || 'N/A'} (${employee.bankDetails?.bankName || 'Company Registered Bank'}).`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`This letter is issued at the request of the employee for the purpose of ${purposeText} and is valid as of the date of issuance.`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Experience Letter') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('EXPERIENCE LETTER', { align: 'center' });
            doc.moveDown(2);
            
            doc.fontSize(10).font('Helvetica-Bold').text('To Whom It May Concern,');
            doc.moveDown();
            doc.font('Helvetica').text(`I am writing to confirm that ${employeeName} was employed with IT Consulting and Services (ITCS) as ${employee.jobInfo?.designation || 'Specialist'} from ${joiningDateStr} to ${lastWorkingDayStr}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`During ${pr.possessive} tenure, ${employeeName} consistently demonstrated outstanding capabilities in ${job.functionalArea} management. ${pr.capitalizedSubject} played a key role in overseeing ${job.responsibilities}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`${employeeName}'s dedication and commitment significantly contributed to strengthening our ${employee.jobInfo?.department || 'Engineering'} division and fostering a positive work environment.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`${employeeName} consistently exhibited good communication, interpersonal, and problem-solving skills. ${pr.capitalizedPossessive} professionalism, discretion, and integrity enabled ${pr.object} to handle ${job.generalDescription}, making ${pr.object} a crucial contributor to the success of the organization.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`We are confident that ${employeeName}'s skills, experience, and dedication will continue to serve ${pr.object} well in ${pr.possessive} future endeavors. We wish ${pr.object} every success in ${pr.possessive} professional career.`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Employment Certificate') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('EMPLOYMENT CERTIFICATE', { align: 'center' });
            doc.moveDown(2);
            
            doc.fontSize(10).font('Helvetica-Bold').text('To Whom It May Concern,');
            doc.moveDown();
            doc.font('Helvetica').text(`This is to certify that ${employeeName}, holder of CNIC ${employee.cnic || 'N/A'}, is/was employed with IT Consulting and Services (ITCS) as ${employee.jobInfo?.designation || 'Specialist'} in the ${employee.jobInfo?.department || 'Operations'} department, from ${joiningDateStr} to ${employee.employmentStatus?.status === 'Permanent' ? 'Present' : lastWorkingDayStr}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`${pr.capitalizedPossessive} current/last drawn gross monthly salary was PKR ${totalGrossSalary.toLocaleString()}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`This certificate is issued upon the request of the employee for ${purposeText} and is valid as of the date of issuance.`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Internship Completion Certificate') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('INTERNSHIP COMPLETION CERTIFICATE', { align: 'center' });
            doc.moveDown(2);
            
            doc.fontSize(10).font('Helvetica-Bold').text('To Whom It May Concern,');
            doc.moveDown();
            doc.font('Helvetica').text(`This is to certify that ${employeeName} successfully completed an internship with IT Consulting and Services (ITCS) in the ${employee.jobInfo?.department || 'Operations'} department, from ${joiningDateStr} to ${lastWorkingDayStr}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`During the internship, ${pr.subject} worked on ${job.responsibilities} and demonstrated highly satisfactory results throughout the assignment.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`We found ${pr.possessive} conduct and performance to be satisfactory, and we wish ${pr.object} continued success in ${pr.possessive} future academic and professional pursuits.`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');

        } else if (documentType === 'Relieving Letter') {
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('RELIEVING LETTER', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).font('Helvetica-Bold').text(`Dear ${employeeName},`);
            doc.moveDown();
            doc.font('Helvetica').text(`This is with reference to your resignation/separation from IT Consulting and Services (ITCS). We accept your resignation/separation and confirm that your last working day with the Company was ${lastWorkingDayStr}.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`You are hereby relieved of your duties and responsibilities as ${employee.jobInfo?.designation || 'Specialist'} effective from ${lastWorkingDayStr}. All dues, including final settlement, will be processed in accordance with Company policy within 30 days of your last working day.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`Please ensure the return of all Company property, including laptop, ID card, and SIM card, prior to your last working day.`, { align: 'justify', lineGap: 4 });
            doc.moveDown();
            doc.text(`We thank you for your contributions during your tenure and wish you success in your future endeavors.`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');
        } else {
            // General employment certificate fallback
            doc.fontSize(11).font('Helvetica-Bold').text(`Date: ${issueDate.toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(14).font('Helvetica-Bold').text('EMPLOYMENT STATUS CERTIFICATE', { align: 'center' });
            doc.moveDown(2);
            doc.fontSize(10).font('Helvetica-Bold').text('To Whom It May Concern,');
            doc.moveDown();
            doc.font('Helvetica').text(`This document is generated to confirm the employment status of ${employeeName}. ${pr.capitalizedSubject} has been employed since ${joiningDateStr} as ${employee.jobInfo?.designation || 'Specialist'} in the ${employee.jobInfo?.department || 'Operations'} department.`, { align: 'justify', lineGap: 4 });
            doc.moveDown(2);
            doc.text('Sincerely,');
            doc.moveDown(2);
            doc.font('Helvetica-Bold').text('Afreen Saeed');
            doc.font('Helvetica').text('Human Resource Department');
        }

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

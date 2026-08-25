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
import { formatEmployeeFullName } from '../utils/nameHelper';

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
// Helper to draw letterhead (branded design matching ITCS official template)
const drawLetterhead = (doc: any, verifyUrl: string, qrCodeDataUri: string, company?: any) => {
    const savedY = doc.y;
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const darkPurple = company?.branding?.primaryColor || '#1C0626';
    const magentaAccent = company?.branding?.secondaryColor || '#721466';

    // 1. Logo (Top-Left)
    let logoDrawn = false;
    if (company?.logoUrl && company.logoUrl.startsWith('data:image/')) {
        try {
            const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            doc.image(buffer, 60, 22, { width: 140, height: 60, fit: [140, 60] });
            logoDrawn = true;
        } catch (err) {
            console.error('Error rendering base64 company logo in letterhead:', err);
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
                    console.error('Error drawing image from path:', p, err);
                }
            }
        }
    }

    if (!logoDrawn) {
        const companyName = company?.name || 'IT CONSULTING & SERVICES';
        doc.fontSize(18).font('Helvetica-Bold').fillColor(darkPurple).text(companyName.toUpperCase(), 60, 35);
    }

    // 2. Top-Right Geometric Purple Decoration (ITCS Official Polygon Ribbon)
    // Upper Dark Purple Polygon (#1C0626)
    doc.save()
       .moveTo(doc.page.width - 170, 0)
       .lineTo(doc.page.width - 55, 75)
       .lineTo(doc.page.width - 55, 115)
       .lineTo(doc.page.width, 40)
       .lineTo(doc.page.width, 0)
       .closePath()
       .fill(darkPurple);

    // Lower Magenta Accent Flap Polygon (#721466)
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

    // 4. Footer Dashed Line
    doc.moveTo(60, doc.page.height - 110)
       .lineTo(doc.page.width - 60, doc.page.height - 110)
       .dash(2, { space: 2 })
       .strokeColor('#333333')
       .stroke();

    // 5. QR Code centered above footer banner
    if (qrCodeDataUri) {
        try {
            const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imageBuffer, (doc.page.width / 2) - 22, doc.page.height - 100, { width: 44 });
        } catch (e) {}
    }

    // Text above banner
    doc.fillColor('#444444')
       .fontSize(7)
       .font('Helvetica-Bold')
       .text('I T C S   ( I T   C O N S U L T I N G   &   S E R V I C E S )', 45, doc.page.height - 52, { align: 'center', width: doc.page.width - 90, lineBreak: false });

    // 6. Bottom Purple Banner
    const bannerHeight = 38;
    const bannerY = doc.page.height - bannerHeight;

    // Dark Purple Background Banner
    doc.rect(0, bannerY, doc.page.width, bannerHeight).fill(darkPurple);

    // Left and Right Magenta Accent Polygons
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

    // Banner White Text (Addresses & Info)
    doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
    if (company?.contact?.addressLine1 && company.contact.addressLine1.trim().length > 10) {
        const line1 = company.contact.addressLine1 || '';
        const line2 = company.contact.addressLine2 ? ` | ${company.contact.addressLine2}` : '';
        const line3 = `Info: ${company.contact.email || 'INFO@ITCS.COM.PK'} | Call: ${company.contact.phone || '+92 21 111-482-711'}` + (company.contact.website ? ` | Web: ${company.contact.website}` : '');
        doc.text(`${line1}${line2}`, 10, bannerY + 8, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        doc.text(line3, 10, bannerY + 20, { align: 'center', width: doc.page.width - 20, lineBreak: false });
    } else {
        doc.text('Karachi: 6/K Block 2, P.E.C.H.S, Near Model School Karachi Pakistan', 10, bannerY + 6, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        doc.text('Lahore: Office 32, 1st Floor, I.T Tower 73-E/1, Hali Rd, Block A Gulberg III', 10, bannerY + 16, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        doc.text('Islamabad: Office # 14, Ground Floor, Malik Plaza F-8 Markaz', 10, bannerY + 26, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        
        doc.fontSize(6).text('INFO@ITCS.COM.PK', 15, bannerY + 16, { width: 100, align: 'left', lineBreak: false });
        doc.fontSize(6).text('+92 21 111-482-711', doc.page.width - 115, bannerY + 16, { width: 100, align: 'right', lineBreak: false });
    }

    // Restore text defaults and saved layout position
    doc.page.margins.bottom = oldBottomMargin;
    doc.undash();
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

        // Fetch Company configs for single-tenant deployment
        const company = await Company.findOne().lean() as any;

        const rawDocType = (documentType || '').trim();
        const escapedDocType = rawDocType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Query DocumentTemplate globally for this single-tenant deployment
        let template = await DocumentTemplate.findOne({
            $or: [
                { documentType: rawDocType },
                { documentType: { $regex: new RegExp(`^${escapedDocType}$`, 'i') } }
            ]
        }).lean() as any;

        // Auto-seed or update default template if missing/outdated
        const defaultExperienceText = `To Whom It May Concern,\n\nI am writing to confirm that {{employeeName}} was employed with IT Consulting and Services (ITCS) as an {{designation}} from {{joiningDate}} to {{lastWorkingDay}}.\n\nDuring {{pronounPossessive}} tenure, {{employeeName}} consistently demonstrated {{skills}} in {{designation}} management. {{pronounCapitalizedSubject}} played a key role in overseeing {{jobResponsibilities}}.\n\n{{employeeName}}'s dedication and commitment significantly contributed to strengthening our {{department}} division and fostering a positive work environment. {{pronounCapitalizedPossessive}} ability to effectively manage {{generalJobDescription}} made {{pronounObject}} a crucial element in the success of the organization.\n\nThroughout {{pronounPossessive}} time at ITCS, {{employeeName}} proved to be a valuable member of our {{department}} team. {{pronounCapitalizedPossessive}} contributions have had a lasting positive impact on the organization, and {{pronounSubject}} has earned the respect and appreciation of {{pronounPossessive}} colleagues and peers.\n\nWe are confident that {{employeeName}}'s skills, experience, and dedication will continue to serve {{pronounObject}} well in {{pronounPossessive}} future endeavors. We wish {{pronounObject}} every success in {{pronounPossessive}} professional career and all the best for the future.\n\nSincerely,\nAfreen Saeed\nHuman Resource Department\nafreen@itcs.com.pk`;

        if (template && (rawDocType === 'Experience Letter' || template.documentType === 'Experience Letter') && !template.content.includes('Afreen Saeed')) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'EXPERIENCE LETTER', content: defaultExperienceText } }
            );
            template.subject = 'EXPERIENCE LETTER';
            template.content = defaultExperienceText;
        }

        // Auto-seed default template if not found in database
        if (!template) {
            const defaultTemplates: Record<string, { subject: string; content: string }> = {
                'Consolidated Pay Slip (6 Months)': {
                    subject: 'CONSOLIDATED SALARY STATEMENT (6 MONTHS)',
                    content: `To Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} (Employee ID: {{employeeId}}), holding CNIC {{cnic}}, is employed with {{companyName}} as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nConsolidated 6-Month Salary Breakdown:\n- Basic Salary: PKR {{basicSalary}}\n- Monthly Gross Salary: PKR {{grossSalary}}\n- Monthly Total Deductions: PKR {{totalDeductions}}\n- Monthly Net Take-Home Pay: PKR {{netPay}}\n\nThis consolidated pay slip is issued upon official request for {{purpose}}.`
                },
                'Consolidated Pay Slip (3 Months)': {
                    subject: 'CONSOLIDATED SALARY STATEMENT (3 MONTHS)',
                    content: `To Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} (Employee ID: {{employeeId}}), holding CNIC {{cnic}}, is employed with {{companyName}} as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nConsolidated Salary Disbursement Summary (Past 3 Months):\n- Month 1 ({{month1Name}}): Gross PKR {{month1Gross}} | Net PKR {{month1NetPay}}\n- Month 2 ({{month2Name}}): Gross PKR {{month2Gross}} | Net PKR {{month2NetPay}}\n- Month 3 ({{month3Name}}): Gross PKR {{month3Gross}} | Net PKR {{month3NetPay}}\n\nTotal Net Salary Disbursed: PKR {{totalNetPay3Months}}.\n\nThis statement is issued upon official request for {{purpose}}.`
                },
                'Pay Slip': {
                    subject: 'SALARY PAY SLIP',
                    content: `SALARY PAY SLIP\n\nEmployee Name: {{employeeName}} (ID: {{employeeId}})\nDesignation: {{designation}} | Department: {{department}}\nPay Period: {{payPeriod}}\n\nBasic Salary: PKR {{basicSalary}}\nAllowances: PKR {{allowances}}\nGross Salary: PKR {{grossSalary}}\nTotal Deductions: PKR {{totalDeductions}}\nNet Take-Home Salary: PKR {{netPay}}`
                },
                'Job Offer Letter': {
                    subject: 'OFFER OF EMPLOYMENT',
                    content: `Dear {{employeeName}},\n\nWe are pleased to offer you the position of {{designation}} in the {{department}} department at {{companyName}}. Your expected date of joining will be {{joiningDate}}.\n\nYour starting gross salary will be PKR {{grossSalary}} per month.\n\nWelcome to {{companyName}}!`
                },
                'Internship Offer Letter': {
                    subject: 'INTERNSHIP OFFER LETTER',
                    content: `Dear {{employeeName}},\n\nWe are pleased to offer you an internship position as {{designation}} in the {{department}} department at {{companyName}} for a duration of {{internshipDuration}} starting from {{joiningDate}}.\n\nWe wish you a rewarding learning experience at {{companyName}}.`
                },
                'Appointment Letter': {
                    subject: 'LETTER OF APPOINTMENT',
                    content: `Dear {{employeeName}},\n\nFurther to your acceptance of our offer, we are pleased to appoint you as {{designation}} in the {{department}} department at {{companyName}} effective {{joiningDate}}.\n\nYour employment will be governed by the standard policies and code of conduct of {{companyName}}.`
                },
                'Employment Contract': {
                    subject: 'EMPLOYMENT CONTRACT & TERMS OF SERVICE',
                    content: `EMPLOYMENT AGREEMENT\n\nThis agreement is made between {{companyName}} and {{employeeName}} (CNIC: {{cnic}}), appointed as {{designation}} in {{department}}.\n\n1. Commencement: Effective {{joiningDate}}.\n2. Monthly Gross Salary: PKR {{grossSalary}}.\n3. Working Hours: {{workingHours}} ({{workingDays}}).\n\nSigned on behalf of {{companyName}}.`
                },
                'No Objection Certificate (NOC)': {
                    subject: 'NO OBJECTION CERTIFICATE',
                    content: `To Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} (CNIC: {{cnic}}) is currently employed full-time with {{companyName}} as {{designation}} in the {{department}} department.\n\n{{companyName}} has no objection to {{pronounObject}} pursuing {{purpose}}.\n\nThis certificate is issued at the specific request of the employee.`
                },
                'Character Certificate': {
                    subject: 'CHARACTER CERTIFICATE',
                    content: `To Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}}, holding CNIC {{cnic}}, has been working with {{companyName}} as {{designation}} since {{joiningDate}}.\n\nDuring {{pronounPossessive}} tenure, {{pronounSubject}} has demonstrated excellent moral character, professional integrity, and exemplary conduct.\n\nThis certificate is issued upon request for {{purpose}}.`
                },
                'Income Verification Letter': {
                    subject: 'INCOME VERIFICATION CERTIFICATE',
                    content: `To Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} is an active full-time employee at {{companyName}}, working as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nFinancial Summary:\n- Basic Salary: PKR {{basicSalary}}\n- Monthly Gross Salary: PKR {{grossSalary}}\n- Monthly Net Pay: PKR {{netPay}}\n\nThis income verification letter is issued upon official request for {{purpose}}.`
                },
                'Experience Letter': {
                    subject: 'EXPERIENCE LETTER',
                    content: `To Whom It May Concern,\n\nI am writing to confirm that {{employeeName}} was employed with IT Consulting and Services (ITCS) as an {{designation}} from {{joiningDate}} to {{lastWorkingDay}}.\n\nDuring {{pronounPossessive}} tenure, {{employeeName}} consistently demonstrated {{skills}} in {{designation}} management. {{pronounCapitalizedSubject}} played a key role in overseeing {{jobResponsibilities}}.\n\n{{employeeName}}'s dedication and commitment significantly contributed to strengthening our {{department}} division and fostering a positive work environment. {{pronounCapitalizedPossessive}} ability to effectively manage {{generalJobDescription}} made {{pronounObject}} a crucial element in the success of the organization.\n\nThroughout {{pronounPossessive}} time at ITCS, {{employeeName}} proved to be a valuable member of our {{department}} team. {{pronounCapitalizedPossessive}} contributions have had a lasting positive impact on the organization, and {{pronounSubject}} has earned the respect and appreciation of {{pronounPossessive}} colleagues and peers.\n\nWe are confident that {{employeeName}}'s skills, experience, and dedication will continue to serve {{pronounObject}} well in {{pronounPossessive}} future endeavors. We wish {{pronounObject}} every success in {{pronounPossessive}} professional career and all the best for the future.\n\nSincerely,\nAfreen Saeed\nHuman Resource Department\nafreen@itcs.com.pk`
                },
                'Employment Certificate': {
                    subject: 'EMPLOYMENT VERIFICATION CERTIFICATE',
                    content: `To Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} (CNIC: {{cnic}}) is currently employed with {{companyName}} as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nThis certificate is issued upon request of the employee for {{purpose}}.`
                },
                'Internship Completion Certificate': {
                    subject: 'INTERNSHIP COMPLETION CERTIFICATE',
                    content: `To Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} has successfully completed an internship as {{designation}} in the {{department}} department at {{companyName}} from {{joiningDate}} to {{lastWorkingDay}}.\n\nDuring {{pronounPossessive}} internship, {{pronounSubject}} displayed commendable enthusiasm and learning aptitude.`
                },
                'Relieving Letter': {
                    subject: 'RELIEVING LETTER',
                    content: `Dear {{employeeName}},\n\nThis refers to your resignation from {{companyName}}. You are hereby relieved of your responsibilities as {{designation}} in the {{department}} department effective {{lastWorkingDay}}.\n\nWe thank you for your service and wish you best of luck for the future.`
                }
            };

            const tplInfo = defaultTemplates[rawDocType] || {
                subject: rawDocType.toUpperCase(),
                content: `This is to certify that {{salutation}} {{employeeName}} (Employee ID: {{employeeId}}), holding CNIC {{cnic}}, is employed with {{companyName}} as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nDocument Type: ${rawDocType}\n\nThis document is issued upon official request for {{purpose}}.`
            };

            const newTpl = new DocumentTemplate({
                documentType: rawDocType,
                subject: tplInfo.subject,
                content: tplInfo.content,
                isActive: true
            });
            await newTpl.save();
            template = newTpl.toObject();
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

        // Initialize PDF Kit with page margins adjusted for side spacing and letterhead header/footer
        const doc = new PDFDocument({
            margins: {
                top: 125,
                bottom: 125,
                left: 65,
                right: 65
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
        const purposeText = reason || req.body.customVars?.purpose || '';

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

        // -------------------------------------------------------------
        // DYNAMIC PAYROLL FETCHING FOR PAY SLIP & CONSOLIDATED PAY SLIPS
        // -------------------------------------------------------------
        const defaultGrossNum = totalGrossSalary || 0;
        const defaultBasicNum = basicSalaryAmount || 0;
        const defaultAllowancesNum = Math.max(0, defaultGrossNum - defaultBasicNum);

        // 1. Fetch latest payslip for single Pay Slip
        const latestPayslip = await Payslip.findOne({
            employeeId: employee.employeeId
        }).sort({ periodYear: -1, periodMonth: -1 }).lean() as any;

        let singlePayPeriod = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        let singleBasicSal = defaultBasicNum ? String(defaultBasicNum) : '';
        let singleAllowances = defaultAllowancesNum ? String(defaultAllowancesNum) : '0';
        let singleGrossSal = defaultGrossNum ? String(defaultGrossNum) : '';
        let singleTaxAmt = '0';
        let singleOtherDed = '0';
        let singleTotalDed = '0';
        let singleNetPay = defaultGrossNum ? String(defaultGrossNum) : '';

        if (latestPayslip) {
            const mName = new Date(latestPayslip.periodYear, latestPayslip.periodMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' });
            singlePayPeriod = `${mName} ${latestPayslip.periodYear}`;

            const basicEarning = latestPayslip.earnings?.find((e: any) => e.component === 'Basic Salary');
            const basicAmt = basicEarning ? basicEarning.amount : defaultBasicNum;
            const allowancesAmt = Math.max(0, latestPayslip.grossPay - basicAmt);

            const taxDeduction = latestPayslip.deductions?.find((d: any) => d.component?.toLowerCase().includes('tax'));
            const taxAmt = taxDeduction ? taxDeduction.amount : 0;
            const otherDedAmt = Math.max(0, latestPayslip.totalDeductions - taxAmt);

            singleBasicSal = String(basicAmt);
            singleAllowances = String(allowancesAmt);
            singleGrossSal = String(latestPayslip.grossPay);
            singleTaxAmt = String(taxAmt);
            singleOtherDed = String(otherDedAmt);
            singleTotalDed = String(latestPayslip.totalDeductions);
            singleNetPay = String(latestPayslip.netPay);
        }

        // 2. Fetch last 3 months payslips for Consolidated Pay Slip (3 Months)
        const currentDate = new Date();
        const targetMonths3: { month: number; year: number; name: string }[] = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            targetMonths3.push({
                month: d.getMonth() + 1,
                year: d.getFullYear(),
                name: d.toLocaleDateString('en-US', { month: 'long' })
            });
        }

        const consolidated3Data = [];
        let totalNetPay3Num = 0;

        for (const tm of targetMonths3) {
            const payslipDoc = await Payslip.findOne({
                employeeId: employee.employeeId,
                periodMonth: tm.month,
                periodYear: tm.year
            }).lean() as any;

            if (payslipDoc) {
                consolidated3Data.push({
                    name: tm.name,
                    gross: String(payslipDoc.grossPay),
                    deductions: String(payslipDoc.totalDeductions),
                    netPay: String(payslipDoc.netPay),
                    netPayNum: payslipDoc.netPay
                });
                totalNetPay3Num += payslipDoc.netPay;
            } else {
                // If not distributed in payroll, use default base salary without cuttings
                consolidated3Data.push({
                    name: tm.name,
                    gross: defaultGrossNum ? String(defaultGrossNum) : '0',
                    deductions: '0',
                    netPay: defaultGrossNum ? String(defaultGrossNum) : '0',
                    netPayNum: defaultGrossNum
                });
                totalNetPay3Num += defaultGrossNum;
            }
        }

        const internshipStart = req.body.customVars?.internshipStartDate || req.body.customVars?.startDate || (employee.employmentStatus?.status === 'Internship' && employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
        const internshipEnd = req.body.customVars?.internshipEndDate || req.body.customVars?.endDate || (employee.employmentStatus?.status === 'Internship' && employee.employmentStatus?.offboardingDate ? new Date(employee.employmentStatus.offboardingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

        const vars: Record<string, string> = {
            employeeId: employee.employeeId || '',
            employeeName,
            internName: employeeName,
            firstName: employee.firstName || '',
            lastName: employee.lastName || '',
            designation: employee.jobInfo?.designation || '',
            department: employee.jobInfo?.department || '',
            reportingManager: reportingManagerName,
            joiningDate: joiningDateStr !== 'N/A' ? joiningDateStr : '',
            startDate: internshipStart,
            endDate: internshipEnd,
            internshipStartDate: internshipStart,
            internshipEndDate: internshipEnd,
            basicSalary: req.body.customVars?.basicSalary || singleBasicSal || (basicSalaryAmount !== undefined ? String(basicSalaryAmount) : ''),
            grossSalary: req.body.customVars?.grossSalary || singleGrossSal || (totalGrossSalary !== undefined ? String(totalGrossSalary) : ''),
            purpose: req.body.customVars?.purpose || purposeText,
            purposeDetail: req.body.customVars?.purposeDetail || req.body.purposeDetail || '',
            date: issueDate.toLocaleDateString(),
            pronounSubject: pr.subject,
            pronounObject: pr.object,
            pronounPossessive: pr.possessive,
            pronounCapitalizedSubject: pr.capitalizedSubject,
            pronounCapitalizedPossessive: pr.capitalizedPossessive,
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
            bankIban: employee.bankDetails?.iban || '',
            paymentMethod: employee.bankDetails?.accountNumber 
                ? `bank transfer to ${employee.bankDetails.bankName ? employee.bankDetails.bankName + ' ' : ''}Account No. ${employee.bankDetails.accountNumber}`
                : 'bank transfer',
            skills: (employee.skills && employee.skills.length > 0) ? employee.skills.join(', ') : 'exceptional technical and operational skills',
            functionalArea: employee.jobInfo?.department || 'core business',
            jobResponsibilities: employee.jobInfo?.designation ? `${employee.jobInfo.designation} duties and departmental operations` : 'key departmental operations',
            generalJobDescription: employee.jobInfo?.designation ? `${employee.jobInfo.designation} tasks and project delivery` : 'key projects and organizational goals',
            jobDescription: employee.jobInfo?.designation ? `${employee.jobInfo.designation} tasks and project delivery` : 'key projects and organizational goals',
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
            resignationDate: req.body.customVars?.resignationDate || lastWorkingDayStr,
            settlementDays: req.body.customVars?.settlementDays || '30',
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
            payPeriod: req.body.customVars?.payPeriod || singlePayPeriod,
            allowances: req.body.customVars?.allowances || singleAllowances,
            taxAmount: req.body.customVars?.taxAmount || singleTaxAmt,
            otherDeductions: req.body.customVars?.otherDeductions || singleOtherDed,
            totalDeductions: req.body.customVars?.totalDeductions || singleTotalDed,
            netPay: req.body.customVars?.netPay || singleNetPay,
            startMonth: req.body.customVars?.startMonth || consolidated3Data[0].name,
            endMonth: req.body.customVars?.endMonth || consolidated3Data[2].name,
            year: req.body.customVars?.year || String(targetMonths3[2].year),
            month1Name: req.body.customVars?.month1Name || consolidated3Data[0].name,
            month1Gross: req.body.customVars?.month1Gross || consolidated3Data[0].gross,
            month1Deductions: req.body.customVars?.month1Deductions || consolidated3Data[0].deductions,
            month1NetPay: req.body.customVars?.month1NetPay || consolidated3Data[0].netPay,
            month2Name: req.body.customVars?.month2Name || consolidated3Data[1].name,
            month2Gross: req.body.customVars?.month2Gross || consolidated3Data[1].gross,
            month2Deductions: req.body.customVars?.month2Deductions || consolidated3Data[1].deductions,
            month2NetPay: req.body.customVars?.month2NetPay || consolidated3Data[1].netPay,
            month3Name: req.body.customVars?.month3Name || consolidated3Data[2].name,
            month3Gross: req.body.customVars?.month3Gross || consolidated3Data[2].gross,
            month3Deductions: req.body.customVars?.month3Deductions || consolidated3Data[2].deductions,
            month3NetPay: req.body.customVars?.month3NetPay || consolidated3Data[2].netPay,
            totalNetPay3Months: req.body.customVars?.totalNetPay3Months || String(totalNetPay3Num),
            totalNetPay: req.body.customVars?.totalNetPay || req.body.customVars?.totalNetPay3Months || String(totalNetPay3Num),
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
                purpose: 'Purpose / Reason',
                purposeDetail: 'Purpose Detail',
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
                startDate: 'Internship Start Date',
                endDate: 'Internship End Date',
                internshipStartDate: 'Internship Start Date',
                internshipEndDate: 'Internship End Date',
                noticePeriod: 'Notice Period',
                probationNoticePeriod: 'Probation Notice Period',
                confirmedNoticePeriod: 'Confirmed Notice Period',
                earnedLeaveDays: 'Earned Leave Days',
                casualSickLeaveDays: 'Casual/Sick Leave Days',
                acceptanceValidityDays: 'Acceptance Validity Days',
                probationDaysWords: 'Probation Days in Words',
                payPeriod: 'Pay Period / Month Year',
                allowances: 'Allowances',
                taxAmount: 'Tax Amount',
                otherDeductions: 'Other Deductions',
                totalDeductions: 'Total Deductions',
                netPay: 'Net Pay',
                startMonth: 'Start Month',
                endMonth: 'End Month',
                year: 'Year',
                month1Name: 'Month 1 Name',
                month1Gross: 'Month 1 Gross Amount',
                month1Deductions: 'Month 1 Deductions Amount',
                month1NetPay: 'Month 1 Net Pay Amount',
                month2Name: 'Month 2 Name',
                month2Gross: 'Month 2 Gross Amount',
                month2Deductions: 'Month 2 Deductions Amount',
                month2NetPay: 'Month 2 Net Pay Amount',
                month3Name: 'Month 3 Name',
                month3Gross: 'Month 3 Gross Amount',
                month3Deductions: 'Month 3 Deductions Amount',
                month3NetPay: 'Month 3 Net Pay Amount',
                totalNetPay3Months: 'Total Net Pay (3 Months)',
                totalNetPay: 'Total Net Pay (3 Months)'
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

        // Format body content
        const parsedBody = parseTemplate(template.content, vars);
        const lines = parsedBody.split('\n');

        // Draw document subject / title centered at top
        doc.fontSize(16).font('Helvetica-Bold').fillColor(company?.branding?.primaryColor || '#1E293B').text(template.subject || documentType, { align: 'center' });
        doc.moveDown(1.2);

        const docTitleUpper = (template.subject || documentType).toUpperCase();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed) {
                doc.moveDown(0.3);
                continue;
            }

            const trimmedUpper = trimmed.toUpperCase();
            // Skip line if it duplicates the document main title
            if (trimmedUpper === docTitleUpper || trimmedUpper.replace(/\s+/g, '') === docTitleUpper.replace(/\s+/g, '')) {
                continue;
            }

            // Check if line is a standalone uppercase section title
            const isHeading = trimmedUpper === trimmed && trimmed.length >= 4 && !trimmed.startsWith('DATE:') && !trimmed.startsWith('TO WHOM') && !trimmed.startsWith('DEAR') && !trimmed.startsWith('SINCERELY');

            if (isHeading) {
                doc.fontSize(14).font('Helvetica-Bold').fillColor(company?.branding?.primaryColor || '#1E293B').text(trimmed, { align: 'center' });
                doc.moveDown(0.6);
            } else if (trimmed.toLowerCase().startsWith('date:')) {
                doc.fontSize(10).font('Helvetica').fillColor('#475569').text(trimmed, { align: 'left' });
                doc.moveDown(0.4);
            } else if (trimmed.toLowerCase().startsWith('to whom it may concern') || trimmed.toLowerCase().startsWith('dear ')) {
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B').text(trimmed, { align: 'left' });
                doc.moveDown(0.4);
            } else if (trimmed.toLowerCase().startsWith('sincerely,')) {
                doc.moveDown(0.6);
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B').text(trimmed, { align: 'left' });
                doc.moveDown(0.3);
            } else {
                doc.fontSize(10).font('Helvetica').fillColor('#1E293B').text(trimmed, {
                    align: 'justify',
                    lineGap: 2.5
                });
            }
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

// Public Endpoint to verify a document or payslip
router.get('/public/verify/:documentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;
        const isValidObjId = mongoose.Types.ObjectId.isValid(documentId);

        let doc = await OfficialDocument.findOne({ 
            $or: [
                { documentId },
                ...(isValidObjId ? [{ _id: documentId }] : [])
            ]
        }).lean();
        
        if (doc) {
            return res.json({
                isValid: doc.status === 'Valid',
                documentType: doc.documentType,
                issueDate: doc.issueDate,
                employeeName: `${doc.details?.firstName || ''} ${doc.details?.lastName || ''}`.trim(),
                designation: doc.details?.designation || 'Employee',
                department: doc.details?.department || 'Staff',
                status: doc.status
            });
        }

        // Search in Payslips if not found in OfficialDocument
        const payslip = await Payslip.findOne({
            $or: [
                { payslipNo: documentId },
                ...(isValidObjId ? [{ _id: documentId }] : [])
            ]
        }).lean() as any;

        if (payslip) {
            const emp = await Employee.findOne({ employeeId: payslip.employeeId }).select('firstName middleName lastName jobInfo').lean() as any;
            const isRevokedOrCancelled = payslip.status === 'Revoked' || payslip.status === 'Cancelled' || payslip.status === 'Draft';
            return res.json({
                isValid: !isRevokedOrCancelled,
                documentType: `Salary Payslip (${payslip.periodMonth} ${payslip.periodYear})`,
                issueDate: payslip.generatedAt || payslip.createdAt,
                employeeName: formatEmployeeFullName(emp, payslip.employeeId),
                designation: emp?.jobInfo?.designation || 'Employee',
                department: emp?.jobInfo?.department || 'Staff',
                status: payslip.status || 'Valid'
            });
        }

        res.status(404).json({ message: 'Document or payslip not found or invalid' });
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
            payPeriod: 'July 2026',
            allowances: '50,050',
            taxAmount: '10,000',
            otherDeductions: '2,000',
            totalDeductions: '12,000',
            netPay: '188,050',
            startMonth: 'May',
            endMonth: 'July',
            year: '2026',
            month1Name: 'May',
            month1Gross: '200,050',
            month1Deductions: '12,000',
            month1NetPay: '188,050',
            month2Name: 'June',
            month2Gross: '200,050',
            month2Deductions: '12,000',
            month2NetPay: '188,050',
            month3Name: 'July',
            month3Gross: '200,050',
            month3Deductions: '12,000',
            month3NetPay: '188,050',
            totalNetPay3Months: '564,150',
            totalNetPay: '564,150',
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

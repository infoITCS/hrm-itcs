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
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        output = output.replace(regex, val || '');
    }

    // Bracketed placeholders fallback (e.g. [Location], [Payment Date], [Probation Days], etc.)
    const bracketReplacements: Record<string, string> = {
        'location': vars.workLocation || vars.location || vars.city || 'Karachi',
        'work location': vars.workLocation || vars.location || vars.city || 'Karachi',
        'payment date': vars.paymentDate || '5th',
        'probation days': vars.probationDays || '90',
        'working days': vars.workingDays || 'Monday to Friday',
        'working hours': vars.workingHours || '09:00 AM - 06:00 PM',
        'start time': vars.startTime || '09:00 AM',
        'end time': vars.endTime || '06:00 PM',
        'authorized signatory name': vars.signatoryName || 'Authorized Signatory',
        'designation': vars.signatoryDesignation || 'Authorized Signatory',
        'reporting manager': vars.reportingManager || '',
        'employee name': vars.employeeName || '',
        'gross salary': vars.grossSalary || '',
        'joining date': vars.joiningDate || '',
        'date': vars.date || ''
    };

    for (const [bKey, bVal] of Object.entries(bracketReplacements)) {
        const escaped = bKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexBracket = new RegExp(`\\[\\s*${escaped}\\s*\\]`, 'gi');
        output = output.replace(regexBracket, bVal);
    }

    // Strip parenthetical legal quote labels: ("Contract"), ("the Company"), ("the Employee")
    output = output.replace(/\s*\(["“']?Contract["”']?\)/gi, '');
    output = output.replace(/\s*\(["“']?the Company["”']?\)/gi, '');
    output = output.replace(/\s*\(["“']?the Employee["”']?\)/gi, '');

    return output;
}

// Helper to format date with ordinal (e.g. 24th September 2026)
const formatOrdinalDate = (d: Date): string => {
    const day = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const year = d.getFullYear();
    const suffix = (day >= 11 && day <= 13) ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][day % 10] || 'th';
    return `${day}${suffix} ${month} ${year}`;
};

// Helper to convert number to words (e.g. 300000 -> Three Hundred Thousand only)
const numberToWords = (num: number): string => {
    if (isNaN(num) || num <= 0) return '';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(n: number): string {
        if (n === 0) return '';
        if (n < 20) return a[n] + ' ';
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '') + ' ';
        if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred ' + inWords(n % 100);
        if (n < 1000000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + inWords(n % 1000);
        return inWords(Math.floor(n / 1000000)) + 'Million ' + inWords(n % 1000000);
    }
    return inWords(Math.round(num)).trim() + ' only';
};

// Helper to safely render image from base64 data URI or file path in PDFKit
function drawImageBufferOrPath(doc: any, imgSource: string | undefined | null, x: number, y: number, options: any): boolean {
    if (!imgSource) return false;
    try {
        if (imgSource.startsWith('data:image/')) {
            const base64Data = imgSource.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            doc.image(buffer, x, y, options);
            return true;
        } else if (fs.existsSync(imgSource)) {
            doc.image(imgSource, x, y, options);
            return true;
        }
    } catch (e) {
        console.warn('[PDF Document] Could not render image:', e);
    }
    return false;
}

// Helper to draw letterhead (branded design matching ITCS official template)
const drawLetterhead = (doc: any, verifyUrl: string, company?: any) => {
    const savedY = doc.y;
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const darkPurple = company?.branding?.primaryColor || '#2B0938';
    const plumMid = '#451052';
    const magentaAccent = company?.branding?.secondaryColor || '#5E1568';

    // 1. Logo (Top-Left)
    let logoDrawn = false;
    if (company?.logoUrl && company.logoUrl.startsWith('data:image/')) {
        try {
            const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            doc.image(buffer, 48, 20, { width: 140, height: 60, fit: [140, 60] });
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
                    doc.image(p, 48, 20, { width: 140, height: 60, fit: [140, 60] });
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
        doc.fontSize(18).font('Helvetica-Bold').fillColor(darkPurple).text(companyName.toUpperCase(), 48, 35);
    }

    // 2. Top-Right Geometric Purple Decoration (ITCS Official Origami Ribbon)
    // Upper Dark Purple Polygon
    doc.save()
       .moveTo(doc.page.width - 150, 0)
       .lineTo(doc.page.width, 0)
       .lineTo(doc.page.width, 115)
       .lineTo(doc.page.width - 50, 95)
       .closePath()
       .fill(darkPurple);

    // Mid plum facet
    doc.save()
       .moveTo(doc.page.width - 150, 0)
       .lineTo(doc.page.width - 50, 95)
       .lineTo(doc.page.width - 50, 115)
       .lineTo(doc.page.width - 110, 0)
       .closePath()
       .fill(plumMid);

    // Lower Magenta Accent Flap Polygon
    doc.save()
       .moveTo(doc.page.width - 50, 95)
       .lineTo(doc.page.width - 50, 115)
       .lineTo(doc.page.width, 175)
       .lineTo(doc.page.width, 115)
       .closePath()
       .fill(magentaAccent);

    // 3. Spaced Subtext above Banner
    const compName = company?.name || 'Organization';
    doc.fillColor('#475569')
       .fontSize(7.5)
       .font('Helvetica-Bold')
       .text(compName.toUpperCase(), 40, doc.page.height - 47, { align: 'center', width: doc.page.width - 80, lineBreak: false });

    // 4. Bottom Ribbon Banner
    const bannerHeight = 36;
    const bannerY = doc.page.height - bannerHeight;

    // Background bar
    doc.rect(0, bannerY, doc.page.width, bannerHeight).fill(darkPurple);

    // Left and Right Accent Chevrons
    doc.save()
       .moveTo(0, bannerY)
       .lineTo(95, bannerY)
       .lineTo(110, doc.page.height)
       .lineTo(0, doc.page.height)
       .closePath()
       .fill(magentaAccent);

    doc.save()
       .moveTo(doc.page.width - 95, bannerY)
       .lineTo(doc.page.width, bannerY)
       .lineTo(doc.page.width, doc.page.height)
       .lineTo(doc.page.width - 110, doc.page.height)
       .closePath()
       .fill(magentaAccent);

    // Left Email Icon (Envelope vector) + address
    const compEmail = (company?.contact?.email || 'info@company.com').toUpperCase();
    const envX = 42;
    const envY = bannerY + 6;
    doc.save()
       .rect(envX, envY, 11, 7).strokeColor('#FFFFFF').lineWidth(0.8).stroke()
       .moveTo(envX, envY).lineTo(envX + 5.5, envY + 3.5).lineTo(envX + 11, envY).stroke()
       .restore();
    doc.fillColor('#FFFFFF').fontSize(6).font('Helvetica-Bold')
       .text(compEmail, 5, bannerY + 16, { width: 85, align: 'center', lineBreak: false });

    // Right Phone Icon (Phone vector) + number
    const compPhone = company?.contact?.phone || '';
    const phX = doc.page.width - 50;
    const phY = bannerY + 5;
    doc.save()
       .roundedRect(phX, phY, 7, 10, 1).strokeColor('#FFFFFF').lineWidth(0.8).stroke()
       .circle(phX + 3.5, phY + 7.5, 0.5).fillColor('#FFFFFF').fill()
       .restore();
    doc.fillColor('#FFFFFF').fontSize(6).font('Helvetica-Bold')
       .text(compPhone, doc.page.width - 90, bannerY + 16, { width: 85, align: 'center', lineBreak: false });

    // Middle Office Addresses
    const addrY = bannerY + 5;
    const addrWidth = doc.page.width - 220;
    const addrX = 110;

    const renderAddrLine = (city: string, text: string, yPos: number) => {
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#FFFFFF');
        const cityPrefix = city ? city + ': ' : '';
        const cityWidth = cityPrefix ? doc.widthOfString(cityPrefix) : 0;
        const textWidth = doc.font('Helvetica').widthOfString(text);
        const totalW = cityWidth + textWidth;
        const startX = addrX + Math.max(0, (addrWidth - totalW) / 2);

        if (cityPrefix) {
            doc.font('Helvetica-Bold').text(cityPrefix, startX, yPos, { continued: true });
        }
        doc.font('Helvetica').text(text, cityPrefix ? undefined : startX, yPos, { continued: false });
    };

    const addr1 = company?.contact?.addressLine1 || '';
    const addr2 = company?.contact?.addressLine2 || '';
    if (addr1 && addr2) {
        renderAddrLine('', addr1, addrY + 4);
        renderAddrLine('', addr2, addrY + 14);
    } else if (addr1) {
        renderAddrLine('', addr1, addrY + 9);
    }

    // Restore text defaults and saved layout position
    doc.page.margins.bottom = oldBottomMargin;
    doc.y = savedY;
    doc.fillColor('#1E293B').font('Helvetica').fontSize(10);
};

// Inline rich markdown renderer (**bold text**)
function renderRichText(
    doc: any,
    text: string,
    options: { x?: number; width?: number; fontSize?: number; fontColor?: string; lineGap?: number; align?: string } = {}
) {
    const x = options.x !== undefined ? options.x : 48;
    const width = options.width || (doc.page.width - 96);
    const fontSize = options.fontSize || 9.5;
    const fontColor = options.fontColor || '#1E293B';
    const lineGap = options.lineGap !== undefined ? options.lineGap : 2.5;
    const align = options.align || 'left';

    if (!text.includes('**')) {
        doc.fontSize(fontSize).font('Helvetica').fillColor(fontColor).text(text, x, doc.y, {
            width,
            align,
            lineGap
        });
        return;
    }

    const parts: { text: string; bold: boolean }[] = [];
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: text.substring(lastIndex, match.index), bold: false });
        }
        parts.push({ text: match[1], bold: true });
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push({ text: text.substring(lastIndex), bold: false });
    }

    doc.fontSize(fontSize).fillColor(fontColor);
    for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        doc.font(parts[i].bold ? 'Helvetica-Bold' : 'Helvetica')
           .text(parts[i].text, i === 0 ? x : undefined, i === 0 ? doc.y : undefined, {
               continued: !isLast,
               width,
               align,
               lineGap
           });
    }
}

// Helper to render bullet points or key-value lines
function renderBulletOrKeyValue(doc: any, line: string, options: { x?: number; width?: number; fontSize?: number } = {}) {
    const startX = options.x || 68;
    const width = options.width || (doc.page.width - startX - 48);
    const fontSize = options.fontSize || 9.5;

    let cleanLine = line.trim();
    if (cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('*')) {
        cleanLine = cleanLine.replace(/^[•\-\*]\s*/, '');
    }

    const colonIdx = cleanLine.indexOf(':');
    if (colonIdx > 0 && colonIdx < 35 && !cleanLine.toLowerCase().startsWith('http')) {
        const key = cleanLine.substring(0, colonIdx).replace(/\*\*/g, '').trim();
        const val = cleanLine.substring(colonIdx + 1).replace(/\*\*/g, '').trim();

        if (val.length === 0) {
            doc.moveDown(0.25);
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#0B4F6C')
               .text(key + ':', 48, doc.y, { align: 'left' });
            doc.moveDown(0.2);
            return;
        }

        doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#0B4F6C')
           .text('• ', startX, doc.y, { continued: true });
        doc.font('Helvetica-Bold').fillColor('#1E293B')
           .text(key + ': ', { continued: true });
        doc.font('Helvetica').fillColor('#1E293B')
           .text(val, { width, continued: false, lineGap: 1.5 });
    } else {
        doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#0B4F6C')
           .text('• ', startX, doc.y, { continued: true });
        doc.font('Helvetica').fillColor('#1E293B')
           .text(cleanLine.replace(/\*\*/g, ''), { width, continued: false, lineGap: 1.5 });
    }
    doc.moveDown(0.2);
}

// Master complete document renderer
const renderCompleteDocument = (
    doc: any,
    documentType: string,
    template: { subject?: string; content?: string; documentType?: string },
    vars: Record<string, string>,
    company: any,
    verifyUrl: string,
    qrCodeDataUri: string
) => {
    // 1. Draw Letterhead on first page
    drawLetterhead(doc, verifyUrl, company);

    // Subsequent pages (if document spans more than one page)
    doc.on('pageAdded', () => {
        drawLetterhead(doc, verifyUrl, company);
    });

    const docTitle = (template.subject || documentType).toUpperCase();
    const isInternship = docTitle.includes('INTERNSHIP') || documentType.toLowerCase().includes('internship');

    // Title: Left-aligned, Dark Ocean Teal (#0B4F6C), bold uppercase
    doc.y = 112;
    doc.fontSize(15.5)
       .font('Helvetica-Bold')
       .fillColor('#0B4F6C')
       .text(docTitle, 48, 112, { align: 'left', lineBreak: true });
    doc.moveDown(0.5);

    // Two-Column Header Block (Date on left, Recipient on right)
    const headerY = doc.y;

    // Left: Date
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1E293B')
       .text('Date: ', 48, headerY, { continued: true });
    doc.font('Helvetica').text(vars.date || formatOrdinalDate(new Date()), { continued: false });

    // Right: Recipient block (if employee is specified)
    const recipientName = vars.employeeName || vars.internName || '';
    const recipientCity = vars.city || vars.personalCity || vars.workLocation || 'Karachi';
    const recipientEmail = vars.personalEmail || vars.workEmail || '';

    let recipientBottomY = headerY + 14;
    if (recipientName && recipientName !== '—') {
        const rightBoxWidth = 220;
        const rightBoxX = doc.page.width - 48 - rightBoxWidth;

        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1E293B')
           .text(`To: ${recipientName}`, rightBoxX, headerY, { width: rightBoxWidth, align: 'right' });

        doc.fontSize(9).font('Helvetica').fillColor('#334155')
           .text(`${recipientCity}, Pakistan`, rightBoxX, doc.y, { width: rightBoxWidth, align: 'right' });

        if (recipientEmail && recipientEmail !== '—') {
            doc.fontSize(8.5).font('Helvetica').fillColor('#334155')
               .text(`Email: ${recipientEmail}`, rightBoxX, doc.y, { width: rightBoxWidth, align: 'right' });
        }
        recipientBottomY = doc.y;
    }

    // Set Y below whichever column is taller
    doc.y = Math.max(headerY + 28, recipientBottomY) + 8;

    // Format & Parse Content
    const parsedBody = parseTemplate(template.content || '', vars);
    const rawLines = parsedBody.replace(/\r\n/g, '\n').split('\n');

    let inSignatory = false;
    let inAcceptance = false;
    let hasRenderedSignatory = false;
    let hasRenderedAcceptance = false;

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            if (!inSignatory && !inAcceptance) {
                doc.moveDown(0.25);
            }
            continue;
        }

        const trimmedUpper = trimmed.toUpperCase();

        // Skip lines that duplicate the header section already drawn
        if (trimmedUpper.startsWith('DATE:') || trimmedUpper === 'DATE') continue;
        if (trimmedUpper.startsWith('TO:') || trimmedUpper.startsWith('TO ' + recipientName.toUpperCase())) continue;
        if (recipientName && (trimmedUpper === recipientName.toUpperCase() || trimmedUpper.replace(/\s+/g, '') === recipientName.toUpperCase().replace(/\s+/g, ''))) continue;
        if (trimmedUpper === `${recipientCity.toUpperCase()}, PAKISTAN` || trimmedUpper === 'KARACHI, PAKISTAN' || trimmedUpper === 'ISLAMABAD, PAKISTAN' || trimmedUpper === 'LAHORE, PAKISTAN') continue;
        if (trimmedUpper.startsWith('EMAIL:') && (trimmed.includes('@') || trimmed.length < 50)) continue;
        if (trimmedUpper === docTitle || trimmedUpper.replace(/\s+/g, '') === docTitle.replace(/\s+/g, '')) continue;
        if (trimmedUpper === 'PRIVATE AND CONFIDENTIAL') continue;

        // Skip duplicate address and company name headers that some old templates had typed in body
        if (trimmedUpper === 'IT CONSULTING AND SERVICES (ITCS)' || trimmedUpper === 'IT CONSULTING AND SERVICES' || trimmedUpper === 'ITCS') continue;
        if (trimmedUpper.includes('IT CONSULTING AND SERVICES') && trimmedUpper.includes('6/K, BLOCK 2')) continue;
        if (trimmedUpper.startsWith('6/K, BLOCK 2') || trimmedUpper.includes('P.E.C.H.S')) continue;

        // Skip subsequent signatory lines if signatory block was already rendered
        if (inSignatory) {
            if (trimmedUpper.includes('AFREEN SAEED') || 
                trimmedUpper.includes('FARAZ ANWER') ||
                trimmedUpper.includes('FOUNDER & CEO') ||
                trimmedUpper.includes('FOUNDER AND CEO') ||
                trimmedUpper.includes('MANAGER HR') || 
                trimmedUpper.includes('HUMAN RESOURCE') || 
                trimmedUpper.includes('HR & PAYROLL DEPARTMENT') ||
                trimmedUpper.includes('PAYROLL DEPARTMENT') ||
                trimmedUpper.includes('AUTHORIZED SIGNATORY') ||
                trimmedUpper.includes('IT CONSULTING AND SERVICES') ||
                trimmedUpper.includes('INFO@ITCS') ||
                trimmedUpper.includes('AFREEN@ITCS') ||
                trimmedUpper.startsWith('[AUTHORIZED SIGNATORY') ||
                trimmedUpper.startsWith('[DESIGNATION]')) {
                continue;
            } else if (trimmedUpper.includes('ACCEPTANCE') || trimmedUpper.startsWith('EMPLOYEE SIGNATURE') || trimmedUpper.startsWith('SIGNATURE:')) {
                inSignatory = false;
                // fall through to acceptance handling
            } else {
                inSignatory = false;
            }
        }

        // Skip subsequent acceptance lines if acceptance block was already rendered
        if (inAcceptance) {
            if (trimmedUpper.startsWith('I, ') || 
                trimmedUpper.startsWith('SIGNATURE:') || 
                trimmedUpper.startsWith('DATE:') ||
                trimmedUpper.startsWith('EMPLOYEE SIGNATURE') ||
                trimmedUpper.includes('ACCEPT THE') ||
                trimmedUpper.includes('TERMS AND CONDITIONS')) {
                continue;
            } else {
                inAcceptance = false;
            }
        }

        // Subject Line
        if (trimmedUpper.startsWith('SUBJECT:')) {
            const subjText = trimmed.replace(/^subject:\s*/i, '').trim();
            doc.moveDown(0.3);
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B')
               .text('Subject: ', 48, doc.y, { continued: true });
            doc.text(subjText, { continued: false });
            doc.moveDown(0.35);
            continue;
        }

        // Salutation (Dear ... / To Whom It May Concern)
        if (trimmedUpper.startsWith('DEAR ') || trimmedUpper.startsWith('TO WHOM IT MAY CONCERN')) {
            doc.moveDown(0.2);
            doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1E293B')
               .text(trimmed, 48, doc.y, { align: 'left' });
            doc.moveDown(0.35);
            continue;
        }

        // Acceptance Section
        const isAcceptanceLine = 
            trimmedUpper === 'ACCEPTANCE' || 
            trimmedUpper === 'EMPLOYEE ACCEPTANCE' || 
            trimmedUpper.startsWith('ACCEPTANCE OF') ||
            trimmedUpper.startsWith('EMPLOYEE SIGNATURE') ||
            (trimmedUpper.startsWith('SIGNATURE:') && !hasRenderedAcceptance);

        if (isAcceptanceLine && !hasRenderedAcceptance) {
            inAcceptance = true;
            hasRenderedAcceptance = true;
            doc.moveDown(0.35);

            // Divider line
            const dividerY = doc.y;
            doc.moveTo(48, dividerY)
               .lineTo(doc.page.width - 48, dividerY)
               .strokeColor('#CBD5E1')
               .lineWidth(0.8)
               .stroke();

            doc.y = dividerY + 6;
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#0B4F6C').text('Employee Acceptance', 48, doc.y);
            doc.moveDown(0.25);

            const empName = vars.employeeName || 'Employee';
            const offerTerm = isInternship ? 'internship offer' : (documentType.toLowerCase().includes('contract') ? 'employment contract' : (documentType.toLowerCase().includes('offer') ? 'employment offer' : 'offer'));

            doc.fontSize(9).font('Helvetica').fillColor('#1E293B')
               .text('I, ', 48, doc.y, { continued: true });
            doc.font('Helvetica-Bold').text(empName, { continued: true });
            doc.font('Helvetica').text(`, accept the ${offerTerm} and agree to abide by all its terms and conditions.`, { continued: false });

            doc.moveDown(0.3);

            const signLineY = doc.y;
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#1E293B')
               .text('Signature: ', 48, signLineY, { continued: true });
            doc.font('Helvetica').fillColor('#94A3B8').text('____________________', { continued: false });

            doc.moveDown(0.25);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#1E293B')
               .text('Date: ', 48, doc.y, { continued: true });
            doc.font('Helvetica').fillColor('#94A3B8').text('________________________', { continued: false });

            // Place Dynamic Verification QR Code beside signature lines (on the right)
            if (qrCodeDataUri) {
                try {
                    const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
                    const imageBuffer = Buffer.from(base64Data, 'base64');
                    doc.image(imageBuffer, doc.page.width - 110, signLineY - 12, { width: 46, height: 46 });
                } catch (e) {}
            }
            continue;
        }

        // Signatory Section
        if (trimmedUpper.startsWith('SINCERELY') || trimmedUpper.startsWith('WITH WARM REGARDS') || trimmedUpper.startsWith('YOURS FAITHFULLY')) {
            inSignatory = true;
            hasRenderedSignatory = true;
            doc.moveDown(0.5);

            const isAppointment = documentType.toLowerCase().includes('appointment') || docTitle.toLowerCase().includes('appointment');

            // Select corresponding signatory:
            // - Appointment Letters -> CEO / Executive Signatory
            // - Offer Letters, Experience Letters, Payslips, etc. -> HR Signatory
            const targetSigUrl = isAppointment
                ? (company?.ceoSignatureUrl || company?.signatureUrl)
                : (company?.hrSignatureUrl || company?.signatureUrl);

            const resolvedSignatoryName = isAppointment
                ? (company?.ceoSignatoryName || vars.signatoryName || 'Founder & CEO')
                : (company?.hrSignatoryName || vars.signatoryName || 'Manager HR');

            const resolvedSignatoryTitle = isAppointment
                ? (company?.ceoSignatoryTitle || vars.signatoryDesignation || 'Chief Executive Officer')
                : (company?.hrSignatoryTitle || vars.signatoryDesignation || 'Human Resources');

            const compName = company?.name || vars.companyName || 'Organization';
            doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1E293B').text(compName, 48, doc.y);
            doc.moveDown(0.2);

            // Dynamic Company Signature & Stamp
            const sigImgY = doc.y + 2;
            let sigDrawn = false;
            let stampDrawn = false;

            // 1. Draw target signature (CEO or HR) if uploaded for this company
            if (targetSigUrl) {
                sigDrawn = drawImageBufferOrPath(doc, targetSigUrl, 48, sigImgY, { height: 38 });
            }

            // 2. Draw official company stamp if uploaded for this company
            if (company?.stampUrl) {
                stampDrawn = drawImageBufferOrPath(doc, company.stampUrl, sigDrawn ? 130 : 48, sigImgY, { height: 38 });
            }

            // If neither signature image nor stamp is uploaded, draw a clean signature line
            if (!sigDrawn && !stampDrawn) {
                doc.fontSize(9).font('Helvetica').fillColor('#94A3B8').text('_________________________________', 48, sigImgY + 8);
                doc.y = sigImgY + 24;
            } else {
                doc.y = sigImgY + 42;
            }

            // Render dynamic signatory name and title
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B').text(resolvedSignatoryName, 48, doc.y);
            doc.fontSize(9.5).font('Helvetica').fillColor('#475569').text(resolvedSignatoryTitle, 48, doc.y);

            const isPayslipDoc = documentType.toLowerCase().includes('pay slip') || documentType.toLowerCase().includes('salary') || docTitle.toLowerCase().includes('pay slip') || docTitle.toLowerCase().includes('salary statement');
            if (isPayslipDoc) {
                doc.moveDown(0.15);
                doc.fontSize(9).font('Helvetica').fillColor('#1E293B').text('HR & Payroll Department', 48, doc.y);
            }

            doc.moveDown(0.3);
            continue;
        }

        // Section Heading (e.g. "Salary and Benefits:", "Terms and Conditions:", "1. Position and Duties")
        const isHeading = 
            (trimmed.endsWith(':') && trimmed.length < 50 && !trimmed.includes('.') && !trimmed.startsWith('•') && !trimmed.startsWith('-') && !trimmed.startsWith('*')) ||
            (trimmedUpper === trimmed && trimmed.length >= 4 && trimmed.length < 50 && !trimmed.includes('.') && !trimmedUpper.startsWith('HTTP')) ||
            /^\d+\.\s+[A-Za-z\s]+$/.test(trimmed);

        if (isHeading) {
            doc.moveDown(0.35);
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#0B4F6C')
               .text(trimmed, 48, doc.y, { align: 'left' });
            doc.moveDown(0.2);
            continue;
        }

        // Key-Value detail or bullet line
        const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
        const colonIdx = trimmed.indexOf(':');
        const hasValue = colonIdx > 0 && trimmed.substring(colonIdx + 1).trim().length > 0;
        const isKeyValue = colonIdx > 0 && colonIdx < 30 && hasValue && !trimmedUpper.startsWith('HTTP') && !trimmedUpper.startsWith('NOTE:');

        if (isBullet || isKeyValue) {
            renderBulletOrKeyValue(doc, trimmed);
            continue;
        }

        // Standard Body Paragraph with rich inline bolding
        renderRichText(doc, trimmed, {
            x: 48,
            width: doc.page.width - 96,
            fontSize: 9.5,
            fontColor: '#1E293B',
            lineGap: 2.5,
            align: 'left'
        });
        doc.moveDown(0.25);
    }

    // Fallback: If document had no acceptance block, place QR code beside signatory or bottom-right
    if (!hasRenderedAcceptance && qrCodeDataUri) {
        try {
            const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const targetQrY = Math.min(doc.page.height - 100, Math.max(doc.y - 45, doc.page.height - 110));
            doc.image(imageBuffer, doc.page.width - 96, targetQrY, { width: 44, height: 44 });
        } catch (e) {}
    }
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

        const defaultAppointmentText = `With reference to your application for employment with ITCS (IT Consulting and Services), we are pleased to offer you the position of {{designation}}. You will be based in {{workLocation}} with effect from {{joiningDate}} on the terms and conditions given below.\n\nYour terms of appointment will be governed by the rules and regulations applicable to the above-mentioned designation as per the Human Resources Policy Manual of the Company. The Company, however, reserves the right to change the applicable rules and regulations at its entire discretion, without advance notice, in which case your employment shall be governed by such revised rules and regulations.\n\nSalary and Benefits:\nYour monthly gross salary will be Rs. {{grossSalary}} ({{grossSalaryWords}}) during the probationary period and will remain Rs. {{grossSalary}} ({{grossSalaryWords}}) upon successful completion of probation and confirmation.\n\nYour benefit entitlement will be in accordance with the policies approved by the Company and shall be subject to the applicable Company policies from time to time.\n\nUpon successful completion of the probationary period, you will be entitled to the following benefits, subject to Company policy:\n• Meal allowance/benefit\n• Fuel allowance/benefit\n• Company-provided SIM card and applicable mobile package\n• Provident Fund / Company Share Plan, as applicable under Company policy\n• Medical allowance\n• Any other benefits applicable to employees in your cadre under Company policy\n\nThe above benefits shall become applicable after successful completion of the probationary period and confirmation. The Company reserves the right to modify its benefit policies from time to time, and you shall be bound by such modifications.\n\nProbationary Period:\nYour confirmation is subject to a satisfactory probationary period of three (3) months. The Company reserves the right to extend the probationary period at its discretion. Unless your employment is confirmed in writing, you shall continue to be employed on probation.\n\nOn satisfactory completion of your probation period, your employment with the Company may be confirmed in writing, whereupon you will be entitled to the Company benefits applicable to permanent staff in your cadre from the date of confirmation.\n\nAnnual Incentive Plan:\nYou will be entitled to the Annual Incentive Plan of the Company, if applicable, as per Company Policy.\n\nMedical Policy:\nUpon confirmation, you will be entitled to the applicable medical allowance/benefit in accordance with the Company’s prevailing Medical Policy.\n\nMobile Connection:\nUpon confirmation, you will be entitled to a Company-provided SIM card and mobile package, subject to the applicable Company policy and usage limits.\n\nReporting Hierarchy:\nYour reporting line will be to {{reportingManager}}, who will assign you duties and responsibilities in carrying out your day-to-day activities. The Company may, at its discretion, change the reporting line and/or the requirements of the position assigned.\n\nReferences / Academic Verification:\nThe Company reserves the right to solicit information regarding yourself from any of your previous employers. Upon your representation, we understand that your educational degree(s) are from accredited institution(s); however, the Company further reserves the right to seek verification regarding your educational qualifications and respective academic institutions from relevant authorities. Your appointment and confirmation are subject to receiving satisfactory references/authentication when such reference/verification checks are conducted.\n\nTermination of Service:\nDuring the probationary period, either the Company or you may terminate the employment without cause and at any time by giving 24 hours’ notice in writing to the other party.\n\nAfter confirmation, either party may terminate this Agreement without cause by giving 30 days’ notice in writing to the other party, or by making payment equivalent to 30 days’ salary in lieu of notice.\n\nNotwithstanding anything herein contained, the Company shall be entitled to terminate your employment with immediate effect and without advance notice (or any payment in lieu of notice) in case of misconduct, which shall include but shall not be limited to willful insubordination.\n\nThe Company reserves the right to terminate the services at any time without prior notice if the employee’s continued association/employment with the Company is prejudicial to the image and/or interests of the Company.\n\nIn case of termination of service due to misconduct or disciplinary action, the Company will reserve the right to withhold compensation to the extent permitted under applicable law and Company policy.\n\nEmployee Provident Fund / Company Share Plan:\nUpon confirmation, you will be entitled to participate in the Provident Fund and/or Company Share Plan, as applicable, subject to the eligibility criteria, terms and conditions, and policies of the Company.\n\nLeave Entitlement:\nYou will be allowed twenty (20) working days of Annual Leave for each completed year of service. Earned Leave can be availed after confirmation only as detailed in policy. You are also entitled to ten (10) paid sick leaves.\n\nLeave cannot be encashed or accumulated. Any leave balance at the end of the calendar year will automatically lapse. The Company may frame and modify Leave rules from time to time, which shall be binding upon you.\n\nTraining and Development:\nThe Company offers training and development opportunities for all employees. All local and foreign training will be governed by the prevailing Training Policy.\n\nRetirement:\nYou will be retired from the service of the Company on attaining the age of 60 years. You may be retired earlier on the grounds of ill health or physical or mental incapacity to work, subject to applicable Company policy and law.\n\nFalse Information:\nIf the Company determines at any time that your recruitment was made as a result of the submission of false information and/or forged documents, the employment contract will be automatically cancelled without prior notice, reward, or compensation, subject to applicable law.\n\nExclusive Service and Confidentiality Agreement:\nDuring the period of your employment with the Company, you will perform all such duties anywhere in Pakistan as are assigned to you from time to time by the Company or its associates depending upon the exigencies of business. The Company also reserves the right to transfer you to any location within Pakistan.\n\nSince in the course of your employment you would be disclosed information which is confidential and proprietary to the Company, and which it would be a breach of trust to disclose or make available, particularly to a competitor of the Company, you undertake to maintain complete confidentiality in regard to the Company’s information, processes, operations, and business activities at all times, whether during or after your employment with the Company.\n\nWhile in the Company’s service, you will not be employed at any time directly or indirectly with any other employer or any other business, subject to applicable law and Company policy.\n\nService Rules and Regulations:\nYour appointment is subject to the rules and regulations in force in the Company or any amendments, alterations, or modifications that may be made therein from time to time.\n\nWe welcome you to ITCS (IT Consulting and Services) and wish you a successful career with the Company.\n\nValidity:\nPlease provide the Company with your acceptance of the offer and joining date by returning a signed copy of this letter within 7 working days. This offer will expire if:\na) You do not provide your acceptance within 7 days; and/or\nb) You do not join, at the latest, within 10 working days after your proposed and mutually agreed joining date.\n\nSincerely,\nITCS (IT Consulting and Services)\n\nFaraz Anwer\nFounder & CEO\n\nEmployee Acceptance\nI, {{employeeName}}, accept the appointment offer and its terms.\nSignature: ____________________\nDate: ________________________`;

        if (template && (rawDocType === 'Experience Letter' || template.documentType === 'Experience Letter') && !template.content.includes('Afreen Saeed')) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'EXPERIENCE LETTER', content: defaultExperienceText } }
            );
            template.subject = 'EXPERIENCE LETTER';
            template.content = defaultExperienceText;
        }

        if (template && (rawDocType === 'Appointment Letter' || template.documentType === 'Appointment Letter') && !template.content.includes('Exclusive Service')) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'APPOINTMENT LETTER', content: defaultAppointmentText } }
            );
            template.subject = 'APPOINTMENT LETTER';
            template.content = defaultAppointmentText;
        }

        // Auto-seed default template if not found in database
        if (!template) {
            const defaultTemplates: Record<string, { subject: string; content: string }> = {
                'Internship Offer Letter': {
                    subject: 'INTERNSHIP OFFER LETTER',
                    content: `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Internship Offer – ITCS\n\nDear {{salutation}} {{employeeName}},\n\nWe are pleased to offer you an Internship position with our ITCS office in {{workLocation}}. The details of your internship are as follows:\n\n• Position: {{designation}}\n• Location: {{workLocation}}\n• Stipend: PKR {{stipend}}\n• Joining date: {{joiningDate}}\n• Working Days: {{workingDays}}\n• Working Hours: {{workingHours}}\n\nDuring your internship, you will work with our {{department}} team in {{workLocation}}, adhere to company policies, and maintain confidentiality. This internship does not guarantee permanent employment and may be ended by either party with reasonable notice. Please confirm your acceptance of this offer by signing below and returning a copy of this letter. We look forward to having you on board and wish you a rewarding learning experience.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\n\nAcceptance\nI, {{employeeName}}, accept the internship offer and its terms and conditions.\nSignature: ____________________\nDate: ________________________`
                },
                'Job Offer Letter': {
                    subject: 'OFFER OF EMPLOYMENT',
                    content: `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Offer of Employment – ITCS\n\nDear {{salutation}} {{employeeName}},\n\nWe are pleased to offer you the position of {{designation}} at IT Consulting and Services (ITCS). We look forward to welcoming you to our team. The details of your offer are as follows:\n\n• Position: {{designation}}\n• Department: {{department}}\n• Location: {{workLocation}}\n• Base Salary: PKR {{confirmedSalary}} per month\n• Probation Period: {{probationDays}} Days\n• Joining Date: {{joiningDate}}\n• Working Days: {{workingDays}}\n• Working Hours: {{workingHours}}\n\nCompensation During Probation:\nFor the period of probation, your base salary will be PKR {{probationSalary}} per month. During this time, the company will provide resources to support your duties: {{companyResources}}.\n\nCompensation After Probation:\nUpon successful completion of the probation period, your compensation package will be revised to PKR {{confirmedSalary}} per month, with benefits including {{benefitsList}}.\n\nGeneral Terms:\nYour employment will be governed by company policies, procedures, and code of conduct. Please confirm your acceptance of this offer by signing below and returning a copy of this letter.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\n\nEmployee Acceptance\nI, {{employeeName}}, accept the employment offer and agree to abide by all its terms and conditions.\nSignature: ____________________\nDate: ________________________`
                },
                'Appointment Letter': {
                    subject: 'APPOINTMENT LETTER',
                    content: defaultAppointmentText
                },
                'Employment Contract': {
                    subject: 'EMPLOYMENT CONTRACT & TERMS OF SERVICE',
                    content: `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Employment Contract & Terms of Service – ITCS\n\nDear {{salutation}} {{employeeName}},\n\nThis Employment Contract is executed between IT Consulting and Services (ITCS) and {{employeeName}} (CNIC: {{cnic}}), appointed as {{designation}} in the {{department}} department.\n\nTerms and Conditions:\n• Commencement Date: {{joiningDate}}\n• Designation & Department: {{designation}}, {{department}}\n• Work Location: {{workLocation}}\n• Monthly Gross Salary: PKR {{grossSalary}}\n• Working Schedule: {{workingHours}} ({{workingDays}})\n• Probation Period: {{probationDays}} Days\n• Notice Period: {{noticePeriod}}\n\nBoth parties agree to uphold confidentiality, company policies, and professional integrity.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\n\nEmployee Acceptance\nI, {{employeeName}}, accept this Employment Contract and agree to abide by all its terms and conditions.\nSignature: ____________________\nDate: ________________________`
                },
                'Consolidated Pay Slip (6 Months)': {
                    subject: 'CONSOLIDATED SALARY STATEMENT (6 MONTHS)',
                    content: `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Consolidated Salary Statement (6 Months) – ITCS\n\nTo Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} (Employee ID: {{employeeId}}), holding CNIC {{cnic}}, is employed with IT Consulting and Services (ITCS) as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nEmployee & Financial Details:\n• Employee ID: {{employeeId}}\n• CNIC Number: {{cnic}}\n• Designation & Department: {{designation}}, {{department}}\n• Date of Joining: {{joiningDate}}\n• Monthly Basic Salary: PKR {{basicSalary}}\n• Monthly Gross Salary: PKR {{grossSalary}}\n• Monthly Net Take-Home Pay: PKR {{netPay}}\n• Bank Details: {{paymentMethod}}\n\nAll monthly salaries for the past 6 months have been directly remitted into {{pronounPossessive}} bank account. This statement is issued upon request for {{purpose}}.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\nHR & Payroll Department`
                },
                'Consolidated Pay Slip (3 Months)': {
                    subject: 'CONSOLIDATED SALARY STATEMENT (3 MONTHS)',
                    content: `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Consolidated Salary Statement (3 Months) – ITCS\n\nTo Whom It May Concern,\n\nThis is to certify that {{salutation}} {{employeeName}} (Employee ID: {{employeeId}}), holding CNIC {{cnic}}, is employed with IT Consulting and Services (ITCS) as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nConsolidated 3-Month Salary Disbursement Summary:\n• Month 1 ({{month1Name}}): Gross PKR {{month1Gross}} | Deductions PKR {{month1Deductions}} | Net Pay PKR {{month1NetPay}}\n• Month 2 ({{month2Name}}): Gross PKR {{month2Gross}} | Deductions PKR {{month2Deductions}} | Net Pay PKR {{month2NetPay}}\n• Month 3 ({{month3Name}}): Gross PKR {{month3Gross}} | Deductions PKR {{month3Deductions}} | Net Pay PKR {{month3NetPay}}\n• Total Net Salary Disbursed (3 Months): PKR {{totalNetPay3Months}}\n\nThis consolidated statement is issued upon official request for {{purpose}} without financial liability on ITCS.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\nHR & Payroll Department`
                },
                'Pay Slip': {
                    subject: 'SALARY PAY SLIP',
                    content: `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Salary Pay Slip – {{payPeriod}}\n\nEmployee Details:\n• Employee Name: {{employeeName}} (ID: {{employeeId}})\n• Designation: {{designation}}\n• Department: {{department}}\n• Pay Period: {{payPeriod}}\n\nEarnings & Deductions Summary:\n• Basic Salary: PKR {{basicSalary}}\n• Total Allowances: PKR {{allowances}}\n• Gross Salary: PKR {{grossSalary}}\n• Income Tax: PKR {{taxAmount}}\n• Other Deductions: PKR {{otherDeductions}}\n• Total Deductions: PKR {{totalDeductions}}\n• Net Take-Home Pay: PKR {{netPay}}\n\nThis pay slip is an official record of monthly salary disbursed via bank transfer.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\nHR & Payroll Department`
                },
                'No Objection Certificate (NOC)': {
                    subject: 'NO OBJECTION CERTIFICATE',
                    content: `Date: {{date}}\n\nTo Whom It May Concern,\n\nSubject: No Objection Certificate – ITCS\n\nThis is to certify that {{salutation}} {{employeeName}} (CNIC: {{cnic}}) is currently employed full-time with IT Consulting and Services (ITCS) as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nIT Consulting and Services (ITCS) has no objection to {{pronounObject}} pursuing {{purpose}}.\n\nThis certificate is issued at the specific request of the employee and does not constitute any financial liability on ITCS.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`
                },
                'Character Certificate': {
                    subject: 'CHARACTER CERTIFICATE',
                    content: `Date: {{date}}\n\nTo Whom It May Concern,\n\nSubject: Character Certificate – ITCS\n\nThis is to certify that {{salutation}} {{employeeName}}, holding CNIC {{cnic}}, has been associated with IT Consulting and Services (ITCS) as {{designation}} from {{joiningDate}} to {{lastWorkingDay}}.\n\nDuring {{pronounPossessive}} tenure, {{pronounSubject}} has demonstrated excellent moral character, professional integrity, and exemplary conduct. {{pronounCapitalizedSubject}} was not involved in any disciplinary misconduct.\n\nThis certificate is issued upon request of the employee for {{purpose}}.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`
                },
                'Income Verification Letter': {
                    subject: 'INCOME VERIFICATION CERTIFICATE',
                    content: `Date: {{date}}\n\nTo Whom It May Concern,\n\nSubject: Income Verification Certificate – ITCS\n\nThis is to certify that {{salutation}} {{employeeName}} is an active full-time employee at IT Consulting and Services (ITCS), working as {{designation}} in the {{department}} department since {{joiningDate}}.\n\nFinancial Summary:\n• Basic Salary: PKR {{basicSalary}} per month\n• Monthly Allowances: PKR {{allowances}}\n• Monthly Gross Salary: PKR {{grossSalary}}\n• Monthly Net Pay: PKR {{netPay}}\n• Payment Method: {{paymentMethod}}\n\nThis income verification certificate is issued upon official request for {{purpose}} and is valid as of the date of issuance.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`
                },
                'Experience Letter': {
                    subject: 'EXPERIENCE LETTER',
                    content: `Date: {{date}}\n\nTo Whom It May Concern,\n\nSubject: Experience Certificate – ITCS\n\nI am writing to confirm that {{employeeName}} was employed with IT Consulting and Services (ITCS) as {{designation}} from {{joiningDate}} to {{lastWorkingDay}}.\n\nDuring {{pronounPossessive}} tenure, {{employeeName}} consistently demonstrated {{skills}} in {{designation}} management. {{pronounCapitalizedSubject}} played a key role in overseeing {{jobResponsibilities}}.\n\n{{employeeName}}'s dedication and commitment significantly contributed to strengthening our {{department}} division and fostering a positive work environment. {{pronounCapitalizedPossessive}} ability to effectively manage {{generalJobDescription}} made {{pronounObject}} a crucial element in the success of the organization.\n\nWe are confident that {{employeeName}}'s skills, experience, and dedication will continue to serve {{pronounObject}} well in future endeavors. We wish {{pronounObject}} every success in professional career.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`
                },
                'Employment Certificate': {
                    subject: 'EMPLOYMENT VERIFICATION CERTIFICATE',
                    content: `Date: {{date}}\n\nTo Whom It May Concern,\n\nSubject: Employment Verification Certificate – ITCS\n\nThis is to certify that {{salutation}} {{employeeName}} (CNIC: {{cnic}}) is currently employed with IT Consulting and Services (ITCS) as {{designation}} in the {{department}} department since {{joiningDate}}.\n\n• Current Designation: {{designation}}\n• Department: {{department}}\n• Date of Joining: {{joiningDate}}\n• Monthly Gross Salary: PKR {{grossSalary}}\n\nThis certificate is issued upon request of the employee for {{purpose}}.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`
                },
                'Internship Completion Certificate': {
                    subject: 'INTERNSHIP COMPLETION CERTIFICATE',
                    content: `Date: {{date}}\n\nTo Whom It May Concern,\n\nSubject: Internship Completion Certificate – ITCS\n\nThis is to certify that {{salutation}} {{employeeName}} has successfully completed an internship as {{designation}} in the {{department}} department at IT Consulting and Services (ITCS) from {{joiningDate}} to {{lastWorkingDay}}.\n\nDuring {{pronounPossessive}} internship, {{pronounSubject}} worked on {{jobResponsibilities}} and displayed commendable enthusiasm and learning aptitude.\n\nWe found {{pronounPossessive}} conduct to be exemplary, and we wish {{pronounObject}} continued success in future academic and professional endeavors.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`
                },
                'Relieving Letter': {
                    subject: 'RELIEVING LETTER',
                    content: `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Relieving Letter – ITCS\n\nDear {{salutation}} {{employeeName}},\n\nThis refers to your resignation from IT Consulting and Services (ITCS). You are hereby relieved of your responsibilities as {{designation}} in the {{department}} department effective from {{lastWorkingDay}}.\n\nAll dues, including full and final settlement, will be processed in accordance with company policy within {{settlementDays}} days.\n\nWe thank you for your contributions during your tenure and wish you the best of luck for the future.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`
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
            size: 'A4',
            margins: {
                top: 105,
                bottom: 55,
                left: 48,
                right: 48
            }
        });

        // Set response headers to force download / open in browser
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${documentType.replace(/\s+/g, '_')}_${employee.employeeId}.pdf"`);
        doc.pipe(res);


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
            date: formatOrdinalDate(issueDate),
            stipend: req.body.customVars?.stipend || req.body.customVars?.grossSalary || singleGrossSal || (totalGrossSalary !== undefined ? String(totalGrossSalary) : (basicSalaryAmount !== undefined ? String(basicSalaryAmount) : '20,000')),
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
            workLocation: employee.jobInfo?.workLocation || employee.address?.city || 'Karachi',
            officeLocation: employee.jobInfo?.workLocation || employee.address?.city || 'Karachi',
            location: employee.jobInfo?.workLocation || employee.address?.city || 'Karachi',
            paymentDate: req.body.customVars?.paymentDate || '5th',
            startTime: '09:00 AM',
            endTime: '06:00 PM',
            city: employee.address?.city || employee.jobInfo?.workLocation || 'Karachi',
            personalCity: employee.address?.city || 'Karachi',
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
            grossSalaryWords: numberToWords(Number(String(req.body.customVars?.grossSalary || singleGrossSal || totalGrossSalary || 0).replace(/[^0-9]/g, ''))),
            signatoryName: req.body.customVars?.signatoryName || ((rawDocType || '').toLowerCase().includes('appointment') ? (company?.ceoSignatoryName || 'Founder & CEO') : (company?.hrSignatoryName || 'Manager HR')),
            signatoryDesignation: req.body.customVars?.signatoryDesignation || ((rawDocType || '').toLowerCase().includes('appointment') ? (company?.ceoSignatoryTitle || 'Chief Executive Officer') : (company?.hrSignatoryTitle || 'Human Resources')),
            hrEmail: company?.contact?.email || 'info@itcs.com.pk',
            hrPhone: company?.contact?.phone || '+92 21 111-482-711',
            ...(req.body.customVars || {}),
            ...(req.body.variables || {})
        };

        // Essential tags that cannot be generated without identifying the employee
        const STRICT_CRITICAL_TAGS = new Set([
            'employeeName', 'employeeId', 'internName'
        ]);

        // Default fallbacks for non-critical tags so document generation does not fail
        const FALLBACK_DEFAULTS: Record<string, string> = {
            fatherName: '—',
            address: '—',
            phone: '—',
            cnic: '—',
            personalEmail: '—',
            workEmail: '—',
            workLocation: 'Islamabad Office',
            officeLocation: 'Islamabad Office',
            city: 'Islamabad',
            personalCity: 'Islamabad',
            reportingManager: 'Head of Department',
            department: 'Operations',
            designation: 'Staff',
            joiningDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            lastWorkingDay: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            bankName: '—',
            bankAccountNumber: '—',
            bankIban: '—',
            basicSalary: '0',
            grossSalary: '0',
            netPay: '0',
            allowances: '0',
            taxAmount: '0',
            otherDeductions: '0',
            totalDeductions: '0',
            purpose: purposeText || 'Official Verification',
            purposeDetail: purposeText || 'Official Verification',
            probationSalary: '0',
            confirmedSalary: '0'
        };

        // Scan template.content to find ALL tags used in this template
        const templateContent = template.content || '';
        const tagMatches = templateContent.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
        const usedTags = Array.from(new Set(Array.from(tagMatches).map((m: any) => m[1])));

        // Apply fallbacks for non-critical tags that are empty
        usedTags.forEach(tag => {
            if (vars[tag] === undefined || vars[tag] === null || vars[tag] === '') {
                if (FALLBACK_DEFAULTS[tag]) {
                    vars[tag] = FALLBACK_DEFAULTS[tag];
                } else {
                    vars[tag] = '—';
                }
            }
        });

        // Filter out only STRICT critical tags that are missing
        const missingCriticalTags = usedTags.filter(tag => {
            if (!STRICT_CRITICAL_TAGS.has(tag)) return false;
            const val = vars[tag];
            return val === undefined || val === null || val === '';
        });

        if (missingCriticalTags.length > 0) {
            const TAG_LABELS: Record<string, string> = {
                employeeId: 'Employee ID',
                employeeName: 'Employee Name',
                internName: 'Intern Name'
            };

            const missingLabels = missingCriticalTags.map(t => TAG_LABELS[t] || t);

            if (isHrOrAdmin) {
                return res.status(400).json({
                    code: 'MISSING_TEMPLATE_DETAILS',
                    userRole: 'admin',
                    message: `The following required employee details are missing to generate '${template.subject || documentType}': ${missingLabels.join(', ')}. Please update the employee profile to proceed.`,
                    missingFields: missingCriticalTags,
                    missingLabels
                });
            } else {
                return res.status(400).json({
                    code: 'MISSING_TEMPLATE_DETAILS',
                    userRole: 'employee',
                    message: `Your profile is missing details required for this document (${missingLabels.join(', ')}). Please contact HR to update your profile before generating this document.`,
                    missingFields: missingCriticalTags,
                    missingLabels
                });
            }
        }

        renderCompleteDocument(
            doc,
            documentType,
            template,
            vars,
            company,
            verifyUrl,
            qrCodeDataUri
        );

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
            grossSalaryWords: 'Three Hundred Thousand only',
            signatoryName: (templateData?.documentType || '').toLowerCase().includes('appointment') ? (companyData?.ceoSignatoryName || 'Founder & CEO') : (companyData?.hrSignatoryName || 'Manager HR'),
            signatoryDesignation: (templateData?.documentType || '').toLowerCase().includes('appointment') ? (companyData?.ceoSignatoryTitle || 'Chief Executive Officer') : (companyData?.hrSignatoryTitle || 'Human Resources'),
            hrEmail: companyData?.contact?.email || 'info@itcs.com.pk',
            hrPhone: companyData?.contact?.phone || '+92 21 111-482-711',
            city: 'Karachi',
            workLocation: 'Karachi',
            location: 'Karachi',
            paymentDate: '5th',
            startTime: '09:00 AM',
            endTime: '06:00 PM',
            noticePeriod: '30 Days',
            stipend: 'PKR 20,000'
        };

        const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/preview-placeholder-id`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        const doc = new PDFDocument({
            size: 'A4',
            margins: {
                top: 105,
                bottom: 55,
                left: 48,
                right: 48
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
        doc.pipe(res);

        renderCompleteDocument(
            doc,
            templateData?.documentType || 'Document',
            templateData || { subject: 'OFFICIAL DOCUMENT', content: 'Configure template letter content body details...' },
            dummyVars,
            companyData,
            verifyUrl,
            qrCodeDataUri
        );

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

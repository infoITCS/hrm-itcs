import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import OfficialDocument from '../models/OfficialDocument';
import DocumentDispatchLog from '../models/DocumentDispatchLog';
import Employee from '../models/Employee';
import Payslip from '../models/Payslip';
import Company from '../models/Company';
import DocumentTemplate from '../models/DocumentTemplate';
import LeaveType from '../models/LeaveType';
import LeaveBalance from '../models/LeaveBalance';
import WorkflowTask from '../models/WorkflowTask';
import User from '../models/User.model';
import { authenticate, AuthRequest, checkProfileLock } from '../middleware/auth';
import { formatEmployeeFullName } from '../utils/nameHelper';
import { decryptEmployeeFields } from '../utils/encryption';
import { dispatchEmail } from '../utils/email';
import logger from '../utils/logger';

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



// Helper to parse probation period strings cleanly without digit concatenation bugs
function parseProbation(val: any): { days: string; months: string; formatted: string } {
    const str = String(val || '').trim();
    if (!str) return { days: '90', months: '3', formatted: '3 Months (90 Days)' };

    // Explicitly look for days and months labels with independent captures
    const daysMatch = str.match(/(\d+)\s*days?/i);
    const monthsMatch = str.match(/(\d+)\s*months?/i);

    let days = '';
    let months = '';

    if (daysMatch && monthsMatch) {
        months = monthsMatch[1];
        days = daysMatch[1];
    } else if (daysMatch) {
        days = daysMatch[1];
        months = String(Math.max(1, Math.round(Number(days) / 30)));
    } else if (monthsMatch) {
        months = monthsMatch[1];
        days = String(Number(months) * 30);
    } else {
        const firstNumMatch = str.match(/\d+/);
        if (firstNumMatch) {
            const num = Number(firstNumMatch[0]);
            if (num <= 12) {
                months = String(num);
                days = String(num * 30);
            } else {
                days = String(num);
                months = String(Math.max(1, Math.round(num / 30)));
            }
        } else {
            months = '3';
            days = '90';
        }
    }

    return {
        days,
        months,
        formatted: `${months} Months (${days} Days)`
    };
}

function parseTemplate(content: string, vars: Record<string, string>): string {
    const prob = parseProbation(vars.probationPeriod || vars.probationDays || '3 Months (90 Days)');
    const cleanProbDays = (vars.probationDays && Number(vars.probationDays) <= 365 && !String(vars.probationDays).includes('Month')) ? String(vars.probationDays) : prob.days;
    const cleanProbMonths = (vars.probationMonths && Number(vars.probationMonths) <= 12) ? String(vars.probationMonths) : prob.months;

    const defaults: Record<string, string> = {
        employmentType: 'Full-Time',
        workingDays: 'Monday to Friday',
        workingHours: '09:00 AM - 06:00 PM',
        startTime: '09:00 AM',
        endTime: '06:00 PM',
        workLocation: 'Karachi, Pakistan',
        location: 'Karachi, Pakistan',
        city: 'Karachi',
        personalCity: 'Karachi',
        probationDays: cleanProbDays,
        probationMonths: cleanProbMonths,
        probationPeriod: `${cleanProbMonths} Months (${cleanProbDays} Days)`,
        companyResources: 'Official Laptop, Corporate Email Account, and Access Credentials',
        taxCondition: 'Subject to applicable income tax laws and statutory tax brackets',
        commissionStructure: 'Performance-based quarterly bonuses as per company policy',
        benefitsList: 'Meal Allowance, Health Insurance / OPD Reimbursement, Provident Fund, Performance Bonuses',
        noticePeriod: '30 Days',
        probationNoticePeriod: '15 Days',
        confirmedNoticePeriod: '30 Days',
        acceptanceValidityDays: '7',
        probationDaysWords: 'Ninety',
        settlementDays: '30',
        paymentDate: '5th',
        salutation: '',
        cnic: '—',
        stipend: '20,000',
        internshipDuration: '3 Months',
        duration: '3 Months',
        pronounSubject: 'he',
        pronounObject: 'him',
        pronounPossessive: 'his',
        pronounCapitalizedSubject: 'He',
        pronounCapitalizedPossessive: 'His',
        skills: 'technical competence, leadership, and professional diligence',
        generalJobDescription: 'core deliverables and engineering excellence',
        purpose: 'official verification and record purposes'
    };

    const merged: Record<string, string> = { ...defaults, ...vars };

    let output = content;
    for (const [key, val] of Object.entries(merged)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        output = output.replace(regex, val !== undefined && val !== null ? String(val) : '');
    }

    // Bracketed placeholders fallback (e.g. [Location], [Payment Date], [Probation Days], [Notice Period], etc.)
    const bracketReplacements: Record<string, string> = {
        'location': merged.workLocation || merged.city || 'Karachi',
        'work location': merged.workLocation || merged.city || 'Karachi',
        'payment date': merged.paymentDate || '5th',
        'probation days': merged.probationDays || '90',
        'probation period': `${merged.probationMonths} Months (${merged.probationDays} Days)`,
        'notice period': merged.noticePeriod || '30 Days',
        'working days': merged.workingDays || 'Monday to Friday',
        'working hours': merged.workingHours || '09:00 AM - 06:00 PM',
        'start time': merged.startTime || '09:00 AM',
        'end time': merged.endTime || '06:00 PM',
        'authorized signatory name': merged.signatoryName || 'Authorized Signatory',
        'designation': merged.designation || merged.signatoryDesignation || 'Authorized Signatory',
        'signatory designation': merged.signatoryDesignation || 'Authorized Signatory',
        'reporting manager': merged.reportingManager || '',
        'employee name': merged.employeeName || '',
        'basic salary': merged.basicSalary || '',
        'gross salary': merged.grossSalary || '',
        'salary': merged.basicSalary || merged.grossSalary || '',
        'joining date': merged.joiningDate || '',
        'stipend': merged.stipend || merged.grossSalary || '20,000',
        'cnic': merged.cnic || '',
        'department': merged.department || '',
        'date': merged.date || ''
    };

    // Also map any key from merged directly to bracket replacement
    for (const [key, val] of Object.entries(merged)) {
        const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
        if (!bracketReplacements[spaced]) {
            bracketReplacements[spaced] = val;
        }
        if (!bracketReplacements[key.toLowerCase()]) {
            bracketReplacements[key.toLowerCase()] = val;
        }
    }

    for (const [bKey, bVal] of Object.entries(bracketReplacements)) {
        const escaped = bKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexBracket = new RegExp(`\\[\\s*${escaped}\\s*\\]`, 'gi');
        output = output.replace(regexBracket, bVal);
    }

    // Strip parenthetical legal quote labels: ("Contract"), ("the Company"), ("the Employee")
    output = output.replace(/\s*\(["“']?Contract["”']?\)/gi, '');
    output = output.replace(/\s*\(["“']?the Company["”']?\)/gi, '');
    output = output.replace(/\s*\(["“']?the Employee["”']?\)/gi, '');

    // Normalize phrasing & grammar glitches
    output = output.replace(/(\d+)\s*Days\s*\(\s*(\d+)\s*Months\s*\)/gi, (_match, d, m) => {
        const p = parseProbation(`${m} Months (${d} Days)`);
        return `${p.months} Months (${p.days} Days)`;
    });
    output = output.replace(/(\d+)\s*Months\s*\(\s*(\d+)\s*Days\s*\)\s*Days/gi, '$1 Months ($2 Days)');
    output = output.replace(/\b(\d+\s*Days?)\s+Days?\b/gi, '$1');
    output = output.replace(/\b(Days)\s+Days\b/gi, '$1');
    output = output.replace(/(\d+\s*Months?\s*\(\d+\s*Days\))-day\b/gi, '3-month (90-day)');
    output = output.replace(/(\d+)\s*Days-day\b/gi, '$1-day');
    output = output.replace(/(Pakistan\s*,\s*)+Pakistan/gi, 'Pakistan');

    // Clean up any stray spaces or newlines right before punctuation marks
    output = output.replace(/\s+([,.;:!?])/g, '$1');
    output = output.replace(/\*\*\s+([,.;:!?])/g, '**$1');
    output = output.replace(/\s+\*\*(?=[,.;:!?])/g, '**');

    // Safety sweeper: If any unknown {{placeholder}} remains, replace with fallback or clean empty text
    output = output.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, token) => {
        if (defaults[token]) return defaults[token];
        return '';
    });

    return output;
}

// Helper to format currency number cleanly with commas (e.g. 68115.4 -> 68,115)
const formatSalaryNum = (val: any): string => {
    if (!val && val !== 0) return '';
    const clean = String(val).replace(/,/g, '').trim();
    const num = Number(clean);
    if (!isNaN(num) && num > 0) {
        return Math.round(num).toLocaleString('en-US');
    }
    return String(val);
};

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

// Helper to register and use clean modern sans-serif fonts (Inter / Roboto)
function ensureModernFonts(doc: any): { regular: string; bold: string } {
    try {
        const candidateDirs = [
            path.join(__dirname, '../assets/fonts'),
            path.join(__dirname, '../../assets/fonts'),
            path.join(__dirname, 'assets/fonts')
        ];
        for (const dir of candidateDirs) {
            const interReg = path.join(dir, 'Inter-Regular.ttf');
            const interBold = path.join(dir, 'Inter-Bold.ttf');
            if (fs.existsSync(interReg) && fs.existsSync(interBold)) {
                try {
                    doc.registerFont('Inter', interReg);
                    doc.registerFont('Inter-Bold', interBold);
                    return { regular: 'Inter', bold: 'Inter-Bold' };
                } catch {
                    return { regular: 'Inter', bold: 'Inter-Bold' };
                }
            }
        }
    } catch (e) {
        console.warn('[PDF Document] Could not load Inter font:', e);
    }
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

// Helper to draw letterhead (branded design matching ITCS official template)
const drawLetterhead = (doc: any, verifyUrl: string, company?: any) => {
    const savedY = doc.y;
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    // 0. High-Fidelity Background Template Underlay (No-Code Background Letterhead)
    const letterheadCandidates = [
        company?.letterheadUrl && company.letterheadUrl.startsWith('data:image/') ? company.letterheadUrl : null,
        company?.letterheadUrl ? path.join(__dirname, '../../', company.letterheadUrl) : null,
        company?.letterheadUrl ? path.join(__dirname, '../', company.letterheadUrl) : null,
        company?.letterheadUrl || null,
        path.join(__dirname, '../../uploads/itcs_official_letterhead.png'),
        path.join(__dirname, '../../../uploads/itcs_official_letterhead.png'),
        path.join(__dirname, '../uploads/itcs_official_letterhead.png'),
        path.join(__dirname, 'uploads/itcs_official_letterhead.png'),
        path.join(__dirname, '../../uploads/letterhead.png')
    ].filter(Boolean) as string[];

    let letterheadDrawn = false;
    for (const p of letterheadCandidates) {
        if (p.startsWith('data:image/')) {
            try {
                const base64Data = p.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                doc.image(buffer, 0, 0, { width: doc.page.width, height: doc.page.height });
                letterheadDrawn = true;
                break;
            } catch (err) {
                console.error('Error drawing base64 background letterhead:', err);
            }
        } else if (fs.existsSync(p)) {
            try {
                doc.image(p, 0, 0, { width: doc.page.width, height: doc.page.height });
                letterheadDrawn = true;
                break;
            } catch (err) {
                console.error('Error drawing image background letterhead:', err);
            }
        }
    }

    if (letterheadDrawn) {
        // Official background underlay drawn: already contains logo, top-right origami graphics, and footer banner!
        doc.page.margins.bottom = oldBottomMargin;
        doc.y = savedY;
        return;
    }

    const darkPurple = company?.branding?.primaryColor || '#2B0938';
    const plumMid = '#3B1047';
    const magentaAccent = company?.branding?.secondaryColor || '#5E1568';

    // 1. Logo (Top-Left) with Outer Margin (x = 40)
    let logoDrawn = false;
    const outerMargin = 40;
    if (company?.logoUrl && company.logoUrl.startsWith('data:image/')) {
        try {
            const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            doc.image(buffer, outerMargin, 20, { width: 140, height: 60, fit: [140, 60] });
            logoDrawn = true;
        } catch (err) {
            console.error('Error rendering base64 company logo in letterhead:', err);
        }
    }

    if (!logoDrawn) {
        const candidatePaths = [
            company?.logoUrl ? path.join(__dirname, '../../', company.logoUrl) : null,
            company?.logoUrl ? company.logoUrl : null,
            path.join(__dirname, '../../uploads/logo.png'),
            path.join(__dirname, '../../../client/src/assets/logo.png'),
            path.join(__dirname, '../../../client/public/logo.png')
        ].filter(Boolean) as string[];

        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                try {
                    doc.image(p, outerMargin, 20, { width: 140, height: 60, fit: [140, 60] });
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
        doc.fontSize(18).font('Helvetica-Bold').fillColor(darkPurple).text(companyName.toUpperCase(), outerMargin, 35);
    }

    // 2. Top-Right Geometric Purple Decoration (ITCS Official Origami Ribbon - Exact Match)
    const cDark = company?.branding?.primaryColor || '#1D1139';    // Main upper midnight plum
    const cStripe = '#60195B';                                    // Upper diagonal bevel stripe & crease shadow
    const cMagenta = company?.branding?.secondaryColor || '#761F6E'; // Lower folded wing

    const W = doc.page.width;

    // Facet 1: Upper Main Dark Body (#1D1139) with downward-pointing 'V' angle
    doc.save()
       .moveTo(W - 90, 0)
       .lineTo(W, 0)
       .lineTo(W, 48)
       .lineTo(W - 14, 60)
       .closePath()
       .fill(cDark)
       .restore();

    // Facet 2: Upper Diagonal Stripe & Crease Shadow (#60195B)
    doc.save()
       .moveTo(W - 105, 0)
       .lineTo(W - 90, 0)
       .lineTo(W - 14, 60)
       .lineTo(W - 42, 95)
       .lineTo(W - 42, 50)
       .closePath()
       .fill(cStripe)
       .restore();

    // Facet 3: Lower Folded Magenta Wing (#761F6E)
    doc.save()
       .moveTo(W - 42, 95)
       .lineTo(W - 14, 60)
       .lineTo(W, 48)
       .lineTo(W, 142)
       .closePath()
       .fill(cMagenta)
       .restore();

    // 3. Spaced Subtext above Banner
    doc.fillColor('#475569')
       .fontSize(7.5)
       .font('Helvetica-Bold')
       .text('I T C S   ( I T   C O N S U L T I N G   &   S E R V I C E S )', 40, doc.page.height - 47, { align: 'center', width: doc.page.width - 80, lineBreak: false });

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
    const compEmail = (company?.contact?.email || 'INFO@ITCS.COM.PK').toUpperCase();
    const envX = 42;
    const envY = bannerY + 6;
    doc.save()
       .rect(envX, envY, 11, 7).strokeColor('#FFFFFF').lineWidth(0.8).stroke()
       .moveTo(envX, envY).lineTo(envX + 5.5, envY + 3.5).lineTo(envX + 11, envY).stroke()
       .restore();
    doc.fillColor('#FFFFFF').fontSize(6).font('Helvetica-Bold')
       .text(compEmail, 5, bannerY + 16, { width: 85, align: 'center', lineBreak: false });

    // Right Phone Icon (Phone vector) + number
    const compPhone = company?.contact?.phone || '+92 21 111-482-711';
    const phX = doc.page.width - 50;
    const phY = bannerY + 5;
    doc.save()
       .roundedRect(phX, phY, 7, 10, 1).strokeColor('#FFFFFF').lineWidth(0.8).stroke()
       .circle(phX + 3.5, phY + 7.5, 0.5).fillColor('#FFFFFF').fill()
       .restore();
    doc.fillColor('#FFFFFF').fontSize(6).font('Helvetica-Bold')
       .text(compPhone, doc.page.width - 90, bannerY + 16, { width: 85, align: 'center', lineBreak: false });

    // Middle Office Addresses (3 exact lines matching Image 1)
    const addrY = bannerY + 4;
    const addrWidth = doc.page.width - 220;
    const addrX = 110;

    const renderAddrLine = (city: string, text: string, yPos: number) => {
        doc.font('Helvetica-Bold').fontSize(5.8).fillColor('#FFFFFF');
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

    renderAddrLine('', 'Karachi: 6/K Block 2, P.E.C.H.S, Near Model School Karachi Pakistan', addrY + 1.5);
    renderAddrLine('', 'Lahore: Office 32, 1st Floor, I.T Tower 73-E/1, Hali Rd, Block A Gulberg III', addrY + 9.5);
    renderAddrLine('', 'Islamabad: Office # 14, Ground Floor, Malik Plaza F-8 Markaz', addrY + 17.5);

    // Restore text defaults and saved layout position
    doc.page.margins.bottom = oldBottomMargin;
    doc.y = savedY;
    doc.fillColor('#1E293B').font('Helvetica').fontSize(10);
};

// Inline rich markdown renderer (**bold text**)
function renderRichText(
    doc: any,
    text: string,
    options: { x?: number; width?: number; fontSize?: number; fontColor?: string; lineGap?: number; align?: string; characterSpacing?: number } = {}
) {
    const fonts = ensureModernFonts(doc);
    const defaultMargin = 64;
    const x = options.x !== undefined ? options.x : defaultMargin;
    const width = options.width || (doc.page.width - defaultMargin * 2);
    const fontSize = options.fontSize || 9.5;
    const fontColor = options.fontColor || '#000000';
    const lineGap = options.lineGap !== undefined ? options.lineGap : 1.0; // compact 1.2 line-height
    const align = options.align || 'left';
    const characterSpacing = options.characterSpacing !== undefined ? options.characterSpacing : 0.1; // 0.01em normal letter spacing

    let cleanText = text.replace(/\s+([,.;:!?])/g, '$1')
                        .replace(/\*\*\s+([,.;:!?])/g, '**$1')
                        .replace(/\s+\*\*(?=[,.;:!?])/g, '**');

    if (!cleanText.includes('**')) {
        doc.fontSize(fontSize).font(fonts.regular).fillColor(fontColor).text(cleanText, x, doc.y, {
            width,
            align,
            lineGap,
            characterSpacing
        });
        return;
    }

    const parts: { text: string; bold: boolean }[] = [];
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cleanText)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: cleanText.substring(lastIndex, match.index), bold: false });
        }
        parts.push({ text: match[1], bold: true });
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < cleanText.length) {
        parts.push({ text: cleanText.substring(lastIndex), bold: false });
    }

    // Fix punctuation spacing: attach any immediately following punctuation mark to the preceding token
    // so PDFKit wraps the word and punctuation together as an atomic unit and never leaves the comma alone on the next line.
    for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i].bold && parts[i + 1] && !parts[i + 1].bold) {
            const punctMatch = parts[i + 1].text.match(/^([,.;:!?]+)/);
            if (punctMatch) {
                const punct = punctMatch[1];
                parts[i].text += punct;
                parts[i + 1].text = parts[i + 1].text.substring(punct.length);
            }
        }
    }

    doc.fontSize(fontSize).fillColor(fontColor);
    for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        doc.font(parts[i].bold ? fonts.bold : fonts.regular)
           .text(parts[i].text, i === 0 ? x : undefined, i === 0 ? doc.y : undefined, {
               continued: !isLast,
               width,
               align,
               lineGap,
               characterSpacing
           });
    }
}

// Helper to render bullet points or key-value lines
function renderBulletOrKeyValue(doc: any, line: string, options: { x?: number; width?: number; fontSize?: number } = {}) {
    const fonts = ensureModernFonts(doc);
    const defaultMargin = 64;
    const startX = options.x || (defaultMargin + 16);
    const width = options.width || (doc.page.width - startX - defaultMargin);
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
            doc.moveDown(0.2);
            doc.fontSize(10).font(fonts.bold).fillColor('#000000')
               .text(key + ':', defaultMargin, doc.y, { align: 'left', characterSpacing: 0.1 });
            doc.moveDown(0.15);
            return;
        }

        doc.fontSize(fontSize).font(fonts.bold).fillColor('#000000')
           .text('• ', startX, doc.y, { continued: true, characterSpacing: 0.1 });
        doc.font(fonts.bold).fillColor('#000000')
           .text(key + ': ', { continued: true, characterSpacing: 0.1 });
        doc.font(fonts.regular).fillColor('#000000')
           .text(val, { width, continued: false, lineGap: 1.0, characterSpacing: 0.1 });
    } else {
        doc.fontSize(fontSize).font(fonts.bold).fillColor('#000000')
           .text('• ', startX, doc.y, { continued: true, characterSpacing: 0.1 });
        doc.font(fonts.regular).fillColor('#000000')
           .text(cleanLine.replace(/\*\*/g, ''), { width, continued: false, lineGap: 1.0, characterSpacing: 0.1 });
    }
    doc.moveDown(0.12);
}

// Dedicated Tabular Pay Slip Document Renderer
const renderPayslipTabularDocument = (
    doc: any,
    vars: Record<string, string>,
    company: any,
    qrCodeDataUri: string,
    fonts: any,
    textMargin: number,
    textWidth: number,
    docTitle: string
) => {
    // 1. Title: Left-aligned at inside text margin, Deep Ocean Teal (#136384), bold uppercase
    doc.y = 115;
    doc.fontSize(16)
       .font(fonts.bold)
       .fillColor('#136384')
       .text(docTitle, textMargin, 115, { align: 'left', lineBreak: false, characterSpacing: 0.1 });

    // 2. Date and Recipient Header
    const dateY = 142;
    doc.fontSize(9.5).font(fonts.bold).fillColor('#000000')
       .text('Date: ', textMargin, dateY, { continued: true, characterSpacing: 0.1 });
    doc.font(fonts.regular).fillColor('#000000').text(vars.date || formatOrdinalDate(new Date()), { continued: false, characterSpacing: 0.1 });

    const recipientName = vars.employeeName || 'Employee';
    const recipientCity = vars.city || vars.personalCity || vars.workLocation || 'Karachi';
    const recipientEmail = vars.personalEmail || vars.workEmail || '';

    const rightBoxWidth = 240;
    const rightBoxX = doc.page.width - textMargin - rightBoxWidth;
    doc.fontSize(10).font(fonts.bold).fillColor('#000000')
       .text(`To: ${recipientName}`, rightBoxX, 142, { width: rightBoxWidth, align: 'right', characterSpacing: 0.1 });
    doc.fontSize(9).font(fonts.regular).fillColor('#475569')
       .text(`${recipientCity}, Pakistan`, rightBoxX, doc.y, { width: rightBoxWidth, align: 'right', characterSpacing: 0.1 });
    if (recipientEmail && recipientEmail !== '—') {
        doc.fontSize(9).font(fonts.regular).fillColor('#475569')
           .text(`Email: ${recipientEmail}`, rightBoxX, doc.y, { width: rightBoxWidth, align: 'right', characterSpacing: 0.1 });
    }

    // 3. Subtitle
    const startY = 195;
    doc.fontSize(11).font(fonts.bold).fillColor('#0F172A')
       .text(`Salary Pay Slip — ${vars.payPeriod || 'Monthly Salary'}`, textMargin, startY, { characterSpacing: 0.1 });

    // 4. Table 1: Employee & Payment Details Box
    const boxY = startY + 18;
    const boxHeight = 65;
    doc.roundedRect(textMargin, boxY, textWidth, boxHeight, 4)
       .fillAndStroke('#F8FAFC', '#E2E8F0');

    const col1X = textMargin + 12;
    const col2X = textMargin + 230;
    const rowGap = 14;

    // Row 1
    doc.fontSize(8.5).font(fonts.bold).fillColor('#475569').text('Employee Name: ', col1X, boxY + 8, { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text(vars.employeeName || '—', { lineBreak: false });
    doc.font(fonts.bold).fillColor('#475569').text('Pay Period: ', col2X, boxY + 8, { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text(vars.payPeriod || '—', { lineBreak: false });

    // Row 2
    doc.font(fonts.bold).fillColor('#475569').text('Employee ID: ', col1X, boxY + 8 + rowGap, { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text(vars.employeeId || '—', { lineBreak: false });
    doc.font(fonts.bold).fillColor('#475569').text('Date of Issue: ', col2X, boxY + 8 + rowGap, { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text(vars.date || '—', { lineBreak: false });

    // Row 3
    doc.font(fonts.bold).fillColor('#475569').text('Designation: ', col1X, boxY + 8 + (rowGap * 2), { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text(vars.designation || '—', { lineBreak: false });
    doc.font(fonts.bold).fillColor('#475569').text('Payment Method: ', col2X, boxY + 8 + (rowGap * 2), { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text('Bank Transfer', { lineBreak: false });

    // Row 4
    const resolvedBankAccount = vars.bankAccountNumber 
        ? (vars.bankName ? `${vars.bankName} - ${vars.bankAccountNumber}` : vars.bankAccountNumber) 
        : (vars.bankAccount || 'Direct Deposit');
    doc.font(fonts.bold).fillColor('#475569').text('Department: ', col1X, boxY + 8 + (rowGap * 3), { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text(vars.department || '—', { lineBreak: false });
    doc.font(fonts.bold).fillColor('#475569').text('Bank Account: ', col2X, boxY + 8 + (rowGap * 3), { continued: true, lineBreak: false });
    doc.font(fonts.regular).fillColor('#0F172A').text(resolvedBankAccount, { lineBreak: false });

    // 5. Table 2: Earnings & Deductions Breakdown
    const tableY = boxY + boxHeight + 14;
    const colWidth = Math.floor((textWidth - 12) / 2);
    const dedX = textMargin + colWidth + 12;

    // Headers
    doc.roundedRect(textMargin, tableY, colWidth, 22, 3).fill('#0F766E'); // Deep Teal
    doc.roundedRect(dedX, tableY, colWidth, 22, 3).fill('#1E293B');      // Slate Dark

    doc.fontSize(8.5).font(fonts.bold).fillColor('#FFFFFF');
    doc.text('EARNINGS', textMargin + 10, tableY + 6);
    doc.text('AMOUNT (PKR)', textMargin, tableY + 6, { align: 'right', width: colWidth - 10 });

    doc.text('DEDUCTIONS', dedX + 10, tableY + 6);
    doc.text('AMOUNT (PKR)', dedX, tableY + 6, { align: 'right', width: colWidth - 10 });

    let rowY = tableY + 22;
    const rowH = 19;

    const cleanPkr = (val: string | undefined): string => {
        if (!val || val === '—') return '0';
        const stripped = String(val).replace(/^PKR\s*/i, '').trim();
        return stripped || '0';
    };

    const earningsItems = [
        { label: 'Basic Salary', val: `PKR ${cleanPkr(vars.basicSalary)}` },
        { label: 'Normal Allowances', val: `PKR ${cleanPkr(vars.allowances)}` },
        { label: 'Reimbursed Expense Claims', val: `PKR ${cleanPkr(vars.reimbursedClaims)}` }
    ];

    const deductionsItems = [
        { label: 'Income Tax', val: `PKR ${cleanPkr(vars.taxAmount)}` },
        { label: 'Other Deductions', val: `PKR ${cleanPkr(vars.otherDeductions)}` },
        { label: 'Loan / Advance Deductions', val: 'PKR 0' }
    ];

    for (let i = 0; i < 3; i++) {
        const bg = (i % 2 === 0) ? '#FFFFFF' : '#F8FAFC';
        doc.rect(textMargin, rowY, colWidth, rowH).fillAndStroke(bg, '#E2E8F0');
        doc.rect(dedX, rowY, colWidth, rowH).fillAndStroke(bg, '#E2E8F0');

        doc.fontSize(8.5).font(fonts.regular).fillColor('#1E293B');
        // Earnings row
        doc.text(earningsItems[i].label, textMargin + 10, rowY + 5, { width: colWidth - 85 });
        doc.text(earningsItems[i].val, textMargin, rowY + 5, { align: 'right', width: colWidth - 10 });

        // Deductions row
        doc.text(deductionsItems[i].label, dedX + 10, rowY + 5, { width: colWidth - 85 });
        doc.text(deductionsItems[i].val, dedX, rowY + 5, { align: 'right', width: colWidth - 10 });

        rowY += rowH;
    }

    // Totals Row
    doc.rect(textMargin, rowY, colWidth, 22).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.rect(dedX, rowY, colWidth, 22).fillAndStroke('#F1F5F9', '#CBD5E1');

    doc.fontSize(8.5).font(fonts.bold).fillColor('#0F172A');
    doc.text('Total Gross Earnings', textMargin + 10, rowY + 6);
    doc.text(`PKR ${cleanPkr(vars.grossSalary)}`, textMargin, rowY + 6, { align: 'right', width: colWidth - 10 });

    doc.text('Total Deductions', dedX + 10, rowY + 6);
    doc.text(`PKR ${cleanPkr(vars.totalDeductions)}`, dedX, rowY + 6, { align: 'right', width: colWidth - 10 });

    // 6. Net Take-Home Pay Callout Card
    const netY = rowY + 30;
    const netH = 36;
    doc.roundedRect(textMargin, netY, textWidth, netH, 4)
       .fillAndStroke('#F0FDFA', '#0D9488'); // Mint Teal outline

    doc.fontSize(10).font(fonts.bold).fillColor('#0F766E')
       .text('NET SALARY (CREDITED TO BANK ACCOUNT)', textMargin + 14, netY + 8);
    doc.fontSize(8).font(fonts.regular).fillColor('#64748B')
       .text('Official monthly salary disbursed via bank transfer', textMargin + 14, netY + 22);

    doc.fontSize(13.5).font(fonts.bold).fillColor('#0F766E')
       .text(`PKR ${cleanPkr(vars.netPay)}`, textMargin, netY + 10, { align: 'right', width: textWidth - 14 });

    // 7. Official Notice
    const remY = netY + netH + 16;
    doc.fontSize(8).font(fonts.regular).fillColor('#64748B')
       .text('This pay slip is an official electronic record of monthly salary disbursed by IT Consulting and Services (ITCS).', textMargin, remY, { width: textWidth });

    // 8. Signatory & Stamp Block
    const sigY = remY + 28;
    const resolvedSignatoryName = company?.hrSignatoryName || 'Afreen Saeed';
    const resolvedSignatoryTitle = company?.hrSignatoryTitle || 'Manager HR, IT Consulting and Services (ITCS)';
    const targetSigUrl = company?.hrSignatureUrl || company?.signatureUrl || path.join(__dirname, '../../uploads/afreen_signature.jpg');
    const targetStampUrl = company?.stampUrl || path.join(__dirname, '../../uploads/itcs_stamp.jpg');

    doc.fontSize(9.5).font(fonts.regular).fillColor('#000000').text('Sincerely,', textMargin, sigY, { characterSpacing: 0.1 });
    doc.fontSize(10).font(fonts.bold).fillColor('#000000').text(resolvedSignatoryName + ',', textMargin, sigY + 12, { characterSpacing: 0.1 });

    const sigImgY = sigY + 26;
    let sigDrawn = false;
    let stampDrawn = false;

    if (targetSigUrl) {
        sigDrawn = drawImageBufferOrPath(doc, targetSigUrl, textMargin, sigImgY, { height: 32 });
    }
    if (targetStampUrl) {
        stampDrawn = drawImageBufferOrPath(doc, targetStampUrl, sigDrawn ? (textMargin + 75) : textMargin, sigImgY, { height: 32 });
    }

    const titleY = sigImgY + 35;
    doc.fontSize(9.5).font(fonts.bold).fillColor('#000000').text(resolvedSignatoryTitle, textMargin, titleY, { characterSpacing: 0.1 });
    doc.fontSize(9).font(fonts.regular).fillColor('#475569').text('HR & Payroll Department', textMargin, titleY + 12, { characterSpacing: 0.1 });

    // 9. Cryptographic Verification QR Code on right margin opposite signatory
    if (qrCodeDataUri) {
        try {
            const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const qrX = doc.page.width - textMargin - 46;
            doc.image(imageBuffer, qrX, sigImgY - 2, { width: 44, height: 44 });
            doc.fontSize(6.5).font(fonts.regular).fillColor('#64748B')
               .text('Scan to Verify', qrX - 5, sigImgY + 44, { width: 54, align: 'center' });
        } catch (e) {}
    }
};

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

    const fonts = ensureModernFonts(doc);
    const textMargin = 64;
    const textWidth = doc.page.width - (textMargin * 2);

    const docTitle = (template.subject || documentType).toUpperCase();
    const isInternship = docTitle.includes('INTERNSHIP') || documentType.toLowerCase().includes('internship');
    const isPayslip = (documentType || '').toLowerCase().includes('pay slip') || 
                      (documentType || '').toLowerCase().includes('payslip') || 
                      (docTitle === 'PAY SLIP') || 
                      (docTitle === 'SALARY PAY SLIP') ||
                      docTitle.includes('PAY SLIP') || 
                      docTitle.includes('PAYSLIP');

    if (isPayslip) {
        renderPayslipTabularDocument(
            doc,
            vars,
            company,
            qrCodeDataUri,
            fonts,
            textMargin,
            textWidth,
            docTitle
        );
        return;
    }

    // Title: Left-aligned at inside text margin, Deep Ocean Teal (#136384), bold uppercase
    doc.y = 115;
    doc.fontSize(16)
       .font(fonts.bold)
       .fillColor('#136384')
       .text(docTitle, textMargin, 115, { align: 'left', lineBreak: false, characterSpacing: 0.1 });

    // Two-Column Header Block (Date on left, Recipient on right)
    // Left: Date at y = 145 (closer to Title matching Image 1)
    const dateY = 145;
    doc.fontSize(10).font(fonts.bold).fillColor('#000000')
       .text('Date: ', textMargin, dateY, { continued: true, characterSpacing: 0.1 });
    doc.font(fonts.regular).fillColor('#000000').text(vars.date || formatOrdinalDate(new Date()), { continued: false, characterSpacing: 0.1 });

    const isToWhomItMayConcern = 
        (template.content || '').toUpperCase().includes('TO WHOM IT MAY CONCERN') ||
        (documentType || '').toLowerCase().includes('experience') ||
        docTitle.includes('EXPERIENCE') ||
        docTitle.includes('CERTIFICATE') ||
        docTitle.includes('NOC') ||
        docTitle.includes('NO OBJECTION');

    // Right: Recipient block (starts at y = 175, below origami decoration, right-aligned to inside text margin)
    // Only rendered for specific addressee letters (Offer/Appointment/Contract), NOT for To Whom It May Concern / Experience Letters
    const recipientName = vars.employeeName || vars.internName || '';
    const rawCity = vars.city || vars.personalCity || vars.workLocation || 'Karachi';
    const recipientCity = String(rawCity).replace(/,?\s*Pakistan\b/gi, '').trim() || 'Karachi';
    const recipientEmail = vars.personalEmail || vars.workEmail || '';

    let headerBottomY = dateY + 20;
    if (!isToWhomItMayConcern && recipientName && recipientName !== '—') {
        const rightBoxWidth = 240;
        const rightBoxX = doc.page.width - textMargin - rightBoxWidth;
        const recipientY = 175;

        doc.fontSize(10.5).font(fonts.bold).fillColor('#000000')
           .text(`To: ${recipientName}`, rightBoxX, recipientY, { width: rightBoxWidth, align: 'right', characterSpacing: 0.1 });

        doc.fontSize(9.5).font(fonts.regular).fillColor('#000000')
           .text(`${recipientCity}, Pakistan`, rightBoxX, doc.y, { width: rightBoxWidth, align: 'right', characterSpacing: 0.1 });

        if (recipientEmail && recipientEmail !== '—') {
            doc.fontSize(9.5).font(fonts.regular).fillColor('#000000')
               .text(`Email:${recipientEmail}`, rightBoxX, doc.y, { width: rightBoxWidth, align: 'right', characterSpacing: 0.1 });
        }
        headerBottomY = Math.max(headerBottomY, doc.y);
    }

    // Set Y below header block
    doc.y = headerBottomY + 10;

    // Format & Parse Content
    const parsedBody = parseTemplate(template.content || '', vars);
    const rawLines = parsedBody.replace(/\r\n/g, '\n').split('\n');

    const isOfferLetter = documentType.toLowerCase().includes('offer') || docTitle.toLowerCase().includes('offer');
    let inSignatory = false;
    let inAcceptance = false;
    let hasRenderedSignatory = false;
    let hasRenderedAcceptance = false;
    let hasRenderedQrCode = false;

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
            doc.fontSize(10.5).font(fonts.bold).fillColor('#000000')
               .text('Subject: ', textMargin, doc.y, { continued: true, characterSpacing: 0.1 });
            doc.text(subjText, { continued: false, characterSpacing: 0.1 });
            doc.moveDown(0.2);
            continue;
        }

        // Salutation (Dear ... / To Whom It May Concern)
        if (trimmedUpper.startsWith('TO WHOM IT MAY CONCERN')) {
            doc.moveDown(0.25);
            doc.fontSize(11).font(fonts.bold).fillColor('#000000')
               .text('To Whom It May Concern,', textMargin, doc.y, { align: 'left', characterSpacing: 0.1 });
            doc.moveDown(0.35);
            continue;
        }

        if (trimmedUpper.startsWith('DEAR ')) {
            doc.moveDown(0.1);
            doc.fontSize(10).font(fonts.regular).fillColor('#000000')
               .text(trimmed, textMargin, doc.y, { align: 'left', characterSpacing: 0.1 });
            doc.moveDown(0.2);
            continue;
        }

        // Acceptance Section (Only for Offer Letters)
        const isAcceptanceLine = 
            trimmedUpper === 'ACCEPTANCE' || 
            trimmedUpper === 'EMPLOYEE ACCEPTANCE' || 
            trimmedUpper.startsWith('ACCEPTANCE OF') ||
            trimmedUpper.startsWith('EMPLOYEE SIGNATURE') ||
            (trimmedUpper.startsWith('SIGNATURE:') && !hasRenderedAcceptance);

        if (isAcceptanceLine) {
            if (!isOfferLetter) {
                // Non-offer documents (Employment Contract, Appointment Letter, Experience Letter, etc.) do NOT have an Employee Acceptance candidate slip!
                inAcceptance = true;
                continue;
            }
            if (!hasRenderedAcceptance) {
                inAcceptance = true;
                hasRenderedAcceptance = true;
                doc.moveDown(0.2);

                // Divider line across inside text margin
                const dividerY = doc.y;
                doc.moveTo(textMargin, dividerY)
                   .lineTo(doc.page.width - textMargin, dividerY)
                   .strokeColor('#94A3B8')
                   .lineWidth(0.8)
                   .stroke();

                doc.y = dividerY + 6;
                doc.fontSize(10.5).font(fonts.bold).fillColor('#000000').text(isInternship ? 'Acceptance' : 'Employee Acceptance', textMargin, doc.y, { characterSpacing: 0.1 });
                doc.moveDown(0.15);

                const empName = vars.employeeName || 'Employee';

                doc.fontSize(9.5).font(fonts.regular).fillColor('#000000')
                   .text('I, ', textMargin, doc.y, { continued: true, characterSpacing: 0.1 });
                doc.font(fonts.bold).text(empName, { continued: true, characterSpacing: 0.1 });
                doc.font(fonts.regular).text(`, accept the ${isInternship ? 'internship offer' : 'offer'} and its terms and conditions.`, { continued: false, characterSpacing: 0.1 });

                doc.moveDown(0.2);

                const signLineY = doc.y;
                doc.fontSize(9.5).font(fonts.bold).fillColor('#000000')
                   .text('Signature: ', textMargin, signLineY, { continued: true, characterSpacing: 0.1 });
                doc.font(fonts.regular).fillColor('#94A3B8').text('____________________', { continued: false });

                doc.moveDown(0.15);
                doc.fontSize(9.5).font(fonts.bold).fillColor('#000000')
                   .text('Date: ', textMargin, doc.y, { continued: true, characterSpacing: 0.1 });
                doc.font(fonts.regular).fillColor('#94A3B8').text('________________________', { continued: false });

                // Place Dynamic Verification QR Code beside signature lines (on the right inside margin)
                if (qrCodeDataUri) {
                    try {
                        const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
                        const imageBuffer = Buffer.from(base64Data, 'base64');
                        doc.image(imageBuffer, doc.page.width - textMargin - 46, signLineY - 4, { width: 44, height: 44 });
                        hasRenderedQrCode = true;
                    } catch (e) {}
                }
                continue;
            }
        }

        // Signatory Section - Space before "Sincerely,"
        if (trimmedUpper.startsWith('SINCERELY') || trimmedUpper.startsWith('WITH WARM REGARDS') || trimmedUpper.startsWith('YOURS FAITHFULLY')) {
            inSignatory = true;
            hasRenderedSignatory = true;
            doc.moveDown(0.35); // Clean space before sincerely

            const isAppointment = documentType.toLowerCase().includes('appointment') || docTitle.toLowerCase().includes('appointment');

            // Select corresponding signatory:
            // - Appointment Letters -> CEO / Executive Signatory
            // - Offer Letters, Experience Letters, Payslips, etc. -> HR Signatory
            const targetSigUrl = isAppointment
                ? (company?.ceoSignatureUrl || company?.signatureUrl || path.join(__dirname, '../../uploads/appointment_signature.png'))
                : (company?.hrSignatureUrl || company?.signatureUrl || path.join(__dirname, '../../uploads/afreen_signature.jpg'));

            const targetStampUrl = company?.stampUrl || path.join(__dirname, '../../uploads/itcs_stamp.jpg');

            const resolvedSignatoryName = isAppointment
                ? (company?.ceoSignatoryName || vars.signatoryName || 'Founder & CEO')
                : 'Afreen Saeed';

            const resolvedSignatoryTitle = isAppointment
                ? (company?.ceoSignatoryTitle || vars.signatoryDesignation || 'Chief Executive Officer')
                : 'Manager HR, IT Consulting and Services (ITCS)';

            doc.fontSize(10).font(fonts.regular).fillColor('#000000').text('Sincerely,', textMargin, doc.y, { characterSpacing: 0.1 });
            doc.moveDown(0.12);
            doc.fontSize(10.5).font(fonts.bold).fillColor('#000000').text(resolvedSignatoryName + ',', textMargin, doc.y, { characterSpacing: 0.1 });
            doc.moveDown(0.12);

            // Dynamic Company Signature & Stamp
            const sigImgY = doc.y + 2;
            let sigDrawn = false;
            let stampDrawn = false;

            // 1. Draw target signature (CEO or HR) if uploaded for this company
            if (targetSigUrl) {
                sigDrawn = drawImageBufferOrPath(doc, targetSigUrl, textMargin, sigImgY, { height: 32 });
            }

            // 2. Draw official company stamp if uploaded for this company
            if (targetStampUrl) {
                stampDrawn = drawImageBufferOrPath(doc, targetStampUrl, sigDrawn ? (textMargin + 80) : textMargin, sigImgY, { height: 32 });
            }

            // For non-offer documents (Employment Contract, Appointment Letter, Experience Letter, etc.),
            // render the cryptographic QR verification code opposite the company signatory / stamp
            if (!isOfferLetter && !hasRenderedQrCode && qrCodeDataUri) {
                try {
                    const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
                    const imageBuffer = Buffer.from(base64Data, 'base64');
                    doc.image(imageBuffer, doc.page.width - textMargin - 46, sigImgY - 2, { width: 44, height: 44 });
                    hasRenderedQrCode = true;
                } catch (e) {}
            }

            // If neither signature image nor stamp is uploaded, draw a clean signature line
            if (!sigDrawn && !stampDrawn) {
                doc.fontSize(9.5).font(fonts.regular).fillColor('#94A3B8').text('_________________________________', textMargin, sigImgY + 8);
                doc.y = sigImgY + 20;
            } else {
                doc.y = sigImgY + 36;
            }

            // Render dynamic signatory title below stamp
            doc.fontSize(10).font(fonts.bold).fillColor('#000000').text(resolvedSignatoryTitle, textMargin, doc.y, { characterSpacing: 0.1 });

            const isPayslipDoc = documentType.toLowerCase().includes('pay slip') || documentType.toLowerCase().includes('salary') || docTitle.toLowerCase().includes('pay slip') || docTitle.toLowerCase().includes('salary statement');
            if (isPayslipDoc) {
                doc.moveDown(0.12);
                doc.fontSize(9.5).font(fonts.regular).fillColor('#000000').text('HR & Payroll Department', textMargin, doc.y, { characterSpacing: 0.1 });
            }

            doc.moveDown(0.2);
            continue;
        }

        // Section Heading (e.g. "Salary and Benefits:", "Terms and Conditions:", "1. Position and Duties")
        const isHeading = 
            (trimmed.endsWith(':') && trimmed.length < 50 && !trimmed.includes('.') && !trimmed.startsWith('•') && !trimmed.startsWith('-') && !trimmed.startsWith('*')) ||
            (trimmedUpper === trimmed && trimmed.length >= 4 && trimmed.length < 50 && !trimmed.includes('.') && !trimmedUpper.startsWith('HTTP')) ||
            /^\d+\.\s+[A-Za-z\s]+$/.test(trimmed);

        if (isHeading) {
            doc.moveDown(0.25);
            doc.fontSize(10.5).font(fonts.bold).fillColor('#000000')
               .text(trimmed, textMargin, doc.y, { align: 'left', characterSpacing: 0.1 });
            doc.moveDown(0.15);
            continue;
        }

        // Key-Value detail or bullet line
        const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
        const colonIdx = trimmed.indexOf(':');
        const hasValue = colonIdx > 0 && trimmed.substring(colonIdx + 1).trim().length > 0;
        const isKeyValue = colonIdx > 0 && colonIdx < 30 && hasValue && !trimmedUpper.startsWith('HTTP') && !trimmedUpper.startsWith('NOTE:');

        if (isBullet || isKeyValue) {
            renderBulletOrKeyValue(doc, trimmed, { x: textMargin + 16, width: textWidth - 16, fontSize: 9.5 });

            // Check if next non-empty line is NOT a bullet, add extra space after bullet points!
            let nextNonEmpty = '';
            for (let j = i + 1; j < rawLines.length; j++) {
                if (rawLines[j].trim()) {
                    nextNonEmpty = rawLines[j].trim();
                    break;
                }
            }
            const nextIsBullet = nextNonEmpty.startsWith('•') || nextNonEmpty.startsWith('-') || nextNonEmpty.startsWith('*') ||
                (nextNonEmpty.indexOf(':') > 0 && nextNonEmpty.indexOf(':') < 30 && !nextNonEmpty.toUpperCase().startsWith('HTTP') && !nextNonEmpty.toUpperCase().startsWith('SINCERELY'));
            if (!nextIsBullet && nextNonEmpty) {
                doc.moveDown(0.2); // Space after the bullet point detail
            }
            continue;
        }

        // Standard Body Paragraph with rich inline bolding
        renderRichText(doc, trimmed, {
            x: textMargin,
            width: textWidth,
            fontSize: 9.5,
            fontColor: '#000000',
            lineGap: 1.2, // 1.2 compact line-height
            characterSpacing: 0.1, // normal / 0.01em
            align: 'left'
        });

        // Check if next non-empty line is a bullet (e.g. after "The details of your internship are as follows:")
        let nextNonEmpty = '';
        for (let j = i + 1; j < rawLines.length; j++) {
            if (rawLines[j].trim()) {
                nextNonEmpty = rawLines[j].trim();
                break;
            }
        }
        const nextIsBullet = nextNonEmpty.startsWith('•') || nextNonEmpty.startsWith('-') || nextNonEmpty.startsWith('*') ||
            (nextNonEmpty.indexOf(':') > 0 && nextNonEmpty.indexOf(':') < 30 && !nextNonEmpty.toUpperCase().startsWith('HTTP') && !nextNonEmpty.toUpperCase().startsWith('SINCERELY'));
        if (nextIsBullet || trimmed.toLowerCase().includes('as follows')) {
            doc.moveDown(0.25); // Space after the line before bullet points
        } else {
            doc.moveDown(0.15);
        }
    }

    // Guaranteed Employee Acceptance Block for all Offer Letters (even if template body in DB didn't explicitly include it)
    if (isOfferLetter && !hasRenderedAcceptance) {
        hasRenderedAcceptance = true;
        doc.moveDown(0.25);

        // Divider line across inside text margin
        const dividerY = doc.y;
        doc.moveTo(textMargin, dividerY)
           .lineTo(doc.page.width - textMargin, dividerY)
           .strokeColor('#94A3B8')
           .lineWidth(0.8)
           .stroke();

        doc.y = dividerY + 6;
        doc.fontSize(10.5).font(fonts.bold).fillColor('#000000').text(isInternship ? 'Acceptance' : 'Employee Acceptance', textMargin, doc.y, { characterSpacing: 0.1 });
        doc.moveDown(0.15);

        const empName = vars.employeeName || recipientName || 'Employee';

        doc.fontSize(9.5).font(fonts.regular).fillColor('#000000')
           .text('I, ', textMargin, doc.y, { continued: true, characterSpacing: 0.1 });
        doc.font(fonts.bold).text(empName, { continued: true, characterSpacing: 0.1 });
        doc.font(fonts.regular).text(`, accept the ${isInternship ? 'internship offer' : 'offer'} and its terms and conditions.`, { continued: false, characterSpacing: 0.1 });

        doc.moveDown(0.2);

        const signLineY = doc.y;
        doc.fontSize(9.5).font(fonts.bold).fillColor('#000000')
           .text('Signature: ', textMargin, signLineY, { continued: true, characterSpacing: 0.1 });
        doc.font(fonts.regular).fillColor('#94A3B8').text('____________________', { continued: false });

        doc.moveDown(0.15);
        doc.fontSize(9.5).font(fonts.bold).fillColor('#000000')
           .text('Date: ', textMargin, doc.y, { continued: true, characterSpacing: 0.1 });
        doc.font(fonts.regular).fillColor('#94A3B8').text('________________________', { continued: false });

        // Place Dynamic Verification QR Code beside signature lines (on the right inside margin)
        if (qrCodeDataUri && !hasRenderedQrCode) {
            try {
                const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
                const imageBuffer = Buffer.from(base64Data, 'base64');
                doc.image(imageBuffer, doc.page.width - textMargin - 46, signLineY - 4, { width: 44, height: 44 });
                hasRenderedQrCode = true;
            } catch (e) {}
        }
    }

    // Fallback: If document had no acceptance block or QR code drawn yet, place QR code bottom-right
    if (!hasRenderedQrCode && qrCodeDataUri) {
        try {
            const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const targetQrY = Math.min(doc.page.height - 100, Math.max(doc.y - 45, doc.page.height - 110));
            doc.image(imageBuffer, doc.page.width - textMargin - 50, targetQrY, { width: 44, height: 44 });
            hasRenderedQrCode = true;
        } catch (e) {}
    }
};

// Generate a document
router.post('/generate', authenticate, checkProfileLock, async (req: Request, res: Response, next: NextFunction) => {
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
        decryptEmployeeFields(employee);

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
        const defaultExperienceText = `To Whom It May Concern,\n\nI am writing to confirm that {{employeeName}} was employed with IT Consulting and Services (ITCS) as {{designation}} in the {{department}} department from {{joiningDate}} to {{lastWorkingDay}}. {{pronounCapitalizedPossessive}} last drawn permanent monthly gross salary was PKR {{confirmedSalary}}.\n\nDuring {{pronounPossessive}} tenure, {{employeeName}} consistently demonstrated {{skills}} in {{designation}} management. {{pronounCapitalizedSubject}} played a key role in overseeing {{jobResponsibilities}}.\n\n{{employeeName}}'s dedication and commitment significantly contributed to strengthening our {{department}} division and fostering a positive work environment. {{pronounCapitalizedPossessive}} ability to effectively manage {{generalJobDescription}} made {{pronounObject}} a crucial element in the success of the organization.\n\nThroughout {{pronounPossessive}} time at ITCS, {{employeeName}} proved to be a valuable member of our {{department}} team. {{pronounCapitalizedPossessive}} contributions have had a lasting positive impact on the organization, and {{pronounSubject}} has earned the respect and appreciation of {{pronounPossessive}} colleagues and peers.\n\nWe are confident that {{employeeName}}'s skills, experience, and dedication will continue to serve {{pronounObject}} well in {{pronounPossessive}} future endeavors. We wish {{pronounObject}} every success in {{pronounPossessive}} professional career and all the best for the future.\n\nSincerely,\nAfreen Saeed\nHuman Resource Department\nafreen@itcs.com.pk`;

        const defaultAppointmentText = `With reference to your application for employment with ITCS (IT Consulting and Services), we are pleased to offer you the position of {{designation}}. You will be based in {{workLocation}} with effect from {{joiningDate}} on the terms and conditions given below.\n\nYour terms of appointment will be governed by the rules and regulations applicable to the above-mentioned designation as per the Human Resources Policy Manual of the Company. The Company, however, reserves the right to change the applicable rules and regulations at its entire discretion, without advance notice, in which case your employment shall be governed by such revised rules and regulations.\n\nSalary and Benefits:\nYour monthly gross salary will be Rs. {{grossSalary}} ({{grossSalaryWords}}) during the probationary period and will remain Rs. {{grossSalary}} ({{grossSalaryWords}}) upon successful completion of probation and confirmation.\n\nYour benefit entitlement will be in accordance with the policies approved by the Company and shall be subject to the applicable Company policies from time to time.\n\nUpon successful completion of the probationary period, you will be entitled to the following benefits, subject to Company policy:\n• Meal allowance/benefit\n• Fuel allowance/benefit\n• Company-provided SIM card and applicable mobile package\n• Provident Fund / Company Share Plan, as applicable under Company policy\n• Medical allowance\n• Any other benefits applicable to employees in your cadre under Company policy\n\nThe above benefits shall become applicable after successful completion of the probationary period and confirmation. The Company reserves the right to modify its benefit policies from time to time, and you shall be bound by such modifications.\n\nProbationary Period:\nYour confirmation is subject to a satisfactory probationary period of three (3) months. The Company reserves the right to extend the probationary period at its discretion. Unless your employment is confirmed in writing, you shall continue to be employed on probation.\n\nOn satisfactory completion of your probation period, your employment with the Company may be confirmed in writing, whereupon you will be entitled to the Company benefits applicable to permanent staff in your cadre from the date of confirmation.\n\nAnnual Incentive Plan:\nYou will be entitled to the Annual Incentive Plan of the Company, if applicable, as per Company Policy.\n\nMedical Policy:\nUpon confirmation, you will be entitled to the applicable medical allowance/benefit in accordance with the Company’s prevailing Medical Policy.\n\nMobile Connection:\nUpon confirmation, you will be entitled to a Company-provided SIM card and mobile package, subject to the applicable Company policy and usage limits.\n\nReporting Hierarchy:\nYour reporting line will be to {{reportingManager}}, who will assign you duties and responsibilities in carrying out your day-to-day activities. The Company may, at its discretion, change the reporting line and/or the requirements of the position assigned.\n\nReferences / Academic Verification:\nThe Company reserves the right to solicit information regarding yourself from any of your previous employers. Upon your representation, we understand that your educational degree(s) are from accredited institution(s); however, the Company further reserves the right to seek verification regarding your educational qualifications and respective academic institutions from relevant authorities. Your appointment and confirmation are subject to receiving satisfactory references/authentication when such reference/verification checks are conducted.\n\nTermination of Service:\nDuring the probationary period, either the Company or you may terminate the employment without cause and at any time by giving 24 hours’ notice in writing to the other party.\n\nAfter confirmation, either party may terminate this Agreement without cause by giving 30 days’ notice in writing to the other party, or by making payment equivalent to 30 days’ salary in lieu of notice.\n\nNotwithstanding anything herein contained, the Company shall be entitled to terminate your employment with immediate effect and without advance notice (or any payment in lieu of notice) in case of misconduct, which shall include but shall not be limited to willful insubordination.\n\nThe Company reserves the right to terminate the services at any time without prior notice if the employee’s continued association/employment with the Company is prejudicial to the image and/or interests of the Company.\n\nIn case of termination of service due to misconduct or disciplinary action, the Company will reserve the right to withhold compensation to the extent permitted under applicable law and Company policy.\n\nEmployee Provident Fund / Company Share Plan:\nUpon confirmation, you will be entitled to participate in the Provident Fund and/or Company Share Plan, as applicable, subject to the eligibility criteria, terms and conditions, and policies of the Company.\n\nLeave Entitlement:\nYou will be allowed twenty (20) working days of Annual Leave for each completed year of service. Earned Leave can be availed after confirmation only as detailed in policy. You are also entitled to ten (10) paid sick leaves.\n\nLeave cannot be encashed or accumulated. Any leave balance at the end of the calendar year will automatically lapse. The Company may frame and modify Leave rules from time to time, which shall be binding upon you.\n\nTraining and Development:\nThe Company offers training and development opportunities for all employees. All local and foreign training will be governed by the prevailing Training Policy.\n\nRetirement:\nYou will be retired from the service of the Company on attaining the age of 60 years. You may be retired earlier on the grounds of ill health or physical or mental incapacity to work, subject to applicable Company policy and law.\n\nFalse Information:\nIf the Company determines at any time that your recruitment was made as a result of the submission of false information and/or forged documents, the employment contract will be automatically cancelled without prior notice, reward, or compensation, subject to applicable law.\n\nExclusive Service and Confidentiality Agreement:\nDuring the period of your employment with the Company, you will perform all such duties anywhere in Pakistan as are assigned to you from time to time by the Company or its associates depending upon the exigencies of business. The Company also reserves the right to transfer you to any location within Pakistan.\n\nSince in the course of your employment you would be disclosed information which is confidential and proprietary to the Company, and which it would be a breach of trust to disclose or make available, particularly to a competitor of the Company, you undertake to maintain complete confidentiality in regard to the Company’s information, processes, operations, and business activities at all times, whether during or after your employment with the Company.\n\nWhile in the Company’s service, you will not be employed at any time directly or indirectly with any other employer or any other business, subject to applicable law and Company policy.\n\nService Rules and Regulations:\nYour appointment is subject to the rules and regulations in force in the Company or any amendments, alterations, or modifications that may be made therein from time to time.\n\nWe welcome you to ITCS (IT Consulting and Services) and wish you a successful career with the Company.\n\nValidity:\nPlease provide the Company with your acceptance of the offer and joining date by returning a signed copy of this letter within 7 working days. This offer will expire if:\na) You do not provide your acceptance within 7 days; and/or\nb) You do not join, at the latest, within 10 working days after your proposed and mutually agreed joining date.\n\nSincerely,\nITCS (IT Consulting and Services)\n\nFaraz Anwer\nFounder & CEO`;

        const defaultContractText = `This Employment Contract is made between IT Consulting and Services (ITCS) and {{employeeName}}, holder of CNIC {{cnic}}.\n\n1. Position and Duties\nThe Employee is engaged as {{designation}} reporting to {{reportingManager}}, based in {{workLocation}}, effective from {{joiningDate}}.\n\n2. Compensation\nThe Employee will receive a basic monthly salary of Rs. {{basicSalary}}, payable on or before the 5th of each month, subject to applicable deductions.\n\n3. Term and Probation\nThis Contract is effective from {{joiningDate}} and shall continue subject to a probationary period of {{probationDays}} days, after which confirmation will be subject to satisfactory performance.\n\n4. Working Hours\nThe Employee's standard working hours will be {{workingDays}}, {{workingHours}}.\n\n5. Confidentiality\nThe Employee agrees to maintain confidentiality of all proprietary Company information during and after the term of employment.\n\n6. Termination\nEither party may terminate this Contract by providing {{noticePeriod}} written notice, or payment in lieu thereof, subject to the terms outlined in the Company's HR Policy Manual.\n\n7. Governing Law\nThis Contract shall be governed by the laws of Pakistan.\n\nIN WITNESS WHEREOF, the parties have executed this Contract as of the date written below.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)`;

        if (template && (rawDocType === 'Experience Letter' || template.documentType === 'Experience Letter') && (!template.content.includes('confirmedSalary') || !template.content.includes('Afreen Saeed'))) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'EXPERIENCE LETTER', content: defaultExperienceText } }
            );
            template.subject = 'EXPERIENCE LETTER';
            template.content = defaultExperienceText;
        }

        if (template && (rawDocType === 'Employment Contract' || template.documentType === 'Employment Contract') && (template.content.includes('gross monthly salary') || template.content.includes('[Notice Period]') || template.content.includes('Employee Acceptance') || !template.content.includes('and {{employeeName}}'))) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'EMPLOYMENT CONTRACT', content: defaultContractText } }
            );
            template.subject = 'EMPLOYMENT CONTRACT';
            template.content = defaultContractText;
        }

        if (template && (rawDocType === 'Appointment Letter' || template.documentType === 'Appointment Letter') && (!template.content.includes('Exclusive Service') || template.content.includes('Employee Acceptance'))) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'APPOINTMENT LETTER', content: defaultAppointmentText } }
            );
            template.subject = 'APPOINTMENT LETTER';
            template.content = defaultAppointmentText;
        }

        const defaultInternshipText = `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Internship Offer – ITCS\n\nDear {{salutation}} {{employeeName}},\nWe are pleased to offer you an Internship position with our ITCS office in {{workLocation}}.\nThe details of your internship are as follows:\n\n• Position: {{designation}}\n• Location: {{workLocation}}\n• Stipend: PKR {{stipend}}\n• Joining date: {{joiningDate}}\n• Working Days: {{workingDays}}\n• Working Hours: {{workingHours}}\n\nDuring your internship, you will work with our **{{department}} team in {{workLocation}}**, adhere to company policies, and maintain confidentiality. This internship does not guarantee permanent employment and may be ended by either party with reasonable notice. Please confirm your acceptance of this offer by signing below and returning a copy of this letter. We look forward to having you on board and wish you a rewarding learning experience.\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\n\nAcceptance\nI, {{employeeName}}, accept the internship offer and its terms and conditions.\nSignature: ____________________\nDate: ________________________`;

        if (template && (rawDocType === 'Internship Offer Letter' || template.documentType === 'Internship Offer Letter')) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'INTERNSHIP OFFER LETTER', content: defaultInternshipText } }
            );
            template.subject = 'INTERNSHIP OFFER LETTER';
            template.content = defaultInternshipText;
        }

        const defaultPayslipText = `Date: {{date}}\n\nTo: {{employeeName}}\n{{city}}, Pakistan\nEmail: {{personalEmail}}\n\nSubject: Salary Pay Slip – {{payPeriod}}\n\nEmployee Details:\n• Employee Name: {{employeeName}} (ID: {{employeeId}})\n• Designation: {{designation}}\n• Department: {{department}}\n• Pay Period: {{payPeriod}}\n\nEarnings & Deductions Summary:\n• Basic Salary: PKR {{basicSalary}}\n• Normal Allowances: PKR {{allowances}}\n• Reimbursed Expense Claims: PKR {{reimbursedClaims}}\n• Total Gross Earnings: PKR {{grossSalary}}\n• Income Tax: PKR {{taxAmount}}\n• Other Deductions: PKR {{otherDeductions}}\n• Total Deductions: PKR {{totalDeductions}}\n• Net Take-Home Pay: PKR {{netPay}}\n\nThis pay slip is an official electronic record of monthly salary disbursed by IT Consulting and Services (ITCS).\n\nSincerely,\nAfreen Saeed,\nManager HR, IT Consulting and Services (ITCS)\nHR & Payroll Department`;

        if (template && (rawDocType === 'Pay Slip' || template.documentType === 'Pay Slip') && (template.content.includes('Authorized Signatory') || !template.content.includes('Normal Allowances'))) {
            await DocumentTemplate.updateOne(
                { _id: template._id },
                { $set: { subject: 'SALARY PAY SLIP', content: defaultPayslipText } }
            );
            template.subject = 'SALARY PAY SLIP';
            template.content = defaultPayslipText;
        }

        // Auto-seed default template if not found in database
        if (!template) {
            const defaultTemplates: Record<string, { subject: string; content: string }> = {
                'Internship Offer Letter': {
                    subject: 'INTERNSHIP OFFER LETTER',
                    content: defaultInternshipText
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
                    subject: 'EMPLOYMENT CONTRACT',
                    content: defaultContractText
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
                    content: defaultPayslipText
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
                    content: defaultExperienceText
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
                bottom: 40,
                left: 64,
                right: 64
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

        // 1. Fetch latest payslip for single Pay Slip & fallback gross pay
        const latestPayslip = await Payslip.findOne({
            employeeId: employee.employeeId
        }).sort({ periodYear: -1, periodMonth: -1 }).lean() as any;

        // Format permanent latest salary with standard comma separation
        let permanentSalaryNum = 0;
        if (employee.financeInfo?.confirmedSalary) {
            permanentSalaryNum = Number(String(employee.financeInfo.confirmedSalary).replace(/[^0-9.]/g, '')) || 0;
        }
        if (!permanentSalaryNum && totalGrossSalary) {
            permanentSalaryNum = totalGrossSalary;
        }
        if (!permanentSalaryNum && latestPayslip?.grossPay) {
            permanentSalaryNum = latestPayslip.grossPay;
        }
        if (!permanentSalaryNum && basicSalaryAmount) {
            permanentSalaryNum = basicSalaryAmount;
        }

        const formattedConfirmedSalary = req.body.customVars?.confirmedSalary
            ? (/^\d+$/.test(req.body.customVars.confirmedSalary) ? Number(req.body.customVars.confirmedSalary).toLocaleString('en-US') : req.body.customVars.confirmedSalary)
            : (permanentSalaryNum > 0 ? permanentSalaryNum.toLocaleString('en-US') : (confSal && confSal !== '0' ? confSal : '—'));

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

        let singlePayPeriod = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        let singleBasicSal = defaultBasicNum ? String(defaultBasicNum) : '';
        let singleAllowances = defaultAllowancesNum ? String(defaultAllowancesNum) : '0';
        let singleClaims = '0';
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

            let normalAllowancesAmt = 0;
            let reimbursedClaimsAmt = 0;

            if (Array.isArray(latestPayslip.earnings)) {
                for (const earn of latestPayslip.earnings) {
                    if (earn.component === 'Basic Salary') continue;
                    const compName = (earn.component || '').toLowerCase();
                    const isClaim = earn.expenseClaim === true || compName.includes('claim') || compName.includes('expense');
                    if (isClaim) {
                        reimbursedClaimsAmt += Number(earn.amount) || 0;
                    } else {
                        normalAllowancesAmt += Number(earn.amount) || 0;
                    }
                }
            } else {
                normalAllowancesAmt = Math.max(0, (latestPayslip.grossPay || 0) - basicAmt);
            }

            const taxDeduction = latestPayslip.deductions?.find((d: any) => d.component?.toLowerCase().includes('tax'));
            const taxAmt = taxDeduction ? taxDeduction.amount : 0;
            const otherDedAmt = Math.max(0, (latestPayslip.totalDeductions || 0) - taxAmt);

            singleBasicSal = String(Math.round(basicAmt));
            singleAllowances = String(Math.round(normalAllowancesAmt));
            singleClaims = String(Math.round(reimbursedClaimsAmt));
            singleGrossSal = String(Math.round(latestPayslip.grossPay));
            singleTaxAmt = String(Math.round(taxAmt));
            singleOtherDed = String(Math.round(otherDedAmt));
            singleTotalDed = String(Math.round(latestPayslip.totalDeductions));
            singleNetPay = String(Math.round(latestPayslip.netPay));
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
            basicSalary: formatSalaryNum(req.body.customVars?.basicSalary || singleBasicSal || (basicSalaryAmount !== undefined ? String(basicSalaryAmount) : '')),
            grossSalary: formatSalaryNum(req.body.customVars?.grossSalary || singleGrossSal || (totalGrossSalary !== undefined ? String(totalGrossSalary) : '')),
            purpose: req.body.customVars?.purpose || purposeText,
            purposeDetail: req.body.customVars?.purposeDetail || req.body.purposeDetail || '',
            date: formatOrdinalDate(issueDate),
            stipend: formatSalaryNum(req.body.customVars?.stipend || req.body.customVars?.grossSalary || singleGrossSal || (totalGrossSalary !== undefined ? String(totalGrossSalary) : (basicSalaryAmount !== undefined ? String(basicSalaryAmount) : '20,000'))),
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
            probationSalary: formatSalaryNum(probSal),
            resignationDate: req.body.customVars?.resignationDate || lastWorkingDayStr,
            settlementDays: req.body.customVars?.settlementDays || '30',
            companyResources: 'Official Laptop, Email Account, and ID Card',
            confirmedSalary: formatSalaryNum(formattedConfirmedSalary),
            permanentSalary: formatSalaryNum(formattedConfirmedSalary),
            latestSalary: formatSalaryNum(formattedConfirmedSalary),
            commissionStructure: 'Performance-based quarterly bonuses as per company policy',
            benefitsList: 'Meal Allowance, Employee Loan Facility, Provident Fund, Performance Bonuses, Medical OPD Claim',
            taxCondition: 'Subject to applicable income tax laws and company policy',
            noticePeriod: req.body.customVars?.noticePeriod || '30 Days',
            probationNoticePeriod: req.body.customVars?.probationNoticePeriod || '15 Days',
            confirmedNoticePeriod: req.body.customVars?.confirmedNoticePeriod || '30 Days',
            earnedLeaveDays: req.body.customVars?.earnedLeaveDays || earnedLeaveDaysVal,
            casualSickLeaveDays: req.body.customVars?.casualSickLeaveDays || casualSickLeaveDaysVal,
            sickLeaveDays: req.body.customVars?.sickLeaveDays || sickLeaveDaysVal,
            casualLeaveDays: req.body.customVars?.casualLeaveDays || casualLeaveDaysVal,
            acceptanceValidityDays: '7',
            probationDaysWords: 'Ninety',
            payPeriod: req.body.customVars?.payPeriod || singlePayPeriod,
            allowances: formatSalaryNum(req.body.customVars?.allowances || singleAllowances),
            reimbursedClaims: formatSalaryNum(req.body.customVars?.reimbursedClaims || singleClaims),
            taxAmount: formatSalaryNum(req.body.customVars?.taxAmount || singleTaxAmt),
            otherDeductions: formatSalaryNum(req.body.customVars?.otherDeductions || singleOtherDed),
            totalDeductions: formatSalaryNum(req.body.customVars?.totalDeductions || singleTotalDed),
            netPay: formatSalaryNum(req.body.customVars?.netPay || singleNetPay),
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
            confirmedSalary: '0',
            permanentSalary: '0',
            latestSalary: '0'
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

        const company = await Company.findOne().select('name logoUrl').lean() as any;
        const companyName = company?.name || 'ITCS';
        const companyLogo = company?.logoUrl || null;

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
                status: doc.status,
                companyName,
                companyLogo
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
                status: payslip.status || 'Valid',
                companyName,
                companyLogo
            });
        }

        res.status(404).json({ message: 'Document or payslip not found or invalid', companyName, companyLogo });
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
        
        const isInternshipPreview = (templateData?.documentType || '').toLowerCase().includes('internship') || (templateData?.subject || '').toLowerCase().includes('internship');

        // Use dummy variables for parsing
        const dummyVars = {
            employeeId: isInternshipPreview ? 'INT-2026' : 'EMP-9872',
            employeeName: isInternshipPreview ? 'Daniyal Imran' : 'John Doe',
            internName: isInternshipPreview ? 'Daniyal Imran' : 'John Doe',
            firstName: isInternshipPreview ? 'Daniyal' : 'John',
            lastName: isInternshipPreview ? 'Imran' : 'Doe',
            salutation: 'Mr.',
            designation: isInternshipPreview ? 'Business Development Intern' : 'Senior Software Engineer',
            department: isInternshipPreview ? 'Sales' : 'Technology Department',
            reportingManager: 'Jane Smith',
            joiningDate: isInternshipPreview ? '24th September 2026' : 'January 15, 2024',
            basicSalary: isInternshipPreview ? '20,000' : '150,000',
            grossSalary: isInternshipPreview ? '20,000' : '200,050',
            stipend: '20,000',
            purpose: isInternshipPreview ? 'internship offer' : 'visa processing application',
            date: isInternshipPreview ? '24th September 2026' : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
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
            permanentSalary: '200,050',
            latestSalary: '200,050',
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
            noticePeriod: '30 Days'
        };

        const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/preview-placeholder-id`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        const doc = new PDFDocument({
            size: 'A4',
            margins: {
                top: 105,
                bottom: 40,
                left: 64,
                right: 64
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

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DUTY PRESETS FOR DYNAMIC OFFER & CONTRACT GENERATION
// ─────────────────────────────────────────────────────────────────────────────
const DUTY_PRESETS = [
    {
        id: 'fullstack_tech',
        category: 'Technology & Engineering',
        title: 'Full-Stack Software Engineer',
        duties: [
            'Architect, develop, and maintain high-performance web applications using TypeScript, React, Node.js, and MongoDB.',
            'Design and optimize scalable RESTful APIs, database indexes, and server-side business logic.',
            'Collaborate closely with product and UI/UX teams to deliver responsive and intuitive user experiences.',
            'Perform peer code reviews, enforce coding standards, and maintain unit and integration test coverage.',
            'Diagnose production issues, optimize front-end bundle performance, and manage deployment pipelines.'
        ]
    },
    {
        id: 'frontend_tech',
        category: 'Technology & Engineering',
        title: 'Frontend Engineer',
        duties: [
            'Build modern, accessible, and responsive client-side web interfaces using React, TypeScript, and modern CSS.',
            'Translate Figma designs into pixel-perfect, reusable component libraries.',
            'Implement client-side state management, smooth transitions, and dynamic data visualization.',
            'Optimize web performance, Core Web Vitals, and ensure cross-browser compatibility.'
        ]
    },
    {
        id: 'backend_tech',
        category: 'Technology & Engineering',
        title: 'Backend / Cloud API Engineer',
        duties: [
            'Design and maintain robust server architectures, RESTful endpoints, and asynchronous workers.',
            'Implement secure authentication, authorization, rate limiting, and data encryption protocols.',
            'Manage database schema migrations, automated backups, and caching strategies with Redis.',
            'Monitor cloud server infrastructure, diagnostic logs, and automated incident response.'
        ]
    },
    {
        id: 'qa_engineer',
        category: 'Technology & Engineering',
        title: 'Software Quality Assurance (QA) Engineer',
        duties: [
            'Develop test scenarios, test cases, and acceptance criteria based on product requirement documents.',
            'Conduct functional, regression, API load, and end-to-end automated testing.',
            'Report and track software bugs through the development lifecycle in collaboration with engineers.',
            'Validate production releases and verify hotfixes in staging environments.'
        ]
    },
    {
        id: 'bdo_sales',
        category: 'Sales & Business Development',
        title: 'Business Development Executive (BDO)',
        duties: [
            'Prospect, engage, and qualify corporate B2B clients across domestic and international markets.',
            'Conduct discovery calls, product demonstrations, and pitch corporate solutions to prospective clients.',
            'Manage the end-to-end sales pipeline from initial outreach to proposal generation and contract closure.',
            'Consistently achieve and exceed monthly and quarterly revenue targets and lead conversion quotas.',
            'Maintain accurate deal stages, call logs, and client relationship history in the company CRM.'
        ]
    },
    {
        id: 'account_executive_sales',
        category: 'Sales & Business Development',
        title: 'Senior Account Executive',
        duties: [
            'Manage enterprise sales cycles, lead negotiations with commercial stakeholders, and close major accounts.',
            'Develop customized pricing proposals, service contracts, and service level agreements (SLAs).',
            'Cultivate executive-level client relationships to drive account retention, renewals, and up-sell growth.'
        ]
    },
    {
        id: 'marketing_specialist',
        category: 'Marketing & Growth',
        title: 'Digital Marketing & Content Specialist',
        duties: [
            'Plan, execute, and monitor digital campaigns across Google Search, LinkedIn Ads, and social channels.',
            'Produce compelling marketing collateral, case studies, corporate announcements, and newsletters.',
            'Analyze traffic, conversion funnels, CAC, and ROI metrics to optimize growth campaigns.'
        ]
    },
    {
        id: 'hr_executive',
        category: 'Human Resources & Operations',
        title: 'HR & Talent Acquisition Executive',
        duties: [
            'Execute talent acquisition: job postings, resume screening, scheduling interviews, and issuing offer letters.',
            'Coordinate employee onboarding, Day-1 orientation, documentation collection, and initial account setup.',
            'Administer attendance, leaves, employee requests, and assist with monthly payroll preparation.',
            'Ensure full compliance with company policies, labor standards, and employee record confidentiality.'
        ]
    },
    {
        id: 'finance_officer',
        category: 'Finance & Accounting',
        title: 'Finance & Accounts Officer',
        duties: [
            'Manage accounts payable, accounts receivable, vendor invoices, and employee expense claims.',
            'Assist with monthly payroll reconciliation, tax calculations, and banking schedules.',
            'Maintain general ledger entries, financial spreadsheets, and prepare monthly audit reports.'
        ]
    },
    {
        id: 'client_operations',
        category: 'Operations & Support',
        title: 'Customer Success & Operations Specialist',
        duties: [
            'Serve as the key operational point of contact for onboarded clients, ensuring smooth service delivery.',
            'Respond promptly to client queries, troubleshoot operational issues, and maintain high CSAT scores.',
            'Prepare monthly client health reports, satisfaction reviews, and renewal check-ins.'
        ]
    },
    {
        id: 'intern_software_eng',
        category: 'Internship Programs',
        title: 'Software Engineering Intern',
        duties: [
            'Participate in hands-on development sprints under senior engineering mentorship.',
            'Assist in writing clean, testable code, unit tests, and bug resolution for web applications.',
            'Learn and apply modern development workflows, Git version control, and code review practices.',
            'Collaborate with team members during daily standups and sprint planning sessions.'
        ]
    },
    {
        id: 'intern_bdo_sales',
        category: 'Internship Programs',
        title: 'Business Development & Sales Intern',
        duties: [
            'Conduct market research, identify prospective corporate B2B clients, and build lead pipelines.',
            'Assist senior account executives in preparing client pitch decks and product demos.',
            'Shadow discovery calls, client follow-ups, and CRM contact data maintenance.',
            'Learn modern enterprise sales techniques and lead qualification workflows.'
        ]
    },
    {
        id: 'intern_digital_marketing',
        category: 'Internship Programs',
        title: 'Digital Marketing & Content Intern',
        duties: [
            'Assist in creating content for social media channels, corporate blogs, and newsletters.',
            'Monitor campaign engagement metrics, keyword trends, and web traffic analytics.',
            'Support marketing team in organizing webinars, brand campaigns, and visual collateral.',
            'Learn SEO best practices, copywriting, and digital advertising funnels.'
        ]
    },
    {
        id: 'intern_uiux_design',
        category: 'Internship Programs',
        title: 'UI/UX Design Intern',
        duties: [
            'Support product designers with wireframing, interactive prototyping, and design system updates in Figma.',
            'Conduct user flow evaluations, usability testing, and competitor design benchmarking.',
            'Prepare responsive design assets, icon sets, and micro-interaction specifications.',
            'Participate in design critiques and cross-functional handoffs with developers.'
        ]
    },
    {
        id: 'intern_hr_talent',
        category: 'Internship Programs',
        title: 'Human Resources & Talent Acquisition Intern',
        duties: [
            'Assist HR team with resume screening, candidate coordination, and interview scheduling.',
            'Support new hire onboarding sessions, document collation, and initial orientation.',
            'Help coordinate internal employee engagement activities and training workshops.',
            'Learn HR compliance, employee record management, and talent sourcing tools.'
        ]
    }
];

// 1. Get duty presets
router.get('/duty-presets', authenticate, (_req: Request, res: Response) => {
    res.json(DUTY_PRESETS);
});

// Helper to build and sanitize merged variables for HR Dispatcher
const buildDispatcherMergedVars = (
    documentType: string,
    recipientName: string,
    recipientEmail: string,
    variables: Record<string, any> = {},
    company: any
): Record<string, string> => {
    const isInternship = documentType.toLowerCase().includes('intern');
    const prob = parseProbation(variables.probationPeriod || variables.probationDays || '3 Months (90 Days)');
    const cleanProbDays = (variables.probationDays && Number(variables.probationDays) <= 365 && !String(variables.probationDays).includes('Month')) ? String(variables.probationDays) : prob.days;
    const cleanProbMonths = (variables.probationMonths && Number(variables.probationMonths) <= 12) ? String(variables.probationMonths) : prob.months;

    const rawCity = variables.city || variables.personalCity || variables.workLocation || 'Karachi';
    const cleanCity = String(rawCity).replace(/,?\s*Pakistan\b/gi, '').trim() || 'Karachi';

    const mergedVars: Record<string, string> = {
        employeeName: recipientName,
        personalEmail: recipientEmail,
        workEmail: recipientEmail,
        date: formatOrdinalDate(new Date()),
        signatoryName: company?.hrSignatoryName || 'Manager HR',
        signatoryDesignation: company?.hrSignatoryTitle || 'Human Resources',
        hrEmail: company?.contact?.email || 'hrms@itcs.com.pk',
        hrPhone: company?.contact?.phone || '+92 21 111-482-711',
        workLocation: 'Karachi, Pakistan',
        city: cleanCity,
        personalCity: cleanCity,
        employmentType: variables.employmentType || (isInternship ? 'Internship' : 'Full-Time'),
        workingDays: variables.workingDays || 'Monday to Friday',
        workingHours: variables.workingHours || '09:00 AM - 06:00 PM',
        startTime: '09:00 AM',
        endTime: '06:00 PM',
        probationDays: cleanProbDays,
        probationMonths: cleanProbMonths,
        probationPeriod: `${cleanProbMonths} Months (${cleanProbDays} Days)`,
        companyResources: variables.companyResources || 'Official Laptop, Corporate Email Account, and Access Credentials',
        commissionStructure: variables.commissionStructure || 'Performance-based quarterly bonuses as per company policy',
        benefitsList: variables.benefitsList || 'Meal Allowance, Health Insurance / OPD Reimbursement, Provident Fund, Performance Bonuses',
        taxCondition: variables.taxCondition || 'Subject to applicable income tax laws and statutory tax brackets',
        noticePeriod: variables.noticePeriod || (isInternship ? '15 Days' : '30 Days'),
        probationNoticePeriod: variables.probationNoticePeriod || '15 Days',
        confirmedNoticePeriod: variables.confirmedNoticePeriod || '30 Days',
        acceptanceValidityDays: '7',
        probationDaysWords: 'Ninety',
        settlementDays: variables.settlementDays || '30',
        lastWorkingDay: variables.lastWorkingDay || formatOrdinalDate(new Date()),
        cnic: variables.cnic || '—',
        salutation: variables.salutation || '',
        pronounSubject: variables.pronounSubject || 'he',
        pronounObject: variables.pronounObject || 'him',
        pronounPossessive: variables.pronounPossessive || 'his',
        pronounCapitalizedSubject: variables.pronounCapitalizedSubject || 'He',
        pronounCapitalizedPossessive: variables.pronounCapitalizedPossessive || 'His',
        skills: variables.skills || 'technical competence, leadership, and professional diligence',
        generalJobDescription: variables.generalJobDescription || 'core deliverables and engineering excellence',
        purpose: variables.purpose || 'official records and onboarding',
        ...variables
    };

    if (Array.isArray(variables.jobDuties)) {
        mergedVars.jobResponsibilities = variables.jobDuties.map((d: string) => `• ${d}`).join('\n');
    } else if (variables.jobResponsibilities) {
        mergedVars.jobResponsibilities = variables.jobResponsibilities;
    }

    if (mergedVars.basicSalary) mergedVars.basicSalary = formatSalaryNum(mergedVars.basicSalary);
    if (mergedVars.grossSalary) mergedVars.grossSalary = formatSalaryNum(mergedVars.grossSalary);
    if (mergedVars.allowances) mergedVars.allowances = formatSalaryNum(mergedVars.allowances);
    if (mergedVars.reimbursedClaims) mergedVars.reimbursedClaims = formatSalaryNum(mergedVars.reimbursedClaims);
    if (mergedVars.netPay) mergedVars.netPay = formatSalaryNum(mergedVars.netPay);
    if (mergedVars.totalDeductions) mergedVars.totalDeductions = formatSalaryNum(mergedVars.totalDeductions);
    if (mergedVars.taxAmount) mergedVars.taxAmount = formatSalaryNum(mergedVars.taxAmount);
    if (mergedVars.otherDeductions) mergedVars.otherDeductions = formatSalaryNum(mergedVars.otherDeductions);
    if (mergedVars.probationSalary) mergedVars.probationSalary = formatSalaryNum(mergedVars.probationSalary);
    if (mergedVars.confirmedSalary) mergedVars.confirmedSalary = formatSalaryNum(mergedVars.confirmedSalary);
    if (mergedVars.stipend) mergedVars.stipend = formatSalaryNum(mergedVars.stipend);
    if (!mergedVars.noticePeriod) mergedVars.noticePeriod = isInternship ? '15 Days' : '30 Days';

    mergedVars.grossSalaryWords = numberToWords(Number(String(mergedVars.grossSalary || mergedVars.basicSalary || '0').replace(/[^0-9]/g, '')));

    return mergedVars;
};

// 2. Preview or Download Custom PDF with dynamic fields
router.post('/preview-custom-pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            documentType = 'Job Offer Letter',
            recipientName = 'Candidate Name',
            recipientEmail = '',
            variables = {}
        } = req.body;

        const company = await Company.findOne().lean() as any;

        let template = await DocumentTemplate.findOne({
            documentType: { $regex: new RegExp('^' + documentType.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        }).lean() as any;

        if (!template) {
            template = {
                documentType,
                subject: documentType.toUpperCase(),
                content: variables.content || 'Official Document Content'
            };
        }

        const documentId = `PREVIEW-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const clientHost = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/${documentId}`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        const mergedVars = buildDispatcherMergedVars(documentType, recipientName, recipientEmail, variables, company);

        const doc = new (PDFDocument as any)({
            size: 'A4',
            margins: { top: 105, bottom: 40, left: 64, right: 64 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${documentType.replace(/\s+/g, '_')}_${recipientName.replace(/\s+/g, '_')}.pdf"`);
        doc.pipe(res);

        renderCompleteDocument(
            doc,
            documentType,
            template,
            mergedVars,
            company,
            verifyUrl,
            qrCodeDataUri
        );

        doc.end();
    } catch (err) {
        if (!res.headersSent) {
            next(err);
        } else {
            console.error('Error in preview-custom-pdf:', err);
        }
    }
});

// 3. Dispatch Document via Email (with Brevo & PDF attachment)
router.post('/dispatch-email', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const isHrOrAdmin = ['super-admin', 'admin', 'hr'].includes(authReq.user?.role || '');
        if (!isHrOrAdmin) {
            return res.status(403).json({ message: 'Forbidden. HR or Admin permissions required.' });
        }

        const {
            documentType,
            recipientName,
            recipientEmail,
            emailType = 'personal',
            subject,
            emailMessage,
            rolePreset,
            variables = {}
        } = req.body;

        if (!recipientEmail || !recipientEmail.trim()) {
            return res.status(400).json({ message: 'Recipient email address is required.' });
        }
        if (!recipientName || !recipientName.trim()) {
            return res.status(400).json({ message: 'Recipient name is required.' });
        }
        if (!documentType || !documentType.trim()) {
            return res.status(400).json({ message: 'Document type is required.' });
        }

        const company = await Company.findOne().lean() as any;

        let template = await DocumentTemplate.findOne({
            documentType: { $regex: new RegExp('^' + documentType.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        }).lean() as any;

        if (!template) {
            template = {
                documentType,
                subject: subject || documentType,
                content: variables.content || 'Official Document Content'
            };
        }

        const documentId = `DOC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const clientHost = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/${documentId}`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl);

        const mergedVars = buildDispatcherMergedVars(documentType, recipientName, recipientEmail, variables, company);

        // Render PDF to memory Buffer
        const doc = new (PDFDocument as any)({
            size: 'A4',
            margins: { top: 105, bottom: 40, left: 64, right: 64 }
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        
        const pdfPromise = new Promise<Buffer>((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
        });

        renderCompleteDocument(
            doc,
            documentType,
            template,
            mergedVars,
            company,
            verifyUrl,
            qrCodeDataUri
        );

        doc.end();
        const pdfBuffer = await pdfPromise;

        // Save official document verification record
        const targetEmployeeId = variables.employeeId || req.body.employeeId || mergedVars.employeeId || 'N/A';
        const reportingMgrId = variables.reportingManagerId || mergedVars.reportingManagerId || '';
        const reportingMgrName = mergedVars.reportingManager || variables.reportingManager || '';

        await OfficialDocument.create({
            documentId,
            employeeId: targetEmployeeId,
            documentType,
            issueDate: new Date(),
            status: 'Valid',
            generatedBy: authReq.user?.userId || 'System',
            details: {
                recipientName,
                recipientEmail,
                emailType,
                rolePreset,
                designation: mergedVars.designation,
                department: mergedVars.department,
                grossSalary: mergedVars.grossSalary,
                joiningDate: mergedVars.joiningDate,
                reportingManager: reportingMgrName,
                reportingManagerId: reportingMgrId || undefined
            }
        });

        // Auto-assign reporting manager to employee if recipient is an existing employee in the system
        if (reportingMgrId && targetEmployeeId && targetEmployeeId !== 'N/A') {
            try {
                await Employee.findOneAndUpdate(
                    {
                        $or: [
                            { employeeId: targetEmployeeId },
                            ...(mongoose.Types.ObjectId.isValid(targetEmployeeId) ? [{ _id: targetEmployeeId }] : [])
                        ]
                    },
                    { $set: { 'jobInfo.reportingManager': reportingMgrId } }
                );
                logger.info(`[Dispatcher] Auto-assigned reporting manager ${reportingMgrId} to employee ${targetEmployeeId}`);
            } catch (mgrErr) {
                logger.warn('[Dispatcher] Failed to auto-assign reportingManager to employee:', mgrErr);
            }
        }

        const emailSubject = subject || `${documentType}: ${company?.name || 'ITCS'} - ${recipientName}`;
        const customNoteHtml = emailMessage
            ? `<div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 14px 18px; margin: 20px 0; border-radius: 6px; font-size: 14px; color: #334155; line-height: 1.6;">${emailMessage.replace(/\n/g, '<br/>')}</div>`
            : '';

        const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 20px;">
                    <h2 style="color: #1e1b4b; margin: 0; font-size: 22px; font-weight: 800;">${documentType}</h2>
                    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">${company?.name || 'IT Consulting and Services (ITCS)'} • Human Resources</p>
                </div>
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">Dear <strong>${recipientName}</strong>,</p>
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                    Please find attached your official <strong>${documentType}</strong> issued by <strong>${company?.name || 'ITCS'}</strong>.
                </p>
                ${customNoteHtml}
                <div style="background: #f1f5f9; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 13px; color: #475569;">
                        <strong>Document Reference:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${documentId}</code><br/>
                        <strong>Date of Issuance:</strong> ${formatOrdinalDate(new Date())}<br/>
                        ${mergedVars.designation ? `<strong>Position / Role:</strong> ${mergedVars.designation}<br/>` : ''}
                        ${mergedVars.joiningDate ? `<strong>Joining Date:</strong> ${mergedVars.joiningDate}<br/>` : ''}
                        ${reportingMgrName ? `<strong>Reporting Manager:</strong> ${reportingMgrName}<br/>` : ''}
                    </p>
                </div>
                <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                    The attached official document includes a secure cryptographic QR verification code for authenticating this issuance.
                </p>
                <div style="margin: 30px 0 20px 0; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
                    <p style="margin: 0 0 4px 0; font-weight: 700; color: #1e293b;">${mergedVars.signatoryName}</p>
                    <p style="margin: 0 0 4px 0;">${mergedVars.signatoryDesignation}</p>
                    <p style="margin: 0; color: #94a3b8;">${company?.name || 'ITCS'} • <a href="mailto:${mergedVars.hrEmail}" style="color: #4f46e5; text-decoration: none;">${mergedVars.hrEmail}</a></p>
                </div>
            </div>
        `;

        const cleanDocName = documentType.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${cleanDocName}_${recipientName.replace(/\s+/g, '_')}.pdf`;

        const mailResult = await dispatchEmail(
            {
                to: recipientEmail,
                subject: emailSubject,
                html: emailHtml,
                skipStatusCheck: true,
                attachments: [
                    {
                        filename,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            },
            `Document Dispatch: ${documentType} to ${recipientEmail}`
        );

        const dispatchLog = await DocumentDispatchLog.create({
            documentId,
            documentType,
            recipientName,
            recipientEmail,
            emailType,
            subject: emailSubject,
            dispatchedBy: authReq.user?.userId || 'System',
            dispatchedByName: authReq.user?.email || 'HR Department',
            dispatchedAt: new Date(),
            status: mailResult.success ? 'Sent' : 'Failed',
            error: mailResult.error,
            rolePreset,
            salaryDetails: {
                basicSalary: mergedVars.basicSalary,
                grossSalary: mergedVars.grossSalary,
                probationSalary: mergedVars.probationSalary,
                confirmedSalary: mergedVars.confirmedSalary
            },
            metadata: {
                designation: mergedVars.designation,
                department: mergedVars.department,
                joiningDate: mergedVars.joiningDate,
                reportingManager: reportingMgrName,
                reportingManagerId: reportingMgrId || undefined
            }
        });

        // Trigger IT/Tech Team Work Email Provisioning Task if an Offer Letter is dispatched
        const isOfferLetter = documentType.toLowerCase().includes('offer') || 
                              documentType.toLowerCase().includes('contract') || 
                              documentType.toLowerCase().includes('appointment');

        let techTaskCreated = false;
        if (isOfferLetter) {
            try {
                let techEmail = company?.workflowSettings?.techEmail || process.env.TECH_TEAM_EMAIL;
                if (!techEmail) {
                    const adminUser = await User.findOne({ role: { $in: ['admin', 'super-admin'] }, isActive: true }).select('email').lean() as any;
                    techEmail = adminUser?.email || company?.contact?.email || 'hrms@itcs.com.pk';
                }

                const task = await WorkflowTask.create({
                    type: 'Onboarding',
                    targetName: recipientName,
                    targetEmail: recipientEmail,
                    department: 'Tech',
                    title: `Provision Official Email (@itcs.com.pk) for ${recipientName}`,
                    description: `Official ${documentType} (Ref: ${documentId}) generated and sent to ${recipientName}. Designation: ${mergedVars.designation || 'New Hire'}, Department: ${mergedVars.department || 'Unassigned'}, Joining Date: ${mergedVars.joiningDate || 'N/A'}, Reporting Manager: ${reportingMgrName || 'N/A'}, Personal Email: ${recipientEmail}. Please provision their official corporate work email ID (@itcs.com.pk) and Microsoft 365 tenant credentials.`,
                    assignedEmail: techEmail || undefined,
                    status: 'Pending'
                });

                if (techEmail) {
                    const techEmailSubject = `[Action Required] Provision Work Email: ${recipientName} (${mergedVars.designation || 'New Hire'})`;
                    const techEmailHtml = `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                            <div style="margin-bottom: 20px; border-bottom: 2px solid #6366f1; padding-bottom: 12px;">
                                <span style="background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase;">IT Provisioning Request</span>
                                <h2 style="margin: 8px 0 0 0; color: #1e1b4b; font-size: 20px; font-weight: 800;">🚀 New Hire Email Creation Request</h2>
                                <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Triggered by Document Dispatcher (${documentType})</p>
                            </div>

                            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                                An official <strong>${documentType}</strong> (Reference: <code>${documentId}</code>) has been dispatched to <strong>${recipientName}</strong>.
                                Please create and provision their official corporate work email ID (e.g. <code>${recipientName.toLowerCase().replace(/[^a-z0-9]/g, '')}@itcs.com.pk</code>) and configure their Microsoft 365 tenant credentials.
                            </p>

                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Candidate Name:</td><td style="color: #0f172a; font-weight: bold;">${recipientName}</td></tr>
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Personal Email:</td><td style="color: #0f172a;">${recipientEmail}</td></tr>
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Role / Designation:</td><td style="color: #4338ca; font-weight: 700;">${mergedVars.designation || 'N/A'}</td></tr>
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Department:</td><td style="color: #0f172a;">${mergedVars.department || 'N/A'}</td></tr>
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Joining Date:</td><td style="color: #0f172a;">${mergedVars.joiningDate || 'N/A'}</td></tr>
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Reporting Manager:</td><td style="color: #0f172a;">${reportingMgrName || 'N/A'}</td></tr>
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Document Ref:</td><td style="color: #64748b; font-mono;">${documentId}</td></tr>
                                    <tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Dispatched By:</td><td style="color: #0f172a;">${authReq.user?.email || 'HR Department'}</td></tr>
                                </table>
                            </div>

                            <div style="margin: 24px 0 16px; text-align: center;">
                                <a href="${clientHost}/workflow-tasks?dept=Tech" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                                    Open Tech Workflow Tasks in HRM
                                </a>
                            </div>

                            <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; text-align: center;">
                                This is an automated workflow notification generated upon HR offer letter dispatch.
                            </p>
                        </div>
                    `;

                    await dispatchEmail({
                        to: techEmail,
                        subject: techEmailSubject,
                        html: techEmailHtml
                    }, `Tech Provisioning Request for ${recipientName}`);
                }
                techTaskCreated = true;
                logger.info(`[Dispatcher] Created Tech provisioning task ${task._id} & notified ${techEmail} for ${recipientName}`);
            } catch (workflowErr) {
                logger.error('[Dispatcher] Failed to trigger tech provisioning task:', workflowErr);
            }
        }

        res.json({
            success: true,
            message: isOfferLetter
                ? `Document dispatched to ${recipientEmail} and email provisioning request sent to Tech team!`
                : `Document dispatched successfully to ${recipientEmail} (${emailType} email)`,
            documentId,
            logId: dispatchLog._id,
            recipientEmail,
            techTaskCreated
        });

    } catch (err: any) {
        logger.error('❌ Failed to dispatch document email:', err);
        next(err);
    }
});

// 4. Get dispatch logs
router.get('/dispatch-logs', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const logs = await DocumentDispatchLog.find().sort({ dispatchedAt: -1 }).limit(100).lean();
        res.json(logs);
    } catch (err) {
        next(err);
    }
});

export { renderCompleteDocument, drawLetterhead, renderBulletOrKeyValue, renderRichText };
export default router;

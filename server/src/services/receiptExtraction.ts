import { createWorker, type Worker } from 'tesseract.js';
import logger from '../utils/logger';

export const RECEIPT_MAX_AGE_DAYS = 45;

export type ReceiptExtractionResult = {
    extractedDate: Date | null;
    extractedAmount: number | null;
    extractedCurrency: string | null;
    merchantName: string | null;
    extractionStatus: 'success' | 'partial' | 'failed';
    extractionError?: string;
    confidence: 'high' | 'medium' | 'low' | 'none';
};

export type ReceiptAnalysisSummary = {
    analyzedAt: Date;
    receiptCount: number;
    successfulExtractions: number;
    totalExtractedAmount: number | null;
    oldestReceiptDate: Date | null;
    maxReceiptAgeDays: number | null;
    amountRequested: number;
    amountAllowed: number;
    issues: string[];
};

// Reuse one OCR worker per process to avoid cold-start on every receipt
let ocrWorkerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
    if (!ocrWorkerPromise) {
        ocrWorkerPromise = (async () => {
            const worker = await createWorker('eng');
            return worker;
        })();
    }
    return ocrWorkerPromise;
}

async function extractTextFromBuffer(buffer: Buffer, contentType?: string): Promise<string> {
    const mimeType = contentType || 'application/octet-stream';

    if (mimeType === 'application/pdf') {
        const pdfParse = require('pdf-parse');
        const parsePdf = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
        const data = await parsePdf(buffer);
        return (data?.text || '').trim();
    }

    if (mimeType.startsWith('image/')) {
        const worker = await getOcrWorker();
        await worker.setParameters({
            tessedit_pageseg_mode: 6 as any, // PSM.SINGLE_BLOCK — uniform text block (thermal receipts)
        });
        const { data } = await worker.recognize(buffer);
        return (data?.text || '').trim();
    }

    return buffer.toString('utf-8').slice(0, 12000).trim();
}

const MONTH_MAP: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
};

function buildDate(y: number, m: number, d: number): Date | null {
    if (m < 0 || m > 11 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    const date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
    return date;
}

function parseNumericDate(parts: number[]): Date | null {
    if (parts.length !== 3) return null;
    const [a, b, c] = parts;

    // YYYY-MM-DD
    if (a > 31 && b <= 12 && c <= 31) return buildDate(a, b - 1, c);
    // DD-MM-YYYY or MM-DD-YYYY — prefer DD-MM-YYYY (common in PK)
    if (c > 31) {
        if (a <= 31 && b <= 12) return buildDate(c, b - 1, a);
        if (b <= 31 && a <= 12) return buildDate(c, a - 1, b);
    }
    // YY-MM-DD
    if (a <= 31 && b <= 12 && c < 100) return buildDate(2000 + c, b - 1, a);

    return null;
}

/** Fix common OCR digit mistakes in number strings (S→5, O→0, etc.) */
function sanitizeOcrNumberString(raw: string): string {
    // Remove currency prefixes first to avoid turning the 's' in 'Rs' into '5'
    const withoutCurrency = raw.replace(/(?:rs\.?|pkr|₨)/gi, '');

    return withoutCurrency
        .replace(/[Oo]/g, '0')
        .replace(/[Ss](?=\d)/g, '5')
        .replace(/[Il|](?=\d)/g, '1')
        .replace(/[Bb](?=\d)/g, '8')
        .replace(/[Zz](?=\d)/g, '2')
        .replace(/[^\d., ]/g, ''); // Keep spaces to prevent merging numbers on the same line
}

function parseNamedMonthDate(day: number, monthStr: string, year: number, referenceDate: Date): Date | null {
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month === undefined) return null;
    if (year < 100) year += 2000;
    let d = buildDate(year, month, day);
    if (!d) return null;
    // OCR often misreads 4 as 6 in years (2024 → 2026) — correct future dates
    if (d > referenceDate) {
        for (const delta of [2, 1, 3, 4]) {
            const fixed = buildDate(year - delta, month, day);
            if (fixed && fixed <= referenceDate && fixed >= new Date(1990, 0, 1)) return fixed;
        }
    }
    return d <= referenceDate ? d : null;
}

function extractDatesFromText(text: string, referenceDate: Date = new Date()): { dates: Date[]; labeledDate: Date | null } {
    const found: Date[] = [];
    let labeledDate: Date | null = null;
    const normalized = text.replace(/\s+/g, ' ');

    // "Date 18-May-2024" or "Date: 18-May-2024 10:25 PM" (Pakistani pharmacy format)
    const labeledPatterns = [
        /Date\s*:?\s*(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})/gi,
        /Date\s*:?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/gi,
        /Date\s*:?\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/gi,
    ];

    for (const pattern of labeledPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            let d: Date | null = null;
            if (/[A-Za-z]/.test(match[2])) {
                d = parseNamedMonthDate(parseInt(match[1], 10), match[2], parseInt(match[3], 10), referenceDate);
            } else {
                d = parseNumericDate([parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)]);
                if (d && d > referenceDate) {
                    const fixed = parseNumericDate([parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10) - 2]);
                    if (fixed && fixed <= referenceDate) d = fixed;
                }
            }
            if (d) {
                found.push(d);
                if (!labeledDate) labeledDate = d;
            }
        }
    }

    const numericPatterns = [
        /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/g,
        /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,
    ];

    for (const pattern of numericPatterns) {
        let match;
        while ((match = pattern.exec(normalized)) !== null) {
            const nums = match.slice(1).map(n => parseInt(n, 10));
            const d = parseNumericDate(nums);
            if (d && d <= referenceDate) found.push(d);
        }
    }

    // DD-MMM-YYYY e.g. 18-May-2024
    const hyphenNamed = /\b(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})\b/g;
    let hyphenMatch;
    while ((hyphenMatch = hyphenNamed.exec(text)) !== null) {
        const d = parseNamedMonthDate(
            parseInt(hyphenMatch[1], 10),
            hyphenMatch[2],
            parseInt(hyphenMatch[3], 10),
            referenceDate
        );
        if (d) found.push(d);
    }

    const namedPattern = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/g;
    let namedMatch;
    while ((namedMatch = namedPattern.exec(normalized)) !== null) {
        const d = parseNamedMonthDate(
            parseInt(namedMatch[1], 10),
            namedMatch[2],
            parseInt(namedMatch[3], 10),
            referenceDate
        );
        if (d) found.push(d);
    }

    return { dates: found, labeledDate };
}

function pickBestReceiptDate(
    dates: Date[],
    referenceDate: Date,
    labeledDate?: Date | null,
    expenseDateHint?: Date | null
): Date | null {
    const candidates: Date[] = [...dates];
    if (labeledDate) candidates.push(labeledDate);

    // OCR often misreads year digits — generate ±1/±2 year variants for labeled dates
    const seed = labeledDate ? [labeledDate] : dates.slice(0, 3);
    for (const d of seed) {
        for (const delta of [2, 1, 3, 4]) {
            const adjusted = new Date(d);
            adjusted.setFullYear(adjusted.getFullYear() - delta);
            if (adjusted >= new Date(1990, 0, 1) && adjusted <= referenceDate) candidates.push(adjusted);
        }
    }

    const unique = candidates.filter(
        (d, i, arr) => arr.findIndex(x => x.getTime() === d.getTime()) === i
    );
    const valid = unique.filter(d => d <= referenceDate && d >= new Date(1990, 0, 1));
    if (valid.length === 0) return null;

    // Prefer date closest to user-entered expense date (helps correct OCR year errors)
    if (expenseDateHint && !Number.isNaN(expenseDateHint.getTime())) {
        let best: Date | null = null;
        let bestDiff = Infinity;
        for (const d of valid) {
            const diff = Math.abs(d.getTime() - expenseDateHint.getTime());
            if (diff < bestDiff) {
                bestDiff = diff;
                best = d;
            }
        }
        if (best && bestDiff < 120 * 24 * 60 * 60 * 1000) return best;
    }

    valid.sort((a, b) => b.getTime() - a.getTime());
    return valid[0];
}

function parseAmountToken(raw: string): number | null {
    const cleaned = sanitizeOcrNumberString(raw).replace(/,/g, '').trim();
    const n = parseFloat(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function isDateOrTimeLine(line: string): boolean {
    return /^\s*Date\s*:?/i.test(line) || /\d{1,2}-[A-Za-z]{3,9}-\d{4}/i.test(line) || /\d{1,2}:\d{2}/.test(line);
}

function extractAmountFromLine(line: string, requireDecimal = false): number | null {
    if (isDateOrTimeLine(line)) return null;

    const sanitized = sanitizeOcrNumberString(line);
    // Remove commas before matching regex (e.g. 2,333.24 becomes 2333.24)
    const cleanForRegex = sanitized.replace(/,/g, '');

    // Prefer amounts with 1 or 2 decimal places (508.2, 508.02) — exclude time-like values (10.25)
    const decimalMatches = [...cleanForRegex.matchAll(/(\d{1,8}\.\d{1,2})/g)];
    if (decimalMatches.length > 0) {
        const amounts = decimalMatches
            .map(m => parseFloat(m[1]))
            .filter(n => n >= 1 && n < 1_000_000 && !(n < 24 && cleanForRegex.includes(':')));
        if (amounts.length > 0) return Math.max(...amounts);
    }
    if (requireDecimal) return null;

    const intMatches = [...cleanForRegex.matchAll(/(\d{2,8})/g)];
    const ints = intMatches.map(m => parseFloat(m[1])).filter(n => n >= 10 && n < 1_000_000);
    return ints.length > 0 ? Math.max(...ints) : null;
}

function extractAllAmounts(text: string): number[] {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const found: number[] = [];
    for (const line of lines) {
        if (isDateOrTimeLine(line)) continue;
        const sanitized = sanitizeOcrNumberString(line);
        const cleanForRegex = sanitized.replace(/,/g, '');
        
        // Find decimal amounts (allow 1 or 2 decimal digits to handle OCR misreads like 333.4)
        const decimalMatches = [...cleanForRegex.matchAll(/(\d{1,8}\.\d{1,2})/g)];
        for (const m of decimalMatches) {
            const val = parseFloat(m[1]);
            if (Number.isFinite(val) && val >= 1 && val < 1_000_000) {
                found.push(val);
            }
        }
        
        // Find integer amounts
        const intMatches = [...cleanForRegex.matchAll(/(\d{2,8})/g)];
        for (const m of intMatches) {
            const val = parseFloat(m[1]);
            if (Number.isFinite(val) && val >= 10 && val < 1_000_000) {
                found.push(val);
            }
        }
    }
    // Return unique values
    return found.filter((val, i, arr) => arr.indexOf(val) === i);
}

function getCorrectedOcrAmount(priorityAmount: number, allCandidates: number[]): number {
    let best = priorityAmount;
    for (const cand of allCandidates) {
        if (cand <= priorityAmount) continue;
        
        const priStr = priorityAmount.toFixed(2);
        const candStr = cand.toFixed(2);
        
        // Suffix match (e.g. 333.24 matches 2333.24)
        if (candStr.endsWith(priStr)) {
            return cand;
        }
        
        // Match if the difference is a round thousand
        const diff = cand - priorityAmount;
        if (diff > 0 && diff % 1000 === 0) {
            return cand;
        }
        
        // Match if integer part is a suffix (e.g. 333 matches 2333)
        const priInt = Math.floor(priorityAmount).toString();
        const candInt = Math.floor(cand).toString();
        
        // Require at least 3 digits to avoid accidental small match (e.g. 10 matching 1010)
        if (priInt.length >= 3 && candInt.endsWith(priInt)) {
            return cand;
        }
    }
    return best;
}

function extractTotalAmount(text: string, amountHint?: number | null): { amount: number | null; confidence: 'high' | 'medium' | 'low' } {
    // If a hint is provided, search all candidate amounts for one close to the hint
    if (amountHint && amountHint > 0) {
        const candidates = extractAllAmounts(text);
        let bestCandidate: number | null = null;
        let bestDiff = Infinity;
        
        for (const cand of candidates) {
            const diff = Math.abs(cand - amountHint);
            // Allow up to 15% discrepancy or matching digits
            if (diff < bestDiff && (diff / amountHint < 0.15 || Math.abs(cand - amountHint) < 50)) {
                bestDiff = diff;
                bestCandidate = cand;
            }
        }
        
        if (bestCandidate !== null) {
            return { amount: bestCandidate, confidence: 'high' };
        }
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Priority-ordered keywords — PK pharmacy receipts (tolerant of OCR typos like "valle")
    const priorityPatterns: { pattern: RegExp; confidence: 'high' | 'medium' | 'low'; requireDecimal?: boolean }[] = [
        { pattern: /net\s*val\w*\s*after\s*discount/i, confidence: 'high' },
        { pattern: /net\s*total/i, confidence: 'high', requireDecimal: true },
        { pattern: /grand\s*total|gross\s*total/i, confidence: 'high', requireDecimal: true },
        { pattern: /invoice\s*val\w*/i, confidence: 'high' },
        { pattern: /gross\s*r\w*\s*val\w*/i, confidence: 'medium' },
        { pattern: /amount\s*due|payable|balance\s*due/i, confidence: 'medium' },
    ];

    let bestAmount: number | null = null;
    let bestConfidence: 'high' | 'medium' | 'low' = 'low';

    // Use first match by priority (Net Total before line-item numbers)
    for (const { pattern, confidence, requireDecimal } of priorityPatterns) {
        for (const line of lines) {
            if (!pattern.test(line)) continue;
            const amt = extractAmountFromLine(line, !!requireDecimal);
            if (amt !== null && amt > 0) {
                bestAmount = amt;
                bestConfidence = confidence;
                break;
            }
        }
        if (bestAmount !== null) break;
    }

    // Lines with currency symbol + number
    if (bestAmount === null) {
        const currencyLines = lines.filter(l => /(?:rs\.?|pkr|₨)/i.test(l));
        for (const line of currencyLines) {
            const amt = extractAmountFromLine(line);
            if (amt !== null && amt > 0 && (bestAmount === null || amt > bestAmount)) {
                bestAmount = amt;
                bestConfidence = 'medium';
            }
        }
    }

    // Fallback: scan non-date lines for XX.XX amounts
    if (bestAmount === null) {
        const nonDateLines = lines.filter(l => !isDateOrTimeLine(l));
        for (const line of nonDateLines) {
            const amt = extractAmountFromLine(line);
            if (amt !== null && amt > 0 && (bestAmount === null || amt > bestAmount)) {
                bestAmount = amt;
                bestConfidence = 'low';
            }
        }
    }

    // Run suffix alignment/left-cutoff correction heuristics
    if (bestAmount !== null) {
        const allCandidates = extractAllAmounts(text);
        bestAmount = getCorrectedOcrAmount(bestAmount, allCandidates);
    }

    return { amount: bestAmount, confidence: bestConfidence };
}

function extractMerchantName(text: string): string | null {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length >= 3);
    // First non-empty line is often the store name on thermal receipts
    const candidate = lines.find(l => !/^(date|time|invoice|receipt|bill|tel|phone|ntn|strn)/i.test(l));
    return candidate ? candidate.slice(0, 80) : null;
}

export function parseReceiptText(
    text: string,
    referenceDate: Date = new Date(),
    expenseDateHint?: Date | null,
    amountHint?: number | null
): Omit<ReceiptExtractionResult, 'extractionError'> {
    if (!text || text.trim().length < 5) {
        return {
            extractedDate: null,
            extractedAmount: null,
            extractedCurrency: 'PKR',
            merchantName: null,
            extractionStatus: 'failed',
            confidence: 'none',
        };
    }

    const { dates, labeledDate } = extractDatesFromText(text, referenceDate);
    const extractedDate = pickBestReceiptDate(dates, referenceDate, labeledDate, expenseDateHint);
    const { amount: extractedAmount, confidence: amountConfidence } = extractTotalAmount(text, amountHint);
    const merchantName = extractMerchantName(text);

    const hasDate = extractedDate !== null;
    const hasAmount = extractedAmount !== null;

    let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
    if (hasDate && hasAmount && amountConfidence === 'high') confidence = 'high';
    else if (hasDate && hasAmount) confidence = 'medium';
    else if (hasDate || hasAmount) confidence = 'low';

    return {
        extractedDate,
        extractedAmount,
        extractedCurrency: 'PKR',
        merchantName,
        extractionStatus: hasDate && hasAmount ? 'success' : hasDate || hasAmount ? 'partial' : 'failed',
        confidence,
    };
}

function daysBetween(older: Date, newer: Date): number {
    const ms = newer.getTime() - older.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export async function extractReceiptData(
    buffer: Buffer,
    fileName: string,
    contentType?: string,
    expenseDateHint?: Date | null,
    amountHint?: number | null
): Promise<ReceiptExtractionResult> {
    try {
        const text = await extractTextFromBuffer(buffer, contentType);
        const parsed = parseReceiptText(text, new Date(), expenseDateHint, amountHint);

        if (parsed.extractionStatus === 'failed') {
            logger.warn(`[ReceiptOCR] Low text yield from ${fileName} (${text.length} chars)`);
            return {
                ...parsed,
                extractionError: text.length < 5 ? 'Could not read text from receipt image' : 'Could not find date or amount in receipt text',
            };
        }

        return parsed;
    } catch (err: any) {
        logger.error(`[ReceiptOCR] Failed to extract from ${fileName}:`, err?.message || err);
        return {
            extractedDate: null,
            extractedAmount: null,
            extractedCurrency: null,
            merchantName: null,
            extractionStatus: 'failed',
            extractionError: err?.message || 'OCR extraction failed',
            confidence: 'none',
        };
    }
}

export type AnalyzedReceipt = {
    fileName: string;
    contentType?: string;
    fileData: Buffer;
    uploadedAt: Date;
    extractedDate?: Date;
    extractedAmount?: number;
    extractedCurrency?: string;
    merchantName?: string;
    receiptAgeDays?: number;
    extractionStatus?: string;
    extractionError?: string;
    extractionConfidence?: string;
};

export function analyzeReceipts(
    receipts: AnalyzedReceipt[],
    amountRequested: number,
    amountAllowed: number,
    referenceDate: Date = new Date(),
    expenseDate?: Date | null
): { flags: string[]; receiptAnalysis: ReceiptAnalysisSummary; receipts: AnalyzedReceipt[] } {
    const flags: string[] = [];
    const issues: string[] = [];
    let totalExtractedAmount = 0;
    let hasAnyAmount = false;
    let oldestReceiptDate: Date | null = null;
    let maxReceiptAgeDays: number | null = null;
    let successfulExtractions = 0;
    let hasExtractionFailure = false;
    let hasUnreadableDate = false;

    const enriched = receipts.map(r => {
        const copy = { ...r };
        if (r.extractionStatus === 'success' || r.extractionStatus === 'partial') {
            successfulExtractions += 1;
        } else if (receipts.length > 0) {
            hasExtractionFailure = true;
        }

        if (r.extractedDate) {
            const ageDays = daysBetween(r.extractedDate, referenceDate);
            copy.receiptAgeDays = ageDays;
            if (oldestReceiptDate === null || r.extractedDate < oldestReceiptDate) {
                oldestReceiptDate = r.extractedDate;
            }
            if (maxReceiptAgeDays === null || ageDays > maxReceiptAgeDays) {
                maxReceiptAgeDays = ageDays;
            }
            if (ageDays > RECEIPT_MAX_AGE_DAYS) {
                issues.push(`Receipt "${r.fileName}" is ${ageDays} days old (limit: ${RECEIPT_MAX_AGE_DAYS} days)`);
            }
        } else if (r.extractionStatus === 'failed' || r.extractionStatus === 'partial') {
            hasUnreadableDate = true;
        }

        if (typeof r.extractedAmount === 'number') {
            totalExtractedAmount += r.extractedAmount;
            hasAnyAmount = true;
        }

        return copy;
    });

    if (receipts.length > 0) {
        if (maxReceiptAgeDays !== null && maxReceiptAgeDays > RECEIPT_MAX_AGE_DAYS) {
            flags.push('ReceiptOlderThan45Days');
        }
        if (hasUnreadableDate && receipts.length > 0) {
            flags.push('ReceiptDateUnreadable');
            issues.push('Could not read the date on one or more receipts — verify manually');
        }
        if (hasAnyAmount && totalExtractedAmount > amountAllowed) {
            flags.push('ReceiptTotalExceedsQuota');
            issues.push(
                `Receipt total PKR ${totalExtractedAmount.toLocaleString('en-PK')} exceeds allowed quota PKR ${amountAllowed.toLocaleString('en-PK')}`
            );
        }
        if (hasAnyAmount && totalExtractedAmount > amountRequested) {
            flags.push('ReceiptTotalExceedsRequested');
            issues.push(
                `Receipt total PKR ${totalExtractedAmount.toLocaleString('en-PK')} exceeds requested amount PKR ${amountRequested.toLocaleString('en-PK')}`
            );
        }
        if (hasExtractionFailure && successfulExtractions === 0) {
            flags.push('ReceiptExtractionFailed');
            issues.push('Could not extract amounts/dates from receipts — manual review required');
        }

        // Compare scanned receipt date vs user-entered expense date
        if (expenseDate && oldestReceiptDate) {
            const receiptDt: Date = oldestReceiptDate;
            const expenseDt: Date = expenseDate;
            const earlier = receiptDt < expenseDt ? receiptDt : expenseDt;
            const later = receiptDt < expenseDt ? expenseDt : receiptDt;
            const diffDays = Math.abs(daysBetween(earlier, later));
            if (diffDays > 30) {
                flags.push('ReceiptDateMismatch');
                issues.push(
                    `Receipt date (${receiptDt.toLocaleDateString('en-PK')}) does not match expense date (${expenseDt.toLocaleDateString('en-PK')})`
                );
            }
        }
    }

    return {
        flags,
        receiptAnalysis: {
            analyzedAt: referenceDate,
            receiptCount: receipts.length,
            successfulExtractions,
            totalExtractedAmount: hasAnyAmount ? totalExtractedAmount : null,
            oldestReceiptDate,
            maxReceiptAgeDays,
            amountRequested,
            amountAllowed,
            issues,
        },
        receipts: enriched,
    };
}

export async function extractAndAnalyzeReceipts(
    rawReceipts: { fileName: string; contentType?: string; fileData: Buffer }[],
    amountRequested: number,
    amountAllowed: number,
    expenseDate?: Date | null
): Promise<{ flags: string[]; receiptAnalysis: ReceiptAnalysisSummary; receipts: AnalyzedReceipt[] }> {
    const referenceDate = new Date();
    const analyzed: AnalyzedReceipt[] = [];

    for (const r of rawReceipts) {
        const extraction = await extractReceiptData(r.fileData, r.fileName, r.contentType, expenseDate, amountRequested);
        analyzed.push({
            fileName: r.fileName,
            contentType: r.contentType,
            fileData: r.fileData,
            uploadedAt: new Date(),
            extractedDate: extraction.extractedDate ?? undefined,
            extractedAmount: extraction.extractedAmount ?? undefined,
            extractedCurrency: extraction.extractedCurrency ?? undefined,
            merchantName: extraction.merchantName ?? undefined,
            extractionStatus: extraction.extractionStatus,
            extractionError: extraction.extractionError,
            extractionConfidence: extraction.confidence,
        });
    }

    return analyzeReceipts(analyzed, amountRequested, amountAllowed, referenceDate, expenseDate);
}

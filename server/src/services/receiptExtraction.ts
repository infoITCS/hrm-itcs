import { createWorker, type Worker } from 'tesseract.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
            const cachePath = path.join(os.tmpdir(), 'tesseract-cache');
            try {
                if (!fs.existsSync(cachePath)) {
                    fs.mkdirSync(cachePath, { recursive: true });
                }
            } catch (err) {
                logger.warn(`[ReceiptOCR] Failed to create cache dir: ${err}`);
            }

            // Safely resolve the root 'server' directory in both Vercel (/var/task/server) and local environments
            const serverRoot = path.join(__dirname, '..', '..');

            // Force Vercel NFT to bundle WASM files from node_modules
            // We use fs.readFileSync because require.resolve fails on packages without exports
            try {
                fs.readFileSync(path.join(serverRoot, 'node_modules', 'tesseract.js-core', 'tesseract-core-relaxedsimd.wasm'));
                fs.readFileSync(path.join(serverRoot, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm'));
            } catch (e) {}

            const worker = await createWorker('eng', 1, {
                cachePath,
                langPath: serverRoot,
                cacheMethod: 'none',
                gzip: false
            });
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
            tessedit_pageseg_mode: 4 as any, // PSM.SINGLE_COLUMN — much better for receipts than SINGLE_BLOCK
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

function isNoiseOrMetadataLine(line: string): boolean {
    if (isDateOrTimeLine(line)) return true;

    // Standalone time (e.g. 11:37:12, 09:45 AM)
    if (/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\s*$/i.test(line)) return true;

    // Phone / Mobile / Fax / WhatsApp / Helpline numbers
    if (/(?:ph(?:one)?|tel|mobile|cell|fax|whatsapp|contact|helpline)[:\s#-]*[\d\- ]+/i.test(line)) return true;
    if (/\b(?:03\d{2}[- ]?\d{7}|0[245]\d{1,2}[- ]?\d{6,8}|\+92\d{10})\b/.test(line)) return true;
    if (/\b0\d{2,4}[- ]?\d{6,8}\b/.test(line)) return true; // e.g. 051-2315147, 042-37426911, 0330-8553433

    // Tax / Regulatory / License / NTN / CNIC / STRN lines
    if (/(?:ntn|strn|tin|tax\s*id|reg(?:istration)?\s*no|cnic|nic|license|lic|dsl)[:\s#\-\/]*[\w\d\-\/]+/i.test(line)) return true;
    if (/\b\d{5}-\d{7}-\d\b/.test(line)) return true; // CNIC format

    // Software vendor / footer notices / disclaimers
    if (/(?:software\s*developed|developed\s*by|powered\s*by|abuzar|consultancy|pos\s*solution|thank\s*you|visiting\s*us|cannot\s*be\s*refunded|fridge\s*item|strip\s*cannot|terms\s*&\s*conditions|no\s*refund|customer\s*copy|merchant\s*copy)/i.test(line)) return true;

    // Invoice / Bill / Order / Serial numbers / Barcode / Tokens / Table numbers
    if (/^\s*(?:inv(?:oice)?|bill|receipt|token|slip|order|trans(?:action)?|sr|s\.?no|serial|batch|lane|counter|terminal|shift|table|tbl|chk|check|ref)[\s.#:]*\w*\d+/i.test(line) && !/(?:total|payable|net|due|paid|amount)/i.test(line)) return true;

    // Address lines (without financial totals)
    if (/(?:street|shop|road|avenue|floor|block|market|chistiaabad|hajj\s*camp|islamabad|karachi|lahore|rawalpindi|peshawar|multan|plaza|sector|building)/i.test(line) && !/(?:total|amount|net|gross|rs|pkr|₨)/i.test(line)) return true;

    // Header table labels
    if (/^\s*(?:item\s*name|description|particulars|qty|quantity|unit\s*price|rate|m\/s|remarks|ref|dr|cr|sr|sno)\b/i.test(line)) return true;

    return false;
}

function extractAllAmountsFromLine(line: string): number[] {
    if (isNoiseOrMetadataLine(line)) return [];

    const sanitized = sanitizeOcrNumberString(line);
    const cleanForRegex = sanitized.replace(/,/g, '');

    const results: number[] = [];

    // Decimal numbers (e.g. 5255.00, 5531.12, 276.56)
    const decimalMatches = [...cleanForRegex.matchAll(/(\d{1,8}\.\d{1,2})/g)];
    for (const m of decimalMatches) {
        const val = parseFloat(m[1]);
        if (Number.isFinite(val) && val >= 1 && val < 1_000_000 && !(val < 24 && cleanForRegex.includes(':'))) {
            results.push(val);
        }
    }

    // Integers >= 10 (e.g. 5255, 560, 1399)
    const intMatches = [...cleanForRegex.matchAll(/(\d{2,8})/g)];
    for (const m of intMatches) {
        const val = parseFloat(m[1]);
        if (Number.isFinite(val) && val >= 10 && val < 1_000_000) {
            // Exclude standalone calendar years (1990-2099) when no financial currency or total keywords are on the line
            const isStandaloneYear = val >= 1990 && val <= 2099 && !/(?:total|net|gross|paid|cash|rs|pkr|₨|amount|bill)/i.test(line);
            if (!isStandaloneYear && !results.some(d => Math.floor(d) === val)) {
                results.push(val);
            }
        }
    }

    return results;
}

function extractTotalAmount(text: string, amountHint?: number | null): { amount: number | null; confidence: 'high' | 'medium' | 'low' } {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const totalLinesCount = lines.length;

    const priorityPatterns: { pattern: RegExp; confidence: 'high' | 'medium' | 'low'; baseScore: number }[] = [
        { pattern: /net\s*(?:total|payable|amount|bill|val\w*|amt)/i, confidence: 'high', baseScore: 120 },
        { pattern: /net\s*val\w*\s*after\s*discount/i, confidence: 'high', baseScore: 120 },
        { pattern: /cash\s*(?:received|paid|tendered|amount)/i, confidence: 'high', baseScore: 115 },
        { pattern: /paid\s*amount|amount\s*paid|\bpaid\b[\s:]*[\d,.]+/i, confidence: 'high', baseScore: 110 },
        { pattern: /grand\s*total|gross\s*total|bill\s*total|total\s*bill/i, confidence: 'high', baseScore: 90 },
        { pattern: /total\s*(?:amount|payable|due|rs\.?|pkr|₨)/i, confidence: 'high', baseScore: 85 },
        { pattern: /\btotal\b\s*[:=]?\s*[\d,.]+/i, confidence: 'high', baseScore: 80 },
        { pattern: /amount\s*due|balance\s*due|payable/i, confidence: 'medium', baseScore: 75 },
        { pattern: /invoice\s*val\w*/i, confidence: 'medium', baseScore: 70 },
        { pattern: /sub\s*total/i, confidence: 'medium', baseScore: 50 },
    ];

    interface Candidate {
        amount: number;
        score: number;
        confidence: 'high' | 'medium' | 'low';
        sourceLine: string;
        lineIndex: number;
    }

    const candidates: Candidate[] = [];

    lines.forEach((line, lineIndex) => {
        if (isNoiseOrMetadataLine(line)) return;

        const isBottomHalf = lineIndex >= totalLinesCount * 0.4;
        const lineAmounts = extractAllAmountsFromLine(line);
        if (lineAmounts.length === 0) return;

        const matchedPattern = priorityPatterns.find(p => p.pattern.test(line));

        for (const amt of lineAmounts) {
            let score = 0;
            let confidence: 'high' | 'medium' | 'low' = 'low';

            if (matchedPattern) {
                score += matchedPattern.baseScore;
                confidence = matchedPattern.confidence;
            } else if (/(?:rs\.?|pkr|₨|\$)/i.test(line)) {
                score += 40;
                confidence = 'medium';
            } else {
                score += 5;
            }

            if (isBottomHalf) score += 10;

            if (!Number.isInteger(amt) || line.includes('.00') || line.includes('.0')) {
                score += 15;
            }

            if (amountHint && amountHint > 0) {
                const diff = Math.abs(amt - amountHint);
                if (diff === 0 || diff < 0.5) {
                    score += 90;
                    confidence = 'high';
                } else if (diff <= amountHint * 0.05) {
                    score += 40;
                } else if (amt > amountHint * 2.5 && !matchedPattern) {
                    score -= 80;
                }
            }

            if (amt <= 10 && /items?|qty|pcs/i.test(line)) {
                score -= 60;
            }

            candidates.push({
                amount: amt,
                score,
                confidence,
                sourceLine: line,
                lineIndex,
            });
        }
    });

    if (candidates.length === 0) {
        return { amount: null, confidence: 'low' };
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];

    // Enforce financial relevance threshold:
    // If top candidate has low score and no matching financial pattern, return null
    if (top.score < 35) {
        return { amount: null, confidence: 'low' };
    }

    return { amount: top.amount, confidence: top.confidence };
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

async function extractWithGeminiVision(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    expenseDateHint?: Date | null,
    amountHint?: number | null
): Promise<ReceiptExtractionResult | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
        const base64Data = buffer.toString('base64');
        let effectiveMime = mimeType || 'image/jpeg';
        const lowerName = (fileName || '').toLowerCase();
        if (lowerName.endsWith('.png')) effectiveMime = 'image/png';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) effectiveMime = 'image/jpeg';
        else if (lowerName.endsWith('.webp')) effectiveMime = 'image/webp';
        else if (lowerName.endsWith('.pdf')) effectiveMime = 'application/pdf';

        const currentYear = new Date().getFullYear();
        const prompt = `You are an expert accountant auditing medical, travel, and business expense receipts.
Analyze this document (which may contain one or multiple pages/slips, such as a doctor consultation slip + pharmacy medicines bill) and extract a JSON object with:
- "merchantName": Name of the primary clinic, pharmacy, hospital, restaurant, vendor, or store. If multiple, combine them (e.g. "Elaaj Hospital / Khan Pharmacy").
- "receiptDate": Date of transaction in YYYY-MM-DD format. IMPORTANT: The current year is ${currentYear}. Handwritten 2-digit years like '/26' represent 2026 (never future years like 2028). The date must be on or before today.
- "totalAmount": Numeric total of ALL bills/payments in this document. If there are multiple slips (e.g. Doctor consultation fee RS 2,000 on slip 1 + Pharmacy bill RS 11,247 on slip 2), SUM THEM TOGETHER (2000 + 11247 = 13247).
- "currency": Currency code (e.g. "PKR", "USD", "EUR" - default "PKR").
- "isReceipt": boolean (true if contains genuine financial receipt/bill/prescription payment, false if completely non-financial).
- "confidence": "high" | "medium" | "low".

Return ONLY a valid JSON object matching this structure:
{"merchantName": "...", "receiptDate": "YYYY-MM-DD", "totalAmount": 13247.00, "currency": "PKR", "isReceipt": true, "confidence": "high"}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                inlineData: {
                                    mimeType: effectiveMime,
                                    data: base64Data
                                }
                            },
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    response_mime_type: 'application/json',
                    temperature: 0.1
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            logger.warn(`[ReceiptOCR] Gemini Vision API error (${response.status}): ${errText}`);
            return null;
        }

        const data: any = await response.json();
        const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) return null;

        logger.info(`[ReceiptOCR] Gemini Vision response for ${fileName}: ${jsonText.trim()}`);

        const parsed = JSON.parse(jsonText);
        if (!parsed || parsed.isReceipt === false) {
            return {
                extractedDate: null,
                extractedAmount: null,
                extractedCurrency: 'PKR',
                merchantName: null,
                extractionStatus: 'failed',
                extractionError: 'Image is not a financial receipt or contains no payment data',
                confidence: 'none'
            };
        }

        // Support various date key aliases
        const rawDate = parsed.receiptDate ?? parsed.date ?? parsed.invoiceDate ?? parsed.billDate ?? parsed.transactionDate;
        let parsedDate: Date | null = null;
        if (rawDate && typeof rawDate === 'string') {
            const dt = new Date(rawDate);
            if (!isNaN(dt.getTime())) {
                const today = new Date();
                // If OCR misread handwritten year (e.g. 26 as 28 -> 2028), clamp back to current year
                if (dt.getFullYear() > currentYear) {
                    dt.setFullYear(currentYear);
                }
                // If date is still in the future (e.g. 28th vs 18th), use expenseDateHint or today
                if (dt > today) {
                    if (expenseDateHint && expenseDateHint <= today) {
                        parsedDate = new Date(expenseDateHint);
                    } else {
                        parsedDate = new Date(today);
                    }
                } else {
                    parsedDate = dt;
                }
            }
        }

        // Support various amount key aliases and parse string numbers (e.g. "5,255.00", "PKR 5255")
        const rawAmount = parsed.totalAmount ?? parsed.total ?? parsed.amount ?? parsed.grandTotal ?? parsed.netTotal ?? parsed.netAmount ?? parsed.paidAmount ?? parsed.billAmount;
        let numAmount: number | null = null;
        if (typeof rawAmount === 'number' && Number.isFinite(rawAmount) && rawAmount > 0) {
            numAmount = rawAmount;
        } else if (typeof rawAmount === 'string') {
            const cleaned = rawAmount.replace(/,/g, '').replace(/[^0-9.]/g, '');
            const val = parseFloat(cleaned);
            if (Number.isFinite(val) && val > 0) {
                numAmount = val;
            }
        }

        // If totalAmount was missed but an array of slips/items was returned, sum them
        if ((numAmount === null || numAmount <= 0) && Array.isArray(parsed.slips || parsed.bills || parsed.items)) {
            const list = parsed.slips || parsed.bills || parsed.items;
            const sum = list.reduce((acc: number, item: any) => {
                const itemAmt = typeof item.amount === 'number' ? item.amount : parseFloat(String(item.amount || item.total || '0').replace(/[^0-9.]/g, ''));
                return acc + (Number.isFinite(itemAmt) ? itemAmt : 0);
            }, 0);
            if (sum > 0) numAmount = sum;
        }

        const hasDate = parsedDate !== null;
        const hasAmount = numAmount !== null;

        return {
            extractedDate: parsedDate,
            extractedAmount: numAmount,
            extractedCurrency: parsed.currency || 'PKR',
            merchantName: parsed.merchantName || null,
            extractionStatus: hasDate && hasAmount ? 'success' : hasDate || hasAmount ? 'partial' : 'failed',
            confidence: (parsed.confidence as any) || (hasDate && hasAmount ? 'high' : 'medium')
        };
    } catch (err: any) {
        logger.warn(`[ReceiptOCR] Gemini Vision extraction exception: ${err?.message || err}`);
        return null;
    }
}

export async function extractReceiptData(
    buffer: Buffer,
    fileName: string,
    contentType?: string,
    expenseDateHint?: Date | null,
    amountHint?: number | null
): Promise<ReceiptExtractionResult> {
    const mimeType = contentType || (fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

    // 1. Primary Engine: Gemini AI Vision (when GEMINI_API_KEY is configured)
    if (process.env.GEMINI_API_KEY && (mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
        try {
            const aiResult = await extractWithGeminiVision(buffer, fileName, mimeType, expenseDateHint, amountHint);
            if (aiResult && aiResult.confidence !== 'none' && aiResult.extractionStatus !== 'failed') {
                // If AI got both amount and date, return immediately
                if (aiResult.extractedAmount !== null) {
                    logger.info(`[ReceiptOCR] Gemini AI successfully extracted from ${fileName}: PKR ${aiResult.extractedAmount}, Date: ${aiResult.extractedDate?.toISOString().slice(0, 10)}, Merchant: ${aiResult.merchantName}`);
                    return aiResult;
                }
                
                // If AI found date/merchant but missed amount, try local OCR as supplementary
                try {
                    const text = await extractTextFromBuffer(buffer, contentType);
                    const parsed = parseReceiptText(text, new Date(), expenseDateHint, amountHint);
                    if (parsed.extractedAmount !== null) {
                        aiResult.extractedAmount = parsed.extractedAmount;
                        aiResult.extractionStatus = 'success';
                        aiResult.confidence = 'medium';
                        logger.info(`[ReceiptOCR] Merged Gemini AI date/merchant with local OCR amount: PKR ${aiResult.extractedAmount}`);
                    }
                } catch {}

                return aiResult;
            }
        } catch (err: any) {
            logger.warn(`[ReceiptOCR] AI Vision fallback to local engine for ${fileName}: ${err?.message || err}`);
        }
    }

    // 2. Secondary Fallback: Local Tesseract.js OCR
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
            extractedCurrency: 'PKR',
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

    // Track unique receipt signatures to avoid duplicate summation across multi-angle uploads
    const seenSignatures = new Set<string>();

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

        if (typeof r.extractedAmount === 'number' && r.extractedAmount > 0) {
            const dateKey = r.extractedDate ? r.extractedDate.toISOString().slice(0, 10) : 'nodate';
            const merchantKey = (r.merchantName || 'nomerchant').toLowerCase().trim();
            const signature = `${r.extractedAmount}_${dateKey}_${merchantKey}`;

            if (seenSignatures.has(signature) && receipts.length > 1) {
                issues.push(`Duplicate or multi-angle photo detected for "${r.fileName}" — counted once in total`);
            } else {
                seenSignatures.add(signature);
                totalExtractedAmount += r.extractedAmount;
                hasAnyAmount = true;
            }
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

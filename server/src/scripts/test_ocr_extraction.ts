import assert from 'assert';

function sanitizeOcrNumberString(raw: string): string {
    const withoutCurrency = raw.replace(/(?:rs\.?|pkr|₨)/gi, '');
    return withoutCurrency
        .replace(/[Oo]/g, '0')
        .replace(/[Ss](?=\d)/g, '5')
        .replace(/[Il|](?=\d)/g, '1')
        .replace(/[Bb](?=\d)/g, '8')
        .replace(/[Zz](?=\d)/g, '2')
        .replace(/[^\d., ]/g, '');
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
    if (/\b0\d{2,4}[- ]?\d{6,8}\b/.test(line)) return true;

    // Tax / Regulatory / License / NTN / CNIC / STRN lines
    if (/(?:ntn|strn|tin|tax\s*id|reg(?:istration)?\s*no|cnic|nic|license|lic|dsl)[:\s#\-\/]*[\w\d\-\/]+/i.test(line)) return true;
    if (/\b\d{5}-\d{7}-\d\b/.test(line)) return true;

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

    if (top.score < 35) {
        return { amount: null, confidence: 'low' };
    }

    return { amount: top.amount, confidence: top.confidence };
}

// ── Test 1: Clean Receipt ──
const cleanReceiptText = `
Al Hamza Pharmacy
Street 6, Shop 2 & 3 Awan Market Chistiaabad
Near Hajj Camp Islamabad
DSL-1411-ICT/2013, NTN#5131978-1
051-2315147, 0330-8553433
No. 417810 24/08/2026 11:37:12
M/s: CASH SALE CUSTOMER
Remarks: Ref:
Item Name Qty Price Total
Neuromet 500mcg Tab 20 28.00 560.00
Mg Collagen Tab 1 1399.00 1399.00
Mg Magnesium Glycinate 500mg Tab 60s 1 2375.00 2375.00
Concor 2.5mg Tab 14 13.72 192.08
Surbex Z Tab 30 N 1 510.00 510.00
Co Ezaml 40+12.5mg Tab 14 35.36 495.04
Total Items: 6
Gross Total: 5,531.12
Discount: 276.56
Net Total: 5,255.00
Cash Received: 5,255.00
Balance: 0.00
Fridge item(s) & cutting strip cannot be taken back or exchange.
Thank you for visiting us.
Medicine cannot be refunded after 07 days of purchase.
(Computer Software developed by Abuzar Consultancy, Ph 042-37426911-15)
`;

const res1 = extractTotalAmount(cleanReceiptText, 5255);
console.log('Result 1 (clean receipt with 5255 hint):', res1);
assert.strictEqual(res1.amount, 5255, 'Should accurately extract 5255 from Net Total / Cash Received');

// ── Test 2: Noisy Stamped Receipt with obscured Net Total ──
const noisyReceiptText = `
Al Hamza Pharmacy
Street 6, Shop 2 & 3 Awan Market Chistiaabad
Near Hajj Camp Islamabad
DSL-1411-ICT/2013, NTN#5131978-1
051-2315147, 0330-8553433
No. 417810 24/08/2026 11:37:12
Item Name Qty Price Total
Neuromet 500mcg Tab 20 28.00 560.00
Mg Collagen Tab 1 1399.00 1399.00
Mg Magnesium Glycinate 500mg Tab 60s 1 2375.00 2375.00
Concor 2.5mg Tab 14 13.72 192.08
Surbex Z Tab 30 N 1 510.00 510.00
Co Ezaml 40+12.5mg Tab 14 35.36 495.04
Total Items: 6
Gross Total: 5,531.12
Discount: 276.56
PAID STAMP NOISE 5,255.00
Cash Received: 5,255.00
Balance: 0.00
Ph 042-37426911-15
`;

const res2 = extractTotalAmount(noisyReceiptText, 5255);
console.log('Result 2 (noisy receipt with obscured net total):', res2);
assert.strictEqual(res2.amount, 5255, 'Should extract 5255 from Cash Received or matching hint without picking phone numbers');

// ── Test 3: No hint provided at all ──
const res3 = extractTotalAmount(cleanReceiptText, null);
console.log('Result 3 (no hint):', res3);
assert.strictEqual(res3.amount, 5255, 'Should extract 5255 based on Net Total keyword priority even without hint');

// ── Test 4: Non-Financial Image with No Money (Should return null) ──
const nonFinancialText = `
Welcome to Company Portal
Employee ID: 1042
Office Room 304, Building 2
Phone: 0300-1234567
Date: 2026-08-25 14:30:00
Please wear your ID badge at all times.
For assistance contact HR.
`;

const res4 = extractTotalAmount(nonFinancialText, null);
console.log('Result 4 (non-financial text):', res4);
assert.strictEqual(res4.amount, null, 'Must return null when there is no financial context or money');

console.log('All OCR extraction tests passed successfully!');

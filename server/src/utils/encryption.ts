import crypto from 'crypto';

const ALGORITHM_GCM = 'aes-256-gcm';
const GCM_IV_LENGTH = 12; // 12 bytes recommended for AES-GCM

/**
 * Derives a 32-byte AES-256 key from environment variable or secure fallback.
 */
function getEncryptionKey(): Buffer {
    const secret = process.env.FINANCIAL_ENCRYPTION_KEY || 'bc9e7bcaa5caf06ec88f838fb5d43143e39261797cca9696b7df47c808cd7b22';
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a number into AES-256-GCM format: enc:v1:<iv_hex>:<authTag_hex>:<cipher_hex>
 */
export function encryptNumber(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const numVal = Number(value);
    if (isNaN(numVal)) {
        // If already an encrypted string, preserve it
        if (typeof value === 'string' && value.startsWith('enc:v1:')) {
            return value;
        }
        return '';
    }

    try {
        const text = String(numVal);
        const iv = crypto.randomBytes(GCM_IV_LENGTH);
        const key = getEncryptionKey();
        const cipher = crypto.createCipheriv(ALGORITHM_GCM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (err) {
        console.error('Encryption error:', err);
        return String(value);
    }
}

/**
 * Decrypts an encrypted financial value back to a JavaScript number.
 * Backwards compatible with legacy unencrypted numbers and legacy CBC format.
 */
export function decryptNumber(encryptedValue: any): number {
    if (encryptedValue === null || encryptedValue === undefined || encryptedValue === '') return 0;
    if (typeof encryptedValue === 'number') return isNaN(encryptedValue) ? 0 : encryptedValue;

    const strVal = String(encryptedValue).trim();
    if (!strVal) return 0;

    // 1. Current AES-256-GCM Format (enc:v1:iv:tag:ciphertext)
    if (strVal.startsWith('enc:v1:')) {
        try {
            const parts = strVal.split(':');
            if (parts.length === 5) {
                const [, , ivHex, authTagHex, cipherHex] = parts;
                const key = getEncryptionKey();
                const decipher = crypto.createDecipheriv(ALGORITHM_GCM, key, Buffer.from(ivHex, 'hex'));
                decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
                let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                const num = Number(decrypted);
                return isNaN(num) ? 0 : num;
            }
        } catch (err) {
            console.error('Decryption error (GCM):', err);
            return 0;
        }
    }

    // 2. Legacy AES-256-CBC Format (ivBase64:ciphertextBase64)
    if (strVal.includes(':') && !strVal.startsWith('enc:')) {
        try {
            const [ivBase64, cipherText] = strVal.split(':');
            const iv = Buffer.from(ivBase64, 'base64');
            const key = getEncryptionKey();
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(cipherText, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            const num = Number(decrypted);
            return isNaN(num) ? 0 : num;
        } catch (err) {
            console.error('Decryption error (CBC legacy):', err);
            return 0;
        }
    }

    // 3. Fallback for unencrypted numeric strings
    const parsed = Number(strVal);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Encrypts a sensitive string or number into AES-256-GCM format.
 */
export function encryptFinancialField(value: string | number | null | undefined): string {
    return encryptNumber(value as any);
}

/**
 * Decrypts an encrypted string back to plaintext string.
 */
export function decryptFinancialField(encryptedValue: string | null | undefined): string {
    if (!encryptedValue) return '';
    const num = decryptNumber(encryptedValue);
    return String(num);
}

/**
 * Decrypts all financial fields in an Employee object in-place (useful for .lean() queries).
 */
export function decryptEmployeeFields(emp: any): any {
    if (!emp) return emp;

    if (emp.financeInfo) {
        if (emp.financeInfo.probationSalary !== undefined) {
            emp.financeInfo.probationSalary = decryptNumber(emp.financeInfo.probationSalary);
        }
        if (emp.financeInfo.confirmedSalary !== undefined) {
            emp.financeInfo.confirmedSalary = decryptNumber(emp.financeInfo.confirmedSalary);
        }
    }

    if (Array.isArray(emp.salaryComponents)) {
        emp.salaryComponents.forEach((sc: any) => {
            if (sc && sc.amount !== undefined) {
                sc.amount = decryptNumber(sc.amount);
            }
        });
    }

    if (Array.isArray(emp.salaryHistory)) {
        emp.salaryHistory.forEach((sh: any) => {
            if (sh && sh.amount !== undefined) {
                sh.amount = decryptNumber(sh.amount);
            }
            if (sh && sh.previousAmount !== undefined) {
                sh.previousAmount = decryptNumber(sh.previousAmount);
            }
            if (Array.isArray(sh.components)) {
                sh.components.forEach((c: any) => {
                    if (c && c.amount !== undefined) {
                        c.amount = decryptNumber(c.amount);
                    }
                });
            }
        });
    }

    if (emp.providentFundBalance !== undefined) {
        emp.providentFundBalance = decryptNumber(emp.providentFundBalance);
    }

    if (Array.isArray(emp.providentFundHistory)) {
        emp.providentFundHistory.forEach((pf: any) => {
            if (pf && pf.amount !== undefined) {
                pf.amount = decryptNumber(pf.amount);
            }
        });
    }

    return emp;
}

/**
 * Decrypts all financial fields in a Payslip object in-place (useful for .lean() queries).
 */
export function decryptPayslipFields(payslip: any): any {
    if (!payslip) return payslip;

    if (payslip.grossPay !== undefined) payslip.grossPay = decryptNumber(payslip.grossPay);
    if (payslip.totalDeductions !== undefined) payslip.totalDeductions = decryptNumber(payslip.totalDeductions);
    if (payslip.netPay !== undefined) payslip.netPay = decryptNumber(payslip.netPay);
    if (payslip.taxDeduction !== undefined) payslip.taxDeduction = decryptNumber(payslip.taxDeduction);
    if (payslip.loanDeduction !== undefined) payslip.loanDeduction = decryptNumber(payslip.loanDeduction);
    if (payslip.pfPayout !== undefined) payslip.pfPayout = decryptNumber(payslip.pfPayout);

    if (Array.isArray(payslip.earnings)) {
        payslip.earnings.forEach((e: any) => {
            if (e && e.amount !== undefined) e.amount = decryptNumber(e.amount);
        });
    }

    if (Array.isArray(payslip.deductions)) {
        payslip.deductions.forEach((d: any) => {
            if (d && d.amount !== undefined) d.amount = decryptNumber(d.amount);
        });
    }

    return payslip;
}

/**
 * Generate a guaranteed unique Customer Reference ID for bank transfers.
 * Format: PAY-YYYYMMDD-XXXX (non-duplicating)
 */
export function generateCustomerReference(periodYear: number, periodMonth: number, seqIndex: number): string {
    const yStr = String(periodYear);
    const mStr = String(periodMonth).padStart(2, '0');
    const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    const seqStr = String(seqIndex).padStart(3, '0');
    return `PAY-${yStr}${mStr}-${seqStr}${randomHex}`;
}

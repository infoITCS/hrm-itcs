import crypto from 'crypto';

// Encryption key from environment or fallback 32-byte key
const ENCRYPTION_KEY = process.env.FINANCIAL_ENCRYPTION_KEY 
    ? crypto.createHash('sha256').update(process.env.FINANCIAL_ENCRYPTION_KEY).digest()
    : crypto.createHash('sha256').update('hrm-itcs-secure-financial-key-2026').digest();

const IV_LENGTH = 16; // AES block size

/**
 * Encrypts a sensitive string or number into AES-256-CBC Base64 format.
 */
export function encryptFinancialField(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    try {
        const text = String(value);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        // Return IV:Ciphertext format in base64
        return `${iv.toString('base64')}:${encrypted}`;
    } catch (err) {
        console.error('Encryption error:', err);
        return String(value);
    }
}

/**
 * Decrypts an AES-256-CBC Base64 encrypted string back to plaintext.
 */
export function decryptFinancialField(encryptedValue: string | null | undefined): string {
    if (!encryptedValue) return '';
    if (!encryptedValue.includes(':')) {
        // Not encrypted or plaintext fallback
        return encryptedValue;
    }
    try {
        const [ivBase64, cipherText] = encryptedValue.split(':');
        const iv = Buffer.from(ivBase64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(cipherText, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Decryption error:', err);
        return encryptedValue;
    }
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

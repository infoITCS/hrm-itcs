
import jwt from 'jsonwebtoken';
import { IUser } from '../models/User.model';

/** Shape of the JWT payload this system issues */
export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('FATAL: JWT_SECRET environment variable is not set!');
    return secret;
};

export class AuthUtils {
    static generateToken(
        payload: { userId: string; email: string; role: string; },
        expiresIn: string = '8h'
    ): string {
        return jwt.sign(payload, getJwtSecret(), { 
            expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}` | number,
            algorithm: 'HS256'  // Explicitly lock algorithm — prevents alg:none attack
        });
    }

    /**
     * Generates a short-lived token (5 min) specifically for media/file downloads.
     * Prevents long-lived session JWT leakage in URL query parameters.
     */
    static generateFileToken(payload: { userId: string; role: string }): string {
        return jwt.sign({ ...payload, scope: 'file_access' }, getJwtSecret(), {
            expiresIn: '5m',
            algorithm: 'HS256'
        });
    }

    /**
     * Verifies and decodes a JWT token.
     * Returns the typed payload or null if invalid/expired.
     */
    static verifyToken(token: string): JwtPayload | null {
        try {
            return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;
        } catch {
            return null;
        }
    }
}

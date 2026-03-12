
import jwt from 'jsonwebtoken';
import { IUser } from '../models/User.model';

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('FATAL: JWT_SECRET environment variable is not set!');
    return secret;
};

export class AuthUtils {
    static generateToken(
        payload: { userId: string; email: string; role: string; isImpersonated?: boolean; ghostSessionId?: string; impersonatorId?: string; },
        expiresInStr: string = '8h'
    ): string {
        return jwt.sign(payload, getJwtSecret(), { 
            expiresIn: expiresInStr as any,
            algorithm: 'HS256'  // Explicitly lock algorithm — prevents alg:none attack
        });
    }

    static verifyToken(token: string): any {
        try {
            return jwt.verify(token, getJwtSecret());
        } catch (error) {
            return null;
        }
    }
}

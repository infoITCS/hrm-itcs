
import jwt from 'jsonwebtoken';
import { IUser } from '../models/User.model';

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('FATAL: JWT_SECRET environment variable is not set!');
    return secret;
};

export class AuthUtils {
    static generateToken(payload: { userId: string; email: string; role: string; }): string {
        return jwt.sign(payload, getJwtSecret(), { expiresIn: '1d' });
    }

    static verifyToken(token: string): any {
        try {
            return jwt.verify(token, getJwtSecret());
        } catch (error) {
            return null;
        }
    }
}

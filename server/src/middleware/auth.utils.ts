
import jwt from 'jsonwebtoken';
import { IUser } from '../models/User.model';

export class AuthUtils {
    static generateToken(payload: { userId: string; email: string; role: string; }): string {
        return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    }

    static verifyToken(token: string): any {
        try {
            return jwt.verify(token, process.env.JWT_SECRET || 'secret');
        } catch (error) {
            return null;
        }
    }
}

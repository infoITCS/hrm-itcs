
import { Request, Response, NextFunction } from 'express';
import { AuthUtils } from './auth.utils';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string; // 'admin', 'hr', 'employee'
    };
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const authHeader = authReq.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ message: 'No authorization token provided' });
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;

    if (!token) {
        return res.status(401).json({ message: 'Invalid authorization token format' });
    }

    // Verify JWT token
    const decoded = AuthUtils.verifyToken(token);
    
    if (!decoded || !decoded.userId) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Set user info from token payload
    authReq.user = {
        userId: decoded.userId,
        role: decoded.role || 'employee'
    };

    next();
};

export const authorize = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const authReq = req as AuthRequest;
        if (!authReq.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!roles.includes(authReq.user.role)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        next();
    };
};

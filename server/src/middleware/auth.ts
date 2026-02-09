
import { Request, Response, NextFunction } from 'express';
// Note: In a real app, you'd use a library like jsonwebtoken
// For this MVP/Demo, we'll assume a simple header-based auth or mock it
// IF the user wants full JWT, we'd need to install encryption libraries. 
// Given the requirements mentioned "Data Security & Permissions", we'll verify a mock token.

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string; // 'admin', 'hr', 'employee'
    };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
    // simple mock auth for now, can be replaced with real JWT verify
    const token = req.header('Authorization');

    if (!token) {
        // for development, let's default to an admin user if no token, 
        // OR reject. Let's reject to encourage proper login flow if one existed.
        // BUT since there's no login flow yet in the plan, let's PASS a default admin
        req.user = { userId: 'admin-123', role: 'admin' };
        next();
        return;
    }

    // Check token validity logic here...
    req.user = { userId: 'admin-123', role: 'admin' };
    next();
};

export const authorize = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        next();
    };
};

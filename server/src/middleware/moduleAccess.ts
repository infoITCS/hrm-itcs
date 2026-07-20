import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import RolePermission from '../models/RolePermission';

const BYPASS_ROLES = ['super-admin', 'admin'];

/**
 * Middleware factory: checks that the authenticated user's role has the
 * given module enabled in the RolePermission collection.
 *
 * Super-admin and admin always pass. All other roles must have the flag set.
 *
 * Usage: router.get('/something', authenticate, requireModuleAccess('leave'), handler)
 */
export const requireModuleAccess = (module: string) =>
    async (req: Request, res: Response, next: NextFunction) => {
        const authReq = req as AuthRequest;
        const role = (authReq.user?.role || '').toLowerCase().trim();

        if (!role) return res.status(401).json({ message: 'Unauthorized' });
        if (BYPASS_ROLES.includes(role)) return next();

        try {
            const perm = await RolePermission.findOne({ role }).lean() as any;
            if (perm?.permissions?.[module]) return next();
            return res.status(403).json({ message: `Access to the '${module}' module is not enabled for your role.` });
        } catch (err) {
            next(err);
        }
    };

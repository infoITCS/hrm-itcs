/**
 * scopeToTeam.ts — Manager data isolation middleware.
 * Single source of truth for resolving who a manager can see.
 *
 * - super-admin / admin → req.teamScope = null (no restriction)
 * - manager → req.teamScope = [array of subordinate employeeIds]
 * - employee → req.teamScope = [own employeeId]
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Employee from '../../models/Employee';
import logger from '../../utils/logger';

declare module '../../middleware/auth' {
    interface AuthRequest {
        teamScope?: string[] | null;
    }
}

export async function scopeToTeam(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        if (req.user.role === 'manager') {
            const managerEmp = await Employee.findOne(
                { userId: req.user.userId, isDeleted: { $ne: true } },
                { employeeId: 1 }
            ).lean() as any;

            if (!managerEmp) {
                req.teamScope = [];
                return next();
            }

            const subordinates = await Employee.find(
                { 'jobInfo.reportingManager': managerEmp.employeeId, isDeleted: { $ne: true } },
                { employeeId: 1 }
            ).lean() as any[];

            req.teamScope = [managerEmp.employeeId, ...subordinates.map((e) => e.employeeId)];
        } else if (req.user.role === 'employee') {
            const emp = await Employee.findOne(
                { userId: req.user.userId, isDeleted: { $ne: true } },
                { employeeId: 1 }
            ).lean() as any;
            
            req.teamScope = emp ? [emp.employeeId] : [];
        } else if (req.user.role === 'admin' || req.user.role === 'super-admin') {
            // admin, super-admin → unrestricted
            req.teamScope = null;
        } else {
            // Fail closed for any other roles
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        next();
    } catch (err) {
        logger.error('[scopeToTeam] Error resolving team scope:', err);
        next(err);
    }
}

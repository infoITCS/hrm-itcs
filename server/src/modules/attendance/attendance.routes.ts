/**
 * attendance.routes.ts — Authenticated HR API routes.
 * Mounted at /api/v2/attendance in index.ts for parallel testing.
 * Swap to /api/attendance when ready to go live.
 *
 * Every route here requires a valid JWT. The scopeToTeam middleware
 * automatically restricts managers to their direct reports.
 */
import { Router, RequestHandler } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { scopeToTeam } from '../../shared/middleware/scopeToTeam';
import * as ctrl from './attendance.controller';

const router = Router();

const ADMIN_ROLES   = ['super-admin', 'admin'];
const MANAGER_ROLES = ['super-admin', 'admin', 'manager'];
const ALL_ROLES     = ['super-admin', 'admin', 'manager', 'employee'];

/**
 * Cast each middleware to RequestHandler to resolve the type conflict between
 * Passport's Express.User and our AuthRequest.user shape.
 * Runtime behavior is identical — this is purely a TypeScript annotation fix.
 */
const auth = (...roles: string[]): RequestHandler[] => [
    authenticate as RequestHandler,
    authorize(roles) as RequestHandler,
    scopeToTeam as RequestHandler,
];

/**
 * h() — casts AuthRequest controller functions to RequestHandler.
 * Same root cause as auth(): Passport's Express.User ≠ our { userId, role }.
 * Safe at runtime because authenticate always sets req.user to our shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = (fn: any): RequestHandler => fn as RequestHandler;

// ─── Overview / Dashboard ──────────────────────────────────────────────────────
router.get('/today',   ...auth(...MANAGER_ROLES), h(ctrl.getToday));
router.get('/summary', ...auth(...MANAGER_ROLES), h(ctrl.getSummary));
router.get('/weekly',  ...auth(...MANAGER_ROLES), h(ctrl.getWeekly));

// ─── Records ──────────────────────────────────────────────────────────────────
router.get('/records',      ...auth(...ALL_ROLES),     h(ctrl.getRecords));
router.get('/punches',      ...auth(...MANAGER_ROLES), h(ctrl.getPunches));
router.put('/records/:id',  ...auth(...ADMIN_ROLES),   h(ctrl.updateRecord));
router.post('/manual',      ...auth(...ADMIN_ROLES),   h(ctrl.createManualRecord));
router.get('/export',       ...auth(...MANAGER_ROLES), h(ctrl.exportCSV));
router.get('/export/monthly', ...auth(...MANAGER_ROLES), h(ctrl.exportGlobalMonthly));
router.get('/employee/:employeeId/monthly', ...auth(...ALL_ROLES), h(ctrl.getEmployeeMonthly));
router.get('/employee/:employeeId/export/monthly', ...auth(...ALL_ROLES), h(ctrl.exportMonthly));

// ─── Live Feed ────────────────────────────────────────────────────────────────
router.get('/live-feed', ...auth(...MANAGER_ROLES), h(ctrl.getLiveFeed));

// ─── Smart Roster (one row per employee — first in / last out) ────────────
router.get('/roster', ...auth(...MANAGER_ROLES), h(ctrl.getTodayRoster));

// ─── Locations & Devices ─────────────────────────────────────────────────────
router.get('/locations',        ...auth(...ALL_ROLES),   h(ctrl.getLocations));
router.get('/devices',          ...auth(...ADMIN_ROLES), h(ctrl.getDevices));
router.put('/devices/:sn',      ...auth(...ADMIN_ROLES), h(ctrl.updateDevice));

// ─── ZKT Cloud (isolated — no HR data here) ───────────────────────────────────
router.get('/zkt/status',       ...auth(...MANAGER_ROLES), h(ctrl.zktGetStatus));
router.get('/zkt/employees',    ...auth(...ADMIN_ROLES),   h(ctrl.zktGetEmployees));
router.get('/zkt/transactions', ...auth(...ADMIN_ROLES),   h(ctrl.zktGetTransactions));
router.get('/zkt/report',       ...auth(...ADMIN_ROLES),   h(ctrl.zktGetReport));
router.get('/zkt/sync-state',   ...auth(...ADMIN_ROLES),   h(ctrl.zktGetSyncState));
router.post('/zkt/sync',        ...auth(...ADMIN_ROLES),   h(ctrl.zktTriggerSync));
router.post('/zkt/sync-report', ...auth(...ADMIN_ROLES),   h(ctrl.zktSyncReport));

// ─── Admin Operations ─────────────────────────────────────────────────────────
router.post('/admin/auto-close', ...auth(...ADMIN_ROLES), h(ctrl.adminAutoClose));

export default router;

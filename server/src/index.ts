import dotenv from 'dotenv';
import dns from 'dns';

// Fix Windows Node.js SRV resolution bug with local ISP DNS
try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

// Load environment variables FIRST before any other imports
dotenv.config();

// Defensive Sanitization: Trim all critical environment variables to remove accidental newlines/whitespace
const criticalEnvVars = [
    'MONGODB_URI', 'JWT_SECRET', 'SESSION_SECRET', 'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID',
    'MICROSOFT_CALLBACK_URL', 'FRONTEND_URL', 'CLIENT_URL',
    'GEMINI_API_KEY', 'SMTP_USER', 'SMTP_PASS'
];
criticalEnvVars.forEach(key => {
    if (process.env[key]) {
        process.env[key] = process.env[key]?.trim();
    }
});

import logger from './utils/logger';

// CRASH LOGGING: Catch any deep server errors and exit gracefully
process.on('uncaughtException', (err) => {
    if (logger) {
        logger.error('❌ CRITICAL: Uncaught Exception:', err);
    } else {
        console.error('❌ CRITICAL: Uncaught Exception (Logger not ready):', err);
    }
    // Process is in undefined state after uncaughtException — must exit
    setTimeout(() => process.exit(1), 1000).unref();
});
process.on('unhandledRejection', (reason: any) => {
    const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
    if (logger) {
        logger.error(`❌ CRITICAL: Unhandled Rejection: ${msg}`);
    } else {
        console.error('❌ CRITICAL: Unhandled Rejection:', msg);
    }
});

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'path';
import employeeRoutes from './routes/employeeRoutes';
import auditRoutes from './routes/auditRoutes';
import adminRoutes from './routes/adminRoutes';
import authRoutes from './routes/authRoutes';
import orgConfigRoutes from './routes/orgConfigRoutes';
// NEW: Clean modular attendance routes (v2 — side-by-side testing)
import attendanceV2Routes from './modules/attendance/attendance.routes';
import admsRoutes from './modules/attendance/adms.routes';
import claimRoutes from './routes/claimRoutes';
import expenseCategoryRoutes from './routes/expenseCategoryRoutes';
import leaveRoutes from './routes/leaveRoutes';
import workShiftRoutes from './routes/workShiftRoutes';
import cronRoutes from './routes/cronRoutes';
import holidayRoutes from './routes/holidayRoutes';
import employeeRequestRoutes from './routes/employeeRequestRoutes';
import documentRoutes from './routes/documentRoutes';
import customRequestCategoryRoutes from './routes/customRequestCategoryRoutes';
import payrollRoutes from './routes/payrollRoutes';
import { bootstrapPermissions } from './models/RolePermission';
import { requireModuleAccess } from './middleware/moduleAccess';
import { authenticate } from './middleware/auth';
import { initCronService } from './services/cronService';
import { initScheduler } from './services/scheduler';
import mongoSanitize from 'express-mongo-sanitize';

import passport from 'passport';
import configurePassport from './config/passport';

const app = express();
const mainRouter = express.Router();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// CORS Configuration — Allow production, localhost, and Vercel preview deployments
const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            process.env.FRONTEND_URL?.trim(),
            process.env.CLIENT_URL?.trim(),
            'http://localhost:5173',
            'https://hrm-itcs-client.vercel.app'
        ].filter(Boolean) as string[];

        // Allow if no origin (like mobile apps or curl) or if it matches our list
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
            callback(null, true);
        }
        else {
            logger.warn(`[CORS] Blocked Origin: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false, // Disable default X-Frame-Options (SAMEORIGIN) to allow framing across different ports/domains
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:", "*"], // Allow images from any source (including our own API)
            connectSrc: ["'self'", "*"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            // Allow plugins (like Chrome's built-in PDF viewer) to load documents
            objectSrc: ["'self'", "blob:"],
            // Allow framing/child sources for previews
            frameSrc: [
                "'self'",
                "blob:",
                "http://localhost:5173",
                "https://hrm-itcs-client.vercel.app",
                process.env.FRONTEND_URL,
                process.env.CLIENT_URL
            ].filter(Boolean) as string[],
            // Allow framing from backend itself, frontend dev server, vercel deployment, and config-based URLs
            frameAncestors: [
                "'self'",
                "http://localhost:5173",
                "https://hrm-itcs-client.vercel.app",
                process.env.FRONTEND_URL,
                process.env.CLIENT_URL
            ].filter(Boolean) as string[],
        },
    }
}));
app.use(cors(corsOptions));
// NoSQL Injection Defense: Strip MongoDB operators ($, .) from all user input globally
app.use(mongoSanitize({ replaceWith: '_', allowDots: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Required for ZKTeco ADMS: machine POSTs attendance logs as text/plain
app.use(express.text({ type: 'text/plain', limit: '2mb' }));

// Rate limiting — protect auth endpoints from brute force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Increased for development/testing — 100 attempts per window
    message: { message: 'Too many attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: { message: 'Too many requests. Please slow down.' },
});
app.use('/api/', generalLimiter); // General rate limit for all API routes

// Database URI Helper
const MONGO_URI = process.env.MONGODB_URI;

function getSanitizedMongoUri(uri?: string): string {
    if (!uri) return '';
    let finalUri = uri.trim();
    if (finalUri.includes('mongocluster.cosmos.azure.com') || finalUri.includes('cosmos.azure.com')) {
        const baseUrl = finalUri.split('?')[0];
        finalUri = `${baseUrl}?tls=true`;
    }
    return finalUri;
}

/**
 * Connect (or reconnect) to Cosmos DB.
 * Safe to call multiple times — mongoose de-dupes concurrent calls.
 */
async function connectDB(): Promise<void> {
    if (!MONGO_URI) {
        logger.error('❌ FATAL ERROR: MONGODB_URI IS MISSING IN VERCEL ENVIRONMENT VARIABLES!');
        return;
    }

    // Already connected — nothing to do
    if (mongoose.connection.readyState === 1) return;
    // Connection is being established — let it finish
    if (mongoose.connection.readyState === 2) {
        await new Promise<void>((resolve, reject) => {
            mongoose.connection.once('connected', resolve);
            mongoose.connection.once('error', reject);
        });
        return;
    }

    const finalUri = getSanitizedMongoUri(MONGO_URI);

    try {
        await mongoose.connect(finalUri, {
            dbName: 'hrm',
            autoIndex: true,

            // Start with 1 connection and scale up on demand up to 50
            minPoolSize: 1,
            maxPoolSize: 50,

            // CRITICAL FOR COSMOS DB: Azure aggressively drops idle connections after 4 minutes.
            maxIdleTimeMS: 120000,

            // Connection handshake timeouts
            connectTimeoutMS: 30000,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,

            // Heartbeat frequency
            heartbeatFrequencyMS: 60000,
            minHeartbeatFrequencyMS: 10000,

            // Cosmos DB (vCore) does NOT support retryWrites
            retryWrites: false,
            retryReads: true,

            // Buffer commands until the connection is ready
            bufferCommands: true,
        });
        logger.info('✅ Connected to MongoDB (Cosmos DB)');

        // Sequentially bootstrap permissions and seeds after connection is established
        try {
            await bootstrapPermissions();
            const { seedLeaveTypes } = require('./utils/seedLeaves');
            await seedLeaveTypes();
            const { seedExpenseCategories } = require('./utils/seedExpenses');
            await seedExpenseCategories();
            const { seedRequestCategories } = require('./utils/seedCategories');
            await seedRequestCategories();
            const { seedFuelAllowanceForAllEmployees } = require('./utils/seedFuelAllowance');
            await seedFuelAllowanceForAllEmployees();
        } catch (seedErr) {
            logger.warn('Initial seeding notice (non-fatal):', (seedErr as any)?.message || seedErr);
        }
    } catch (err: any) {
        logger.error('❌ MongoDB Connection Error:', err);
        logger.info('👉 TIP: Check if your IP is whitelisted (0.0.0.0/0) in Cosmos DB / Networking.');
    }
}

// Globally increase the buffer timeout so Mongoose doesn't give up during reconnect
mongoose.set('bufferTimeoutMS', 60000);

// Register connection event listeners for observability
mongoose.connection.on('connected', () => {
    logger.info('🔗 Mongoose: connected');
    initScheduler();
    initCronService();
});
mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ Mongoose: disconnected from Cosmos DB');
    if (!process.env.VERCEL) {
        logger.info('🔄 Non-serverless env — attempting reconnect in 5s...');
        setTimeout(connectDB, 5000);
    }
});
mongoose.connection.on('error', (err) =>
    logger.error('❌ Mongoose connection error:', err)
);

// Initial connection attempt
connectDB();

// Session configuration (required for OAuth state/PKCE)
const getSessionSecret = (): string => {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        // Fallback to JWT_SECRET if session secret is missing to prevent crash
        if (process.env.JWT_SECRET) {
            logger.warn('⚠️ SESSION_SECRET not set, falling back to JWT_SECRET.');
            return process.env.JWT_SECRET;
        }

        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
            logger.error('❌ FATAL: SESSION_SECRET and JWT_SECRET are missing!');
            throw new Error('FATAL: At least JWT_SECRET must be set for the server to start.');
        }
        return 'dev-only-temp-secret-not-for-production';
    }
    return secret;
};

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

const sessionOptions: session.SessionOptions = {
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    proxy: isProduction, // Trust the proxy for setting secure cookies
    cookie: {
        // In Vercel/Production, we must use Secure and SameSite=None for cross-site SSO to work
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// Only use MongoDB store if URI is available
if (process.env.MONGODB_URI) {
    const sanitizedUri = getSanitizedMongoUri(process.env.MONGODB_URI);
    sessionOptions.store = MongoStore.create({
        mongoUrl: sanitizedUri,
        dbName: 'hrm',
        collectionName: 'sessions',
        ttl: 24 * 60 * 60, // 1 day
        autoRemove: 'interval',
        autoRemoveInterval: 10,
        mongoOptions: {
            retryWrites: false,
            connectTimeoutMS: 30000,
            serverSelectionTimeoutMS: 30000,
            maxIdleTimeMS: 120000,
        }
    });
} else {
    logger.error('❌ MONGODB_URI is missing. Sessions will be memory-only and will reset on every deploy.');
}

// Middleware to ensure DB connection is ready before processing requests.
// On Vercel, each cold-start invocation may have a dead connection — re-establish it here.
app.use(async (req, res, next) => {
    const state = mongoose.connection.readyState as any;
    if (state !== 1) {
        logger.info(`⌛ MongoDB not ready (state=${state}). Re-connecting...`);
        try {
            await connectDB();
        } catch (e: any) {
            logger.error('❌ Re-connect failed in middleware:', e.message);
        }
    }
    next();
});

app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session()); // Required for OAuth state/PKCE
configurePassport();

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── ZKTeco machine URL rewrite ──────────────────────────────────────────────
// Machines call /iclock/cdata directly (no prefix). Rewrite to hit adms.routes.ts.
app.use((req: any, _res: any, next: any) => {
    if (req.path.startsWith('/iclock/') || req.path === '/iclock') {
        const original = req.url;
        req.url = '/api/attendance/adms' + req.url;
        logger.info(`[MACHINE] ${req.method} ${original} → ${req.url} | IP: ${req.ip}`);
    }
    next();
});
// NEW: ADMS machine endpoint (no auth — machines can't send JWT)
app.use('/api/attendance/adms', admsRoutes);

// Mount all routes on BOTH /api and / to handle Vercel path rewriting perfectly
const prefixes = ['/api', ''];
prefixes.forEach(p => {
    app.use(`${p}/employees`, employeeRoutes);
    app.use(`${p}/audit-logs`, auditRoutes);
    app.use(`${p}/admin`, adminRoutes);
    app.use(`${p}/auth`, authLimiter, authRoutes);
    app.use(`${p}/config`, orgConfigRoutes);
    // Module routes — guarded by DB-driven permissions so toggling the Permissions tab
    // actually blocks or grants access end-to-end (sidebar + backend).
    app.use(`${p}/v2/attendance`, authenticate, requireModuleAccess('attendance'), attendanceV2Routes);
    app.use(`${p}/claims`, authenticate, requireModuleAccess('claim'), claimRoutes);
    app.use(`${p}/expense-categories`, expenseCategoryRoutes);
    app.use(`${p}/leaves`, authenticate, requireModuleAccess('leave'), leaveRoutes);
    app.use(`${p}/work-shifts`, workShiftRoutes);
    app.use(`${p}/cron`, cronRoutes);
    app.use(`${p}/holidays`, authenticate, requireModuleAccess('leave'), holidayRoutes);
    app.use(`${p}/my-requests`, authenticate, requireModuleAccess('requests'), employeeRequestRoutes);
    app.use(`${p}/documents`, documentRoutes);
    app.use(`${p}/request-categories`, customRequestCategoryRoutes);
    app.use(`${p}/payroll`, authenticate, payrollRoutes);
});

app.get('/', (req, res) => {
    res.json({ message: 'HRM API is running', env: process.env.NODE_ENV });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'Vercel-May-4-Final-Test',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        vercel: !!process.env.VERCEL
    });
});

// Catch-all for undefined routes - EXTREMELY HELPFUL FOR DEBUGGING 404s
app.use('*', (req, res) => {
    logger.warn(`404 at ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        path: req.originalUrl
    });
});

// Favicon handler to prevent 500 errors
app.get(['/favicon.ico', '/favicon.png'], (req, res) => {
    res.status(204).end();
});

app.get('/', (req, res) => {
    res.send('HRM API is running');
});

// Global Error Handler to catch and display 500 errors instead of generic message
app.use((err: any, req: any, res: any, next: any) => {
    const safeErr = err ?? {};
    logger.error('🔥 Global unhandled error:', safeErr);

    res.status(500).json({
        message: safeErr.message || 'Internal server error',
        // Only expose debug details in non-production environments
        ...(!isProduction && {
            stack: safeErr.stack,
            code: safeErr.code,
            name: safeErr.name
        })
    });
});

// For Vercel serverless, export the app instead of listening
// Vercel will handle the serverless function
export default app;

// For local development, listen on port
if (!process.env.VERCEL) {
    const portNum = typeof PORT === 'string' ? parseInt(PORT) : PORT;
    app.listen(portNum, '0.0.0.0', () => {
        logger.info(`Server is running on port ${portNum}`);
    });
}

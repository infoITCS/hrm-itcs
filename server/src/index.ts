import dotenv from 'dotenv';
// Load environment variables FIRST before any other imports
dotenv.config();

// Defensive Sanitization: Trim all critical environment variables to remove accidental newlines/whitespace
const criticalEnvVars = [
    'MONGODB_URI', 'JWT_SECRET', 'MICROSOFT_CLIENT_ID', 
    'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID', 
    'MICROSOFT_CALLBACK_URL', 'FRONTEND_URL', 'CLIENT_URL'
];
criticalEnvVars.forEach(key => {
    if (process.env[key]) {
        process.env[key] = process.env[key]?.trim();
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
import { initScheduler } from './services/scheduler';

import passport from 'passport';
import configurePassport from './config/passport';

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// CORS Configuration — never default to wildcard in production
const corsOptions = {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.trim() : 'http://localhost:5173',
    credentials: true,
    optionsSuccessStatus: 200
};

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // Allow cross-origin for API
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting — protect auth endpoints from brute force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 attempts per window — enough for OAuth flow + normal usage
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

// Session configuration (required for OAuth state/PKCE)
app.use(session({
    secret: process.env.SESSION_SECRET || (() => { console.warn('⚠️ SESSION_SECRET not set, using random value. Sessions will not persist across restarts.'); return require('crypto').randomBytes(32).toString('hex'); })(),
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Must be 'none' for OAuth to work across domains/redirects from Vercel
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));


// Initialize Scheduler (only in production with proper environment)
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SCHEDULER !== 'false') {
    initScheduler();
}

app.use(passport.initialize());
app.use(passport.session()); // Required for OAuth state/PKCE
configurePassport();

// Database Connection
mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: 'hrm'
})
    .then(() => console.log('Connected to MongoDB (hrm)'))
    .catch(err => console.error('Could not connect to MongoDB', err));

import authRoutes from './routes/authRoutes';

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/employees', employeeRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authLimiter, authRoutes); // Stricter rate limit on auth

app.get('/', (req, res) => {
    res.send('HRM API is running');
});

// Global Error Handler to catch and display 500 errors instead of generic message
app.use((err: any, req: any, res: any, next: any) => {
    console.error('🔥 Global unhandled error:', err);
    if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ message: 'Internal server error' });
    }
    res.status(500).json({ message: err.message, stack: err.stack });
});

// For Vercel serverless, export the app instead of listening
// Vercel will handle the serverless function
export default app;

// For local development, listen on port
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

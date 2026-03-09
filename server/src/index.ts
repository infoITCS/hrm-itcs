import dotenv from 'dotenv';
// Load environment variables FIRST before any other imports
dotenv.config();

// Defensive Sanitization: Trim all critical environment variables to remove accidental newlines/whitespace
const criticalEnvVars = [
    'MONGODB_URI', 'JWT_SECRET', 'MICROSOFT_CLIENT_ID', 
    'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID', 
    'MICROSOFT_CALLBACK_URL', 'FRONTEND_URL', 'CLIENT_URL',
    'GEMINI_API_KEY'
];
criticalEnvVars.forEach(key => {
    if (process.env[key]) {
        process.env[key] = process.env[key]?.trim();
    }
});

// CRASH LOGGING: Catch any deep server errors
process.on('uncaughtException', (err) => {
    console.error('❌ CRITICAL: Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
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
import aiRoutes from './routes/aiRoutes';
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
const sessionOptions: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || (() => { 
        console.warn('⚠️ SESSION_SECRET not set, using temporary value.'); 
        return 'temp-secret-key-12345'; 
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        // In Vercel/Production, we must use Secure and SameSite=None for cross-site SSO to work
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        sameSite: (process.env.NODE_ENV === 'production' || !!process.env.VERCEL) ? 'none' : 'lax',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
};

// Only use MongoDB store if URI is available
if (process.env.MONGODB_URI) {
    sessionOptions.store = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60 // 1 day
    });
} else {
    console.error('❌ MONGODB_URI is missing. Sessions will be memory-only and will reset on every deploy.');
}

app.use(session(sessionOptions));


// Initialize Scheduler (runs in dev + production; Vercel guard is inside initScheduler)
if (process.env.ENABLE_SCHEDULER !== 'false') {
    initScheduler();
}

app.use(passport.initialize());
app.use(passport.session()); // Required for OAuth state/PKCE
configurePassport();

// Database Connection
if (process.env.MONGODB_URI) {
    // Optimization for Serverless (Vercel): Disable buffering so we don't hang if connection is down
    mongoose.set('bufferCommands', false);

    mongoose.connect(process.env.MONGODB_URI, {
        dbName: 'hrm',
        serverSelectionTimeoutMS: 10000, // 10 seconds
        socketTimeoutMS: 45000, // 45 seconds (standard for cloud DBs)
    })
    .then(() => console.log('✅ Connected to MongoDB (hrm)'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.error('👉 TIP: Check if your IP is whitelisted (0.0.0.0/0) in Cosmos DB / MongoDB Atlas.');
    });
} else {
    console.error('❌ FATAL: MONGODB_URI is not defined.');
}

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/employees', employeeRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authLimiter, authRoutes); // Stricter rate limit on auth
app.use('/api/ai', aiRoutes);

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        dbConnected: mongoose.connection.readyState === 1
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
    const portNum = typeof PORT === 'string' ? parseInt(PORT) : PORT;
    app.listen(portNum, '0.0.0.0', () => {
        console.log(`Server is running on port ${portNum}`);
    });
}

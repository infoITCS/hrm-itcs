import dotenv from 'dotenv';
// Load environment variables FIRST before any other imports
dotenv.config();

// Defensive Sanitization: Trim all critical environment variables to remove accidental newlines/whitespace
const criticalEnvVars = [
    'MONGODB_URI', 'JWT_SECRET', 'SESSION_SECRET', 'MICROSOFT_CLIENT_ID', 
    'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID', 
    'MICROSOFT_CALLBACK_URL', 'FRONTEND_URL', 'CLIENT_URL',
    'GEMINI_API_KEY'
];
criticalEnvVars.forEach(key => {
    if (process.env[key]) {
        process.env[key] = process.env[key]?.trim();
    }
});

// CRASH LOGGING: Catch any deep server errors and exit gracefully
process.on('uncaughtException', (err) => {
    console.error('❌ CRITICAL: Uncaught Exception:', err);
    // Process is in undefined state after uncaughtException — must exit
    setTimeout(() => process.exit(1), 1000).unref();
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit in serverless environment — let Vercel handle the lifecycle
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
import mongoSanitize from 'express-mongo-sanitize';

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
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
        },
    }
}));
app.use(cors(corsOptions));
// NoSQL Injection Defense: Strip MongoDB operators ($, .) from all user input globally
app.use(mongoSanitize({ replaceWith: '_', allowDots: false }));
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
const getSessionSecret = (): string => {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        // Fallback to JWT_SECRET if session secret is missing to prevent crash
        if (process.env.JWT_SECRET) {
            console.warn('⚠️ SESSION_SECRET not set, falling back to JWT_SECRET.');
            return process.env.JWT_SECRET;
        }
        
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
            console.error('❌ FATAL: SESSION_SECRET and JWT_SECRET are missing!');
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
    sessionOptions.store = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60 // 1 day
    });
} else {
    console.error('❌ MONGODB_URI is missing. Sessions will be memory-only and will reset on every deploy.');
}

app.use(session(sessionOptions));

// Middleware to ensure DB connection is ready before processing requests
app.use(async (req, res, next) => {
    // Cast to any to avoid TypeScript enum comparison issues during build
    if ((mongoose.connection.readyState as any) !== 1) {
        console.log(`⌛ Waiting for MongoDB connection... (Current state: ${mongoose.connection.readyState})`);
        try {
            // Wait up to 5 seconds for existing connection attempt to finish
            let attempts = 0;
            while ((mongoose.connection.readyState as any) !== 1 && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
        } catch (e) {}
    }
    next();
});


// Initialize Scheduler (runs in dev + production; Vercel guard is inside initScheduler)
if (process.env.ENABLE_SCHEDULER !== 'false') {
    initScheduler();
}

app.use(passport.initialize());
app.use(passport.session()); // Required for OAuth state/PKCE
configurePassport();

// Database Connection
if (process.env.MONGODB_URI) {
    const maskedUri = process.env.MONGODB_URI.replace(/\/\/.*@/, '//****:****@');
    console.log(`📡 Attempting to connect to: ${maskedUri}`);
    
    // Note: Do NOT set bufferCommands=false on serverless as it causes 500 errors 
    // if the very first request hits before the DB is fully connected.
    
    mongoose.connect(process.env.MONGODB_URI, {
        dbName: 'hrm',
        autoIndex: true,
        connectTimeoutMS: 30000,      // wait up to 30s for initial connection
        socketTimeoutMS: 45000,       // wait up to 45s for queries
        serverSelectionTimeoutMS: 30000, 
        heartbeatFrequencyMS: 10000,
        retryWrites: false,
        retryReads: true,
        bufferCommands: true,
        // Wait indefinitely for the connection rather than timing out the buffer after 10s
        // mongoose defaults this to 10000ms, which is too short for some cold starts.
    }).then(() => {
        console.log('✅ Connected to MongoDB (Cosmos DB)');
    }).catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('👉 TIP: Check if your IP is whitelisted (0.0.0.0/0) in Cosmos DB / Networking.');
    });
    
    // Globally increase the buffer timeout so Mongoose doesn't give up after 10s
    mongoose.set('bufferTimeoutMS', 30000);
} else {
    console.error('❌ FATAL ERROR: MONGODB_URI IS MISSING IN VERCEL ENVIRONMENT VARIABLES!');
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
    // Temporarily exposing error message and stack even in production to help debug the 500 error
    res.status(500).json({ 
        message: err.message || 'Internal server error', 
        stack: process.env.VERCEL ? 'Exposed for debugging' : err.stack,
        code: err.code,
        name: err.name
    });
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

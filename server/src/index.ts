import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import employeeRoutes from './routes/employeeRoutes';
import auditRoutes from './routes/auditRoutes';
import { initScheduler } from './services/scheduler';

import passport from 'passport';
import configurePassport from './config/passport';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Configuration for Production
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Scheduler (only in production with proper environment)
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SCHEDULER !== 'false') {
    initScheduler();
}

app.use(passport.initialize());
configurePassport();

// Database Connection
mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: 'hrm'
})
    .then(() => console.log('Connected to MongoDB (hrm)'))
    .catch(err => console.error('Could not connect to MongoDB', err));

import authRoutes from './routes/authRoutes';

// Routes
app.use('/api/employees', employeeRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
    res.send('HRM API is running');
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

import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
        (info: any) => `${info.timestamp} ${info.level}: ${info.message}` + (info.stack ? `\n${info.stack}` : '')
    )
);

// For Vercel/Production, we use Console logging ONLY. 
// File logging is disabled because Vercel is a read-only environment.
const isVercel = !!process.env.VERCEL;
const transports: winston.transport[] = [];

if (isVercel) {
    transports.push(new winston.transports.Console({
        format: consoleFormat
    }));
} else {
    // Local development can still use files
    transports.push(new winston.transports.DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        maxSize: '20m',
    }));
    transports.push(new winston.transports.DailyRotateFile({
        level: 'error',
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '30d',
        maxSize: '20m',
    }));
    
    if (process.env.NODE_ENV !== 'production') {
        transports.push(new winston.transports.Console({
            format: consoleFormat
        }));
    }
}

// Create the logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    defaultMeta: { service: 'hrm-server' },
    transports: transports
});

export default logger;

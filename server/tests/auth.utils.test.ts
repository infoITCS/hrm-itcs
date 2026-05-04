import { AuthUtils, JwtPayload } from '../src/middleware/auth.utils';
import jwt from 'jsonwebtoken';

describe('AuthUtils', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv, JWT_SECRET: 'test-secret' };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should generate a token with the correct payload', () => {
        const payload = { userId: '123', email: 'test@test.com', role: 'admin' };
        const token = AuthUtils.generateToken(payload);
        expect(typeof token).toBe('string');

        const decoded = jwt.verify(token, 'test-secret') as JwtPayload;
        expect(decoded.userId).toBe('123');
        expect(decoded.role).toBe('admin');
    });

    it('should verify a valid token', () => {
        const payload = { userId: '123', email: 'test@test.com', role: 'admin' };
        const token = AuthUtils.generateToken(payload);
        
        const decoded = AuthUtils.verifyToken(token);
        expect(decoded).not.toBeNull();
        expect(decoded?.userId).toBe('123');
        expect(decoded?.role).toBe('admin');
    });

    it('should return null for an invalid token', () => {
        const decoded = AuthUtils.verifyToken('invalid.token.string');
        expect(decoded).toBeNull();
    });

    it('should return null for an expired token', () => {
        // Generate a token that expires in 0s (sets expiration to current timestamp so it's immediately expired upon verification)
        const token = AuthUtils.generateToken({ userId: '123', email: 'test@test.com', role: 'admin' }, '0s');
        const decoded = AuthUtils.verifyToken(token);
        expect(decoded).toBeNull();
    });
});


import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthUtils } from '../middleware/auth.utils';
import { User, IUser } from '../models/User.model';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/auth/microsoft
 * @desc    Initiate Microsoft OAuth login
 * @access  Public
 */
router.get('/microsoft', (req: Request, res: Response, next: NextFunction) => {
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
        return res.status(503).json({ 
            message: 'Microsoft OAuth is not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.' 
        });
    }
    
    // Check if user wants to select a different account
    const prompt = req.query.prompt === 'select_account' ? 'select_account' : undefined;
    
    // Store prompt in the request so customParams can access it
    if (prompt) {
        (req as any).oauthPrompt = prompt;
        // Also store in query for passport to pick up
        req.query.prompt = prompt;
    }
    
    // Create a wrapper that ensures prompt is passed
    const authenticate = passport.authenticate('microsoft', {
        session: false,
        // Try to pass prompt through authenticate options
        ...(prompt && { prompt })
    });
    
    authenticate(req, res, next);
});

/**
 * @route   GET /api/auth/microsoft/callback
 * @desc    Microsoft OAuth callback
 * @access  Public
 */
router.get(
    '/microsoft/callback',
    (req: Request, res: Response, next: NextFunction) => {
        if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
            return res.redirect(`${clientUrl}/login?error=microsoft_not_configured`);
        }
        passport.authenticate('microsoft', {
            failureRedirect: `${process.env.CLIENT_URL}/login?error=login_failed`,
            session: false // We use JWT, so no session needed
        })(req, res, next);
    },
    async (req: Request, res: Response) => {
        try {
            const user = req.user as IUser;

            if (!user) {
                return res.redirect(`${process.env.CLIENT_URL}/login?error=user_not_found`);
            }

            // Generate JWT token
            const token = AuthUtils.generateToken({
                userId: user._id.toString(),
                email: user.email,
                role: user.role,
            });

            // Redirect to frontend with token
            res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
        } catch (error: any) {
            console.error('❌ Microsoft callback error:', error.message);
            res.redirect(`${process.env.CLIENT_URL}/login?error=callback_error`);
        }
    }
);

// Add /auth/me endpoint for fetching current user
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthRequest;
        const user = await User.findById(authReq.user?.userId).select('-microsoftId -password'); // Exclude sensitive info
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error: any) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
});

export default router;

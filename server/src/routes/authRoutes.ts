
import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthUtils } from '../middleware/auth.utils';
import { User, IUser } from '../models/User.model';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/auth/microsoft
 * @desc    Initiate Microsoft OAuth login
 * @access  Public
 */
router.get('/microsoft', passport.authenticate('microsoft', {
    // Optional: define scopes here if not defined in strategy
    // scope: ['user.read']
}));

/**
 * @route   GET /api/auth/microsoft/callback
 * @desc    Microsoft OAuth callback
 * @access  Public
 */
router.get(
    '/microsoft/callback',
    passport.authenticate('microsoft', {
        failureRedirect: `${process.env.CLIENT_URL}/login?error=login_failed`,
        session: false // We use JWT, so no session needed
    }),
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
router.get('/me', authenticate, async (req: any, res: Response) => {
    try {
        const user = await User.findById(req.user.userId).select('-microsoftId'); // Exclude sensitive info if any
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

export default router;

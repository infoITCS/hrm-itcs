
import passport from 'passport';
// @ts-ignore
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { User, UserRole } from '../models/User.model';
import logger from '../utils/logger';


// Passport serialization
passport.serializeUser((user: any, done: any) => {
    done(null, user._id);
});

passport.deserializeUser(async (id: string, done: any) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Microsoft OAuth Strategy configuration
// Only initialize if required environment variables are present
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_CALLBACK_URL) {
    // Use tenant-specific endpoint (required for single-tenant apps)
    // If MICROSOFT_TENANT_ID is not set, use 'organizations' as fallback (works for most orgs)
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'organizations';
    const baseUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
    
    // Build strategy options
    const strategyOptions: any = {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        callbackURL: process.env.MICROSOFT_CALLBACK_URL,
        scope: ['openid', 'profile', 'email', 'user.read'], // Added required openid scope
        tenant: tenantId,
        authorizationURL: `${baseUrl}/authorize`,
        tokenURL: `${baseUrl}/token`,
        pkce: true, // Enable PKCE (Proof Key for Code Exchange) - required by Azure AD
        state: true, // Required when PKCE is enabled
        // Custom function to add prompt parameter to authorization URL
        customParams: (req: any) => {
            const prompt = req?.query?.prompt || req?.oauthPrompt || (req && typeof req === 'object' && 'prompt' in req ? req.prompt : undefined);
            if (prompt === 'select_account') {
                return { prompt: 'select_account' };
            }
            return {};
        }
    };
    
    if (process.env.MICROSOFT_CLIENT_SECRET) {
        strategyOptions.clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    }
    
    passport.use(
        new MicrosoftStrategy(
            { ...strategyOptions, passReqToCallback: true },
            async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
                try {
                    const forceSync = req.session?.force_ms_sync === true;
                    if (req.session) {
                        req.session.force_ms_sync = false;
                    }
                    // Extract email from profile
                    const email = profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName;

                    if (!email) {
                        logger.error('❌ No email found in Microsoft profile');
                        return done(null, false, { message: 'No email found in Microsoft profile' });
                    }

                    // Fetch Profile Photo from Microsoft Graph API
                    let profilePhotoBase64 = null;
                    try {
                        const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
                            headers: { Authorization: `Bearer ${accessToken}` }
                        });
                        if (photoResponse.ok) {
                            const arrayBuffer = await photoResponse.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            const contentType = photoResponse.headers.get('content-type') || 'image/jpeg';
                            profilePhotoBase64 = `data:${contentType};base64,${buffer.toString('base64')}`;
                        }
                    } catch (photoErr: any) {
                        logger.warn(`⚠️ Failed to fetch Microsoft profile photo: ${photoErr?.message}`);
                    }

                    // Find existing user or create new one
                    let user = await User.findOne({ email });

                    if (!user) {
                        // Create new user with default Employee role
                        user = await User.create({
                            email,
                            role: UserRole.EMPLOYEE, // Default role for new SSO users
                            isActive: true, // Default to active for SSO
                            firstName: profile.name?.givenName || 'Unknown',
                            lastName: profile.name?.familyName || 'User',
                            microsoftId: profile.id,
                            avatar: profilePhotoBase64 || undefined,
                            needsPasswordSetup: true // Prompt user to set a password on first login
                        });
                    } else if (!user.isActive) {
                        // Block suspended users from SSO login
                        return done(null, false, { message: 'Your account has been suspended.' });
                    } else {
                        let changed = false;

                        // Link Microsoft ID if not yet linked
                        if (!user.microsoftId) {
                            user.microsoftId = profile.id;
                            changed = true;
                        }

                        // Sync Avatar if Microsoft gave us one, and user hasn't manually uploaded one locally
                        if (profilePhotoBase64) {
                            if (forceSync || !user.avatar || user.avatar.startsWith('data:image')) {
                                user.avatar = profilePhotoBase64;
                                changed = true;
                            }
                        }

                        // If the user has no real bcrypt password yet, flag them for password setup.
                        const hasRealPassword = user.password && user.password.startsWith('$2') && user.password.length === 60;
                        if (!hasRealPassword && !user.needsPasswordSetup) {
                            user.needsPasswordSetup = true;
                            changed = true;
                        }

                        if (changed) await user.save();
                    }

                    // Attempt to sync the avatar to the Employee profile as well
                    if (profilePhotoBase64) {
                        try {
                            const mongoose = require('mongoose');
                            const Employee = mongoose.model('Employee');
                            const emp = await Employee.findOne({ userId: user._id });
                            if (emp && (forceSync || !emp.avatar || emp.avatar.startsWith('data:image'))) {
                                emp.avatar = profilePhotoBase64;
                                await emp.save();
                            }
                        } catch (syncErr) {
                            // Silently fail employee sync if employee model not loaded or not found
                        }
                    }

                    return done(null, user);
                } catch (error: any) {
                    logger.error('❌ Microsoft SSO error:', error.message);
                    return done(error, undefined);
                }
            }
        )
    );
    logger.info(`✅ Microsoft OAuth strategy configured (Tenant: ${tenantId})`);
} else {
    logger.warn('⚠️  Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_CALLBACK_URL to enable.');
}

export default () => { };

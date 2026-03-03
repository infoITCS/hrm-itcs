
import passport from 'passport';
// @ts-ignore
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { User, UserRole } from '../models/User.model';

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
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CALLBACK_URL) {
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
        // This function is called by passport-oauth2 to add custom parameters to the authorization URL
        customParams: (req: any) => {
            // Check both query param and request property (set in authRoutes)
            // Note: req might be undefined in some passport-oauth2 versions, so we check multiple sources
            const prompt = req?.query?.prompt || req?.oauthPrompt || (req && typeof req === 'object' && 'prompt' in req ? req.prompt : undefined);
            console.log('customParams called with prompt:', prompt, 'req:', req ? 'exists' : 'undefined');
            if (prompt === 'select_account') {
                return { prompt: 'select_account' };
            }
            return {};
        }
    };
    
    // Only add clientSecret if provided (for confidential clients/Web apps)
    // Public clients (SPA/Mobile) don't use client secrets
    if (process.env.MICROSOFT_CLIENT_SECRET) {
        strategyOptions.clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    }
    
    passport.use(
        new MicrosoftStrategy(
            strategyOptions,
            async (accessToken: string, refreshToken: string, profile: any, done: any) => {
                try {
                    // Extract email from profile
                    const email = profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName;

                    if (!email) {
                        console.error('❌ No email found in Microsoft profile');
                        // done should be called with (error, user, info)
                        return done(null, false, { message: 'No email found in Microsoft profile' });
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

                        // If the user has no real bcrypt password yet, flag them for password setup.
                        // This handles existing accounts created before the feature was added,
                        // so you DON'T need to delete any users — they'll get the popup on next login.
                        const hasRealPassword = user.password && user.password.startsWith('$2') && user.password.length === 60;
                        if (!hasRealPassword && !user.needsPasswordSetup) {
                            user.needsPasswordSetup = true;
                            changed = true;
                        }

                        if (changed) await user.save();
                    }

                    return done(null, user);
                } catch (error: any) {
                    console.error('❌ Microsoft SSO error:', error.message);
                    return done(error, undefined);
                }
            }
        )
    );
    console.log(`✅ Microsoft OAuth strategy configured (Tenant: ${tenantId})`);
} else {
    console.warn('⚠️  Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_CALLBACK_URL to enable.');
}

export default () => { }; // Export empty function to satisfy init expectation or change call site


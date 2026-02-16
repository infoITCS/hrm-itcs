
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
passport.use(
    new MicrosoftStrategy(
        {
            clientID: process.env.MICROSOFT_CLIENT_ID || '',
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
            callbackURL: process.env.MICROSOFT_CALLBACK_URL || '',
            scope: ['openid', 'profile', 'email', 'user.read'], // Added required openid scope
            tenant: process.env.MICROSOFT_TENANT_ID || 'common',
            authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        },
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
                        password: 'microsoft-sso-' + Date.now(), // Random password
                        role: UserRole.EMPLOYEE,
                        isActive: true, // Default to active for SSO
                        firstName: profile.name?.givenName || 'Unknown',
                        lastName: profile.name?.familyName || 'User',
                        microsoftId: profile.id
                    });
                } else if (!user.microsoftId) {
                    // Link if exists by email but not microsoftId
                    user.microsoftId = profile.id;
                    await user.save();
                }

                return done(null, user);
            } catch (error: any) {
                console.error('❌ Microsoft SSO error:', error.message);
                return done(error, undefined);
            }
        }
    )
);

export default () => { }; // Export empty function to satisfy init expectation or change call site


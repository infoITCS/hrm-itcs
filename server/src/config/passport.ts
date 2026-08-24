
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

                    // ── SSO AUTO-PROVISIONING / LINKING WORKFLOW ──
                    try {
                        const mongoose = require('mongoose');
                        const Employee = mongoose.model('Employee');
                        const Counter = mongoose.model('Counter');

                        // 1. Check if employee profile is already linked to this userId
                        let employeeDoc = await Employee.findOne({ userId: user._id.toString() });

                        if (!employeeDoc) {
                            // 2. If not linked, check if an employee record exists with this email/workEmail
                            employeeDoc = await Employee.findOne({
                                $or: [
                                    { email: { $regex: new RegExp('^' + email.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                                    { workEmail: { $regex: new RegExp('^' + email.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } }
                                ]
                            });

                            if (employeeDoc) {
                                // 3. Auto-link existing profile
                                employeeDoc.userId = user._id.toString();
                                if (profilePhotoBase64 && (!employeeDoc.avatar || employeeDoc.avatar.startsWith('data:image'))) {
                                    employeeDoc.avatar = profilePhotoBase64;
                                }
                                await employeeDoc.save();
                                logger.info(`[SSO Link] Linked existing employee ${employeeDoc.employeeId} to user ${user._id}`);
                            } else {
                                // 4. Auto-provision a new employee record
                                const PREFIX = 'itcs-';
                                const existingEmployees = await Employee.find({ employeeId: { $regex: /^itcs-\d+$/i }, isDeleted: { $ne: true } })
                                    .select('employeeId')
                                    .lean();

                                let maxSeq = 0;
                                for (const emp of (existingEmployees as any[])) {
                                    const match = (emp.employeeId || '').match(/^itcs-(\d+)$/i);
                                    if (match) {
                                        const num = parseInt(match[1], 10);
                                        if (num > maxSeq) maxSeq = num;
                                    }
                                }

                                const nextNum = maxSeq + 1;
                                const employeeId = `${PREFIX}${nextNum.toString().padStart(3, '0')}`;

                                await Counter.findOneAndUpdate(
                                    { key: 'employeeId' },
                                    { $set: { seq: nextNum } },
                                    { upsert: true }
                                );

                                employeeDoc = await Employee.create({
                                    employeeId,
                                    userId: user._id.toString(),
                                    firstName: user.firstName || 'Unknown',
                                    lastName: user.lastName || 'User',
                                    email: user.email,
                                    workEmail: user.email,
                                    avatar: profilePhotoBase64 || undefined,
                                    jobInfo: {
                                        designation: 'Employee',
                                        department: 'General',
                                        joiningDate: new Date(),
                                    },
                                    employmentStatus: {
                                        status: 'Probation',
                                        probationEndDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                                    }
                                });
                                logger.info(`[SSO Provision] Created new employee profile ${employeeId} for user ${user._id}`);
                            }
                        } else {
                            // Sync avatar to existing linked employee if forced or not set
                            if (profilePhotoBase64 && (forceSync || !employeeDoc.avatar || employeeDoc.avatar.startsWith('data:image'))) {
                                employeeDoc.avatar = profilePhotoBase64;
                                await employeeDoc.save();
                            }
                        }
                    } catch (provErr: any) {
                        logger.error(`[SSO Auto-Provision] Error provisioning employee for user ${user._id}:`, provErr.message);
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

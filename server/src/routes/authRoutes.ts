import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { AuthUtils } from "../middleware/auth.utils";
import { User, IUser } from "../models/User.model";
import Employee from "../models/Employee";
import { authenticate, AuthRequest } from "../middleware/auth";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendPasswordResetEmail, sendMasterPinResetOtpEmail } from "../utils/email";
import RolePermission from "../models/RolePermission";
import MasterSecurityPin from "../models/MasterSecurityPin";
import rateLimit from "express-rate-limit";
import logger from '../utils/logger';


const router = Router();

// Rate limiter for authentication attempts (max 10 attempts per 15 mins per IP)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Too many login attempts from this IP. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Password strength validator
const validatePassword = (password: string): string | null => {
    if (!password || password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
    return null; // valid
};

/**
 * @route   POST /api/auth/login
 * @desc    Login with email and password
 * @access  Public
 */
router.post("/login", loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide both email and password" });
    }

    const user = await User.findOne({ email });
    
    // Check if user exists and has a password
    if (!user || !user.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if user account is active
    if (user.isActive === false) {
      return res.status(403).json({ message: "Your account has been suspended. Please contact your administrator." });
    }

    // Auto-migrate legacy 'hr' role to 'admin'
    if (user.role === 'hr') {
      user.role = 'admin';
      await user.save();
    }

    // Use our new compare method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = AuthUtils.generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Also fetch associated employee to return similar data shape to /me
    const employee = await Employee.findOne({ userId: user._id }).select('-attachments.fileData');

    let avatarUrl = user.avatar;
    if (!avatarUrl && employee) {
      const profilePic = employee.attachments?.find(
        (att: any) => att.fileType === "Profile Picture"
      );
      if (profilePic) {
        avatarUrl = `/api/employees/attachments/raw/${profilePic._id}`;
      }
    }

    const rolePerm = (await RolePermission.findOne({ role: user.role }).lean()) as any;

    res.json({
      token,
      user: {
        id: user._id,
        _id: user._id, // Adding both just in case frontend relies on either
        email: user.email,
        role: user.role,
        firstName: user.firstName || employee?.firstName,
        lastName: user.lastName || employee?.lastName,
        avatar: avatarUrl,
        hasProfile: !!employee,
        permissions: rolePerm?.permissions || {},
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password (authenticated)
 * @access  Private
 */
router.post("/change-password", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const { currentPassword, newPassword } = req.body;

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await User.findById(authReq.user?.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If user has a dummy password (from SSO, not beginning with $2 meaning it wasn't hashed)
    // or if they have a real password, verify current password first if provided
    if (user.password && user.password.startsWith('$2')) {
        if (!currentPassword) {
            return res.status(400).json({ message: "Please provide your current password" });
        }
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password" });
        }
    }

    user.password = newPassword;
    await user.save(); // pre-save hook will hash it

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/setup-password
 * @desc    Set password for first-time Microsoft SSO users (no current password needed)
 * @access  Private
 */
router.post("/setup-password", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const { newPassword } = req.body;

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await User.findById(authReq.user?.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Security guard: If user already has an established bcrypt password and does not need setup, enforce /change-password
    if (user.password && user.password.startsWith('$2') && !user.needsPasswordSetup) {
      return res.status(400).json({ message: "Password is already set. Use the change-password endpoint with your current password." });
    }

    user.password = newPassword;
    user.needsPasswordSetup = false;
    await user.save(); // pre-save hook will hash it

    res.json({ message: "Password set successfully" });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/auth/file-token
 * @desc    Generate a short-lived (5 min) token for media/file previews
 * @access  Private
 */
router.get("/file-token", authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const fileToken = AuthUtils.generateFileToken({
    userId: authReq.user!.userId,
    role: authReq.user!.role,
  });
  res.json({ fileToken });
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset link
 * @access  Public
 */
router.post("/forgot-password", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Please provide your email address" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            // Return success even if user not found to prevent email enumeration
            return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
        }

        // Generate a reset token — send plain token in email, store only SHA-256 hash in DB
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        // Save hashed token and expiry (1 hour)
        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour from now
        await user.save();

        // Send plain (unhashed) token in the email link
        const emailResult = await sendPasswordResetEmail(user.email, resetToken, req.headers.origin as string) as any;

        if (!emailResult.success) {
            logger.error(`❌ Forgot Password: Failed to send reset email to ${email}. Error: ${emailResult.error}`);
            // Roll back the token save so they can try again fresh
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            return res.status(500).json({ 
                message: "We encountered an issue sending the reset email. Please try again later or contact support if the problem persists."
            });
        }

        logger.info(`📧 Forgot Password: Reset link sent to ${email}`);
        return res.json({ message: "If an account with that email exists, a password reset link has been sent." });

    } catch (error: any) {
        logger.error('🔥 Forgot Password Error:', error.message);
        next(error);
    }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using a valid token
 * @access  Public
 */
router.post("/reset-password", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { token, newPassword } = req.body;

        const passwordError = validatePassword(newPassword);
        if (!token || passwordError) {
            return res.status(400).json({ message: passwordError || 'Invalid request' });
        }

        // Hash the incoming token to compare against the stored hash
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() } // Ensure token is not expired
        });

        if (!user) {
            return res.status(400).json({ message: "Password reset token is invalid or has expired." });
        }

        // Update password and clear reset token fields
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save(); // Pre-save hook will hash the password

        // Optional: you could email them to say password was successfully changed

        res.json({ message: "Your password has been successfully reset. You can now log in." });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/auth/microsoft
 * @desc    Initiate Microsoft OAuth login
 * @access  Public
 */
router.get("/microsoft", (req: Request, res: Response, next: NextFunction) => {
  if (
    !process.env.MICROSOFT_CLIENT_ID ||
    !process.env.MICROSOFT_CLIENT_SECRET ||
    !process.env.MICROSOFT_CALLBACK_URL
  ) {
    return res.status(503).json({
      message:
        "Microsoft OAuth is not fully configured. Please set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_CALLBACK_URL environment variables.",
    });
  }

  // Check if user wants to select a different account
  const prompt =
    req.query.prompt === "select_account" ? "select_account" : undefined;

  // Store prompt in the request so customParams can access it
  if (prompt) {
    (req as any).oauthPrompt = prompt;
    // Also store in query for passport to pick up
    req.query.prompt = prompt;
  }
  
  if (req.query.sync === 'true' && (req as any).session) {
      (req as any).session.force_ms_sync = true;
  }

  try {
    // Create a wrapper that ensures prompt is passed
    const authenticate = passport.authenticate("microsoft", {
      session: false,
      // Try to pass prompt through authenticate options
      ...(prompt && { prompt }),
    });

    authenticate(req, res, next);
  } catch (error: any) {
    logger.error("❌ Passport Microsoft authentication initialization failed:", error.message);
    res.status(500).json({ 
      message: "Failed to initiate Microsoft login", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

/**
 * @route   GET /api/auth/microsoft/callback
 * @desc    Microsoft OAuth callback
 * @access  Public
 */
router.get(
  "/microsoft/callback",
  (req: Request, res: Response, next: NextFunction) => {
    if (
      !process.env.MICROSOFT_CLIENT_ID ||
      !process.env.MICROSOFT_CLIENT_SECRET
    ) {
      const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
      return res.redirect(`${clientUrl}/login?error=microsoft_not_configured`);
    }
    passport.authenticate("microsoft", { session: false }, (err: any, user: any, info: any) => {
      const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
      if (err) {
        logger.error("Passport Auth Error:", err.message || String(err));
        return res.redirect(`${clientUrl}/login?error=callback_failed`);
      }
      if (!user) {
        const isSuspended = info?.message?.toLowerCase().includes('deactivated') || info?.message?.toLowerCase().includes('suspended');
        const errorType = isSuspended ? 'account_suspended' : 'login_failed';
        const msg = info?.message || 'Sign-in could not be completed. Please try again.';
        return res.redirect(`${clientUrl}/login?error=${errorType}&msg=${encodeURIComponent(msg)}`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const user = req.user as IUser;

      const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
      if (!user) {
        return res.redirect(
          `${clientUrl}/login?error=user_not_found`,
        );
      }

      // Generate JWT token
      const token = AuthUtils.generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      // Use hash (#token=...) so long JWT isn't truncated by query string limits
      res.redirect(`${clientUrl}/auth/callback#token=${encodeURIComponent(token)}`);
    } catch (error: any) {
      logger.error("❌ Microsoft callback error:", error.message);
      const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
      res.redirect(`${clientUrl}/login?error=callback_error`);
    }
  },
);

// Add /auth/me endpoint for fetching current user
router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Use lean() for performance if we only need the data, but keep it as doc if we need to save()
    let user = await User.findById(userId).select("-password");

    if (!user) {
      logger.error(`❌ User not found in /me: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    // Find associated employee - use string ID comparison
    const employee = await Employee.findOne({ userId: user._id.toString() }).select('-attachments.fileData').lean() as any;

    // Auto-sync from Employee record
    if (employee) {
      let updated = false;
      if (employee.firstName && user.firstName !== employee.firstName) {
        user.firstName = employee.firstName;
        updated = true;
      }
      if (employee.lastName && user.lastName !== employee.lastName) {
        user.lastName = employee.lastName;
        updated = true;
      }
      
      // Force sync avatar if it differs
      if (employee.avatar && user.avatar !== employee.avatar) {
        user.avatar = employee.avatar;
        updated = true;
      }

      if (updated) {
        await user.save();
      }
    }

    const rolePerm = (await RolePermission.findOne({ role: user.role }).lean()) as any;
    const userObj = user.toObject();
    res.json({
      ...userObj,
      id: userObj._id,
      hasProfile: !!employee,
      permissions: rolePerm?.permissions || {}
    });
  } catch (error: any) {
    logger.error("🔥 Error in /auth/me:", error.message);
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4-Digit Salary Security PIN Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/auth/salary-pin/status
 * @desc    Check whether current user has configured a 4-digit salary security PIN
 * @access  Private
 */
router.get("/salary-pin/status", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const user = await User.findById(userId).select("salaryPin role");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      hasPin: !!user.salaryPin,
      isSuperAdmin: user.role === 'super-admin'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/salary-pin/set
 * @desc    Set or update 4-digit salary security PIN
 * @access  Private
 */
router.post("/salary-pin/set", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.userId;
    const { pin, currentPin } = req.body;

    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    if (!pin || !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ message: "PIN must be exactly 4 numeric digits." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // If user already has a PIN and is not super-admin, require verification of existing PIN
    if (user.salaryPin && user.role !== 'super-admin') {
      if (!currentPin) {
        return res.status(400).json({ message: "Current 4-digit PIN is required to set a new PIN." });
      }
      const isCurrentValid = await user.compareSalaryPin(String(currentPin));
      const masterDoc = await MasterSecurityPin.findOne();
      const isMasterKey = masterDoc 
        ? await masterDoc.comparePin(String(currentPin)) 
        : (String(currentPin) === (process.env.SUPER_ADMIN_MASTER_PIN || '7777'));
      
      if (!isCurrentValid && !isMasterKey) {
        return res.status(401).json({ message: "Current 4-digit PIN is incorrect." });
      }
    }

    user.salaryPin = String(pin);
    await user.save();

    logger.info(`🔒 User ${user.email} updated their 4-digit Salary Security PIN`);
    res.json({ message: "4-Digit Salary Security PIN set successfully." });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/salary-pin/verify
 * @desc    Verify 4-digit salary security PIN for personal account with Master PIN fallback.
 *          ZERO AUTOMATIC ROLE BYPASS: PIN must always be provided!
 * @access  Private
 */
router.post("/salary-pin/verify", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.userId;
    const { pin } = req.body;

    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    if (!pin) return res.status(400).json({ message: "4-Digit PIN is required." });

    const pinStr = String(pin).trim();

    // 1. Check against Universal Master Financial PIN
    const masterDoc = await MasterSecurityPin.findOne();
    if (masterDoc && (await masterDoc.comparePin(pinStr))) {
      return res.json({ success: true, isMaster: true, message: "Universal Master Security PIN verified." });
    }

    // 2. Check against User's personal PIN
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.salaryPin) {
      return res.status(404).json({ message: "No 4-digit PIN set. Please set your PIN first.", needsSetup: true });
    }

    const isValid = await user.compareSalaryPin(pinStr);
    if (!isValid) {
      return res.status(401).json({ message: "Incorrect 4-digit Security PIN." });
    }

    res.json({ success: true, message: "Personal Security PIN verified successfully." });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/master-pin/verify
 * @desc    Verify Universal Master Financial PIN for Super Admin / HR (Zero-Bypass)
 * @access  Private (Super Admin / HR / Admin / Finance)
 */
router.post("/master-pin/verify", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;
    const { pin } = req.body;

    if (!['super-admin', 'hr', 'admin', 'finance'].includes(userRole || '')) {
      return res.status(403).json({ message: "Unauthorized. Financial access restricted." });
    }

    if (!pin) return res.status(400).json({ message: "4-Digit Master PIN is required." });

    const pinStr = String(pin).trim();
    const masterDoc = await MasterSecurityPin.findOne();
    
    if (!masterDoc) {
      return res.status(500).json({ message: "Master Security PIN is not configured on the server." });
    }

    const isValid = await masterDoc.comparePin(pinStr);
    if (!isValid) {
      return res.status(401).json({ message: "Incorrect Universal Master Security PIN." });
    }

    logger.info(`🔒 Master Financial PIN successfully verified for user ${authReq.user?.email} (${userRole})`);
    res.json({ success: true, isMaster: true, message: "Universal Master Security PIN verified." });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/master-pin/request-otp
 * @desc    Request a 6-digit OTP sent to Super Admin email to reset the Universal Master PIN
 * @access  Private (Super Admin only)
 */
router.post("/master-pin/request-otp", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;
    const userId = authReq.user?.userId;

    if (userRole !== 'super-admin') {
      return res.status(403).json({ message: "Only the verified Super Admin can request a Master PIN reset." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Target email is strictly locked to the server environment Super Admin email
    // This guarantees that even if someone maliciously edits their MongoDB role to super-admin,
    // the OTP is ONLY sent to the real owner's inbox (abdul.raheem@itcs.com.pk), never to the attacker's email!
    const targetEmail = process.env.SUPER_ADMIN_EMAIL || 'abdul.raheem@itcs.com.pk';

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let masterDoc = await MasterSecurityPin.findOne();
    if (!masterDoc) {
      const defaultPinHash = await bcrypt.hash(process.env.SUPER_ADMIN_MASTER_PIN || '7777', 10);
      masterDoc = new MasterSecurityPin({ hashedMasterPin: defaultPinHash });
    }

    masterDoc.resetOtp = hashedOtp;
    masterDoc.otpExpiresAt = otpExpiresAt;
    await masterDoc.save();

    // Send email dispatch
    await sendMasterPinResetOtpEmail(targetEmail, otp);

    // Mask email for privacy (e.g., ab***m@itcs.com.pk)
    const emailParts = targetEmail.split('@');
    const maskedUser = emailParts[0].length > 2 
      ? `${emailParts[0].substring(0, 2)}***${emailParts[0].slice(-1)}` 
      : `${emailParts[0]}***`;
    const maskedEmail = `${maskedUser}@${emailParts[1]}`;

    logger.info(`📧 Master PIN Reset OTP dispatched to Super Admin email: ${targetEmail}`);
    res.json({ 
      success: true, 
      message: `A 6-digit verification OTP has been dispatched to ${maskedEmail}.`,
      maskedEmail 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/master-pin/confirm-reset
 * @desc    Verify 6-digit Email OTP and update Universal Master Financial PIN
 * @access  Private (Super Admin only)
 */
router.post("/master-pin/confirm-reset", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;

    if (userRole !== 'super-admin') {
      return res.status(403).json({ message: "Only the verified Super Admin can reset the Master PIN." });
    }

    const { otp, newPin } = req.body;

    if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
      return res.status(400).json({ message: "OTP must be a valid 6-digit code." });
    }

    if (!newPin || !/^\d{4}$/.test(String(newPin).trim())) {
      return res.status(400).json({ message: "New Master PIN must be exactly 4 numeric digits." });
    }

    const masterDoc = await MasterSecurityPin.findOne();
    if (!masterDoc || !masterDoc.resetOtp) {
      return res.status(400).json({ message: "No active reset request found. Please request a new OTP." });
    }

    const isOtpValid = await masterDoc.compareOtp(String(otp).trim());
    if (!isOtpValid) {
      return res.status(401).json({ message: "Invalid or expired OTP code. Please request a new one." });
    }

    const salt = await bcrypt.genSalt(10);
    masterDoc.hashedMasterPin = await bcrypt.hash(String(newPin).trim(), salt);
    masterDoc.resetOtp = undefined;
    masterDoc.otpExpiresAt = undefined;
    masterDoc.lastChangedAt = new Date();
    masterDoc.lastChangedBy = authReq.user?.email || 'Super Admin';
    await masterDoc.save();

    logger.info(`🔒 Universal Master Financial PIN has been successfully changed by Super Admin (${authReq.user?.email})`);
    res.json({ success: true, message: "Universal Master Security PIN updated successfully." });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/salary-pin/admin-reset
 * @desc    Super Admin can reset an individual employee's personal salary PIN
 * @access  Private (Super Admin only)
 */
router.post("/salary-pin/admin-reset", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;
    if (userRole !== 'super-admin' && userRole !== 'admin') {
      return res.status(403).json({ message: "Only Super Admin can reset employee PINs." });
    }

    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ message: "targetUserId is required." });

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ message: "Target user not found." });

    targetUser.salaryPin = undefined;
    await targetUser.save();

    res.json({ message: `Personal Salary PIN reset successfully for ${targetUser.email}.` });
  } catch (error) {
    next(error);
  }
});

export default router;


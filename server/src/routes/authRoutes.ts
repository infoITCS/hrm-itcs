import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { AuthUtils } from "../middleware/auth.utils";
import { User, IUser } from "../models/User.model";
import Employee from "../models/Employee";
import { authenticate, AuthRequest } from "../middleware/auth";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/email";
import AuditLog from "../models/AuditLog";
import { z } from "zod";
import logger from '../utils/logger';


const router = Router();

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
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
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

    user.password = newPassword;
    user.needsPasswordSetup = false;
    await user.save(); // pre-save hook will hash it

    res.json({ message: "Password set successfully" });
  } catch (error) {
    next(error);
  }
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
                message: `Error sending reset email: ${emailResult.error || 'Unknown error'}. Please ensure your email configuration is correct.`,
                error: emailResult.error
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
    passport.authenticate("microsoft", {
      failureRedirect: `${process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=login_failed`,
      session: false, // We use JWT, so no session needed
    })(req, res, (err: any) => {
      if (err) {
        logger.error("Passport Auth Error:", err.message || String(err));
        const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
        return res.redirect(
          `${clientUrl}/login?error=passport_err&msg=${encodeURIComponent(err.message || String(err))}`,
        );
      }
      next();
    });
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

    const userObj = user.toObject();
    res.json({
      ...userObj,
      id: userObj._id,
      hasProfile: !!employee,
      needsPasswordSetup: user.needsPasswordSetup ?? false
    });
  } catch (error: any) {
    logger.error("🔥 Error in /auth/me:", error.message);
    next(error);
  }
});




export default router;

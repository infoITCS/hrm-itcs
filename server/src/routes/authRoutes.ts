import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { AuthUtils } from "../middleware/auth.utils";
import { User, IUser } from "../models/User.model";
import Employee from "../models/Employee";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

/**
 * @route   GET /api/auth/microsoft
 * @desc    Initiate Microsoft OAuth login
 * @access  Public
 */
router.get("/microsoft", (req: Request, res: Response, next: NextFunction) => {
  if (
    !process.env.MICROSOFT_CLIENT_ID ||
    !process.env.MICROSOFT_CLIENT_SECRET
  ) {
    return res.status(503).json({
      message:
        "Microsoft OAuth is not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.",
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

  // Create a wrapper that ensures prompt is passed
  const authenticate = passport.authenticate("microsoft", {
    session: false,
    // Try to pass prompt through authenticate options
    ...(prompt && { prompt }),
  });

  authenticate(req, res, next);
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
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      return res.redirect(`${clientUrl}/login?error=microsoft_not_configured`);
    }
    passport.authenticate("microsoft", {
      failureRedirect: `${process.env.CLIENT_URL}/login?error=login_failed`,
      session: false, // We use JWT, so no session needed
    })(req, res, (err: any) => {
      if (err) {
        console.error("Passport Auth Error:", err);
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=passport_err&msg=${encodeURIComponent(err.message || String(err))}`,
        );
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const user = req.user as IUser;

      if (!user) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=user_not_found`,
        );
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
      console.error("❌ Microsoft callback error:", error.message);
      res.redirect(`${process.env.CLIENT_URL}/login?error=callback_error`);
    }
  },
);

// Add /auth/me endpoint for fetching current user
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    let user = await User.findById(authReq.user?.userId).select("-password"); // Exclude sensitive info but keep microsoftId for detection

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const employee = await Employee.findOne({ userId: user._id });

    // Auto-sync from Employee record if names or avatar are missing
    if (employee && (!user.firstName || !user.lastName || !user.avatar)) {
      let updated = false;
      if (!user.firstName && employee.firstName) {
        user.firstName = employee.firstName;
        updated = true;
      }
      if (!user.lastName && employee.lastName) {
        user.lastName = employee.lastName;
        updated = true;
      }
      // Check if there's a profile picture attachment
      const profilePic = employee.attachments?.find(
        (att: any) => att.fileType === "Profile Picture",
      );
      if (!user.avatar && profilePic) {
        user.avatar = `/api/employees/attachments/raw/${profilePic._id}`;
        updated = true;
      }

      if (updated) {
        await user.save();
      }
    }

    res.json({
      ...user.toObject(),
      hasProfile: !!employee,
    });
  } catch (error: any) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

export default router;

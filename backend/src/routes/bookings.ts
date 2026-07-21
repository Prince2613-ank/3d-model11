import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { bookingController } from "../controllers/bookingController";

const router = Router();

// Same spam-guard rationale as complaint creation — a signed-in user could
// otherwise hammer admins with notifications.
const notifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many booking notifications submitted. Please try again later." }
});

router.post("/notify", requireAuth, notifyLimiter, asyncHandler(bookingController.notifyBooked));
router.post("/notify-cancel", requireAuth, notifyLimiter, asyncHandler(bookingController.notifyCancelled));

export default router;

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { complaintController } from "../controllers/complaintController";

const router = Router();

// Spec requirement: rate limit complaint creation to prevent abuse/spam.
const createComplaintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many complaints submitted. Please try again later." }
});

router.post("/", requireAuth, createComplaintLimiter, asyncHandler(complaintController.create));
router.get("/", requireAdmin, asyncHandler(complaintController.list));
router.get("/mine", requireAuth, asyncHandler(complaintController.listMine));
router.get("/:id/history", requireAuth, asyncHandler(complaintController.history));
router.get("/:id", requireAuth, asyncHandler(complaintController.getById));
router.patch("/:id/assign", requireAdmin, asyncHandler(complaintController.assign));
router.patch("/:id/resolve", requireAdmin, asyncHandler(complaintController.resolve));
router.patch("/:id/reject", requireAdmin, asyncHandler(complaintController.reject));
router.patch("/:id/reply", requireAdmin, asyncHandler(complaintController.reply));
router.delete("/:id", requireAdmin, asyncHandler(complaintController.remove));

export default router;

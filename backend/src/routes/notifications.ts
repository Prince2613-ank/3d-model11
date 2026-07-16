import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { notificationController } from "../controllers/notificationController";

const router = Router();

router.get("/", requireAuth, asyncHandler(notificationController.list));
router.get("/unread-count", requireAuth, asyncHandler(notificationController.unreadCount));
router.post("/message", requireAuth, requireAdmin, asyncHandler(notificationController.sendMessage));
router.patch("/:id/read", requireAuth, asyncHandler(notificationController.markRead));
router.patch("/read-all", requireAuth, asyncHandler(notificationController.markAllRead));

export default router;

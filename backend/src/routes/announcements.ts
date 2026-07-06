import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { announcementController } from "../controllers/announcementController";

const router = Router();

router.get("/active", asyncHandler(announcementController.listActive));
router.get("/", requireAdmin, asyncHandler(announcementController.listAll));
router.post("/", requireAdmin, asyncHandler(announcementController.create));
router.patch("/:id", requireAdmin, asyncHandler(announcementController.update));
router.patch("/:id/active", requireAdmin, asyncHandler(announcementController.setActive));
router.delete("/:id", requireAdmin, asyncHandler(announcementController.remove));

export default router;

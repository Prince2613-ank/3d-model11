import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { profileController } from "../controllers/profileController";

const router = Router();

router.get("/", requireAdmin, asyncHandler(profileController.list));
router.patch("/:id/role", requireAdmin, asyncHandler(profileController.setRole));
router.patch("/:id/active", requireAdmin, asyncHandler(profileController.setActive));

export default router;

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { profileController } from "../controllers/profileController";

const router = Router();

router.get("/", requireAuth, asyncHandler(profileController.me));

export default router;

import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { statsController } from "../controllers/statsController";

const router = Router();

router.get("/dashboard", requireAdmin, asyncHandler(statsController.dashboard));

export default router;

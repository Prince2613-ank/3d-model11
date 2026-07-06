import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { activityLogController } from "../controllers/activityLogController";

const router = Router();

router.get("/", requireAdmin, asyncHandler(activityLogController.list));

export default router;

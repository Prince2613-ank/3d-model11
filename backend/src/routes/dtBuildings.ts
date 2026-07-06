import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { buildingController } from "../controllers/buildingController";

const router = Router();

router.get("/", asyncHandler(buildingController.list));
router.get("/:id", asyncHandler(buildingController.getById));
router.post("/", requireAdmin, asyncHandler(buildingController.create));
router.patch("/:id", requireAdmin, asyncHandler(buildingController.update));
router.delete("/:id", requireAdmin, asyncHandler(buildingController.remove));

export default router;

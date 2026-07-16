import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { assetController } from "../controllers/assetController";

const router = Router();

router.get("/floor/:floorId", asyncHandler(assetController.listByFloor));
router.get("/object-key/:objectKey", asyncHandler(assetController.getByObjectKey));
router.get("/assigned/:profileId", asyncHandler(assetController.listByAssignedProfile));
router.get("/:id/history", requireAdmin, asyncHandler(assetController.history));
router.get("/:id", asyncHandler(assetController.getById));
router.post("/", requireAdmin, asyncHandler(assetController.create));
router.patch("/:id", requireAdmin, asyncHandler(assetController.update));
router.patch("/:id/move", requireAdmin, asyncHandler(assetController.move));
router.delete("/:id", requireAdmin, asyncHandler(assetController.remove));

export default router;

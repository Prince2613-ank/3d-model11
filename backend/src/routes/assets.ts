import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { assetController } from "../controllers/assetController";

const router = Router();

router.get("/floor/:floorId", asyncHandler(assetController.listByFloor));
router.get("/floor/:floorId/deleted", requireAdmin, asyncHandler(assetController.listDeletedByFloor));
router.get("/object-key/:objectKey", asyncHandler(assetController.getByObjectKey));
router.get("/assigned/:profileId", asyncHandler(assetController.listByAssignedProfile));
router.get("/:id/history", requireAdmin, asyncHandler(assetController.history));
router.get("/:id", asyncHandler(assetController.getById));
router.post("/", requireAdmin, asyncHandler(assetController.create));
router.patch("/:id", requireAdmin, asyncHandler(assetController.update));
router.patch("/:id/assigned-name", requireAuth, asyncHandler(assetController.updateAssignedName));
router.patch("/:id/user-details", requireAuth, asyncHandler(assetController.updateUserDetails));
router.patch("/:id/move", requireAdmin, asyncHandler(assetController.move));
router.patch("/:id/restore", requireAdmin, asyncHandler(assetController.restore));
router.delete("/:id", requireAdmin, asyncHandler(assetController.remove));

export default router;

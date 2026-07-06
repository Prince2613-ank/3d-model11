import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { floorController } from "../controllers/floorController";

const router = Router();

router.get("/building/:buildingId", asyncHandler(floorController.listByBuilding));
router.get("/:id", asyncHandler(floorController.getById));
router.post("/", requireAdmin, asyncHandler(floorController.create));
router.patch("/:id", requireAdmin, asyncHandler(floorController.update));
router.patch("/:id/visibility", requireAdmin, asyncHandler(floorController.setVisibility));
router.delete("/:id", requireAdmin, asyncHandler(floorController.remove));

export default router;

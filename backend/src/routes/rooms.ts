import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { roomController } from "../controllers/roomController";

const router = Router();

router.get("/floor/:floorId", asyncHandler(roomController.listByFloor));
router.get("/:id", asyncHandler(roomController.getById));
router.post("/", requireAdmin, asyncHandler(roomController.create));
router.patch("/:id", requireAdmin, asyncHandler(roomController.update));
router.patch("/:id/visibility", requireAdmin, asyncHandler(roomController.setVisibility));
router.delete("/:id", requireAdmin, asyncHandler(roomController.remove));

export default router;

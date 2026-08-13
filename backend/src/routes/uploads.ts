import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { uploadController } from "../controllers/uploadController";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8 MB
});

router.post(
  "/complaint-photo",
  requireAuth,
  upload.single("photo"),
  asyncHandler(uploadController.uploadComplaintPhoto)
);

router.post(
  "/asset-photo",
  requireAuth,
  upload.single("photo"),
  asyncHandler(uploadController.uploadAssetPhoto)
);

export default router;

import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../db/supabaseAdmin";
import { ValidationError } from "../errors";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const COMPLAINTS_BUCKET = "complaints";
const ASSETS_BUCKET = "assets";

async function ensureBucket(bucket: string): Promise<string | null> {
  const { error } = await supabaseAdmin.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES)
  });

  if (!error) return null;

  const message = error.message.toLowerCase();
  if (message.includes("already exists") || message.includes("duplicate")) return null;
  return error.message;
}

function isMissingBucket(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("bucket not found") || normalized.includes("bucket does not exist");
}

// New Supabase projects do not contain application buckets by default —
// create the public bucket on first upload into it, then retry once.
async function uploadToBucket(
  bucket: string,
  path: string,
  file: Express.Multer.File,
  res: Response
): Promise<string | null> {
  let uploadResult = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

  if (uploadResult.error && isMissingBucket(uploadResult.error.message)) {
    const bucketError = await ensureBucket(bucket);
    if (!bucketError) {
      uploadResult = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    } else {
      res.status(502).json({ error: `Storage setup failed: ${bucketError}` });
      return null;
    }
  }

  if (uploadResult.error) {
    res.status(502).json({ error: `Storage upload failed: ${uploadResult.error.message}` });
    return null;
  }

  return supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function validatedFile(req: Request): Express.Multer.File {
  const file = req.file;
  if (!file) throw new ValidationError("No file uploaded (field name must be 'photo')");
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new ValidationError(`Unsupported file type: ${file.mimetype}`);
  }
  return file;
}

function fileExtension(file: Express.Multer.File): string {
  return file.originalname.split(".").pop()?.toLowerCase() || "jpg";
}

export const uploadController = {
  async uploadComplaintPhoto(req: Request, res: Response): Promise<void> {
    const file = validatedFile(req);
    const path = `complaints/${req.user!.id}/${randomUUID()}.${fileExtension(file)}`;
    const url = await uploadToBucket(COMPLAINTS_BUCKET, path, file, res);
    if (url) res.status(201).json({ url });
  },

  async uploadAssetPhoto(req: Request, res: Response): Promise<void> {
    const file = validatedFile(req);
    const path = `assets/${req.user!.id}/${randomUUID()}.${fileExtension(file)}`;
    const url = await uploadToBucket(ASSETS_BUCKET, path, file, res);
    if (url) res.status(201).json({ url });
  }
};

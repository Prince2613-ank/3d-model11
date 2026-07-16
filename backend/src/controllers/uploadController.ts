import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../db/supabaseAdmin";
import { ValidationError } from "../errors";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const COMPLAINTS_BUCKET = "complaints";

async function ensureComplaintsBucket(): Promise<string | null> {
  const { error } = await supabaseAdmin.storage.createBucket(COMPLAINTS_BUCKET, {
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

export const uploadController = {
  async uploadComplaintPhoto(req: Request, res: Response): Promise<void> {
    const file = req.file;
    if (!file) throw new ValidationError("No file uploaded (field name must be 'photo')");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new ValidationError(`Unsupported file type: ${file.mimetype}`);
    }

    const extension = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
    const path = `complaints/${req.user!.id}/${randomUUID()}.${extension}`;

    let uploadResult = await supabaseAdmin.storage
      .from(COMPLAINTS_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

    // New Supabase projects do not contain application buckets by default.
    // Create the public complaint bucket on the first upload, then retry once.
    if (uploadResult.error && isMissingBucket(uploadResult.error.message)) {
      const bucketError = await ensureComplaintsBucket();
      if (!bucketError) {
        uploadResult = await supabaseAdmin.storage
          .from(COMPLAINTS_BUCKET)
          .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
      } else {
        res.status(502).json({ error: `Storage setup failed: ${bucketError}` });
        return;
      }
    }

    if (uploadResult.error) {
      res.status(502).json({ error: `Storage upload failed: ${uploadResult.error.message}` });
      return;
    }

    const { data } = supabaseAdmin.storage.from(COMPLAINTS_BUCKET).getPublicUrl(path);
    res.status(201).json({ url: data.publicUrl });
  }
};

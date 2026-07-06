import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../db/supabaseAdmin";
import { ValidationError } from "../errors";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const COMPLAINTS_BUCKET = "complaints";

export const uploadController = {
  async uploadComplaintPhoto(req: Request, res: Response): Promise<void> {
    const file = req.file;
    if (!file) throw new ValidationError("No file uploaded (field name must be 'photo')");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new ValidationError(`Unsupported file type: ${file.mimetype}`);
    }

    const extension = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
    const path = `complaints/${req.user!.id}/${randomUUID()}.${extension}`;

    const { error } = await supabaseAdmin.storage
      .from(COMPLAINTS_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) {
      res.status(502).json({ error: `Storage upload failed: ${error.message}` });
      return;
    }

    const { data } = supabaseAdmin.storage.from(COMPLAINTS_BUCKET).getPublicUrl(path);
    res.status(201).json({ url: data.publicUrl });
  }
};

import { Request, Response } from "express";
import { announcementService } from "../services/announcementService";
import { ValidationError } from "../errors";

const VALID_CATEGORIES = ["power_shutdown", "maintenance", "fire_drill", "holiday", "other"];

export const announcementController = {
  async listActive(_req: Request, res: Response): Promise<void> {
    const announcements = await announcementService.listActive();
    res.json({ announcements });
  },

  async listAll(_req: Request, res: Response): Promise<void> {
    const announcements = await announcementService.listAll();
    res.json({ announcements });
  },

  async create(req: Request, res: Response): Promise<void> {
    const { title, body, category, startsAt, endsAt } = req.body;
    if (!title || !body) throw new ValidationError("title and body are required");
    const resolvedCategory = VALID_CATEGORIES.includes(category) ? category : "other";
    const announcement = await announcementService.create(req.user!, { title, body, category: resolvedCategory, startsAt, endsAt });
    res.status(201).json({ announcement });
  },

  async update(req: Request, res: Response): Promise<void> {
    const announcement = await announcementService.update(req.user!, req.params.id, req.body);
    res.json({ announcement });
  },

  async setActive(req: Request, res: Response): Promise<void> {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") throw new ValidationError("isActive must be a boolean");
    const announcement = await announcementService.setActive(req.user!, req.params.id, isActive);
    res.json({ announcement });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await announcementService.remove(req.user!, req.params.id);
    res.status(204).send();
  }
};

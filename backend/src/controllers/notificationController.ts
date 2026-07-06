import { Request, Response } from "express";
import { notificationRepository } from "../repositories/notificationRepository";

export const notificationController = {
  async list(req: Request, res: Response): Promise<void> {
    const isAdmin = req.user!.role === "admin";
    const notifications = await notificationRepository.listForUser(req.user!.id, isAdmin);
    res.json({ notifications });
  },

  async unreadCount(req: Request, res: Response): Promise<void> {
    const isAdmin = req.user!.role === "admin";
    const count = await notificationRepository.unreadCount(req.user!.id, isAdmin);
    res.json({ count });
  },

  async markRead(req: Request, res: Response): Promise<void> {
    const notification = await notificationRepository.markRead(req.params.id, req.user!.id);
    if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
    res.json({ notification });
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    const isAdmin = req.user!.role === "admin";
    await notificationRepository.markAllRead(req.user!.id, isAdmin);
    res.status(204).send();
  }
};

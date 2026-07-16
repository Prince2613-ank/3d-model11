import { Request, Response } from "express";
import { notificationRepository } from "../repositories/notificationRepository";
import { ValidationError } from "../errors";

export const notificationController = {
  async sendMessage(req: Request, res: Response): Promise<void> {
    const { userId, subject, message } = req.body;
    if (!userId || !message?.trim()) throw new ValidationError("userId and message are required");

    const notification = await notificationRepository.create({
      userId,
      type: "direct_message",
      title: subject?.trim() || "Message from administration",
      body: message.trim()
    });
    res.status(201).json({ notification });
  },

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
    const notification = await notificationRepository.markRead(req.params.id, req.user!.id, req.user!.role === "admin");
    if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
    res.json({ notification });
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    const isAdmin = req.user!.role === "admin";
    await notificationRepository.markAllRead(req.user!.id, isAdmin);
    res.status(204).send();
  }
};

import { Request, Response } from "express";
import { activityLogRepository } from "../repositories/activityLogRepository";

export const activityLogController = {
  async list(req: Request, res: Response): Promise<void> {
    const limit = Math.min(parseInt((req.query.pageSize as string) ?? "100", 10) || 100, 500);
    const page = parseInt((req.query.page as string) ?? "1", 10) || 1;
    const entries = await activityLogRepository.list(limit, (page - 1) * limit);
    res.json({ entries, page, pageSize: limit });
  }
};

import { Request, Response } from "express";
import { statsService } from "../services/statsService";

export const statsController = {
  async dashboard(_req: Request, res: Response): Promise<void> {
    const stats = await statsService.dashboard();
    res.json(stats);
  }
};

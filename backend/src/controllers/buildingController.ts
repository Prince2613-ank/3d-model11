import { Request, Response } from "express";
import { buildingService } from "../services/buildingService";
import { ValidationError } from "../errors";

export const buildingController = {
  async list(_req: Request, res: Response): Promise<void> {
    const buildings = await buildingService.list();
    res.json({ buildings });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const building = await buildingService.getById(req.params.id);
    if (!building) { res.status(404).json({ error: "Building not found" }); return; }
    res.json({ building });
  },

  async create(req: Request, res: Response): Promise<void> {
    const { name, description } = req.body;
    if (!name) throw new ValidationError("name is required");
    const building = await buildingService.create(req.user!, { name, description });
    res.status(201).json({ building });
  },

  async update(req: Request, res: Response): Promise<void> {
    const building = await buildingService.update(req.user!, req.params.id, req.body);
    res.json({ building });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await buildingService.remove(req.user!, req.params.id);
    res.status(204).send();
  }
};

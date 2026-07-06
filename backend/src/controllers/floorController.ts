import { Request, Response } from "express";
import { floorService } from "../services/floorService";
import { ValidationError } from "../errors";

export const floorController = {
  async listByBuilding(req: Request, res: Response): Promise<void> {
    const includeHidden = req.user?.role === "admin" && req.query.includeHidden === "true";
    const floors = await floorService.listByBuilding(req.params.buildingId, includeHidden);
    res.json({ floors });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const floor = await floorService.getById(req.params.id);
    if (!floor) { res.status(404).json({ error: "Floor not found" }); return; }
    res.json({ floor });
  },

  async create(req: Request, res: Response): Promise<void> {
    const { buildingId, floorNumber, name, description, thumbnailUrl, sortOrder } = req.body;
    if (!buildingId || floorNumber === undefined || !name) {
      throw new ValidationError("buildingId, floorNumber and name are required");
    }
    const floor = await floorService.create(req.user!, { buildingId, floorNumber, name, description, thumbnailUrl, sortOrder });
    res.status(201).json({ floor });
  },

  async update(req: Request, res: Response): Promise<void> {
    const floor = await floorService.update(req.user!, req.params.id, req.body);
    res.json({ floor });
  },

  async setVisibility(req: Request, res: Response): Promise<void> {
    const { isVisible } = req.body;
    if (typeof isVisible !== "boolean") throw new ValidationError("isVisible must be a boolean");
    const floor = await floorService.setVisibility(req.user!, req.params.id, isVisible);
    res.json({ floor });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await floorService.remove(req.user!, req.params.id);
    res.status(204).send();
  }
};

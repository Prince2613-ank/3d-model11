import { Request, Response } from "express";
import { roomService } from "../services/roomService";
import { ValidationError } from "../errors";

export const roomController = {
  async listByFloor(req: Request, res: Response): Promise<void> {
    const includeHidden = req.user?.role === "admin" && req.query.includeHidden === "true";
    const rooms = await roomService.listByFloor(req.params.floorId, includeHidden);
    res.json({ rooms });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const room = await roomService.getById(req.params.id);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    res.json({ room });
  },

  async create(req: Request, res: Response): Promise<void> {
    const { floorId, name } = req.body;
    if (!floorId || !name) throw new ValidationError("floorId and name are required");
    const room = await roomService.create(req.user!, req.body);
    res.status(201).json({ room });
  },

  async update(req: Request, res: Response): Promise<void> {
    const room = await roomService.update(req.user!, req.params.id, req.body);
    res.json({ room });
  },

  async setVisibility(req: Request, res: Response): Promise<void> {
    const { isVisible } = req.body;
    if (typeof isVisible !== "boolean") throw new ValidationError("isVisible must be a boolean");
    const room = await roomService.setVisibility(req.user!, req.params.id, isVisible);
    res.json({ room });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await roomService.remove(req.user!, req.params.id);
    res.status(204).send();
  }
};

import { Request, Response } from "express";
import { assetService } from "../services/assetService";
import { ValidationError } from "../errors";

export const assetController = {
  async listByFloor(req: Request, res: Response): Promise<void> {
    const assets = await assetService.listByFloor(req.params.floorId);
    res.json({ assets });
  },

  async listByAssignedProfile(req: Request, res: Response): Promise<void> {
    const assets = await assetService.listByAssignedProfile(req.params.profileId);
    res.json({ assets });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const asset = await assetService.getById(req.params.id);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    res.json({ asset });
  },

  async getByObjectKey(req: Request, res: Response): Promise<void> {
    const asset = await assetService.getByObjectKey(req.params.objectKey);
    if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
    res.json({ asset });
  },

  async create(req: Request, res: Response): Promise<void> {
    const { objectKey, name, category, floorId } = req.body;
    if (!objectKey || !name || !category || !floorId) {
      throw new ValidationError("objectKey, name, category and floorId are required");
    }
    const asset = await assetService.create(req.user!, req.body);
    res.status(201).json({ asset });
  },

  async update(req: Request, res: Response): Promise<void> {
    const asset = await assetService.update(req.user!, req.params.id, req.body);
    res.json({ asset });
  },

  async move(req: Request, res: Response): Promise<void> {
    const { floorId, roomId } = req.body;
    if (!floorId) throw new ValidationError("floorId is required");
    const asset = await assetService.move(req.user!, req.params.id, { floorId, roomId });
    res.json({ asset });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await assetService.remove(req.user!, req.params.id);
    res.status(204).send();
  },

  async history(req: Request, res: Response): Promise<void> {
    const history = await assetService.history(req.params.id);
    res.json({ history });
  }
};

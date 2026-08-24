import { Request, Response } from "express";
import { assetService } from "../services/assetService";
import { ValidationError } from "../errors";
import { AssetCategory, AssetLiveStatus } from "../types/domain";

export const assetController = {
  async listByFloor(req: Request, res: Response): Promise<void> {
    const assets = await assetService.listByFloor(req.params.floorId);
    res.json({ assets });
  },

  async listByAssignedProfile(req: Request, res: Response): Promise<void> {
    const assets = await assetService.listByAssignedProfile(req.params.profileId);
    res.json({ assets });
  },

  async listDeletedByFloor(req: Request, res: Response): Promise<void> {
    const assets = await assetService.listDeletedByFloor(req.params.floorId);
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

  // Deliberately narrow: any signed-in user can rename who's sitting in a
  // seat from the 3D viewer's chair popup, but only this one field — full
  // asset edits (category, image, floor, etc.) stay admin-only via update().
  async updateAssignedName(req: Request, res: Response): Promise<void> {
    const { assignedToName } = req.body;
    if (typeof assignedToName !== "string" && assignedToName !== null) {
      throw new ValidationError("assignedToName must be a string or null");
    }
    const asset = await assetService.update(req.user!, req.params.id, { assignedToName });
    res.json({ asset });
  },

  // The 3D user panel can update the operational fields displayed in its
  // editable cards. Physical seat identifiers and placement remain managed by
  // admins because they are bound to a fixed Cesium model.
  async updateUserDetails(req: Request, res: Response): Promise<void> {
    const { assignedToName, name, category, liveStatus, seatId, seatNumber, imageUrl, designation } = req.body;
    const categories = ["chair", "ac", "projector", "door", "printer", "monitor", "fire_extinguisher", "desk", "elevator", "light", "other"];
    const statuses = ["ok", "pending", "assigned", "resolved"];
    if ((assignedToName !== undefined && typeof assignedToName !== "string" && assignedToName !== null)
      || (category !== undefined && !categories.includes(category))
      || (liveStatus !== undefined && !statuses.includes(liveStatus))
      || (name !== undefined && (typeof name !== "string" || !name.trim()))
      || (seatId !== undefined && (typeof seatId !== "string" || !seatId.trim()))
      || (seatNumber !== undefined && typeof seatNumber !== "string" && seatNumber !== null)
      || (imageUrl !== undefined && typeof imageUrl !== "string" && imageUrl !== null)
      || (designation !== undefined && typeof designation !== "string" && designation !== null)) {
      throw new ValidationError("Invalid asset details");
    }
    const asset = await assetService.update(req.user!, req.params.id, {
      assignedToName,
      name,
      category: category as AssetCategory | undefined,
      liveStatus: liveStatus as AssetLiveStatus | undefined,
      seatId: seatId?.trim(),
      seatNumber: seatNumber?.trim() || null,
      imageUrl,
      designation: typeof designation === "string" ? designation.trim() || null : designation
    });
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

  async restore(req: Request, res: Response): Promise<void> {
    const asset = await assetService.restore(req.user!, req.params.id);
    res.json({ asset });
  },

  async history(req: Request, res: Response): Promise<void> {
    const history = await assetService.history(req.params.id);
    res.json({ history });
  }
};

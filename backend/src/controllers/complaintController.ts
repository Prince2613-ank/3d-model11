import { Request, Response } from "express";
import { complaintService } from "../services/complaintService";
import { ValidationError } from "../errors";
import { ComplaintPriority, ComplaintStatus } from "../types/domain";

const VALID_PRIORITIES: ComplaintPriority[] = ["low", "medium", "high", "critical"];
const VALID_STATUSES: ComplaintStatus[] = ["pending", "assigned", "resolved", "rejected"];

export const complaintController = {
  async create(req: Request, res: Response): Promise<void> {
    const { objectKey, issueType, priority, description, photoUrls, cameraPosition } = req.body;
    if (!objectKey || !issueType || !description) {
      throw new ValidationError("objectKey, issueType and description are required");
    }
    const resolvedPriority: ComplaintPriority = VALID_PRIORITIES.includes(priority) ? priority : "medium";

    const complaint = await complaintService.create(req.user!, {
      objectKey,
      issueType,
      priority: resolvedPriority,
      description,
      photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
      cameraPosition: cameraPosition ?? null
    });
    res.status(201).json({ complaint });
  },

  // Admin table: filters + pagination
  async list(req: Request, res: Response): Promise<void> {
    const { status, priority, reporterId, floorId, roomId, dateFrom, dateTo, search, page, pageSize } = req.query;

    const limit = Math.min(parseInt((pageSize as string) ?? "50", 10) || 50, 200);
    const offset = ((parseInt((page as string) ?? "1", 10) || 1) - 1) * limit;

    const { rows, total } = await complaintService.list({
      status: VALID_STATUSES.includes(status as ComplaintStatus) ? (status as ComplaintStatus) : undefined,
      priority: VALID_PRIORITIES.includes(priority as ComplaintPriority) ? (priority as ComplaintPriority) : undefined,
      reporterId: reporterId as string | undefined,
      floorId: floorId as string | undefined,
      roomId: roomId as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      search: search as string | undefined,
      limit,
      offset
    });

    res.json({ complaints: rows, total, page: Math.floor(offset / limit) + 1, pageSize: limit });
  },

  async listMine(req: Request, res: Response): Promise<void> {
    const complaints = await complaintService.listMine(req.user!.id);
    res.json({ complaints });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const complaint = await complaintService.getById(req.params.id);
    if (!complaint) { res.status(404).json({ error: "Complaint not found" }); return; }

    const isOwner = complaint.reporter_id === req.user?.id;
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

    res.json({ complaint });
  },

  async history(req: Request, res: Response): Promise<void> {
    const complaint = await complaintService.getById(req.params.id);
    if (!complaint) { res.status(404).json({ error: "Complaint not found" }); return; }

    const isOwner = complaint.reporter_id === req.user?.id;
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

    const history = await complaintService.history(req.params.id);
    res.json({ history });
  },

  async assign(req: Request, res: Response): Promise<void> {
    const { assignedToProfileId, assignedToName, deadline, notes } = req.body;
    if (!assignedToName && !assignedToProfileId) {
      throw new ValidationError("assignedToName or assignedToProfileId is required");
    }
    const complaint = await complaintService.assign(req.user!, req.params.id, {
      assignedToProfileId, assignedToName, deadline, notes
    });
    res.json({ complaint });
  },

  async resolve(req: Request, res: Response): Promise<void> {
    const { resolutionText, resolutionImageUrl } = req.body;
    if (!resolutionText) throw new ValidationError("resolutionText is required");
    const complaint = await complaintService.resolve(req.user!, req.params.id, { resolutionText, resolutionImageUrl });
    res.json({ complaint });
  },

  async reject(req: Request, res: Response): Promise<void> {
    const { reason } = req.body;
    if (!reason) throw new ValidationError("reason is required");
    const complaint = await complaintService.reject(req.user!, req.params.id, reason);
    res.json({ complaint });
  },

  async reply(req: Request, res: Response): Promise<void> {
    const { message } = req.body;
    if (!message) throw new ValidationError("message is required");
    const complaint = await complaintService.reply(req.user!, req.params.id, message);
    res.json({ complaint });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await complaintService.softDelete(req.user!, req.params.id);
    res.status(204).send();
  }
};

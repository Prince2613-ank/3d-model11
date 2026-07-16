import { assetRepository } from "../repositories/assetRepository";
import { roomRepository } from "../repositories/roomRepository";
import { floorRepository } from "../repositories/floorRepository";
import { complaintHistoryRepository } from "../repositories/complaintHistoryRepository";
import { complaintRepository, ComplaintFilters } from "../repositories/complaintRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { AuthenticatedUser, Complaint, ComplaintPriority, CameraPosition } from "../types/domain";
import { NotFoundError } from "../errors";

export interface CreateComplaintInput {
  objectKey?: string;
  targetType: "asset" | "room";
  roomId?: string;
  roomName?: string;
  floorNumber?: number;
  issueType: string;
  priority: ComplaintPriority;
  description: string;
  photoUrls: string[];
  cameraPosition?: CameraPosition | null;
}


export const complaintService = {
  async create(reporter: AuthenticatedUser, input: CreateComplaintInput): Promise<Complaint> {
    const isRoom = input.targetType === "room";
    const asset = !isRoom && input.objectKey ? await assetRepository.findByObjectKey(input.objectKey) : null;
    if (!isRoom && !asset) throw new NotFoundError("Asset with object key", input.objectKey ?? "");

    const room = isRoom
      ? input.roomId
        ? await roomRepository.findById(input.roomId)
        : input.roomName && input.floorNumber
          ? await roomRepository.findByNameAndFloorNumber(input.roomName, input.floorNumber)
          : null
      : null;
    const floor = isRoom && !room && input.floorNumber ? await floorRepository.findByFloorNumber(input.floorNumber) : null;
    const targetName = isRoom ? input.roomName! : asset!.name;

    const complaint = await complaintRepository.insert({
      asset_id: asset?.id ?? null,
      target_type: input.targetType,
      target_name: targetName,
      reporter_id: reporter.id,
      reporter_name: reporter.displayName || reporter.email,
      reporter_email: reporter.email,
      issue_type: input.issueType,
      priority: input.priority,
      description: input.description,
      photo_urls: JSON.stringify(input.photoUrls),
      room_id: room?.id ?? asset?.room_id ?? null,
      floor_id: room?.floor_id ?? floor?.id ?? asset?.floor_id ?? null,
      camera_position: input.cameraPosition ? JSON.stringify(input.cameraPosition) : null
    });

    await Promise.all([
      asset ? assetRepository.updateLiveStatus(asset.id, "pending") : Promise.resolve(null),
      complaintHistoryRepository.record({
        complaintId: complaint.id,
        actorId: reporter.id,
        actorRole: reporter.role,
        fromStatus: null,
        toStatus: "pending",
        note: "Complaint created"
      }),
      notificationRepository.create({
        isAdminBroadcast: reporter.role !== "admin",
        type: reporter.role === "admin" ? "direct_message" : "new_complaint_admin",
        title: `${reporter.role === "admin" ? "Admin reported" : "New complaint"}: ${targetName}`,
        body: input.description,
        relatedComplaintId: complaint.id
      }),
      activityLogRepository.record({
        actorId: reporter.id,
        actorRole: reporter.role,
        action: "complaint_created",
        entityType: "complaint",
        entityId: complaint.id,
        metadata: { targetType: input.targetType, assetId: asset?.id, roomId: room?.id, targetName, priority: input.priority }
      })
    ]);

    return complaint;
  },

  async list(filters: ComplaintFilters) {
    return complaintRepository.search(filters);
  },

  async listMine(reporterId: string): Promise<Complaint[]> {
    return complaintRepository.listByReporter(reporterId);
  },

  async getById(id: string): Promise<Complaint | null> {
    return complaintRepository.findById(id);
  },

  async assign(
    admin: AuthenticatedUser,
    complaintId: string,
    params: { assignedToProfileId?: string | null; assignedToName?: string | null; deadline?: string | null; notes?: string | null }
  ): Promise<Complaint> {
    const existing = await complaintRepository.findById(complaintId);
    if (!existing) throw new NotFoundError("Complaint", complaintId);

    const updated = await complaintRepository.assign(complaintId, params);
    if (!updated) throw new NotFoundError("Complaint", complaintId);

    await Promise.all([
      existing.asset_id ? assetRepository.updateLiveStatus(existing.asset_id, "assigned") : Promise.resolve(null),
      complaintHistoryRepository.record({
        complaintId,
        actorId: admin.id,
        actorRole: admin.role,
        fromStatus: existing.status,
        toStatus: "assigned",
        note: params.notes ?? null
      }),
      existing.reporter_id
        ? notificationRepository.create({
            userId: existing.reporter_id,
            type: "complaint_assigned",
            title: "Your complaint was assigned",
            body: params.assignedToName ? `Assigned to ${params.assignedToName}` : undefined,
            relatedComplaintId: complaintId
          })
        : Promise.resolve(),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "complaint_assigned",
        entityType: "complaint",
        entityId: complaintId,
        metadata: params
      })
    ]);

    return updated;
  },

  async resolve(
    admin: AuthenticatedUser,
    complaintId: string,
    params: { resolutionText: string; resolutionImageUrl?: string | null }
  ): Promise<Complaint> {
    const existing = await complaintRepository.findById(complaintId);
    if (!existing) throw new NotFoundError("Complaint", complaintId);

    const updated = await complaintRepository.resolve(complaintId, params);
    if (!updated) throw new NotFoundError("Complaint", complaintId);

    await Promise.all([
      existing.asset_id ? assetRepository.updateLiveStatus(existing.asset_id, "ok") : Promise.resolve(null),
      complaintHistoryRepository.record({
        complaintId,
        actorId: admin.id,
        actorRole: admin.role,
        fromStatus: existing.status,
        toStatus: "resolved",
        note: params.resolutionText
      }),
      existing.reporter_id
        ? notificationRepository.create({
            userId: existing.reporter_id,
            type: "complaint_resolved",
            title: "Your complaint was resolved",
            body: params.resolutionText,
            relatedComplaintId: complaintId
          })
        : Promise.resolve(),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "complaint_resolved",
        entityType: "complaint",
        entityId: complaintId
      })
    ]);

    return updated;
  },

  async reject(admin: AuthenticatedUser, complaintId: string, reason: string): Promise<Complaint> {
    const existing = await complaintRepository.findById(complaintId);
    if (!existing) throw new NotFoundError("Complaint", complaintId);

    const updated = await complaintRepository.reject(complaintId, reason);
    if (!updated) throw new NotFoundError("Complaint", complaintId);

    await Promise.all([
      existing.asset_id ? assetRepository.updateLiveStatus(existing.asset_id, "ok") : Promise.resolve(null),
      complaintHistoryRepository.record({
        complaintId,
        actorId: admin.id,
        actorRole: admin.role,
        fromStatus: existing.status,
        toStatus: "rejected",
        note: reason
      }),
      existing.reporter_id
        ? notificationRepository.create({
            userId: existing.reporter_id,
            type: "complaint_rejected",
            title: "Your complaint was rejected",
            body: reason,
            relatedComplaintId: complaintId
          })
        : Promise.resolve(),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "complaint_rejected",
        entityType: "complaint",
        entityId: complaintId,
        metadata: { reason }
      })
    ]);

    return updated;
  },

  async reply(admin: AuthenticatedUser, complaintId: string, message: string): Promise<Complaint> {
    const existing = await complaintRepository.findById(complaintId);
    if (!existing) throw new NotFoundError("Complaint", complaintId);

    const updated = await complaintRepository.reply(complaintId, message);
    if (!updated) throw new NotFoundError("Complaint", complaintId);

    await Promise.all([
      existing.reporter_id
        ? notificationRepository.create({
            userId: existing.reporter_id,
            type: "complaint_replied",
            title: "Admin replied to your complaint",
            body: message,
            relatedComplaintId: complaintId
          })
        : Promise.resolve(),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "complaint_replied",
        entityType: "complaint",
        entityId: complaintId
      })
    ]);

    return updated;
  },

  async softDelete(admin: AuthenticatedUser, complaintId: string): Promise<Complaint> {
    const deleted = await complaintRepository.softDelete(complaintId);
    if (!deleted) throw new NotFoundError("Complaint", complaintId);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "complaint_deleted",
      entityType: "complaint",
      entityId: complaintId
    });

    return deleted;
  },

  async history(complaintId: string) {
    return complaintHistoryRepository.listByComplaint(complaintId);
  }
};


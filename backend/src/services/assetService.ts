import { assetRepository, AssetWithAssignee } from "../repositories/assetRepository";
import { assetHistoryRepository } from "../repositories/assetHistoryRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { Asset, AssetCategory, AuthenticatedUser } from "../types/domain";
import { NotFoundError } from "../errors";


export interface AssetInput {
  objectKey: string;
  name: string;
  category: AssetCategory;
  roomId?: string | null;
  floorId: string;
  description?: string | null;
  imageUrl?: string | null;
  purchaseDate?: string | null;
  warrantyExpiry?: string | null;
  maintenanceDate?: string | null;
  attachments?: string[];
  assignedToProfileId?: string | null;
  assignedToName?: string | null;
  liveStatus?: Asset["live_status"];
  seatId?: string;
  seatNumber?: string | null;
  designation?: string | null;
  joiningDate?: string | null;
}

export const assetService = {
  async listByFloor(floorId: string): Promise<Asset[]> {
    return assetRepository.listByFloor(floorId);
  },

  async listByAssignedProfile(profileId: string): Promise<Asset[]> {
    return assetRepository.listByAssignedProfile(profileId);
  },

  async listDeletedByFloor(floorId: string): Promise<Asset[]> {
    return assetRepository.listDeletedByFloor(floorId);
  },

  async getById(id: string): Promise<Asset | null> {
    return assetRepository.findById(id);
  },

  async getByObjectKey(objectKey: string): Promise<AssetWithAssignee | null> {
    return assetRepository.findByObjectKey(objectKey);
  },

  async create(admin: AuthenticatedUser, input: AssetInput): Promise<Asset> {
    const asset = await assetRepository.insert({
      object_key: input.objectKey,
      seat_id: input.seatId ?? input.objectKey,
      seat_number: input.seatNumber ?? input.objectKey.split("-").pop() ?? null,
      designation: input.designation ?? null,
      joining_date: input.joiningDate ?? null,
      name: input.name,
      category: input.category,
      room_id: input.roomId ?? null,
      floor_id: input.floorId,
      description: input.description ?? (input.category === "chair" ? `${input.name}'s chair (${input.objectKey})` : null),
      image_url: input.imageUrl ?? null,
      purchase_date: input.purchaseDate ?? null,
      warranty_expiry: input.warrantyExpiry ?? null,
      maintenance_date: input.maintenanceDate ?? null,
      attachments: JSON.stringify(input.attachments ?? []),
      assigned_to_profile_id: input.assignedToProfileId ?? null,
      assigned_to_name: input.assignedToName ?? null,
      created_by: admin.id,
      updated_by: admin.id
    });

    await Promise.all([
      assetHistoryRepository.record({ assetId: asset.id, action: "created", changedBy: admin.id, newValues: asset }),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "asset_created",
        entityType: "asset",
        entityId: asset.id
      })
    ]);

    return asset;
  },

  async update(admin: AuthenticatedUser, id: string, input: Partial<AssetInput>): Promise<Asset> {
    const existing = await assetRepository.findById(id);
    if (!existing) throw new NotFoundError("Asset", id);

    const columns: Record<string, unknown> = { updated_by: admin.id };
    if (input.name !== undefined) columns.name = input.name;
    if (input.category !== undefined) columns.category = input.category;
    if (input.description !== undefined) {
      columns.description = input.description;
    } else {
      const nextCategory = input.category ?? existing.category;
      if (nextCategory === "chair" && (input.name !== undefined || input.category !== undefined)) {
        columns.description = `${input.name ?? existing.name}'s chair (${existing.object_key})`;
      }
    }
    if (input.imageUrl !== undefined) columns.image_url = input.imageUrl;
    if (input.purchaseDate !== undefined) columns.purchase_date = input.purchaseDate;
    if (input.warrantyExpiry !== undefined) columns.warranty_expiry = input.warrantyExpiry;
    if (input.maintenanceDate !== undefined) columns.maintenance_date = input.maintenanceDate;
    if (input.attachments !== undefined) columns.attachments = JSON.stringify(input.attachments);
    if (input.assignedToProfileId !== undefined) columns.assigned_to_profile_id = input.assignedToProfileId;
    if (input.assignedToName !== undefined) columns.assigned_to_name = input.assignedToName;
    if (input.liveStatus !== undefined) columns.live_status = input.liveStatus;
    if (input.seatId !== undefined) columns.seat_id = input.seatId;
    if (input.seatNumber !== undefined) columns.seat_number = input.seatNumber;
    if (input.designation !== undefined) columns.designation = input.designation;
    if (input.joiningDate !== undefined) columns.joining_date = input.joiningDate;

    const updated = await assetRepository.update(id, columns);
    if (!updated) throw new NotFoundError("Asset", id);

    await Promise.all([
      assetHistoryRepository.record({
        assetId: id,
        action: "updated",
        changedBy: admin.id,
        oldValues: existing,
        newValues: updated
      }),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "asset_updated",
        entityType: "asset",
        entityId: id,
        metadata: input
      })
    ]);

    return updated;
  },

  async move(admin: AuthenticatedUser, id: string, target: { floorId: string; roomId?: string | null }): Promise<Asset> {
    const existing = await assetRepository.findById(id);
    if (!existing) throw new NotFoundError("Asset", id);

    const updated = await assetRepository.update(id, {
      floor_id: target.floorId,
      room_id: target.roomId ?? null,
      updated_by: admin.id
    });
    if (!updated) throw new NotFoundError("Asset", id);

    await Promise.all([
      assetHistoryRepository.record({
        assetId: id,
        action: "moved",
        changedBy: admin.id,
        oldValues: { floor_id: existing.floor_id, room_id: existing.room_id },
        newValues: { floor_id: target.floorId, room_id: target.roomId ?? null }
      }),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "asset_moved",
        entityType: "asset",
        entityId: id,
        metadata: target
      })
    ]);

    return updated;
  },

  async remove(admin: AuthenticatedUser, id: string): Promise<Asset> {
    const deleted = await assetRepository.softDelete(id);
    if (!deleted) throw new NotFoundError("Asset", id);

    await Promise.all([
      assetHistoryRepository.record({ assetId: id, action: "deleted", changedBy: admin.id }),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "asset_deleted",
        entityType: "asset",
        entityId: id
      })
    ]);

    return deleted;
  },

  async restore(admin: AuthenticatedUser, id: string): Promise<Asset> {
    const existing = await assetRepository.findById(id, true);
    if (!existing || !existing.deleted_at) throw new NotFoundError("Asset", id);

    const restored = await assetRepository.restore(id);
    if (!restored) throw new NotFoundError("Asset", id);

    await Promise.all([
      assetHistoryRepository.record({ assetId: id, action: "restored", changedBy: admin.id, newValues: restored }),
      activityLogRepository.record({
        actorId: admin.id,
        actorRole: admin.role,
        action: "asset_restored",
        entityType: "asset",
        entityId: id
      })
    ]);

    return restored;
  },

  async history(assetId: string) {
    return assetHistoryRepository.listByAsset(assetId);
  }
};


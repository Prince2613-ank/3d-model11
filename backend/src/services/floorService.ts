import { floorRepository } from "../repositories/floorRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { AuthenticatedUser, Floor } from "../types/domain";
import { NotFoundError } from "../errors";


export interface FloorInput {
  buildingId: string;
  floorNumber: number;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  sortOrder?: number;
}

export const floorService = {
  async listByBuilding(buildingId: string, includeHidden: boolean): Promise<Floor[]> {
    return floorRepository.listByBuilding(buildingId, includeHidden);
  },

  async getById(id: string): Promise<Floor | null> {
    return floorRepository.findById(id);
  },

  async create(admin: AuthenticatedUser, input: FloorInput): Promise<Floor> {
    const floor = await floorRepository.insert({
      building_id: input.buildingId,
      floor_number: input.floorNumber,
      name: input.name,
      description: input.description ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
      sort_order: input.sortOrder ?? 0,
      created_by: admin.id,
      updated_by: admin.id
    });

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "floor_created",
      entityType: "floor",
      entityId: floor.id,
      metadata: { buildingId: input.buildingId }
    });

    return floor;
  },

  async update(admin: AuthenticatedUser, id: string, input: Partial<FloorInput>): Promise<Floor> {
    const columns: Record<string, unknown> = { updated_by: admin.id };
    if (input.name !== undefined) columns.name = input.name;
    if (input.description !== undefined) columns.description = input.description;
    if (input.thumbnailUrl !== undefined) columns.thumbnail_url = input.thumbnailUrl;
    if (input.floorNumber !== undefined) columns.floor_number = input.floorNumber;
    if (input.sortOrder !== undefined) columns.sort_order = input.sortOrder;

    const updated = await floorRepository.update(id, columns);
    if (!updated) throw new NotFoundError("Floor", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "floor_updated",
      entityType: "floor",
      entityId: id,
      metadata: input
    });

    return updated;
  },

  async setVisibility(admin: AuthenticatedUser, id: string, isVisible: boolean): Promise<Floor> {
    const updated = await floorRepository.update(id, { is_visible: isVisible, updated_by: admin.id });
    if (!updated) throw new NotFoundError("Floor", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: isVisible ? "floor_shown" : "floor_hidden",
      entityType: "floor",
      entityId: id
    });

    return updated;
  },

  async remove(admin: AuthenticatedUser, id: string): Promise<Floor> {
    const deleted = await floorRepository.softDelete(id);
    if (!deleted) throw new NotFoundError("Floor", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "floor_deleted",
      entityType: "floor",
      entityId: id
    });

    return deleted;
  }
};


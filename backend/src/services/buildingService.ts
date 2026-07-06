import { dtBuildingRepository } from "../repositories/dtBuildingRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { AuthenticatedUser, DtBuilding } from "../types/domain";
import { NotFoundError } from "../errors";


export const buildingService = {
  async list(): Promise<DtBuilding[]> {
    return dtBuildingRepository.list();
  },

  async getById(id: string): Promise<DtBuilding | null> {
    return dtBuildingRepository.findById(id);
  },

  async create(admin: AuthenticatedUser, input: { name: string; description?: string | null }): Promise<DtBuilding> {
    const building = await dtBuildingRepository.insert({
      name: input.name,
      description: input.description ?? null,
      created_by: admin.id,
      updated_by: admin.id
    });

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "building_created",
      entityType: "building",
      entityId: building.id
    });

    return building;
  },

  async update(admin: AuthenticatedUser, id: string, input: { name?: string; description?: string | null }): Promise<DtBuilding> {
    const updated = await dtBuildingRepository.update(id, { ...input, updated_by: admin.id });
    if (!updated) throw new NotFoundError("Building", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "building_updated",
      entityType: "building",
      entityId: id,
      metadata: input
    });

    return updated;
  },

  async remove(admin: AuthenticatedUser, id: string): Promise<DtBuilding> {
    const deleted = await dtBuildingRepository.softDelete(id);
    if (!deleted) throw new NotFoundError("Building", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "building_deleted",
      entityType: "building",
      entityId: id
    });

    return deleted;
  }
};


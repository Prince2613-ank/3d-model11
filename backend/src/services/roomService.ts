import { roomRepository } from "../repositories/roomRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { AuthenticatedUser, Room } from "../types/domain";
import { NotFoundError } from "../errors";


export interface RoomInput {
  floorId: string;
  name: string;
  department?: string | null;
  capacity?: number | null;
  managerName?: string | null;
  description?: string | null;
  images?: string[];
  color?: string | null;
}

export const roomService = {
  async listByFloor(floorId: string, includeHidden: boolean): Promise<Room[]> {
    return roomRepository.listByFloor(floorId, includeHidden);
  },

  async getById(id: string): Promise<Room | null> {
    return roomRepository.findById(id);
  },

  async create(admin: AuthenticatedUser, input: RoomInput): Promise<Room> {
    const room = await roomRepository.insert({
      floor_id: input.floorId,
      name: input.name,
      department: input.department ?? null,
      capacity: input.capacity ?? null,
      manager_name: input.managerName ?? null,
      description: input.description ?? null,
      images: JSON.stringify(input.images ?? []),
      color: input.color ?? null,
      created_by: admin.id,
      updated_by: admin.id
    });

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "room_created",
      entityType: "room",
      entityId: room.id,
      metadata: { floorId: input.floorId }
    });

    return room;
  },

  async update(admin: AuthenticatedUser, id: string, input: Partial<RoomInput>): Promise<Room> {
    const columns: Record<string, unknown> = { updated_by: admin.id };
    if (input.name !== undefined) columns.name = input.name;
    if (input.department !== undefined) columns.department = input.department;
    if (input.capacity !== undefined) columns.capacity = input.capacity;
    if (input.managerName !== undefined) columns.manager_name = input.managerName;
    if (input.description !== undefined) columns.description = input.description;
    if (input.images !== undefined) columns.images = JSON.stringify(input.images);
    if (input.color !== undefined) columns.color = input.color;

    const updated = await roomRepository.update(id, columns);
    if (!updated) throw new NotFoundError("Room", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "room_updated",
      entityType: "room",
      entityId: id,
      metadata: input
    });

    return updated;
  },

  async setVisibility(admin: AuthenticatedUser, id: string, isVisible: boolean): Promise<Room> {
    const updated = await roomRepository.update(id, { is_visible: isVisible, updated_by: admin.id });
    if (!updated) throw new NotFoundError("Room", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: isVisible ? "room_shown" : "room_hidden",
      entityType: "room",
      entityId: id
    });

    return updated;
  },

  async remove(admin: AuthenticatedUser, id: string): Promise<Room> {
    const deleted = await roomRepository.softDelete(id);
    if (!deleted) throw new NotFoundError("Room", id);

    await activityLogRepository.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "room_deleted",
      entityType: "room",
      entityId: id
    });

    return deleted;
  }
};


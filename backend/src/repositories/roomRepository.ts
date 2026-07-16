import { pool } from "../db/client";
import { Room } from "../types/domain";
import { BaseRepository } from "./baseRepository";

class RoomRepository extends BaseRepository<Room> {
  constructor() {
    super("rooms");
  }

  async listByFloor(floorId: string, includeHidden = false): Promise<Room[]> {
    const visibilityClause = includeHidden ? "" : "AND is_visible = true";
    const { rows } = await pool.query<Room>(
      `SELECT * FROM rooms
       WHERE floor_id = $1 AND deleted_at IS NULL ${visibilityClause}
       ORDER BY name ASC`,
      [floorId]
    );
    return rows;
  }

  /**
   * The 3D viewer only knows the building's numeric floor_number (e.g. 3, 4),
   * not the floors.id UUID, so it looks rooms up this way instead of by floorId.
   */
  async listByFloorNumber(floorNumber: number, includeHidden = false): Promise<Room[]> {
    const visibilityClause = includeHidden ? "" : "AND r.is_visible = true";
    const { rows } = await pool.query<Room>(
      `SELECT r.* FROM rooms r
       JOIN floors f ON f.id = r.floor_id
       WHERE f.floor_number = $1 AND r.deleted_at IS NULL AND f.deleted_at IS NULL ${visibilityClause}
       ORDER BY r.name ASC`,
      [floorNumber]
    );
    return rows;
  }

  async findByNameAndFloorNumber(name: string, floorNumber: number): Promise<Room | null> {
    const { rows } = await pool.query<Room>(
      `SELECT r.* FROM rooms r
       JOIN floors f ON f.id = r.floor_id
       WHERE lower(r.name) = lower($1) AND f.floor_number = $2
         AND r.deleted_at IS NULL AND f.deleted_at IS NULL
       LIMIT 1`,
      [name, floorNumber]
    );
    return rows[0] ?? null;
  }
}

export const roomRepository = new RoomRepository();

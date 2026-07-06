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
}

export const roomRepository = new RoomRepository();

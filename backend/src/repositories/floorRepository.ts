import { pool } from "../db/client";
import { Floor } from "../types/domain";
import { BaseRepository } from "./baseRepository";

class FloorRepository extends BaseRepository<Floor> {
  constructor() {
    super("floors");
  }

  async listByBuilding(buildingId: string, includeHidden = false): Promise<Floor[]> {
    const visibilityClause = includeHidden ? "" : "AND is_visible = true";
    const { rows } = await pool.query<Floor>(
      `SELECT * FROM floors
       WHERE building_id = $1 AND deleted_at IS NULL ${visibilityClause}
       ORDER BY sort_order ASC, floor_number ASC`,
      [buildingId]
    );
    return rows;
  }

  async findByFloorNumber(floorNumber: number): Promise<Floor | null> {
    const { rows } = await pool.query<Floor>(
      `SELECT * FROM floors WHERE floor_number = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
      [floorNumber]
    );
    return rows[0] ?? null;
  }
}

export const floorRepository = new FloorRepository();

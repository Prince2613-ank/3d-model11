import { pool } from "../db/client";
import { Asset } from "../types/domain";
import { BaseRepository } from "./baseRepository";

class AssetRepository extends BaseRepository<Asset> {
  constructor() {
    super("assets");
  }

  async findByObjectKey(objectKey: string): Promise<Asset | null> {
    const { rows } = await pool.query<Asset>(
      "SELECT * FROM assets WHERE object_key = $1 AND deleted_at IS NULL",
      [objectKey]
    );
    return rows[0] ?? null;
  }

  async listByFloor(floorId: string): Promise<Asset[]> {
    const { rows } = await pool.query<Asset>(
      "SELECT * FROM assets WHERE floor_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
      [floorId]
    );
    return rows;
  }

  async updateLiveStatus(assetId: string, status: Asset["live_status"]): Promise<Asset | null> {
    const { rows } = await pool.query<Asset>(
      "UPDATE assets SET live_status = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [assetId, status]
    );
    return rows[0] ?? null;
  }
}

export const assetRepository = new AssetRepository();

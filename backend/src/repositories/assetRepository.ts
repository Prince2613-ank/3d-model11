import { pool } from "../db/client";
import { Asset } from "../types/domain";
import { BaseRepository } from "./baseRepository";

export type AssetWithAssignee = Asset & {
  assigned_employee_name: string | null;
};

class AssetRepository extends BaseRepository<Asset> {
  constructor() {
    super("assets");
  }

  async findByObjectKey(objectKey: string): Promise<AssetWithAssignee | null> {
    // object_key is the chair's own immutable, unique identifier generated
    // by the 3D viewer. seat_id is a separate, user-editable display field —
    // matching on it here let an edited seat_id collide with a *different*
    // chair's object_key, silently resolving to the wrong asset row (and its
    // photo/identity) for that chair's popup.
    const { rows } = await pool.query<AssetWithAssignee>(
      `SELECT a.*, coalesce(a.assigned_to_name, p.display_name, p.email) AS assigned_employee_name
       FROM assets a
       LEFT JOIN profiles p ON p.id = a.assigned_to_profile_id
       WHERE a.object_key = $1 AND a.deleted_at IS NULL`,
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

  async listByAssignedProfile(profileId: string): Promise<Asset[]> {
    const { rows } = await pool.query<Asset>(
      "SELECT * FROM assets WHERE assigned_to_profile_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
      [profileId]
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

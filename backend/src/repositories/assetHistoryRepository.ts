import { pool } from "../db/client";

export interface AssetHistoryEntry {
  id: string;
  asset_id: string;
  action: string;
  changed_by: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export const assetHistoryRepository = {
  async record(entry: {
    assetId: string;
    action: string;
    changedBy: string | null;
    oldValues?: object | null;
    newValues?: object | null;
  }): Promise<AssetHistoryEntry> {
    const { rows } = await pool.query<AssetHistoryEntry>(
      `INSERT INTO asset_history (asset_id, action, changed_by, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        entry.assetId,
        entry.action,
        entry.changedBy,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null
      ]
    );
    return rows[0];
  },

  async listByAsset(assetId: string): Promise<AssetHistoryEntry[]> {
    const { rows } = await pool.query<AssetHistoryEntry>(
      "SELECT * FROM asset_history WHERE asset_id = $1 ORDER BY created_at DESC",
      [assetId]
    );
    return rows;
  }
};

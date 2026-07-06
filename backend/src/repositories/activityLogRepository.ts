import { pool } from "../db/client";
import { UserRole } from "../types/domain";

export interface ActivityLogEntry {
  id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const activityLogRepository = {
  async record(entry: {
    actorId: string | null;
    actorRole: UserRole | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ActivityLogEntry> {
    const { rows } = await pool.query<ActivityLogEntry>(
      `INSERT INTO activity_log (actor_id, actor_role, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        entry.actorId,
        entry.actorRole,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        JSON.stringify(entry.metadata ?? {})
      ]
    );
    return rows[0];
  },

  async list(limit = 100, offset = 0): Promise<ActivityLogEntry[]> {
    const { rows } = await pool.query<ActivityLogEntry>(
      "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    return rows;
  }
};

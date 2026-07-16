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
  actor_name: string | null;
  actor_email: string | null;
  affected_name: string | null;
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
      `SELECT al.*,
              actor.display_name AS actor_name,
              actor.email AS actor_email,
              CASE al.entity_type
                WHEN 'profile' THEN affected_profile.display_name
                WHEN 'asset' THEN asset.name
                WHEN 'room' THEN room.name
                WHEN 'floor' THEN floor.name
                WHEN 'building' THEN building.name
                WHEN 'complaint' THEN complaint.issue_type
                WHEN 'announcement' THEN announcement.title
                ELSE NULL
              END AS affected_name
       FROM activity_log al
       LEFT JOIN profiles actor ON actor.id = al.actor_id
       LEFT JOIN profiles affected_profile ON al.entity_type = 'profile' AND affected_profile.id = al.entity_id
       LEFT JOIN assets asset ON al.entity_type = 'asset' AND asset.id = al.entity_id
       LEFT JOIN rooms room ON al.entity_type = 'room' AND room.id = al.entity_id
       LEFT JOIN floors floor ON al.entity_type = 'floor' AND floor.id = al.entity_id
       LEFT JOIN dt_buildings building ON al.entity_type = 'building' AND building.id = al.entity_id
       LEFT JOIN complaints complaint ON al.entity_type = 'complaint' AND complaint.id = al.entity_id
       LEFT JOIN announcements announcement ON al.entity_type = 'announcement' AND announcement.id = al.entity_id
       ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  }
};

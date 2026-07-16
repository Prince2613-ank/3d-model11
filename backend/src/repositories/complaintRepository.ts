import { pool } from "../db/client";
import { Complaint, ComplaintPriority, ComplaintStatus } from "../types/domain";
import { BaseRepository } from "./baseRepository";

export interface ComplaintFilters {
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  reporterId?: string;
  floorId?: string;
  roomId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ComplaintWithAsset extends Complaint {
  asset_name: string;
  asset_category: string;
  asset_image_url: string | null;
}

class ComplaintRepository extends BaseRepository<Complaint> {
  constructor() {
    super("complaints");
  }

  async search(filters: ComplaintFilters): Promise<{ rows: ComplaintWithAsset[]; total: number }> {
    const clauses: string[] = ["c.deleted_at IS NULL"];
    const params: unknown[] = [];

    const push = (column: string, operator: string, value: unknown) => {
      params.push(value);
      clauses.push(`${column} ${operator} $${params.length}`);
    };

    if (filters.status) push("c.status", "=", filters.status);
    if (filters.priority) push("c.priority", "=", filters.priority);
    if (filters.reporterId) push("c.reporter_id", "=", filters.reporterId);
    if (filters.floorId) push("c.floor_id", "=", filters.floorId);
    if (filters.roomId) push("c.room_id", "=", filters.roomId);
    if (filters.dateFrom) push("c.created_at", ">=", filters.dateFrom);
    if (filters.dateTo) push("c.created_at", "<=", filters.dateTo);
    if (filters.search) {
      params.push(`%${filters.search}%`);
      clauses.push(`(c.reporter_name ILIKE $${params.length} OR c.reporter_email ILIKE $${params.length} OR c.description ILIKE $${params.length} OR c.issue_type ILIKE $${params.length})`);
    }

    const where = clauses.join(" AND ");
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const [rowsResult, countResult] = await Promise.all([
      pool.query<ComplaintWithAsset>(
        `SELECT c.*,
                COALESCE(c.target_name, r.name, a.name, 'Unknown target') AS asset_name,
                CASE WHEN c.target_type = 'room' THEN 'room' ELSE COALESCE(a.category::text, 'other') END AS asset_category,
                CASE WHEN c.target_type = 'room' THEN NULL ELSE a.image_url END AS asset_image_url
         FROM complaints c
         LEFT JOIN assets a ON a.id = c.asset_id
         LEFT JOIN rooms r ON r.id = c.room_id
         WHERE ${where}
         ORDER BY c.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM complaints c WHERE ${where}`, params)
    ]);

    return { rows: rowsResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async listByReporter(reporterId: string): Promise<Complaint[]> {
    const { rows } = await pool.query<Complaint>(
      "SELECT * FROM complaints WHERE reporter_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
      [reporterId]
    );
    return rows;
  }

  async assign(
    id: string,
    params: { assignedToProfileId?: string | null; assignedToName?: string | null; deadline?: string | null; notes?: string | null }
  ): Promise<Complaint | null> {
    const { rows } = await pool.query<Complaint>(
      `UPDATE complaints SET
         status = 'assigned',
         assigned_to_profile_id = $2,
         assigned_to_name = $3,
         assigned_deadline = $4,
         assigned_notes = $5
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, params.assignedToProfileId ?? null, params.assignedToName ?? null, params.deadline ?? null, params.notes ?? null]
    );
    return rows[0] ?? null;
  }

  async resolve(id: string, params: { resolutionText: string; resolutionImageUrl?: string | null }): Promise<Complaint | null> {
    const { rows } = await pool.query<Complaint>(
      `UPDATE complaints SET
         status = 'resolved',
         resolution_text = $2,
         resolution_image_url = $3,
         resolved_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, params.resolutionText, params.resolutionImageUrl ?? null]
    );
    return rows[0] ?? null;
  }

  async reject(id: string, adminReply: string): Promise<Complaint | null> {
    const { rows } = await pool.query<Complaint>(
      `UPDATE complaints SET status = 'rejected', admin_reply = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, adminReply]
    );
    return rows[0] ?? null;
  }

  async reply(id: string, adminReply: string): Promise<Complaint | null> {
    const { rows } = await pool.query<Complaint>(
      `UPDATE complaints SET admin_reply = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, adminReply]
    );
    return rows[0] ?? null;
  }
}

export const complaintRepository = new ComplaintRepository();

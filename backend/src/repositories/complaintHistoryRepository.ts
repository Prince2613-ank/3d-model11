import { pool } from "../db/client";
import { ComplaintStatus, UserRole } from "../types/domain";

export interface ComplaintHistoryEntry {
  id: string;
  complaint_id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus | null;
  note: string | null;
  created_at: string;
}

export const complaintHistoryRepository = {
  async record(entry: {
    complaintId: string;
    actorId: string | null;
    actorRole: UserRole | null;
    fromStatus: ComplaintStatus | null;
    toStatus: ComplaintStatus | null;
    note?: string | null;
  }): Promise<ComplaintHistoryEntry> {
    const { rows } = await pool.query<ComplaintHistoryEntry>(
      `INSERT INTO complaint_history (complaint_id, actor_id, actor_role, from_status, to_status, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entry.complaintId, entry.actorId, entry.actorRole, entry.fromStatus, entry.toStatus, entry.note ?? null]
    );
    return rows[0];
  },

  async listByComplaint(complaintId: string): Promise<ComplaintHistoryEntry[]> {
    const { rows } = await pool.query<ComplaintHistoryEntry>(
      "SELECT * FROM complaint_history WHERE complaint_id = $1 ORDER BY created_at ASC",
      [complaintId]
    );
    return rows;
  }
};

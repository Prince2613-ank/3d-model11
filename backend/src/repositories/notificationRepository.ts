import { pool } from "../db/client";
import { Notification, NotificationType } from "../types/domain";

export const notificationRepository = {
  async create(entry: {
    userId?: string | null;
    isAdminBroadcast?: boolean;
    type: NotificationType;
    title: string;
    body?: string | null;
    relatedComplaintId?: string | null;
  }): Promise<Notification> {
    const { rows } = await pool.query<Notification>(
      `INSERT INTO notifications (user_id, is_admin_broadcast, type, title, body, related_complaint_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        entry.userId ?? null,
        entry.isAdminBroadcast ?? false,
        entry.type,
        entry.title,
        entry.body ?? null,
        entry.relatedComplaintId ?? null
      ]
    );
    return rows[0];
  },

  async listForUser(userId: string, isAdmin: boolean): Promise<Notification[]> {
    const clause = isAdmin ? "WHERE user_id = $1 OR is_admin_broadcast = true" : "WHERE user_id = $1";
    const { rows } = await pool.query<Notification>(
      `SELECT * FROM notifications ${clause} ORDER BY created_at DESC LIMIT 100`,
      [userId]
    );
    return rows;
  },

  async unreadCount(userId: string, isAdmin: boolean): Promise<number> {
    const clause = isAdmin
      ? "WHERE (user_id = $1 OR is_admin_broadcast = true) AND is_read = false"
      : "WHERE user_id = $1 AND is_read = false";
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM notifications ${clause}`,
      [userId]
    );
    return parseInt(rows[0].count, 10);
  },

  async markRead(id: string, userId: string): Promise<Notification | null> {
    const { rows } = await pool.query<Notification>(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND (user_id = $2 OR is_admin_broadcast = true)
       RETURNING *`,
      [id, userId]
    );
    return rows[0] ?? null;
  },

  async markAllRead(userId: string, isAdmin: boolean): Promise<void> {
    const clause = isAdmin ? "WHERE user_id = $1 OR is_admin_broadcast = true" : "WHERE user_id = $1";
    await pool.query(`UPDATE notifications SET is_read = true ${clause}`, [userId]);
  }
};

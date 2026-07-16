import { pool } from "../db/client";
import { Notification, NotificationType } from "../types/domain";

function visibilityClause(isAdmin: boolean): string {
  if (isAdmin) return `(n.user_id = $1 OR n.is_admin_broadcast = true)`;
  return `(n.user_id = $1 OR (n.user_id IS NULL AND n.is_admin_broadcast = false))`;
}

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
      [entry.userId ?? null, entry.isAdminBroadcast ?? false, entry.type, entry.title, entry.body ?? null, entry.relatedComplaintId ?? null]
    );
    return rows[0];
  },

  async listForUser(userId: string, isAdmin: boolean): Promise<Notification[]> {
    const { rows } = await pool.query<Notification>(
      `SELECT n.id, n.user_id, n.is_admin_broadcast, n.type, n.title, n.body,
              n.related_complaint_id, n.created_at,
              EXISTS (
                SELECT 1 FROM notification_reads nr
                WHERE nr.notification_id = n.id AND nr.user_id = $1
              ) AS is_read
       FROM notifications n
       WHERE ${visibilityClause(isAdmin)}
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [userId]
    );
    return rows;
  },

  async unreadCount(userId: string, isAdmin: boolean): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)
       FROM notifications n
       WHERE ${visibilityClause(isAdmin)}
         AND NOT EXISTS (
           SELECT 1 FROM notification_reads nr
           WHERE nr.notification_id = n.id AND nr.user_id = $1
         )`,
      [userId]
    );
    return parseInt(rows[0].count, 10);
  },

  async markRead(id: string, userId: string, isAdmin: boolean): Promise<Notification | null> {
    const { rows: visible } = await pool.query<Notification>(
      `SELECT n.* FROM notifications n WHERE n.id = $2 AND ${visibilityClause(isAdmin)} LIMIT 1`,
      [userId, id]
    );
    if (!visible[0]) return null;

    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       VALUES ($1, $2) ON CONFLICT (notification_id, user_id) DO NOTHING`,
      [id, userId]
    );
    return { ...visible[0], is_read: true };
  },

  async markAllRead(userId: string, isAdmin: boolean): Promise<void> {
    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $1 FROM notifications n
       WHERE ${visibilityClause(isAdmin)}
       ON CONFLICT (notification_id, user_id) DO NOTHING`,
      [userId]
    );
  }
};

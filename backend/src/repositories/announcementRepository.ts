import { pool } from "../db/client";
import { Announcement } from "../types/domain";
import { BaseRepository } from "./baseRepository";

class AnnouncementRepository extends BaseRepository<Announcement> {
  constructor() {
    super("announcements");
  }

  async listActive(): Promise<Announcement[]> {
    const { rows } = await pool.query<Announcement>(
      `SELECT * FROM announcements
       WHERE deleted_at IS NULL AND is_active = true
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())
       ORDER BY created_at DESC`
    );
    return rows;
  }
}

export const announcementRepository = new AnnouncementRepository();

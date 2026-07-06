import { pool } from "../db/client";
import { Profile, UserRole } from "../types/domain";

export const profileRepository = {
  async findById(id: string): Promise<Profile | null> {
    const { rows } = await pool.query<Profile>("SELECT * FROM profiles WHERE id = $1", [id]);
    return rows[0] ?? null;
  },

  async list(limit = 100, offset = 0): Promise<Profile[]> {
    const { rows } = await pool.query<Profile>(
      "SELECT * FROM profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    return rows;
  },

  async search(query: string): Promise<Profile[]> {
    const { rows } = await pool.query<Profile>(
      "SELECT * FROM profiles WHERE email ILIKE $1 OR display_name ILIKE $1 ORDER BY created_at DESC LIMIT 50",
      [`%${query}%`]
    );
    return rows;
  },

  async setRole(id: string, role: UserRole): Promise<Profile | null> {
    const { rows } = await pool.query<Profile>(
      "UPDATE profiles SET role = $2 WHERE id = $1 RETURNING *",
      [id, role]
    );
    return rows[0] ?? null;
  },

  async setActive(id: string, isActive: boolean): Promise<Profile | null> {
    const { rows } = await pool.query<Profile>(
      "UPDATE profiles SET is_active = $2 WHERE id = $1 RETURNING *",
      [id, isActive]
    );
    return rows[0] ?? null;
  },

  async touchLastLogin(id: string): Promise<void> {
    await pool.query("UPDATE profiles SET last_login_at = now() WHERE id = $1", [id]);
  }
};

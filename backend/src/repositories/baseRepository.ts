import { QueryResultRow } from "pg";
import { pool } from "../db/client";

export interface ListOptions {
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Thin helper around the common soft-delete CRUD shape shared by
 * dt_buildings / floors / rooms / assets / announcements. Table and column
 * names are trusted constants supplied by call sites (never user input), so
 * string interpolation here is safe.
 */
export class BaseRepository<T extends QueryResultRow> {
  constructor(private readonly table: string) {}

  async findById(id: string, includeDeleted = false): Promise<T | null> {
    const clause = includeDeleted ? "" : "AND deleted_at IS NULL";
    const { rows } = await pool.query<T>(
      `SELECT * FROM ${this.table} WHERE id = $1 ${clause}`,
      [id]
    );
    return rows[0] ?? null;
  }

  async list(options: ListOptions = {}): Promise<T[]> {
    const clause = options.includeDeleted ? "" : "WHERE deleted_at IS NULL";
    const limit = options.limit ?? 200;
    const offset = options.offset ?? 0;
    const { rows } = await pool.query<T>(
      `SELECT * FROM ${this.table} ${clause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  }

  async insert(columns: Record<string, unknown>): Promise<T> {
    const keys = Object.keys(columns);
    const values = Object.values(columns);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await pool.query<T>(
      `INSERT INTO ${this.table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return rows[0];
  }

  async update(id: string, columns: Record<string, unknown>): Promise<T | null> {
    const keys = Object.keys(columns);
    if (keys.length === 0) return this.findById(id);
    const values = Object.values(columns);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(", ");
    const { rows } = await pool.query<T>(
      `UPDATE ${this.table} SET ${setClause} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, ...values]
    );
    return rows[0] ?? null;
  }

  async softDelete(id: string): Promise<T | null> {
    const { rows } = await pool.query<T>(
      `UPDATE ${this.table} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return rows[0] ?? null;
  }

  async restore(id: string): Promise<T | null> {
    const { rows } = await pool.query<T>(
      `UPDATE ${this.table} SET deleted_at = NULL WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] ?? null;
  }
}

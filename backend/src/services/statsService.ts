import { pool } from "../db/client";

export interface DashboardStats {
  openComplaints: number;
  resolvedToday: number;
  avgResolutionHours: number | null;
  assetsWithMostIssues: { asset_id: string; asset_name: string; complaint_count: number }[];
  topFloors: { floor_id: string; floor_name: string; complaint_count: number }[];
  monthlyTrends: { month: string; complaint_count: number }[];
}

export const statsService = {
  async dashboard(): Promise<DashboardStats> {
    const [openResult, resolvedTodayResult, avgResolutionResult, topAssetsResult, topFloorsResult, monthlyResult] = await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM complaints WHERE deleted_at IS NULL AND status IN ('pending','assigned')`
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM complaints
         WHERE deleted_at IS NULL AND status = 'resolved' AND resolved_at >= date_trunc('day', now())`
      ),
      pool.query<{ avg_hours: string | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0) AS avg_hours
         FROM complaints
         WHERE deleted_at IS NULL AND status = 'resolved' AND resolved_at IS NOT NULL`
      ),
      pool.query<{ asset_id: string; asset_name: string; complaint_count: string }>(
        `SELECT a.id AS asset_id, a.name AS asset_name, COUNT(c.id) AS complaint_count
         FROM complaints c
         JOIN assets a ON a.id = c.asset_id
         WHERE c.deleted_at IS NULL
         GROUP BY a.id, a.name
         ORDER BY complaint_count DESC
         LIMIT 10`
      ),
      pool.query<{ floor_id: string; floor_name: string; complaint_count: string }>(
        `SELECT f.id AS floor_id, f.name AS floor_name, COUNT(c.id) AS complaint_count
         FROM complaints c
         JOIN floors f ON f.id = c.floor_id
         WHERE c.deleted_at IS NULL
         GROUP BY f.id, f.name
         ORDER BY complaint_count DESC
         LIMIT 10`
      ),
      pool.query<{ month: string; complaint_count: string }>(
        `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS complaint_count
         FROM complaints
         WHERE deleted_at IS NULL AND created_at >= now() - interval '12 months'
         GROUP BY 1
         ORDER BY 1 ASC`
      )
    ]);

    return {
      openComplaints: parseInt(openResult.rows[0].count, 10),
      resolvedToday: parseInt(resolvedTodayResult.rows[0].count, 10),
      avgResolutionHours: avgResolutionResult.rows[0].avg_hours ? parseFloat(avgResolutionResult.rows[0].avg_hours) : null,
      assetsWithMostIssues: topAssetsResult.rows.map((r) => ({ ...r, complaint_count: parseInt(r.complaint_count, 10) })),
      topFloors: topFloorsResult.rows.map((r) => ({ ...r, complaint_count: parseInt(r.complaint_count, 10) })),
      monthlyTrends: monthlyResult.rows.map((r) => ({ ...r, complaint_count: parseInt(r.complaint_count, 10) }))
    };
  }
};

import { pool } from "../db/client";

export interface PrecomputedSolarRow {
  id: string;
  externalId: string | null;
  centroid: { lat: number; lon: number };
  areaSqm: number | null;
  usableAreaM2: number | null;
  solarKw: number | null;
  mayKwhDay: number | null;
  suitability: "excellent" | "good" | "fair" | "poor" | null;
  height: number;
  geojson: GeoJSON.Geometry;
}

function rowToPrecomputed(row: any): PrecomputedSolarRow {
  const centroid = JSON.parse(row.centroid_json);
  return {
    id: String(row.id),
    externalId: row.external_id,
    centroid: { lat: centroid.coordinates[1], lon: centroid.coordinates[0] },
    areaSqm: row.area_m2,
    usableAreaM2: row.usable_m2,
    solarKw: row.solar_kw,
    mayKwhDay: row.may_kwh_day,
    suitability: row.suitability,
    height: row.matched_height ? parseFloat(row.matched_height) : 12,
    geojson: JSON.parse(row.geom_json),
  };
}

export const solarPrecomputedRepository = {
  /**
   * Buildings within bbox, with their height opportunistically taken from the
   * `buildings` table via nearest-centroid match (the precomputed dataset has
   * no height column of its own) — falls back to a flat 12m default.
   */
  async getByBbox(minLon: number, minLat: number, maxLon: number, maxLat: number): Promise<PrecomputedSolarRow[]> {
    const { rows } = await pool.query(
      `SELECT
         sp.id, sp.external_id, sp.area_m2, sp.usable_m2, sp.solar_kw, sp.may_kwh_day, sp.suitability,
         ST_AsGeoJSON(sp.geom)     AS geom_json,
         ST_AsGeoJSON(sp.centroid) AS centroid_json,
         (
           SELECT b.height FROM buildings b
           WHERE ST_DWithin(b.centroid::geography, sp.centroid::geography, 5)
           ORDER BY b.centroid <-> sp.centroid
           LIMIT 1
         ) AS matched_height
       FROM solar_precomputed sp
       WHERE sp.geom && ST_MakeEnvelope($1,$2,$3,$4,4326)
       LIMIT 5000`,
      [minLon, minLat, maxLon, maxLat]
    );
    return rows.map(rowToPrecomputed);
  },
};

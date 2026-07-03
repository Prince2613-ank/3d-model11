import { pool } from "../db/client";
import { BuildingFootprint, IFootprintProvider } from "./IFootprintProvider";

function rowToFootprint(row: any): BuildingFootprint {
  const centroid = row.centroid_json
    ? JSON.parse(row.centroid_json)
    : { coordinates: [0, 0] };

  return {
    id:           row.id,
    externalId:   row.external_id,
    source:       row.source,
    name:         row.name,
    buildingType: row.building_type,
    height:       parseFloat(row.resolved_height) || 12,
    levels:       row.levels,
    areaSqm:      row.area_sqm ? parseFloat(row.area_sqm) : null,
    geojson:      JSON.parse(row.geom_json),
    centroid: {
      lat: centroid.coordinates[1],
      lon: centroid.coordinates[0],
    },
  };
}

export class OSMProvider implements IFootprintProvider {
  name = "osm";

  async getByPoint(lat: number, lon: number): Promise<BuildingFootprint | null> {
    const { rows } = await pool.query(
      `SELECT
         id, external_id, source, name, building_type, area_sqm, levels,
         COALESCE(height, levels * 3.2, 12.0) AS resolved_height,
         ST_AsGeoJSON(ST_Transform(geom, 4326))          AS geom_json,
         ST_AsGeoJSON(ST_Transform(centroid, 4326))      AS centroid_json
       FROM buildings
       WHERE ST_Contains(geom, ST_SetSRID(ST_Point($1,$2),4326))
       ORDER BY area_sqm ASC NULLS LAST
       LIMIT 1`,
      [lon, lat]
    );
    if (rows.length) return rowToFootprint(rows[0]);

    // fallback: nearest within 50 m
    const { rows: near } = await pool.query(
      `SELECT
         id, external_id, source, name, building_type, area_sqm, levels,
         COALESCE(height, levels * 3.2, 12.0) AS resolved_height,
         ST_AsGeoJSON(ST_Transform(geom, 4326))          AS geom_json,
         ST_AsGeoJSON(ST_Transform(centroid, 4326))      AS centroid_json
       FROM buildings
       WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_Point($1,$2),4326)::geography, 50)
       ORDER BY geom <-> ST_SetSRID(ST_Point($1,$2),4326)
       LIMIT 1`,
      [lon, lat]
    );
    return near.length ? rowToFootprint(near[0]) : null;
  }

  async getByBbox(minLon: number, minLat: number, maxLon: number, maxLat: number): Promise<BuildingFootprint[]> {
    const bbox = `ST_MakeEnvelope($1,$2,$3,$4,4326)`;
    const { rows } = await pool.query(
      `SELECT
         id, external_id, source, name, building_type, area_sqm, levels,
         COALESCE(height, levels * 3.2, 12.0) AS resolved_height,
         ST_AsGeoJSON(ST_Transform(geom, 4326))          AS geom_json,
         ST_AsGeoJSON(ST_Transform(centroid, 4326))      AS centroid_json
       FROM buildings
       WHERE geom && ${bbox}
       LIMIT 2000`,
      [minLon, minLat, maxLon, maxLat]
    );
    return rows.map(rowToFootprint);
  }
}

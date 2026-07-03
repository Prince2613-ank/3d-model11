import { Router, Request, Response } from "express";
import { pool } from "../db/client";
import { OSMProvider } from "../providers/OSMProvider";

const router = Router();
const provider = new OSMProvider();

// GET /api/amenity/nearby?lat=&lng=&radius=500&category=hospital
router.get("/nearby", async (req: Request, res: Response) => {
  const lat    = parseFloat(req.query.lat      as string);
  const lng    = parseFloat(req.query.lng      as string);
  const radius = parseFloat(req.query.radius   as string) || 1000;
  const cat    = (req.query.category as string) || null;

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng required" });
    return;
  }

  try {
    const params: any[] = [lng, lat, Math.min(radius, 5000)];
    const catClause = cat ? `AND category = $${params.push(cat)}` : "";

    const { rows } = await pool.query(
      `SELECT
         id, name, category, subcategory,
         ST_AsGeoJSON(point)::json AS point,
         tags,
         ST_Distance(point::geography, ST_SetSRID(ST_Point($1,$2),4326)::geography) AS distance_m
       FROM amenities
       WHERE ST_DWithin(point::geography, ST_SetSRID(ST_Point($1,$2),4326)::geography, $3)
       ${catClause}
       ORDER BY distance_m ASC
       LIMIT 100`,
      params
    );
    res.json({ count: rows.length, amenities: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/amenity/resolve  — find which building a POI is inside
router.post("/resolve", async (req: Request, res: Response) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) { res.status(400).json({ error: "lat and lng required" }); return; }
  try {
    const fp = await provider.getByPoint(parseFloat(lat), parseFloat(lng));
    res.json({ building: fp });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

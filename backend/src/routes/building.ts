import { Router, Request, Response } from "express";
import { OSMProvider } from "../providers/OSMProvider";
import { pool } from "../db/client";

const router = Router();
const provider = new OSMProvider();

// GET /api/building?lat=&lng=
router.get("/", async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }

  try {
    const fp = await provider.getByPoint(lat, lng);
    if (!fp) { res.status(404).json({ error: "No building found" }); return; }
    res.json(fp);
  } catch (e: any) {
    console.error("[building]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/building/bbox?minLon=&minLat=&maxLon=&maxLat=
router.get("/bbox", async (req: Request, res: Response) => {
  const { minLon, minLat, maxLon, maxLat } = req.query as Record<string, string>;
  try {
    const buildings = await provider.getByBbox(
      parseFloat(minLon), parseFloat(minLat),
      parseFloat(maxLon), parseFloat(maxLat)
    );
    res.json({ count: buildings.length, buildings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/building/stats
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                        AS total,
         COUNT(height)                   AS with_height,
         COUNT(name)                     AS with_name,
         ROUND(AVG(area_sqm)::numeric,1) AS avg_area_sqm
       FROM buildings`
    );
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

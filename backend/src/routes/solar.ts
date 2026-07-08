import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { solarService, SolarMode } from "../services/solarService";

const router = Router();

// GET /api/solar/estimate?minLon=&minLat=&maxLon=&maxLat=&date=YYYY-MM-DD&mode=free|google
router.get("/estimate", asyncHandler(async (req: Request, res: Response) => {
  const { minLon, minLat, maxLon, maxLat, date, mode } = req.query as Record<string, string>;

  const bbox = [minLon, minLat, maxLon, maxLat].map(parseFloat);
  if (bbox.some((v) => isNaN(v))) {
    res.status(400).json({ error: "minLon, minLat, maxLon, maxLat are required" });
    return;
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date is required in YYYY-MM-DD format" });
    return;
  }
  const solarMode: SolarMode = mode === "google" ? "google" : "free";

  try {
    const result = await solarService.estimateArea(bbox[0], bbox[1], bbox[2], bbox[3], date, solarMode);
    res.json(result);
  } catch (e: any) {
    console.error("[solar]", e.message);
    res.status(502).json({ error: e.message });
  }
}));

export default router;

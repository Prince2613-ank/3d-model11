import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import buildingRouter from "./routes/building";
import amenityRouter from "./routes/amenity";
import { pool } from "./db/client";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "4000");

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(compression());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/building", buildingRouter);
app.use("/api/amenity",  amenityRouter);

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`);
  console.log(`[server] health → http://localhost:${PORT}/api/health`);
});

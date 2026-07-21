import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import buildingRouter from "./routes/building";
import amenityRouter from "./routes/amenity";
import solarRouter from "./routes/solar";
import meRouter from "./routes/me";
import dtBuildingsRouter from "./routes/dtBuildings";
import floorsRouter from "./routes/floors";
import roomsRouter from "./routes/rooms";
import assetsRouter from "./routes/assets";
import complaintsRouter from "./routes/complaints";
import bookingsRouter from "./routes/bookings";
import uploadsRouter from "./routes/uploads";
import notificationsRouter from "./routes/notifications";
import announcementsRouter from "./routes/announcements";
import usersRouter from "./routes/users";
import activityLogRouter from "./routes/activityLog";
import statsRouter from "./routes/stats";
import { pool } from "./db/client";
import { attachUser } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "4000");

// CORS_ORIGIN is a comma-separated list (e.g. the viewer + admin panel origins)
// so multiple deployed frontends can share one backend. "*" keeps the old
// behavior of allowing any origin.
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const allowedOrigins = corsOrigin === "*" ? "*" : corsOrigin.split(",").map((o) => o.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(compression());
app.use(express.json());
app.use(attachUser);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

// Existing GIS features
app.use("/api/building", buildingRouter);
app.use("/api/amenity",  amenityRouter);
app.use("/api/solar",    solarRouter);

// Digital Twin platform
app.use("/api/me", meRouter);
app.use("/api/dt-buildings", dtBuildingsRouter);
app.use("/api/floors", floorsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/complaints", complaintsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/users", usersRouter);
app.use("/api/activity-log", activityLogRouter);
app.use("/api/stats", statsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`);
  console.log(`[server] health → http://localhost:${PORT}/api/health`);
});

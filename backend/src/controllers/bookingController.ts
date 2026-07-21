import { Request, Response } from "express";
import { notificationRepository } from "../repositories/notificationRepository";
import { activityLogRepository } from "../repositories/activityLogRepository";
import { ValidationError } from "../errors";

function formatRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const validStart = !Number.isNaN(start.getTime());
  const validEnd = !Number.isNaN(end.getTime());
  if (!validStart || !validEnd) return "";
  return ` from ${start.toLocaleString([], opts)} to ${end.toLocaleString([], opts)} on ${start.toLocaleDateString()}`;
}

export const bookingController = {
  // Bookings themselves live entirely in Google Calendar (see cesium_demo's
  // booking.ts) — the app backend has no booking table. This endpoint exists
  // solely to raise an admin-facing notification once a booking/cancellation
  // succeeds. The reporter's identity always comes from the authenticated
  // session (req.user), never from the request body, so one user can't spoof
  // a booking notification as coming from someone else.
  async notifyBooked(req: Request, res: Response): Promise<void> {
    const { roomName, startTime, endTime } = req.body;
    if (!roomName?.trim() || !startTime || !endTime) {
      throw new ValidationError("roomName, startTime and endTime are required");
    }

    const reporter = req.user!;
    const reporterLabel = reporter.displayName || reporter.email;
    const notification = await notificationRepository.create({
      isAdminBroadcast: true,
      type: "room_booked",
      title: `Room booked: ${roomName}`,
      body: `${reporterLabel} booked ${roomName}${formatRange(startTime, endTime)}`
    });

    await activityLogRepository.record({
      actorId: reporter.id,
      actorRole: reporter.role,
      action: "room_booked",
      entityType: "room",
      metadata: { roomName, startTime, endTime }
    });

    res.status(201).json({ notification });
  },

  async notifyCancelled(req: Request, res: Response): Promise<void> {
    const { roomName, startTime, endTime } = req.body;
    if (!roomName?.trim()) throw new ValidationError("roomName is required");

    const reporter = req.user!;
    const reporterLabel = reporter.displayName || reporter.email;
    const notification = await notificationRepository.create({
      isAdminBroadcast: true,
      type: "room_booking_cancelled",
      title: `Booking cancelled: ${roomName}`,
      body: `${reporterLabel} cancelled their booking for ${roomName}${startTime && endTime ? formatRange(startTime, endTime) : ""}`
    });

    await activityLogRepository.record({
      actorId: reporter.id,
      actorRole: reporter.role,
      action: "room_booking_cancelled",
      entityType: "room",
      metadata: { roomName, startTime, endTime }
    });

    res.status(201).json({ notification });
  }
};

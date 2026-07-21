import { ROOM_CALENDARS } from "./roomCalendars";

declare const gapi: any;

export interface RoomBooking {
  id: string;
  room: string;
  calendarId: string;
  title: string;
  organizer: string;
  start: Date;
  end: Date;
}

let gapiReady: Promise<void> | null = null;

function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((globalThis as any).gapi?.load) { resolve(); return; }
    const id = "google-api-client-admin";
    document.getElementById(id)?.remove();
    const script = document.createElement("script");
    script.id = id;
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API client script"));
    document.head.appendChild(script);
  });
}

function loadGapiClient(): Promise<void> {
  return new Promise((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({
          discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function ensureGapiReady(accessToken: string): Promise<void> {
  gapiReady ??= (async () => {
    await loadGapiScript();
    await loadGapiClient();
  })();
  await gapiReady;
  gapi.client.setToken({ access_token: accessToken });
}

export async function fetchRoomBookings(accessToken: string, day: Date): Promise<RoomBooking[]> {
  await ensureGapiReady(accessToken);

  const startOfDay = new Date(day);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(day);
  endOfDay.setHours(23, 59, 59, 999);

  const entries = Object.entries(ROOM_CALENDARS);
  const results = await Promise.allSettled(
    entries.map(([, calendarId]) =>
      gapi.client.calendar.events.list({
        calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 200,
      })
    )
  );

  const bookings: RoomBooking[] = [];
  const failures: string[] = [];
  results.forEach((result, index) => {
    const [roomName, calendarId] = entries[index];
    if (result.status !== "fulfilled") {
      const reason: any = result.reason;
      const message: string = reason?.result?.error?.message ?? reason?.message ?? "Unknown error";
      failures.push(`${roomName}: ${message}`);
      console.warn(`[googleCalendar] Failed to list events for ${roomName} (${calendarId}):`, reason);
      return;
    }
    const items: any[] = result.value.result.items ?? [];
    for (const item of items) {
      bookings.push({
        id: item.id,
        room: roomName,
        calendarId,
        title: item.summary ?? "Meeting",
        organizer: item.organizer?.email ?? item.creator?.email ?? "Unknown",
        start: new Date(item.start?.dateTime ?? item.start?.date ?? ""),
        end: new Date(item.end?.dateTime ?? item.end?.date ?? ""),
      });
    }
  });

  // If every room calendar failed, surface it as a real error instead of a
  // silent "no bookings" — most commonly the signed-in Google account isn't a
  // member of the Workspace org that owns these room resource calendars, so it
  // has no visibility into them at all.
  if (failures.length === entries.length) {
    throw new Error(`Could not read any room calendars — ${failures[0]}`);
  }

  return bookings.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Removes the room's own attendance from this event on the room's OWN calendar
 * (not the organizer's) — frees the room without needing organizer-level access
 * to the booker's personal calendar. Requires the signed-in admin's Google
 * account to have "Make changes to events" access on the room calendar,
 * granted via that calendar's sharing settings in Google Calendar.
 */
export async function cancelRoomBooking(accessToken: string, calendarId: string, eventId: string): Promise<{ success: boolean; error?: string }> {
  await ensureGapiReady(accessToken);
  try {
    await gapi.client.calendar.events.delete({ calendarId, eventId });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: describeCalendarError(err, "cancel this booking") };
  }
}

/** 403s from Google here almost always mean the signed-in account can read the
 * room calendar but hasn't been granted "Make changes to events" on it. */
function describeCalendarError(err: any, action: string): string {
  const code: number | undefined = err?.result?.error?.code ?? err?.status;
  const message: string = err?.result?.error?.message ?? err?.message ?? "Unknown error";
  if (code === 403) {
    return `Forbidden — your Google account doesn't have "Make changes to events" access on this room's calendar yet, so it can't ${action}. Grant that access in the room calendar's sharing settings, then retry.`;
  }
  return message;
}

/** Creates a replacement booking as the signed-in admin — used for "editing" a
 * booking (cancel the old one, then create a new one in its place). */
export async function createRoomBooking(
  accessToken: string,
  roomName: string,
  start: Date,
  end: Date,
  title: string
): Promise<{ success: boolean; error?: string }> {
  await ensureGapiReady(accessToken);
  const roomCalendarId = ROOM_CALENDARS[roomName];
  if (!roomCalendarId) return { success: false, error: `Unknown room "${roomName}"` };

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await gapi.client.calendar.events.insert({
      calendarId: "primary",
      resource: {
        summary: title || `${roomName} – Meeting`,
        location: roomName,
        start: { dateTime: start.toISOString(), timeZone: tz },
        end: { dateTime: end.toISOString(), timeZone: tz },
        attendees: [{ email: roomCalendarId, resource: true }],
      },
    });
    return { success: true };
  } catch (err: any) {
    const message: string = err?.result?.error?.message ?? err?.message ?? "Failed to create booking";
    return { success: false, error: message };
  }
}

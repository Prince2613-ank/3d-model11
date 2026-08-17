import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { fetchRoomBookings, type RoomBooking } from "../lib/googleCalendar";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function BookingsPage() {
  const { getGoogleAccessToken, signInWithGoogle } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [date, setDate] = useState(() => toDateInputValue(new Date()));

  useEffect(() => {
    let cancelled = false;
    void getGoogleAccessToken()
      .then((value) => {
        if (cancelled) return;
        setToken(value);
        setTokenChecked(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: bookings, isLoading, isError, error } = useQuery({
    queryKey: ["room-bookings", date, token],
    queryFn: () => fetchRoomBookings(token!, new Date(`${date}T00:00:00`)),
    enabled: !!token,
    retry: false
  });

  const handleConnect = async () => {
    setConnecting(true);
    await signInWithGoogle();
  };

  const columns: Column<RoomBooking>[] = [
    {
      header: "Room",
      render: (booking) => (
        <span className="font-medium text-slate-800 dark:text-slate-100">{booking.room}</span>
      )
    },
    { header: "Meeting", render: (booking) => booking.title },
    { header: "Organizer", render: (booking) => booking.organizer },
    {
      header: "Start",
      render: (booking) => booking.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    },
    {
      header: "End",
      render: (booking) => booking.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ];

  if (!tokenChecked) {
    return <div className="text-sm font-semibold text-slate-400">Loading…</div>;
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-5 dark:border-white/10">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Bookings</h2>
            <p className="text-xs text-slate-500 mt-1">Reserve, check availability, and manage facility room bookings.</p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-slate-900/60">
          <p className="mb-4 text-sm font-semibold text-slate-500">
            Connect Google Calendar to view room bookings and details.
          </p>
          <Button onClick={() => void handleConnect()} disabled={connecting} className="h-9 text-xs">
            {connecting ? "Redirecting…" : "Connect Google Calendar"}
          </Button>
          <p className="mt-4 text-[11px] text-slate-400">This workspace is currently read-only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-5 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Bookings</h2>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:bg-white/10 dark:text-slate-300">
              View only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Calendar integrations and resource reservation records.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const d = new Date(date);
              d.setDate(d.getDate() - 1);
              setDate(toDateInputValue(d));
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            ←
          </button>
          <Input type="date" className="h-9 text-xs w-full sm:w-48" value={date} onChange={(event) => setDate(event.target.value)} />
          <button 
            onClick={() => {
              const d = new Date(date);
              d.setDate(d.getDate() + 1);
              setDate(toDateInputValue(d));
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            →
          </button>
        </div>
      </div>

      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {(error as Error).message} — signed-in account requires read access to room calendars.
        </div>
      )}

      <DataTable
        columns={columns}
        rows={bookings ?? []}
        keyField={(booking) => `${booking.calendarId}:${booking.id}`}
        isLoading={isLoading}
        emptyMessage="No bookings found for this day."
      />
    </div>
  );
}

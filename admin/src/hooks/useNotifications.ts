import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Notification } from "../types/domain";

// Polling for now — Phase 5 (Realtime) will replace this with a Supabase
// Realtime subscription so updates arrive instantly instead of on an interval.
const POLL_INTERVAL_MS = 12_000;

export function useUnreadNotificationCount(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    enabled,
    refetchInterval: POLL_INTERVAL_MS
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api.get<{ notifications: Notification[] }>("/notifications"),
    enabled,
    refetchInterval: POLL_INTERVAL_MS
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return async () => {
    await api.patch("/notifications/read-all");
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
}

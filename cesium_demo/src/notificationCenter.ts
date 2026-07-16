import { api } from "./api";
import { onAuthChange, type CurrentUser } from "./auth";
import { showToast } from "./booking";

type NotificationType =
  | "complaint_created" | "complaint_assigned" | "complaint_resolved"
  | "complaint_rejected" | "complaint_replied" | "new_complaint_admin" | "announcement" | "direct_message";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  related_complaint_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface ComplaintDetail {
  id: string;
  issue_type: string;
  priority: string;
  status: string;
  description: string;
  assigned_to_name: string | null;
  assigned_deadline: string | null;
  assigned_notes: string | null;
  admin_reply: string | null;
  resolution_text: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface ComplaintHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

const POLL_INTERVAL_MS = 12_000;
let pollTimer: number | null = null;
let signedInUser: CurrentUser | null = null;
let initializedFeed = false;
let knownIds = new Set<string>();

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function iconFor(type: NotificationType): string {
  if (type === "direct_message") return "✉";
  if (type === "announcement") return "📣";
  if (type === "complaint_resolved") return "✓";
  if (type === "complaint_rejected") return "×";
  if (type === "complaint_replied") return "↩";
  if (type === "complaint_assigned") return "→";
  return "!";
}

function detailLabel(type: NotificationType): string {
  if (type === "direct_message") return "Message from admin";
  if (type === "announcement") return "Announcement";
  if (type === "complaint_replied") return "Admin reply";
  if (type === "complaint_resolved") return "Complaint resolved";
  if (type === "complaint_rejected") return "Complaint rejected";
  if (type === "complaint_assigned") return "Complaint assigned";
  return "Complaint update";
}

function detailRow(label: string, value: string | null | undefined): HTMLElement | null {
  if (!value) return null;
  const row = document.createElement("div");
  row.className = "notification-detail-row";
  const term = document.createElement("span");
  term.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  row.append(term, content);
  return row;
}

function detailSection(title: string, body: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "notification-detail-section";
  const heading = document.createElement("h4");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = body;
  section.append(heading, paragraph);
  return section;
}

function closeNotificationDetail(): void {
  element<HTMLElement>("notificationDetailModal").hidden = true;
}

async function openNotificationDetail(item: NotificationItem): Promise<void> {
  const modal = element<HTMLElement>("notificationDetailModal");
  const content = element<HTMLElement>("notificationDetailContent");
  element<HTMLElement>("notificationDetailIcon").textContent = iconFor(item.type);
  element<HTMLElement>("notificationDetailType").textContent = detailLabel(item.type);
  element<HTMLElement>("notificationDetailTitle").textContent = item.title;
  element<HTMLTimeElement>("notificationDetailTime").textContent = new Date(item.created_at).toLocaleString();
  content.replaceChildren();
  if (item.body) content.appendChild(detailSection(item.type === "announcement" ? "Message" : "Latest update", item.body));
  modal.hidden = false;

  if (!item.related_complaint_id) return;
  const loading = document.createElement("div");
  loading.className = "notification-detail-loading";
  loading.textContent = "Loading complaint details…";
  content.appendChild(loading);

  try {
    const [{ complaint }, { history }] = await Promise.all([
      api.get<{ complaint: ComplaintDetail }>(`/complaints/${item.related_complaint_id}`),
      api.get<{ history: ComplaintHistoryEntry[] }>(`/complaints/${item.related_complaint_id}/history`),
    ]);
    loading.remove();

    const facts = document.createElement("div");
    facts.className = "notification-detail-facts";
    [
      detailRow("Status", complaint.status.replaceAll("_", " ")),
      detailRow("Priority", complaint.priority),
      detailRow("Issue", complaint.issue_type),
      detailRow("Assigned to", complaint.assigned_to_name),
      detailRow("Deadline", complaint.assigned_deadline ? new Date(complaint.assigned_deadline).toLocaleString() : null),
    ].forEach((row) => { if (row) facts.appendChild(row); });
    content.appendChild(facts);
    content.appendChild(detailSection("Original complaint", complaint.description));
    if (complaint.assigned_notes) content.appendChild(detailSection("Assignment notes", complaint.assigned_notes));
    if (complaint.admin_reply) content.appendChild(detailSection("Admin response", complaint.admin_reply));
    if (complaint.resolution_text) content.appendChild(detailSection("Resolution", complaint.resolution_text));

    if (history.length > 0) {
      const timeline = document.createElement("section");
      timeline.className = "notification-detail-timeline";
      const heading = document.createElement("h4");
      heading.textContent = "Activity timeline";
      timeline.appendChild(heading);
      history.forEach((entry) => {
        const event = document.createElement("div");
        event.className = "notification-detail-timeline-event";
        const label = document.createElement("strong");
        label.textContent = entry.to_status ? `Status changed to ${entry.to_status}` : "Complaint updated";
        const meta = document.createElement("span");
        meta.textContent = new Date(entry.created_at).toLocaleString();
        event.append(label, meta);
        if (entry.note) {
          const note = document.createElement("p");
          note.textContent = entry.note;
          event.appendChild(note);
        }
        timeline.appendChild(event);
      });
      content.appendChild(timeline);
    }
  } catch (error) {
    loading.textContent = "Could not load the related complaint details.";
    console.warn("[notifications] Failed to load complaint detail:", error);
  }
}

function renderNotifications(items: NotificationItem[]): void {
  const list = element<HTMLElement>("notificationCenterList");
  const status = element<HTMLElement>("notificationCenterStatus");
  list.replaceChildren();

  if (items.length === 0) {
    status.hidden = false;
    status.textContent = "You're all caught up. New announcements and complaint updates will appear here.";
    return;
  }
  status.hidden = true;

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `notification-center-item${item.is_read ? " is-read" : " is-unread"}`;

    const icon = document.createElement("span");
    icon.className = `notification-center-item-icon type-${item.type}`;
    icon.textContent = iconFor(item.type);

    const content = document.createElement("span");
    content.className = "notification-center-item-content";
    const title = document.createElement("strong");
    title.textContent = item.title;
    content.appendChild(title);
    if (item.body) {
      const body = document.createElement("span");
      body.className = "notification-center-item-body";
      body.textContent = item.body;
      content.appendChild(body);
    }
    const meta = document.createElement("span");
    meta.className = "notification-center-item-time";
    meta.textContent = timeAgo(item.created_at);
    content.appendChild(meta);

    if (!item.is_read) {
      const dot = document.createElement("span");
      dot.className = "notification-center-unread-dot";
      button.appendChild(dot);
    }

    button.append(icon, content);
    button.addEventListener("click", async () => {
      void openNotificationDetail(item);
      if (!item.is_read) {
        await api.patch(`/notifications/${item.id}/read`);
        item.is_read = true;
        await refreshNotifications(false);
      }
    });
    list.appendChild(button);
  }
}

async function refreshNotifications(animateNew = true): Promise<void> {
  if (!signedInUser) return;
  try {
    const [{ notifications }, { count }] = await Promise.all([
      api.get<{ notifications: NotificationItem[] }>("/notifications"),
      api.get<{ count: number }>("/notifications/unread-count"),
    ]);

    const button = element<HTMLButtonElement>("notificationCenterBtn");
    const badge = element<HTMLElement>("notificationCenterBadge");
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? "99+" : String(count);
    button.classList.toggle("has-unread", count > 0);

    const newItems = initializedFeed ? notifications.filter((item) => !knownIds.has(item.id)) : [];
    const hasNew = newItems.length > 0;
    if (animateNew && hasNew) {
      button.classList.remove("notification-center-arrived");
      void button.offsetWidth;
      button.classList.add("notification-center-arrived");
      newItems.slice().reverse().forEach((item) => {
        showToast(item.body ? `${item.title}: ${item.body}` : item.title, "info", 7000);
      });
    }
    knownIds = new Set(notifications.map((item) => item.id));
    initializedFeed = true;
    renderNotifications(notifications);
  } catch (error) {
    console.warn("[notifications] Unable to refresh notification feed:", error);
    const status = element<HTMLElement>("notificationCenterStatus");
    status.hidden = false;
    status.textContent = "Notifications are temporarily unavailable. We'll retry automatically.";
  }
}

function setPanelOpen(open: boolean): void {
  const panel = element<HTMLElement>("notificationCenterPanel");
  const button = element<HTMLButtonElement>("notificationCenterBtn");
  panel.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  button.classList.toggle("is-active", open);
  if (open && signedInUser) void refreshNotifications(false);
}

function stopPolling(): void {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  pollTimer = null;
}

function handleAuthChange(user: CurrentUser | null): void {
  stopPolling();
  signedInUser = user;
  initializedFeed = false;
  knownIds.clear();
  const button = element<HTMLButtonElement>("notificationCenterBtn");
  const badge = element<HTMLElement>("notificationCenterBadge");
  button.hidden = !user;
  badge.hidden = true;

  if (!user) {
    setPanelOpen(false);
    renderNotifications([]);
    const status = element<HTMLElement>("notificationCenterStatus");
    status.hidden = false;
    status.textContent = "Sign in to see announcements and complaint updates.";
    return;
  }

  void refreshNotifications(false);
  pollTimer = window.setInterval(() => void refreshNotifications(), POLL_INTERVAL_MS);
}

export function initNotificationCenter(): void {
  const button = element<HTMLButtonElement>("notificationCenterBtn");
  const panel = element<HTMLElement>("notificationCenterPanel");
  const toolbar = document.querySelector<HTMLElement>(".cesium-viewer-toolbar");
  const profile = document.getElementById("userProfile");
  if (toolbar && !toolbar.contains(button)) {
    if (profile && toolbar.contains(profile)) toolbar.insertBefore(button, profile);
    else toolbar.appendChild(button);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setPanelOpen(Boolean(panel.hidden));
  });
  panel.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => setPanelOpen(false));
  element<HTMLButtonElement>("notificationMarkAllBtn").addEventListener("click", async () => {
    if (!signedInUser) return;
    await api.patch("/notifications/read-all");
    await refreshNotifications(false);
  });
  element<HTMLButtonElement>("notificationDetailCloseBtn").addEventListener("click", closeNotificationDetail);
  element<HTMLButtonElement>("notificationDetailBackdrop").addEventListener("click", closeNotificationDetail);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNotificationDetail();
  });

  onAuthChange(handleAuthChange);
}

import { api } from "./api";
import { onAuthChange, type CurrentUser } from "./auth";
import { registerToolbarPanel, closeOtherToolbarPanels, registerPanelOpener, openToolbarPanel } from "./panelCoordination";

type ComplaintStatus = "pending" | "assigned" | "resolved" | "rejected";

interface MyComplaint {
  id: string;
  target_name: string | null;
  issue_type: string;
  priority: "low" | "medium" | "high" | "critical";
  status: ComplaintStatus;
  description: string;
  assigned_to_name: string | null;
  admin_reply: string | null;
  resolution_text: string | null;
  created_at: string;
  resolved_at: string | null;
}

type FilterKey = "all" | "open" | "resolved" | "rejected";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
];

let signedInUser: CurrentUser | null = null;
let complaints: MyComplaint[] = [];
let activeFilter: FilterKey = "all";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

function matchesFilter(status: ComplaintStatus, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "open") return status === "pending" || status === "assigned";
  return status === filter;
}

function statusLabel(status: ComplaintStatus): string {
  if (status === "pending") return "Pending review";
  if (status === "assigned") return "In progress";
  if (status === "resolved") return "Resolved";
  return "Rejected";
}

function shortMessage(c: MyComplaint): string | null {
  if (c.status === "resolved") return c.resolution_text;
  if (c.status === "rejected") return c.admin_reply;
  if (c.status === "assigned") return c.assigned_to_name ? `Assigned to ${c.assigned_to_name}` : "Assigned for review";
  return null;
}

function renderTabs(): void {
  const tabs = element<HTMLElement>("myComplaintsTabs");
  tabs.replaceChildren();
  for (const filter of FILTERS) {
    const count = filter.key === "all" ? complaints.length : complaints.filter((c) => matchesFilter(c.status, filter.key)).length;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `my-complaints-tab${activeFilter === filter.key ? " is-active" : ""}`;
    tab.textContent = `${filter.label} (${count})`;
    tab.addEventListener("click", () => {
      activeFilter = filter.key;
      renderTabs();
      renderList();
    });
    tabs.appendChild(tab);
  }
}

function renderList(): void {
  const list = element<HTMLElement>("myComplaintsList");
  const status = element<HTMLElement>("myComplaintsStatus");
  list.replaceChildren();

  const filtered = complaints.filter((c) => matchesFilter(c.status, activeFilter));
  if (filtered.length === 0) {
    status.hidden = false;
    status.textContent = complaints.length === 0
      ? "You haven't raised any complaints yet."
      : "No complaints in this category.";
    return;
  }
  status.hidden = true;

  for (const c of filtered) {
    const entry = document.createElement("div");
    entry.className = "my-complaints-entry";

    const row = document.createElement("button");
    row.type = "button";
    row.className = `my-complaints-item status-${c.status}`;

    const statusDot = document.createElement("span");
    statusDot.className = `my-complaints-status-dot status-${c.status}`;

    const content = document.createElement("span");
    content.className = "my-complaints-item-content";
    const title = document.createElement("strong");
    title.textContent = `${c.target_name || "General"} — ${c.issue_type}`;
    const meta = document.createElement("span");
    meta.className = "my-complaints-item-meta";
    meta.textContent = `${statusLabel(c.status)} · ${new Date(c.created_at).toLocaleDateString()}`;
    content.append(title, meta);

    row.append(statusDot, content);

    const message = shortMessage(c);
    let detail: HTMLElement | null = null;
    if (message) {
      const caret = document.createElement("span");
      caret.className = "my-complaints-caret";
      caret.textContent = "▶";
      row.appendChild(caret);

      detail = document.createElement("div");
      detail.className = "my-complaints-detail";
      detail.hidden = true;
      const detailText = document.createElement("p");
      detailText.textContent = message;
      detail.appendChild(detailText);
    }

    row.addEventListener("click", () => {
      if (!detail) return;
      const isOpen = !detail.hidden;
      detail.hidden = isOpen;
      entry.classList.toggle("is-expanded", !isOpen);
    });

    entry.appendChild(row);
    if (detail) entry.appendChild(detail);
    list.appendChild(entry);
  }
}

async function loadMyComplaints(): Promise<void> {
  if (!signedInUser) return;
  const status = element<HTMLElement>("myComplaintsStatus");
  try {
    const { complaints: fetched } = await api.get<{ complaints: MyComplaint[] }>("/complaints/mine");
    complaints = fetched;
    renderTabs();
    renderList();
  } catch (error) {
    status.hidden = false;
    status.replaceChildren();
    const message = document.createElement("p");
    message.textContent = "Could not load your complaints.";
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "notification-center-status-retry";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => void loadMyComplaints());
    status.append(message, retryBtn);
    console.warn("[myComplaints] Failed to load complaints:", error);
  }
}

function setPanelOpen(open: boolean): void {
  const panel = element<HTMLElement>("myComplaintsPanel");
  panel.hidden = !open;
  if (open) {
    closeOtherToolbarPanels("myComplaints");
    const status = element<HTMLElement>("myComplaintsStatus");
    if (!signedInUser) {
      status.hidden = false;
      status.textContent = "Sign in to view your complaints.";
    } else {
      void loadMyComplaints();
    }
  }
}

function handleAuthChange(user: CurrentUser | null): void {
  signedInUser = user;
  complaints = [];
}

export function initMyComplaints(): void {
  const panel = element<HTMLElement>("myComplaintsPanel");

  panel.addEventListener("click", (event) => event.stopPropagation());
  element<HTMLButtonElement>("myComplaintsBackBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    setPanelOpen(false);
    openToolbarPanel("notifications");
  });
  document.addEventListener("click", () => setPanelOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setPanelOpen(false);
  });

  renderTabs();
  registerToolbarPanel("myComplaints", () => setPanelOpen(false));
  registerPanelOpener("myComplaints", () => setPanelOpen(true));
  onAuthChange(handleAuthChange);
}

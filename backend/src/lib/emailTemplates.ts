import { ADMIN_PANEL_URL, USER_PANEL_URL } from "../config/appUrls";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface Row {
  label: string;
  value: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
}

function renderRows(rows: Row[]): string {
  return rows
    .map(
      (row) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font:600 12px/1.5 system-ui,sans-serif;white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td><td style="padding:4px 0;color:#1e293b;font:500 13px/1.6 system-ui,sans-serif;">${escapeHtml(row.value)}</td></tr>`
    )
    .join("");
}

function renderEmail(opts: { accent: string; eyebrow: string; heading: string; rows: Row[]; message?: string; footer: string; ctaUrl: string; ctaLabel: string }): string {
  return `
<div style="background:#f1f5f9;padding:24px;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:${opts.accent};padding:20px 24px;color:#ffffff;">
      <p style="margin:0 0 4px;font:800 10px/1.2 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">${escapeHtml(opts.eyebrow)}</p>
      <h1 style="margin:0;font:800 19px/1.3 system-ui,sans-serif;">${escapeHtml(opts.heading)}</h1>
    </div>
    <div style="padding:22px 24px;">
      ${opts.message ? `<p style="margin:0 0 16px;color:#334155;font:500 14px/1.6 system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(opts.message)}</p>` : ""}
      <table role="presentation" style="width:100%;border-collapse:collapse;">${renderRows(opts.rows)}</table>
      <table role="presentation" style="margin-top:20px;"><tr><td style="border-radius:10px;background:${opts.accent};"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;padding:11px 20px;color:#ffffff;font:700 13px/1 system-ui,sans-serif;text-decoration:none;border-radius:10px;">${escapeHtml(opts.ctaLabel)} →</a></td></tr></table>
      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font:500 11px/1.5 system-ui,sans-serif;">${escapeHtml(opts.footer)}</p>
    </div>
  </div>
</div>`;
}

function renderText(heading: string, rows: Row[], ctaUrl: string, ctaLabel: string, message?: string): string {
  const lines = [heading, "", ...(message ? [message, ""] : []), ...rows.map((row) => `${row.label}: ${row.value}`), "", `${ctaLabel}: ${ctaUrl}`];
  return lines.join("\n");
}

export function complaintCreatedAdminEmail(params: {
  complaintId: string;
  reporterName: string;
  reporterEmail: string;
  issueType: string;
  targetName: string;
  description: string;
  createdAt: Date;
}): EmailContent {
  const rows: Row[] = [
    { label: "Complaint ID", value: params.complaintId },
    { label: "Raised by", value: `${params.reporterName} (${params.reporterEmail})` },
    { label: "Issue", value: params.issueType },
    { label: "Location", value: params.targetName },
    { label: "Date & time", value: params.createdAt.toLocaleString() }
  ];
  // Complaints list has no direct id-based deep link, so filter it to this
  // reporter's own complaints — the fastest way to land on the right one.
  const ctaUrl = `${ADMIN_PANEL_URL}/complaints?search=${encodeURIComponent(params.reporterEmail)}`;
  const ctaLabel = "Open in Admin Panel";
  return {
    subject: `New complaint raised — ${params.targetName}`,
    html: renderEmail({
      accent: "linear-gradient(135deg,#0f172a,#312e81)",
      eyebrow: "New complaint received",
      heading: params.targetName,
      rows,
      message: params.description,
      footer: "Log in to the admin panel to review and take action.",
      ctaUrl,
      ctaLabel
    }),
    text: renderText(`New complaint raised — ${params.targetName}`, rows, ctaUrl, ctaLabel, params.description)
  };
}

const STATUS_LABEL: Record<string, string> = {
  assigned: "Your complaint was assigned",
  resolved: "Your complaint was resolved",
  rejected: "Your complaint was rejected",
  replied: "Admin replied to your complaint"
};

const STATUS_ACCENT: Record<string, string> = {
  assigned: "linear-gradient(135deg,#0c4a6e,#0369a1)",
  resolved: "linear-gradient(135deg,#064e3b,#059669)",
  rejected: "linear-gradient(135deg,#7f1d1d,#e11d48)",
  replied: "linear-gradient(135deg,#1e3a8a,#2563eb)"
};

export function complaintStatusEmail(
  kind: "assigned" | "resolved" | "rejected" | "replied",
  params: { complaintId: string; targetName: string; issueType: string; message: string }
): EmailContent {
  const heading = STATUS_LABEL[kind];
  const rows: Row[] = [
    { label: "Complaint ID", value: params.complaintId },
    { label: "Location", value: params.targetName },
    { label: "Issue", value: params.issueType }
  ];
  // ?notify=1 tells the user panel to open the notification center on load
  // (see cesium_demo's notificationCenter.ts) so this update is front and center.
  const ctaUrl = `${USER_PANEL_URL}/?notify=1`;
  const ctaLabel = "Open in User Panel";
  return {
    subject: `Update on your complaint — ${params.targetName}`,
    html: renderEmail({
      accent: STATUS_ACCENT[kind],
      eyebrow: "Complaint update",
      heading,
      rows,
      message: params.message,
      footer: "Log in to the user panel to see the full activity timeline.",
      ctaUrl,
      ctaLabel
    }),
    text: renderText(heading, rows, ctaUrl, ctaLabel, params.message)
  };
}

export function announcementEmail(kind: "new" | "updated", params: { title: string; body: string; category: string }): EmailContent {
  const heading = kind === "updated" ? `Updated: ${params.title}` : params.title;
  const rows: Row[] = [{ label: "Category", value: params.category.replace(/_/g, " ") }];
  const ctaUrl = `${USER_PANEL_URL}/?notify=1`;
  const ctaLabel = "Open in User Panel";
  return {
    subject: kind === "updated" ? `Announcement updated — ${params.title}` : `Announcement — ${params.title}`,
    html: renderEmail({
      accent: "linear-gradient(135deg,#3730a3,#7c3aed)",
      eyebrow: kind === "updated" ? "Announcement updated" : "New announcement",
      heading,
      rows,
      message: params.body,
      footer: "This is a broadcast notice sent to everyone in the workspace.",
      ctaUrl,
      ctaLabel
    }),
    text: renderText(heading, rows, ctaUrl, ctaLabel, params.body)
  };
}

// Deployed frontend origins that email "open in panel" links point at.
// Overridable via env for local/staging; these are the production defaults.
export const ADMIN_PANEL_URL = (process.env.ADMIN_PANEL_URL || "https://threed-model11-admin.onrender.com").replace(/\/$/, "");
export const USER_PANEL_URL = (process.env.USER_PANEL_URL || "https://threed-model11.onrender.com").replace(/\/$/, "");

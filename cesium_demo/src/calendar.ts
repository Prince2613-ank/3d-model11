import { updateRoomAvailability } from "./rooms";
import { displayAllEventsInCard, refreshBookingPanelIfOpen } from "./ui";
import {
  initBookingEngine,
  setCurrentUser,
  stopPolling,
} from "./booking";
import type { GlobalEvent, UpdateContext } from "./booking";
import { ALLOWED_DOMAIN } from "./config";

declare const google: any;
declare const gapi: any;

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? "";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

let tokenClient: any = null;
let isAllowedDomain = false;
let isSignedIn = false;
let currentAccessToken: string | null = null;

const STORAGE_KEY = "cesium_google_auth";
let defaultAvatarHtml = "";

function getButton(): HTMLElement | null {
  return document.getElementById("userProfile") as HTMLElement | null;
}

function getAvatar(): HTMLElement | null {
  return document.getElementById("userAvatar") as HTMLElement | null;
}

function getUserMenu(): HTMLElement | null {
  return document.getElementById("userMenu") as HTMLElement | null;
}

function closeUserMenu(): void {
  const menu = getUserMenu();
  const button = getButton();
  if (menu) menu.hidden = true;
  button?.classList.remove("menu-open");
}

function toggleUserMenu(): void {
  const menu = getUserMenu();
  const button = getButton();
  if (!menu || !button) return;
  const nextOpen = Boolean(menu.hidden);
  menu.hidden = !nextOpen;
  button.classList.toggle("menu-open", nextOpen);
}

function initialsFromProfile(info: { email?: string; name?: string; given_name?: string; family_name?: string }): string {
  const first = info.given_name?.trim();
  const last = info.family_name?.trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();

  const nameParts = info.name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (nameParts.length >= 2) return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
  if (nameParts.length === 1) return nameParts[0].slice(0, 2).toUpperCase();

  const emailPrefix = info.email?.split("@")[0] ?? "";
  const emailParts = emailPrefix.split(/[._-]+/).filter(Boolean);
  if (emailParts.length >= 2) return `${emailParts[0][0]}${emailParts[1][0]}`.toUpperCase();
  return emailPrefix.slice(0, 2).toUpperCase() || "U";
}

function showSignedInAvatar(info: { email?: string; name?: string; given_name?: string; family_name?: string }): void {
  const avatar = getAvatar();
  if (!avatar) return;
  avatar.classList.remove("google-avatar");
  avatar.textContent = initialsFromProfile(info);
  avatar.title = info.name || info.email || "Signed in";
}

function showGoogleAvatar(): void {
  const avatar = getAvatar();
  if (!avatar) return;
  avatar.classList.add("google-avatar");
  avatar.innerHTML = defaultAvatarHtml;
  avatar.title = "Sign in with Google";
}

function setButtonState(state: "ready" | "loading" | "signed-in", label?: string): void {
  const btn = getButton();
  if (!btn) return;
  btn.classList.remove("btn-loading", "btn-signed-in");
  btn.title = "";

  if (state === "loading") {
    btn.style.opacity = "0.6";
    btn.style.pointerEvents = "none";
    btn.title = "Signing in…";
    btn.classList.add("btn-loading");
  } else if (state === "signed-in") {
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = label ?? "Signed in. Click to sign out";
    btn.classList.add("btn-signed-in");
  } else {
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = "Click to sign in with Google";
  }
}

function handleSignOut(): void {
  stopPolling();
  if (currentAccessToken) {
    google.accounts.oauth2.revoke(currentAccessToken, () => {});
    gapi.client.setToken(null);
  }
  isSignedIn = false;
  isAllowedDomain = false;
  currentAccessToken = null;
  localStorage.removeItem(STORAGE_KEY);

  const card = document.getElementById("roomDetailsCard");
  if (card) card.style.display = "none";

  closeUserMenu();
  showGoogleAvatar();
  setButtonState("ready");
}

function waitForGoogleApis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (typeof google !== "undefined" && typeof gapi !== "undefined") {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 10000) {
        window.clearInterval(timer);
        reject(new Error("Google API scripts did not load"));
      }
    }, 100);
  });
}

function loadGapi(): Promise<void> {
  return new Promise((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function onGlobalUpdate(events: GlobalEvent[], context: UpdateContext): void {
  updateRoomAvailability(events);
  refreshBookingPanelIfOpen(events);
  if (context.isInitialLoad || context.hasNewBookings) {
    displayAllEventsInCard(events, isAllowedDomain);
  }
}

async function verifyDomainAndLoad(accessToken: string): Promise<void> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = (await response.json()) as { email?: string; name?: string; given_name?: string; family_name?: string };
    const email = info.email ?? "";
    isAllowedDomain = email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

    if (!isAllowedDomain) {
      alert(`Access restricted to ${ALLOWED_DOMAIN} accounts only.\nSigned in as: ${email}`);
      google.accounts.oauth2.revoke(accessToken, () => {});
      gapi.client.setToken(null);
      setButtonState("ready");
      return;
    }

    isSignedIn = true;
    currentAccessToken = accessToken;
    setCurrentUser(email);
    showSignedInAvatar(info);
    setButtonState("signed-in", `✓ ${email.split("@")[0]}`);

    // Persist token for 1 hour (default Google token life)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: accessToken,
        email: email,
        expiresAt: Date.now() + 3500 * 1000,
      })
    );
  } catch (error) {
    console.error("Failed to verify user domain:", error);
    localStorage.removeItem(STORAGE_KEY);
    setButtonState("ready");
    return;
  }

  await initBookingEngine(onGlobalUpdate);
}

function initGoogleAuth(): void {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse: { access_token?: string; error?: string }) => {
      if (!tokenResponse.access_token) {
        setButtonState("ready");
        return;
      }
      gapi.client.setToken({ access_token: tokenResponse.access_token });
      void verifyDomainAndLoad(tokenResponse.access_token);
    },
    error_callback: (err: { type: string }) => {
      console.warn("Google auth cancelled:", err.type);
      setButtonState("ready");
    },
  });
}

export async function initializeCalendar(): Promise<void> {
  const button = document.getElementById("userProfile") as HTMLElement | null;
  if (!button) return;
  defaultAvatarHtml = getAvatar()?.innerHTML ?? "";

  if (!CLIENT_ID || !API_KEY) {
    button.style.pointerEvents = "none";
    button.style.opacity = "0.5";
    button.title = "Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY to enable Calendar";
    return;
  }

  try {
    await waitForGoogleApis();
    await loadGapi();
    initGoogleAuth();

    // Check for persisted session
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { token, expiresAt } = JSON.parse(stored);
        if (token && expiresAt > Date.now()) {
          console.log("[Auth] Restoring persisted session...");
          gapi.client.setToken({ access_token: token });
          void verifyDomainAndLoad(token);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    button.addEventListener("click", () => {
      if (isSignedIn) {
        toggleUserMenu();
        return;
      }
      setButtonState("loading");
      tokenClient?.requestAccessToken({ prompt: "consent" });
    });

    document.getElementById("logoutBtn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      handleSignOut();
    });

    document.addEventListener("click", (event) => {
      if (!button.contains(event.target as Node)) closeUserMenu();
    });
  } catch (error) {
    console.error("Google Calendar setup failed:", error);
    button.style.pointerEvents = "none";
    button.style.opacity = "0.5";
    button.setAttribute("aria-disabled", "true");
    button.title = "Calendar unavailable";
  }
}

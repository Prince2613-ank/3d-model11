import { updateRoomAvailability } from "./rooms";
import { displayAllEventsInCard, refreshBookingPanelIfOpen } from "./ui";
import {
  initBookingEngine,
  setCurrentUser,
  stopPolling,
} from "./booking";
import type { GlobalEvent, UpdateContext } from "./booking";
import { ALLOWED_DOMAIN } from "./config";
import { consumeFreshGoogleSignIn, onAuthChange, getGoogleAccessToken, signInWithGoogle, signOut, type CurrentUser } from "./auth";

declare const gapi: any;

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? "";

let isSignedIn = false;
let controlsBound = false;
let gapiReady: Promise<void> | null = null;
let calendarUserId: string | null = null;
let showLoginBookingSummary = false;

let defaultAvatarHtml = "";

function getGapiGlobal(): any {
  return (globalThis as any).gapi;
}

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

function showSignedInAvatar(info: { email?: string; name?: string; avatarUrl?: string | null }): void {
  const avatar = getAvatar();
  if (!avatar) return;
  if (info.avatarUrl) {
    const image = document.createElement("img");
    image.src = info.avatarUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      avatar.classList.add("google-avatar");
      avatar.innerHTML = defaultAvatarHtml;
    }, { once: true });
    avatar.classList.remove("google-avatar");
    avatar.replaceChildren(image);
  } else {
    avatar.classList.add("google-avatar");
    avatar.innerHTML = defaultAvatarHtml;
  }
  avatar.title = "Profile";
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
    btn.title = label ?? "Profile";
    btn.classList.add("btn-signed-in");
  } else {
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = "Click to sign in with Google";
  }
}

function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getGapiGlobal()?.load) { resolve(); return; }
    const id = "google-api-client";
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
        const initOptions: { apiKey?: string; discoveryDocs: string[] } = {
          discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        };
        if (API_KEY) initOptions.apiKey = API_KEY;
        await gapi.client.init(initOptions);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function ensureGapiReady(): Promise<void> {
  gapiReady ??= (async () => {
    await loadGapiScript();
    await loadGapiClient();
  })();
  await gapiReady;
}

function bindCalendarControls(button: HTMLElement): void {
  if (controlsBound) return;
  controlsBound = true;

  button.addEventListener("click", async () => {
    if (isSignedIn) {
      toggleUserMenu();
      return;
    }

    setButtonState("loading");
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setButtonState("ready");
    }
  });

  document.getElementById("logoutBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    void signOut();
  });
  document.addEventListener("click", (event) => {
    if (!button.contains(event.target as Node)) closeUserMenu();
  });
}

function onGlobalUpdate(events: GlobalEvent[], context: UpdateContext): void {
  updateRoomAvailability(events);
  refreshBookingPanelIfOpen(events);
  // The booking summary is a one-time sign-in experience. Polling continues to
  // refresh room availability and any open booking panel without reopening it.
  if (context.isInitialLoad && showLoginBookingSummary) {
    showLoginBookingSummary = false;
    displayAllEventsInCard(events, isSignedIn);
  }
}

async function handleSignedIn(user: CurrentUser): Promise<void> {
  const email = user.email;
  if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    alert(`Access restricted to ${ALLOWED_DOMAIN} accounts only.\nSigned in as: ${email}`);
    await signOut();
    return;
  }

  // The Supabase session is the source of truth for "signed in" — it drives the
  // avatar/menu/logout and complaint-form auth, and must not depend on the Google
  // Calendar token below. Supabase doesn't persist provider_token across page
  // reloads, so that token is routinely missing even on a perfectly valid,
  // already-logged-in session; treating its absence as "not signed in" was
  // forcing a fresh Google OAuth redirect on every reload instead of just
  // showing the logout menu.
  showSignedInAvatar({ email, name: user.name, avatarUrl: user.avatarUrl });
  isSignedIn = true;
  setCurrentUser(email);
  setButtonState("signed-in");
  const isFreshGoogleSignIn = consumeFreshGoogleSignIn();

  // Supabase can emit repeated auth notifications for the same session (for
  // example after token refresh). Do not restart the calendar engine, because
  // doing so turns the next poll into another initial load and reopens the card.
  if (calendarUserId === user.id) return;
  calendarUserId = user.id;
  showLoginBookingSummary = isFreshGoogleSignIn;

  try {
    await ensureGapiReady();
  } catch (error) {
    calendarUserId = null;
    console.error("Google Calendar setup failed:", error);
    return;
  }

  // Reuse the cached provider token on refresh. Never start an automatic Google
  // token request here because GIS may display its own OAuth popup.
  const googleToken = await getGoogleAccessToken();
  if (!googleToken) {
    calendarUserId = null;
    console.warn("[Calendar] No Google access token available; calendar features unavailable until reconnect.");
    return;
  }

  gapi.client.setToken({ access_token: googleToken });
  await initBookingEngine(onGlobalUpdate);
}

function handleSignedOut(): void {
  stopPolling();
  setCurrentUser(null);
  isSignedIn = false;
  calendarUserId = null;
  showLoginBookingSummary = false;

  const card = document.getElementById("roomDetailsCard");
  if (card) card.style.display = "none";

  closeUserMenu();
  showGoogleAvatar();
  setButtonState("ready");
}

export function initializeCalendar(): void {
  const button = document.getElementById("userProfile") as HTMLElement | null;
  if (!button) return;
  defaultAvatarHtml = getAvatar()?.innerHTML ?? "";
  bindCalendarControls(button);

  onAuthChange((user) => {
    if (user) void handleSignedIn(user);
    else handleSignedOut();
  });
}

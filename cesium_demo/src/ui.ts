import { Cesium, viewer } from "./viewer";
import { ChairModel, getPickedChair, highlightChair } from "./chairs";
import {
  CameraModel,
  getPickedCamera,
  enterCctvMode,
  exitCctvMode,
  setCctvHeading,
  setCctvPitch,
  isCctvActive,
  getCameraByName,
  ensureFloorModelLoaded,
  resetCctvDefaultView,
  getCctvDebugInfo,
} from "./models";
import { GlobalEvent, matchRoomName, showToast, cancelBooking, currentUserEmail } from "./booking";
import { BOOKABLE_ROOMS } from "./rooms";
import { FLOOR_CAMERAS } from "./config";

export type NavigationStep = {
  icon: string;
  title: string;
  primary?: string;
  text?: string;
};

export type NavigationSummary = {
  fromName: string;
  toName: string;
  totalDistance: number;
  totalTime: number;
  list: NavigationStep[];
};

type UiCallbacks = {
  showFloor: (floor: number) => void | Promise<void>;
  startNavigation: () => void | Promise<void>;
  exitNavigation: () => void;
};

type SceneCallbacks = {
  onRoomClick?: (roomName: string) => void;
};

let lastHoveredChair: ChairModel | null = null;

function optionalElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function setText(id: string, value: string): void {
  const node = optionalElement<HTMLElement>(id);
  if (node) node.innerText = value;
}

// ── Booking panel ─────────────────────────────────────────────────
function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function openBookingPanel(roomName: string, events: GlobalEvent[]): void {
  const panel = optionalElement<HTMLElement>("bookingPanel");
  if (!panel) return;

  panel.dataset.room = roomName;
  setText("roomTitle", roomName);

  const now = new Date();
  const upcomingToday = events.filter((e) => e.room === roomName && e.end >= now);

  const statusEl = optionalElement<HTMLElement>("roomStatus");
  if (statusEl) {
    statusEl.textContent = upcomingToday.length > 0 ? "OCCUPIED" : "AVAILABLE";
    statusEl.style.color = upcomingToday.length > 0 ? "#c62828" : "#2e7d32";
  }

  const listEl = optionalElement<HTMLElement>("roomBookingsList");
  if (listEl) {
    if (upcomingToday.length === 0) {
      listEl.innerHTML = `<p class="booking-empty">No upcoming bookings today</p>`;
    } else {
      const fmt = (d: Date): string =>
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      listEl.innerHTML = "";
      upcomingToday.forEach((e) => {
        const div = document.createElement("div");
        div.className = "booking-item";
        
        let cancelHtml = "";
        const prefix = currentUserEmail?.split("@")[0] ?? "";
        if (prefix === e.organizer) {
          cancelHtml = `<button type="button" class="btn cancel-btn" data-id="${e.id}" style="float:right; padding: 6px 12px; font-size: 0.9em; height: 32px; line-height: 1; background-color: #c62828;">Cancel</button>`;
        }
        
        div.innerHTML = `${cancelHtml}${fmt(e.start)}–${fmt(e.end)} · ${e.organizer} · ${e.title}`;
        
        const btn = div.querySelector(".cancel-btn") as HTMLButtonElement | null;
        if (btn) {
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            btn.textContent = "Cancelling...";
            const res = await cancelBooking(e.id);
            if (res.success) {
              showToast("Booking cancelled", "success");
              div.remove(); // Instantly remove the booking from the UI
            } else {
              showToast(res.error || "Failed to cancel", "error");
              btn.disabled = false;
              btn.textContent = "Cancel";
            }
          });
        }
        listEl.appendChild(div);
      });
    }
  }

  // Default start = next round 30-min slot, end = +1h
  const rounded = new Date(Math.ceil(now.getTime() / (30 * 60000)) * 30 * 60000);
  const roundedEnd = new Date(rounded.getTime() + 60 * 60000);
  const startInput = optionalElement<HTMLInputElement>("bookStart");
  const endInput = optionalElement<HTMLInputElement>("bookEnd");
  if (startInput) startInput.value = toTimeInput(rounded);
  if (endInput) endInput.value = toTimeInput(roundedEnd);

  const bookBtn = optionalElement<HTMLButtonElement>("bookBtn");
  if (bookBtn) {
    if (upcomingToday.length > 0) {
      bookBtn.disabled = true;
      bookBtn.title = "Room is currently occupied or booked";
      bookBtn.style.opacity = "0.5";
      bookBtn.style.cursor = "not-allowed";
    } else {
      bookBtn.disabled = false;
      bookBtn.title = "";
      bookBtn.style.opacity = "1";
      bookBtn.style.cursor = "pointer";
    }
  }

  panel.style.display = "block";
}

export function closeBookingPanel(): void {
  const panel = optionalElement<HTMLElement>("bookingPanel");
  if (panel) panel.style.display = "none";
}

export function getBookingPanelRoom(): string | null {
  return optionalElement<HTMLElement>("bookingPanel")?.dataset.room ?? null;
}

export function refreshBookingPanelIfOpen(events: GlobalEvent[]): void {
  const roomName = getBookingPanelRoom();
  const panel = optionalElement<HTMLElement>("bookingPanel");
  if (roomName && panel && panel.style.display === "block") {
    openBookingPanel(roomName, events);
  }
}

export function getBookingTimes(): { start: Date; end: Date } | null {
  const startInput = optionalElement<HTMLInputElement>("bookStart");
  const endInput = optionalElement<HTMLInputElement>("bookEnd");
  if (!startInput?.value || !endInput?.value) return null;

  const today = new Date();
  const [sh, sm] = startInput.value.split(":").map(Number);
  const [eh, em] = endInput.value.split(":").map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em);
  return { start, end };
}

// ── Events card ───────────────────────────────────────────────────
export function displayAllEventsInCard(events: GlobalEvent[], showAllBookings = false): void {
  const card = optionalElement<HTMLElement>("roomDetailsCard");
  const cardContent = optionalElement<HTMLElement>("cardContent");
  if (!card || !cardContent) return;

  const now = new Date();
  const fmt = (d: Date): string =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const sorted = (showAllBookings ? [...events] : events.filter((e) => e.end >= now)).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  if (sorted.length === 0) {
    cardContent.innerHTML = showAllBookings
      ? "<p>No bookings today.</p>"
      : "<p>No ongoing or upcoming meetings.</p>";
    card.style.display = "block";

    if (showAllBookings) setTimeout(() => { card.style.display = "none"; }, 6000);
    return;
  }

  const header = showAllBookings
    ? `<h4 class="card-header-title">All Today's Bookings</h4>`
    : "";

  cardContent.innerHTML =
    header +
    sorted
      .map((e) => {
        const isPast = e.end < now;
        return `
        <div class="meeting-card${isPast ? " meeting-past" : ""}">
          <b>${e.room}</b>${isPast ? ' <span class="past-badge">past</span>' : ""}<br/>
          <b>Meeting:</b> ${e.title}<br/>
          <b>By:</b> ${e.organizer}<br/>
          <b>Time:</b> ${fmt(e.start)} – ${fmt(e.end)}
        </div>`;
      })
      .join("");

  card.style.display = "block";
  if (showAllBookings) setTimeout(() => { card.style.display = "none"; }, 6000);
}

// ── Nav UI ────────────────────────────────────────────────────────
const FLOOR_SPINNER_MIN_MS = 2500;
let floorSwitchInProgress = false;
let navigationAllowedFloors: Set<number> | null = null;
let loadingMessageTimer: number | null = null;
let loadingOverlayDepth = 0;
let cameraControlsLocked = false;
let cameraViewWarningShownAt = 0;

function showExitCameraViewToast(): void {
  const now = Date.now();
  if (now - cameraViewWarningShownAt < 1500) return;
  cameraViewWarningShownAt = now;
  showToast("Exit camera view first to use this.", "error");
}

function getFloorButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("[data-floor]"));
}

function applyFloorButtonAvailability(): void {
  getFloorButtons().forEach((button) => {
    const floor = Number(button.dataset.floor ?? "0");
    button.disabled = isCctvActive() || floorSwitchInProgress || Boolean(navigationAllowedFloors && !navigationAllowedFloors.has(floor));
    button.classList.toggle(
      "floor-route-active",
      Boolean(navigationAllowedFloors && navigationAllowedFloors.has(floor))
    );
  });
}

export function setNavigationAllowedFloors(floors: number[] | null): void {
  navigationAllowedFloors = floors ? new Set(floors) : null;
  const exitButton = optionalElement<HTMLButtonElement>("exitNavBtn");
  if (exitButton) exitButton.hidden = !floors;
  applyFloorButtonAvailability();
}

export function disableCameraControls(): void {
  cameraControlsLocked = true;
  const panel = optionalElement<HTMLElement>("cameraPanel");
  const buttons = document.querySelectorAll("#cameraButtons button");
  if (panel) panel.style.display = "none";
  if (panel) panel.style.pointerEvents = "none";
  if (panel) panel.style.opacity = "0.5";
  buttons.forEach((btn) => {
    const button = btn as HTMLButtonElement;
    button.disabled = true;
  });
}

export function enableCameraControls(): void {
  cameraControlsLocked = false;
  const panel = optionalElement<HTMLElement>("cameraPanel");
  const buttons = document.querySelectorAll("#cameraButtons button");
  if (panel) panel.style.pointerEvents = "auto";
  if (panel) panel.style.opacity = "1";
  buttons.forEach((btn) => {
    const button = btn as HTMLButtonElement;
    button.disabled = false;
  });
}

function setCameraViewControlsLocked(locked: boolean): void {
  document.body.classList.toggle("camera-view-active", locked);
  document.body.classList.remove("side-panel-open");

  const hamburger = optionalElement<HTMLButtonElement>("hamburgerMenu");
  if (hamburger) {
    hamburger.disabled = locked;
    hamburger.classList.remove("open");
    hamburger.title = locked ? "Exit camera view first" : "Toggle Controls";
    hamburger.setAttribute("aria-disabled", String(locked));
  }

  applyFloorButtonAvailability();
}

export function showFloorSpinner(text = "Loading floor…"): void {
  loadingOverlayDepth += 1;
  const overlay = document.getElementById("floorLoadingOverlay");
  const label = overlay?.querySelector<HTMLElement>(".floor-loading-text");
  if (label) label.textContent = text;
  overlay?.classList.add("active");
  disableInteractiveControlsDuringLoad();
  if (loadingMessageTimer !== null) window.clearInterval(loadingMessageTimer);
  if (!label) return;

  const messages = [
    text,
    "Loading floor model…",
    "Optimizing view…"
  ];
  let messageIndex = 0;
  loadingMessageTimer = window.setInterval(() => {
    messageIndex = (messageIndex + 1) % messages.length;
    label.textContent = messages[messageIndex];
  }, 900);
}

function showFloorSpinnerMessageOnce(text: string): void {
  if (loadingMessageTimer !== null) {
    window.clearInterval(loadingMessageTimer);
    loadingMessageTimer = null;
  }

  const label = document
    .getElementById("floorLoadingOverlay")
    ?.querySelector<HTMLElement>(".floor-loading-text");
  if (label) label.textContent = text;
}

export function hideFloorSpinner(): void {
  loadingOverlayDepth = Math.max(0, loadingOverlayDepth - 1);
  if (loadingOverlayDepth > 0) return;

  if (loadingMessageTimer !== null) {
    window.clearInterval(loadingMessageTimer);
    loadingMessageTimer = null;
  }
  document.getElementById("floorLoadingOverlay")?.classList.remove("active");
  restoreInteractiveControlsAfterLoad();
}

// Disable interactive controls across the UI during loading overlay.
function disableInteractiveControlsDuringLoad(): void {
  document.body.classList.add("floor-loading-active");
  const overlay = document.getElementById("floorLoadingOverlay");
  const selector = "button,input,select,textarea,a[href],[role=button]";
  const controls = Array.from(document.querySelectorAll<HTMLElement>(selector));
  controls.forEach((el) => {
    if (overlay && overlay.contains(el)) return; // don't disable overlay internals
    try {
      // Keep the original state if the loader is shown more than once in a transition.
      if ((el as any).dataset.prevDisabled === undefined) {
        const prev = (el as HTMLButtonElement).disabled ? "1" : "0";
        (el as any).dataset.prevDisabled = prev;
      }
      if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled = true;
      } else {
        el.setAttribute("aria-disabled", "true");
      }
    } catch (e) {
      // ignore
    }
  });
}

function restoreInteractiveControlsAfterLoad(): void {
  document.body.classList.remove("floor-loading-active");
  const selector = "button,input,select,textarea,a[href],[role=button]";
  const controls = Array.from(document.querySelectorAll<HTMLElement>(selector));
  controls.forEach((el) => {
    try {
      const prev = (el as any).dataset.prevDisabled;
      if (prev !== undefined) {
        if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled = prev === "1";
        } else {
          el.removeAttribute("aria-disabled");
        }
        delete (el as any).dataset.prevDisabled;
      }
    } catch (e) {
      // ignore
    }
  });
}

function flyToPromise(options: any): Promise<void> {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      ...options,
      complete: resolve,
      cancel: resolve,
    });
  });
}

export function flyToDefaultFloorView(duration = 1.15): Promise<void> {
  return flyToPromise({
    destination: Cesium.Cartesian3.fromDegrees(77.133674, 28.670812, 48.08),
    orientation: {
      heading: Cesium.Math.toRadians(1.89),
      pitch: Cesium.Math.toRadians(-67.75),
      roll: 0,
    },
    duration,
    easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
  });
}

async function performWindowAnimation(floor: number): Promise<void> {
  const heightByFloor: Record<number, number> = {
    1: 1.2,
    2: 4.2,
    3: 7.8,
    4: 11.4,
  };

  const zHeight = heightByFloor[floor] ?? 7.8;

  await flyToPromise({
    destination: Cesium.Cartesian3.fromDegrees(77.133558, 28.670441, 25.51),
    orientation: {
      heading: Cesium.Math.toRadians(359.35),
      pitch: Cesium.Math.toRadians(-21.87),
      roll: 0,
    },
    duration: 1.35,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });

  await flyToPromise({
    destination: Cesium.Cartesian3.fromDegrees(77.133558, 28.67085, zHeight),
    orientation: {
      heading: Cesium.Math.toRadians(359.35),
      pitch: Cesium.Math.toRadians(-4.5),
      roll: 0,
    },
    duration: 1.05,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });

  showFloorSpinner("Preparing Workspace…");

  await new Promise<void>((resolve) => setTimeout(resolve, 450));

  await flyToDefaultFloorView();
}

export function bindUiControls(callbacks: UiCallbacks): void {
  const floorButtons = getFloorButtons();

  floorButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (isCctvActive()) {
        showExitCameraViewToast();
        return;
      }

      // Guard: ignore clicks while a switch is already in progress
      if (floorSwitchInProgress) return;

      const floor = Number(button.dataset.floor ?? "0");
      if (button.disabled) return;

      const floorName = button.textContent?.replace("Show ", "") ?? "floor";
      const label = floor === 0
        ? "Loading all floors…"
        : `Loading ${floorName}…`;
      const welcomeLabel = floor === 0
        ? "Welcome to all floors"
        : `Welcome to ${floorName}`;

      floorSwitchInProgress = true;
      applyFloorButtonAvailability();

      const doTransition = async () => {
        try {
          if (floor !== 0) {
            void callbacks.showFloor(0);
            await performWindowAnimation(floor);

            showFloorSpinner(label);

            const loadPromise = Promise.resolve(callbacks.showFloor(floor));
            const minDelay = new Promise<void>((resolve) => setTimeout(resolve, FLOOR_SPINNER_MIN_MS));

            await Promise.allSettled([loadPromise, minDelay]);
            showFloorSpinnerMessageOnce(welcomeLabel);
            await new Promise<void>((resolve) => setTimeout(resolve, 550));
            hideFloorSpinner();
          } else {
            await flyToPromise({
              destination: Cesium.Cartesian3.fromDegrees(77.133558, 28.670441, 25.51),
              orientation: {
                heading: Cesium.Math.toRadians(359.35),
                pitch: Cesium.Math.toRadians(-21.87),
                roll: 0,
              },
              duration: 1.5,
              easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
            });

            await Promise.resolve(callbacks.showFloor(0));
          }
        } finally {
          hideFloorSpinner();
          floorSwitchInProgress = false;
          applyFloorButtonAvailability();
        }
      };

      void doTransition();
    });
  });

  optionalElement<HTMLButtonElement>("startNavBtn")?.addEventListener("click", () => {
    if (isCctvActive()) {
      showExitCameraViewToast();
      return;
    }

    void callbacks.startNavigation();
  });

  optionalElement<HTMLButtonElement>("exitNavBtn")?.addEventListener("click", () => {
    callbacks.exitNavigation();
  });

  optionalElement<HTMLButtonElement>("swapRoomsBtn")?.addEventListener("click", () => {
    const fromRoom = element<HTMLSelectElement>("fromRoom");
    const toRoom = element<HTMLSelectElement>("toRoom");
    const fromValue = fromRoom.value;
    fromRoom.value = toRoom.value;
    toRoom.value = fromValue;
  });

  optionalElement<HTMLButtonElement>("chairCloseBtn")?.addEventListener("click", closeChairPopup);
  optionalElement<HTMLButtonElement>("panelCloseBtn")?.addEventListener("click", closeBookingPanel);
}

export function populateRoomDropdowns(names: string[]): void {
  const options = names.map((name) => `<option>${name}</option>`).join("");
  element<HTMLSelectElement>("fromRoom").innerHTML = options;
  element<HTMLSelectElement>("toRoom").innerHTML = options;
}

export function updateNavigationUI(summary: NavigationSummary): void {
  setText("fromNameDisplay", summary.fromName);
  setText("toNameDisplay", summary.toName);

  element<HTMLElement>("navSummary").innerHTML = `Walk ${summary.totalDistance} m &nbsp; ${summary.totalTime} min`;
  element<HTMLElement>("navSteps").innerHTML = summary.list
    .map(
      (step) => `
        <div class="nav-step">
          <div class="step-icon">${step.icon}</div>
          <div class="step-details">
            <div class="step-title">${step.title}</div>
            ${step.primary ? `<div class="step-box">${step.primary}</div>` : `<div class="step-text">${step.text ?? ""}</div>`}
          </div>
        </div>`
    )
    .join("");
}

export function setNavigationMessage(message: string, clearSteps = true): void {
  setText("navSummary", message);
  if (clearSteps) {
    element<HTMLElement>("navSteps").innerHTML = "";
  }
}

// ── Tooltip ───────────────────────────────────────────────────────
function showTooltip(html: string, x: number, y: number): void {
  const tooltip = element<HTMLElement>("tooltip");
  tooltip.innerHTML = html;
  tooltip.style.left = `${x + 15}px`;
  tooltip.style.top = `${y + 15}px`;
  tooltip.style.display = "block";
}

function hideTooltip(): void {
  const tooltip = optionalElement<HTMLElement>("tooltip");
  if (tooltip) tooltip.style.display = "none";
}

// ── Chair popup ───────────────────────────────────────────────────
function showChairPopup(chair: ChairModel, selectedFloor: number): void {
  const rawName = chair.chairName || "Unknown";
  const isUnknown = rawName.toLowerCase().startsWith("unknown");
  setText("chairUser", rawName);
  setText("chairId", `CHAIR-${chair.chairIndex ?? "?"}`);
  setText(
    "chairFloor",
    selectedFloor === 4 ? "3rd Floor" : selectedFloor === 3 ? "2nd Floor" : "Unknown"
  );
  
  setText("chairStatus", isUnknown ? "Available" : "Occupied");
  const statusEl = optionalElement<HTMLElement>("chairStatus");
  if (statusEl) {
    statusEl.style.color = isUnknown ? "#2e7d32" : "#c62828";
  }
  
  element<HTMLElement>("chairPopup").style.display = "block";
}

function closeChairPopup(): void {
  element<HTMLElement>("chairPopup").style.display = "none";
}

// ── CCTV panel ────────────────────────────────────────────────────
function cameraTooltipHtml(camera: CameraModel): string {
  return `
    <b>CCTV Camera - ${camera.cameraName ?? "Unknown"}</b><br/>
    <b>Floor:</b> 3rd Floor<br/>
    <b>Height:</b> ${camera.cameraConfig.height.toFixed(1)} m<br/>
    <b>Heading:</b> ${camera.cameraConfig.heading}&deg;<br/>
    <b>Pitch:</b> ${camera.cameraConfig.pitch}&deg;<br/>
    Click to open camera view
  `;
}

function bindHoldButton(button: HTMLElement, onTick: () => void): void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const start = (): void => {
    if (intervalId !== null) return;
    onTick();
    intervalId = setInterval(onTick, 16);
  };
  const stop = (): void => {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
  };
  button.addEventListener("mousedown", start);
  button.addEventListener("mouseup", stop);
  button.addEventListener("mouseleave", stop);
  button.addEventListener("touchstart", (e) => { e.preventDefault(); start(); }, { passive: false });
  button.addEventListener("touchend", stop);
  button.addEventListener("touchcancel", stop);
}

export function showCctvPanel(heading: number, pitch: number): void {
  const panel = optionalElement<HTMLElement>("cctvPanel");
  if (panel) panel.style.display = "block";
  setText("cctvHeadingDisplay", `${Math.round(heading)}°`);
  setText("cctvPitchDisplay", `${Math.round(pitch)}°`);
}

export function hideCctvPanel(): void {
  const panel = optionalElement<HTMLElement>("cctvPanel");
  if (panel) panel.style.display = "none";
  setCameraViewControlsLocked(false);
}

function updateCctvDebugInfo(): void {
  const info = getCctvDebugInfo();
  if (!info) return;

  const posText = `${info.position.lon.toFixed(6)}, ${info.position.lat.toFixed(6)}, ${info.position.height.toFixed(2)}`;
  const dirText = `${info.direction} (${Math.round(info.heading)}°, ${Math.round(info.pitch)}°)`;

  setText("cctvHeadingDisplay", `${Math.round(info.heading)}°`);
  setText("cctvPitchDisplay", `${Math.round(info.pitch)}°`);
  setText("cctvPosDisplay", posText);
  setText("cctvDirDisplay", dirText);
  setText("cctvZoomDisplay", `${Math.round(info.fov)}°`);
}

export function bindCctvPanel(): void {
  const leftBtn = optionalElement<HTMLButtonElement>("cctvLeft");
  const rightBtn = optionalElement<HTMLButtonElement>("cctvRight");
  const upBtn = optionalElement<HTMLButtonElement>("cctvUp");
  const downBtn = optionalElement<HTMLButtonElement>("cctvDown");
  const defaultBtn = optionalElement<HTMLButtonElement>("cctvDefault");
  const exitBtn = optionalElement<HTMLButtonElement>("cctvExit");
  if (!leftBtn || !rightBtn || !upBtn || !downBtn || !defaultBtn || !exitBtn) return;

  bindHoldButton(leftBtn, () => setCctvHeading(-0.6));
  bindHoldButton(rightBtn, () => setCctvHeading(0.6));
  bindHoldButton(upBtn, () => setCctvPitch(0.5));
  bindHoldButton(downBtn, () => setCctvPitch(-0.5));
  defaultBtn.addEventListener("click", resetCctvDefaultView);
  viewer.scene.preRender.addEventListener(updateCctvDebugInfo);

  exitBtn.addEventListener("click", () => {
    exitCctvMode();
    hideCctvPanel();
  });
}

// ── Camera presets ────────────────────────────────────────────────
export function openCameraView(camera: CameraModel): void {
  enterCctvMode(camera.cameraConfig, (h, p) => {
    setText("cctvHeadingDisplay", `${Math.round(h)}°`);
    setText("cctvPitchDisplay", `${Math.round(p)}°`);
  }, camera);
  setCameraViewControlsLocked(true);
  showCctvPanel(camera.cameraConfig.heading, camera.cameraConfig.pitch);

  // Sync UI highlight
  const container = document.getElementById("cameraButtons");
  if (container) {
    container.querySelectorAll(".btn").forEach((b: any) => {
      const isActive = b.textContent === camera.cameraName || camera.cameraName?.includes(b.textContent);
      b.style.background = isActive ? "#1a3ea8" : "";
      b.style.color = isActive ? "#fff" : "";
    });
  }
}

export function renderCameraControls(floor: number): void {
  const panel = document.getElementById("cameraPanel");
  const container = document.getElementById("cameraButtons");
  if (!panel || !container) return;

  const cameras = (FLOOR_CAMERAS[floor] || []).filter((camera) => camera.showInControls !== false);

  if (cameras.length === 0) {
    panel.style.display = "none";
    return;
  }

  container.innerHTML = "";
  cameras.forEach((cam) => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.textContent = cam.name;
    btn.disabled = cameraControlsLocked;
    btn.onclick = async () => {
      if (cameraControlsLocked) return;
      btn.disabled = true;
      try {
        await ensureFloorModelLoaded(floor);
        const model = getCameraByName(cam.name, floor);
        if (model) {
          openCameraView(model);
        } else {
          // Fallback to static config if model not found
          viewer.camera.setView({
            destination: cam.destination,
            orientation: cam.orientation,
          });
        }
      } finally {
        btn.disabled = false;
      }
    };
    container.appendChild(btn);
  });

  panel.style.display = cameraControlsLocked ? "none" : "block";
  panel.style.pointerEvents = cameraControlsLocked ? "none" : "auto";
  panel.style.opacity = cameraControlsLocked ? "0.5" : "1";
}



// ── Scene interactions ────────────────────────────────────────────
export function installSceneInteractions(
  getSelectedFloor: () => number,
  sceneCallbacks: SceneCallbacks = {}
): void {
  const warnIfCctvAction = (event?: Event): void => {
    if (!isCctvActive()) return;
    event?.preventDefault();
    event?.stopPropagation();
    showExitCameraViewToast();
  };

  const canvas = viewer.scene.canvas;
  canvas.addEventListener("pointerdown", warnIfCctvAction, { capture: true });
  canvas.addEventListener("touchstart", warnIfCctvAction, { capture: true, passive: false });
  canvas.addEventListener("wheel", warnIfCctvAction, { capture: true, passive: false });
  canvas.addEventListener("dblclick", warnIfCctvAction, { capture: true });
  canvas.addEventListener("contextmenu", warnIfCctvAction, { capture: true });
  canvas.addEventListener("pointermove", (event: PointerEvent) => {
    if (event.buttons) warnIfCctvAction(event);
  }, { capture: true });

  viewer.screenSpaceEventHandler.setInputAction(() => {
    if (isCctvActive()) showExitCameraViewToast();
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  viewer.screenSpaceEventHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    if (isCctvActive()) {
      showExitCameraViewToast();
      return;
    }

    const camera = getPickedCamera(click.position);
    if (camera) {
      openCameraView(camera);
      return;
    }


    const chair = getPickedChair(click.position);
    if (chair) {
      showChairPopup(chair, getSelectedFloor());
      return;
    }

    // Room polygon click → open booking panel
    const picked = viewer.scene.pick(click.position);
    const entity = picked?.id as Cesium.Entity | undefined;
    if (entity?.polygon) {
      const rawName = (entity.properties as any)?.room_name?.getValue?.() as string | undefined;
      if (rawName) {
        const roomName = matchRoomName(rawName);
        if (roomName && BOOKABLE_ROOMS.has(rawName.toLowerCase().trim())) {
          sceneCallbacks.onRoomClick?.(roomName);
        }
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  viewer.screenSpaceEventHandler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
    if (lastHoveredChair) {
      highlightChair(lastHoveredChair);
      lastHoveredChair = null;
    }

    const chair = getPickedChair(movement.endPosition);
    if (chair) {
      lastHoveredChair = chair;
      highlightChair(chair, Cesium.Color.BLUE);
      viewer.scene.canvas.style.cursor = "pointer";
      hideTooltip();
      viewer.scene.requestRender();
      return;
    }

    const camera = getPickedCamera(movement.endPosition);
    if (camera) {
      viewer.scene.canvas.style.cursor = "pointer";
      showTooltip(cameraTooltipHtml(camera), movement.endPosition.x, movement.endPosition.y);
      viewer.scene.requestRender();
      return;
    }

    viewer.scene.canvas.style.cursor = "default";
    const picked = viewer.scene.pick(movement.endPosition);
    const entity = picked?.id as Cesium.Entity | undefined;
    if (!entity?.polygon) { hideTooltip(); return; }

    let html = "";
    const description = entity.description;
    if (typeof description === "string") {
      html = description;
    } else if (description && typeof description.getValue === "function") {
      html = description.getValue(viewer.clock.currentTime) ?? "";
    }
    if (!html) { hideTooltip(); return; }
    showTooltip(html, movement.endPosition.x, movement.endPosition.y);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

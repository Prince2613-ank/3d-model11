import { Cesium, viewer } from "./viewer";
import { isCctvActive, moveCctvHeight, setCctvHeading, setCctvPitch } from "./models";

type CameraView = { longitude: number; latitude: number; altitude: number; heading: number; pitch: number; roll: number };
type CameraBounds = { west: number; east: number; south: number; north: number };

const VIEW_STORAGE_KEY = "cesium-camera-debug-default-view";
const BOUNDS_STORAGE_KEY = "cesium-camera-debug-bounds";

function fallbackView(isMobile: boolean): CameraView {
  return { longitude: isMobile ? 77.133683 : 77.133783, latitude: 28.670903, altitude: isMobile ? 95 : 81.51, heading: 342.04, pitch: -84.94, roll: 0 };
}

function readStored<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}
function save(key: string, value: unknown): void { localStorage.setItem(key, JSON.stringify(value)); }

export function getCameraDebugDefaultView(isMobile: boolean): CameraView {
  return { ...fallbackView(isMobile), ...readStored<Partial<CameraView>>(VIEW_STORAGE_KEY) };
}

function applyView(view: CameraView): void {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(view.longitude, view.latitude, Math.max(0.5, view.altitude)),
    orientation: { heading: Cesium.Math.toRadians(view.heading), pitch: Cesium.Math.toRadians(view.pitch), roll: Cesium.Math.toRadians(view.roll) },
  });
  viewer.scene.requestRender();
}

let debugCardOpen = false;

/** True while the Camera Debug card is open — lets other modules bypass the CCTV click-lock and enable mouse-drag look tuning. */
export function isCameraDebugOpen(): boolean {
  return debugCardOpen;
}

export function installCameraDebug(): void {
  if (document.getElementById("cameraDebugCard")) return;
  const current = getCameraDebugDefaultView(window.innerWidth < 768);
  const bounds = { west: 77.1325, east: 77.1350, south: 28.6697, north: 28.6722, ...readStored<Partial<CameraBounds>>(BOUNDS_STORAGE_KEY) };
  const card = document.createElement("aside");
  card.id = "cameraDebugCard";
  card.className = "camera-debug-card";
  card.hidden = true;
  card.innerHTML = `
    <header><strong>Camera Debug</strong><button type="button" data-camera-debug="close" aria-label="Close camera debug">×</button></header>
    <p class="camera-debug-note">Live camera position and movement boundary tuner.</p>
    <div class="camera-debug-live">
      <span>Longitude <output data-live="longitude">—</output></span><span>Latitude <output data-live="latitude">—</output></span>
      <span>Altitude <output data-live="altitude">—</output></span><span>Heading <output data-live="heading">—</output></span>
      <span>Pitch <output data-live="pitch">—</output></span><span>Roll <output data-live="roll">—</output></span>
    </div>
    <div class="camera-debug-nudge" aria-label="Camera position controls">
      <span>Move camera</span><button type="button" data-camera-debug="move-up" aria-label="Move up">↑</button>
      <button type="button" data-camera-debug="move-left" aria-label="Move left">←</button><button type="button" data-camera-debug="move-down" aria-label="Move down">↓</button><button type="button" data-camera-debug="move-right" aria-label="Move right">→</button>
    </div>
    <div class="camera-debug-nudge camera-debug-nudge-height" aria-label="Camera height controls">
      <span>Height</span>
      <button type="button" data-camera-debug="height-down" aria-label="Sit down (lower in place)">Sit down</button>
      <button type="button" data-camera-debug="height-up" aria-label="Stand up (raise in place)">Stand up</button>
    </div>
    <details open><summary>Default view</summary><div class="camera-debug-grid" data-group="view">
      <label>Longitude<input name="longitude" type="number" step="0.000001" value="${current.longitude}"></label>
      <label>Latitude<input name="latitude" type="number" step="0.000001" value="${current.latitude}"></label>
      <label>Altitude (m)<input name="altitude" type="number" step="0.1" value="${current.altitude}"></label>
      <label>Heading °<input name="heading" type="number" step="0.01" value="${current.heading}"></label>
      <label>Pitch °<input name="pitch" type="number" step="0.01" value="${current.pitch}"></label>
      <label>Roll °<input name="roll" type="number" step="0.01" value="${current.roll}"></label>
    </div><div class="camera-debug-actions"><button type="button" data-camera-debug="apply">Apply & save default</button><button type="button" data-camera-debug="capture">Use current view</button></div></details>
    <details><summary>Movement limits</summary><p class="camera-debug-note">Camera location is clamped inside these geographic edges.</p><div class="camera-debug-grid" data-group="bounds">
      <label>West / left<input name="west" type="number" step="0.000001" value="${bounds.west}"></label>
      <label>East / right<input name="east" type="number" step="0.000001" value="${bounds.east}"></label>
      <label>South / down<input name="south" type="number" step="0.000001" value="${bounds.south}"></label>
      <label>North / up<input name="north" type="number" step="0.000001" value="${bounds.north}"></label>
    </div><div class="camera-debug-actions"><button type="button" data-camera-debug="limits">Save limits</button><button type="button" data-camera-debug="limits-off">Disable limits</button></div></details>`;
  document.body.append(card);
  const opener = document.createElement("button");
  opener.id = "cameraDebugOpenBtn"; opener.className = "camera-debug-open-btn"; opener.type = "button"; opener.textContent = "Camera Debug";
  document.body.append(opener);
  const readNumbers = <T extends Record<string, number>>(group: string): T => Object.fromEntries([...card.querySelectorAll<HTMLInputElement>(`[data-group="${group}"] input`)].map(input => [input.name, Number(input.value)])) as T;
  const writeView = (view: CameraView, skipFocused = false): void => Object.entries(view).forEach(([key, value]) => {
    const input = card.querySelector<HTMLInputElement>(`[data-group="view"] [name="${key}"]`);
    if (input && !(skipFocused && document.activeElement === input)) input.value = String(value);
  });
  const live = (): CameraView => {
    const position = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
    return { longitude: Cesium.Math.toDegrees(position.longitude), latitude: Cesium.Math.toDegrees(position.latitude), altitude: position.height, heading: Cesium.Math.toDegrees(viewer.camera.heading), pitch: Cesium.Math.toDegrees(viewer.camera.pitch), roll: Cesium.Math.toDegrees(viewer.camera.roll) };
  };
  const refresh = (): void => {
    const value = live();
    Object.entries(value).forEach(([key, number]) => { const output = card.querySelector<HTMLOutputElement>(`[data-live="${key}"]`); if (output) output.value = `${number.toFixed(key === "altitude" ? 2 : 6)}${["heading", "pitch", "roll"].includes(key) ? "°" : ""}`; });
    writeView(value, true);
  };
  let limitEnabled = true;
  let clamping = false;
  viewer.scene.preRender.addEventListener(() => {
    if (limitEnabled && !clamping) {
      const position = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
      const longitude = Cesium.Math.toDegrees(position.longitude), latitude = Cesium.Math.toDegrees(position.latitude);
      if (longitude < bounds.west || longitude > bounds.east || latitude < bounds.south || latitude > bounds.north) {
        clamping = true;
        applyView({ ...live(), longitude: Cesium.Math.clamp(longitude, bounds.west, bounds.east), latitude: Cesium.Math.clamp(latitude, bounds.south, bounds.north) });
        clamping = false;
      }
    }
    refresh();
  });
  const setOpen = (open: boolean): void => {
    card.hidden = !open;
    debugCardOpen = open;
  };
  opener.addEventListener("click", () => { setOpen(Boolean(card.hidden)); });
  card.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-camera-debug]")?.dataset.cameraDebug;
    if (!action) return;
    if (action === "close") setOpen(false);
    if (action === "apply") { const view = readNumbers<CameraView>("view"); applyView(view); save(VIEW_STORAGE_KEY, view); }
    if (action === "capture") writeView(live());
    if (action.startsWith("move-")) {
      const direction = action.replace("move-", "");
      if (isCctvActive()) {
        // Camera stays put; only the look angle changes.
        if (direction === "left") setCctvHeading(-1.5);
        if (direction === "right") setCctvHeading(1.5);
        if (direction === "up") setCctvPitch(1);
        if (direction === "down") setCctvPitch(-1);
      } else {
        const horizontal = direction === "left" ? -0.25 : direction === "right" ? 0.25 : 0;
        const vertical = direction === "up" ? 0.25 : direction === "down" ? -0.25 : 0;
        viewer.camera.moveRight(horizontal), viewer.camera.moveUp(vertical);
      }
      viewer.scene.requestRender();
    }
    if (action === "height-up" || action === "height-down") {
      const deltaMeters = action === "height-up" ? 0.25 : -0.25;
      if (isCctvActive()) moveCctvHeight(deltaMeters);
      else {
        const normal = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(viewer.camera.position, new Cesium.Cartesian3());
        viewer.camera.move(normal, deltaMeters);
      }
      viewer.scene.requestRender();
    }
    if (action === "limits") { const next = readNumbers<CameraBounds>("bounds"); if (next.west >= next.east || next.south >= next.north) { alert("West must be less than East, and South less than North."); return; } Object.assign(bounds, next); limitEnabled = true; save(BOUNDS_STORAGE_KEY, bounds); }
    if (action === "limits-off") limitEnabled = false;
  });
  refresh();
}

import { Cesium, viewer } from "./viewer";
import type { ChairModel } from "./chairs";
import { api, AssetDTO, ApiError } from "./api";
import { chairObjectKey } from "./assetStatus";
import { openComplaintForm } from "./complaintForm";

let activeChair: ChairModel | null = null;
let activeFloor: 3 | 4 = 3;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

function statusLabel(status: AssetDTO["live_status"]): string {
  switch (status) {
    case "pending": return "Pending — issue reported";
    case "assigned": return "Assigned — being fixed";
    case "resolved": return "Resolved";
    default: return "OK";
  }
}

export function closeAssetPopup(): void {
  el<HTMLElement>("assetPopup").hidden = true;
  activeChair = null;
}

export function getActiveChairObjectKey(): string | null {
  return activeChair ? chairObjectKey(activeChair) : null;
}

export function getActiveChairContext(): { chair: ChairModel; floor: 3 | 4 } | null {
  return activeChair ? { chair: activeChair, floor: activeFloor } : null;
}

export async function openAssetPopup(chair: ChairModel, floor: 3 | 4): Promise<void> {
  activeChair = chair;
  activeFloor = floor;

  const popup = el<HTMLElement>("assetPopup");
  const title = el<HTMLElement>("assetPopupTitle");
  const image = el<HTMLImageElement>("assetPopupImage");
  const statusDot = el<HTMLElement>("assetPopupStatusDot");
  const statusText = el<HTMLElement>("assetPopupStatusText");
  const description = el<HTMLElement>("assetPopupDescription");
  const unregistered = el<HTMLElement>("assetPopupUnregistered");

  title.textContent = chair.chairName || "Object";
  statusDot.dataset.status = "unknown";
  statusText.textContent = "Loading…";
  description.textContent = "";
  image.hidden = true;
  unregistered.hidden = true;
  popup.hidden = false;
  viewer.scene.requestRender();

  try {
    const { asset } = await api.get<{ asset: AssetDTO }>(`/assets/object-key/${chairObjectKey(chair)}`);
    if (activeChair !== chair) return; // popup closed / different object opened meanwhile

    title.textContent = asset.name;
    statusDot.dataset.status = asset.live_status;
    statusText.textContent = statusLabel(asset.live_status);
    description.textContent = asset.description || "No description provided.";
    if (asset.image_url) {
      image.src = asset.image_url;
      image.hidden = false;
    }
  } catch (error) {
    if (activeChair !== chair) return;
    if (error instanceof ApiError && error.status === 404) {
      statusDot.dataset.status = "unknown";
      statusText.textContent = "Not registered";
      unregistered.hidden = false;
    } else {
      statusText.textContent = "Couldn't load status";
      console.error("[assetPopup] failed to load asset:", error);
    }
  }
}

function navigateToChair(chair: ChairModel): void {
  const translation = Cesium.Matrix4.getTranslation(chair.modelMatrix, new Cesium.Cartesian3());
  const cartographic = Cesium.Cartographic.fromCartesian(translation);
  const lon = Cesium.Math.toDegrees(cartographic.longitude);
  const lat = Cesium.Math.toDegrees(cartographic.latitude);

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, cartographic.height + 6),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
    duration: 1.2
  });
}

export function initAssetPopup(): void {
  el<HTMLButtonElement>("assetPopupCloseBtn").addEventListener("click", closeAssetPopup);

  el<HTMLButtonElement>("assetPopupNavigateBtn").addEventListener("click", () => {
    if (activeChair) navigateToChair(activeChair);
  });

  el<HTMLButtonElement>("assetPopupComplaintBtn").addEventListener("click", () => {
    if (!activeChair) return;
    openComplaintForm({
      objectKey: chairObjectKey(activeChair),
      objectName: activeChair.chairName || "Object",
      floor: activeFloor
    });
  });
}

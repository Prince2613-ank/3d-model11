import { viewer } from "./viewer";
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

export function isAssetPopupOpen(): boolean {
  const popup = document.getElementById("assetPopup");
  return Boolean(activeChair && popup && !popup.hidden);
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
  const details = el<HTMLElement>("assetPopupDetails");
  const detailsBtn = el<HTMLButtonElement>("assetPopupDetailsBtn");
  const displayName = chair.chairDisplayName || chair.chairName || "Object";

  title.textContent = displayName;
  statusDot.dataset.status = "unknown";
  statusText.textContent = "Loading…";
  description.textContent = "";
  image.hidden = true;
  unregistered.hidden = true;
  const tooltip = document.getElementById("tooltip");
  if (tooltip) tooltip.style.display = "none";
  details.hidden = true;
  detailsBtn.textContent = "Details";
  detailsBtn.setAttribute("aria-expanded", "false");
  el<HTMLElement>("assetDetailEmployee").textContent = displayName;
  el<HTMLElement>("assetDetailSeat").textContent = chairObjectKey(chair);
  el<HTMLElement>("assetDetailFloor").textContent = floor === 4 ? "3rd Floor" : "2nd Floor";
  el<HTMLElement>("assetDetailStatus").textContent = "Loading…";
  el<HTMLElement>("assetDetailCategory").textContent = "Chair";
  el<HTMLElement>("assetDetailNumber").textContent = String(chair.chairIndex ?? "—");
  popup.hidden = false;
  viewer.scene.requestRender();

  try {
    const { asset } = await api.get<{ asset: AssetDTO }>(`/assets/object-key/${chairObjectKey(chair)}`);
    if (activeChair !== chair) return; // popup closed / different object opened meanwhile

    title.textContent = asset.name;
    chair.chairDisplayName = asset.name;
    el<HTMLElement>("assetDetailEmployee").textContent = asset.assigned_employee_name || asset.name;
    el<HTMLElement>("assetDetailStatus").textContent = statusLabel(asset.live_status);
    el<HTMLElement>("assetDetailCategory").textContent = asset.category.replaceAll("_", " ");
    statusDot.dataset.status = asset.live_status;
    statusText.textContent = statusLabel(asset.live_status);
    description.textContent = asset.category === "chair"
      ? `${asset.name}'s chair (${asset.object_key})`
      : asset.description || "No description provided.";
    if (asset.image_url) {
      image.src = asset.image_url;
      image.hidden = false;
    }
  } catch (error) {
    if (activeChair !== chair) return;
    if (error instanceof ApiError && error.status === 404) {
      statusDot.dataset.status = "unknown";
      statusText.textContent = "Not registered";
      el<HTMLElement>("assetDetailStatus").textContent = "Not registered";
      unregistered.hidden = false;
    } else {
      statusText.textContent = "Couldn't load status";
      el<HTMLElement>("assetDetailStatus").textContent = "Unavailable";
      console.error("[assetPopup] failed to load asset:", error);
    }
  }
}

export function initAssetPopup(): void {
  el<HTMLButtonElement>("assetPopupCloseBtn").addEventListener("click", closeAssetPopup);

  el<HTMLButtonElement>("assetPopupDetailsBtn").addEventListener("click", () => {
    const details = el<HTMLElement>("assetPopupDetails");
    const button = el<HTMLButtonElement>("assetPopupDetailsBtn");
    const willOpen = details.hidden;
    details.hidden = !willOpen;
    button.textContent = willOpen ? "Hide Details" : "Details";
    button.setAttribute("aria-expanded", String(willOpen));
  });

  el<HTMLButtonElement>("assetPopupComplaintBtn").addEventListener("click", () => {
    if (!activeChair) return;
    openComplaintForm({
      targetType: "asset",
      objectKey: chairObjectKey(activeChair),
      objectName: activeChair.chairDisplayName || activeChair.chairName || "Object",
      floor: activeFloor
    });
  });
}

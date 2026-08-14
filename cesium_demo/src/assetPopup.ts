import { viewer } from "./viewer";
import type { ChairModel } from "./chairs";
import { api, AssetDTO, ApiError } from "./api";
import { chairObjectKey } from "./assetStatus";
import { openComplaintForm } from "./complaintForm";
import { getCurrentUser } from "./auth";
import { showToast } from "./booking";
import { openPhotoCrop } from "./photoCrop";

let activeChair: ChairModel | null = null;
let activeFloor: 3 | 4 = 3;
let activeAssetId: string | null = null;
let activeAsset: AssetDTO | null = null;
let isEditingDetails = false;
let pendingImageUrl: string | null = null;
let uploadingPhoto = false;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

function setAvatarDisplay(name: string, imageUrl: string | null): void {
  const avatar = el<HTMLImageElement>("assetPopupAvatar");
  const fallback = el<HTMLElement>("assetPopupAvatarFallback");
  if (imageUrl) {
    avatar.src = imageUrl;
    avatar.hidden = false;
    fallback.hidden = true;
  } else {
    avatar.hidden = true;
    avatar.removeAttribute("src");
    fallback.hidden = false;
    fallback.textContent = (name.trim().slice(0, 1) || "?").toUpperCase();
  }
}

function categoryStatusLabel(category: string): string {
  return `${category.replaceAll("_", " ")} status`;
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
  activeAssetId = null;
  activeAsset = null;
  setDetailsEditMode(false);
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
  activeAssetId = null;
  activeAsset = null;
  setDetailsEditMode(false);

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
  setAvatarDisplay(displayName, null);
  statusDot.dataset.status = "unknown";
  statusText.textContent = "Loading…";
  description.textContent = "";
  description.hidden = false;
  image.hidden = true;
  unregistered.hidden = true;
  const tooltip = document.getElementById("tooltip");
  if (tooltip) tooltip.style.display = "none";
  details.hidden = true;
  detailsBtn.textContent = "Details";
  detailsBtn.setAttribute("aria-expanded", "false");
  el<HTMLElement>("assetDetailEmployee").textContent = displayName;
  el<HTMLButtonElement>("assetPopupEditBtn").hidden = true;
  el<HTMLButtonElement>("assetPopupAvatarEditBtn").hidden = true;
  el<HTMLElement>("assetDetailSeat").textContent = chairObjectKey(chair);
  el<HTMLElement>("assetDetailFloor").textContent = floor === 4 ? "3rd Floor" : "2nd Floor";
  el<HTMLElement>("assetDetailStatus").textContent = "Loading…";
  el<HTMLElement>("assetDetailStatusLabel").textContent = categoryStatusLabel("chair");
  el<HTMLElement>("assetDetailCategory").textContent = "Chair";
  el<HTMLElement>("assetDetailDesignation").textContent = "—";
  popup.hidden = false;
  viewer.scene.requestRender();

  await refreshActiveAsset();
}

/** Re-reads the same shared asset record used by the admin dashboard. */
async function refreshActiveAsset(): Promise<void> {
  const chair = activeChair;
  if (!chair) return;
  const title = el<HTMLElement>("assetPopupTitle");
  const image = el<HTMLImageElement>("assetPopupImage");
  const statusDot = el<HTMLElement>("assetPopupStatusDot");
  const statusText = el<HTMLElement>("assetPopupStatusText");
  const description = el<HTMLElement>("assetPopupDescription");
  const unregistered = el<HTMLElement>("assetPopupUnregistered");
  try {
    const { asset } = await api.get<{ asset: AssetDTO }>(`/assets/object-key/${chairObjectKey(chair)}`);
    if (activeChair !== chair) return; // popup closed / different object opened meanwhile

    activeAssetId = asset.id;
    activeAsset = asset;
    if (isEditingDetails) return;
    title.textContent = asset.name;
    chair.chairDisplayName = asset.name;
    chair.chairSeatId = asset.seat_id;
    chair.chairSeatNumber = asset.seat_number;
    el<HTMLElement>("assetDetailEmployee").textContent = asset.assigned_employee_name || asset.name;
    el<HTMLElement>("assetDetailSeat").textContent = asset.seat_id;
    const detailsShown = !el<HTMLElement>("assetPopupDetails").hidden;
    el<HTMLButtonElement>("assetPopupEditBtn").hidden = !detailsShown;
    // This branch only runs outside edit mode (see the `isEditingDetails`
    // guard above) — the photo pencil only shows once edit mode is entered
    // (see setDetailsEditMode), so it stays hidden here.
    el<HTMLButtonElement>("assetPopupAvatarEditBtn").hidden = true;
    el<HTMLElement>("assetDetailStatus").textContent = statusLabel(asset.live_status);
    el<HTMLElement>("assetDetailStatusLabel").textContent = categoryStatusLabel(asset.category);
    el<HTMLElement>("assetDetailCategory").textContent = asset.category.replaceAll("_", " ");
    el<HTMLElement>("assetDetailDesignation").textContent = asset.designation || "—";
    statusDot.dataset.status = asset.live_status;
    statusText.textContent = statusLabel(asset.live_status);
    // Collapsed view leads with the designation (job title) rather than the
    // seat/chair number — the number is still available in the Details grid.
    description.textContent = asset.designation
      ? `Designation: ${asset.designation}`
      : asset.category === "chair"
        ? `${asset.name}'s chair`
        : asset.description || "No description provided.";
    if (asset.image_url) {
      image.src = asset.image_url;
      image.hidden = false;
    } else {
      // No branch here previously — if this popup was reused for a
      // different chair without a full re-open (e.g. refreshActiveAsset
      // firing again after a save), an employee with no photo could keep
      // showing whichever chair's photo was displayed last.
      image.hidden = true;
      image.removeAttribute("src");
    }
    setAvatarDisplay(asset.assigned_employee_name || asset.name, asset.image_url);
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

function setDetailsEditMode(editing: boolean): void {
  isEditingDetails = editing;
  const details = el<HTMLElement>("assetPopupDetails");
  details.querySelectorAll<HTMLElement>(".asset-detail-editable-cell strong").forEach((node) => { node.hidden = editing; });
  details.querySelectorAll<HTMLElement>(".asset-detail-editable-cell input, .asset-detail-editable-cell select").forEach((node) => { node.hidden = !editing; });
  el<HTMLElement>("assetDetailEditActions").hidden = !editing;
  el<HTMLButtonElement>("assetPopupEditBtn").hidden = !activeAssetId || editing || details.hidden;
  // The photo pencil only makes sense once the rest of the form is editable —
  // tied to edit mode itself rather than just "Details" being expanded.
  el<HTMLButtonElement>("assetPopupAvatarEditBtn").hidden = !editing;
  // Hide Details / Raise Complaint don't apply mid-edit — only Save/Cancel
  // should be actionable while the form is open.
  el<HTMLButtonElement>("assetPopupDetailsBtn").hidden = editing;
  el<HTMLButtonElement>("assetPopupComplaintBtn").hidden = editing;
  if (!editing) {
    if (activeAsset) setAvatarDisplay(activeAsset.assigned_employee_name || activeAsset.name, activeAsset.image_url);
    return;
  }
  if (!activeAsset) return;
  pendingImageUrl = activeAsset.image_url ?? null;
  el<HTMLInputElement>("assetDetailEmployeeInput").value = activeAsset.assigned_employee_name || activeAsset.name;
  el<HTMLInputElement>("assetDetailSeatInput").value = activeAsset.seat_id;
  el<HTMLInputElement>("assetDetailDesignationInput").value = activeAsset.designation || "";
}

async function handleAvatarPhotoSelected(file: File | undefined): Promise<void> {
  if (!file || uploadingPhoto || !activeAssetId) return;
  if (!getCurrentUser()) {
    showToast("Please sign in to change the photo.", "error");
    return;
  }
  const cropped = await openPhotoCrop(file);
  if (!cropped) return; // user cancelled the crop step

  const assetId = activeAssetId;
  const displayName = activeAsset?.assigned_employee_name || activeAsset?.name || "?";
  uploadingPhoto = true;
  try {
    const croppedFile = new File([cropped], "photo.jpg", { type: "image/jpeg" });
    const { url } = await api.uploadFile("/uploads/asset-photo", croppedFile);
    if (activeAssetId !== assetId) return; // popup moved on to a different object meanwhile
    pendingImageUrl = url;
    setAvatarDisplay(displayName, url);

    // Save immediately — the photo is meant to update everywhere (admin +
    // user panel) right away rather than waiting on a separate "Save" for
    // the rest of the form, which the user may not even have open.
    const { asset } = await api.patch<{ asset: AssetDTO }>(`/assets/${assetId}/user-details`, { imageUrl: url });
    if (activeAssetId === asset.id) activeAsset = asset;
    showToast("Photo updated.", "success");
  } catch (error) {
    console.error("[assetPopup] failed to upload photo:", error);
    showToast("Couldn't upload the photo. Try again.", "error");
  } finally {
    uploadingPhoto = false;
  }
}

async function saveDetails(): Promise<void> {
  if (!activeAssetId) return;
  if (!getCurrentUser()) {
    showToast("Please sign in to save your changes.", "error");
    return;
  }
  const saveBtn = el<HTMLButtonElement>("assetDetailSaveBtn");
  saveBtn.disabled = true;
  try {
    const { asset } = await api.patch<{ asset: AssetDTO }>(`/assets/${activeAssetId}/user-details`, {
      assignedToName: el<HTMLInputElement>("assetDetailEmployeeInput").value.trim() || null,
      name: el<HTMLInputElement>("assetDetailEmployeeInput").value.trim(),
      seatId: el<HTMLInputElement>("assetDetailSeatInput").value.trim(),
      designation: el<HTMLInputElement>("assetDetailDesignationInput").value.trim() || null,
      // Status and category are intentionally left out of this employee-facing
      // edit form — status only changes automatically through the complaint
      // lifecycle, and category is fixed for a seat's asset type, not a free
      // choice a signed-in employee should be able to flip.
      imageUrl: pendingImageUrl
    });
    if (activeAssetId !== asset.id) return;
    activeAsset = asset;
    setDetailsEditMode(false);
    await refreshActiveAsset();
    showToast("Asset details updated.", "success");
  } catch (error) {
    console.error("[assetPopup] failed to update asset details:", error);
    showToast("Couldn't save the details. Try again.", "error");
  } finally {
    saveBtn.disabled = false;
  }
}

export function initAssetPopup(): void {
  el<HTMLButtonElement>("assetPopupCloseBtn").addEventListener("click", closeAssetPopup);

  el<HTMLButtonElement>("assetPopupDetailsBtn").addEventListener("click", () => {
    const details = el<HTMLElement>("assetPopupDetails");
    const button = el<HTMLButtonElement>("assetPopupDetailsBtn");
    const willOpen = details.hidden;
    details.hidden = !willOpen;
    // The designation line is only useful on the collapsed card — once
    // Details is open, the "Designation" grid cell already covers it.
    el<HTMLElement>("assetPopupDescription").hidden = willOpen;
    button.textContent = willOpen ? "Hide Details" : "Details";
    button.setAttribute("aria-expanded", String(willOpen));
    el<HTMLButtonElement>("assetPopupEditBtn").hidden = !willOpen || !activeAssetId;
    // Closing Details also exits edit mode (see below), which already hides
    // the photo pencil — nothing extra to do for it when opening.
    if (!willOpen) setDetailsEditMode(false);
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

  el<HTMLInputElement>("assetDetailEmployeeInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") void saveDetails();
    if (event.key === "Escape") setDetailsEditMode(false);
  });

  el<HTMLButtonElement>("assetPopupEditBtn").addEventListener("click", () => setDetailsEditMode(true));
  el<HTMLButtonElement>("assetDetailSaveBtn").addEventListener("click", () => void saveDetails());
  el<HTMLButtonElement>("assetDetailCancelBtn").addEventListener("click", () => setDetailsEditMode(false));

  el<HTMLButtonElement>("assetPopupAvatarEditBtn").addEventListener("click", () => {
    el<HTMLInputElement>("assetPopupPhotoInput").click();
  });
  el<HTMLInputElement>("assetPopupPhotoInput").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    void handleAvatarPhotoSelected(input.files?.[0]);
    input.value = "";
  });

  // Keep an open user panel aligned with edits made in the admin dashboard (or
  // another user session), without requiring a page reload.
  window.setInterval(() => {
    if (isAssetPopupOpen()) void refreshActiveAsset();
  }, 8_000);
}

import { Cesium, viewer } from "./viewer";
import { onAuthChange, signInWithGoogle, getCurrentUser } from "./auth";
import { api, ApiError } from "./api";
import { applyChairStatusTint } from "./assetStatus";
import { getActiveChairContext, closeAssetPopup } from "./assetPopup";

interface ComplaintTarget {
  targetType?: "asset" | "room";
  objectKey?: string;
  objectName: string;
  floor: 3 | 4;
  roomId?: string;
  prefillDescription?: string;
}

let target: ComplaintTarget | null = null;
let isSignedIn = false;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

function readCameraPosition(): { lon: number; lat: number; height: number; heading: number; pitch: number } {
  const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
  return {
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    height: cartographic.height,
    heading: Cesium.Math.toDegrees(viewer.camera.heading),
    pitch: Cesium.Math.toDegrees(viewer.camera.pitch)
  };
}

function resetForm(): void {
  el<HTMLFormElement>("complaintForm").reset();
  el<HTMLElement>("complaintFormError").hidden = true;
  el<HTMLElement>("complaintFormSuccess").hidden = true;
  el<HTMLButtonElement>("complaintSubmitBtn").disabled = false;
  el<HTMLButtonElement>("complaintSubmitBtn").textContent = "Submit";
  el<HTMLElement>("complaintPhotosCount").textContent = "";
}

export function closeComplaintForm(): void {
  el<HTMLElement>("complaintFormPopup").hidden = true;
  target = null;
}

export function openComplaintForm(next: ComplaintTarget): void {
  target = next;
  resetForm();
  // Read the current session at interaction time as well as listening for auth
  // events. This prevents a stale local flag from disagreeing with the profile
  // state after a token refresh or OAuth popup handoff.
  isSignedIn = Boolean(getCurrentUser());

  const popup = el<HTMLElement>("complaintFormPopup");
  const signInPrompt = el<HTMLElement>("complaintSignInPrompt");
  const form = el<HTMLFormElement>("complaintForm");

  popup.hidden = false;
  signInPrompt.hidden = isSignedIn;
  form.style.display = isSignedIn ? "" : "none";
  if (next.prefillDescription) {
    el<HTMLTextAreaElement>("complaintDescription").value = next.prefillDescription;
  }
}

async function uploadPhotos(files: FileList): Promise<string[]> {
  const urls: string[] = [];
  for (const file of Array.from(files)) {
    const { url } = await api.uploadFile("/uploads/complaint-photo", file);
    urls.push(url);
  }
  return urls;
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!target) return;

  const submitBtn = el<HTMLButtonElement>("complaintSubmitBtn");
  const errorEl = el<HTMLElement>("complaintFormError");
  const successEl = el<HTMLElement>("complaintFormSuccess");
  errorEl.hidden = true;
  successEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    const issueType = el<HTMLInputElement>("complaintIssueType").value.trim();
    const priority = el<HTMLSelectElement>("complaintPriority").value;
    const description = el<HTMLTextAreaElement>("complaintDescription").value.trim();
    const photoInput = el<HTMLInputElement>("complaintPhotos");

    const photoUrls = photoInput.files && photoInput.files.length > 0
      ? await uploadPhotos(photoInput.files)
      : [];

    await api.post("/complaints", {
      targetType: target.targetType ?? "asset",
      objectKey: target.objectKey,
      roomId: target.roomId,
      roomName: target.targetType === "room" ? target.objectName : undefined,
      floorNumber: target.floor,
      issueType,
      priority,
      description,
      photoUrls,
      cameraPosition: readCameraPosition()
    });

    successEl.hidden = false;
    submitBtn.textContent = "Submitted";

    const chairContext = getActiveChairContext();
    if (chairContext) void applyChairStatusTint(chairContext.chair);

    window.setTimeout(() => {
      closeComplaintForm();
      closeAssetPopup();
    }, 1400);
  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
    errorEl.hidden = false;
    errorEl.textContent = error instanceof ApiError && error.status === 401
      ? "Your session expired. Please sign in again and retry."
      : error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
  }
}

export function initComplaintForm(): void {
  onAuthChange((user) => {
    isSignedIn = Boolean(user);
    const signInPrompt = el<HTMLElement>("complaintSignInPrompt");
    const form = el<HTMLFormElement>("complaintForm");
    if (!el<HTMLElement>("complaintFormPopup").hidden) {
      signInPrompt.hidden = isSignedIn;
      form.style.display = isSignedIn ? "" : "none";
    }
  });

  el<HTMLButtonElement>("complaintSignInBtn").addEventListener("click", () => {
    void signInWithGoogle();
  });

  el<HTMLInputElement>("complaintPhotos").addEventListener("change", (event) => {
    const count = (event.target as HTMLInputElement).files?.length ?? 0;
    el<HTMLElement>("complaintPhotosCount").textContent = count === 0
      ? ""
      : count === 1 ? "1 photo selected" : `${count} photos selected`;
  });

  el<HTMLButtonElement>("complaintFormCloseBtn").addEventListener("click", closeComplaintForm);
  el<HTMLButtonElement>("complaintCancelBtn").addEventListener("click", closeComplaintForm);
  el<HTMLFormElement>("complaintForm").addEventListener("submit", (event) => {
    void handleSubmit(event);
  });
}

export function getCurrentReporter(): { name: string; email: string } | null {
  const user = getCurrentUser();
  if (!user) return null;
  return { name: user.name, email: user.email };
}

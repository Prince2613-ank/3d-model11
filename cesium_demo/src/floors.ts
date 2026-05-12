import {
  Cesium,
  DEFAULT_AMBIENT_LIGHT,
  SECOND_FLOOR_COOL_AMBIENT_LIGHT,
  viewer
} from "./viewer";
import { ensureFloorModelLoaded, getActiveCctvModel, isCctvActive, isFloorModelLoaded, models } from "./models";
import { geo2, geo3 } from "./rooms";
import { loadChairsForFloor, secondFloorChairs, thirdFloorChairs, type ChairModel } from "./chairs";
import { renderCameraControls } from "./ui";
import { updateNavigationVisibility } from "./navigation";
import { showToast } from "./booking";
import { clearCctvViewshed } from "./cameraShed/cctvViewshed";

let selectedFloor = 0;
let autoIndoorEnabled = true;
let mode: "OUTDOOR" | "INDOOR" = "OUTDOOR";
let indoorFloor: number | null = null;
let lastSwitchTime = 0;
let floorSwitchToken = 0;
const requestedChairFloors = new Set<3 | 4>();

const ENTER_INDOOR = 12;
const EXIT_OUTDOOR = 18;



export function getSelectedFloor(): number {
  return selectedFloor;
}

function setShow(target: { show: boolean } | null | undefined, show: boolean): void {
  if (target && target.show !== show) {
    target.show = show;
  }
}

function showLoadedChairIfSelected(chair: ChairModel): void {
  const shouldShow = chair.chairFloor === selectedFloor;
  if (chair.show !== shouldShow) {
    chair.show = shouldShow;
    viewer.scene.requestRender();
  }
}

// Pure visibility-only update — no async triggers, no DOM rebuilds.
// Used by async callbacks so they don't re-enter showFloor and cause render storms.
function applyVisibility(floor: number): void {
  const ambientLight = floor === 3 ? SECOND_FLOOR_COOL_AMBIENT_LIGHT : DEFAULT_AMBIENT_LIGHT;
  if ((viewer.scene as any).ambientLightColor !== ambientLight) {
    (viewer.scene as any).ambientLightColor = ambientLight;
  }

  const sceneLight = viewer.scene.light as any;
  if (sceneLight && typeof sceneLight.intensity === "number") {
    sceneLight.intensity = floor > 0 ? (floor === 3 ? 5.0 : 4.6) : 4.4;
  }

  viewer.scene.postProcessStages.fxaa.enabled = true;

  for (let index = 0; index < viewer.dataSources.length; index += 1) {
    setShow(viewer.dataSources.get(index), false);
  }

  setShow(models.fullBuilding, floor === 0);
  setShow(models.outdoor, floor === 0);
  setShow(models.ground, floor === 1);
  setShow(models.first, floor === 2);
  setShow(models.second, floor === 3);
  setShow(models.third, floor === 4);
  setShow(models.meetingRoom, floor === 4);
  setShow(models.thirdFloorPiller, floor === 4);
  const activeCctv = getActiveCctvModel();
  models.cameras.forEach((camera) => {
    const shouldShow = (camera.cameraFloor === floor) && camera !== activeCctv;
    setShow(camera, shouldShow);
  });

  for (const chair of thirdFloorChairs) setShow(chair, floor === 4);
  for (const chair of secondFloorChairs) setShow(chair, floor === 3);

  setShow(geo2, floor === 3);
  setShow(geo3, floor === 4);

  updateNavigationVisibility(floor);
}

function requestChairFloor(floor: number): void {
  if (floor !== 3 && floor !== 4) return;
  if (requestedChairFloors.has(floor)) return;

  requestedChairFloors.add(floor);
  void loadChairsForFloor(floor, showLoadedChairIfSelected)
    .then(() => {
      // Use applyVisibility instead of showFloor to avoid recursive DOM rebuilds
      if (selectedFloor === floor) {
        applyVisibility(floor);
        viewer.scene.requestRender();
      }
    })
    .catch((error) => {
      requestedChairFloors.delete(floor);
      console.error(`Failed to load floor ${floor} chairs:`, error);
    });
}

async function ensureFloorCompletelyLoaded(floor: number, token: number): Promise<void> {
  if (floor <= 0) return;

  await ensureFloorModelLoaded(floor);
  if (token !== floorSwitchToken || selectedFloor !== floor) return;

  if (floor === 3 || floor === 4) {
    requestedChairFloors.add(floor);
    await loadChairsForFloor(floor, showLoadedChairIfSelected);
    if (token !== floorSwitchToken || selectedFloor !== floor) return;
  }

  applyVisibility(floor);
  viewer.scene.requestRender();
}

export function showFloor(floor: number): void {
  if (isCctvActive()) {
    showToast("Exit camera view first to use this.", "error");
    return;
  }

  clearCctvViewshed();
  selectedFloor = floor;
  const token = ++floorSwitchToken;

  if (floor > 0 && !isFloorModelLoaded(floor)) {
    void ensureFloorCompletelyLoaded(floor, token)
      .catch((error) => console.error(`Failed to load floor ${floor}:`, error));
  } else {
    requestChairFloor(floor);
  }

  applyVisibility(floor);
  renderCameraControls(floor);
  viewer.scene.requestRender();
}

// Returns a Promise so the UI can tie spinner lifetime to actual load completion.
export function openFloorProfessional(floorNumber: number): Promise<void> {
  if (isCctvActive()) {
    showToast("Exit camera view first to use this.", "error");
    return Promise.resolve();
  }

  clearCctvViewshed();
  if (typeof (viewer.camera as any).cancelFlight === "function") {
    (viewer.camera as any).cancelFlight();
  }

  autoIndoorEnabled = false;
  selectedFloor = floorNumber;
  const token = ++floorSwitchToken;

  if (floorNumber === 0) {
    mode = "OUTDOOR";
    indoorFloor = null;
  } else {
    mode = "INDOOR";
    indoorFloor = floorNumber;
  }

  applyVisibility(floorNumber);
  renderCameraControls(floorNumber);
  viewer.scene.requestRender();

  return ensureFloorCompletelyLoaded(floorNumber, token);
}

function detectFloorFromScreenCenter(): number | null {
  const canvas = viewer.scene.canvas;
  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const picked = viewer.scene.pick(center);
  const primitive = picked?.primitive;

  if (primitive === models.ground) return 1;
  if (primitive === models.first) return 2;
  if (primitive === models.second) return 3;
  if (primitive === models.third) return 4;
  return null;
}

export function initSmartFloorCamera(): void {
  viewer.camera.changed.addEventListener(() => {
    if (isCctvActive()) return;
    if (!autoIndoorEnabled) return;

    const height = viewer.camera.positionCartographic.height;
    if (height >= ENTER_INDOOR) {
      if (selectedFloor === 0) showFloor(0);
      return;
    }

    if (mode === "INDOOR") {
      const now = Date.now();
      if (now - lastSwitchTime < 300) return;
      if (indoorFloor) showFloor(indoorFloor);
      if (height > EXIT_OUTDOOR) {
        mode = "OUTDOOR";
        indoorFloor = null;
        showFloor(0);
        lastSwitchTime = now;
      }
    }
  });

  viewer.camera.moveEnd.addEventListener(() => {
    if (isCctvActive()) return;
    if (!autoIndoorEnabled) return;

    const height = viewer.camera.positionCartographic.height;
    if (height >= ENTER_INDOOR || mode === "INDOOR") return;

    const now = Date.now();
    if (now - lastSwitchTime < 300) return;

    if (models.fullBuilding) models.fullBuilding.show = false;
    if (models.ground) models.ground.show = true;
    if (models.first) models.first.show = true;
    if (models.second) models.second.show = true;
    if (models.third) models.third.show = true;

    const detectedFloor = detectFloorFromScreenCenter();
    if (detectedFloor) {
      indoorFloor = detectedFloor;
      mode = "INDOOR";
      showFloor(detectedFloor);
      lastSwitchTime = now;
    } else {
      showFloor(0);
    }
  });
}

import * as Cesium from "cesium";
import { viewer } from "./viewer";
import { showToast } from "./booking";
import { isCctvActive } from "./models";

const MOVE_DISTANCE = 1; // meters
const ALTITUDE_STEP = 0.25; // meters
const ZOOM_MULTIPLIER = 1.2;
const HEADING_INCREMENT = Cesium.Math.toRadians(5); // 5 degrees
const PITCH_INCREMENT = Cesium.Math.toRadians(2); // 2 degrees
let cameraLockToastShownAt = 0;

function isCameraDebugLocked(): boolean {
  if (!isCctvActive()) return false;

  const now = Date.now();
  if (now - cameraLockToastShownAt > 1800) {
    showToast("Exit camera view first to use this.", "error");
    cameraLockToastShownAt = now;
  }

  return true;
}

export function initCameraDebug(): void {
  const debugPanel = document.getElementById("cameraDebugPanel");
  if (!debugPanel) return;

  const toggleBtn = document.getElementById("debugToggleBtn");
  const content = debugPanel.querySelector(".debug-content") as HTMLElement;
  let isMinimized = false;

  // Toggle minimize/expand
  toggleBtn?.addEventListener("click", () => {
    isMinimized = !isMinimized;
    if (isMinimized) {
      content.style.display = "none";
      toggleBtn.textContent = "+";
    } else {
      content.style.display = "block";
      toggleBtn.textContent = "−";
    }
  });

  // Update camera values every frame
  viewer.scene.preRender.addEventListener(() => {
    updateCameraValues();
  });

  // Camera control buttons
  document.getElementById("debugUp")?.addEventListener("click", () => moveCameraVertical(MOVE_DISTANCE));
  document.getElementById("debugDown")?.addEventListener("click", () => moveCameraVertical(-MOVE_DISTANCE));
  document.getElementById("debugLeft")?.addEventListener("click", () => moveCameraHorizontal(-MOVE_DISTANCE));
  document.getElementById("debugRight")?.addEventListener("click", () => moveCameraHorizontal(MOVE_DISTANCE));
  document.getElementById("debugZoomIn")?.addEventListener("click", () => zoomCamera(1 / ZOOM_MULTIPLIER));
  document.getElementById("debugZoomOut")?.addEventListener("click", () => zoomCamera(ZOOM_MULTIPLIER));
  document.getElementById("debugAltitudeUp")?.addEventListener("click", () => moveCameraVertical(ALTITUDE_STEP));
  document.getElementById("debugAltitudeDown")?.addEventListener("click", () => moveCameraVertical(-ALTITUDE_STEP));
  document.getElementById("debugHeadingLeft")?.addEventListener("click", () => rotateCamera(-HEADING_INCREMENT, 0));
  document.getElementById("debugHeadingRight")?.addEventListener("click", () => rotateCamera(HEADING_INCREMENT, 0));
  document.getElementById("debugPitchUp")?.addEventListener("click", () => rotateCamera(0, PITCH_INCREMENT));
  document.getElementById("debugPitchDown")?.addEventListener("click", () => rotateCamera(0, -PITCH_INCREMENT));

  // Copy code button
  document.getElementById("debugCopyCode")?.addEventListener("click", () => copyCurrentCameraCode());

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey) {
      switch (e.key.toUpperCase()) {
        case "W":
          e.preventDefault();
          moveCameraVertical(MOVE_DISTANCE);
          break;
        case "S":
          e.preventDefault();
          moveCameraVertical(-MOVE_DISTANCE);
          break;
        case "A":
          e.preventDefault();
          moveCameraHorizontal(-MOVE_DISTANCE);
          break;
        case "D":
          e.preventDefault();
          moveCameraHorizontal(MOVE_DISTANCE);
          break;
        case "Q":
          e.preventDefault();
          zoomCamera(1 / ZOOM_MULTIPLIER);
          break;
        case "E":
          e.preventDefault();
          zoomCamera(ZOOM_MULTIPLIER);
          break;
        case "ARROWLEFT":
          e.preventDefault();
          rotateCamera(-HEADING_INCREMENT, 0);
          break;
        case "ARROWRIGHT":
          e.preventDefault();
          rotateCamera(HEADING_INCREMENT, 0);
          break;
        case "ARROWUP":
          e.preventDefault();
          rotateCamera(0, PITCH_INCREMENT);
          break;
        case "ARROWDOWN":
          e.preventDefault();
          rotateCamera(0, -PITCH_INCREMENT);
          break;
      }
    }
  });
}

function updateCameraValues(): void {
  const cartographic = viewer.camera.positionCartographic;
  const heading = viewer.camera.heading;
  const pitch = viewer.camera.pitch;
  const roll = viewer.camera.roll;

  // Update display values
  const lonElement = document.getElementById("debugLon");
  const latElement = document.getElementById("debugLat");
  const heightElement = document.getElementById("debugHeight");
  const headingElement = document.getElementById("debugHeading");
  const pitchElement = document.getElementById("debugPitch");
  const rollElement = document.getElementById("debugRoll");

  if (lonElement) lonElement.textContent = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
  if (latElement) latElement.textContent = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
  if (heightElement) heightElement.textContent = cartographic.height.toFixed(2);
  if (headingElement) headingElement.textContent = Cesium.Math.toDegrees(heading).toFixed(2);
  if (pitchElement) pitchElement.textContent = Cesium.Math.toDegrees(pitch).toFixed(2);
  if (rollElement) rollElement.textContent = Cesium.Math.toDegrees(roll).toFixed(2);
}

function moveCameraVertical(distance: number): void {
  if (isCameraDebugLocked()) return;

  const cartographic = viewer.camera.positionCartographic.clone();
  cartographic.height += distance;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height),
  });
}

function moveCameraHorizontal(distance: number): void {
  if (isCameraDebugLocked()) return;

  const camera = viewer.camera;
  const heading = camera.heading;

  const moveHeading = heading + Cesium.Math.toRadians(90);
  const position = viewer.camera.position.clone();
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  const east = Cesium.Matrix4.getColumn(transform, 0, new Cesium.Cartesian4());
  const north = Cesium.Matrix4.getColumn(transform, 1, new Cesium.Cartesian4());
  const moveDirection = new Cesium.Cartesian3(
    east.x * Math.sin(moveHeading) + north.x * Math.cos(moveHeading),
    east.y * Math.sin(moveHeading) + north.y * Math.cos(moveHeading),
    east.z * Math.sin(moveHeading) + north.z * Math.cos(moveHeading)
  );
  Cesium.Cartesian3.normalize(moveDirection, moveDirection);
  Cesium.Cartesian3.multiplyByScalar(moveDirection, distance, moveDirection);
  const newPosition = Cesium.Cartesian3.add(position, moveDirection, new Cesium.Cartesian3());

  viewer.camera.setView({
    destination: newPosition,
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
  });
}

function zoomCamera(factor: number): void {
  if (isCameraDebugLocked()) return;

  const camera = viewer.camera;
  const cartographic = camera.positionCartographic.clone();
  cartographic.height *= factor;

  // Clamp height to avoid going too far
  cartographic.height = Cesium.Math.clamp(cartographic.height, 1.0, 300.0);

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      cartographic.height
    ),
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
  });
}

function rotateCamera(headingDelta: number, pitchDelta: number): void {
  if (isCameraDebugLocked()) return;

  const camera = viewer.camera;
  let heading = camera.heading + headingDelta;
  let pitch = camera.pitch + pitchDelta;

  heading = ((heading % Cesium.Math.TWO_PI) + Cesium.Math.TWO_PI) % Cesium.Math.TWO_PI;

  // Clamp pitch to valid range
  pitch = Cesium.Math.clamp(pitch, Cesium.Math.toRadians(-85), Cesium.Math.toRadians(-5));

  viewer.camera.setView({
    orientation: {
      heading,
      pitch,
      roll: camera.roll,
    },
  });
}

function copyCurrentCameraCode(): void {
  const camera = viewer.camera;
  const cartographic = camera.positionCartographic;
  const lon = Cesium.Math.toDegrees(cartographic.longitude);
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const height = cartographic.height;
  const heading = Cesium.Math.toDegrees(camera.heading);
  const pitch = Cesium.Math.toDegrees(camera.pitch);

  const codeSnippet = `{
  name: "Camera Position",
  destination: Cesium.Cartesian3.fromDegrees(${lon.toFixed(6)}, ${lat.toFixed(
    6
  )}, ${height.toFixed(2)}),
  orientation: {
    heading: Cesium.Math.toRadians(${heading.toFixed(2)}),
    pitch: Cesium.Math.toRadians(${pitch.toFixed(2)}),
    roll: 0,
  },
}`;

  navigator.clipboard.writeText(codeSnippet).then(() => {
    showCopyFeedback();
  });
}

function showCopyFeedback(): void {
  const feedback = document.getElementById("debugCopyFeedback");
  if (feedback) {
    feedback.style.display = "block";
    setTimeout(() => {
      feedback.style.display = "none";
    }, 2000);
  }
}

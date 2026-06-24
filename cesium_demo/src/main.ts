import "./styles.css";
import { Cesium, viewer } from "./viewer";
import { loadModels } from "./models";
import { getSelectedFloor, initSmartFloorCamera, openFloorProfessional, preloadFloor, showFloor } from "./floors";
import { getNavigableRoomNames, loadRooms } from "./rooms";
import { getNavigablePersonNames, chairNavPoints } from "./chairs";
import { initializeCalendar } from "./calendar";
import {
  exitNavigation,
  installCorridorPointDebug,
  installIntermediatePointDebug,
  installStairPathDebug,
  startNavigation,
  setNavigationFloorSwitchHandler,
  showStairDebugUI,
  hideStairDebugUI,
  setStairDragEnabled,
  getStairPathPoints,
  setStairPathPoint,
  flyToStairDebugUI,
  copyStairPathToClipboard,
  startStairAddPointMode,
  stopStairAddPointMode,
  removeLastStairPathPoint,
  showCursorCoordinateDisplay,
  hideCursorCoordinateDisplay,
  saveCurrentCameraAsChairPreset,
  flyToChairViewPreset,
  deleteChairViewPreset,
  getAllChairViewPresets,
  getChairViewPresetsCode,
} from "./navigation";
import { clearCctvViewshed } from "./cameraShed/cctvViewshed";
import {
  bindCctvPanel,
  bindUiControls,
  installSceneInteractions,
  populateRoomDropdowns,
  setNavigationMessage,
  openBookingPanel,
  closeBookingPanel,
  getBookingPanelRoom,
  getBookingTimes,
  hideFloorSpinner,
  installMapDirectionsControl,
  showFloorSpinner,
  setEnterBuildingFloorSwitchCallback,
  installSeatViewDebug,
  installArrivalViewTuner,
} from "./ui";
import { createBooking, getCurrentEvents, showToast } from "./booking";

// Guard: if WebGL context is lost (GPU OOM, driver reset), show spinner and reload
// instead of letting Cesium freeze with "Rendering has stopped."
function installContextLossGuard(): void {
  const canvas = viewer.scene.canvas;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault(); // required so browser allows restoration
    showFloorSpinner("Display error — reloading…");
    setTimeout(() => window.location.reload(), 2500);
  }, false);
}

async function playOnboardingSplash(): Promise<void> {
  const splash = document.getElementById("onboardingSplash");
  if (!splash) return;

  splash.remove();
}

function requestIdleWork(callback: () => void, timeout = 2000): void {
  const requestIdle = (window as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;

  if (requestIdle) {
    requestIdle(callback, { timeout });
    return;
  }

  window.setTimeout(callback, timeout);
}

function preloadHeavyFloorsInBackground(): void {
  const floors = [3, 4];

  const preloadNext = async (): Promise<void> => {
    const floor = floors.shift();
    if (!floor) return;

    try {
      await preloadFloor(floor);
    } catch (error) {
      console.warn(`Background preload failed for floor ${floor}:`, error);
    }

    if (floors.length > 0) {
      requestIdleWork(() => { void preloadNext(); }, 2500);
    }
  };

  requestIdleWork(() => { void preloadNext(); }, 1500);
}

async function bootstrap(): Promise<void> {
  installContextLossGuard();
  setNavigationFloorSwitchHandler(openFloorProfessional);
  setEnterBuildingFloorSwitchCallback(openFloorProfessional);
  bindUiControls({
    showFloor: openFloorProfessional,
    preloadFloor,

    startNavigation: async () => {
      clearCctvViewshed();
      showFloorSpinner("Preparing navigation...");
      try {
        await startNavigation();
      } finally {
        hideFloorSpinner();
      }
    },

    exitNavigation,
  });
  bindCctvPanel();
  installMapDirectionsControl();
  setNavigationMessage("Loading building data...");

  const applySelectedFloor = (): void => showFloor(getSelectedFloor());
  const roomLoad = loadRooms().then(applySelectedFloor);
  const modelLoad = loadModels();

  await playOnboardingSplash();

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(77.133783, 28.670903, 81.51),
    orientation: {
      heading: Cesium.Math.toRadians(342.04),
      pitch: Cesium.Math.toRadians(-84.94),
      roll: 0,
    },
    duration: 1.5,
  });

  await Promise.all([modelLoad, roomLoad]);
  await installCorridorPointDebug();
  populateRoomDropdowns(getNavigableRoomNames(), getNavigablePersonNames());
  applySelectedFloor();
  initSmartFloorCamera();
  installStairPathDebug();
  await installIntermediatePointDebug();
  preloadHeavyFloorsInBackground();

  installSceneInteractions(getSelectedFloor, {
    onRoomClick: (roomName) => {
      openBookingPanel(roomName, getCurrentEvents());
    },
  });

  // ── Booking panel ── Book button
  document.getElementById("bookBtn")?.addEventListener("click", async () => {
    const roomName = getBookingPanelRoom();
    if (!roomName) return;

    const times = getBookingTimes();
    if (!times) {
      showToast("Please set start and end times", "error");
      return;
    }
    if (times.end <= times.start) {
      showToast("End time must be after start time", "error");
      return;
    }

    const btn = document.getElementById("bookBtn") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = "Booking…"; }

    const result = await createBooking(roomName, times.start, times.end, getCurrentEvents());

    if (btn) { btn.disabled = false; btn.textContent = "Book Room"; }

    if (result.success) {
      showToast(`${roomName} booked successfully!`, "success");
      closeBookingPanel();
    } else {
      showToast(result.error ?? "Booking failed", "error");
    }
  });

  void initializeCalendar();
  setNavigationMessage("Choose rooms to start navigation.");

  // ── Arrival view tuner (enable with ?arrivalViewDebug=1 in URL) ──
  installArrivalViewTuner();

  // ── Seat view debug card (enable with ?seatViewDebug=1 in URL) ──
  if (new URLSearchParams(window.location.search).get("seatViewDebug") === "1") {
    const persons = chairNavPoints.map((p) => ({
      name: p.name,
      floor: p.floor,
      label: `${p.floor === 3 ? "2F" : "3F"} — ${p.name}`,
    }));
    installSeatViewDebug({
      persons,
      onSave: saveCurrentCameraAsChairPreset,
      onTest: flyToChairViewPreset,
      onDelete: deleteChairViewPreset,
      getPresets: getAllChairViewPresets,
      getCopyCode: getChairViewPresetsCode,
    });
  }

  // ── Hamburger Menu ──
  const hamburgerBtn = document.getElementById("hamburgerMenu") as HTMLButtonElement | null;
  const backdrop = document.getElementById("menuBackdrop") as HTMLElement | null;
  
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", () => {
      document.body.classList.toggle("side-panel-open");
      hamburgerBtn.classList.toggle("open");
    });
  }

  // Close menu when clicking backdrop
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      document.body.classList.remove("side-panel-open");
      if (hamburgerBtn) hamburgerBtn.classList.remove("open");
    });
  }

  // Close menu when clicking outside
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const sidebar = document.querySelector(".left-sidebar");
    const isClickInsideSidebar = sidebar?.contains(target);
    const isClickOnHamburger = hamburgerBtn?.contains(target);

    if (!isClickInsideSidebar && !isClickOnHamburger) {
      document.body.classList.remove("side-panel-open");
      if (hamburgerBtn) hamburgerBtn.classList.remove("open");
    }
  });

  // ── Stair Debug Panel ──────────────────────────────────────────────────────
  const stairPanel   = document.getElementById("stairDebugPanel") as HTMLElement | null;
  const stairOpenBtn = document.getElementById("stairDebugOpenBtn") as HTMLButtonElement | null;
  const stairCloseBtn= document.getElementById("stairDebugCloseBtn") as HTMLButtonElement | null;
  const stairShowBtn = document.getElementById("stairShowBtn") as HTMLButtonElement | null;
  const stairDragBtn = document.getElementById("stairDragBtn") as HTMLButtonElement | null;
  const stairFlyBtn  = document.getElementById("stairFlyBtn") as HTMLButtonElement | null;
  const stairAddBtn  = document.getElementById("stairAddBtn") as HTMLButtonElement | null;
  const stairUndoBtn = document.getElementById("stairUndoBtn") as HTMLButtonElement | null;
  const stairCopyBtn = document.getElementById("stairCopyBtn") as HTMLButtonElement | null;
  const stairCards   = document.getElementById("stairPointCards") as HTMLElement | null;

  const FLOOR_TAGS = [
    { label: "2nd Floor", cls: "floor-2nd" },
    { label: "Step 2",    cls: "floor-landing" },
    { label: "Landing",   cls: "floor-landing" },
    { label: "Step 4",    cls: "floor-landing" },
    { label: "Step 5",    cls: "floor-landing" },
    { label: "3rd Floor", cls: "floor-3rd" },
  ];

  let stairPointsVisible = false;
  let stairDragActive = false;
  let stairAddActive = false;

  function setStairSecondaryBtns(enabled: boolean): void {
    if (stairDragBtn) stairDragBtn.disabled = !enabled;
    if (stairFlyBtn)  stairFlyBtn.disabled  = !enabled;
    if (stairAddBtn)  stairAddBtn.disabled  = !enabled;
    if (stairUndoBtn) stairUndoBtn.disabled = !enabled;
    if (stairCopyBtn) stairCopyBtn.disabled = !enabled;
  }

  function stopAddMode(): void {
    if (!stairAddActive) return;
    stairAddActive = false;
    stopStairAddPointMode();
    if (stairAddBtn) { stairAddBtn.textContent = "+ Click to Add"; stairAddBtn.classList.remove("active"); }
  }

  function buildStairCards(): void {
    if (!stairCards) return;
    const pts = getStairPathPoints();
    stairCards.innerHTML = pts.map((pt, i) => {
      const tag = FLOOR_TAGS[i];
      return `
        <div class="stair-point-card">
          <div class="stair-point-card-header">
            <span>Point ${i + 1}</span>
            <span class="stair-point-floor-tag ${tag.cls}">${tag.label}</span>
          </div>
          <div class="stair-point-inputs">
            <input id="stairLat${i}" type="text" value="${pt.lat.toFixed(9)}" placeholder="Latitude" />
            <input id="stairLon${i}" type="text" value="${pt.lon.toFixed(9)}" placeholder="Longitude" />
            <button class="btn" type="button" data-stair-update="${i}">✓</button>
          </div>
        </div>`;
    }).join("");

    stairCards.querySelectorAll<HTMLButtonElement>("[data-stair-update]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.stairUpdate);
        const lat = parseFloat((document.getElementById(`stairLat${idx}`) as HTMLInputElement).value);
        const lon = parseFloat((document.getElementById(`stairLon${idx}`) as HTMLInputElement).value);
        if (isNaN(lat) || isNaN(lon)) return;
        setStairPathPoint(idx, lon, lat);
      });
    });
  }

  stairOpenBtn?.addEventListener("click", () => {
    if (stairPanel) stairPanel.hidden = false;
    buildStairCards();
  });

  stairCloseBtn?.addEventListener("click", () => {
    stopAddMode();
    if (stairPointsVisible) { hideStairDebugUI(); stairPointsVisible = false; stairDragActive = false; }
    if (stairShowBtn) { stairShowBtn.textContent = "Show Points"; stairShowBtn.classList.remove("active"); }
    if (stairDragBtn) { stairDragBtn.textContent = "Drag Edit"; stairDragBtn.classList.remove("active"); }
    setStairSecondaryBtns(false);
    if (stairPanel) stairPanel.hidden = true;
  });

  stairShowBtn?.addEventListener("click", () => {
    stairPointsVisible = !stairPointsVisible;
    if (stairPointsVisible) {
      showStairDebugUI();
      showCursorCoordinateDisplay();
      stairShowBtn.textContent = "Hide Points";
      stairShowBtn.classList.add("active");
      setStairSecondaryBtns(true);
    } else {
      stopAddMode();
      hideStairDebugUI();
      hideCursorCoordinateDisplay();
      stairDragActive = false;
      stairShowBtn.textContent = "Show Points";
      stairShowBtn.classList.remove("active");
      if (stairDragBtn) { stairDragBtn.textContent = "Drag Edit"; stairDragBtn.classList.remove("active"); }
      setStairSecondaryBtns(false);
    }
  });

  stairDragBtn?.addEventListener("click", () => {
    stairDragActive = !stairDragActive;
    setStairDragEnabled(stairDragActive);
    stairDragBtn.textContent = stairDragActive ? "Drag On" : "Drag Edit";
    stairDragBtn.classList.toggle("active", stairDragActive);
  });

  stairFlyBtn?.addEventListener("click", () => { flyToStairDebugUI(); });

  stairAddBtn?.addEventListener("click", () => {
    stairAddActive = !stairAddActive;
    if (stairAddActive) {
      startStairAddPointMode((index, lon, lat) => {
        // append a new card for the added point
        if (!stairCards) return;
        const floorTag = index === 0
          ? { label: "2nd Floor", cls: "floor-2nd" }
          : index === 4
            ? { label: "3rd Floor", cls: "floor-3rd" }
            : { label: `Step ${index + 1}`, cls: "floor-landing" };
        const card = document.createElement("div");
        card.className = "stair-point-card";
        card.innerHTML = `
          <div class="stair-point-card-header">
            <span>Point ${index + 1}</span>
            <span class="stair-point-floor-tag ${floorTag.cls}">${floorTag.label}</span>
          </div>
          <div class="stair-point-inputs">
            <input id="stairLat${index}" type="text" value="${lat.toFixed(9)}" placeholder="Latitude" />
            <input id="stairLon${index}" type="text" value="${lon.toFixed(9)}" placeholder="Longitude" />
            <button class="btn" type="button" data-stair-update="${index}">✓</button>
          </div>`;
        stairCards.appendChild(card);
        card.querySelector<HTMLButtonElement>("[data-stair-update]")?.addEventListener("click", (e) => {
          const idx = Number((e.currentTarget as HTMLButtonElement).dataset.stairUpdate);
          const latVal = parseFloat((document.getElementById(`stairLat${idx}`) as HTMLInputElement).value);
          const lonVal = parseFloat((document.getElementById(`stairLon${idx}`) as HTMLInputElement).value);
          if (!isNaN(latVal) && !isNaN(lonVal)) setStairPathPoint(idx, lonVal, latVal);
        });
      });
      stairAddBtn.textContent = "🔴 Adding…";
      stairAddBtn.classList.add("active");
    } else {
      stopAddMode();
    }
  });

  stairUndoBtn?.addEventListener("click", () => {
    const removed = removeLastStairPathPoint();
    if (removed && stairCards) {
      stairCards.removeChild(stairCards.lastElementChild!);
    }
  });

  stairCopyBtn?.addEventListener("click", async () => {
    await copyStairPathToClipboard();
    const prev = stairCopyBtn.textContent;
    stairCopyBtn.textContent = "✓ Copied!";
    window.setTimeout(() => { stairCopyBtn.textContent = prev; }, 1800);
  });
}

bootstrap().catch((error) => {
  console.error("Application startup failed:", error);
  setNavigationMessage("Application startup failed. Check the console.");
});

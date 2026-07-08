import "./styles.css";
import { Cesium, viewer, ALT_2ND, ALT_3RD } from "./viewer";
import { loadModels } from "./models";
import { getSelectedFloor, initSmartFloorCamera, openFloorProfessional, preloadFloor, showFloor } from "./floors";
import { getNavigableRoomNames, loadRooms } from "./rooms";
import { getNavigablePersonNames, chairNavPoints, loadChairsForFloor, thirdFloorChairs, secondFloorChairs } from "./chairs";
import { initializeCalendar } from "./calendar";
import {
  exitNavigation,
  installCorridorPointDebug,
  installIntermediatePointDebug,
  installStairPathDebug,
  startNavigation,
  flyRoutePreview,
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
  setCorridorDrawNodeMode,
  setCorridorConnectMode,
  stopCorridorDrawTool,
  undoCorridorDraw,
  clearCorridorDrawTool,
  getCorridorDrawGeoJSON,
} from "./navigation";
import { clearCctvViewshed } from "./cameraShed/cctvViewshed";
import { initAssetPopup } from "./assetPopup";
import { initComplaintForm } from "./complaintForm";
import {
  bindCctvPanel,
  bindUiControls,
  installSceneInteractions,
  populateRoomDropdowns,
  setNavigationMessage,
  openBookingPanel,
  showRoomInfoCard,
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
import { createBooking, getCurrentEvents, showToast, fetchGlobalEvents, matchRoomName } from "./booking";
import { initAssistant, handleAssistantQuery, type MarkerPoint } from "./assistant";
import { initAmenities } from "./amenities/index";
import { mountSolarWorkspace } from "./solar-react/mount";
import { highlightBuildingAt } from "./gis/buildingHighlight";

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

  await new Promise<void>((resolve) => setTimeout(resolve, 7200));
  splash.classList.add("splash-hidden");
  await new Promise<void>((resolve) => setTimeout(resolve, 600));
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
  initAssetPopup();
  initComplaintForm();


  document.getElementById("flyPreviewBtn")?.addEventListener("click", async () => {
    showFloorSpinner("Preparing route...");
    try {
      clearCctvViewshed();
      await startNavigation();
    } finally {
      hideFloorSpinner();
    }
    flyRoutePreview();
  });
  setNavigationMessage("Loading building data...");

  const applySelectedFloor = (): void => showFloor(getSelectedFloor());
  const roomLoad = loadRooms().then(applySelectedFloor);
  const modelLoad = loadModels();

  const isMobile = window.innerWidth < 768;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      isMobile ? 77.133683 : 77.133783,
      28.670903,
      isMobile ? 95.0 : 81.51
    ),
    orientation: {
      heading: Cesium.Math.toRadians(342.04),
      pitch: Cesium.Math.toRadians(-84.94),
      roll: 0,
    },
  });

  await playOnboardingSplash();

  await Promise.all([modelLoad, roomLoad]);
  await installCorridorPointDebug();
  populateRoomDropdowns(getNavigableRoomNames(), getNavigablePersonNames());
  applySelectedFloor();
  initSmartFloorCamera();
  installStairPathDebug();
  await installIntermediatePointDebug();
  preloadHeavyFloorsInBackground();

  installSceneInteractions(getSelectedFloor, {
    onRoomClick: (roomName, rawName) => {
      showRoomInfoCard(rawName ?? roomName, getCurrentEvents());
    },
    onMapClick: (lat, lon) => {
      void highlightBuildingAt(lat, lon);
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
  installAssistant();
  initAmenities();
  mountSolarWorkspace();
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

  // ── Corridor Draw Tool Panel ───────────────────────────────────────────────
  const corridorPanel      = document.getElementById("corridorDebugPanel") as HTMLElement | null;
  const corridorOpenBtn    = document.getElementById("corridorDebugOpenBtn") as HTMLButtonElement | null;
  const corridorCloseBtn   = document.getElementById("corridorDebugCloseBtn") as HTMLButtonElement | null;
  const corridorAddBtn     = document.getElementById("corridorAddNodeBtn") as HTMLButtonElement | null;
  const corridorConnBtn    = document.getElementById("corridorConnectBtn") as HTMLButtonElement | null;
  const corridorUndoBtn    = document.getElementById("corridorUndoBtn") as HTMLButtonElement | null;
  const corridorClearBtn   = document.getElementById("corridorClearBtn") as HTMLButtonElement | null;
  const corridorCopyBtn  = document.getElementById("corridorCopyGeoJSONBtn") as HTMLButtonElement | null;
  const corridorStatus   = document.getElementById("corridorDebugStatus") as HTMLElement | null;

  type CDrawMode = "node" | "connect" | null;
  let cDrawMode: CDrawMode = null;

  function setCDrawStatus(msg: string): void {
    if (corridorStatus) corridorStatus.textContent = msg;
  }

  function setCDrawMode(mode: CDrawMode): void {
    cDrawMode = mode;
    if (corridorAddBtn) corridorAddBtn.classList.toggle("active", mode === "node");
    if (corridorConnBtn) corridorConnBtn.classList.toggle("active", mode === "connect");
    if (mode === "node") {
      setCorridorDrawNodeMode();
      setCDrawStatus("Click on the floor to place nodes");
    } else if (mode === "connect") {
      setCorridorConnectMode();
      setCDrawStatus("Click node 1, then node 2 to connect them");
    } else {
      stopCorridorDrawTool();
      setCDrawStatus("Paused — choose Add Node or Connect");
    }
  }

  corridorOpenBtn?.addEventListener("click", () => {
    if (corridorPanel) corridorPanel.hidden = false;
    setCDrawStatus("Click '+ Node' to start placing corridor points");
  });

  corridorCloseBtn?.addEventListener("click", () => {
    if (corridorPanel) corridorPanel.hidden = true;
    setCDrawMode(null);
  });

  corridorAddBtn?.addEventListener("click", () => {
    setCDrawMode(cDrawMode === "node" ? null : "node");
  });

  corridorConnBtn?.addEventListener("click", () => {
    setCDrawMode(cDrawMode === "connect" ? null : "connect");
  });

  corridorUndoBtn?.addEventListener("click", () => {
    undoCorridorDraw();
    setCDrawStatus("Undone last action");
  });

  corridorClearBtn?.addEventListener("click", () => {
    clearCorridorDrawTool();
    setCDrawMode(null);
    setCDrawStatus("Cleared — start fresh");
  });

  corridorCopyBtn?.addEventListener("click", () => {
    const json = getCorridorDrawGeoJSON();
    navigator.clipboard.writeText(json).then(() => {
      const prev = corridorCopyBtn!.textContent;
      corridorCopyBtn!.textContent = "✓ Copied!";
      window.setTimeout(() => { corridorCopyBtn!.textContent = prev; }, 2000);
    });
    console.info("Corridor GeoJSON:\n", json);
  });
}

function findClosestOption(select: HTMLSelectElement, query: string): string | null {
  const q = query.toLowerCase().trim();
  const options = Array.from(select.options);
  const exact = options.find((o) => o.value.toLowerCase() === q);
  if (exact) return exact.value;
  const partial = options.find((o) => o.value.toLowerCase().includes(q) || q.includes(o.value.toLowerCase().replace(/\[person\]\s*/i, "")));
  return partial?.value ?? null;
}

function installAssistant(): void {
  const fab = document.getElementById("assistantFab") as HTMLButtonElement | null;
  const panel = document.getElementById("assistantPanel") as HTMLElement | null;
  const closeBtn = document.getElementById("assistantCloseBtn") as HTMLButtonElement | null;
  const input = document.getElementById("assistantInput") as HTMLInputElement | null;
  const sendBtn = document.getElementById("assistantSendBtn") as HTMLButtonElement | null;
  const voiceBtn = document.getElementById("assistantVoiceBtn") as HTMLButtonElement | null;
  const messages = document.getElementById("assistantMessages") as HTMLElement | null;
  const suggestions = document.getElementById("assistantSuggestions") as HTMLElement | null;

  if (!fab || !panel || !input || !sendBtn || !messages) return;

  initAssistant({
    navigateToRoom: async (from, to) => {
      const fromSel = document.getElementById("fromRoom") as HTMLSelectElement;
      const toSel = document.getElementById("toRoom") as HTMLSelectElement;
      // Try to find the from room; if not found fall back to the first option ("current position")
      const fromVal = findClosestOption(fromSel, from) ?? (fromSel.options[0]?.value ?? null);
      const toVal = findClosestOption(toSel, to);
      if (!toVal) throw new Error(`Could not find destination room: "${to}"`);
      if (fromVal) fromSel.value = fromVal;
      toSel.value = toVal;
      clearCctvViewshed();
      showFloorSpinner("Preparing navigation...");
      try { await startNavigation(); } finally { hideFloorSpinner(); }
    },

    navigateToPerson: async (name) => {
      const toSel = document.getElementById("toRoom") as HTMLSelectElement;
      const fromSel = document.getElementById("fromRoom") as HTMLSelectElement;
      const q = name.toLowerCase().trim();
      const options = Array.from(toSel.options);
      const match = options.find((o) => {
        const cleaned = o.value.toLowerCase().replace(/\[person\]\s*/i, "").replace(/\s*\(.*?\)/, "");
        return cleaned.includes(q) || q.includes(cleaned);
      });
      if (!match) throw new Error(`Could not find person: "${name}"`);
      toSel.value = match.value;
      if (fromSel.options.length > 0) fromSel.value = fromSel.options[0].value;
      clearCctvViewshed();
      showFloorSpinner("Preparing navigation...");
      try { await startNavigation(); } finally { hideFloorSpinner(); }
    },

    checkAvailability: async (room) => {
      const matched = matchRoomName(room);
      if (!matched) return `I don't know a room called "${room}".`;
      const events = await fetchGlobalEvents();
      const now = new Date();
      const active = events.find((e) => e.room === matched && e.start <= now && e.end >= now);
      if (active) {
        const end = active.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `${matched} is currently occupied until ${end} (${active.title}).`;
      }
      const next = events.find((e) => e.room === matched && e.start > now);
      if (next) {
        const start = next.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `${matched} is free right now. Next booking at ${start}.`;
      }
      return `${matched} is free for the rest of the day.`;
    },

    openBooking: (room) => {
      openBookingPanel(room, getCurrentEvents());
    },

    showFloor: (floor) => {
      void openFloorProfessional(floor);
    },

    showMarkers: (points: MarkerPoint[], floor: number) => {
      const alt = (floor === 4 ? ALT_3RD : ALT_2ND) + 0.4;
      for (const pt of points) {
        viewer.entities.add({
          name: pt.label ?? "marker",
          position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, alt),
          point: {
            pixelSize: 14,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } as any,
          label: pt.label ? {
            text: pt.label,
            font: "11px sans-serif",
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            outlineColor: Cesium.Color.BLACK,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -18),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: Cesium.HeightReference.NONE,
          } as any : undefined,
        });
      }
      viewer.scene.requestRender();
    },

    clearMarkers: () => {
      viewer.entities.removeAll();
      viewer.scene.requestRender();
    },

    blinkChairs: (indices: number[], floor: number, color: "red" | "green" = "red") => {
      const blinkColor = color === "green" ? Cesium.Color.LIME : Cesium.Color.RED;
      const chairs = floor === 4 ? thirdFloorChairs : secondFloorChairs;
      const targets = chairs.filter((c) => c.chairIndex !== undefined && indices.includes(c.chairIndex));

      void loadChairsForFloor(floor).then(() => {
        const loaded = (floor === 4 ? thirdFloorChairs : secondFloorChairs)
          .filter((c) => c.chairIndex !== undefined && indices.includes(c.chairIndex));
        const all = [...new Set([...targets, ...loaded])];

        let blinkOn = true;
        const interval = setInterval(() => {
          for (const chair of all) {
            chair.color = blinkOn ? blinkColor : Cesium.Color.WHITE;
          }
          viewer.scene.requestRender();
          blinkOn = !blinkOn;
        }, 500);

        setTimeout(() => {
          clearInterval(interval);
          for (const chair of all) { chair.color = Cesium.Color.WHITE; }
          viewer.scene.requestRender();
        }, 10000);
      });
    },

    triggerOutdoorNav: (origin: string, _destination: string) => {
      const panel = document.getElementById("mapDirectionsPanel") as HTMLElement | null;
      const originInput = document.getElementById("mapOriginInput") as HTMLInputElement | null;
      const destInput = document.getElementById("mapDestinationInput") as HTMLInputElement | null;
      const routeBtn = document.getElementById("showGoogleRouteBtn") as HTMLButtonElement | null;
      if (panel) panel.hidden = false;
      if (originInput) originInput.value = origin;
      if (destInput) destInput.value = "FloData Analytics, Shivaji Marg, Delhi";
      if (routeBtn) setTimeout(() => routeBtn.click(), 300);
    },

    startPreviewRoute: () => {
      const btn = document.getElementById("flyPreviewBtn") as HTMLButtonElement | null;
      if (btn && !btn.hidden) {
        btn.click();
      } else {
        // If no route is set yet, start navigation first then preview
        showFloorSpinner("Preparing preview...");
        void startNavigation().then(() => {
          hideFloorSpinner();
          setTimeout(() => {
            document.getElementById("flyPreviewBtn")?.click();
          }, 500);
        }).catch(() => hideFloorSpinner());
      }
    },

    getRoomNames: () => getNavigableRoomNames(),
    getPersonNames: () => getNavigablePersonNames(),
  });

  function addMessage(text: string, role: "user" | "bot" | "thinking" | "error"): HTMLElement {
    const div = document.createElement("div");
    div.className = `assistant-msg assistant-msg--${role}`;
    const span = document.createElement("span");
    if (role === "thinking") {
      span.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    } else {
      span.textContent = text;
    }
    div.appendChild(span);
    messages!.appendChild(div);
    messages!.scrollTop = messages!.scrollHeight;
    return div;
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (input) input.value = "";
    if (sendBtn) sendBtn.disabled = true;
    if (suggestions) suggestions.style.display = "none";

    addMessage(trimmed, "user");
    const thinking = addMessage("", "thinking");

    try {
      const reply = await handleAssistantQuery(trimmed);
      thinking.remove();
      addMessage(reply, "bot");
    } catch (err) {
      thinking.remove();
      addMessage(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  fab.addEventListener("click", () => {
    const isHidden = panel.hidden;
    if (isHidden) {
      panel.hidden = false;
      panel.classList.remove("assistant-panel-hide");
      panel.classList.add("assistant-panel-show");
      fab.classList.add("active");
      if (input) input.focus();
    } else {
      panel.classList.remove("assistant-panel-show");
      panel.classList.add("assistant-panel-hide");
      fab.classList.remove("active");
      setTimeout(() => {
        if (panel.classList.contains("assistant-panel-hide")) {
          panel.hidden = true;
        }
      }, 350);
    }
  });

  closeBtn?.addEventListener("click", () => {
    panel.classList.remove("assistant-panel-show");
    panel.classList.add("assistant-panel-hide");
    fab.classList.remove("active");
    setTimeout(() => {
      if (panel.classList.contains("assistant-panel-hide")) {
        panel.hidden = true;
      }
    }, 350);
  });

  sendBtn.addEventListener("click", () => void send(input?.value ?? ""));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input.value);
    }
  });

  suggestions?.querySelectorAll(".assistant-chip").forEach((chip) => {
    chip.addEventListener("click", () => void send((chip as HTMLElement).textContent ?? ""));
  });

  const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (SpeechRecognitionCtor && voiceBtn) {
    const recognition = new SpeechRecognitionCtor() as any;
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let isRecording = false;
    let listeningMsgEl: HTMLElement | null = null;

    const setRecording = (on: boolean) => {
      isRecording = on;
      voiceBtn.classList.toggle("recording", on);
      voiceBtn.title = on ? "Stop listening" : "Voice input";
    };

    const showListeningMsg = () => {
      listeningMsgEl = document.createElement("div");
      listeningMsgEl.className = "assistant-msg assistant-msg--bot";
      listeningMsgEl.textContent = "🎙️ Listening…";
      messages!.appendChild(listeningMsgEl);
      messages!.scrollTop = messages!.scrollHeight;
    };

    const removeListeningMsg = () => {
      listeningMsgEl?.remove();
      listeningMsgEl = null;
    };

    recognition.onstart = () => {
      showListeningMsg();
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t: string = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (input) input.value = final || interim;
      if (final) {
        removeListeningMsg();
        void send(final.trim());
      }
    };

    recognition.onend = () => {
      removeListeningMsg();
      setRecording(false);
      if (input && input.value.trim()) {
        // fallback: if onresult fired but wasn't final, send whatever is in input
      }
    };

    recognition.onerror = (event: any) => {
      removeListeningMsg();
      setRecording(false);
      const errMap: Record<string, string> = {
        "not-allowed": "Microphone access denied. Please allow microphone in your browser and reload.",
        "no-speech": "No speech detected. Please try again.",
        "audio-capture": "No microphone found. Please connect a microphone.",
        "network": "Network error during voice recognition.",
        "aborted": "",
      };
      const msg = errMap[event.error as string] ?? `Voice error: ${event.error as string}`;
      if (msg) addMessage(msg, "bot");
    };

    voiceBtn.addEventListener("click", () => {
      if (isRecording) {
        recognition.stop();
      } else {
        if (input) input.value = "";
        try {
          recognition.start();
          setRecording(true);
        } catch {
          addMessage("Could not start voice recognition. Please try again.", "bot");
        }
      }
    });
  } else if (voiceBtn) {
    voiceBtn.title = "Voice not supported — use Chrome or Edge";
    voiceBtn.style.opacity = "0.4";
    voiceBtn.style.cursor = "not-allowed";
    voiceBtn.addEventListener("click", () =>
      addMessage("Voice input requires Chrome or Edge browser.", "bot")
    );
  }
}

bootstrap().catch((error) => {
  console.error("Application startup failed:", error);
  setNavigationMessage("Application startup failed. Check the console.");
});

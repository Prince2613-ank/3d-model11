// Floating glassmorphism panel — injected into DOM at runtime.
// Manages all UI state: category toggles, radius, results list, info card, route status.

import {
  AmenityKey, AmenityDef, AMENITY_DEFS, AMENITY_DEF_MAP,
  DEFAULT_RADIUS_M, RouteMode, BUILDING_LAT, BUILDING_LON,
} from "./constants";
import { ParsedAmenity } from "./osmToGeojson";
import { fetchAmenities, clearAmenityCache } from "./overpassService";
import { highlightAmenitySet, highlightAmenityCard, clearAmenityHighlights, drawRadiusBorder, clearRadiusBorder } from "../gis/buildingHighlight";
import {
  renderAmenities, clearCategory, clearAllAmenityEntities,
  renderRoute, clearRoute, flyToPoint, updateUserLocationDot, clearUserLocationDot,
} from "./cesiumRenderer";
import { haversine, fmtDistance, fmtDuration } from "./routingService";
import { startWatchingLocation, stopWatchingLocation } from "./locationService";

// ── UI state ──────────────────────────────────────────────────────────────────
let panelOpen         = false;
let activeCategories  = new Set<AmenityKey>();
let currentRadius     = DEFAULT_RADIUS_M;
let currentRouteMode: RouteMode = "walking";
const results         = new Map<AmenityKey, ParsedAmenity[]>();
const loading         = new Set<AmenityKey>();
let gpsActive         = false;
let userLat: number | null = null;
let userLon: number | null = null;
let selectedId: string | null = null;

// ── DOM refs (set after injection) ────────────────────────────────────────────
let elPanel!:         HTMLElement;
let elNavBtn!:        HTMLElement;
let elCatSidebar!:    HTMLElement;
let elList!:          HTMLElement;
let elSearch!:        HTMLInputElement;
let elSuggestions!:   HTMLElement;
let elSearchLabel!:   HTMLElement;
let elInfoCard!:      HTMLElement;
let elRouteBar!:      HTMLElement;
let elRouteStatus!:   HTMLElement;
let elLoading!:       HTMLElement;
let elEmpty!:         HTMLElement;
let elCount!:         HTMLElement;

// Current search center (changes when user picks a location)
let searchLat = BUILDING_LAT;
let searchLon = BUILDING_LON;
let searchLabel = "Building";

// ── Public API ────────────────────────────────────────────────────────────────

export function initPanel(): void {
  injectCSS();
  injectHTML();
  wireEvents();
}

/** Called by the Cesium click handler when an amenity entity is clicked. */
export function onAmenityEntityClick(amenityId: string): void {
  const found = findById(amenityId);
  if (!found) return;
  showInfoCard(found.amenity, found.def);
  if (!panelOpen) openPanel();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function injectCSS(): void {
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
}

function injectHTML(): void {
  document.body.insertAdjacentHTML("beforeend", HTML);

  elPanel       = document.getElementById("amPanel")!;
  elNavBtn      = document.getElementById("nearbyNavBtn")!;
  elCatSidebar  = document.getElementById("amCatSidebar")!;
  elList        = document.getElementById("amList")!;
  elSearch      = document.getElementById("amSearch")! as HTMLInputElement;
  elSuggestions = document.getElementById("amSuggestions")!;
  elSearchLabel = document.getElementById("amSearchCenter")!;
  elInfoCard    = document.getElementById("amInfoCard")!;
  elRouteBar    = document.getElementById("amRouteBar")!;
  elRouteStatus = document.getElementById("amRouteStatus")!;
  elLoading     = document.getElementById("amLoading")!;
  elEmpty       = document.getElementById("amEmpty")!;
  elCount       = document.getElementById("amCount")!;
}

function wireEvents(): void {
  // Navbar toggle button (lives in index.html)
  elNavBtn.addEventListener("click", () => {
    if (panelOpen) {
      closePanel();
      return;
    }
    openPanel();
  });

  // Close
  document.getElementById("amClose")!.addEventListener("click", closePanel);

  // Search: debounce → forward geocode if > 2 chars; otherwise client-side filter
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  elSearch.addEventListener("input", () => {
    const q = elSearch.value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (q.length <= 2) {
      hideSuggestions();
      renderList();
      return;
    }
    searchTimer = setTimeout(() => geocodeSearch(q), 320);
  });
  elSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hideSuggestions(); elSearch.blur(); }
  });
  document.addEventListener("click", (e) => {
    if (!elSuggestions.contains(e.target as Node) && e.target !== elSearch) hideSuggestions();
  });

  // Category sidebar (event delegation — sidebar lives outside the panel)
  elCatSidebar.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-cat]");
    if (btn) void toggleCategory(btn.dataset.cat as AmenityKey);
  });

  // Radius
  document.getElementById("amRadius")!.addEventListener("change", async (e) => {
    currentRadius = parseInt((e.target as HTMLSelectElement).value, 10);
    drawRadiusBorder(searchLat, searchLon, currentRadius);
    const active = [...activeCategories];
    clearAllAmenityEntities();
    results.clear();
    activeCategories.clear();
    document.querySelectorAll<HTMLElement>("[data-cat]").forEach((b) =>
      b.classList.remove("am-cat--on"),
    );
    for (const cat of active) await toggleCategory(cat);
  });

  // Route mode
  document.getElementById("amMode")!.addEventListener("change", (e) => {
    currentRouteMode = (e.target as HTMLSelectElement).value as RouteMode;
  });

  // GPS
  document.getElementById("amGps")!.addEventListener("click", toggleGPS);

  // Clear all
  document.getElementById("amClearAll")!.addEventListener("click", clearAll);

  // Clear route
  document.getElementById("amClearRoute")!.addEventListener("click", () => {
    clearRoute();
    elRouteBar.hidden = true;
  });

  // Info card actions
  document.getElementById("amInfoClose")!.addEventListener("click", closeInfoCard);
  document.getElementById("amInfoNav")!.addEventListener("click", () => {
    if (!selectedId) return;
    const found = findById(selectedId);
    if (found) void navigateTo(found.amenity);
  });
  document.getElementById("amInfoFly")!.addEventListener("click", () => {
    if (!selectedId) return;
    const found = findById(selectedId);
    if (found) flyToPoint(found.amenity.lat, found.amenity.lon);
    closeInfoCard();
  });
}

// ── Panel open / close ────────────────────────────────────────────────────────

function openPanel(): void {
  panelOpen = true;
  elPanel.classList.add("am-panel--open");
  elNavBtn.classList.add("nearby-nav-btn--active");
  elNavBtn.setAttribute("aria-pressed", "true");
  elNavBtn.setAttribute("title", "Close Nearby Amenities");
  elSearch.focus();
  drawRadiusBorder(searchLat, searchLon, currentRadius);
}
function closePanel(): void {
  panelOpen = false;
  elPanel.classList.remove("am-panel--open");
  elNavBtn.classList.remove("nearby-nav-btn--active");
  elNavBtn.setAttribute("aria-pressed", "false");
  elNavBtn.setAttribute("title", "Explore Nearby Amenities");
  clearAmenityHighlights();
  clearRadiusBorder();
}

// ── Category toggle ───────────────────────────────────────────────────────────

async function toggleCategory(cat: AmenityKey): Promise<void> {
  const btn = document.querySelector<HTMLElement>(`[data-cat="${cat}"]`);

  if (activeCategories.has(cat)) {
    activeCategories.delete(cat);
    results.delete(cat);
    clearCategory(cat);
    btn?.classList.remove("am-cat--on");
    renderList();
    return;
  }

  activeCategories.add(cat);
  btn?.classList.add("am-cat--on");
  loading.add(cat);
  elLoading.hidden = false;

  try {
    const def = AMENITY_DEF_MAP.get(cat)!;

    const applyResults = (raw: ParsedAmenity[], isEnrichment = false) => {
      if (!activeCategories.has(cat)) return; // user toggled off while loading
      const withDist = raw
        .map((a) => ({ ...a, _dist: haversine(searchLat, searchLon, a.lat, a.lon) }))
        .sort((a, b) => a._dist - b._dist);
      results.set(cat, withDist as ParsedAmenity[]);
      if (isEnrichment) clearCategory(cat); // remove fast-path entities before re-drawing
      renderAmenities(cat, withDist, def);
      renderList();
    };

    const raw = await fetchAmenities(
      cat, currentRadius, searchLat, searchLon,
      (enriched) => applyResults(enriched, true), // Overpass arrives later
    );
    applyResults(raw); // Nominatim fast results — show immediately
  } catch (err) {
    toast(`Failed to load ${AMENITY_DEF_MAP.get(cat)?.label ?? cat}: ${err instanceof Error ? err.message : "error"}`);
    activeCategories.delete(cat);
    btn?.classList.remove("am-cat--on");
  } finally {
    loading.delete(cat);
    if (loading.size === 0) elLoading.hidden = true;
  }
}

// ── Geocoding / location search ───────────────────────────────────────────────

interface GeoPlace {
  display_name: string;
  name:         string;
  lat:          string;
  lon:          string;
  type:         string;
  address:      Record<string, string>;
}

const GEO_HEADERS = {
  "Accept-Language": "en-US,en",
  "Accept": "application/json",
  "User-Agent": "FloDataIndoorNav/1.0 (office@flodataanalytics.com)",
};

async function geocodeSearch(q: string): Promise<void> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}&format=json&limit=6` +
      `&addressdetails=1&countrycodes=in&accept-language=en`;
    const res = await fetch(url, { headers: GEO_HEADERS });
    if (!res.ok) { renderList(); return; }
    const places = (await res.json()) as GeoPlace[];
    if (places.length === 0) { hideSuggestions(); renderList(); return; }
    showSuggestions(places);
  } catch {
    hideSuggestions();
    renderList();
  }
}

function showSuggestions(places: GeoPlace[]): void {
  elSuggestions.innerHTML = "";
  for (const p of places) {
    const a    = p.address ?? {};
    const name = a.suburb ?? a.neighbourhood ?? a.road ?? a.amenity ?? p.name ?? p.display_name.split(",")[0];
    const city = a.city ?? a.town ?? a.state_district ?? a.county ?? "";

    const row = document.createElement("button");
    row.className = "am-suggest-row";
    row.innerHTML =
      `<span class="am-suggest-pin">📍</span>` +
      `<div class="am-suggest-text">` +
        `<div class="am-suggest-name">${esc(name)}</div>` +
        (city ? `<div class="am-suggest-city">${esc(city)}</div>` : "") +
      `</div>`;
    row.addEventListener("click", () => void pickLocation(p));
    elSuggestions.appendChild(row);
  }
  elSuggestions.hidden = false;
}

function hideSuggestions(): void {
  elSuggestions.hidden = true;
  elSuggestions.innerHTML = "";
}

async function pickLocation(p: GeoPlace): Promise<void> {
  const lat  = parseFloat(p.lat);
  const lon  = parseFloat(p.lon);
  const a    = p.address ?? {};
  const name = a.suburb ?? a.neighbourhood ?? a.road ?? a.amenity ?? p.name ?? p.display_name.split(",")[0];

  searchLat   = lat;
  searchLon   = lon;
  searchLabel = name;

  elSearch.value = name;
  hideSuggestions();
  updateSearchCenterLabel();
  drawRadiusBorder(searchLat, searchLon, currentRadius);

  flyToPoint(lat, lon, 800);

  // Re-fetch all active categories around the new location
  if (activeCategories.size > 0) {
    const active = [...activeCategories];
    clearAllAmenityEntities();
    results.clear();
    activeCategories.clear();
    document.querySelectorAll<HTMLElement>("[data-cat]").forEach((b) => b.classList.remove("am-cat--on"));
    for (const cat of active) await toggleCategory(cat);
  }
}

function updateSearchCenterLabel(): void {
  const isBuilding = searchLat === BUILDING_LAT && searchLon === BUILDING_LON;
  elSearchLabel.textContent = isBuilding ? "" : `📍 Searching near: ${searchLabel}`;
  elSearchLabel.hidden = isBuilding;
}

// ── Results list ──────────────────────────────────────────────────────────────

function renderList(): void {
  const q = elSearch.value.toLowerCase().trim();
  elList.innerHTML = "";
  let total = 0;

  for (const [cat, items] of results) {
    const def = AMENITY_DEF_MAP.get(cat)!;
    const filtered = items.filter(
      (a) => !q || a.name.toLowerCase().includes(q) || def.label.toLowerCase().includes(q),
    );
    if (!filtered.length) continue;
    total += filtered.length;

    // Category sub-header
    const hdr = document.createElement("div");
    hdr.className = "am-subhdr";
    hdr.innerHTML =
      `<span style="color:${def.color}">${def.icon}</span> ${esc(def.label)} ` +
      `<span class="am-badge">${filtered.length}</span>`;
    elList.appendChild(hdr);

    const shown = filtered.slice(0, 30);
    shown.forEach((a) => elList.appendChild(buildCard(a, def)));

    if (filtered.length > 30) {
      const more = document.createElement("div");
      more.className = "am-more";
      more.textContent = `+ ${filtered.length - 30} more within ${(currentRadius / 1000).toFixed(0)} km`;
      elList.appendChild(more);
    }
  }

  elEmpty.hidden  = true;
  elCount.textContent = total > 0 ? `${total} found` : "";

  // Highlight all result buildings on the Cesium map
  const allAmenities: ParsedAmenity[] = [];
  for (const items of results.values()) allAmenities.push(...items);
  if (allAmenities.length > 0) {
    // Use the first active category's color, or red
    const firstDef = results.size > 0 ? AMENITY_DEF_MAP.get([...results.keys()][0]) : null;
    void highlightAmenitySet(allAmenities, firstDef?.color ?? "#e05050");
  } else {
    clearAmenityHighlights();
  }
}

function openStatus(hours: string): { label: string; cls: string } | null {
  if (!hours) return null;
  if (hours === "24/7") return { label: "Open 24/7", cls: "am-open" };
  // Check if current time falls in today's hours (basic: Mo-Su HH:MM-HH:MM)
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const ranges   = hours.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/g) ?? [];
  for (const range of ranges) {
    const [s, e] = range.split("-").map(t => { const [h,m] = t.split(":"); return +h*60 + +m; });
    if (now >= s && now < e) return { label: "Open now", cls: "am-open" };
  }
  if (ranges.length > 0) return { label: "Closed now", cls: "am-closed" };
  return { label: hours.length < 30 ? hours : "See hours", cls: "am-hours" };
}

function buildCard(am: ParsedAmenity & { _dist?: number }, def: AmenityDef): HTMLElement {
  const dist    = (am as any)._dist as number ?? haversine(searchLat, searchLon, am.lat, am.lon);
  const name    = am.name || def.label;
  const address = am.tags["addr:full"] ||
    [am.tags["addr:housenumber"], am.tags["addr:street"], am.tags["addr:suburb"] ?? am.tags["addr:quarter"]].filter(Boolean).join(", ");
  const status  = openStatus(am.tags["opening_hours"] ?? "");
  const phone   = am.tags["phone"] ?? "";

  const card = document.createElement("div");
  card.className = "am-card";
  card.innerHTML = `
    <div class="am-card-icon" style="background:${def.color}1a;color:${def.color}">${def.icon}</div>
    <div class="am-card-body">
      <div class="am-card-name">${esc(name)}</div>
      <div class="am-card-meta">
        <span class="am-dist">${fmtDistance(dist)}</span>
        ${status ? `<span class="am-status-badge ${status.cls}">${status.label}</span>` : ""}
      </div>
      ${address ? `<div class="am-card-addr">${esc(address)}</div>` : ""}
      ${phone   ? `<div class="am-card-phone">📞 ${esc(phone)}</div>` : ""}
    </div>
    <button class="am-nav-btn" title="Get directions">&#9655;</button>
  `;

  // Click card → info card + fly + highlight this building's polygon
  card.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).classList.contains("am-nav-btn")) return;
    showInfoCard(am, def);
    flyToPoint(am.lat, am.lon, 200);
    void highlightAmenityCard(am);
  });

  card.querySelector(".am-nav-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    void navigateTo(am);
  });

  return card;
}

// ── Nominatim details fetch (lookup by OSM ID, fallback to reverse geocode) ──

interface NominatimResult {
  address: string; phone: string; hours: string; website: string;
  email: string; description: string; operator: string; wikiLink: string;
}

// Convert internal amenity ID (e.g. "node-12345", "way-67890") to Nominatim osm_ids format
function osmIdRef(amenityId: string): string | null {
  const m = amenityId.match(/(?:nom-)?(node|way|relation)-(\d+)/);
  if (!m) return null;
  const prefix = m[1] === "node" ? "N" : m[1] === "way" ? "W" : "R";
  return `${prefix}${m[2]}`;
}

function parseNominatimData(data: any): NominatimResult {
  const a   = data.address   ?? {};
  const ext = data.extratags ?? {};

  const parts = [
    a.house_number,
    a.road ?? a.pedestrian ?? a.footway,
    a.suburb ?? a.neighbourhood ?? a.quarter,
    a.city_district,
    a.city ?? a.town ?? a.village ?? a.municipality,
    a.state,
  ].filter(Boolean);

  const wiki = ext["wikipedia"] ?? ext["wikidata"] ?? "";
  const wikiLink =
    wiki.startsWith("en:") ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.slice(3))}` :
    wiki.startsWith("Q")   ? `https://www.wikidata.org/wiki/${wiki}` : "";

  return {
    address:     parts.join(", "),
    phone:       ext["phone"] ?? ext["contact:phone"] ?? ext["phone:mobile"] ?? "",
    hours:       ext["opening_hours"] ?? ext["service_times"] ?? "",
    website:     ext["website"] ?? ext["contact:website"] ?? ext["url"] ?? "",
    email:       ext["email"] ?? ext["contact:email"] ?? "",
    description: ext["description"] ?? ext["note"] ?? "",
    operator:    ext["operator"] ?? ext["brand"] ?? ext["network"] ?? "",
    wikiLink,
  };
}

const NOM_HEADERS = { "Accept-Language": "en-US,en", "Accept": "application/json", "User-Agent": "FloDataIndoorNav/1.0 (office@flodataanalytics.com)" };

// Fetch phone + website from Wikidata (free, no key, CORS-open)
async function fetchWikidata(qid: string): Promise<{ phone: string; website: string; description: string }> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&format=json&props=claims|descriptions&languages=en&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return { phone: "", website: "", description: "" };
    const data  = await res.json() as any;
    const claims = data.entities?.[qid]?.claims ?? {};
    // P856 = official website, P1329 = phone number, P18 = image, P569 = birth date (skip)
    const website     = claims.P856?.[0]?.mainsnak?.datavalue?.value ?? "";
    const phone       = claims.P1329?.[0]?.mainsnak?.datavalue?.value ?? "";
    const description = data.entities?.[qid]?.descriptions?.en?.value ?? "";
    return { phone, website, description };
  } catch {
    return { phone: "", website: "", description: "" };
  }
}

async function fetchNominatim(am: ParsedAmenity): Promise<NominatimResult> {
  const empty: NominatimResult = { address: "", phone: "", hours: "", website: "", email: "", description: "", operator: "", wikiLink: "" };
  try {
    let data: any = null;

    // ── Step 1: Nominatim lookup by exact OSM ID ──────────────────────────
    const ref = osmIdRef(am.id);
    if (ref) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/lookup?osm_ids=${ref}&format=json&addressdetails=1&extratags=1&namedetails=1`,
        { headers: NOM_HEADERS },
      );
      if (res.ok) {
        const arr = await res.json() as any[];
        if (Array.isArray(arr) && arr.length > 0) data = arr[0];
      }
    }

    // ── Step 2: reverse geocode fallback ─────────────────────────────────
    if (!data) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${am.lat}&lon=${am.lon}&zoom=17&addressdetails=1&extratags=1&namedetails=1`,
        { headers: NOM_HEADERS },
      );
      if (res.ok) data = await res.json();
    }

    if (!data) return empty;

    const result = parseNominatimData(data);

    // ── Step 3: Wikidata enrichment for phone / website / description ─────
    // Many Indian hospitals/hotels have a wikidata= tag in OSM but no phone/hours.
    // Wikidata has structured claims (P856=website, P1329=phone) that fill this gap.
    const qid = (data.extratags ?? {})["wikidata"] ?? "";
    if (qid.startsWith("Q") && (!result.phone || !result.website || !result.description)) {
      const wd = await fetchWikidata(qid);
      return {
        ...result,
        phone:       result.phone       || wd.phone,
        website:     result.website     || wd.website,
        description: result.description || wd.description,
      };
    }

    return result;
  } catch {
    return empty;
  }
}

// ── Info card ─────────────────────────────────────────────────────────────────

function showInfoCard(am: ParsedAmenity, def: AmenityDef): void {
  selectedId = am.id;
  const dist     = haversine(searchLat, searchLon, am.lat, am.lon);
  const walkMins = Math.max(1, Math.round(dist / 80));
  const name     = am.name || def.label;
  const t        = am.tags;

  const tagAddr    = (
    t["addr:full"] ||
    [t["addr:housenumber"], t["addr:street"], t["addr:suburb"] ?? t["addr:quarter"], t["addr:city"] ?? t["addr:town"]].filter(Boolean).join(", ")
  );
  const tagPhone   = t["phone"]         ?? t["contact:phone"]   ?? "";
  const tagWebsite = t["website"]       ?? t["contact:website"] ?? "";
  const tagHours   = t["opening_hours"] ?? "";
  const tagEmail   = t["email"]         ?? t["contact:email"]   ?? "";
  const tagDesc    = t["description"]   ?? "";
  const tagOp      = t["operator"]      ?? t["brand"]           ?? "";

  q("amInfoTitle").textContent  = name;
  q("amInfoType").innerHTML     = `<span class="am-type-badge" style="background:${def.color}22;color:${def.color}">${def.icon} ${def.label}</span>`;
  q("amInfoDist").textContent   = `${fmtDistance(dist)} · ~${walkMins} min walk`;
  q("amInfoCoords").textContent = `${am.lat.toFixed(5)}, ${am.lon.toFixed(5)}`;

  q("amInfoAddr").textContent       = tagAddr || "Loading address…";
  q("amInfoHours").textContent      = tagHours;
  q("amInfoHoursRow").hidden        = !tagHours;
  q("amInfoPhone").innerHTML        = tagPhone ? `<a href="tel:${tagPhone}">${esc(tagPhone)}</a>` : "";
  q("amInfoPhoneRow").hidden        = !tagPhone;
  q("amInfoEmail").innerHTML        = tagEmail ? `<a href="mailto:${tagEmail}">${esc(tagEmail)}</a>` : "";
  q("amInfoEmailRow").hidden        = !tagEmail;
  q("amInfoDesc").textContent       = tagDesc;
  q("amInfoDescRow").hidden         = !tagDesc;
  q("amInfoOperator").textContent   = tagOp;
  q("amInfoOperatorRow").hidden     = !tagOp;
  const wLink = q("amInfoWebsite") as HTMLAnchorElement;
  wLink.href        = tagWebsite || "#";
  wLink.textContent = tagWebsite ? "Visit website ↗" : "";
  q("amInfoWebsiteRow").hidden      = !tagWebsite;

  // Google search fallback — always show so user can find full details
  const googleQuery = `${name} ${t["addr:city"] ?? t["addr:suburb"] ?? "Delhi"}`;
  const gLink = q("amInfoGoogle") as HTMLAnchorElement;
  gLink.href = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`;

  elInfoCard.hidden = false;

  fetchNominatim(am).then((nom) => {
    if (selectedId !== am.id) return;
    if (nom.address) q("amInfoAddr").textContent = nom.address;
    else if (!tagAddr) q("amInfoAddr").textContent = "Address unavailable";

    if (nom.hours && !tagHours) { q("amInfoHours").textContent = nom.hours; q("amInfoHoursRow").hidden = false; }
    if (nom.phone && !tagPhone) { q("amInfoPhone").innerHTML = `<a href="tel:${nom.phone}">${esc(nom.phone)}</a>`; q("amInfoPhoneRow").hidden = false; }
    if (nom.email && !tagEmail) { q("amInfoEmail").innerHTML = `<a href="mailto:${nom.email}">${esc(nom.email)}</a>`; q("amInfoEmailRow").hidden = false; }
    if (nom.description && !tagDesc) { q("amInfoDesc").textContent = nom.description; q("amInfoDescRow").hidden = false; }
    if (nom.operator && !tagOp) { q("amInfoOperator").textContent = nom.operator; q("amInfoOperatorRow").hidden = false; }
    if (nom.website && !tagWebsite) {
      const link = q("amInfoWebsite") as HTMLAnchorElement;
      link.href = nom.website; link.textContent = "Visit website ↗";
      q("amInfoWebsiteRow").hidden = false;
    }
    if (nom.wikiLink) {
      const wk = q("amInfoWikiRow");
      (q("amInfoWiki") as HTMLAnchorElement).href = nom.wikiLink;
      wk.hidden = false;
    }
  });
}

function closeInfoCard(): void {
  elInfoCard.hidden = true;
  selectedId = null;
}

// ── Route / navigation ────────────────────────────────────────────────────────

async function navigateTo(am: ParsedAmenity): Promise<void> {
  const fromLat = userLat ?? BUILDING_LAT;
  const fromLon = userLon ?? BUILDING_LON;
  elRouteBar.hidden   = false;
  elRouteStatus.textContent = "Calculating route…";
  closeInfoCard();

  try {
    const result = await renderRoute(fromLat, fromLon, am.lat, am.lon, currentRouteMode);
    const name   = am.name || "destination";
    elRouteStatus.textContent =
      `To ${esc(name)}: ${fmtDistance(result.distanceM)} · ${fmtDuration(result.durationSec)}`;
  } catch (err) {
    elRouteStatus.textContent = `Route failed: ${err instanceof Error ? err.message : "error"}`;
  }
}

// ── GPS ───────────────────────────────────────────────────────────────────────

function toggleGPS(): void {
  const btn = document.getElementById("amGps")!;
  if (gpsActive) {
    stopWatchingLocation();
    clearUserLocationDot();
    gpsActive = false;
    btn.classList.remove("am-gps--on");
    userLat = null; userLon = null;
  } else {
    startWatchingLocation(
      (loc) => { userLat = loc.lat; userLon = loc.lon; updateUserLocationDot(loc.lat, loc.lon); },
      (msg) => toast(msg),
    );
    gpsActive = true;
    btn.classList.add("am-gps--on");
  }
}

// ── Clear all ─────────────────────────────────────────────────────────────────

function clearAll(): void {
  clearAllAmenityEntities();
  clearRoute();
  clearAmenityCache();
  activeCategories.clear();
  results.clear();
  elRouteBar.hidden = true;
  closeInfoCard();
  document.querySelectorAll<HTMLElement>("[data-cat]").forEach((b) =>
    b.classList.remove("am-cat--on"),
  );
  renderList();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findById(id: string): { amenity: ParsedAmenity; def: AmenityDef } | undefined {
  for (const [cat, items] of results) {
    const found = items.find((a) => a.id === id);
    if (found) return { amenity: found, def: AMENITY_DEF_MAP.get(cat)! };
  }
}

function q(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toast(msg: string): void {
  const el = document.createElement("div");
  el.className = "am-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const HTML = `
<!-- Results panel — slides in from the right -->
<div id="amPanel" class="am-panel" role="complementary" aria-label="Nearby amenities">

  <!-- Header -->
  <div class="am-panel-hdr">
    <div class="am-panel-title-group">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5c9fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>
      <div>
        <div class="am-panel-title">Explore Nearby</div>
        <div class="am-panel-sub">OpenStreetMap · Nominatim</div>
      </div>
    </div>
    <div class="am-hdr-btns">
      <button id="amGps"      class="am-icon-btn am-icon-btn--labeled" title="Toggle GPS location">📍 GPS</button>
      <button id="amClearAll" class="am-icon-btn am-icon-btn--labeled" title="Clear all amenities">🗑 Clear</button>
      <button id="amClose"    class="am-icon-btn am-icon-btn--close am-icon-btn--labeled" title="Close panel">✕ Close</button>
    </div>
  </div>

  <!-- Search + count -->
  <div class="am-search-row">
    <div class="am-search-wrap">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="am-search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="amSearch" class="am-search" type="search" placeholder="Search location (e.g. Rajeev Chowk)…" autocomplete="off"/>
      <div id="amSuggestions" class="am-suggestions" hidden></div>
    </div>
    <span id="amCount" class="am-count"></span>
  </div>
  <!-- Search center indicator (shown when user picks a location) -->
  <div id="amSearchCenter" class="am-search-center" hidden></div>

  <!-- Radius + mode controls -->
  <div class="am-controls">
    <div class="am-select-wrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10z"/></svg>
      <select id="amRadius" class="am-select">
        <option value="1000">1 km</option>
        <option value="2000">2 km</option>
        <option value="5000" selected>5 km</option>
        <option value="10000">10 km</option>
        <option value="20000">20 km</option>
      </select>
    </div>
    <div class="am-select-wrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      <select id="amMode" class="am-select">
        <option value="walking">Walking</option>
        <option value="driving">Driving</option>
        <option value="cycling">Cycling</option>
      </select>
    </div>
  </div>

  <!-- Category strip -->
  <div id="amCatSidebar" class="am-cat-sidebar">
    ${AMENITY_DEFS.map((d) => `
    <button class="am-cat" data-cat="${d.key}" title="${d.label}" style="--c:${d.color}">
      <span class="am-cat-ico">${d.icon}</span>
      <span class="am-cat-lbl">${d.label}</span>
    </button>`).join("")}
  </div>

  <!-- Loading -->
  <div id="amLoading" class="am-loading" hidden>
    <span class="am-spinner"></span><span>Fetching from OpenStreetMap…</span>
  </div>

  <!-- Route bar -->
  <div id="amRouteBar" class="am-route-bar" hidden>
    <span style="font-size:14px;flex-shrink:0">🧭</span>
    <div id="amRouteStatus" class="am-route-status"></div>
    <button id="amClearRoute" class="am-icon-btn am-icon-btn--labeled" title="Clear route">✕ Clear</button>
  </div>

  <!-- Results -->
  <div id="amList" class="am-list"></div>
  <div id="amEmpty" class="am-empty" hidden></div>
</div>

<!-- Detail info card -->
<div id="amInfoCard" class="am-info-card" hidden>
  <div class="am-info-hdr">
    <div>
      <div id="amInfoTitle" class="am-info-title"></div>
      <div id="amInfoType" style="margin-top:3px"></div>
    </div>
    <button id="amInfoClose" class="am-icon-btn am-icon-btn--close am-icon-btn--labeled" title="Close">✕</button>
  </div>
  <div id="amInfoDist" class="am-info-dist"></div>
  <div class="am-info-divider"></div>
  <div class="am-info-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span id="amInfoAddr"></span></div>
  <div id="amInfoOperatorRow" class="am-info-row" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><span id="amInfoOperator"></span></div>
  <div id="amInfoDescRow"     class="am-info-row" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/></svg><span id="amInfoDesc" style="font-style:italic;opacity:.8"></span></div>
  <div id="amInfoHoursRow"    class="am-info-row" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span id="amInfoHours"></span></div>
  <div id="amInfoPhoneRow"    class="am-info-row" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.39 2 2 0 0 1 3.59 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.09 6.09l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span id="amInfoPhone"></span></div>
  <div id="amInfoEmailRow"    class="am-info-row" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span id="amInfoEmail"></span></div>
  <div id="amInfoWebsiteRow"  class="am-info-row" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><a id="amInfoWebsite" target="_blank" rel="noopener noreferrer"></a></div>
  <div id="amInfoWikiRow"     class="am-info-row" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><a id="amInfoWiki" target="_blank" rel="noopener noreferrer" style="color:#60a8f8">Wikipedia / Wikidata ↗</a></div>
  <div class="am-info-row am-coords-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" style="flex-shrink:0;opacity:.35"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg><span id="amInfoCoords" class="am-coords"></span></div>
  <div class="am-info-actions">
    <button id="amInfoNav" class="am-action-btn am-action-btn--primary">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      Directions
    </button>
    <button id="amInfoFly" class="am-action-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M1 6l10 4 2-6 2 6 10-4-10 12z"/></svg>
      View on Map
    </button>
  </div>
  <a id="amInfoGoogle" class="am-google-link" target="_blank" rel="noopener noreferrer">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    Search on Google for more details
  </a>
</div>
`;

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
/* ── Side panel ────────────────────────────────────────────────── */
.am-panel {
  position: fixed; top: 64px; right: -360px;
  width: 348px; height: fit-content; max-height: calc(100dvh - 72px);
  z-index: 1099;
  display: flex; flex-direction: column; overflow: hidden;
  background: linear-gradient(180deg, rgba(6,14,36,.98) 0%, rgba(8,18,44,.97) 100%);
  border: 1px solid rgba(100,150,255,.14);
  border-right: none;
  border-radius: 14px 0 0 14px;
  backdrop-filter: blur(28px) saturate(1.4);
  -webkit-backdrop-filter: blur(28px) saturate(1.4);
  box-shadow: -6px 0 40px rgba(0,0,10,.6), inset 1px 0 0 rgba(255,255,255,.03);
  transition: right .3s cubic-bezier(.4,0,.2,1);
}
.am-panel--open { right: 0; }

/* Header */
.am-panel-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(100,150,255,.1);
  background: rgba(255,255,255,.015);
  flex-shrink: 0;
}
.am-panel-title-group {
  display: flex; align-items: center; gap: 10px;
}
.am-panel-icon {
  width: 28px; height: 28px; color: #5c9fff;
  background: rgba(92,159,255,.1); border-radius: 8px; padding: 5px;
  flex-shrink: 0;
}
.am-panel-title { color: #e0eeff; font-size: 13.5px; font-weight: 700; letter-spacing: -.1px; }
.am-panel-sub   { color: rgba(140,180,255,.38); font-size: 10px; margin-top: 1px; }
.am-hdr-btns    { display: flex; gap: 4px; }

/* Icon buttons */
.am-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14);
  color: rgba(200,225,255,.9); border-radius: 7px;
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .15s; flex-shrink: 0;
}
.am-icon-btn--labeled {
  width: auto; padding: 0 9px; gap: 4px; font-size: 11px; white-space: nowrap;
}
.am-icon-btn:hover { background: rgba(255,255,255,.16); color: #e0f0ff; border-color: rgba(255,255,255,.25); }
.am-icon-btn--close:hover { background: rgba(255,60,60,.18); color: #ffaaaa; border-color: rgba(255,60,60,.3); }
.am-gps--on { background: rgba(33,150,243,.22)!important; border-color: rgba(33,150,243,.5)!important; color: #60c0ff!important; }

/* Fix: CSS display overrides HTML [hidden] attribute — always enforce none */
.am-route-bar[hidden], .am-loading[hidden], .am-empty[hidden],
.am-suggestions[hidden], .am-search-center[hidden] { display: none !important; }

/* Location suggestions dropdown */
.am-search-wrap { position: relative; }
.am-suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  z-index: 1200;
  background: rgba(8,18,48,.98);
  border: 1px solid rgba(100,150,255,.22);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,.7);
  backdrop-filter: blur(20px);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.am-suggest-row {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 9px 12px; border: none; background: transparent;
  cursor: pointer; text-align: left; transition: background .1s;
  border-bottom: 1px solid rgba(100,150,255,.07);
}
.am-suggest-row:last-child { border-bottom: none; }
.am-suggest-row:hover { background: rgba(92,159,255,.1); }
.am-suggest-pin { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
.am-suggest-text { flex: 1; min-width: 0; }
.am-suggest-name { color: #cce4ff; font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.am-suggest-city { color: rgba(140,180,255,.45); font-size: 10px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Search center label */
.am-search-center {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 14px 2px;
  font-size: 10.5px; color: rgba(92,200,130,.7);
  flex-shrink: 0;
}

/* ── Category grid (inside panel, 4 columns) ────────────────────────────── */
.am-cat-sidebar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  padding: 8px 12px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(100,150,255,.08);
}

.am-cat {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  width: 100%; padding: 7px 4px 5px; border-radius: 10px; cursor: pointer;
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
  color: rgba(160,200,255,.45); transition: all .15s ease;
}
.am-cat:hover {
  background: rgba(255,255,255,.1);
  border-color: var(--c);
  color: var(--c);
  transform: translateY(-1px);
}
.am-cat--on {
  background: rgba(255,255,255,.1) !important;
  border-color: var(--c) !important;
  color: var(--c) !important;
  box-shadow: 0 0 10px rgba(0,0,0,.3), inset 0 0 0 1px var(--c);
}
.am-cat-ico { font-size: 18px; line-height: 1; }
.am-cat-lbl { font-size: 7.5px; text-align: center; line-height: 1.2; font-weight: 500; }

/* Search row */
.am-search-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px 6px; flex-shrink: 0;
}
.am-search-wrap {
  flex: 1; position: relative; display: flex; align-items: center;
}
.am-search-icon {
  position: absolute; left: 9px; color: rgba(140,180,255,.35);
  pointer-events: none; flex-shrink: 0;
}
.am-search {
  width: 100%; background: rgba(255,255,255,.04);
  border: 1px solid rgba(100,150,255,.14); border-radius: 9px;
  color: #d8eeff; padding: 7px 10px 7px 30px; font-size: 12.5px; outline: none;
  transition: border-color .15s, background .15s;
}
.am-search:focus { border-color: rgba(92,159,255,.4); background: rgba(255,255,255,.06); }
.am-search::placeholder { color: rgba(160,200,255,.22); }
.am-count { color: rgba(92,159,255,.75); font-size: 10.5px; white-space: nowrap; font-weight: 600; }

/* Controls */
.am-controls {
  display: flex; gap: 7px; padding: 4px 12px 8px; flex-shrink: 0;
}
.am-select-wrap {
  flex: 1; position: relative; display: flex; align-items: center;
}
.am-select-wrap > svg {
  position: absolute; left: 9px; color: rgba(140,180,255,.4); pointer-events: none; flex-shrink: 0;
}
.am-select {
  width: 100%; background: rgba(255,255,255,.04);
  border: 1px solid rgba(100,150,255,.14); border-radius: 9px;
  color: #cce0ff; padding: 6px 8px 6px 26px; font-size: 11.5px;
  cursor: pointer; outline: none; appearance: none;
  transition: border-color .15s;
}
.am-select:focus { border-color: rgba(92,159,255,.4); }

/* Loading */
.am-loading {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 14px; color: rgba(100,180,255,.65); font-size: 11.5px; flex-shrink: 0;
  border-bottom: 1px solid rgba(100,150,255,.07);
}
.am-spinner {
  display: inline-block; width: 14px; height: 14px; flex-shrink: 0;
  border: 1.5px solid rgba(100,190,255,.15); border-top-color: #2196F3;
  border-radius: 50%; animation: am-spin .75s linear infinite;
}
@keyframes am-spin { to { transform: rotate(360deg); } }

/* Route bar */
.am-route-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: rgba(33,150,243,.08);
  border-bottom: 1px solid rgba(33,150,243,.15);
  flex-shrink: 0;
}
.am-route-status { flex: 1; color: #70b8f8; font-size: 11.5px; line-height: 1.4; }

/* Results list */
.am-list { flex: 0 0 auto; overflow-y: auto; padding: 4px 0; max-height: calc(100dvh - 420px); }
.am-list::-webkit-scrollbar { width: 3px; }
.am-list::-webkit-scrollbar-track { background: transparent; }
.am-list::-webkit-scrollbar-thumb { background: rgba(90,140,255,.18); border-radius: 2px; }

.am-subhdr {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px 4px;
  font-size: 9.5px; font-weight: 700;
  color: rgba(150,190,255,.35); text-transform: uppercase; letter-spacing: .8px;
}
.am-badge {
  background: rgba(92,159,255,.14); color: rgba(130,180,255,.7);
  border-radius: 8px; padding: 1px 6px; font-size: 9.5px;
}
.am-more { padding: 2px 14px 8px; font-size: 10.5px; color: rgba(160,200,255,.22); font-style: italic; }

/* Result card */
.am-card {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; cursor: pointer;
  transition: background .12s;
  border-bottom: 1px solid rgba(100,150,255,.05);
}
.am-card:hover { background: rgba(255,255,255,.04); }
.am-card-icon {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.am-card-body  { flex: 1; min-width: 0; }
.am-card-name  { color: #cce4ff; font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.am-card-meta  { display: flex; align-items: center; gap: 5px; margin-top: 2px; flex-wrap: wrap; }
.am-card-addr  { color: rgba(160,200,255,.38); font-size: 9.5px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.am-card-phone { color: rgba(140,200,255,.5); font-size: 9.5px; margin-top: 1px; }
.am-dist       { background: rgba(60,200,90,.1); color: #68d888; border-radius: 6px; padding: 1px 6px; font-size: 9.5px; font-weight: 700; flex-shrink: 0; letter-spacing: .2px; }
.am-addr       { color: rgba(160,200,255,.3); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.am-status-badge { border-radius: 6px; padding: 1px 6px; font-size: 9px; font-weight: 700; flex-shrink: 0; }
.am-open   { background: rgba(46,204,113,.12); color: #2ecc71; }
.am-closed { background: rgba(231,76,60,.12);  color: #e74c3c; }
.am-hours  { background: rgba(241,196,15,.1);  color: #f1c40f; }
.am-nav-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  background: rgba(33,150,243,.12); border: 1px solid rgba(33,150,243,.25);
  color: rgba(80,180,255,.7); border-radius: 8px;
  cursor: pointer; font-size: 14px; flex-shrink: 0; transition: all .14s;
}
.am-nav-btn:hover { background: rgba(33,150,243,.28); color: #80c8ff; }

/* Empty state */
.am-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px 20px; text-align: center;
  color: rgba(160,200,255,.28); font-size: 12.5px; line-height: 1.6;
  flex: 1;
}

/* Info card */
.am-info-card {
  position: fixed; bottom: 16px; right: 360px;
  width: 300px; z-index: 1101;
  background: linear-gradient(160deg, rgba(7,16,40,.98) 0%, rgba(9,20,50,.97) 100%);
  border: 1px solid rgba(100,150,255,.18);
  border-radius: 16px; padding: 16px;
  backdrop-filter: blur(28px) saturate(1.4);
  -webkit-backdrop-filter: blur(28px) saturate(1.4);
  box-shadow: 0 12px 48px rgba(0,0,0,.7), 0 2px 8px rgba(0,0,0,.4);
  animation: am-up .2s cubic-bezier(.34,1.56,.64,1);
}
@keyframes am-up { from { opacity:0; transform:translateY(14px) scale(.97);} to { opacity:1; transform:none;} }
.am-info-hdr   { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
.am-info-title { color: #e8f2ff; font-size: 14px; font-weight: 700; line-height: 1.3; padding-right: 6px; }
.am-info-dist  { color: #4abaee; font-size: 11px; margin-bottom: 10px; font-weight: 600; }
.am-info-divider { height: 1px; background: rgba(100,150,255,.1); margin: 8px 0; }
.am-info-row   { display: flex; gap: 8px; align-items: flex-start; font-size: 11.5px; color: rgba(180,215,255,.55); margin-bottom: 6px; line-height: 1.45; }
.am-info-row a { color: #60a8f8; text-decoration: none; }
.am-info-row a:hover { text-decoration: underline; color: #88c0ff; }
.am-coords     { font-family: monospace; font-size: 10px; color: rgba(160,200,255,.3); }
.am-coords-row { margin-top: 4px; }
.am-type-badge { border-radius: 10px; padding: 2px 9px; font-size: 10.5px; display: inline-block; font-weight: 600; }
.am-info-actions { display: flex; gap: 6px; margin-top: 14px; }
.am-action-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
  padding: 9px 10px; border-radius: 10px;
  border: 1px solid rgba(100,150,255,.2);
  background: rgba(255,255,255,.04); color: rgba(180,210,255,.7);
  cursor: pointer; font-size: 11.5px; font-weight: 500; transition: all .14s;
}
.am-action-btn:hover { background: rgba(255,255,255,.09); color: #c0d8ff; border-color: rgba(100,150,255,.35); }
.am-action-btn--primary {
  background: rgba(33,150,243,.16); border-color: rgba(33,150,243,.4); color: #70c0ff;
}
.am-action-btn--primary:hover { background: rgba(33,150,243,.30); color: #90d4ff; }

/* Google search fallback link */
.am-google-link {
  display: flex; align-items: center; gap: 5px; justify-content: center;
  margin-top: 10px; padding: 7px 10px;
  background: rgba(66,133,244,.08); border: 1px solid rgba(66,133,244,.2);
  border-radius: 8px; color: rgba(130,175,255,.7); font-size: 10.5px;
  text-decoration: none; transition: all .14s;
}
.am-google-link:hover { background: rgba(66,133,244,.18); color: #90b8ff; border-color: rgba(66,133,244,.4); }

/* Toast */
.am-toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  z-index: 9999;
  background: rgba(10,22,54,.96); color: #d8eeff;
  padding: 10px 18px; border-radius: 10px; font-size: 12.5px;
  border: 1px solid rgba(100,150,255,.2);
  box-shadow: 0 6px 24px rgba(0,0,0,.55);
  white-space: nowrap; pointer-events: none;
  animation: am-up .18s ease, am-fade 0.3s ease 3.9s forwards;
}
@keyframes am-fade { to { opacity:0; transform:translateX(-50%) translateY(8px); } }

/* Responsive: full-width on mobile */
@media (max-width: 540px) {
  .am-panel         { width: 100vw; right: -100vw; border-radius: 0; top: 0; max-height: 100dvh; }
  .am-panel--open   { right: 0; }
  .am-info-card     { right: 8px; left: 8px; width: auto; bottom: 70px; }
}
`;

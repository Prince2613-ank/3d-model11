import { Cesium, ALT_2ND, ALT_3RD, viewer } from "./viewer";
import { GlobalEvent, matchRoomName } from "./booking";
import { floorPropertyToLabel, getRoomInventory } from "./roomInventory";
import { fetchRoomsForFloor, findRoomByName } from "./roomData";
import type { RoomDTO } from "./api";
import corridor2Url from "../geodata/2nd_floor_corridor.geojson?url";
import rooms2Url from "../geodata/2nd_floor_room1.geojson?url";
import corridor3Url from "../geodata/3rd_floor_corridor.geojson?url";
import rooms3Url from "../geodata/3rd_floor_room1.geojson?url";
import door2Url from "../geodata/door_2nd.geojson?url";
import door3Url from "../geodata/door_3rd.geojson?url";

const geoJsonAssets: Record<string, string> = {
  "2nd_floor_corridor.geojson": corridor2Url,
  "2nd_floor_room1.geojson": rooms2Url,
  "3rd_floor_corridor.geojson": corridor3Url,
  "3rd_floor_room1.geojson": rooms3Url,
  "door_2nd.geojson": door2Url,
  "door_3rd.geojson": door3Url,
};

export const BOOKABLE_ROOMS = new Set([
  "dojo", "eureka", "manthan", "meeting room", "conference room",
]);

export let geo2: Cesium.GeoJsonDataSource | null = null;
export let geo3: Cesium.GeoJsonDataSource | null = null;

/** Populated by loadRooms(); read by updateRoomAvailability() so live poll updates don't clobber admin-set room details/color. */
let liveRoomsCache: RoomDTO[] = [];
const liveRoomsByFloor = new Map<number, RoomDTO[]>();

export function getLiveRoom(roomName: string, floorLabel?: string): RoomDTO | undefined {
  const floorNumber = floorLabel?.toLowerCase().includes("3rd") ? 4 : floorLabel?.toLowerCase().includes("2nd") ? 3 : null;
  return findRoomByName(floorNumber ? (liveRoomsByFloor.get(floorNumber) ?? []) : liveRoomsCache, roomName);
}

export function geoJsonUrl(fileName: string): string {
  const url = geoJsonAssets[fileName];
  if (!url) throw new Error(`Missing GeoJSON asset: ${fileName}`);
  return url;
}

export function normalizeRoomName(name?: string | null): string {
  return name?.toLowerCase().trim() ?? "";
}

function propertyValue(entity: Cesium.Entity, key: string): string | undefined {
  const value = (entity.properties as any)?.[key];
  return typeof value?.getValue === "function" ? value.getValue() : undefined;
}

function liveRoomDetailsHtml(room: RoomDTO): string {
  const parts: string[] = [];
  if (room.department) parts.push(`<b>Department:</b> ${room.department}`);
  if (room.manager_name) parts.push(`<b>Manager:</b> ${room.manager_name}`);
  if (typeof room.capacity === "number") parts.push(`<b>Capacity:</b> ${room.capacity}`);
  if (room.description) parts.push(room.description);
  return parts.length > 0 ? `<br/>${parts.join("<br/>")}` : "";
}

function styleRoomEntity(entity: Cesium.Entity, altitude: number, liveRooms: RoomDTO[]): void {
  const roomName = propertyValue(entity, "room_name") ?? propertyValue(entity, "name") ?? "Room";
  const normalized = normalizeRoomName(roomName);
  const floorLabel = floorPropertyToLabel(propertyValue(entity, "floor"));
  const inventory = getRoomInventory(roomName, floorLabel);
  const inventoryHtml = inventory
    ? `<br/><b>Seats:</b> ${inventory.seats ?? "N/A"}<br/><b>Assets:</b> ${inventory.items.join(", ")}`
    : "";
  const liveRoom = findRoomByName(liveRooms, roomName);

  // Only admin-managed "bookable" rooms are hidden when the admin panel marks
  // them not visible — structural entities (stairs, pantry, etc.) never have
  // a Room record and must keep rendering regardless of the live list.
  if (BOOKABLE_ROOMS.has(normalized) && liveRooms.length > 0 && !liveRoom) {
    entity.show = false;
    return;
  }
  entity.show = true;

  const detailsHtml = liveRoom ? liveRoomDetailsHtml(liveRoom) : "";

  if (BOOKABLE_ROOMS.has(normalized)) {
    entity.description = new Cesium.ConstantProperty(
      `<b>${roomName}</b>${detailsHtml}${inventoryHtml}<br/>Status: <span style="color:green">Available</span>`
    );
  } else {
    entity.description = new Cesium.ConstantProperty(`<b>${roomName}</b>${detailsHtml}${inventoryHtml}`);
  }

  if (entity.polygon) {
    const fillColor = liveRoom?.color
      ? Cesium.Color.fromCssColorString(liveRoom.color).withAlpha(0.15)
      : Cesium.Color.WHITE.withAlpha(0.05);

    entity.polygon.height = new Cesium.ConstantProperty(altitude);
    entity.polygon.extrudedHeight = new Cesium.ConstantProperty(altitude);
    entity.polygon.material = new Cesium.ColorMaterialProperty(fillColor);
    entity.polygon.outline = new Cesium.ConstantProperty(true);
    entity.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.BLACK.withAlpha(0.05));

    const hierarchy = entity.polygon.hierarchy?.getValue(Cesium.JulianDate.now());
    const positions = hierarchy?.positions ?? [];
    if (positions.length > 0) {
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      const cartographic = Cesium.Cartographic.fromCartesian(sphere.center);
      entity.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, altitude + 2.0)
      );
    }
  } else if (entity.position) {
    entity.point = new Cesium.PointGraphics({
      pixelSize: 40,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  }
}

async function loadGeoJSON(fileName: string, altitude: number, liveRooms: RoomDTO[]): Promise<Cesium.GeoJsonDataSource> {
  const dataSource = await Cesium.GeoJsonDataSource.load(geoJsonUrl(fileName));
  dataSource.entities.values.forEach((entity) => styleRoomEntity(entity, altitude, liveRooms));
  dataSource.show = false;
  await viewer.dataSources.add(dataSource);
  return dataSource;
}

export async function loadRooms(): Promise<void> {
  console.log("Loading rooms GeoJSON...");
  try {
    const [floor3Rooms, floor4Rooms] = await Promise.all([
      fetchRoomsForFloor(3),
      fetchRoomsForFloor(4),
    ]);
    liveRoomsByFloor.set(3, floor3Rooms);
    liveRoomsByFloor.set(4, floor4Rooms);
    liveRoomsCache = [...floor3Rooms, ...floor4Rooms];

    [geo2, geo3] = await Promise.all([
      loadGeoJSON("2nd_floor_room1.geojson", ALT_2ND, floor3Rooms),
      loadGeoJSON("3rd_floor_room1.geojson", ALT_3RD, floor4Rooms),
    ]);
    console.log("Rooms GeoJSON loaded successfully.");
  } catch (error) {
    console.error("Failed to load rooms GeoJSON:", error);
    throw error;
  }
}

export function getNavigableRoomNames(): string[] {
  if (!geo2 || !geo3) return [];
  const rooms = [
    ...geo2.entities.values.map((entity) => ({ name: propertyValue(entity, "room_name"), floorLabel: "2nd Floor" })),
    ...geo3.entities.values.map((entity) => ({ name: propertyValue(entity, "room_name"), floorLabel: "3rd Floor" })),
  ].filter(
    (room): room is { name: string; floorLabel: string } =>
      Boolean(room.name && room.name !== "Employee sitting places" && room.name !== "Stairs")
  );

  const counts = rooms.reduce((map, room) => {
    map.set(room.name, (map.get(room.name) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  return rooms
    .map((room) => (counts.get(room.name) && counts.get(room.name)! > 1 ? `${room.name} (${room.floorLabel})` : room.name))
    .sort((a, b) => a.localeCompare(b));
}

// ── Tooltip ───────────────────────────────────────────────────────
function tooltipHTML(roomName: string, bookings: GlobalEvent[], liveRoom?: RoomDTO): string {
  const detailsHtml = liveRoom ? liveRoomDetailsHtml(liveRoom) : "";

  if (bookings.length === 0) {
    return `<b>${roomName}</b>${detailsHtml}<br/>Status: <span style="color:green">Available</span>`;
  }
  const fmt = (d: Date): string =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const meetings = bookings
    .map(
      (e, i) => `
      <div style="margin-bottom:8px;">
        <b>Meeting ${i + 1}:</b> ${e.title}<br/>
        <b>By:</b> ${e.organizer}<br/>
        <b>Time:</b> ${fmt(e.start)} – ${fmt(e.end)}
      </div>`
    )
    .join("");

  return `<b>${roomName}</b>${detailsHtml}<br/><hr style="margin:4px 0;border:none;border-top:1px solid #ddd;">${meetings}`;
}

// ── Update room availability from global events ───────────────────
export function updateRoomAvailability(events: GlobalEvent[]): void {
  const now = new Date();

  for (let i = 0; i < viewer.dataSources.length; i += 1) {
    const dataSource = viewer.dataSources.get(i);
    for (const entity of dataSource.entities.values) {
      if (!entity.polygon || entity.show === false) continue;
      const rawName = propertyValue(entity, "room_name");
      if (!rawName) continue;
      if (!BOOKABLE_ROOMS.has(normalizeRoomName(rawName))) continue;

      const roomMatch = matchRoomName(rawName);
      if (!roomMatch) continue;

      const liveRoom = findRoomByName(liveRoomsCache, rawName);
      const fillColor = liveRoom?.color
        ? Cesium.Color.fromCssColorString(liveRoom.color).withAlpha(0.15)
        : Cesium.Color.WHITE.withAlpha(0.05);

      const activeBookings = events.filter((e) => e.room === roomMatch && e.end >= now);
      entity.polygon.material = new Cesium.ColorMaterialProperty(fillColor);
      entity.description = new Cesium.ConstantProperty(tooltipHTML(roomMatch, activeBookings, liveRoom));
    }
  }

  viewer.scene.requestRender();
}

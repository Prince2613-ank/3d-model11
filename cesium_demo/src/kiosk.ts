import { Cesium, viewer } from "./viewer";
import { geo2, geo3, normalizeRoomName } from "./rooms";
import { loadChairsForFloor, secondFloorChairs, thirdFloorChairs } from "./chairs";
import { chairObjectKey } from "./assetStatus";
import { api } from "./api";

export interface KioskTarget {
  type: "room" | "asset";
  floor: 3 | 4;
  value: string; // room name, or asset object_key (e.g. "chair-4-27")
}

/** QR codes deep-link here: ?mode=kiosk&floor=3|4&target=room&room=<name> or &target=asset&objectKey=<key> */
export function isKioskMode(): boolean {
  return new URLSearchParams(window.location.search).get("mode") === "kiosk";
}

function getFloorParam(): 3 | 4 | null {
  const raw = new URLSearchParams(window.location.search).get("floor");
  const parsed = raw !== null ? parseInt(raw, 10) : NaN;
  return parsed === 3 || parsed === 4 ? parsed : null;
}

export function getKioskTargetFromUrl(): KioskTarget | null {
  const params = new URLSearchParams(window.location.search);
  const floor = getFloorParam();
  if (!floor) return null;

  const type = params.get("target");
  if (type === "room") {
    const room = params.get("room");
    return room ? { type: "room", floor, value: room } : null;
  }
  if (type === "asset") {
    const objectKey = params.get("objectKey");
    return objectKey ? { type: "asset", floor, value: objectKey } : null;
  }
  return null;
}

function findChairByObjectKey(objectKey: string, floor: 3 | 4) {
  const chairs = floor === 3 ? secondFloorChairs : thirdFloorChairs;
  return chairs.find((chair) => chairObjectKey(chair) === objectKey) ?? null;
}

function findRoomEntity(roomName: string, floor: 3 | 4): Cesium.Entity | null {
  const dataSource = floor === 3 ? geo2 : geo3;
  if (!dataSource) return null;
  const normalized = normalizeRoomName(roomName);
  return (
    dataSource.entities.values.find((entity) => {
      const value = (entity.properties as any)?.room_name?.getValue?.();
      return typeof value === "string" && normalizeRoomName(value) === normalized;
    }) ?? null
  );
}

/** Called once the kiosk target's floor has finished loading. Silently no-ops if the target can't be resolved. */
export async function flyToKioskTarget(target: KioskTarget): Promise<void> {
  if (target.type === "asset") {
    await loadChairsForFloor(target.floor);
    // QR links use the editable Seat ID. Resolve it to the model's permanent
    // object key before locating the chair in Cesium.
    const resolvedKey = await api.get<{ asset: { object_key: string } }>(`/assets/object-key/${encodeURIComponent(target.value)}`)
      .then(({ asset }) => asset.object_key)
      .catch(() => target.value);
    const chair = findChairByObjectKey(resolvedKey, target.floor);
    if (!chair?.boundingSphere) return;
    viewer.camera.flyToBoundingSphere(chair.boundingSphere, {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 2.5),
      duration: 1.5,
    });
    return;
  }

  const entity = findRoomEntity(target.value, target.floor);
  if (!entity) return;
  viewer.flyTo(entity, { duration: 1.5 });
}

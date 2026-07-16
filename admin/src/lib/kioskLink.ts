const VIEWER_BASE_URL = import.meta.env.VITE_VIEWER_BASE_URL || "http://localhost:5500";

/** Links generated here are consumed by cesium_demo/src/kiosk.ts. */
export function buildRoomKioskLink(roomName: string, floorNumber: number): string {
  const params = new URLSearchParams({
    mode: "kiosk",
    floor: String(floorNumber),
    target: "room",
    room: roomName
  });
  return `${VIEWER_BASE_URL}/?${params.toString()}`;
}

export function buildAssetKioskLink(objectKey: string, floorNumber: number): string {
  const params = new URLSearchParams({
    mode: "kiosk",
    floor: String(floorNumber),
    target: "asset",
    objectKey
  });
  return `${VIEWER_BASE_URL}/?${params.toString()}`;
}

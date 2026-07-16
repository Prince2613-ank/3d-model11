import { api, RoomDTO } from "./api";

const cache = new Map<number, Promise<RoomDTO[]>>();

/** Live room records (name, department, manager, capacity, color, visibility) from the admin panel, by numeric floor. */
export function fetchRoomsForFloor(floorNumber: number): Promise<RoomDTO[]> {
  let promise = cache.get(floorNumber);
  if (!promise) {
    promise = api
      .get<{ rooms: RoomDTO[] }>(`/rooms/by-floor-number/${floorNumber}`)
      .then((res) => res.rooms)
      .catch((error) => {
        console.error(`[roomData] Failed to load rooms for floor ${floorNumber}:`, error);
        cache.delete(floorNumber);
        return [];
      });
    cache.set(floorNumber, promise);
  }
  return promise;
}

export function findRoomByName(rooms: RoomDTO[], roomName: string): RoomDTO | undefined {
  const normalized = roomName.toLowerCase().trim();
  return rooms.find((room) => room.name.toLowerCase().trim() === normalized);
}

export type RoomInventory = {
  name: string;
  aliases: string[];
  floorLabel: string;
  seats?: number;
  items: string[];
  bookable: boolean;
  bookingRoomName?: string;
};

export const SECOND_FLOOR_ROOM_INVENTORY: RoomInventory[] = [
  {
    name: "Eureka",
    aliases: ["eureka"],
    floorLabel: "2nd Floor",
    seats: 6,
    items: ["1 big LED screen/TV", "1 locker"],
    bookable: true,
    bookingRoomName: "Eureka",
  },
  {
    name: "Manthan",
    aliases: ["manthan"],
    floorLabel: "2nd Floor",
    seats: 9,
    items: ["1 TV", "1 round table"],
    bookable: true,
    bookingRoomName: "Manthan",
  },
  {
    name: "Dojo",
    aliases: ["dojo"],
    floorLabel: "2nd Floor",
    seats: 4,
    items: ["1 table"],
    bookable: true,
    bookingRoomName: "Dojo",
  },
  {
    name: "Director",
    aliases: ["director", "director cabin"],
    floorLabel: "2nd Floor",
    seats: 2,
    items: ["2 chairs"],
    bookable: false,
  },
  {
    name: "UG's Cabin",
    aliases: ["ug's cabin", "ug cabin", "ugs cabin", "ug's", "ug"],
    floorLabel: "2nd Floor",
    items: [],
    bookable: false,
  },
  {
    name: "VG's Cabin",
    aliases: ["vg's cabin", "vg cabin", "vgs cabin", "vg's", "vg"],
    floorLabel: "2nd Floor",
    items: [],
    bookable: false,
  },
  {
    name: "Pantry",
    aliases: ["pantry", "2nd floor pantry", "pantry 2nd"],
    floorLabel: "2nd Floor",
    seats: 4,
    items: ["4 stools"],
    bookable: false,
  },
];

export const THIRD_FLOOR_ROOM_INVENTORY: RoomInventory[] = [
  {
    name: "Conference Room",
    aliases: ["conference room", "conference"],
    floorLabel: "3rd Floor",
    seats: 12,
    items: ["1 round table", "1 LED display", "1 AC"],
    bookable: true,
    bookingRoomName: "Conference Room",
  },
  {
    name: "Meeting Room",
    aliases: ["meeting room", "metting room", "meeting"],
    floorLabel: "3rd Floor",
    seats: 6,
    items: ["1 round table", "1 LED TV", "1 AC"],
    bookable: true,
    bookingRoomName: "Meeting Room",
  },
  {
    name: "Pantry",
    aliases: ["pantry", "3rd floor pantry", "pantry 3rd"],
    floorLabel: "3rd Floor",
    seats: 8,
    items: ["2 AC", "1 water cooler", "1 coffee machine", "utensils", "1 microwave oven"],
    bookable: false,
  },
  {
    name: "Employee Area",
    aliases: ["employee area", "employee sitting places", "employee sitting area"],
    floorLabel: "3rd Floor",
    items: ["2 AC"],
    bookable: false,
  },
];

const ROOM_INVENTORY = [
  ...SECOND_FLOOR_ROOM_INVENTORY,
  ...THIRD_FLOOR_ROOM_INVENTORY,
];

export function normalizeInventoryName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function floorPropertyToLabel(value?: string | null): string | undefined {
  const normalized = normalizeInventoryName(value ?? "");
  if (normalized.includes("2")) return "2nd Floor";
  if (normalized.includes("3")) return "3rd Floor";
  return undefined;
}

export function getRoomInventory(roomName: string, floorLabel?: string): RoomInventory | null {
  const normalized = normalizeInventoryName(roomName);
  const roomPool = floorLabel
    ? ROOM_INVENTORY.filter((room) => room.floorLabel === floorLabel)
    : ROOM_INVENTORY;
  return (
    roomPool.find(
      (room) =>
        normalizeInventoryName(room.name) === normalized ||
        room.aliases.some((alias) => alias === normalized) ||
        room.aliases.some((alias) => normalized.includes(alias))
    ) ?? null
  );
}

export function formatRoomInventoryForAssistant(floorLabel?: string): string {
  const rooms = floorLabel
    ? ROOM_INVENTORY.filter((room) => room.floorLabel === floorLabel)
    : ROOM_INVENTORY;

  return rooms.map((room) => {
    const seatText = typeof room.seats === "number" ? `${room.seats} seats, ` : "";
    if (!seatText && room.items.length === 0) return `${room.name}: ${room.floorLabel}`;
    return `${room.name}: ${seatText}${room.items.join(", ")}`;
  }).join("; ");
}

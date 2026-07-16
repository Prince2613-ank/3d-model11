require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const BUILDING_NAME = "Flodata Indoor Model";

const FLOORS = [
  {
    number: 3,
    name: "2nd Floor",
    description: "Physical second floor shown as floor 3 in the indoor viewer.",
    rooms: [
      ["UG's Cabin", null], ["Manthan", 9], ["Women Washroom", null],
      ["VG's Cabin", null], ["Eureka", 6], ["Employee Area", 18],
      ["Director", 2], ["Stairs", null], ["Dojo", 4], ["Pantry", 4],
      ["Men Washroom", null], ["Entrance", null], ["Admin", null],
    ],
    chairs: [
      "unknown1", "Shuvankit", "unknown2", "Vidit", "Diksha", "Apoorva",
      "unknown3", "unknown4", "Kushi", "Vishal", "Rohit", "Vibhu",
      "Jiteswar", "Swati", "Chair O", "Chair P", "Ankita", "Himanshi",
    ],
  },
  {
    number: 4,
    name: "3rd Floor",
    description: "Physical third floor shown as floor 4 in the indoor viewer.",
    rooms: [
      ["Meeting Room", 6], ["Conference Room", 12], ["Women Washroom", null],
      ["Men Washroom", null], ["Library", null], ["Employee Area", 34],
      ["Stairs", null], ["Pantry", 8], ["Entrance", null],
    ],
    chairs: [
      "Kush", "Uthkarsh", "Nitish", "Sparsh", "Nimit", "Albin", "Vikas",
      "Shekhar", "Pratham", "Jay", "Desk Chair D", "Desk Chair E", "Harsh",
      "Vikrant", "Raghav", "Aniket", "Manav", "Pushkar", "Astami", "Carig",
      "Anshika", "Vanshika", "Kapil", "Rohit", "3F Chair 25", "Unknown3",
      "Prince", "Samata", "Payel", "Akshay", "Aishwarya", "unknown6",
      "unknown7", "unknown4",
    ],
  },
];

async function upsertBuilding(client) {
  const existing = await client.query(
    "select id from dt_buildings where name = $1 and deleted_at is null order by created_at limit 1",
    [BUILDING_NAME]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await client.query(
    "insert into dt_buildings (name, description) values ($1, $2) returning id",
    [BUILDING_NAME, "Flodata Analytics interactive indoor digital twin."]
  );
  return inserted.rows[0].id;
}

async function upsertFloor(client, buildingId, floor, sortOrder) {
  const result = await client.query(
    `insert into floors (building_id, floor_number, name, description, sort_order)
     values ($1, $2, $3, $4, $5)
     on conflict (building_id, floor_number) where deleted_at is null
     do update set name = excluded.name,
                   description = excluded.description,
                   sort_order = excluded.sort_order,
                   is_visible = true,
                   updated_at = now()
     returning id`,
    [buildingId, floor.number, floor.name, floor.description, sortOrder]
  );
  return result.rows[0].id;
}

async function upsertRoom(client, floorId, name, capacity) {
  const existing = await client.query(
    `select id from rooms
     where floor_id = $1 and lower(name) = lower($2) and deleted_at is null
     order by created_at limit 1`,
    [floorId, name]
  );

  if (existing.rows[0]) {
    await client.query(
      "update rooms set capacity = $2, is_visible = true, updated_at = now() where id = $1",
      [existing.rows[0].id, capacity]
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `insert into rooms (floor_id, name, capacity, description)
     values ($1, $2, $3, $4) returning id`,
    [floorId, name, capacity, `${name} on ${floorId ? "the indoor floor" : "this floor"}.`]
  );
  return inserted.rows[0].id;
}

async function upsertChair(client, floorId, roomId, floorNumber, index, name) {
  const objectKey = `chair-${floorNumber}-${index}`;
  const description = objectKey === "chair-4-27" ? null : `${name}'s chair (${objectKey})`;
  await client.query(
    `insert into assets (object_key, name, category, room_id, floor_id, description)
     values ($1, $2, 'chair', $3, $4, $5)
     on conflict (object_key)
     do update set name = excluded.name,
                   category = 'chair',
                   room_id = excluded.room_id,
                   floor_id = excluded.floor_id,
                   description = excluded.description,
                   deleted_at = null,
                   updated_at = now()`,
    [objectKey, name, roomId, floorId, description]
  );
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const buildingId = await upsertBuilding(client);
    let roomCount = 0;
    let assetCount = 0;

    for (let floorIndex = 0; floorIndex < FLOORS.length; floorIndex += 1) {
      const floor = FLOORS[floorIndex];
      const floorId = await upsertFloor(client, buildingId, floor, floorIndex);
      let employeeAreaId = null;

      for (const [roomName, capacity] of floor.rooms) {
        const roomId = await upsertRoom(client, floorId, roomName, capacity);
        if (roomName === "Employee Area") employeeAreaId = roomId;
        roomCount += 1;
      }

      for (let index = 0; index < floor.chairs.length; index += 1) {
        await upsertChair(client, floorId, employeeAreaId, floor.number, index + 1, floor.chairs[index]);
        assetCount += 1;
      }
    }

    await client.query("commit");
    console.log(`Seed complete: 1 building, ${FLOORS.length} floors, ${roomCount} rooms, ${assetCount} assets.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

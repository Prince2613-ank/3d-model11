import {
  Cesium,
  ALT_2ND,
  ALT_3RD,
  INDOOR_MODEL_LIGHT_COLOR,
  MODEL_SCALE,
  computeMatrix,
  createIndoorImageBasedLighting,
  viewer
} from "./viewer";
import { modelUrl } from "./models";
import { applyChairStatusTint } from "./assetStatus";

export interface ChairModel extends Cesium.Model {
  chairName?: string;
  chairDisplayName?: string;
  chairSeatId?: string;
  chairSeatNumber?: string | null;
  chairIndex?: number;
  chairFloor?: 3 | 4;
  allowPicking: boolean;
  color: Cesium.Color;
}

export const thirdFloorChairs: ChairModel[] = [];
export const secondFloorChairs: ChairModel[] = [];
const chairLoadMap = new Map<3 | 4, Promise<void>>();
const SECOND_FLOOR_CHAIR_BATCH_SIZE = 6;
const THIRD_FLOOR_CHAIR_BATCH_SIZE = 6;
// One shared IBL object — all chairs use identical parameters so no need for 52 separate GPU allocations
const sharedIndoorIBL = createIndoorImageBasedLighting();

const thirdFloorChairNames: Record<number, string> = {
  1: "Kush",
  2: "Uthkarsh",
  3: "Nitish",
  4: "Sparsh",
  5: "Nimit",
  6: "Albin",
  7: "Vikas",
  8: "Shekhar",
  9: "Pratham",
  10: "Jay",
  11: "Desk Chair D",
  12: "Desk Chair E",
  13: "Harsh",
  14: "Vikrant",
  15: "Raghav",
  16: "Aniket",
  17: "Manav",
  18: "Pushkar",
  19: "Astami",
  20: "Carig",
  21: "Anshika",
  22: "Vanshika",
  23: "Kapil",
  24: "Rohit",
  26: "Unknown3",
  27: "Prince",
  28: "Samata",
  29: "Payel",
  30: "Akshay",
  31: "Aishwarya",
  32: "unknown6",
  33: "unknown7",
  34: "unknown4"
};

const secondFloorChairNames: Record<number, string> = {
  1: "unknown1",
  2: "Shuvankit",
  3: "unknown2",
  4: "Vidit",
  5: "Diksha",
  6: "Apoorva",
  7: "unknown3",
  8: "unknown4",
  9: "Kushi",
  10: "Vishal",
  11: "Rohit",
  12: "Vibhu",
  13: "Jiteswar",
  14: "Swati",
  15: "Chair O",
  16: "Chair P",
  17: "Ankita",
  18: "Himanshi"
};

async function loadChair(fileName: string, altitude: number, name: string, index: number, floor: 3 | 4): Promise<ChairModel> {
  const model = (await Cesium.Model.fromGltfAsync({
    url: modelUrl(fileName),
    modelMatrix: computeMatrix(altitude),
    scale: MODEL_SCALE,
    shadows: Cesium.ShadowMode.DISABLED,
    allowPicking: true,
    cull: true,
    incrementallyLoadTextures: true,
    enablePick: true,
    lightColor: INDOOR_MODEL_LIGHT_COLOR,
    imageBasedLighting: sharedIndoorIBL
  } as any)) as ChairModel;

  model.chairName = name;
  model.chairIndex = index;
  model.chairFloor = floor;
  model.id = model;
  model.show = false;
  viewer.scene.primitives.add(model);
  return model;
}

async function loadSecondFloorChairs(onChairLoaded?: (chair: ChairModel) => void): Promise<void> {
  const indexes = Array.from({ length: 18 }, (_, i) => i + 1);
  for (let start = 0; start < indexes.length; start += SECOND_FLOOR_CHAIR_BATCH_SIZE) {
    const batch = indexes.slice(start, start + SECOND_FLOOR_CHAIR_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (index) => {
        try {
          if (secondFloorChairs.some((chair) => chair.chairIndex === index)) return;
          const model = await loadChair(
            `final_2nd_floor_${index}.glb`,
            ALT_2ND,
            secondFloorChairNames[index] ?? `2F Chair ${index}`,
            index,
            3
          );
          secondFloorChairs.push(model);
          onChairLoaded?.(model);
          void applyChairStatusTint(model);
        } catch (error) {
          console.warn(`Missing 2nd floor chair file: final_2nd_floor_${index}.glb`, error);
        }
      })
    );
  }
}

// "unknown6" (chair 32) previously loaded a broken/misplaced asset. It now
// loads a re-exported, already-correctly-positioned model file instead of
// the original — no runtime position/rotation correction needed anymore.
const THIRD_FLOOR_CHAIR_FILE_OVERRIDES: Record<number, string> = {
  32: "32 copy.glb",
};

async function loadThirdFloorChairs(onChairLoaded?: (chair: ChairModel) => void): Promise<void> {
  const indexes = Array.from({ length: 34 }, (_, i) => i + 1);
  for (let start = 0; start < indexes.length; start += THIRD_FLOOR_CHAIR_BATCH_SIZE) {
    const batch = indexes.slice(start, start + THIRD_FLOOR_CHAIR_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (index) => {
        try {
          if (thirdFloorChairs.some((chair) => chair.chairIndex === index)) return;
          const fileName = THIRD_FLOOR_CHAIR_FILE_OVERRIDES[index] ?? `${index}.glb`;
          const model = await loadChair(
            fileName,
            ALT_3RD,
            thirdFloorChairNames[index] ?? `3F Chair ${index}`,
            index,
            4
          );
          thirdFloorChairs.push(model);
          onChairLoaded?.(model);
          void applyChairStatusTint(model);
        } catch (error) {
          console.warn(`Missing 3rd floor chair file: ${index}.glb`, error);
        }
      })
    );
  }
}

export function loadChairsForFloor(floor: number, onChairLoaded?: (chair: ChairModel) => void): Promise<void> {
  if (floor !== 3 && floor !== 4) return Promise.resolve();

  const cached = chairLoadMap.get(floor);
  if (cached) return cached;

  const promise = (floor === 3 ? loadSecondFloorChairs(onChairLoaded) : loadThirdFloorChairs(onChairLoaded))
    .catch((error) => {
      chairLoadMap.delete(floor);
      throw error;
    });
  chairLoadMap.set(floor, promise);
  return promise;
}

export async function loadChairs(onChairLoaded?: (chair: ChairModel) => void): Promise<void> {
  await loadChairsForFloor(3, onChairLoaded);
  await loadChairsForFloor(4, onChairLoaded);
}

export function getPickedChair(position: Cesium.Cartesian2): ChairModel | null {
  const pickedObjects = viewer.scene.drillPick(position, undefined, 7, 7);
  for (const picked of pickedObjects) {
    const candidates = [picked, picked?.primitive, picked?.id, picked?.model, picked?.content?.model];
    for (const candidate of candidates) {
      const model = candidate as ChairModel | undefined;
      if (model?.chairName) {
        return model;
      }
    }
  }
  return null;
}

export function highlightChair(chair: ChairModel | null, color = Cesium.Color.WHITE): void {
  if (!chair) return;
  chair.color = color;
}

// ── Person / chair navigation points ────────────────────────────────────────

export interface ChairNavPoint {
  name: string;
  floor: 3 | 4;  // 3 = 2nd physical floor, 4 = 3rd physical floor
  lat: number;
  lon: number;
}

export const chairNavPoints: ChairNavPoint[] = [
  // 2nd floor (floor=3) — one unique node per chair (nodes 1-18 of 2nd_floor_corridor_v2.geojson)
  { name: "unknown1",  floor: 3, lat: 28.670886321205604, lon: 77.13368028251561 },
  { name: "Shuvankit", floor: 3, lat: 28.670895309105752, lon: 77.13367395601170 },
  { name: "unknown2",  floor: 3, lat: 28.670909041686500, lon: 77.13366524374470 },
  { name: "Vidit",     floor: 3, lat: 28.670916992228854, lon: 77.13365960266368 },
  { name: "Diksha",    floor: 3, lat: 28.670924515237306, lon: 77.13365565763435 },
  { name: "Apoorva",   floor: 3, lat: 28.670932109317192, lon: 77.13365124410326 },
  { name: "unknown3",  floor: 3, lat: 28.670934567587334, lon: 77.13364951638200 },
  { name: "unknown4",  floor: 3, lat: 28.670940667293540, lon: 77.13365915214976 },
  { name: "Kushi",     floor: 3, lat: 28.670945706181264, lon: 77.13366728509138 },
  { name: "Vishal",    floor: 3, lat: 28.670950656667460, lon: 77.13367497602529 },
  { name: "Rohit",     floor: 3, lat: 28.670955783956735, lon: 77.13368195974688 },
  { name: "Vibhu",     floor: 3, lat: 28.670963961099110, lon: 77.13369499897394 },
  { name: "Jiteswar",  floor: 3, lat: 28.670960148297805, lon: 77.13369821782014 },
  { name: "Swati",     floor: 3, lat: 28.670952717324177, lon: 77.13370345760923 },
  { name: "Chair O",   floor: 3, lat: 28.670968583293670, lon: 77.13369141120200 },
  { name: "Chair P",   floor: 3, lat: 28.670980200395720, lon: 77.13368379115549 },
  { name: "Ankita",    floor: 3, lat: 28.670984704682880, lon: 77.13368079113602 },
  { name: "Himanshi",  floor: 3, lat: 28.670986122721004, lon: 77.13368327939159 },

  // 3rd floor (floor=4) — distributed across nodes 1-11 of 3rd_floor_corridor_v2.geojson
  { name: "Kush",         floor: 4, lat: 28.670895046752590, lon: 77.13368116739018 },
  { name: "Uthkarsh",     floor: 4, lat: 28.670895046752590, lon: 77.13368116739018 },
  { name: "Nitish",       floor: 4, lat: 28.670895046752590, lon: 77.13368116739018 },
  { name: "Sparsh",       floor: 4, lat: 28.670952239807892, lon: 77.13364288897440 },
  { name: "Nimit",        floor: 4, lat: 28.670952239807892, lon: 77.13364288897440 },
  { name: "Albin",        floor: 4, lat: 28.670952239807892, lon: 77.13364288897440 },
  { name: "Vikas",        floor: 4, lat: 28.670958840126445, lon: 77.13365225283411 },
  { name: "Shekhar",      floor: 4, lat: 28.670958840126445, lon: 77.13365225283411 },
  { name: "Pratham",      floor: 4, lat: 28.670958840126445, lon: 77.13365225283411 },
  { name: "Jay",          floor: 4, lat: 28.670965520677640, lon: 77.13366146400278 },
  { name: "Desk Chair D", floor: 4, lat: 28.670965520677640, lon: 77.13366146400278 },
  { name: "Desk Chair E", floor: 4, lat: 28.670965520677640, lon: 77.13366146400278 },
  { name: "Harsh",        floor: 4, lat: 28.670971493817120, lon: 77.13367004135578 },
  { name: "Vikrant",      floor: 4, lat: 28.670971493817120, lon: 77.13367004135578 },
  { name: "Raghav",       floor: 4, lat: 28.670971493817120, lon: 77.13367004135578 },
  { name: "Aniket",       floor: 4, lat: 28.670977362195398, lon: 77.13367682666820 },
  { name: "Manav",        floor: 4, lat: 28.670977362195398, lon: 77.13367682666820 },
  { name: "Pushkar",      floor: 4, lat: 28.670977362195398, lon: 77.13367682666820 },
  { name: "Astami",       floor: 4, lat: 28.670988090324453, lon: 77.13366953704205 },
  { name: "Carig",        floor: 4, lat: 28.670988090324453, lon: 77.13366953704205 },
  { name: "Anshika",      floor: 4, lat: 28.670988090324453, lon: 77.13366953704205 },
  { name: "Vanshika",     floor: 4, lat: 28.670992988917380, lon: 77.13366635160304 },
  { name: "Kapil",        floor: 4, lat: 28.670992988917380, lon: 77.13366635160304 },
  { name: "Rohit",        floor: 4, lat: 28.670992988917380, lon: 77.13366635160304 },
  { name: "Unknown3",     floor: 4, lat: 28.671002348834990, lon: 77.13365845073096 },
  { name: "Prince",       floor: 4, lat: 28.671002348834990, lon: 77.13365845073096 },
  { name: "Samata",       floor: 4, lat: 28.671002348834990, lon: 77.13365845073096 },
  { name: "Payel",        floor: 4, lat: 28.671005729825460, lon: 77.13366304941569 },
  { name: "Akshay",       floor: 4, lat: 28.671005729825460, lon: 77.13366304941569 },
  { name: "Aishwarya",    floor: 4, lat: 28.671008778430020, lon: 77.13366743178476 },
  { name: "unknown6",     floor: 4, lat: 28.671008778430020, lon: 77.13366743178476 },
  { name: "unknown7",     floor: 4, lat: 28.671008778430020, lon: 77.13366743178476 },
  { name: "unknown4",     floor: 4, lat: 28.671008778430020, lon: 77.13366743178476 },
];

// ── Actual chair positions (read from loaded GLB models after scene render) ──

const actualChairPositions = new Map<string, { lat: number; lon: number }>();

export function extractAndCacheChairPositions(floor: 3 | 4): void {
  const chairs = floor === 3 ? secondFloorChairs : thirdFloorChairs;
  for (const chair of chairs) {
    if (!chair.chairName || !chair.chairFloor) continue;
    const key = `${chair.chairFloor}:${chair.chairName}`;
    if (actualChairPositions.has(key)) continue;
    const center = chair.boundingSphere?.center;
    if (!center || (center.x === 0 && center.y === 0 && center.z === 0)) continue;
    const carto = Cesium.Cartographic.fromCartesian(center);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    // Sanity-check: must be within the building's bounding box
    if (lat > 28.669 && lat < 28.672 && lon > 77.132 && lon < 77.136) {
      actualChairPositions.set(key, { lat, lon });
    }
  }
}

export function getActualChairPosition(name: string, floor: 3 | 4): { lat: number; lon: number } | null {
  return actualChairPositions.get(`${floor}:${name}`) ?? null;
}

export function findChairByName(name: string, floor: 3 | 4): ChairModel | null {
  const chairs = floor === 3 ? secondFloorChairs : thirdFloorChairs;
  return chairs.find((c) => c.chairName === name) ?? null;
}

/** Case-insensitive (and substring-tolerant) lookup for callers that only have a free-typed name. */
export function findChairByFuzzyName(query: string, floor: 3 | 4): ChairModel | null {
  const q = query.toLowerCase().trim();
  const chairs = floor === 3 ? secondFloorChairs : thirdFloorChairs;
  return (
    chairs.find((c) => c.chairName?.toLowerCase() === q) ??
    chairs.find((c) => {
      const name = c.chairName?.toLowerCase();
      return Boolean(name) && (name!.includes(q) || q.includes(name!));
    }) ??
    null
  );
}

export function getNavigablePersonNames(): string[] {
  const nameFloors = new Map<string, Set<number>>();
  for (const pt of chairNavPoints) {
    const key = pt.name.toLowerCase();
    if (!nameFloors.has(key)) nameFloors.set(key, new Set());
    nameFloors.get(key)!.add(pt.floor);
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const pt of chairNavPoints) {
    const multiFloor = (nameFloors.get(pt.name.toLowerCase())?.size ?? 0) > 1;
    const label = multiFloor
      ? `[Person] ${pt.name} (${pt.floor === 3 ? "2nd" : "3rd"} Floor)`
      : `[Person] ${pt.name}`;
    if (!seen.has(label)) {
      seen.add(label);
      result.push(label);
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

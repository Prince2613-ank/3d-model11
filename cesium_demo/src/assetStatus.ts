import { Cesium, viewer } from "./viewer";
import { api, AssetDTO } from "./api";

// Structural type (not imported from chairs.ts) to avoid a circular module
// dependency — chairs.ts calls into this module after each chair loads.
export interface StatusTintableChair {
  chairFloor?: 3 | 4;
  chairIndex?: number;
  color: Cesium.Color;
}

const STATUS_COLORS: Record<AssetDTO["live_status"], Cesium.Color> = {
  ok: Cesium.Color.WHITE,
  pending: Cesium.Color.RED,
  assigned: Cesium.Color.ORANGE,
  resolved: Cesium.Color.LIME
};

const baseColors = new WeakMap<StatusTintableChair, Cesium.Color>();
const statusCache = new Map<string, AssetDTO["live_status"] | null>();

export function chairObjectKey(chair: StatusTintableChair): string {
  return `chair-${chair.chairFloor}-${chair.chairIndex}`;
}

/** Returns the chair's current status-derived color, defaulting to white if none is known yet. */
export function getChairBaseColor(chair: StatusTintableChair): Cesium.Color {
  return baseColors.get(chair) ?? Cesium.Color.WHITE;
}

export async function fetchChairAsset(chair: StatusTintableChair): Promise<AssetDTO | null> {
  if (chair.chairFloor === undefined || chair.chairIndex === undefined) return null;
  try {
    const { asset } = await api.get<{ asset: AssetDTO }>(`/assets/object-key/${chairObjectKey(chair)}`);
    return asset;
  } catch {
    return null;
  }
}

/** Fetches this chair's registered asset (if any) and tints it red/orange/green by live status. */
export async function applyChairStatusTint(chair: StatusTintableChair): Promise<void> {
  const key = chairObjectKey(chair);
  const asset = await fetchChairAsset(chair);
  statusCache.set(key, asset?.live_status ?? null);

  const color = asset ? STATUS_COLORS[asset.live_status] : Cesium.Color.WHITE;
  baseColors.set(chair, color);
  chair.color = color;
  viewer.scene.requestRender();
}

export function getCachedChairStatus(chair: StatusTintableChair): AssetDTO["live_status"] | null {
  return statusCache.get(chairObjectKey(chair)) ?? null;
}

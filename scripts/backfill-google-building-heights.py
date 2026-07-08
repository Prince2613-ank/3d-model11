"""
Backfills building height using Google's "Open Buildings 2.5D Temporal" dataset
(free, CC-BY-4.0/ODbL, no Earth Engine/billing required — read directly from
the public GCS bucket as a Cloud-Optimized GeoTIFF via HTTP range requests).

Only fills `height` where it is currently NULL. Never touches rows that
already have a height (from OSM tags or elsewhere) or any other column.

Usage:
    python scripts/backfill-google-building-heights.py [minLon] [minLat] [maxLon] [maxLat]

Requires: pip install rasterio rasterstats psycopg2-binary pyproj
"""
import sys
import os
import json
import numpy as np
import psycopg2
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform as shp_transform

# ── Config ───────────────────────────────────────────────────────────────────
DEFAULT_BBOX = (77.128695, 28.665948, 77.138695, 28.675948)  # ~1km around the building
GCS_BASE = "https://storage.googleapis.com/open-buildings-temporal-data/v1"
PRESENCE_THRESHOLD = 0.5
MIN_PIXELS = 4  # require at least this many building-classified pixels to trust an estimate


def load_env():
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def utm_zone_epsg(lon, lat):
    zone = int((lon + 180) / 6) + 1
    return f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"


def find_tile(min_lon, min_lat, max_lon, max_lat):
    """Finds the Open Buildings Temporal manifest + tile covering the given bbox center."""
    center_lon, center_lat = (min_lon + max_lon) / 2, (min_lat + max_lat) / 2
    utm_epsg = utm_zone_epsg(center_lon, center_lat)
    utm_code = utm_epsg.split(":")[1]

    transformer = Transformer.from_crs("EPSG:4326", utm_epsg, always_xy=True)
    easting, northing = transformer.transform(center_lon, center_lat)

    # Manifests are grouped by a 2-char shard prefix we don't know ahead of time —
    # list the bucket to find manifests for this UTM zone, most recent date first.
    import urllib.request
    list_url = f"https://storage.googleapis.com/storage/v1/b/open-buildings-temporal-data/o?prefix=v1/manifests/&maxResults=1000"
    names = []
    page_token = ""
    while True:
        url = list_url + (f"&pageToken={page_token}" if page_token else "")
        with urllib.request.urlopen(url) as resp:
            data = json.load(resp)
        names.extend(item["name"] for item in data.get("items", []))
        page_token = data.get("nextPageToken", "")
        if not page_token:
            break

    candidates = sorted(
        [n for n in names if f"EPSG_{utm_code}_" in n],
        reverse=True  # most recent date first
    )
    if not candidates:
        raise RuntimeError(f"No Open Buildings Temporal manifest found for {utm_epsg}")

    for name in candidates:
        with urllib.request.urlopen(f"https://storage.googleapis.com/open-buildings-temporal-data/{name}") as resp:
            manifest = json.load(resp)
        uri_prefix = manifest["uriPrefix"].replace("gs://open-buildings-temporal-data/", "")
        for ts in manifest["tilesets"]:
            for src in ts["sources"]:
                t = src["affineTransform"]
                w, h = src["dimensions"]["width"], src["dimensions"]["height"]
                xmin, xmax = t["translateX"], t["translateX"] + w * t["scaleX"]
                ymax, ymin = t["translateY"], t["translateY"] + h * t["scaleY"]
                if xmin <= easting <= xmax and ymin <= northing <= ymax:
                    tile_path = uri_prefix + src["uris"][0]
                    return f"https://storage.googleapis.com/open-buildings-temporal-data/{tile_path}", utm_epsg, manifest["name"]
    raise RuntimeError(f"No tile found covering {center_lon},{center_lat} in any {utm_epsg} manifest")


def main():
    load_env()
    bbox = tuple(float(a) for a in sys.argv[1:5]) if len(sys.argv) >= 5 else DEFAULT_BBOX
    min_lon, min_lat, max_lon, max_lat = bbox
    print(f"Bbox: {bbox}")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, ST_AsGeoJSON(geom)
        FROM buildings
        WHERE height IS NULL
          AND geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
        """,
        bbox,
    )
    rows = cur.fetchall()
    print(f"{len(rows)} buildings with NULL height in this bbox")
    if not rows:
        cur.close(); conn.close()
        return

    tile_url, utm_epsg, manifest_name = find_tile(min_lon, min_lat, max_lon, max_lat)
    print(f"Using tile: {tile_url}\nManifest: {manifest_name}")

    transformer_to_utm = Transformer.from_crs("EPSG:4326", utm_epsg, always_xy=True)

    with rasterio.open(f"/vsicurl/{tile_url}") as src:
        xs, ys = transformer_to_utm.transform([min_lon, max_lon], [min_lat, max_lat])
        window = from_bounds(min(xs), min(ys), max(xs), max(ys), src.transform)
        window_transform = src.window_transform(window)

        print("Reading building_height + building_presence bands for the area (one HTTP range read)...")
        height_band = src.read(2, window=window)
        presence_band = src.read(3, window=window)
        print(f"Window shape: {height_band.shape}")

    building_mask = presence_band > PRESENCE_THRESHOLD

    updated = 0
    skipped_no_data = 0
    heights = []

    for building_id, geom_json in rows:
        geom_4326 = shape(json.loads(geom_json))
        geom_utm = shp_transform(lambda x, y: transformer_to_utm.transform(x, y), geom_4326)

        try:
            footprint_mask = geometry_mask(
                [geom_utm], out_shape=height_band.shape, transform=window_transform, invert=True
            )
        except Exception:
            skipped_no_data += 1
            continue

        combined_mask = footprint_mask & building_mask
        pixel_count = combined_mask.sum()

        if pixel_count < MIN_PIXELS:
            skipped_no_data += 1
            continue

        estimated_height = float(np.percentile(height_band[combined_mask], 75))
        if estimated_height <= 0:
            skipped_no_data += 1
            continue

        cur.execute("UPDATE buildings SET height = %s WHERE id = %s", (estimated_height, building_id))
        updated += 1
        heights.append(estimated_height)

    conn.commit()
    cur.close()
    conn.close()

    print(f"\nUpdated {updated} buildings with a height estimate (source: Google Open Buildings Temporal, 75th percentile of masked building pixels)")
    print(f"Skipped {skipped_no_data} buildings (no confident building-height pixels in their footprint)")
    if heights:
        arr = np.array(heights)
        print(f"Height stats: min={arr.min():.1f}m max={arr.max():.1f}m mean={arr.mean():.1f}m median={np.median(arr):.1f}m")


if __name__ == "__main__":
    main()

"""
Converts the downloaded Punjabi Bagh solar-potential GeoPackage into a plain
GeoJSON the Node import script can stream into Postgres.

The source .gpkg (punjabi_bagh_buildings.gpkg, dropped at the repo root) is a
third-party bulk export — provenance unconfirmed — covering ~38k building
footprints with a precomputed May daily solar yield (area_m2, usable_m2,
solar_kw, may_kwh_day, solar_score). See scripts/import-solar-precomputed.js
for how this feeds the "precomputed" path in solarService.ts.

Usage:
    python scripts/export-solar-precomputed.py [path-to-gpkg] [path-to-output-geojson]

Requires: pip install geopandas
"""
import sys
import os

import geopandas as gpd

DEFAULT_INPUT  = os.path.join(os.path.dirname(__file__), "..", "punjabi_bagh_buildings.gpkg")
DEFAULT_OUTPUT = os.path.join(os.path.dirname(__file__), "..", "data", "solar", "punjabi-bagh-solar-may.geojson")


def main():
    input_path  = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INPUT
    output_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT

    print(f"Reading: {input_path}")
    gdf = gpd.read_file(input_path)
    print(f"{len(gdf)} features, CRS={gdf.crs}")

    if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
        print(f"Reprojecting from {gdf.crs} to EPSG:4326")
        gdf = gdf.to_crs(epsg=4326)

    keep_cols = ["id", "area_m2", "usable_m2", "solar_kw", "may_kwh_day", "solar_score", "geometry"]
    gdf = gdf[[c for c in keep_cols if c in gdf.columns]]

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    gdf.to_file(output_path, driver="GeoJSON")
    print(f"Wrote {len(gdf)} features -> {output_path}")


if __name__ == "__main__":
    main()

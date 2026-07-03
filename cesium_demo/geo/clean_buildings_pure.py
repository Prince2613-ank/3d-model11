import json
from shapely.geometry import shape, mapping
from shapely.validation import make_valid
from tqdm import tqdm

INPUT = r"C:\Users\princ\Downloads\delhi_buildings_polygon.geojson"
OUTPUT = r"C:\Users\princ\Downloads\delhi_buildings_clean.geojson"

with open(INPUT, "r", encoding="utf-8") as f:
    data = json.load(f)

clean = []

for feature in tqdm(data["features"]):
    geom = feature.get("geometry")

    if geom is None:
        continue

    try:
        g = shape(geom)

        if g.is_empty:
            continue

        if not g.is_valid:
            g = make_valid(g)

        if g.geom_type not in ("Polygon", "MultiPolygon"):
            continue

        feature["geometry"] = mapping(g)

        clean.append(feature)

    except Exception:
        continue

data["features"] = clean

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(data, f)

print("Finished")
print("Buildings:", len(clean))
import json
from decimal import Decimal
from pathlib import Path

import ijson
from tqdm import tqdm


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "export (1).geojson"
OUTPUT = ROOT / "delhi_buildings_5km.geojson"


def json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


count = 0

with OUTPUT.open("w", encoding="utf-8") as out:
    out.write('{"type":"FeatureCollection","features":[')

    first = True
    with INPUT.open("rb") as f:
        features = ijson.items(f, "features.item")

        for feature in tqdm(features):
            props = feature.get("properties", {})
            geom = feature.get("geometry")

            if not geom:
                continue

            if (
                "building" in props
                and geom.get("type") in ("Polygon", "MultiPolygon")
                and geom.get("coordinates")
            ):
                if not first:
                    out.write(",")

                json.dump(feature, out, default=json_default)
                first = False
                count += 1

    out.write("]}")

print(f"Extracted {count} polygon buildings")
print("Saved:", OUTPUT)

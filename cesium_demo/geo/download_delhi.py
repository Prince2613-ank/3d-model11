import pandas as pd
import mercantile
import requests
from pathlib import Path
from tqdm import tqdm

# Delhi (NCT) approximate bounding box
WEST, SOUTH = 76.84, 28.40
EAST, NORTH = 77.35, 28.90

# Read the CSV (with header)
df = pd.read_csv("dataset-links.csv")

# Rename columns to simplify usage
df.columns = ["country", "quadkey", "url", "size", "date"]

# Microsoft dataset uses Zoom 9 quadkeys
tiles = mercantile.tiles(WEST, SOUTH, EAST, NORTH, zooms=[9])

quadkeys = {mercantile.quadkey(tile) for tile in tiles}

matches = df[df["quadkey"].astype(str).isin(quadkeys)]

print(matches[["quadkey", "size"]])
print(f"\nFound {len(matches)} tiles")

Path("downloads").mkdir(exist_ok=True)

for _, row in tqdm(matches.iterrows(), total=len(matches)):
    file = Path("downloads") / f"{row['quadkey']}.csv.gz"

    if file.exists():
        continue

    print("Downloading", row["quadkey"])

    r = requests.get(row["url"], stream=True)

    with open(file, "wb") as f:
        for chunk in r.iter_content(1024 * 1024):
            if chunk:
                f.write(chunk)

print("Done!")
export interface BuildingFootprint {
  id: string;
  externalId: string | null;
  source: string;
  name: string | null;
  buildingType: string | null;
  height: number;
  levels: number | null;
  areaSqm: number | null;
  geojson: GeoJSON.Geometry;
  centroid: { lat: number; lon: number };
}

export interface IFootprintProvider {
  name: string;
  getByPoint(lat: number, lon: number): Promise<BuildingFootprint | null>;
  getByBbox(minLon: number, minLat: number, maxLon: number, maxLat: number): Promise<BuildingFootprint[]>;
}

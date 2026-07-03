import { LATITUDE, LONGITUDE } from "../viewer";

// ── Building anchor ─────────────────────────────────────────────────────────
export const BUILDING_LAT: number = LATITUDE;
export const BUILDING_LON: number = LONGITUDE;
export const DEFAULT_RADIUS_M = 5000;

// ── Amenity types ───────────────────────────────────────────────────────────
export type AmenityKey =
  | "hospital" | "school" | "restaurant" | "pharmacy" | "bank"
  | "atm" | "mall" | "metro_station" | "parking" | "hotel" | "fuel";

export interface AmenityDef {
  key: AmenityKey;
  label: string;
  icon: string;
  color: string;                          // CSS hex
  rgba: [number, number, number, number]; // Cesium Color 0-1
  heightDefault: number;                  // metres
  overpassFilter: string;                 // primary Overpass bracket expression
  extraFilters?: string[];               // additional union filter lines
  buildingFilter?: string;               // extra way filter to capture building polygons
  nominatimParams?: Record<string, string>[]; // Nominatim structured search param sets
}

export const AMENITY_DEFS: AmenityDef[] = [
  {
    key: "hospital",
    label: "Hospital",
    icon: "🏥",
    color: "#E53935",
    rgba: [0.898, 0.224, 0.208, 0.82],
    heightDefault: 25,
    // Broad filter — covers hospitals, clinics, nursing homes, dispensaries, eye/dental care
    overpassFilter: '["amenity"~"hospital|clinic|doctors|nursing_home|healthcare_centre|dispensary|dentist|veterinary"]',
    extraFilters: [
      '["healthcare"~"hospital|clinic|centre|doctor|pharmacy|optometrist|physiotherapist|nursing_home|dentist|dispensary"]',
      '["amenity"="social_facility"]["social_facility"~"nursing_home|group_home"]',
    ],
    buildingFilter: '["building"~"hospital|clinic|healthcare|medical"]',
    nominatimParams: [{ amenity: "hospital" }, { amenity: "clinic" }, { amenity: "doctors" }],
  },
  {
    key: "school",
    label: "School",
    icon: "🏫",
    color: "#1E88E5",
    rgba: [0.118, 0.533, 0.898, 0.82],
    heightDefault: 18,
    // Covers all educational levels common in India
    overpassFilter: '["amenity"~"school|college|university|kindergarten|language_school|music_school|driving_school"]',
    extraFilters: [
      // landuse=school/education used for school campuses in India (e.g. S M Arya)
      '["landuse"~"school|education"]["name"]',
      '["building"~"school|college|university|kindergarten"]["name"]',
    ],
    // require ["name"] to avoid unnamed building shells showing as "college"
    buildingFilter: '["building"~"school|college|university|kindergarten"]["name"]',
    nominatimParams: [{ amenity: "school" }, { amenity: "college" }, { amenity: "university" }],
  },
  {
    key: "restaurant",
    label: "Restaurant",
    icon: "🍽️",
    color: "#FB8C00",
    rgba: [0.984, 0.549, 0.0, 0.82],
    heightDefault: 12,
    overpassFilter: '["amenity"~"restaurant|fast_food|cafe|food_court|juice_bar|ice_cream"]',
    nominatimParams: [{ amenity: "restaurant" }, { amenity: "fast_food" }],
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    icon: "💊",
    color: "#43A047",
    rgba: [0.263, 0.627, 0.278, 0.82],
    heightDefault: 10,
    overpassFilter: '["amenity"~"pharmacy|chemist|doctors"]',
    nominatimParams: [{ amenity: "pharmacy" }, { amenity: "chemist" }],
  },
  {
    key: "bank",
    label: "Bank",
    icon: "🏦",
    color: "#00897B",
    rgba: [0.0, 0.537, 0.482, 0.82],
    heightDefault: 15,
    overpassFilter: '["amenity"="bank"]',
    nominatimParams: [{ amenity: "bank" }],
  },
  {
    key: "atm",
    label: "ATM",
    icon: "🏧",
    color: "#00ACC1",
    rgba: [0.0, 0.675, 0.757, 0.82],
    heightDefault: 5,
    overpassFilter: '["amenity"="atm"]',
    nominatimParams: [{ amenity: "atm" }],
  },
  {
    key: "mall",
    label: "Mall",
    icon: "🛒",
    color: "#F4511E",
    rgba: [0.957, 0.318, 0.118, 0.82],
    heightDefault: 35,
    overpassFilter: '["shop"~"mall|department_store"]',
    extraFilters:  ['["building"~"retail|commercial"]["name"~"[Mm]all|[Pp]laza|[Ss]quare"]'],
    buildingFilter: '["building"]["shop"~"mall|department_store"]',
    // q= keyword search because Nominatim doesn't support shop= structured param
    nominatimParams: [{ q: "mall" }, { q: "shopping centre" }],
  },
  {
    key: "metro_station",
    label: "Metro",
    icon: "🚇",
    color: "#8E24AA",
    rgba: [0.557, 0.141, 0.667, 0.82],
    heightDefault: 8,
    // Only subway/metro stations — not regular railway stations
    overpassFilter: '["station"="subway"]',
    extraFilters:  ['["railway"="station"]["network"~"[Mm]etro|[Dd]elhi|[Mm]RTS"]'],
    // q= keyword — Nominatim doesn't support railway= structured param
    nominatimParams: [{ q: "metro station" }, { q: "Delhi Metro" }],
  },
  {
    key: "parking",
    label: "Parking",
    icon: "🅿️",
    color: "#757575",
    rgba: [0.459, 0.459, 0.459, 0.82],
    heightDefault: 8,
    overpassFilter: '["amenity"="parking"]',
    nominatimParams: [{ amenity: "parking" }],
  },
  {
    key: "hotel",
    label: "Hotel",
    icon: "🏨",
    color: "#6D4C41",
    rgba: [0.427, 0.298, 0.255, 0.82],
    heightDefault: 30,
    overpassFilter: '["tourism"~"hotel|guest_house|motel|hostel"]',
    extraFilters:  ['["amenity"="hotel"]', '["building"~"hotel|hostel"]'],
    buildingFilter: '["building"~"hotel|hostel"]["tourism"]',
    nominatimParams: [{ amenity: "hotel" }, { q: "hotel" }],
  },
  {
    key: "fuel",
    label: "Petrol Pump",
    icon: "⛽",
    color: "#F9A825",
    rgba: [0.976, 0.659, 0.145, 0.82],
    heightDefault: 6,
    overpassFilter: '["amenity"="fuel"]',
    // amenity=fuel works in Nominatim; add keyword fallbacks for Indian naming
    nominatimParams: [{ amenity: "fuel" }, { q: "petrol pump" }],
  },
];

export const AMENITY_DEF_MAP = new Map<AmenityKey, AmenityDef>(
  AMENITY_DEFS.map((d) => [d.key, d])
);

// ── Route modes ─────────────────────────────────────────────────────────────
export type RouteMode = "walking" | "driving" | "cycling";

export const ROUTE_MODES: { key: RouteMode; label: string; icon: string; osrmProfile: string }[] = [
  { key: "walking",  label: "Walking",  icon: "🚶", osrmProfile: "foot" },
  { key: "driving",  label: "Driving",  icon: "🚗", osrmProfile: "car"  },
  { key: "cycling",  label: "Cycling",  icon: "🚴", osrmProfile: "bike" },
];

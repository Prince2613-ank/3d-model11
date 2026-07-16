/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_ATTENDANCE_API_BASE_URL?: string;
  readonly VITE_ATTENDANCE_BUILDING_LAT?: string;
  readonly VITE_ATTENDANCE_BUILDING_LON?: string;
  readonly VITE_ATTENDANCE_ENTER_RADIUS_METERS?: string;
  readonly VITE_ATTENDANCE_EXIT_RADIUS_METERS?: string;
  readonly VITE_ATTENDANCE_MAX_ACCURACY_METERS?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GROQ_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

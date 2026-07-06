export type UserRole = "user" | "admin";

export type AssetCategory =
  | "chair" | "ac" | "projector" | "door" | "printer" | "monitor"
  | "fire_extinguisher" | "desk" | "elevator" | "light" | "other";

export type AssetLiveStatus = "ok" | "pending" | "assigned" | "resolved";
export type ComplaintPriority = "low" | "medium" | "high" | "critical";
export type ComplaintStatus = "pending" | "assigned" | "resolved" | "rejected";
export type AnnouncementCategory = "power_shutdown" | "maintenance" | "fire_drill" | "holiday" | "other";
export type NotificationType =
  | "complaint_created" | "complaint_assigned" | "complaint_resolved"
  | "complaint_rejected" | "new_complaint_admin" | "announcement";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DtBuilding {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Floor {
  id: string;
  building_id: string;
  floor_number: number;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Room {
  id: string;
  floor_id: string;
  name: string;
  department: string | null;
  capacity: number | null;
  manager_name: string | null;
  description: string | null;
  images: string[];
  color: string | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Asset {
  id: string;
  object_key: string;
  name: string;
  category: AssetCategory;
  room_id: string | null;
  floor_id: string;
  description: string | null;
  image_url: string | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  maintenance_date: string | null;
  attachments: string[];
  live_status: AssetLiveStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Complaint {
  id: string;
  asset_id: string;
  reporter_id: string | null;
  reporter_name: string;
  reporter_email: string;
  issue_type: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  description: string;
  photo_urls: string[];
  room_id: string | null;
  floor_id: string | null;
  camera_position: Record<string, number> | null;
  assigned_to_profile_id: string | null;
  assigned_to_name: string | null;
  assigned_deadline: string | null;
  assigned_notes: string | null;
  admin_reply: string | null;
  resolution_text: string | null;
  resolution_image_url: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  deleted_at: string | null;
}

export interface ComplaintWithAsset extends Complaint {
  asset_name: string;
  asset_category: AssetCategory;
  asset_image_url: string | null;
}

export interface ComplaintHistoryEntry {
  id: string;
  complaint_id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus | null;
  note: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ActivityLogEntry {
  id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string | null;
  is_admin_broadcast: boolean;
  type: NotificationType;
  title: string;
  body: string | null;
  related_complaint_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface DashboardStats {
  openComplaints: number;
  resolvedToday: number;
  avgResolutionHours: number | null;
  assetsWithMostIssues: { asset_id: string; asset_name: string; complaint_count: number }[];
  topFloors: { floor_id: string; floor_name: string; complaint_count: number }[];
  monthlyTrends: { month: string; complaint_count: number }[];
}

/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- ── Extensions ──────────────────────────────────────────────────────────
    create extension if not exists pgcrypto;
    create extension if not exists postgis;

    -- ── Enums ───────────────────────────────────────────────────────────────
    do $$ begin
      create type user_role as enum ('user', 'admin');
    exception when duplicate_object then null; end $$;

    do $$ begin
      create type asset_category as enum (
        'chair', 'ac', 'projector', 'door', 'printer', 'monitor',
        'fire_extinguisher', 'desk', 'elevator', 'light', 'other'
      );
    exception when duplicate_object then null; end $$;

    do $$ begin
      create type asset_live_status as enum ('ok', 'pending', 'assigned', 'resolved');
    exception when duplicate_object then null; end $$;

    do $$ begin
      create type complaint_priority as enum ('low', 'medium', 'high', 'critical');
    exception when duplicate_object then null; end $$;

    do $$ begin
      create type complaint_status as enum ('pending', 'assigned', 'resolved', 'rejected');
    exception when duplicate_object then null; end $$;

    do $$ begin
      create type notification_type as enum (
        'complaint_created', 'complaint_assigned', 'complaint_resolved',
        'complaint_rejected', 'new_complaint_admin', 'announcement'
      );
    exception when duplicate_object then null; end $$;

    do $$ begin
      create type announcement_category as enum (
        'power_shutdown', 'maintenance', 'fire_drill', 'holiday', 'other'
      );
    exception when duplicate_object then null; end $$;

    -- ── updated_at trigger helper ───────────────────────────────────────────
    create or replace function set_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;

    -- ── profiles (extends auth.users) ──────────────────────────────────────
    create table if not exists profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      email text not null,
      display_name text,
      avatar_url text,
      role user_role not null default 'user',
      is_active boolean not null default true,
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create trigger profiles_set_updated_at
      before update on profiles
      for each row execute function set_updated_at();

    -- Auto-create a profile row whenever Supabase Auth creates a user
    -- (Google login lands here via Supabase's auth.users table).
    create or replace function handle_new_auth_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $$
    begin
      insert into public.profiles (id, email, display_name, avatar_url)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
        new.raw_user_meta_data ->> 'avatar_url'
      )
      on conflict (id) do nothing;
      return new;
    end;
    $$;

    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function handle_new_auth_user();

    -- role lookup helper used by RLS policies below (security definer avoids
    -- recursive RLS when profiles itself is protected)
    create or replace function current_user_role()
    returns text
    language sql
    stable
    security definer
    set search_path = public
    as $$
      select role::text from profiles where id = auth.uid();
    $$;

    create or replace function is_admin()
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $$
      select coalesce(current_user_role() = 'admin', false);
    $$;

    -- ── dt_buildings ───────────────────────────────────────────────────────────
    create table if not exists dt_buildings (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      description text,
      created_by uuid references profiles(id),
      updated_by uuid references profiles(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create trigger buildings_set_updated_at
      before update on dt_buildings
      for each row execute function set_updated_at();

    -- ── floors ──────────────────────────────────────────────────────────────
    create table if not exists floors (
      id uuid primary key default gen_random_uuid(),
      building_id uuid not null references dt_buildings(id) on delete cascade,
      floor_number int not null,
      name text not null,
      description text,
      thumbnail_url text,
      is_visible boolean not null default true,
      sort_order int not null default 0,
      created_by uuid references profiles(id),
      updated_by uuid references profiles(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create unique index if not exists floors_building_number_unique
      on floors (building_id, floor_number)
      where deleted_at is null;

    create index if not exists floors_building_id_idx on floors (building_id);

    create trigger floors_set_updated_at
      before update on floors
      for each row execute function set_updated_at();

    -- ── rooms ───────────────────────────────────────────────────────────────
    create table if not exists rooms (
      id uuid primary key default gen_random_uuid(),
      floor_id uuid not null references floors(id) on delete cascade,
      name text not null,
      department text,
      capacity int,
      manager_name text,
      description text,
      images jsonb not null default '[]'::jsonb,
      color text,
      is_visible boolean not null default true,
      created_by uuid references profiles(id),
      updated_by uuid references profiles(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create index if not exists rooms_floor_id_idx on rooms (floor_id);

    create trigger rooms_set_updated_at
      before update on rooms
      for each row execute function set_updated_at();

    -- ── assets ──────────────────────────────────────────────────────────────
    -- object_key is the bridge to the 3D scene: it must match the identifier
    -- the Cesium picking code (chairName / cameraName / similar) reports when
    -- a user clicks a model part, so a click can be resolved to this row.
    create table if not exists assets (
      id uuid primary key default gen_random_uuid(),
      object_key text not null unique,
      name text not null,
      category asset_category not null,
      room_id uuid references rooms(id) on delete set null,
      floor_id uuid not null references floors(id) on delete cascade,
      description text,
      image_url text,
      purchase_date date,
      warranty_expiry date,
      maintenance_date date,
      attachments jsonb not null default '[]'::jsonb,
      live_status asset_live_status not null default 'ok',
      created_by uuid references profiles(id),
      updated_by uuid references profiles(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create index if not exists assets_floor_id_idx on assets (floor_id);
    create index if not exists assets_room_id_idx on assets (room_id);
    create index if not exists assets_live_status_idx on assets (live_status);

    create trigger assets_set_updated_at
      before update on assets
      for each row execute function set_updated_at();

    -- ── asset_history (audit trail for asset edits/moves) ──────────────────
    create table if not exists asset_history (
      id uuid primary key default gen_random_uuid(),
      asset_id uuid not null references assets(id) on delete cascade,
      action text not null,
      changed_by uuid references profiles(id),
      old_values jsonb,
      new_values jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists asset_history_asset_id_idx on asset_history (asset_id);

    -- ── complaints ──────────────────────────────────────────────────────────
    create table if not exists complaints (
      id uuid primary key default gen_random_uuid(),
      asset_id uuid not null references assets(id) on delete restrict,
      reporter_id uuid references profiles(id) on delete set null,
      reporter_name text not null,
      reporter_email text not null,
      issue_type text not null,
      priority complaint_priority not null default 'medium',
      status complaint_status not null default 'pending',
      description text not null,
      photo_urls jsonb not null default '[]'::jsonb,
      room_id uuid references rooms(id) on delete set null,
      floor_id uuid references floors(id) on delete set null,
      camera_position jsonb,
      assigned_to_profile_id uuid references profiles(id),
      assigned_to_name text,
      assigned_deadline timestamptz,
      assigned_notes text,
      admin_reply text,
      resolution_text text,
      resolution_image_url text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      resolved_at timestamptz,
      deleted_at timestamptz
    );

    create index if not exists complaints_asset_id_idx on complaints (asset_id);
    create index if not exists complaints_reporter_id_idx on complaints (reporter_id);
    create index if not exists complaints_status_idx on complaints (status);
    create index if not exists complaints_priority_idx on complaints (priority);
    create index if not exists complaints_floor_id_idx on complaints (floor_id);
    create index if not exists complaints_room_id_idx on complaints (room_id);
    create index if not exists complaints_created_at_idx on complaints (created_at desc);

    create trigger complaints_set_updated_at
      before update on complaints
      for each row execute function set_updated_at();

    -- ── complaint_history (status-change audit trail) ──────────────────────
    create table if not exists complaint_history (
      id uuid primary key default gen_random_uuid(),
      complaint_id uuid not null references complaints(id) on delete cascade,
      actor_id uuid references profiles(id),
      actor_role user_role,
      from_status complaint_status,
      to_status complaint_status,
      note text,
      created_at timestamptz not null default now()
    );

    create index if not exists complaint_history_complaint_id_idx on complaint_history (complaint_id);

    -- ── notifications ───────────────────────────────────────────────────────
    create table if not exists notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references profiles(id) on delete cascade,
      is_admin_broadcast boolean not null default false,
      type notification_type not null,
      title text not null,
      body text,
      related_complaint_id uuid references complaints(id) on delete cascade,
      is_read boolean not null default false,
      created_at timestamptz not null default now()
    );

    create index if not exists notifications_user_id_idx on notifications (user_id);
    create index if not exists notifications_admin_broadcast_idx on notifications (is_admin_broadcast);

    -- ── announcements ───────────────────────────────────────────────────────
    create table if not exists announcements (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      body text not null,
      category announcement_category not null default 'other',
      starts_at timestamptz,
      ends_at timestamptz,
      is_active boolean not null default true,
      created_by uuid references profiles(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );

    create trigger announcements_set_updated_at
      before update on announcements
      for each row execute function set_updated_at();

    -- ── activity_log (append-only, logs everything) ─────────────────────────
    create table if not exists activity_log (
      id uuid primary key default gen_random_uuid(),
      actor_id uuid references profiles(id),
      actor_role user_role,
      action text not null,
      entity_type text not null,
      entity_id uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists activity_log_entity_idx on activity_log (entity_type, entity_id);
    create index if not exists activity_log_created_at_idx on activity_log (created_at desc);

    -- ── Row Level Security ──────────────────────────────────────────────────
    alter table profiles enable row level security;
    alter table dt_buildings enable row level security;
    alter table floors enable row level security;
    alter table rooms enable row level security;
    alter table assets enable row level security;
    alter table asset_history enable row level security;
    alter table complaints enable row level security;
    alter table complaint_history enable row level security;
    alter table notifications enable row level security;
    alter table announcements enable row level security;
    alter table activity_log enable row level security;

    -- profiles: users see/update their own row, admins see/update all
    create policy profiles_select on profiles
      for select using (id = auth.uid() or is_admin());
    create policy profiles_update on profiles
      for update using (id = auth.uid() or is_admin());

    -- dt_buildings / floors / rooms / assets: public read (guests included) for
    -- visible, non-deleted records; admin-only writes
    create policy buildings_select on dt_buildings
      for select using (deleted_at is null or is_admin());
    create policy buildings_write on dt_buildings
      for all using (is_admin()) with check (is_admin());

    create policy floors_select on floors
      for select using ((deleted_at is null and is_visible) or is_admin());
    create policy floors_write on floors
      for all using (is_admin()) with check (is_admin());

    create policy rooms_select on rooms
      for select using ((deleted_at is null and is_visible) or is_admin());
    create policy rooms_write on rooms
      for all using (is_admin()) with check (is_admin());

    create policy assets_select on assets
      for select using (deleted_at is null or is_admin());
    create policy assets_write on assets
      for all using (is_admin()) with check (is_admin());

    create policy asset_history_select on asset_history
      for select using (is_admin());
    create policy asset_history_insert on asset_history
      for insert with check (is_admin());

    -- complaints: reporters see/create their own; only admins update/resolve
    create policy complaints_select on complaints
      for select using (reporter_id = auth.uid() or is_admin());
    create policy complaints_insert on complaints
      for insert with check (auth.uid() is not null and reporter_id = auth.uid());
    create policy complaints_update on complaints
      for update using (is_admin()) with check (is_admin());

    create policy complaint_history_select on complaint_history
      for select using (
        is_admin() or exists (
          select 1 from complaints c
          where c.id = complaint_history.complaint_id and c.reporter_id = auth.uid()
        )
      );
    create policy complaint_history_insert on complaint_history
      for insert with check (is_admin());

    -- notifications: users see their own; admins see broadcast + all
    create policy notifications_select on notifications
      for select using (user_id = auth.uid() or (is_admin_broadcast and is_admin()));
    create policy notifications_update on notifications
      for update using (user_id = auth.uid() or (is_admin_broadcast and is_admin()));
    create policy notifications_insert on notifications
      for insert with check (is_admin());

    -- announcements: public read active ones; admin-only writes
    create policy announcements_select on announcements
      for select using (
        deleted_at is null and is_active and
        (starts_at is null or starts_at <= now()) and
        (ends_at is null or ends_at >= now())
        or is_admin()
      );
    create policy announcements_write on announcements
      for all using (is_admin()) with check (is_admin());

    -- activity_log: admin-only read; writes happen via backend service role
    -- (which bypasses RLS) or admin dashboard actions
    create policy activity_log_select on activity_log
      for select using (is_admin());
    create policy activity_log_insert on activity_log
      for insert with check (is_admin());
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop table if exists activity_log cascade;
    drop table if exists announcements cascade;
    drop table if exists notifications cascade;
    drop table if exists complaint_history cascade;
    drop table if exists complaints cascade;
    drop table if exists asset_history cascade;
    drop table if exists assets cascade;
    drop table if exists rooms cascade;
    drop table if exists floors cascade;
    drop table if exists dt_buildings cascade;

    drop trigger if exists on_auth_user_created on auth.users;
    drop function if exists handle_new_auth_user();
    drop function if exists is_admin();
    drop function if exists current_user_role();
    drop function if exists set_updated_at();

    drop table if exists profiles cascade;

    drop type if exists announcement_category;
    drop type if exists notification_type;
    drop type if exists complaint_status;
    drop type if exists complaint_priority;
    drop type if exists asset_live_status;
    drop type if exists asset_category;
    drop type if exists user_role;
  `);
};

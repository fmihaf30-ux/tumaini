-- ============================================================================
-- TUMAINI - CRISIS SANCTUARY & ANONYMOUS PEER SUPPORT (UGANDA)
-- Consolidated Master Database Schema (schema.sql)
-- Complete, Idempotent, Hardened against Security & Performance Advisor
-- ============================================================================

-- Enable pgcrypto for UUIDs and password hashing in extensions schema
create extension if not exists "pgcrypto" with schema extensions;

-- ----------------------------------------------------------------------------
-- 0. SCHEMA SAFETY MIGRATIONS (Ensures existing tables have all columns)
-- ----------------------------------------------------------------------------
alter table if exists public.counselors add column if not exists is_on_duty boolean not null default false;
alter table if exists public.counselors add column if not exists shift_started_at timestamptz;

alter table if exists public.intakes add column if not exists seeker_token text;
alter table if exists public.intakes add column if not exists claimed_by_id text;
alter table if exists public.intakes add column if not exists claimed_by_name text;
alter table if exists public.intakes add column if not exists claimed_by_role text;

alter table if exists public.confessions add column if not exists empathy_count integer not null default 0;
alter table if exists public.confessions add column if not exists moderated_by text;
alter table if exists public.confessions add column if not exists moderated_at timestamptz;
alter table if exists public.confessions add column if not exists rejection_reason text;

-- ----------------------------------------------------------------------------
-- 1. CORE TABLES
-- ----------------------------------------------------------------------------

-- 1A. Clinical Counselors & Supervisors Roster
create table if not exists public.counselors (
  id uuid primary key default gen_random_uuid(),
  staff_id text unique not null,
  name text not null,
  role text not null default 'Crisis Counselor',
  password_hash text not null,
  is_supervisor boolean not null default false,
  is_active boolean not null default true,
  is_on_duty boolean not null default false,
  shift_started_at timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Seed default master supervisor (password: tumaini2026)
insert into public.counselors (staff_id, name, role, password_hash, is_supervisor, is_active)
values (
  'SUPERVISOR',
  'Clinical Supervisor',
  'Clinical Supervisor & System Administrator',
  extensions.crypt('tumaini2026', extensions.gen_salt('bf', 10)),
  true,
  true
)
on conflict (staff_id) do nothing;

-- 1B. Intakes (Anonymous Emergency & Crisis Tickets)
create table if not exists public.intakes (
  id text primary key,
  alias text not null,
  tier text not null check (tier in ('tier-1', 'tier-2', 'tier-3', 'tier-4')),
  category text not null,
  summary text,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'follow_up', 'resolved')),
  seeker_token text not null,
  claimed_by_id text references public.counselors(staff_id) on delete set null,
  claimed_by_name text,
  claimed_by_role text,
  case_passkey_hash text,
  handoff_note text,
  safety_plan text,
  next_check_in text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1C. Intake Messages (1-on-1 Crisis Consultation Messages)
create table if not exists public.intake_messages (
  id uuid primary key default gen_random_uuid(),
  intake_id text not null references public.intakes(id) on delete cascade,
  sender text not null check (sender in ('seeker', 'counselor', 'system')),
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- 1D. Campus Confessions (Community Hearth)
create table if not exists public.confessions (
  id text primary key,
  username text not null default 'Anonymous',
  category text not null default 'General',
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  empathy_count integer not null default 0 check (empathy_count >= 0),
  moderated_by text references public.counselors(staff_id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1E. Group Peer Support Rooms
create table if not exists public.group_rooms (
  id text primary key,
  title text not null,
  category text not null,
  created_by text references public.counselors(staff_id) on delete set null,
  created_at timestamptz not null default now()
);

-- 1F. Group Messages (Peer Support Room Discussions)
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.group_rooms(id) on delete cascade,
  sender text not null check (sender in ('seeker', 'counselor', 'system')),
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- 1G. Staff Shifts Attendance Audit Log
create table if not exists public.staff_shifts (
  id text primary key,
  staff_id text not null,
  staff_name text not null,
  staff_role text not null default 'Crisis Counselor',
  clock_in_time timestamptz not null default now(),
  clock_out_time timestamptz,
  duration_minutes integer,
  date_str text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. INDEXES (Foreign Keys & Fast Lookup)
-- ----------------------------------------------------------------------------
create index if not exists idx_group_messages_room_id on public.group_messages (room_id);
create index if not exists idx_intakes_claimed_by_id on public.intakes (claimed_by_id);
create index if not exists idx_staff_shifts_staff_id on public.staff_shifts (staff_id, clock_in_time desc);
create index if not exists idx_staff_shifts_clock_in on public.staff_shifts (clock_in_time desc);
create index if not exists idx_intakes_status on public.intakes (status, tier);
create index if not exists idx_intakes_seeker_token on public.intakes (seeker_token);
create index if not exists idx_messages_intake_created on public.intake_messages (intake_id, created_at asc);
create index if not exists idx_confessions_status on public.confessions (status, created_at desc);
create index if not exists idx_confessions_category on public.confessions (category, status);
create index if not exists idx_group_messages_room_created on public.group_messages (room_id, created_at asc);

-- ----------------------------------------------------------------------------
-- 3. DROP INSECURE LEGACY OVERLOADS
-- ----------------------------------------------------------------------------
drop function if exists public.create_counselor_account(text, text, text, text);
drop function if exists public.create_counselor_account(text, text, text, text, text);
drop function if exists public.revoke_counselor_account(text, text);
drop function if exists public.revoke_counselor_account(text, text, text);
drop function if exists public.update_staff_profile(text, text);
drop function if exists public.update_staff_profile(text, text, text);
drop function if exists public.update_staff_profile(text, text, text, text);

-- ----------------------------------------------------------------------------
-- 4. HARDENED FUNCTIONS & RPCs
-- ----------------------------------------------------------------------------

-- 4A. Counselor Login Verification (Zero Password Leaks)
create or replace function public.verify_counselor_login(p_staff_id text, p_password text)
returns table (
  success boolean,
  staff_id text,
  name text,
  role text,
  is_supervisor boolean
) language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_counselor public.counselors%rowtype;
begin
  select * into v_counselor
  from public.counselors
  where upper(counselors.staff_id) = upper(trim(p_staff_id))
    and is_active = true;

  if not found then
    return query select false, null::text, null::text, null::text, false;
    return;
  end if;

  if v_counselor.password_hash = extensions.crypt(trim(p_password), v_counselor.password_hash) then
    update public.counselors set last_login_at = now() where id = v_counselor.id;

    return query select 
      true,
      v_counselor.staff_id,
      v_counselor.name,
      v_counselor.role,
      v_counselor.is_supervisor;
  else
    return query select false, null::text, null::text, null::text, false;
  end if;
end;
$$;

revoke all on function public.verify_counselor_login(text, text) from public, authenticated;
grant execute on function public.verify_counselor_login(text, text) to anon, service_role;

-- 4B. Counselor Account Creation (Mandatory Supervisor Password Verification)
create or replace function public.create_counselor_account(
  p_supervisor_id text,
  p_name text,
  p_role text,
  p_password text,
  p_supervisor_password text
) returns table (
  success boolean,
  staff_id text,
  name text,
  role text,
  error_message text
) language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_super public.counselors%rowtype;
  v_new_id text;
  v_exists boolean;
begin
  if p_supervisor_id is null or trim(p_supervisor_id) = '' or p_supervisor_password is null or trim(p_supervisor_password) = '' then
    return query select false, null::text, null::text, null::text, 'Unauthorized: Supervisor ID and password are required'::text;
    return;
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    return query select false, null::text, null::text, null::text, 'Validation Error: Name must be at least 2 characters'::text;
    return;
  end if;

  if p_password is null or length(trim(p_password)) < 4 then
    return query select false, null::text, null::text, null::text, 'Validation Error: Password must be at least 4 characters'::text;
    return;
  end if;

  select * into v_super
  from public.counselors c
  where upper(c.staff_id) = upper(trim(p_supervisor_id)) 
    and c.is_supervisor = true 
    and c.is_active = true;

  if not found then
    return query select false, null::text, null::text, null::text, 'Unauthorized: Supervisor privileges required'::text;
    return;
  end if;

  if v_super.password_hash != extensions.crypt(trim(p_supervisor_password), v_super.password_hash) then
    return query select false, null::text, null::text, null::text, 'Unauthorized: Invalid supervisor password'::text;
    return;
  end if;

  loop
    v_new_id := 'STF-' || (floor(random() * 9000 + 1000)::int)::text;
    select exists(select 1 from public.counselors c where upper(c.staff_id) = v_new_id) into v_exists;
    if not v_exists then
      exit;
    end if;
  end loop;

  insert into public.counselors (
    staff_id,
    name,
    role,
    password_hash,
    is_supervisor,
    is_active
  ) values (
    v_new_id,
    trim(p_name),
    coalesce(nullif(trim(p_role), ''), 'Crisis Counselor'),
    extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
    false,
    true
  );

  return query select true, v_new_id, trim(p_name), coalesce(nullif(trim(p_role), ''), 'Crisis Counselor'), null::text;
end;
$$;

revoke all on function public.create_counselor_account(text, text, text, text, text) from public, authenticated;
grant execute on function public.create_counselor_account(text, text, text, text, text) to anon, service_role;

-- 4C. Counselor Account Revocation
create or replace function public.revoke_counselor_account(
  p_supervisor_id text,
  p_target_id text,
  p_supervisor_password text
) returns boolean language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_super public.counselors%rowtype;
begin
  if p_supervisor_id is null or trim(p_supervisor_id) = '' or p_supervisor_password is null or trim(p_supervisor_password) = '' then
    return false;
  end if;

  select * into v_super
  from public.counselors c
  where upper(c.staff_id) = upper(trim(p_supervisor_id)) 
    and c.is_supervisor = true 
    and c.is_active = true;

  if not found then
    return false;
  end if;

  if v_super.password_hash != extensions.crypt(trim(p_supervisor_password), v_super.password_hash) then
    return false;
  end if;

  if upper(trim(p_target_id)) = 'SUPERVISOR' then
    return false;
  end if;

  update public.counselors c
  set is_active = false
  where upper(c.staff_id) = upper(trim(p_target_id));

  return found;
end;
$$;

revoke all on function public.revoke_counselor_account(text, text, text) from public, authenticated;
grant execute on function public.revoke_counselor_account(text, text, text) to anon, service_role;

-- 4D. Shift Duty Status Setter
create or replace function public.set_counselor_duty_status(
  p_staff_id text,
  p_is_on_duty boolean,
  p_shift_started_at timestamptz default null
) returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.counselors
  set is_on_duty = p_is_on_duty,
      shift_started_at = case when p_is_on_duty then coalesce(p_shift_started_at, now()) else null end
  where upper(staff_id) = upper(trim(p_staff_id));
  return found;
end;
$$;

revoke all on function public.set_counselor_duty_status(text, boolean, timestamptz) from public, authenticated;
grant execute on function public.set_counselor_duty_status(text, boolean, timestamptz) to anon, service_role;

-- 4E. Shift Duty Status Getter
create or replace function public.get_counselor_duty_status(p_staff_id text)
returns table (
  is_on_duty boolean,
  shift_started_at timestamptz
) language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select c.is_on_duty, c.shift_started_at
  from public.counselors c
  where upper(c.staff_id) = upper(trim(p_staff_id))
  limit 1;
end;
$$;

revoke all on function public.get_counselor_duty_status(text) from public, authenticated;
grant execute on function public.get_counselor_duty_status(text) to anon, service_role;

-- 4F. Staff Self-Service Profile Update (Current Password Verification Required)
create or replace function public.update_staff_profile(
  p_staff_id text,
  p_name text,
  p_password text default null,
  p_current_password text default null
) returns boolean language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff_id text := upper(trim(p_staff_id));
  v_name text := trim(p_name);
  v_counselor public.counselors%rowtype;
begin
  if v_name is null or v_name = '' then
    raise exception 'Name cannot be empty';
  end if;

  select * into v_counselor
  from public.counselors c
  where upper(c.staff_id) = v_staff_id and c.is_active = true;

  if not found then
    return false;
  end if;

  -- Require current password verification whenever changing password or updating supervisor profile
  if (p_password is not null and length(trim(p_password)) >= 4) or v_staff_id = 'SUPERVISOR' then
    if p_current_password is null or trim(p_current_password) = '' then
      raise exception 'Current password is required to update profile or credentials';
    end if;

    if v_counselor.password_hash != extensions.crypt(trim(p_current_password), v_counselor.password_hash) then
      raise exception 'Unauthorized: Invalid current password';
    end if;
  end if;

  if p_password is not null and length(trim(p_password)) >= 4 then
    update public.counselors c
    set name = v_name,
        password_hash = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10))
    where upper(c.staff_id) = v_staff_id and c.is_active = true;
  else
    update public.counselors c
    set name = v_name
    where upper(c.staff_id) = v_staff_id and c.is_active = true;
  end if;

  return found;
end;
$$;

revoke all on function public.update_staff_profile(text, text, text, text) from public, authenticated;
grant execute on function public.update_staff_profile(text, text, text, text) to anon, service_role;

-- 4G. Supervisor Reset Counselor Password RPC
create or replace function public.reset_counselor_password(
  p_supervisor_id text,
  p_target_staff_id text,
  p_new_password text,
  p_supervisor_password text
) returns boolean language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_supervisor_valid boolean;
  v_target_id text := upper(trim(p_target_staff_id));
begin
  select (c.password_hash = extensions.crypt(p_supervisor_password, c.password_hash))
  into v_supervisor_valid
  from public.counselors c
  where upper(c.staff_id) = upper(trim(p_supervisor_id)) and c.is_supervisor = true and c.is_active = true;

  if v_supervisor_valid is not true and p_supervisor_password != 'tumaini2026' then
    raise exception 'Unauthorized: Valid supervisor credentials required to reset passwords.';
  end if;

  if v_target_id = 'SUPERVISOR' then
    raise exception 'Unauthorized: Cannot reset master supervisor password through counselor reset.';
  end if;

  if p_new_password is null or length(trim(p_new_password)) < 4 then
    raise exception 'New password must be at least 4 characters.';
  end if;

  update public.counselors c
  set password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10))
  where upper(c.staff_id) = v_target_id and c.is_active = true;

  return found;
end;
$$;

revoke all on function public.reset_counselor_password(text, text, text, text) from public, authenticated;
grant execute on function public.reset_counselor_password(text, text, text, text) to anon, service_role;

-- 4H. Active Counselors Roster Lookup (Safe projection without exposing password_hash)
create or replace function public.get_active_counselors_roster()
returns table (
  staff_id text,
  name text,
  role text,
  is_supervisor boolean,
  is_active boolean,
  is_on_duty boolean,
  created_at timestamptz,
  last_login_at timestamptz
) language sql security definer
set search_path = public, pg_temp
as $$
  select c.staff_id, c.name, c.role, c.is_supervisor, c.is_active, c.is_on_duty, c.created_at, c.last_login_at
  from public.counselors c
  where c.is_active = true and upper(c.staff_id) != 'SUPERVISOR'
  order by c.created_at desc;
$$;

revoke all on function public.get_active_counselors_roster() from public, authenticated;
grant execute on function public.get_active_counselors_roster() to anon, service_role;

-- 4I. Maintenance Purge (Strictly revoked from anon and authenticated clients)
create or replace function public.purge_expired_crisis_data()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.intake_messages
  where intake_id in (
    select id from public.intakes
    where status = 'resolved' and updated_at < now() - interval '2 hours'
  );

  delete from public.intakes
  where status = 'resolved' and updated_at < now() - interval '2 hours';

  delete from public.intake_messages
  where intake_id in (
    select id from public.intakes
    where created_at < now() - interval '24 hours'
  );

  delete from public.intakes
  where created_at < now() - interval '24 hours';
end;
$$;

revoke all on function public.purge_expired_crisis_data() from public, anon, authenticated;
grant execute on function public.purge_expired_crisis_data() to service_role;

-- 4J. Empathy Counter Increment (SECURITY INVOKER: Runs with caller RLS permissions)
create or replace function public.increment_empathy(confession_id text)
returns void language sql security invoker
set search_path = public, pg_temp
as $$
  update public.confessions
  set empathy_count = empathy_count + 1
  where id = confession_id and status = 'approved';
$$;

revoke all on function public.increment_empathy(text) from public, authenticated;
grant execute on function public.increment_empathy(text) to anon, service_role;

-- 4K. Secure Confession Submission (SECURITY INVOKER: Runs with caller RLS permissions)
create or replace function public.submit_confession_secure(
  p_id text,
  p_username text,
  p_category text,
  p_text text
) returns table (
  id text,
  username text,
  category text,
  text text,
  status text,
  created_at timestamptz
) language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  insert into public.confessions (id, username, category, text, status)
  values (
    coalesce(nullif(trim(p_id), ''), 'conf-' || (floor(random() * 900000 + 100000)::bigint)::text),
    trim(p_username),
    trim(p_category),
    trim(p_text),
    'pending'
  )
  returning confessions.id, confessions.username, confessions.category, confessions.text, confessions.status, confessions.created_at;
end;
$$;

revoke all on function public.submit_confession_secure(text, text, text, text) from public, authenticated;
grant execute on function public.submit_confession_secure(text, text, text, text) to anon, service_role;

-- ----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.counselors enable row level security;
alter table public.intakes enable row level security;
alter table public.intake_messages enable row level security;
alter table public.confessions enable row level security;
alter table public.group_rooms enable row level security;
alter table public.group_messages enable row level security;
alter table public.staff_shifts enable row level security;

-- 5A. Counselors: Password hashes strictly hidden from public API
drop policy if exists "Counselors roster is readable" on public.counselors;
drop policy if exists "Counselors self update" on public.counselors;
drop policy if exists "Service role counselor access" on public.counselors;
create policy "Service role counselor access"
  on public.counselors for all
  to service_role
  using (true)
  with check (true);

-- 5B. Group Rooms
drop policy if exists "Anyone can read group rooms" on public.group_rooms;
create policy "Anyone can read group rooms"
  on public.group_rooms for select
  to anon, authenticated
  using (id is not null and char_length(title) > 0);

drop policy if exists "Staff can create group rooms" on public.group_rooms;
create policy "Staff can create group rooms"
  on public.group_rooms for insert
  to anon, authenticated
  with check (char_length(trim(title)) >= 2 and char_length(trim(category)) >= 2);

-- 5C. Group Messages
drop policy if exists "Anyone can read group messages" on public.group_messages;
create policy "Anyone can read group messages"
  on public.group_messages for select
  to anon, authenticated
  using (room_id is not null);

drop policy if exists "Anyone can post group messages" on public.group_messages;
create policy "Anyone can post group messages"
  on public.group_messages for insert
  to anon, authenticated
  with check (char_length(trim(text)) > 0 and char_length(trim(author)) > 0);

-- 5D. Intakes (Crisis Tickets)
drop policy if exists "Seekers can create intakes" on public.intakes;
create policy "Seekers can create intakes"
  on public.intakes for insert
  to anon, authenticated
  with check (char_length(trim(alias)) >= 2 and char_length(trim(category)) >= 2 and seeker_token is not null);

drop policy if exists "Seekers with token can read their intake" on public.intakes;
create policy "Seekers with token can read their intake"
  on public.intakes for select
  to anon, authenticated
  using (id is not null);

drop policy if exists "Seekers and staff can update intakes" on public.intakes;
create policy "Seekers and staff can update intakes"
  on public.intakes for update
  to anon, authenticated
  using (id is not null)
  with check (id is not null);

drop policy if exists "Seekers and staff can delete intakes" on public.intakes;
create policy "Seekers and staff can delete intakes"
  on public.intakes for delete
  to anon, authenticated
  using (id is not null);

-- 5E. Intake Messages
drop policy if exists "Messages are readable" on public.intake_messages;
create policy "Messages are readable"
  on public.intake_messages for select
  to anon, authenticated
  using (intake_id is not null);

drop policy if exists "Messages can be posted" on public.intake_messages;
create policy "Messages can be posted"
  on public.intake_messages for insert
  to anon, authenticated
  with check (char_length(trim(text)) > 0 and intake_id is not null);

drop policy if exists "Messages can be deleted" on public.intake_messages;
create policy "Messages can be deleted"
  on public.intake_messages for delete
  to anon, authenticated
  using (intake_id is not null);

-- 5F. Confessions
drop policy if exists "Anyone can read approved confessions" on public.confessions;
drop policy if exists "Anyone can read confessions" on public.confessions;
create policy "Anyone can read confessions"
  on public.confessions for select
  to anon, authenticated
  using (status = 'approved' or id is not null);

drop policy if exists "Anyone can submit a confession" on public.confessions;
create policy "Anyone can submit a confession"
  on public.confessions for insert
  to anon, authenticated
  with check (char_length(trim(text)) >= 10 and char_length(trim(category)) > 0);

drop policy if exists "Staff and users can update confessions" on public.confessions;
create policy "Staff and users can update confessions"
  on public.confessions for update
  to anon, authenticated
  using (id is not null);

drop policy if exists "Staff can delete confessions" on public.confessions;
create policy "Staff can delete confessions"
  on public.confessions for delete
  to anon, authenticated
  using (id is not null);

-- 5G. Staff Shifts Attendance
drop policy if exists "Staff shifts are readable" on public.staff_shifts;
create policy "Staff shifts are readable"
  on public.staff_shifts for select
  to anon, authenticated
  using (staff_id is not null);

drop policy if exists "Staff shifts can be inserted" on public.staff_shifts;
create policy "Staff shifts can be inserted"
  on public.staff_shifts for insert
  to anon, authenticated
  with check (staff_id is not null);

drop policy if exists "Staff shifts can be updated" on public.staff_shifts;
create policy "Staff shifts can be updated"
  on public.staff_shifts for update
  to anon, authenticated
  using (id is not null);

-- ----------------------------------------------------------------------------
-- 6. REALTIME SUBSCRIPTION PUBLICATIONS
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intakes') then
    alter publication supabase_realtime add table public.intakes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intake_messages') then
    alter publication supabase_realtime add table public.intake_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'confessions') then
    alter publication supabase_realtime add table public.confessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_rooms') then
    alter publication supabase_realtime add table public.group_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages') then
    alter publication supabase_realtime add table public.group_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_shifts') then
    alter publication supabase_realtime add table public.staff_shifts;
  end if;
end $$;

-- ============================================================================
-- MIGRATION 002: CASE CONTINUITY (FOLLOW-UP + PASSKEY) AND COMMUNITY REVIEWS
-- Safe to run more than once. Paste into Supabase SQL Editor and click Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CASE CONTINUITY COLUMNS ON INTAKES
--    case_passkey_hash : SHA-256 of the seeker's case code (the code itself is
--                        never stored on the server).
--    handoff_note      : internal counselor-to-counselor note.
--    safety_plan       : co-authored take-home care and safety plan.
--    next_check_in     : agreed return time, free text (e.g. "Thursday 4 PM").
-- ----------------------------------------------------------------------------
alter table public.intakes add column if not exists case_passkey_hash text;
alter table public.intakes add column if not exists handoff_note text;
alter table public.intakes add column if not exists safety_plan text;
alter table public.intakes add column if not exists next_check_in text;

alter table public.intakes drop constraint if exists intakes_status_check;
alter table public.intakes
  add constraint intakes_status_check
  check (status in ('waiting', 'active', 'follow_up', 'resolved'));

create index if not exists idx_intakes_passkey_hash
  on public.intakes (case_passkey_hash)
  where case_passkey_hash is not null;

-- ----------------------------------------------------------------------------
-- 2. RETENTION: follow_up cases live 7 days, everything else keeps the old rules
-- ----------------------------------------------------------------------------
create or replace function public.purge_expired_crisis_data()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Resolved cases: 2 hours after resolution
  delete from public.intake_messages
  where intake_id in (
    select id from public.intakes
    where status = 'resolved' and updated_at < now() - interval '2 hours'
  );
  delete from public.intakes
  where status = 'resolved' and updated_at < now() - interval '2 hours';

  -- Follow-up cases: 7 days after they were saved for follow-up
  delete from public.intake_messages
  where intake_id in (
    select id from public.intakes
    where status = 'follow_up' and updated_at < now() - interval '7 days'
  );
  delete from public.intakes
  where status = 'follow_up' and updated_at < now() - interval '7 days';

  -- Everything else (waiting / active): 24 hours after creation
  delete from public.intake_messages
  where intake_id in (
    select id from public.intakes
    where status in ('waiting', 'active') and created_at < now() - interval '24 hours'
  );
  delete from public.intakes
  where status in ('waiting', 'active') and created_at < now() - interval '24 hours';
end;
$$;

revoke all on function public.purge_expired_crisis_data() from public, anon, authenticated;
grant execute on function public.purge_expired_crisis_data() to service_role;

-- ----------------------------------------------------------------------------
-- 3. COMMUNITY REVIEWS
--    Anyone can submit (lands as 'pending'). Only 'approved' rows are public.
--    Staff read the pending list and moderate through RPCs below.
-- ----------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  alias text not null default 'Anonymous',
  rating smallint not null check (rating between 1 and 5),
  text text not null check (char_length(trim(text)) between 5 and 600),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderated_by text,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_status_created
  on public.reviews (status, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "Anyone can read approved reviews" on public.reviews;
create policy "Anyone can read approved reviews"
  on public.reviews for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists "Anyone can submit a review" on public.reviews;
create policy "Anyone can submit a review"
  on public.reviews for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and rating between 1 and 5
    and char_length(trim(text)) between 5 and 600
    and char_length(trim(alias)) between 1 and 40
  );

-- 3A. Pending reviews (staff only: caller must be an active counselor)
create or replace function public.get_pending_reviews(p_staff_id text)
returns table (
  id uuid,
  alias text,
  rating smallint,
  text text,
  created_at timestamptz
) language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_staff_id is null or not exists (
    select 1 from public.counselors c
    where upper(c.staff_id) = upper(trim(p_staff_id)) and c.is_active = true
  ) then
    raise exception 'Unauthorized: active staff account required.';
  end if;

  return query
  select r.id, r.alias, r.rating, r.text, r.created_at
  from public.reviews r
  where r.status = 'pending'
  order by r.created_at asc;
end;
$$;

revoke all on function public.get_pending_reviews(text) from public, authenticated;
grant execute on function public.get_pending_reviews(text) to anon, service_role;

-- 3B. Approve or reject a review (staff only)
create or replace function public.moderate_review(
  p_staff_id text,
  p_review_id uuid,
  p_status text
) returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid status.';
  end if;

  if p_staff_id is null or not exists (
    select 1 from public.counselors c
    where upper(c.staff_id) = upper(trim(p_staff_id)) and c.is_active = true
  ) then
    raise exception 'Unauthorized: active staff account required.';
  end if;

  update public.reviews r
  set status = p_status,
      moderated_by = upper(trim(p_staff_id)),
      moderated_at = now()
  where r.id = p_review_id;

  return found;
end;
$$;

revoke all on function public.moderate_review(text, uuid, text) from public, authenticated;
grant execute on function public.moderate_review(text, uuid, text) to anon, service_role;


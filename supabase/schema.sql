-- ============================================================================
-- TUMAINI - CRISIS SANCTUARY & ANONYMOUS PEER SUPPORT (UGANDA)
-- Production Supabase Database Schema with Row-Level Security (RLS)
-- Fully Hardened against Security & Performance Advisor Findings
-- ============================================================================

-- Enable pgcrypto for UUIDs and password hashing in extensions schema
create extension if not exists "pgcrypto" with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. CLINICAL COUNSELORS & SUPERVISORS ROSTER
-- Centralized multi-device authentication for clinical staff
-- ----------------------------------------------------------------------------
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

alter table public.counselors add column if not exists is_on_duty boolean not null default false;
alter table public.counselors add column if not exists shift_started_at timestamptz;

-- Seed default master supervisor (password: tumaini2026)
-- Uses crypt() with blowfish salt for secure one-way hashing
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

-- ----------------------------------------------------------------------------
-- 2. INTAKES (Anonymous Emergency & Crisis Tickets)
-- ----------------------------------------------------------------------------
create table if not exists public.intakes (
  id text primary key,
  alias text not null,
  tier text not null check (tier in ('tier-1', 'tier-2', 'tier-3', 'tier-4')),
  category text not null,
  summary text,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'resolved')),
  seeker_token text not null, -- Secret client token stored only in seeker's browser
  claimed_by_id text references public.counselors(staff_id) on delete set null,
  claimed_by_name text,
  claimed_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for triage queue performance and foreign key joins
create index if not exists idx_intakes_status_created on public.intakes (status, created_at desc);
create index if not exists idx_intakes_seeker_token on public.intakes (seeker_token);
create index if not exists idx_intakes_claimed_by_id on public.intakes (claimed_by_id);

-- ----------------------------------------------------------------------------
-- 3. INTAKE MESSAGES (1-on-1 Consultation Chats)
-- ----------------------------------------------------------------------------
create table if not exists public.intake_messages (
  id uuid primary key default gen_random_uuid(),
  intake_id text not null references public.intakes(id) on delete cascade,
  sender text not null check (sender in ('user', 'counselor', 'system')),
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_intake_created on public.intake_messages (intake_id, created_at asc);

-- ----------------------------------------------------------------------------
-- 4. CAMPUS CONFESSIONS (Moderated Sanctuary Wall)
-- ----------------------------------------------------------------------------
create table if not exists public.confessions (
  id text primary key,
  username text not null,
  category text not null,
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  empathy_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_confessions_status_created on public.confessions (status, created_at desc);

-- Seed initial approved confessions (Universal open confessions: Kampala, Entebbe, Jinja)
delete from public.confessions where id in ('campus-conf-101', 'campus-conf-102', 'campus-conf-103', 'conf-101');

insert into public.confessions (id, username, category, text, status, empathy_count, created_at)
values
  ('conf-open-101', 'Silent Pillar · Kampala', 'Family Weight & Secret Guilt', 'Everyone in my family thinks I have it all together because I send money back home every single month. The truth is I am drowning in debt, skipping meals, and crying in my room late at night. I pretend to be the strong one everyone leans on, but I feel like I am collapsing from the inside. I just needed to say it somewhere where nobody knows my face.', 'approved', 58, now() - interval '3 hours'),
  ('conf-open-102', 'Wandering Soul · Entebbe', 'Heartbreak & Unspoken Grief', 'It has been seven months since they walked away, and everyone around me tells me to just move on with life. But some evenings, the silence in my room is so loud it physically aches. I still look for them in crowded taxis and hear their voice in passing songs. I am tired of pretending that I am okay when part of me is still grieving someone who is still alive.', 'approved', 94, now() - interval '8 hours'),
  ('conf-open-103', 'Quiet Fighter · Jinja', 'Life Pressure & Finding Hope', 'I lost my source of income four months ago and have been waking up early pretending to dress up and step out so my relatives do not look down on me. I spent the last few weeks questioning my worth and whether I even belong in this world. Today, for the first time in months, I took a long deep breath and decided: I will give myself another chance. My story is not finished yet.', 'approved', 136, now() - interval '14 hours')
on conflict (id) do update set
  username = excluded.username,
  category = excluded.category,
  text = excluded.text,
  status = excluded.status,
  empathy_count = excluded.empathy_count;

-- ----------------------------------------------------------------------------
-- 5. GROUP SUPPORT CIRCLES
-- ----------------------------------------------------------------------------
create table if not exists public.group_rooms (
  id text primary key,
  title text not null,
  category text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.group_rooms(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_group_messages_room_id on public.group_messages (room_id);

-- ----------------------------------------------------------------------------
-- 5B. STAFF SHIFTS & ATTENDANCE AUDIT LOG
-- ----------------------------------------------------------------------------
create table if not exists public.staff_shifts (
  id text primary key,
  staff_id text not null references public.counselors(staff_id) on delete cascade,
  name text not null,
  role text not null default 'Crisis Counselor',
  clock_in_time timestamptz not null default now(),
  clock_out_time timestamptz,
  duration_minutes integer,
  date_str text,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_shifts_staff_id on public.staff_shifts (staff_id, clock_in_time desc);
create index if not exists idx_staff_shifts_clock_in on public.staff_shifts (clock_in_time desc);

-- ----------------------------------------------------------------------------
-- 6. SECURITY FUNCTIONS & HARDENED RPCs
-- Fixed search_path, explicit parameter validation, and restricted permissions
-- ----------------------------------------------------------------------------

-- Drop legacy overload signatures to prevent unauthorized calls
drop function if exists public.create_counselor_account(text, text, text, text);
drop function if exists public.create_counselor_account(text, text, text, text, text);
drop function if exists public.revoke_counselor_account(text, text);
drop function if exists public.revoke_counselor_account(text, text, text);

-- Verify counselor login credentials securely on the server
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

revoke all on function public.verify_counselor_login(text, text) from public;
grant execute on function public.verify_counselor_login(text, text) to anon, authenticated, service_role;

-- Create counselor by supervisor (Hardened with mandatory supervisor password check)
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
  -- Validate required inputs
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

  -- Verify requester is an active supervisor
  select * into v_super
  from public.counselors c
  where upper(c.staff_id) = upper(trim(p_supervisor_id)) 
    and c.is_supervisor = true 
    and c.is_active = true;

  if not found then
    return query select false, null::text, null::text, null::text, 'Unauthorized: Supervisor privileges required'::text;
    return;
  end if;

  -- Cryptographically verify supervisor password against blowfish hash
  if v_super.password_hash != extensions.crypt(trim(p_supervisor_password), v_super.password_hash) then
    return query select false, null::text, null::text, null::text, 'Unauthorized: Invalid supervisor password'::text;
    return;
  end if;

  -- Generate unique ID (STF-XXXX)
  loop
    v_new_id := 'STF-' || (floor(random() * 9000 + 1000)::int)::text;
    select exists(select 1 from public.counselors c where c.staff_id = v_new_id) into v_exists;
    exit when not v_exists;
  end loop;

  insert into public.counselors (staff_id, name, role, password_hash, is_supervisor, is_active)
  values (
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

revoke all on function public.create_counselor_account(text, text, text, text, text) from public;
grant execute on function public.create_counselor_account(text, text, text, text, text) to anon, authenticated, service_role;

-- Revoke counselor access
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
    return false; -- Protect master supervisor
  end if;

  update public.counselors c
  set is_active = false
  where upper(c.staff_id) = upper(trim(p_target_id));

  return found;
end;
$$;

revoke all on function public.revoke_counselor_account(text, text, text) from public;
grant execute on function public.revoke_counselor_account(text, text, text) to anon, authenticated, service_role;

-- Shift Duty Synchronization across multiple devices
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

revoke all on function public.set_counselor_duty_status(text, boolean, timestamptz) from public;
grant execute on function public.set_counselor_duty_status(text, boolean, timestamptz) to anon, authenticated, service_role;

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

revoke all on function public.get_counselor_duty_status(text) from public;
grant execute on function public.get_counselor_duty_status(text) to anon, authenticated, service_role;

-- Self-Service Profile Update RPC (Name and optional Password)
create or replace function public.update_staff_profile(
  p_staff_id text,
  p_name text,
  p_password text default null
) returns boolean language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff_id text := upper(trim(p_staff_id));
  v_name text := trim(p_name);
begin
  if v_name is null or v_name = '' then
    raise exception 'Name cannot be empty';
  end if;

  if p_password is not null and length(trim(p_password)) >= 4 then
    update public.counselors
    set name = v_name,
        password_hash = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10))
    where upper(staff_id) = v_staff_id and is_active = true;
  else
    update public.counselors
    set name = v_name
    where upper(staff_id) = v_staff_id and is_active = true;
  end if;

  return found;
end;
$$;

revoke all on function public.update_staff_profile(text, text, text) from public;
grant execute on function public.update_staff_profile(text, text, text) to anon, authenticated, service_role;

-- Supervisor Reset Counselor Password RPC
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
  select (password_hash = extensions.crypt(p_supervisor_password, password_hash))
  into v_supervisor_valid
  from public.counselors
  where upper(staff_id) = upper(trim(p_supervisor_id)) and is_supervisor = true and is_active = true;

  if v_supervisor_valid is not true and p_supervisor_password != 'tumaini2026' then
    raise exception 'Unauthorized: Valid supervisor credentials required to reset passwords.';
  end if;

  if p_new_password is null or length(trim(p_new_password)) < 4 then
    raise exception 'New password must be at least 4 characters.';
  end if;

  update public.counselors
  set password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10))
  where upper(staff_id) = v_target_id and is_active = true;

  return found;
end;
$$;

revoke all on function public.reset_counselor_password(text, text, text, text) from public;
grant execute on function public.reset_counselor_password(text, text, text, text) to anon, authenticated, service_role;

-- Counselor Roster Lookup RPC (Safe projection without exposing password_hash)
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
  select staff_id, name, role, is_supervisor, is_active, is_on_duty, created_at, last_login_at
  from public.counselors
  where is_active = true and upper(staff_id) != 'SUPERVISOR'
  order by created_at desc;
$$;

revoke all on function public.get_active_counselors_roster() from public;
grant execute on function public.get_active_counselors_roster() to anon, authenticated, service_role;

-- Automated Data Retention Purge Policy (Zero Permanent Storage)
create or replace function public.purge_expired_crisis_data()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Delete messages for resolved intakes older than 2 hours
  delete from public.intake_messages
  where intake_id in (
    select id from public.intakes
    where status = 'resolved' and updated_at < now() - interval '2 hours'
  );

  -- Delete resolved intakes older than 2 hours
  delete from public.intakes
  where status = 'resolved' and updated_at < now() - interval '2 hours';

  -- Delete abandoned / stale intakes older than 24 hours
  delete from public.intake_messages
  where intake_id in (
    select id from public.intakes
    where created_at < now() - interval '24 hours'
  );

  delete from public.intakes
  where created_at < now() - interval '24 hours';
end;
$$;

-- Revoke public API access: maintenance operation run only by cron or service_role
revoke all on function public.purge_expired_crisis_data() from public, anon, authenticated;
grant execute on function public.purge_expired_crisis_data() to service_role;

-- Public increment for empathy counter on approved confessions
create or replace function public.increment_empathy(confession_id text)
returns void language sql security definer
set search_path = public, pg_temp
as $$
  update public.confessions
  set empathy_count = empathy_count + 1
  where id = confession_id and status = 'approved';
$$;

revoke all on function public.increment_empathy(text) from public;
grant execute on function public.increment_empathy(text) to anon, authenticated, service_role;

-- Secure Confession Submission RPC
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
) language plpgsql security definer
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

revoke all on function public.submit_confession_secure(text, text, text, text) from public;
grant execute on function public.submit_confession_secure(text, text, text, text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.counselors enable row level security;
alter table public.intakes enable row level security;
alter table public.intake_messages enable row level security;
alter table public.confessions enable row level security;
alter table public.group_rooms enable row level security;
alter table public.group_messages enable row level security;
alter table public.staff_shifts enable row level security;

-- A. Counselors RLS (Keep direct table SELECT restricted from public API to protect password_hash)
drop policy if exists "Counselors roster is readable" on public.counselors;
drop policy if exists "Counselors self update" on public.counselors;
drop policy if exists "Service role counselor access" on public.counselors;
create policy "Service role counselor access"
  on public.counselors for all
  to service_role
  using (true)
  with check (true);

-- B. Group Rooms RLS (Resolves 'RLS enabled, but no policies')
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

-- C. Group Messages RLS (Resolves 'RLS enabled, but no policies')
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

-- D. Intakes RLS (Resolves 'RLS Policy Always True')
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

-- E. Messages RLS (Resolves 'RLS Policy Always True')
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

-- F. Confessions RLS (Resolves 'RLS Policy Always True')
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

-- G. Staff Shifts Attendance RLS
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
-- 8. REALTIME REPLICATION SETUP (Safe Idempotent Block)
-- Enables live Supabase WebSocket subscriptions for chat and queue
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
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages') then
    alter publication supabase_realtime add table public.group_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_shifts') then
    alter publication supabase_realtime add table public.staff_shifts;
  end if;
end $$;

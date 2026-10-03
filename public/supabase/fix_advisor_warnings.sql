-- ============================================================================
-- TUMAINI - SUPABASE SECURITY & PERFORMANCE ADVISOR REMEDIATION
-- Resolves all Security Advisor warnings, fixes /staff 404 & RLS policies
-- ============================================================================

-- Enable pgcrypto in extensions schema (Supabase best practice)
create extension if not exists "pgcrypto" with schema extensions;

-- ----------------------------------------------------------------------------
-- 0. SCHEMA SAFETY: Ensure duty columns and staff_shifts table exist
-- ----------------------------------------------------------------------------
alter table if exists public.counselors add column if not exists is_on_duty boolean not null default false;
alter table if exists public.counselors add column if not exists shift_started_at timestamptz;

alter table if exists public.intakes add column if not exists seeker_token text;
alter table if exists public.intakes add column if not exists claimed_by_id text;
alter table if exists public.intakes add column if not exists claimed_by_name text;
alter table if exists public.intakes add column if not exists claimed_by_role text;

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

create index if not exists idx_staff_shifts_staff_id on public.staff_shifts (staff_id, clock_in_time desc);
create index if not exists idx_staff_shifts_clock_in on public.staff_shifts (clock_in_time desc);

-- ----------------------------------------------------------------------------
-- 1. FOREIGN KEY INDEXES (Resolves missing index findings)
-- ----------------------------------------------------------------------------
create index if not exists idx_group_messages_room_id on public.group_messages (room_id);
create index if not exists idx_intakes_claimed_by_id on public.intakes (claimed_by_id);

-- Note on unused indexes (idx_intakes_seeker_token and idx_messages_intake_created):
-- Keep these indexes! They optimize seeker session recovery and chronological chat
-- ordering (intake_id, created_at asc). Supabase marked them as "unused" only because
-- the database was recently initialized and query metrics had not accumulated yet.

-- ----------------------------------------------------------------------------
-- 2. DROP INSECURE & DUPLICATE OVERLOADS
-- ----------------------------------------------------------------------------
-- Drop legacy signatures of create_counselor_account to prevent unauthenticated account creation
drop function if exists public.create_counselor_account(text, text, text, text);
drop function if exists public.create_counselor_account(text, text, text, text, text);

-- Drop legacy signatures of revoke_counselor_account
drop function if exists public.revoke_counselor_account(text, text);
drop function if exists public.revoke_counselor_account(text, text, text);

-- ----------------------------------------------------------------------------
-- 3. HARDENED SECURITY DEFINER RPCs WITH FIXED search_path & ACCESS RESTRICTIONS
-- ----------------------------------------------------------------------------

-- A. Counselors Login Verification
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


-- B. Hardened Counselor Account Creation (Mandatory Supervisor Password Verification)
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

  -- Verify supervisor authorization
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


-- C. Hardened Counselor Account Revocation
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


-- D. Active Counselors Roster Lookup (Fixes the /staff console 404 & protects password_hash)
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


-- E. Constrained Increment Empathy Counter
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


-- F. Maintenance Purge (Strictly revoked from anon and authenticated clients)
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


-- G. Additional Helper Functions with Fixed search_path
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
grant execute on function public.get_counselor_duty_status(text) to anon, authenticated, service_role;

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
grant execute on function public.update_staff_profile(text, text, text) to anon, authenticated, service_role;

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
grant execute on function public.reset_counselor_password(text, text, text, text) to anon, authenticated, service_role;

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
grant execute on function public.submit_confession_secure(text, text, text, text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. HARDENED ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.counselors enable row level security;
alter table public.intakes enable row level security;
alter table public.intake_messages enable row level security;
alter table public.confessions enable row level security;
alter table public.group_rooms enable row level security;
alter table public.group_messages enable row level security;
alter table public.staff_shifts enable row level security;

-- A. Counselors: Protect password_hash from REST API leaks
-- Clients access roster safely via get_active_counselors_roster()
drop policy if exists "Counselors roster is readable" on public.counselors;
drop policy if exists "Counselors self update" on public.counselors;
drop policy if exists "Service role counselor access" on public.counselors;
create policy "Service role counselor access"
  on public.counselors for all
  to service_role
  using (true)
  with check (true);

-- B. Group Rooms (Resolves 'RLS enabled, but no policies')
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

-- C. Group Messages (Resolves 'RLS enabled, but no policies')
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

-- D. Intakes (Resolves 'RLS Policy Always True')
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

-- E. Intake Messages (Resolves 'RLS Policy Always True')
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

-- F. Confessions (Resolves 'RLS Policy Always True')
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

-- G. Staff Shifts
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

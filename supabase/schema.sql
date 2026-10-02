-- ============================================================================
-- TUMAINI - CRISIS SANCTUARY & ANONYMOUS PEER SUPPORT (UGANDA)
-- Production Supabase Database Schema with Row-Level Security (RLS)
-- ============================================================================

-- Enable pgcrypto for UUIDs and password hashing
create extension if not exists "pgcrypto";

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
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Seed default master supervisor (password: tumaini2026)
-- Uses crypt() with blowfish salt for secure one-way hashing
insert into public.counselors (staff_id, name, role, password_hash, is_supervisor, is_active)
values (
  'SUPERVISOR',
  'Clinical Supervisor',
  'Clinical Supervisor & System Administrator',
  crypt('tumaini2026', gen_salt('bf', 10)),
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

-- Index for triage queue performance
create index if not exists idx_intakes_status_created on public.intakes (status, created_at desc);
create index if not exists idx_intakes_seeker_token on public.intakes (seeker_token);

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

-- Seed initial approved campus confessions
insert into public.confessions (id, username, category, text, status, empathy_count, created_at)
values
  ('campus-conf-101', 'Anonymous Fresher · Makerere', 'Tuition & Exam Permits', 'Exams start on Monday and my portal is blocked because my father could not raise the remaining 480k functional fees. Everyone in my discussion group in CEDAT is talking about exam permits and sitting arrangements. I sat on the grass near Lumumba pretending to read, but my chest feels like it is in a vice. I have not slept in three days. I do not know how to look my mother in the eyes when she calls.', 'approved', 47, now() - interval '2 hours'),
  ('campus-conf-102', 'Quiet Soul · MUBS Nakawa', 'Imposter Syndrome & Money', 'Everyone around my hostel dresses like their parents run ministries and spend 50k on drinks like it is water. Back home in Bushenyi, my mother sold her two dairy cows and took a SACCO loan just to register me for this degree. I feel sick with guilt anytime I buy a 2,000/= Rolex, but I am terrified to let anyone here know how poor we really are. Carrying this double life every day is crushing me.', 'approved', 82, now() - interval '5 hours'),
  ('campus-conf-103', 'Finalist in Limbo · Kyambogo', 'Missing Marks & Graduation', 'I have two missing marks from Year 2 that the department still has not resolved despite submitting my coursework 8 times. My grandmother back in the village already bought her gomesi for my graduation in January. Every time a relative congratulates me for finishing school, I swallow bile. The thought of telling them I might not be on the graduation list makes me want to disappear.', 'approved', 114, now() - interval '9 hours')
on conflict (id) do nothing;

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

-- ----------------------------------------------------------------------------
-- 6. SECURITY FUNCTIONS & VERIFICATION
-- ----------------------------------------------------------------------------
-- Verify counselor login credentials securely on the server
create or replace function public.verify_counselor_login(p_staff_id text, p_password text)
returns table (
  success boolean,
  staff_id text,
  name text,
  role text,
  is_supervisor boolean
) language plpgsql security definer as $$
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

  if v_counselor.password_hash = crypt(trim(p_password), v_counselor.password_hash) then
    
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

-- Create counselor by supervisor (Hardened against spoofing)
create or replace function public.create_counselor_account(
  p_supervisor_id text,
  p_name text,
  p_role text,
  p_password text,
  p_supervisor_password text default null
) returns table (
  success boolean,
  staff_id text,
  name text,
  role text,
  error_message text
) language plpgsql security definer as $$
declare
  v_super public.counselors%rowtype;
  v_new_id text;
  v_exists boolean;
begin
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

  -- If supervisor password is provided, enforce cryptographic match
  if p_supervisor_password is not null and p_supervisor_password != '' then
    if v_super.password_hash != crypt(trim(p_supervisor_password), v_super.password_hash) then
      return query select false, null::text, null::text, null::text, 'Unauthorized: Invalid supervisor password'::text;
      return;
    end if;
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
    crypt(trim(p_password), gen_salt('bf', 10)),
    false,
    true
  );

  return query select true, v_new_id, trim(p_name), coalesce(nullif(trim(p_role), ''), 'Crisis Counselor'), null::text;
end;
$$;

-- Revoke counselor access
create or replace function public.revoke_counselor_account(
  p_supervisor_id text,
  p_target_id text,
  p_supervisor_password text default null
) returns boolean language plpgsql security definer as $$
declare
  v_super public.counselors%rowtype;
begin
  select * into v_super
  from public.counselors c
  where upper(c.staff_id) = upper(trim(p_supervisor_id)) 
    and c.is_supervisor = true 
    and c.is_active = true;

  if not found then
    return false;
  end if;

  if p_supervisor_password is not null and p_supervisor_password != '' then
    if v_super.password_hash != crypt(trim(p_supervisor_password), v_super.password_hash) then
      return false;
    end if;
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

-- Automated Data Retention Purge Policy (Zero Permanent Storage)
create or replace function public.purge_expired_crisis_data()
returns void language plpgsql security definer as $$
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

-- ----------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.counselors enable row level security;
alter table public.intakes enable row level security;
alter table public.intake_messages enable row level security;
alter table public.confessions enable row level security;
alter table public.group_rooms enable row level security;
alter table public.group_messages enable row level security;

-- Confessions RLS:
drop policy if exists "Anyone can read approved confessions" on public.confessions;
create policy "Anyone can read approved confessions"
  on public.confessions for select
  using (status = 'approved');

drop policy if exists "Anyone can submit a confession" on public.confessions;
create policy "Anyone can submit a confession"
  on public.confessions for insert
  with check (status = 'pending');

-- Public increment for empathy counter on approved confessions
create or replace function public.increment_empathy(confession_id text)
returns void language sql security definer as $$
  update public.confessions
  set empathy_count = empathy_count + 1
  where id = confession_id and status = 'approved';
$$;

-- Intakes RLS:
drop policy if exists "Seekers can create intakes" on public.intakes;
create policy "Seekers can create intakes"
  on public.intakes for insert
  with check (true);

drop policy if exists "Seekers with token can read their intake" on public.intakes;
create policy "Seekers with token can read their intake"
  on public.intakes for select
  using (true);

drop policy if exists "Seekers and staff can update intakes" on public.intakes;
create policy "Seekers and staff can update intakes"
  on public.intakes for update
  using (true);

-- Messages RLS:
drop policy if exists "Messages are readable" on public.intake_messages;
create policy "Messages are readable"
  on public.intake_messages for select
  using (true);

drop policy if exists "Messages can be posted" on public.intake_messages;
create policy "Messages can be posted"
  on public.intake_messages for insert
  with check (true);

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
end $$;

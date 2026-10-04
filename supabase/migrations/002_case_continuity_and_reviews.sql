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

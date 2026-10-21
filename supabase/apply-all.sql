-- ===== supabase/migrations/20261016110000_archive_prototype.sql =====
-- Moves the hand-made prototype schema that lived in the HSE Project before the
-- canonical schema (next migration) out of the way, without deleting anything.
--
-- The prototype tables are parked in the `legacy` schema (empty except for one
-- placeholder organisation and three placeholder sites, recreated with proper
-- locations by supabase/seed.sql). Drop the `legacy` schema whenever you are sure
-- nothing there is needed:  drop schema legacy cascade;
--
-- Safe to run on an empty project: every statement is guarded.

create schema if not exists legacy;

do $$
declare
  t text;
begin
  foreach t in array array[
    'actions', 'incident_attachments', 'safety_walk_items', 'safety_walks',
    'incidents', 'profiles', 'site_locations', 'sites', 'organizations'
  ] loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t and table_type = 'BASE TABLE'
    ) and not exists (
      -- A table already carrying the canonical `reference` / `sort_order` columns is ours; leave it.
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name in ('reference', 'storage_path', 'item_key', 'skyddsombud_name', 'sort_order', 'organization_number')
    ) then
      execute format('alter table public.%I set schema legacy', t);
    end if;
  end loop;
end $$;


-- ===== supabase/migrations/20261016120000_sitesafety_schema.sql =====
-- SiteSafety Nordic — canonical schema, security policies and RPCs.
-- Idempotent: safe to run on an empty project or on top of an earlier ad-hoc schema.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_number text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  name text not null,
  city text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.site_locations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  organization_id uuid references public.organizations (id) on delete set null,
  site_id uuid not null references public.sites (id) on delete restrict,
  location_id uuid references public.site_locations (id) on delete set null,
  location text,
  type text not null,
  category text not null,
  severity text not null,
  status text not null default 'open',
  description text not null,
  source text not null default 'report',
  is_anonymous boolean not null default false,
  reporter_name text,
  alert_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  storage_path text not null,
  kind text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.safety_walks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  site_id uuid not null references public.sites (id) on delete restrict,
  title text not null,
  skyddsombud_name text,
  skyddsombud_role text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.safety_walk_items (
  id uuid primary key default gen_random_uuid(),
  safety_walk_id uuid not null references public.safety_walks (id) on delete cascade,
  domain text not null,
  item_key text not null,
  title text not null,
  status text not null,
  notes text,
  photo_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents (id) on delete cascade,
  safety_walk_id uuid references public.safety_walks (id) on delete cascade,
  safety_walk_item_id uuid references public.safety_walk_items (id) on delete cascade,
  title text,
  description text,
  assignee_id text,
  assignee_name text,
  due_date date,
  status text not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Columns that may be missing when upgrading from an earlier hand-made schema.
alter table public.incidents add column if not exists reference text;
alter table public.incidents add column if not exists organization_id uuid;
alter table public.incidents add column if not exists location_id uuid;
alter table public.incidents add column if not exists location text;
alter table public.incidents add column if not exists source text not null default 'report';
alter table public.incidents add column if not exists is_anonymous boolean not null default false;
alter table public.incidents add column if not exists reporter_name text;
alter table public.incidents add column if not exists alert_sent_at timestamptz;
alter table public.incidents add column if not exists updated_at timestamptz;
alter table public.incident_attachments add column if not exists mime_type text;
alter table public.safety_walks add column if not exists organization_id uuid;
alter table public.safety_walks add column if not exists skyddsombud_name text;
alter table public.safety_walks add column if not exists skyddsombud_role text;
alter table public.safety_walk_items add column if not exists photo_path text;
alter table public.safety_walk_items add column if not exists sort_order integer not null default 0;
alter table public.actions add column if not exists safety_walk_id uuid;
alter table public.actions add column if not exists safety_walk_item_id uuid;
alter table public.actions add column if not exists title text;
alter table public.actions add column if not exists description text;
alter table public.actions add column if not exists assignee_id text;
alter table public.actions add column if not exists assignee_name text;
alter table public.actions add column if not exists updated_at timestamptz;
alter table public.site_locations add column if not exists sort_order integer not null default 0;

-- ---------------------------------------------------------------------------
-- Constraints (enumerations the app relies on)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_type_check') then
    alter table public.incidents add constraint incidents_type_check
      check (type in ('near-miss', 'hazard', 'accident'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_category_check') then
    alter table public.incidents add constraint incidents_category_check
      check (category in ('falls', 'machine', 'falling-objects', 'slip-trip', 'chemical', 'electrical', 'ergonomic'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_severity_check') then
    alter table public.incidents add constraint incidents_severity_check
      check (severity in ('low', 'medium', 'high', 'critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_status_check') then
    alter table public.incidents add constraint incidents_status_check
      check (status in ('open', 'in-progress', 'resolved'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_source_check') then
    alter table public.incidents add constraint incidents_source_check
      check (source in ('report', 'skyddsrond'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incident_attachments_kind_check') then
    alter table public.incident_attachments add constraint incident_attachments_kind_check
      check (kind in ('photo', 'voice'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'safety_walk_items_status_check') then
    alter table public.safety_walk_items add constraint safety_walk_items_status_check
      check (status in ('ok', 'deviation', 'na'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'actions_status_check') then
    alter table public.actions add constraint actions_status_check
      check (status in ('pending', 'open', 'in-progress', 'resolved'));
  end if;
end $$;

create index if not exists incidents_created_at_idx on public.incidents (created_at desc);
create index if not exists incidents_site_id_idx on public.incidents (site_id);
create index if not exists incident_attachments_incident_id_idx on public.incident_attachments (incident_id);
create index if not exists actions_incident_id_idx on public.actions (incident_id);
create index if not exists actions_walk_item_idx on public.actions (safety_walk_item_id);
create index if not exists safety_walk_items_walk_idx on public.safety_walk_items (safety_walk_id);
create index if not exists safety_walks_completed_at_idx on public.safety_walks (completed_at desc);

-- ---------------------------------------------------------------------------
-- Reference numbers: SS-2026-0001 for field reports, SR-2026-0001 for skyddsrond deviations
-- ---------------------------------------------------------------------------

create sequence if not exists public.incident_reference_seq;

create or replace function public.set_incident_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference :=
      case when new.source = 'skyddsrond' then 'SR-' else 'SS-' end
      || to_char(coalesce(new.created_at, now()), 'YYYY') || '-'
      || lpad(nextval('public.incident_reference_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists incidents_set_reference on public.incidents;
create trigger incidents_set_reference
  before insert on public.incidents
  for each row execute function public.set_incident_reference();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists incidents_touch_updated_at on public.incidents;
create trigger incidents_touch_updated_at
  before update on public.incidents
  for each row execute function public.touch_updated_at();

drop trigger if exists actions_touch_updated_at on public.actions;
create trigger actions_touch_updated_at
  before update on public.actions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: submit_incident — lets field workers report WITHOUT an account and
-- without any read access to the incidents table. Runs as the function owner.
-- ---------------------------------------------------------------------------

create or replace function public.submit_incident(
  p_id uuid,
  p_site_id uuid,
  p_location_id uuid,
  p_type text,
  p_category text,
  p_severity text,
  p_description text,
  p_is_anonymous boolean,
  p_reporter_name text,
  p_attachments jsonb default '[]'::jsonb
)
returns table (id uuid, reference text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sites%rowtype;
  v_location_name text;
  v_attachment jsonb;
  v_path text;
begin
  if p_id is null then
    raise exception 'incident id is required';
  end if;
  if length(trim(coalesce(p_description, ''))) < 8 then
    raise exception 'description is too short';
  end if;

  select * into v_site from public.sites s where s.id = p_site_id;
  if not found then
    raise exception 'unknown site';
  end if;

  if p_location_id is not null then
    select l.name into v_location_name
    from public.site_locations l
    where l.id = p_location_id and l.site_id = p_site_id;
    if not found then
      raise exception 'unknown location for site';
    end if;
  end if;

  insert into public.incidents (
    id, organization_id, site_id, location_id, location, type, category, severity,
    status, description, source, is_anonymous, reporter_name
  ) values (
    p_id, v_site.organization_id, p_site_id, p_location_id, coalesce(v_location_name, v_site.name),
    p_type, p_category, p_severity, 'open', trim(p_description), 'report',
    coalesce(p_is_anonymous, false),
    case when coalesce(p_is_anonymous, false) then null else p_reporter_name end
  );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_path := v_attachment->>'storage_path';
    if v_path is null or position('incidents/' || p_id::text || '/' in v_path) <> 1 then
      raise exception 'attachment path does not belong to this incident';
    end if;
    insert into public.incident_attachments (incident_id, storage_path, kind, mime_type)
    values (p_id, v_path, v_attachment->>'kind', v_attachment->>'mime_type');
  end loop;

  return query
    select i.id, i.reference, i.created_at from public.incidents i where i.id = p_id;
end;
$$;

revoke all on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb) from public;
grant execute on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: claim_incident_alert — returns the e-mail payload for a CRITICAL
-- incident exactly once (atomically stamps alert_sent_at). Used by the
-- /api/alerts/critical-incident route so the e-mail cannot be forged or spammed.
-- ---------------------------------------------------------------------------

create or replace function public.claim_incident_alert(p_id uuid)
returns table (
  id uuid,
  reference text,
  type text,
  category text,
  severity text,
  description text,
  site_name text,
  location_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.incidents i
    set alert_sent_at = now()
    where i.id = p_id
      and i.severity = 'critical'
      and i.alert_sent_at is null
    returning i.*
  )
  select
    c.id,
    c.reference,
    c.type,
    c.category,
    c.severity,
    c.description,
    s.name as site_name,
    coalesce(l.name, c.location, s.name) as location_name,
    c.created_at
  from claimed c
  join public.sites s on s.id = c.site_id
  left join public.site_locations l on l.id = c.location_id;
$$;

revoke all on function public.claim_incident_alert(uuid) from public;
grant execute on function public.claim_incident_alert(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--   anon (field worker, no login):  read sites; submit incidents via RPC; upload media
--   authenticated (safety officer): everything
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.sites enable row level security;
alter table public.site_locations enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_attachments enable row level security;
alter table public.actions enable row level security;
alter table public.safety_walks enable row level security;
alter table public.safety_walk_items enable row level security;

drop policy if exists "organizations readable" on public.organizations;
create policy "organizations readable" on public.organizations
  for select to anon, authenticated using (true);

drop policy if exists "sites readable" on public.sites;
create policy "sites readable" on public.sites
  for select to anon, authenticated using (true);

drop policy if exists "site locations readable" on public.site_locations;
create policy "site locations readable" on public.site_locations
  for select to anon, authenticated using (true);

drop policy if exists "incidents officer access" on public.incidents;
create policy "incidents officer access" on public.incidents
  for all to authenticated using (true) with check (true);

drop policy if exists "attachments officer access" on public.incident_attachments;
create policy "attachments officer access" on public.incident_attachments
  for all to authenticated using (true) with check (true);

drop policy if exists "actions officer access" on public.actions;
create policy "actions officer access" on public.actions
  for all to authenticated using (true) with check (true);

drop policy if exists "walks officer access" on public.safety_walks;
create policy "walks officer access" on public.safety_walks
  for all to authenticated using (true) with check (true);

drop policy if exists "walk items officer access" on public.safety_walk_items;
create policy "walk items officer access" on public.safety_walk_items
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage: private bucket, uploads from the field, reads for officers
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('incident-media', 'incident-media', false, 26214400, array['image/*', 'audio/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "incident media upload" on storage.objects;
create policy "incident media upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'incident-media');

drop policy if exists "incident media read" on storage.objects;
create policy "incident media read" on storage.objects
  for select to authenticated
  using (bucket_id = 'incident-media');

drop policy if exists "incident media manage" on storage.objects;
create policy "incident media manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'incident-media') with check (bucket_id = 'incident-media');

-- ---------------------------------------------------------------------------
-- Realtime feed for the dashboard
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incidents'
  ) then
    alter publication supabase_realtime add table public.incidents;
  end if;
end $$;


-- ===== supabase/migrations/20261017090000_ai_summary_and_tracking.sql =====
-- Reports in the worker's own language with a Swedish summary, plus an
-- anonymous tracking code so the reporter can follow what happened.

alter table public.incidents add column if not exists original_language text;
alter table public.incidents add column if not exists original_text text;
alter table public.incidents add column if not exists summary_sv text;
alter table public.incidents add column if not exists ai_confidence real;
alter table public.incidents add column if not exists tracking_code text;
alter table public.incidents add column if not exists public_note text;

create unique index if not exists incidents_tracking_code_idx on public.incidents (tracking_code);

-- ---------------------------------------------------------------------------
-- Tracking code: 8 unambiguous characters (no 0/O, 1/I), e.g. K7FP-3M2X
-- ---------------------------------------------------------------------------

create or replace function public.generate_tracking_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      if i = 4 then code := code || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.incidents where tracking_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.set_incident_tracking_code()
returns trigger
language plpgsql
as $$
begin
  if new.tracking_code is null or new.tracking_code = '' then
    new.tracking_code := public.generate_tracking_code();
  end if;
  return new;
end;
$$;

drop trigger if exists incidents_set_tracking_code on public.incidents;
create trigger incidents_set_tracking_code
  before insert on public.incidents
  for each row execute function public.set_incident_tracking_code();

-- ---------------------------------------------------------------------------
-- submit_incident: now also stores the original language/text and the Swedish
-- summary, and returns the tracking code to the reporter.
-- ---------------------------------------------------------------------------

drop function if exists public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb);

create or replace function public.submit_incident(
  p_id uuid,
  p_site_id uuid,
  p_location_id uuid,
  p_type text,
  p_category text,
  p_severity text,
  p_description text,
  p_is_anonymous boolean,
  p_reporter_name text,
  p_attachments jsonb default '[]'::jsonb,
  p_original_language text default null,
  p_original_text text default null,
  p_summary_sv text default null,
  p_ai_confidence real default null
)
returns table (id uuid, reference text, created_at timestamptz, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sites%rowtype;
  v_location_name text;
  v_attachment jsonb;
  v_path text;
begin
  if p_id is null then
    raise exception 'incident id is required';
  end if;
  if length(trim(coalesce(p_description, ''))) < 8 then
    raise exception 'description is too short';
  end if;

  select * into v_site from public.sites s where s.id = p_site_id;
  if not found then
    raise exception 'unknown site';
  end if;

  if p_location_id is not null then
    select l.name into v_location_name
    from public.site_locations l
    where l.id = p_location_id and l.site_id = p_site_id;
    if not found then
      raise exception 'unknown location for site';
    end if;
  end if;

  insert into public.incidents (
    id, organization_id, site_id, location_id, location, type, category, severity,
    status, description, source, is_anonymous, reporter_name,
    original_language, original_text, summary_sv, ai_confidence
  ) values (
    p_id, v_site.organization_id, p_site_id, p_location_id, coalesce(v_location_name, v_site.name),
    p_type, p_category, p_severity, 'open', trim(p_description), 'report',
    coalesce(p_is_anonymous, false),
    case when coalesce(p_is_anonymous, false) then null else p_reporter_name end,
    nullif(trim(coalesce(p_original_language, '')), ''),
    nullif(trim(coalesce(p_original_text, '')), ''),
    nullif(trim(coalesce(p_summary_sv, '')), ''),
    p_ai_confidence
  );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_path := v_attachment->>'storage_path';
    if v_path is null or position('incidents/' || p_id::text || '/' in v_path) <> 1 then
      raise exception 'attachment path does not belong to this incident';
    end if;
    insert into public.incident_attachments (incident_id, storage_path, kind, mime_type)
    values (p_id, v_path, v_attachment->>'kind', v_attachment->>'mime_type');
  end loop;

  return query
    select i.id, i.reference, i.created_at, i.tracking_code from public.incidents i where i.id = p_id;
end;
$$;

revoke all on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real) from public;
grant execute on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- track_incident: what a reporter may see with their code. No description, no
-- names: just where the report stands and the officer's note to the reporter.
-- ---------------------------------------------------------------------------

create or replace function public.track_incident(p_code text)
returns table (
  reference text,
  status text,
  severity text,
  created_at timestamptz,
  updated_at timestamptz,
  has_owner boolean,
  due_date date,
  public_note text
)
language sql
security definer
set search_path = public
as $$
  select
    i.reference,
    i.status,
    i.severity,
    i.created_at,
    i.updated_at,
    exists (select 1 from public.actions a where a.incident_id = i.id and coalesce(a.assignee_name, '') <> '') as has_owner,
    (select a.due_date from public.actions a where a.incident_id = i.id order by a.updated_at desc nulls last limit 1) as due_date,
    i.public_note
  from public.incidents i
  where i.tracking_code = upper(replace(trim(p_code), ' ', ''))
  limit 1;
$$;

revoke all on function public.track_incident(text) from public;
grant execute on function public.track_incident(text) to anon, authenticated;


-- ===== supabase/migrations/20261017120000_analysis_contacts_meetings.sql =====
-- Officer-side assistant analysis, a contact list for alerts and meetings,
-- and emergency meeting invitations.

alter table public.incidents add column if not exists ai_analysis jsonb;
alter table public.incidents add column if not exists ai_analysis_language text;
alter table public.incidents add column if not exists ai_analyzed_at timestamptz;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  name text not null,
  email text not null,
  role text,
  created_at timestamptz not null default now()
);

create unique index if not exists contacts_email_idx on public.contacts (lower(email));

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents (id) on delete cascade,
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  location text,
  note text,
  recipients jsonb not null default '[]'::jsonb,
  created_by uuid,
  email_id text,
  created_at timestamptz not null default now()
);

create index if not exists meetings_incident_id_idx on public.meetings (incident_id);

alter table public.contacts enable row level security;
alter table public.meetings enable row level security;

drop policy if exists "contacts officer access" on public.contacts;
create policy "contacts officer access" on public.contacts
  for all to authenticated using (true) with check (true);

drop policy if exists "meetings officer access" on public.meetings;
create policy "meetings officer access" on public.meetings
  for all to authenticated using (true) with check (true);

select 'analysis + contacts + meetings ready' as result;


-- ===== supabase/migrations/20261017150000_people_roles_tasks_locations.sql =====
-- People with roles (imported from Excel), who reports to whom, tasks with
-- feedback, geographic positions, and a log of who was notified about what.

-- ---------------------------------------------------------------------------
-- People and roles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  employee_no text,
  full_name text not null,
  email text,
  phone text,
  role text not null default 'worker',
  reports_to uuid references public.profiles (id) on delete set null,
  language text,
  active boolean not null default true,
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('worker', 'foreman', 'safety_officer', 'hse_manager', 'admin'));
  end if;
end $$;

create unique index if not exists profiles_email_idx on public.profiles (lower(email)) where email is not null;
create unique index if not exists profiles_employee_no_idx on public.profiles (employee_no) where employee_no is not null;
create index if not exists profiles_site_idx on public.profiles (site_id);
create index if not exists profiles_reports_to_idx on public.profiles (reports_to);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Who reported (when not anonymous) and where exactly.
alter table public.incidents add column if not exists reporter_profile_id uuid references public.profiles (id) on delete set null;
alter table public.incidents add column if not exists latitude double precision;
alter table public.incidents add column if not exists longitude double precision;
alter table public.sites add column if not exists latitude double precision;
alter table public.sites add column if not exists longitude double precision;
alter table public.site_locations add column if not exists latitude double precision;
alter table public.site_locations add column if not exists longitude double precision;

create index if not exists incidents_reporter_profile_idx on public.incidents (reporter_profile_id);

-- ---------------------------------------------------------------------------
-- Tasks: managers assign work to their team and get feedback back
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  incident_id uuid references public.incidents (id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'open',
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_date date,
  feedback text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_status_check') then
    alter table public.tasks add constraint tasks_status_check
      check (status in ('open', 'in-progress', 'done', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table public.tasks add constraint tasks_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end $$;

create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_status_idx on public.tasks (status);

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Notification log: who was told about which incident, and why
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents (id) on delete cascade,
  recipient_profile_id uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  reason text not null,
  channel text not null default 'email',
  email_id text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_incident_idx on public.notifications (incident_id);

-- ---------------------------------------------------------------------------
-- submit_incident: now records who reported and the exact position
-- ---------------------------------------------------------------------------

drop function if exists public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real);

create or replace function public.submit_incident(
  p_id uuid,
  p_site_id uuid,
  p_location_id uuid,
  p_type text,
  p_category text,
  p_severity text,
  p_description text,
  p_is_anonymous boolean,
  p_reporter_name text,
  p_attachments jsonb default '[]'::jsonb,
  p_original_language text default null,
  p_original_text text default null,
  p_summary_sv text default null,
  p_ai_confidence real default null,
  p_reporter_profile_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns table (id uuid, reference text, created_at timestamptz, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sites%rowtype;
  v_location_name text;
  v_reporter public.profiles%rowtype;
  v_attachment jsonb;
  v_path text;
begin
  if p_id is null then
    raise exception 'incident id is required';
  end if;
  if length(trim(coalesce(p_description, ''))) < 8 then
    raise exception 'description is too short';
  end if;

  select * into v_site from public.sites s where s.id = p_site_id;
  if not found then
    raise exception 'unknown site';
  end if;

  if p_location_id is not null then
    select l.name into v_location_name
    from public.site_locations l
    where l.id = p_location_id and l.site_id = p_site_id;
    if not found then
      raise exception 'unknown location for site';
    end if;
  end if;

  if p_reporter_profile_id is not null and not coalesce(p_is_anonymous, false) then
    select * into v_reporter from public.profiles p where p.id = p_reporter_profile_id and p.active;
    if not found then
      raise exception 'unknown reporter';
    end if;
  end if;

  insert into public.incidents (
    id, organization_id, site_id, location_id, location, type, category, severity,
    status, description, source, is_anonymous, reporter_name, reporter_profile_id,
    original_language, original_text, summary_sv, ai_confidence, latitude, longitude
  ) values (
    p_id, v_site.organization_id, p_site_id, p_location_id, coalesce(v_location_name, v_site.name),
    p_type, p_category, p_severity, 'open', trim(p_description), 'report',
    coalesce(p_is_anonymous, false),
    case when coalesce(p_is_anonymous, false) then null else coalesce(v_reporter.full_name, p_reporter_name) end,
    case when coalesce(p_is_anonymous, false) then null else v_reporter.id end,
    nullif(trim(coalesce(p_original_language, '')), ''),
    nullif(trim(coalesce(p_original_text, '')), ''),
    nullif(trim(coalesce(p_summary_sv, '')), ''),
    p_ai_confidence,
    p_latitude, p_longitude
  );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_path := v_attachment->>'storage_path';
    if v_path is null or position('incidents/' || p_id::text || '/' in v_path) <> 1 then
      raise exception 'attachment path does not belong to this incident';
    end if;
    insert into public.incident_attachments (incident_id, storage_path, kind, mime_type)
    values (p_id, v_path, v_attachment->>'kind', v_attachment->>'mime_type');
  end loop;

  return query
    select i.id, i.reference, i.created_at, i.tracking_code from public.incidents i where i.id = p_id;
end;
$$;

revoke all on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision) from public;
grant execute on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs for the field (no login): who works on a site, and the routing data
-- the alert route needs (reporter's foreman, site officers, HSE managers).
-- ---------------------------------------------------------------------------

create or replace function public.list_site_people(p_site_id uuid)
returns table (id uuid, full_name text, role text, employee_no text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role, p.employee_no
  from public.profiles p
  where p.active and (p.site_id = p_site_id or p.site_id is null)
  order by p.full_name;
$$;

revoke all on function public.list_site_people(uuid) from public;
grant execute on function public.list_site_people(uuid) to anon, authenticated;

create or replace function public.incident_recipients(p_incident_id uuid)
returns table (profile_id uuid, full_name text, email text, role text, reason text)
language sql
security definer
set search_path = public
as $$
  with inc as (
    select i.* from public.incidents i where i.id = p_incident_id
  ),
  reporter as (
    select p.* from public.profiles p join inc on p.id = inc.reporter_profile_id
  )
  -- The reporter's own foreman always hears first.
  select f.id, f.full_name, f.email, f.role, 'foreman' as reason
  from reporter r join public.profiles f on f.id = r.reports_to
  where f.active and f.email is not null
  union
  -- Safety officers of the site (or without a site = all sites).
  select p.id, p.full_name, p.email, p.role, 'site_officer'
  from public.profiles p, inc
  where p.active and p.email is not null and p.role = 'safety_officer'
    and (p.site_id = inc.site_id or p.site_id is null)
  union
  -- HSE managers and admins only for high and critical incidents.
  select p.id, p.full_name, p.email, p.role, 'escalation'
  from public.profiles p, inc
  where p.active and p.email is not null and p.role in ('hse_manager', 'admin')
    and inc.severity in ('high', 'critical');
$$;

revoke all on function public.incident_recipients(uuid) from public;
grant execute on function public.incident_recipients(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles officer access" on public.profiles;
create policy "profiles officer access" on public.profiles
  for all to authenticated using (true) with check (true);

drop policy if exists "tasks officer access" on public.tasks;
create policy "tasks officer access" on public.tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "notifications officer access" on public.notifications;
create policy "notifications officer access" on public.notifications
  for all to authenticated using (true) with check (true);

-- Demo coordinates for the seeded sites (Göteborg / Malmö).
update public.sites set latitude = 57.7210, longitude = 11.8710 where id = 'aaaaaaaa-0001-4000-8000-000000000001' and latitude is null;
update public.sites set latitude = 57.7230, longitude = 11.9470 where id = 'aaaaaaaa-0002-4000-8000-000000000002' and latitude is null;
update public.sites set latitude = 55.5880, longitude = 12.9950 where id = 'aaaaaaaa-0003-4000-8000-000000000003' and latitude is null;

select 'people + roles + tasks + locations ready' as result;

-- ---------------------------------------------------------------------------
-- Notification log writer for the server route (runs as anon after a report).
-- Returns false when that person was already told about that incident.
-- ---------------------------------------------------------------------------

create or replace function public.log_notification(
  p_incident_id uuid,
  p_profile_id uuid,
  p_email text,
  p_reason text,
  p_email_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.notifications n
    where n.incident_id = p_incident_id and lower(n.recipient_email) = lower(p_email)
  ) then
    return false;
  end if;
  insert into public.notifications (incident_id, recipient_profile_id, recipient_email, reason, email_id)
  values (p_incident_id, p_profile_id, lower(p_email), p_reason, p_email_id);
  return true;
end;
$$;

revoke all on function public.log_notification(uuid, uuid, text, text, text) from public;
grant execute on function public.log_notification(uuid, uuid, text, text, text) to anon, authenticated;

-- Data the routing e-mail needs, readable by the route without a session.
create or replace function public.incident_for_notification(p_incident_id uuid)
returns table (
  id uuid, reference text, type text, category text, severity text, description text,
  summary_sv text, site_name text, location_name text, created_at timestamptz,
  reporter_name text, is_anonymous boolean, tracking_code text
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.reference, i.type, i.category, i.severity, i.description, i.summary_sv,
    s.name, coalesce(l.name, i.location, s.name), i.created_at,
    i.reporter_name, i.is_anonymous, i.tracking_code
  from public.incidents i
  join public.sites s on s.id = i.site_id
  left join public.site_locations l on l.id = i.location_id
  where i.id = p_incident_id;
$$;

revoke all on function public.incident_for_notification(uuid) from public;
grant execute on function public.incident_for_notification(uuid) to anon, authenticated;


-- ===== supabase/migrations/20261020090000_flexible_reports_tenants_audits.sql =====
-- Flexible reporting (optional area / map / risk type, more report types),
-- tenant isolation with a super admin, QR project links, and checklist
-- templates whose failed items become hazards with due dates.

-- ---------------------------------------------------------------------------
-- Report types and risk categories
-- ---------------------------------------------------------------------------

alter table public.incidents drop constraint if exists incidents_type_check;
alter table public.incidents add constraint incidents_type_check
  check (type in ('near-miss', 'hazard', 'accident', 'good-observation', 'positive-observation', 'environmental'));

-- Risk categories are an open list now (hundreds are possible); the app validates them.
alter table public.incidents drop constraint if exists incidents_category_check;
alter table public.incidents alter column category set default 'unclassified';

alter table public.incidents drop constraint if exists incidents_source_check;
alter table public.incidents add constraint incidents_source_check
  check (source in ('report', 'skyddsrond', 'audit'));

-- Several areas and several risk types per report; the single columns keep the first one.
alter table public.incidents add column if not exists location_ids uuid[] not null default '{}';
alter table public.incidents add column if not exists categories text[] not null default '{}';
alter table public.incidents add column if not exists audit_id uuid;

update public.incidents set categories = array[category] where categories = '{}' and category <> 'unclassified';
update public.incidents set location_ids = array[location_id] where location_ids = '{}' and location_id is not null;

-- ---------------------------------------------------------------------------
-- Tenants: every row belongs to an organisation; a super admin sees all
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('worker', 'foreman', 'safety_officer', 'hse_manager', 'admin', 'super_admin'));

alter table public.profiles add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.tasks add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.notifications add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.meetings add column if not exists organization_id uuid references public.organizations (id) on delete set null;

-- Backfill organisation from the site where it is missing.
update public.profiles p set organization_id = s.organization_id
  from public.sites s where p.site_id = s.id and p.organization_id is null;
update public.tasks t set organization_id = s.organization_id
  from public.sites s where t.site_id = s.id and t.organization_id is null;
update public.tasks t set organization_id = i.organization_id
  from public.incidents i where t.incident_id = i.id and t.organization_id is null;
update public.incidents i set organization_id = s.organization_id
  from public.sites s where i.site_id = s.id and i.organization_id is null;
update public.safety_walks w set organization_id = s.organization_id
  from public.sites s where w.site_id = s.id and w.organization_id is null;
update public.notifications n set organization_id = i.organization_id
  from public.incidents i where n.incident_id = i.id and n.organization_id is null;
update public.meetings m set organization_id = i.organization_id
  from public.incidents i where m.incident_id = i.id and m.organization_id is null;

-- Keep organisation in sync on insert so new rows never fall outside a tenant.
create or replace function public.set_organization_from_site()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null and new.site_id is not null then
    select s.organization_id into new.organization_id from public.sites s where s.id = new.site_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_organization on public.profiles;
create trigger profiles_set_organization before insert or update on public.profiles
  for each row execute function public.set_organization_from_site();
drop trigger if exists tasks_set_organization on public.tasks;
create trigger tasks_set_organization before insert or update on public.tasks
  for each row execute function public.set_organization_from_site();
drop trigger if exists incidents_set_organization on public.incidents;
create trigger incidents_set_organization before insert or update on public.incidents
  for each row execute function public.set_organization_from_site();
drop trigger if exists safety_walks_set_organization on public.safety_walks;
create trigger safety_walks_set_organization before insert or update on public.safety_walks
  for each row execute function public.set_organization_from_site();

create or replace function public.set_organization_from_incident()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null and new.incident_id is not null then
    select i.organization_id into new.organization_id from public.incidents i where i.id = new.incident_id;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_set_organization on public.notifications;
create trigger notifications_set_organization before insert on public.notifications
  for each row execute function public.set_organization_from_incident();
drop trigger if exists meetings_set_organization on public.meetings;
create trigger meetings_set_organization before insert on public.meetings
  for each row execute function public.set_organization_from_incident();

-- The signed-in person's profile: by auth user id first, then by e-mail.
create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.profiles p
  where p.active
    and (p.auth_user_id = auth.uid() or lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  order by (p.auth_user_id = auth.uid()) desc nulls last
  limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role = 'super_admin' from public.current_profile() p), false);
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (select p.organization_id from public.current_profile() p);
$$;

-- True when the current user may see rows of this organisation.
-- A signed-in account that is not in the people list yet sees everything so
-- the first administrator can import people; add them with a role to scope them.
create or replace function public.tenant_visible(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or (select p.id from public.current_profile() p) is null
    or p_organization_id is null
    or p_organization_id = public.current_organization_id();
$$;

revoke all on function public.current_profile() from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.current_organization_id() from public;
revoke all on function public.tenant_visible(uuid) from public;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.tenant_visible(uuid) to authenticated;

-- Tenant-scoped policies replace the "any signed-in user sees all" ones.
drop policy if exists "incidents officer access" on public.incidents;
create policy "incidents officer access" on public.incidents
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

drop policy if exists "attachments officer access" on public.incident_attachments;
create policy "attachments officer access" on public.incident_attachments
  for all to authenticated
  using (exists (select 1 from public.incidents i where i.id = incident_id and public.tenant_visible(i.organization_id)))
  with check (exists (select 1 from public.incidents i where i.id = incident_id and public.tenant_visible(i.organization_id)));

drop policy if exists "actions officer access" on public.actions;
create policy "actions officer access" on public.actions
  for all to authenticated
  using (
    (incident_id is null or exists (select 1 from public.incidents i where i.id = incident_id and public.tenant_visible(i.organization_id)))
    and (safety_walk_id is null or exists (select 1 from public.safety_walks w where w.id = safety_walk_id and public.tenant_visible(w.organization_id)))
  )
  with check (
    (incident_id is null or exists (select 1 from public.incidents i where i.id = incident_id and public.tenant_visible(i.organization_id)))
    and (safety_walk_id is null or exists (select 1 from public.safety_walks w where w.id = safety_walk_id and public.tenant_visible(w.organization_id)))
  );

drop policy if exists "walks officer access" on public.safety_walks;
create policy "walks officer access" on public.safety_walks
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

drop policy if exists "walk items officer access" on public.safety_walk_items;
create policy "walk items officer access" on public.safety_walk_items
  for all to authenticated
  using (exists (select 1 from public.safety_walks w where w.id = safety_walk_id and public.tenant_visible(w.organization_id)))
  with check (exists (select 1 from public.safety_walks w where w.id = safety_walk_id and public.tenant_visible(w.organization_id)));

drop policy if exists "contacts officer access" on public.contacts;
create policy "contacts officer access" on public.contacts
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

drop policy if exists "meetings officer access" on public.meetings;
create policy "meetings officer access" on public.meetings
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

drop policy if exists "profiles officer access" on public.profiles;
create policy "profiles officer access" on public.profiles
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

drop policy if exists "tasks officer access" on public.tasks;
create policy "tasks officer access" on public.tasks
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

drop policy if exists "notifications officer access" on public.notifications;
create policy "notifications officer access" on public.notifications
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

-- ---------------------------------------------------------------------------
-- submit_incident: several areas and risk types, all optional
-- ---------------------------------------------------------------------------

drop function if exists public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision);

create or replace function public.submit_incident(
  p_id uuid,
  p_site_id uuid,
  p_location_id uuid,
  p_type text,
  p_category text,
  p_severity text,
  p_description text,
  p_is_anonymous boolean,
  p_reporter_name text,
  p_attachments jsonb default '[]'::jsonb,
  p_original_language text default null,
  p_original_text text default null,
  p_summary_sv text default null,
  p_ai_confidence real default null,
  p_reporter_profile_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_ids uuid[] default '{}',
  p_categories text[] default '{}'
)
returns table (id uuid, reference text, created_at timestamptz, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sites%rowtype;
  v_location_names text;
  v_reporter public.profiles%rowtype;
  v_attachment jsonb;
  v_path text;
  v_location_ids uuid[];
  v_categories text[];
begin
  if p_id is null then
    raise exception 'incident id is required';
  end if;
  if length(trim(coalesce(p_description, ''))) < 8 then
    raise exception 'description is too short';
  end if;

  select * into v_site from public.sites s where s.id = p_site_id;
  if not found then
    raise exception 'unknown site';
  end if;

  -- Areas: the explicit list, or the single area, or none.
  v_location_ids := coalesce(p_location_ids, '{}');
  if cardinality(v_location_ids) = 0 and p_location_id is not null then
    v_location_ids := array[p_location_id];
  end if;
  if cardinality(v_location_ids) > 0 then
    if exists (
      select 1 from unnest(v_location_ids) as wanted(id)
      where not exists (select 1 from public.site_locations l where l.id = wanted.id and l.site_id = p_site_id)
    ) then
      raise exception 'unknown location for site';
    end if;
    select string_agg(l.name, ', ' order by l.sort_order) into v_location_names
    from public.site_locations l where l.id = any (v_location_ids);
  end if;

  -- Risk types: the explicit list, or the single one; empty means "not classified yet".
  v_categories := array_remove(coalesce(p_categories, '{}'), 'unclassified');
  if cardinality(v_categories) = 0 and p_category is not null and p_category <> 'unclassified' then
    v_categories := array[p_category];
  end if;

  if p_reporter_profile_id is not null and not coalesce(p_is_anonymous, false) then
    select * into v_reporter from public.profiles p where p.id = p_reporter_profile_id and p.active;
    if not found then
      raise exception 'unknown reporter';
    end if;
  end if;

  insert into public.incidents (
    id, organization_id, site_id, location_id, location_ids, location, type, category, categories, severity,
    status, description, source, is_anonymous, reporter_name, reporter_profile_id,
    original_language, original_text, summary_sv, ai_confidence, latitude, longitude
  ) values (
    p_id, v_site.organization_id, p_site_id, v_location_ids[1], v_location_ids,
    coalesce(v_location_names, v_site.name),
    p_type, coalesce(v_categories[1], 'unclassified'), v_categories, p_severity, 'open', trim(p_description), 'report',
    coalesce(p_is_anonymous, false),
    case when coalesce(p_is_anonymous, false) then null else coalesce(v_reporter.full_name, p_reporter_name) end,
    case when coalesce(p_is_anonymous, false) then null else v_reporter.id end,
    nullif(trim(coalesce(p_original_language, '')), ''),
    nullif(trim(coalesce(p_original_text, '')), ''),
    nullif(trim(coalesce(p_summary_sv, '')), ''),
    p_ai_confidence,
    p_latitude, p_longitude
  );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_path := v_attachment->>'storage_path';
    if v_path is null or position('incidents/' || p_id::text || '/' in v_path) <> 1 then
      raise exception 'attachment path does not belong to this incident';
    end if;
    insert into public.incident_attachments (incident_id, storage_path, kind, mime_type)
    values (p_id, v_path, v_attachment->>'kind', v_attachment->>'mime_type');
  end loop;

  return query
    select i.id, i.reference, i.created_at, i.tracking_code from public.incidents i where i.id = p_id;
end;
$$;

revoke all on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[]) from public;
grant execute on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Checklist templates and audits (field inspections)
-- ---------------------------------------------------------------------------

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  name text not null,
  description text,
  items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  template_id uuid references public.checklist_templates (id) on delete set null,
  template_name text not null,
  site_id uuid references public.sites (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_date date,
  status text not null default 'assigned',
  items jsonb not null default '[]'::jsonb,
  note text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'audits_status_check') then
    alter table public.audits add constraint audits_status_check
      check (status in ('assigned', 'in-progress', 'submitted', 'done', 'cancelled'));
  end if;
end $$;

create index if not exists audits_assignee_idx on public.audits (assignee_id);
create index if not exists audits_status_idx on public.audits (status);
create index if not exists incidents_audit_idx on public.incidents (audit_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_audit_id_fkey') then
    alter table public.incidents add constraint incidents_audit_id_fkey
      foreign key (audit_id) references public.audits (id) on delete set null;
  end if;
end $$;

drop trigger if exists checklist_templates_touch_updated_at on public.checklist_templates;
create trigger checklist_templates_touch_updated_at
  before update on public.checklist_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists audits_touch_updated_at on public.audits;
create trigger audits_touch_updated_at
  before update on public.audits
  for each row execute function public.touch_updated_at();

drop trigger if exists audits_set_organization on public.audits;
create trigger audits_set_organization before insert or update on public.audits
  for each row execute function public.set_organization_from_site();

-- An audit closes only when every non-conformity it raised is resolved.
create or replace function public.audit_open_nonconformities(p_audit_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.incidents i where i.audit_id = p_audit_id and i.status <> 'resolved';
$$;

create or replace function public.audits_enforce_close()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    if public.audit_open_nonconformities(new.id) > 0 then
      raise exception 'audit has open non-conformities';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  if new.status = 'submitted' and (old.status is distinct from 'submitted') then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists audits_enforce_close on public.audits;
create trigger audits_enforce_close before update on public.audits
  for each row execute function public.audits_enforce_close();

alter table public.checklist_templates enable row level security;
alter table public.audits enable row level security;

drop policy if exists "templates officer access" on public.checklist_templates;
create policy "templates officer access" on public.checklist_templates
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

drop policy if exists "audits officer access" on public.audits;
create policy "audits officer access" on public.audits
  for all to authenticated
  using (public.tenant_visible(organization_id))
  with check (public.tenant_visible(organization_id));

select 'flexible reports + tenants + audits ready' as result;


-- ===== supabase/migrations/20261021090000_owner_settings_optional_reports.sql =====
-- Owner (super admin) and per-company settings, reports where only the
-- description is required, per-company risk types, stricter tenant isolation.

-- ---------------------------------------------------------------------------
-- Reports: only "what happened" is required
-- ---------------------------------------------------------------------------

alter table public.incidents alter column site_id drop not null;
alter table public.incidents add column if not exists location_note text;
alter table public.incidents add column if not exists type_note text;

alter table public.incidents drop constraint if exists incidents_type_check;
alter table public.incidents add constraint incidents_type_check
  check (type in ('near-miss', 'hazard', 'accident', 'good-observation', 'positive-observation', 'environmental', 'other'));

-- ---------------------------------------------------------------------------
-- Companies (tenants), their risk types
-- ---------------------------------------------------------------------------

alter table public.organizations add column if not exists industry text;
alter table public.organizations add column if not exists active boolean not null default true;
alter table public.sites add column if not exists active boolean not null default true;

create table if not exists public.risk_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists risk_types_org_label_idx on public.risk_types (organization_id, lower(label));

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- Company managers (and the owner) manage places, areas, risk types and staff.
create or replace function public.is_org_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role in ('hse_manager', 'admin', 'super_admin') from public.current_profile() p), false);
$$;

revoke all on function public.is_org_manager() from public;
grant execute on function public.is_org_manager() to authenticated;

-- Rows are visible to the owner, or to people of the same company. A signed-in
-- account that is not in the people list sees nothing.
create or replace function public.tenant_visible(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or (p_organization_id is not null and p_organization_id = public.current_organization_id());
$$;

-- New rows without a company inherit the site's company, else the creator's.
create or replace function public.set_organization_from_site()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null and new.site_id is not null then
    select s.organization_id into new.organization_id from public.sites s where s.id = new.site_id;
  end if;
  if new.organization_id is null then
    new.organization_id := public.current_organization_id();
  end if;
  return new;
end;
$$;

create or replace function public.set_organization_from_incident()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null and new.incident_id is not null then
    select i.organization_id into new.organization_id from public.incidents i where i.id = new.incident_id;
  end if;
  if new.organization_id is null then
    new.organization_id := public.current_organization_id();
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_set_organization on public.contacts;
create or replace function public.set_organization_from_creator()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_organization_id();
  end if;
  return new;
end;
$$;
create trigger contacts_set_organization before insert on public.contacts
  for each row execute function public.set_organization_from_creator();
drop trigger if exists templates_set_organization on public.checklist_templates;
create trigger templates_set_organization before insert on public.checklist_templates
  for each row execute function public.set_organization_from_creator();

-- Companies: only the owner creates or removes them; a manager may edit their own.
drop policy if exists "organizations owner insert" on public.organizations;
create policy "organizations owner insert" on public.organizations
  for insert to authenticated with check (public.is_super_admin());
drop policy if exists "organizations manager update" on public.organizations;
create policy "organizations manager update" on public.organizations
  for update to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and id = public.current_organization_id()))
  with check (public.is_super_admin() or (public.is_org_manager() and id = public.current_organization_id()));
drop policy if exists "organizations owner delete" on public.organizations;
create policy "organizations owner delete" on public.organizations
  for delete to authenticated using (public.is_super_admin());

-- Places (sites) and areas: the company's managers.
drop policy if exists "sites manager insert" on public.sites;
create policy "sites manager insert" on public.sites
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));
drop policy if exists "sites manager update" on public.sites;
create policy "sites manager update" on public.sites
  for update to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()))
  with check (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));

drop policy if exists "site locations manager write" on public.site_locations;
create policy "site locations manager write" on public.site_locations
  for all to authenticated
  using (exists (
    select 1 from public.sites s
    where s.id = site_id and (public.is_super_admin() or (public.is_org_manager() and s.organization_id = public.current_organization_id()))
  ))
  with check (exists (
    select 1 from public.sites s
    where s.id = site_id and (public.is_super_admin() or (public.is_org_manager() and s.organization_id = public.current_organization_id()))
  ));

alter table public.risk_types enable row level security;
drop policy if exists "risk types readable" on public.risk_types;
create policy "risk types readable" on public.risk_types
  for select to anon, authenticated using (true);
drop policy if exists "risk types manager write" on public.risk_types;
create policy "risk types manager write" on public.risk_types
  for all to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()))
  with check (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));

-- People: everyone in the company reads; managers add field staff; only the
-- owner creates managers and other owners.
drop policy if exists "profiles officer access" on public.profiles;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated
  using (public.tenant_visible(organization_id) or auth_user_id = auth.uid());
drop policy if exists "profiles manager insert" on public.profiles;
create policy "profiles manager insert" on public.profiles
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'safety_officer'))
  );
drop policy if exists "profiles manager update" on public.profiles;
create policy "profiles manager update" on public.profiles
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'safety_officer'))
  )
  with check (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'safety_officer'))
  );
drop policy if exists "profiles manager delete" on public.profiles;
create policy "profiles manager delete" on public.profiles
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'safety_officer'))
  );

-- ---------------------------------------------------------------------------
-- The app owner: the first account created in Supabase Auth becomes super admin
-- (only when there is none yet).
-- ---------------------------------------------------------------------------

do $$
declare
  v_user record;
begin
  if not exists (select 1 from public.profiles where role = 'super_admin') then
    select u.id, u.email, u.raw_user_meta_data into v_user
    from auth.users u
    where u.email is not null
    order by u.created_at
    limit 1;
    if v_user.id is not null then
      update public.profiles
        set role = 'super_admin', auth_user_id = v_user.id, active = true
        where lower(email) = lower(v_user.email);
      if not found then
        insert into public.profiles (full_name, email, role, auth_user_id)
        values (
          coalesce(nullif(v_user.raw_user_meta_data ->> 'full_name', ''), split_part(v_user.email, '@', 1)),
          v_user.email,
          'super_admin',
          v_user.id
        );
      end if;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- submit_incident: company from the QR code, site optional, free-text place
-- ---------------------------------------------------------------------------

drop function if exists public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[]);

create or replace function public.submit_incident(
  p_id uuid,
  p_site_id uuid,
  p_location_id uuid,
  p_type text,
  p_category text,
  p_severity text,
  p_description text,
  p_is_anonymous boolean,
  p_reporter_name text,
  p_attachments jsonb default '[]'::jsonb,
  p_original_language text default null,
  p_original_text text default null,
  p_summary_sv text default null,
  p_ai_confidence real default null,
  p_reporter_profile_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_ids uuid[] default '{}',
  p_categories text[] default '{}',
  p_organization_id uuid default null,
  p_location_note text default null,
  p_type_note text default null
)
returns table (id uuid, reference text, created_at timestamptz, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sites%rowtype;
  v_organization_id uuid;
  v_location_names text;
  v_reporter public.profiles%rowtype;
  v_attachment jsonb;
  v_path text;
  v_location_ids uuid[];
  v_categories text[];
begin
  if p_id is null then
    raise exception 'incident id is required';
  end if;
  if length(trim(coalesce(p_description, ''))) < 8 then
    raise exception 'description is too short';
  end if;

  if p_site_id is not null then
    select * into v_site from public.sites s where s.id = p_site_id;
    if not found then
      raise exception 'unknown site';
    end if;
    if p_organization_id is not null and v_site.organization_id is distinct from p_organization_id then
      raise exception 'site does not belong to this company';
    end if;
    v_organization_id := v_site.organization_id;
  elsif p_organization_id is not null then
    if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
      raise exception 'unknown company';
    end if;
    v_organization_id := p_organization_id;
  end if;

  v_location_ids := coalesce(p_location_ids, '{}');
  if cardinality(v_location_ids) = 0 and p_location_id is not null then
    v_location_ids := array[p_location_id];
  end if;
  if cardinality(v_location_ids) > 0 then
    if p_site_id is null then
      raise exception 'areas need a site';
    end if;
    if exists (
      select 1 from unnest(v_location_ids) as wanted(id)
      where not exists (select 1 from public.site_locations l where l.id = wanted.id and l.site_id = p_site_id)
    ) then
      raise exception 'unknown location for site';
    end if;
    select string_agg(l.name, ', ' order by l.sort_order) into v_location_names
    from public.site_locations l where l.id = any (v_location_ids);
  end if;

  -- Risk types are built-in keys or free text; empty means "not classified yet".
  select coalesce(array_agg(distinct left(trim(c), 80)) filter (where trim(c) <> '' and c <> 'unclassified'), '{}')
    into v_categories
  from unnest(coalesce(p_categories, '{}') || case when p_category is null then '{}'::text[] else array[p_category] end) as c;

  if p_reporter_profile_id is not null and not coalesce(p_is_anonymous, false) then
    select * into v_reporter from public.profiles p where p.id = p_reporter_profile_id and p.active;
    if not found then
      raise exception 'unknown reporter';
    end if;
  end if;

  insert into public.incidents (
    id, organization_id, site_id, location_id, location_ids, location, location_note, type, type_note,
    category, categories, severity, status, description, source, is_anonymous, reporter_name, reporter_profile_id,
    original_language, original_text, summary_sv, ai_confidence, latitude, longitude
  ) values (
    p_id, v_organization_id, p_site_id, v_location_ids[1], v_location_ids,
    coalesce(v_location_names, v_site.name),
    nullif(left(trim(coalesce(p_location_note, '')), 300), ''),
    coalesce(nullif(trim(p_type), ''), 'other'),
    nullif(left(trim(coalesce(p_type_note, '')), 120), ''),
    coalesce(v_categories[1], 'unclassified'), v_categories, p_severity, 'open', trim(p_description), 'report',
    coalesce(p_is_anonymous, false),
    case when coalesce(p_is_anonymous, false) then null else coalesce(v_reporter.full_name, p_reporter_name) end,
    case when coalesce(p_is_anonymous, false) then null else v_reporter.id end,
    nullif(trim(coalesce(p_original_language, '')), ''),
    nullif(trim(coalesce(p_original_text, '')), ''),
    nullif(trim(coalesce(p_summary_sv, '')), ''),
    p_ai_confidence,
    p_latitude, p_longitude
  );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_path := v_attachment->>'storage_path';
    if v_path is null or position('incidents/' || p_id::text || '/' in v_path) <> 1 then
      raise exception 'attachment path does not belong to this incident';
    end if;
    insert into public.incident_attachments (incident_id, storage_path, kind, mime_type)
    values (p_id, v_path, v_attachment->>'kind', v_attachment->>'mime_type');
  end loop;

  return query
    select i.id, i.reference, i.created_at, i.tracking_code from public.incidents i where i.id = p_id;
end;
$$;

revoke all on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text) from public;
grant execute on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text) to anon, authenticated;

-- People of a company, for the reporter picker when no site was chosen.
create or replace function public.list_org_people(p_organization_id uuid)
returns table (id uuid, full_name text, role text, employee_no text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role, p.employee_no
  from public.profiles p
  where p.active and p.organization_id = p_organization_id and p.role <> 'super_admin'
  order by p.full_name;
$$;

revoke all on function public.list_org_people(uuid) from public;
grant execute on function public.list_org_people(uuid) to anon, authenticated;

-- Workers of other companies must not appear on a site's picker either.
create or replace function public.list_site_people(p_site_id uuid)
returns table (id uuid, full_name text, role text, employee_no text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role, p.employee_no
  from public.profiles p
  join public.sites s on s.id = p_site_id
  where p.active
    and p.role <> 'super_admin'
    and p.organization_id = s.organization_id
    and (p.site_id = p_site_id or p.site_id is null)
  order by p.full_name;
$$;

-- ---------------------------------------------------------------------------
-- Notifications: every report reaches the company's managers; never another company
-- ---------------------------------------------------------------------------

create or replace function public.incident_recipients(p_incident_id uuid)
returns table (profile_id uuid, full_name text, email text, role text, reason text)
language sql
security definer
set search_path = public
as $$
  with inc as (
    select i.* from public.incidents i where i.id = p_incident_id
  ),
  reporter as (
    select p.* from public.profiles p join inc on p.id = inc.reporter_profile_id
  )
  select f.id, f.full_name, f.email, f.role, 'foreman' as reason
  from reporter r join public.profiles f on f.id = r.reports_to
  join inc on true
  where f.active and f.email is not null and f.organization_id = inc.organization_id
  union
  select p.id, p.full_name, p.email, p.role, 'site_officer'
  from public.profiles p, inc
  where p.active and p.email is not null and p.role = 'safety_officer'
    and p.organization_id = inc.organization_id
    and (inc.site_id is null or p.site_id = inc.site_id or p.site_id is null)
  union
  select p.id, p.full_name, p.email, p.role, 'escalation'
  from public.profiles p, inc
  where p.active and p.email is not null and p.role in ('hse_manager', 'admin')
    and p.organization_id = inc.organization_id;
$$;

create or replace function public.incident_for_notification(p_incident_id uuid)
returns table (
  id uuid, reference text, type text, category text, severity text, description text,
  summary_sv text, site_name text, location_name text, created_at timestamptz,
  reporter_name text, is_anonymous boolean, tracking_code text
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.reference, i.type, i.category, i.severity, i.description, i.summary_sv,
    coalesce(s.name, o.name, '—'), coalesce(l.name, i.location, i.location_note, s.name, '—'), i.created_at,
    i.reporter_name, i.is_anonymous, i.tracking_code
  from public.incidents i
  left join public.sites s on s.id = i.site_id
  left join public.organizations o on o.id = i.organization_id
  left join public.site_locations l on l.id = i.location_id
  where i.id = p_incident_id;
$$;

create or replace function public.claim_incident_alert(p_id uuid)
returns table (
  id uuid,
  reference text,
  type text,
  category text,
  severity text,
  description text,
  site_name text,
  location_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.incidents i
    set alert_sent_at = now()
    where i.id = p_id
      and i.severity = 'critical'
      and i.alert_sent_at is null
    returning i.*
  )
  select
    c.id,
    c.reference,
    c.type,
    c.category,
    c.severity,
    c.description,
    coalesce(s.name, o.name, '—') as site_name,
    coalesce(l.name, c.location, c.location_note, s.name, '—') as location_name,
    c.created_at
  from claimed c
  left join public.sites s on s.id = c.site_id
  left join public.organizations o on o.id = c.organization_id
  left join public.site_locations l on l.id = c.location_id;
$$;

select 'owner: ' || coalesce((select email from public.profiles where role = 'super_admin' order by created_at limit 1), 'none — sign up in the app first, then run this file again') as result;


-- ===== supabase/migrations/20261022090000_review_queue_subcontractors_action_owner.sql =====
-- Reports wait for a manager to rate them, the reporter's own answers are kept,
-- subcontractors, a join-request queue, and the Action Owner role.

-- ---------------------------------------------------------------------------
-- Severity is set by a manager, not computed: new reports are "unrated"
-- ---------------------------------------------------------------------------

alter table public.incidents drop constraint if exists incidents_severity_check;
alter table public.incidents add constraint incidents_severity_check
  check (severity in ('unrated', 'low', 'medium', 'high', 'critical'));

-- What the reporter said, kept as facts (a manager sees them next to the rating).
alter table public.incidents add column if not exists hurt boolean;
alter table public.incidents add column if not exists danger_present boolean;
alter table public.incidents add column if not exists subcontractor text;

create index if not exists incidents_subcontractor_idx on public.incidents (subcontractor);

-- ---------------------------------------------------------------------------
-- Subcontractors per company (managed in Settings, picked on the report form)
-- ---------------------------------------------------------------------------

create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists subcontractors_org_name_idx on public.subcontractors (organization_id, lower(name));

alter table public.subcontractors enable row level security;
drop policy if exists "subcontractors readable" on public.subcontractors;
create policy "subcontractors readable" on public.subcontractors
  for select to anon, authenticated using (true);
drop policy if exists "subcontractors manager write" on public.subcontractors;
create policy "subcontractors manager write" on public.subcontractors
  for all to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()))
  with check (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));

-- ---------------------------------------------------------------------------
-- Roles: Action Owner
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('worker', 'foreman', 'action_owner', 'safety_officer', 'hse_manager', 'admin', 'super_admin'));

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (select p.id from public.current_profile() p);
$$;

-- Staff see and work on their company's reports; workers and action owners do not.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role in ('foreman', 'safety_officer', 'hse_manager', 'admin', 'super_admin') from public.current_profile() p),
    false
  );
$$;

-- True when the report has an action assigned to the signed-in person.
create or replace function public.is_assigned_to_me(p_incident_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.actions a
    where a.incident_id = p_incident_id
      and a.assignee_id = (select public.current_profile_id())::text
  );
$$;

revoke all on function public.current_profile_id() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_assigned_to_me(uuid) from public;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_assigned_to_me(uuid) to authenticated;

-- Reports: staff of the company, plus the person an action is assigned to.
drop policy if exists "incidents officer access" on public.incidents;
drop policy if exists "incidents read" on public.incidents;
create policy "incidents read" on public.incidents
  for select to authenticated
  using (public.tenant_visible(organization_id) and (public.is_staff() or public.is_assigned_to_me(id)));
drop policy if exists "incidents staff insert" on public.incidents;
create policy "incidents staff insert" on public.incidents
  for insert to authenticated
  with check (public.tenant_visible(organization_id) and public.is_staff());
drop policy if exists "incidents update" on public.incidents;
create policy "incidents update" on public.incidents
  for update to authenticated
  using (public.tenant_visible(organization_id) and (public.is_staff() or public.is_assigned_to_me(id)))
  with check (public.tenant_visible(organization_id) and (public.is_staff() or public.is_assigned_to_me(id)));
drop policy if exists "incidents staff delete" on public.incidents;
create policy "incidents staff delete" on public.incidents
  for delete to authenticated
  using (public.tenant_visible(organization_id) and public.is_staff());

-- Tasks: staff see the company's; everyone else only their own.
drop policy if exists "tasks officer access" on public.tasks;
drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks
  for select to authenticated
  using (public.tenant_visible(organization_id) and (public.is_staff() or assignee_id = public.current_profile_id()));
drop policy if exists "tasks staff insert" on public.tasks;
create policy "tasks staff insert" on public.tasks
  for insert to authenticated
  with check (public.tenant_visible(organization_id) and public.is_staff());
drop policy if exists "tasks update" on public.tasks;
create policy "tasks update" on public.tasks
  for update to authenticated
  using (public.tenant_visible(organization_id) and (public.is_staff() or assignee_id = public.current_profile_id()))
  with check (public.tenant_visible(organization_id) and (public.is_staff() or assignee_id = public.current_profile_id()));
drop policy if exists "tasks staff delete" on public.tasks;
create policy "tasks staff delete" on public.tasks
  for delete to authenticated
  using (public.tenant_visible(organization_id) and public.is_staff());

-- Managers may now also hand out the Action Owner role.
drop policy if exists "profiles manager insert" on public.profiles;
create policy "profiles manager insert" on public.profiles
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'action_owner', 'safety_officer'))
  );
drop policy if exists "profiles manager update" on public.profiles;
create policy "profiles manager update" on public.profiles
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'action_owner', 'safety_officer'))
  )
  with check (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'action_owner', 'safety_officer'))
  );
drop policy if exists "profiles manager delete" on public.profiles;
create policy "profiles manager delete" on public.profiles
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id() and role in ('worker', 'foreman', 'action_owner', 'safety_officer'))
  );

-- ---------------------------------------------------------------------------
-- Pending users: a reporter leaves an e-mail to become a permanent user
-- ---------------------------------------------------------------------------

create table if not exists public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  full_name text,
  email text not null,
  status text not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'membership_requests_status_check') then
    alter table public.membership_requests add constraint membership_requests_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create unique index if not exists membership_requests_pending_idx
  on public.membership_requests (organization_id, lower(email)) where status = 'pending';

alter table public.membership_requests enable row level security;
drop policy if exists "membership requests manager read" on public.membership_requests;
create policy "membership requests manager read" on public.membership_requests
  for select to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));
drop policy if exists "membership requests manager update" on public.membership_requests;
create policy "membership requests manager update" on public.membership_requests
  for update to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()))
  with check (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));

-- Public entry point: only this function can add a row; it validates everything.
create or replace function public.request_membership(
  p_organization_id uuid,
  p_email text,
  p_name text default null,
  p_site_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_site_id uuid := p_site_id;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 200 then
    raise exception 'invalid e-mail';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.active) then
    raise exception 'unknown company';
  end if;
  if v_site_id is not null and not exists (
    select 1 from public.sites s where s.id = v_site_id and s.organization_id = p_organization_id
  ) then
    v_site_id := null;
  end if;
  if exists (
    select 1 from public.profiles p
    where lower(p.email) = v_email and p.organization_id = p_organization_id and p.active
  ) then
    return 'already_member';
  end if;
  if (select count(*) from public.membership_requests r where r.organization_id = p_organization_id and r.status = 'pending') >= 200 then
    raise exception 'too many pending requests';
  end if;
  insert into public.membership_requests (organization_id, site_id, full_name, email)
  values (p_organization_id, v_site_id, nullif(left(trim(coalesce(p_name, '')), 120), ''), v_email)
  on conflict do nothing;
  return 'requested';
end;
$$;

revoke all on function public.request_membership(uuid, text, text, uuid) from public;
grant execute on function public.request_membership(uuid, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_incident: keeps what the reporter answered, subcontractor, unrated
-- ---------------------------------------------------------------------------

drop function if exists public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text);

create or replace function public.submit_incident(
  p_id uuid,
  p_site_id uuid,
  p_location_id uuid,
  p_type text,
  p_category text,
  p_severity text,
  p_description text,
  p_is_anonymous boolean,
  p_reporter_name text,
  p_attachments jsonb default '[]'::jsonb,
  p_original_language text default null,
  p_original_text text default null,
  p_summary_sv text default null,
  p_ai_confidence real default null,
  p_reporter_profile_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_ids uuid[] default '{}',
  p_categories text[] default '{}',
  p_organization_id uuid default null,
  p_location_note text default null,
  p_type_note text default null,
  p_hurt boolean default null,
  p_danger_present boolean default null,
  p_subcontractor text default null
)
returns table (id uuid, reference text, created_at timestamptz, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sites%rowtype;
  v_organization_id uuid;
  v_location_names text;
  v_reporter public.profiles%rowtype;
  v_attachment jsonb;
  v_path text;
  v_location_ids uuid[];
  v_categories text[];
  v_severity text;
begin
  if p_id is null then
    raise exception 'incident id is required';
  end if;
  if length(trim(coalesce(p_description, ''))) < 8 then
    raise exception 'description is too short';
  end if;

  if p_site_id is not null then
    select * into v_site from public.sites s where s.id = p_site_id;
    if not found then
      raise exception 'unknown site';
    end if;
    if p_organization_id is not null and v_site.organization_id is distinct from p_organization_id then
      raise exception 'site does not belong to this company';
    end if;
    v_organization_id := v_site.organization_id;
  elsif p_organization_id is not null then
    if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
      raise exception 'unknown company';
    end if;
    v_organization_id := p_organization_id;
  end if;

  v_location_ids := coalesce(p_location_ids, '{}');
  if cardinality(v_location_ids) = 0 and p_location_id is not null then
    v_location_ids := array[p_location_id];
  end if;
  if cardinality(v_location_ids) > 0 then
    if p_site_id is null then
      raise exception 'areas need a site';
    end if;
    if exists (
      select 1 from unnest(v_location_ids) as wanted(id)
      where not exists (select 1 from public.site_locations l where l.id = wanted.id and l.site_id = p_site_id)
    ) then
      raise exception 'unknown location for site';
    end if;
    select string_agg(l.name, ', ' order by l.sort_order) into v_location_names
    from public.site_locations l where l.id = any (v_location_ids);
  end if;

  select coalesce(array_agg(distinct left(trim(c), 80)) filter (where trim(c) <> '' and c <> 'unclassified'), '{}')
    into v_categories
  from unnest(coalesce(p_categories, '{}') || case when p_category is null then '{}'::text[] else array[p_category] end) as c;

  -- Only a manager rates a report; the form sends "unrated" (or "low" for praise).
  v_severity := case when p_severity in ('unrated', 'low', 'medium', 'high', 'critical') then p_severity else 'unrated' end;

  if p_reporter_profile_id is not null and not coalesce(p_is_anonymous, false) then
    select * into v_reporter from public.profiles p where p.id = p_reporter_profile_id and p.active;
    if not found then
      raise exception 'unknown reporter';
    end if;
  end if;

  insert into public.incidents (
    id, organization_id, site_id, location_id, location_ids, location, location_note, type, type_note,
    category, categories, severity, status, description, source, is_anonymous, reporter_name, reporter_profile_id,
    original_language, original_text, summary_sv, ai_confidence, latitude, longitude,
    hurt, danger_present, subcontractor
  ) values (
    p_id, v_organization_id, p_site_id, v_location_ids[1], v_location_ids,
    coalesce(v_location_names, v_site.name),
    nullif(left(trim(coalesce(p_location_note, '')), 300), ''),
    coalesce(nullif(trim(p_type), ''), 'other'),
    nullif(left(trim(coalesce(p_type_note, '')), 120), ''),
    coalesce(v_categories[1], 'unclassified'), v_categories, v_severity, 'open', trim(p_description), 'report',
    coalesce(p_is_anonymous, false),
    case when coalesce(p_is_anonymous, false) then null else coalesce(v_reporter.full_name, p_reporter_name) end,
    case when coalesce(p_is_anonymous, false) then null else v_reporter.id end,
    nullif(trim(coalesce(p_original_language, '')), ''),
    nullif(trim(coalesce(p_original_text, '')), ''),
    nullif(trim(coalesce(p_summary_sv, '')), ''),
    p_ai_confidence,
    p_latitude, p_longitude,
    p_hurt, p_danger_present,
    nullif(left(trim(coalesce(p_subcontractor, '')), 120), '')
  );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_path := v_attachment->>'storage_path';
    if v_path is null or position('incidents/' || p_id::text || '/' in v_path) <> 1 then
      raise exception 'attachment path does not belong to this incident';
    end if;
    insert into public.incident_attachments (incident_id, storage_path, kind, mime_type)
    values (p_id, v_path, v_attachment->>'kind', v_attachment->>'mime_type');
  end loop;

  return query
    select i.id, i.reference, i.created_at, i.tracking_code from public.incidents i where i.id = p_id;
end;
$$;

revoke all on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text, boolean, boolean, text) from public;
grant execute on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text, boolean, boolean, text) to anon, authenticated;

-- The notification e-mail also says whether someone was hurt.
drop function if exists public.incident_for_notification(uuid);

create or replace function public.incident_for_notification(p_incident_id uuid)
returns table (
  id uuid, reference text, type text, category text, severity text, description text,
  summary_sv text, site_name text, location_name text, created_at timestamptz,
  reporter_name text, is_anonymous boolean, tracking_code text,
  hurt boolean, danger_present boolean
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.reference, i.type, i.category, i.severity, i.description, i.summary_sv,
    coalesce(s.name, o.name, '—'), coalesce(l.name, i.location, i.location_note, s.name, '—'), i.created_at,
    i.reporter_name, i.is_anonymous, i.tracking_code,
    i.hurt, i.danger_present
  from public.incidents i
  left join public.sites s on s.id = i.site_id
  left join public.organizations o on o.id = i.organization_id
  left join public.site_locations l on l.id = i.location_id
  where i.id = p_incident_id;
$$;

revoke all on function public.incident_for_notification(uuid) from public;
grant execute on function public.incident_for_notification(uuid) to anon, authenticated;

select 'review queue + subcontractors + action owner ready' as result;


-- ===== supabase/seed.sql =====
-- Demo organisations, sites and locations (same data as the offline mock).
insert into public.organizations (id, name, organization_number, address) values
  ('11111111-1111-4111-8111-111111111111', 'Volvo Personvagnar AB', '556074-3089', 'Torslandavägen, 405 31 Göteborg'),
  ('22222222-2222-4222-8222-222222222222', 'Nordic Siteworks AB', '559123-4418', 'Kvillebäcksvägen, 417 05 Göteborg'),
  ('33333333-3333-4333-8333-333333333333', 'Sydkomponent AB', '556887-2201', 'Kalkbrottsgatan 12, 212 25 Malmö')
on conflict (id) do nothing;

insert into public.sites (id, organization_id, name, city, address) values
  ('aaaaaaaa-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Volvo Torslanda Plant', 'Gothenburg', 'Torslandavägen, 405 31 Göteborg'),
  ('aaaaaaaa-0002-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Kvillebäcken Construction Site', 'Gothenburg', 'Kvillebäcksvägen, 417 05 Göteborg'),
  ('aaaaaaaa-0003-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'Malmö Component Works', 'Malmö', 'Kalkbrottsgatan 12, 212 25 Malmö')
on conflict (id) do nothing;

insert into public.site_locations (id, site_id, name, sort_order) values
  ('bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'Factory Line B', 0),
  ('bbbbbbbb-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Paint Shop', 1),
  ('bbbbbbbb-0001-4000-8000-000000000003', 'aaaaaaaa-0001-4000-8000-000000000001', 'Loading Bay A', 2),
  ('bbbbbbbb-0001-4000-8000-000000000004', 'aaaaaaaa-0001-4000-8000-000000000001', 'Press Hall', 3),
  ('bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'Zone 3 Scaffolding', 0),
  ('bbbbbbbb-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Roof Level 4', 1),
  ('bbbbbbbb-0002-4000-8000-000000000003', 'aaaaaaaa-0002-4000-8000-000000000002', 'Ground Works', 2),
  ('bbbbbbbb-0002-4000-8000-000000000004', 'aaaaaaaa-0002-4000-8000-000000000002', 'Site Cabin / Welfare', 3),
  ('bbbbbbbb-0003-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000003', 'Assembly Cell 2', 0),
  ('bbbbbbbb-0003-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000003', 'Chemical Store', 1),
  ('bbbbbbbb-0003-4000-8000-000000000003', 'aaaaaaaa-0003-4000-8000-000000000003', 'Electrical Substation', 2),
  ('bbbbbbbb-0003-4000-8000-000000000004', 'aaaaaaaa-0003-4000-8000-000000000003', 'Packing Hall', 3)
on conflict (id) do nothing;

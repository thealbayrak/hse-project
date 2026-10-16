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

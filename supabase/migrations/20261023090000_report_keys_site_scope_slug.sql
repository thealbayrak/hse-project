-- Revocable report keys (the QR code), spam limits, out-of-area flag,
-- per-person site scope for staff, and a company address (slug) for sub-domains.

-- ---------------------------------------------------------------------------
-- Company address (sub-domain): volvo.<root-domain>
-- ---------------------------------------------------------------------------

alter table public.organizations add column if not exists slug text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_slug_check') then
    alter table public.organizations add constraint organizations_slug_check
      check (
        slug is null
        or (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' and slug not in ('www', 'app', 'api', 'admin', 'mail', 'login', 'staging', 'dev', 'test'))
      );
  end if;
end $$;

create unique index if not exists organizations_slug_idx on public.organizations (lower(slug)) where slug is not null;

-- Existing companies get an address made from their name.
do $$
declare
  r record;
  base text;
begin
  for r in select id, name from public.organizations where slug is null loop
    base := trim(both '-' from regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9]+', '-', 'g'));
    base := left(base, 38);
    if base is null or base = '' then
      base := 'company-' || substr(r.id::text, 1, 6);
    end if;
    begin
      update public.organizations set slug = base where id = r.id;
    exception when others then
      update public.organizations set slug = left(base, 32) || '-' || substr(r.id::text, 1, 4) where id = r.id;
    end;
  end loop;
end $$;

-- Only the owner (or the SQL editor) changes a company address: it is a shared namespace.
create or replace function public.guard_organization_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug and auth.uid() is not null and not public.is_super_admin() then
    raise exception 'only the owner can change the company address';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_slug on public.organizations;
create trigger organizations_guard_slug before update on public.organizations
  for each row execute function public.guard_organization_slug();

-- ---------------------------------------------------------------------------
-- Report keys: what a QR code carries. A manager can replace it, so a leaked
-- or photographed code stops working at once.
-- ---------------------------------------------------------------------------

create table if not exists public.report_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete cascade,
  key text not null unique default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists report_keys_site_active_idx on public.report_keys (site_id) where active and site_id is not null;
create unique index if not exists report_keys_org_active_idx on public.report_keys (organization_id) where active and site_id is null;

alter table public.report_keys enable row level security;
drop policy if exists "report keys manager read" on public.report_keys;
create policy "report keys manager read" on public.report_keys
  for select to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));

-- New companies and places get a key automatically.
create or replace function public.create_report_key_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.report_keys (organization_id) values (new.id);
  return new;
end;
$$;

create or replace function public.create_report_key_for_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.report_keys (organization_id, site_id) values (new.organization_id, new.id);
  return new;
end;
$$;

drop trigger if exists organizations_report_key on public.organizations;
create trigger organizations_report_key after insert on public.organizations
  for each row execute function public.create_report_key_for_organization();

drop trigger if exists sites_report_key on public.sites;
create trigger sites_report_key after insert on public.sites
  for each row when (new.organization_id is not null) execute function public.create_report_key_for_site();

insert into public.report_keys (organization_id)
select o.id from public.organizations o
where not exists (select 1 from public.report_keys k where k.organization_id = o.id and k.site_id is null and k.active);

insert into public.report_keys (organization_id, site_id)
select s.organization_id, s.id from public.sites s
where s.organization_id is not null
  and not exists (select 1 from public.report_keys k where k.site_id = s.id and k.active);

-- Public: what does this QR code point to? Returns nothing for an unknown or replaced key.
create or replace function public.report_target(p_key text)
returns table (organization_id uuid, site_id uuid, organization_name text, site_name text, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select k.organization_id, k.site_id, o.name, s.name, o.slug
  from public.report_keys k
  join public.organizations o on o.id = k.organization_id and o.active
  left join public.sites s on s.id = k.site_id
  where k.key = p_key and k.active and (k.site_id is null or s.active)
  limit 1;
$$;

revoke all on function public.report_target(text) from public;
grant execute on function public.report_target(text) to anon, authenticated;

-- A manager replaces the code of their company or one of its places; the old one stops working.
create or replace function public.rotate_report_key(p_site_id uuid default null, p_organization_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_key text;
begin
  if p_site_id is not null then
    select s.organization_id into v_org from public.sites s where s.id = p_site_id;
  else
    v_org := p_organization_id;
  end if;
  if v_org is null then
    raise exception 'unknown company or place';
  end if;
  if not (public.is_super_admin() or (public.is_org_manager() and v_org = public.current_organization_id())) then
    raise exception 'not allowed';
  end if;

  update public.report_keys
     set active = false, revoked_at = now()
   where active and organization_id = v_org and site_id is not distinct from p_site_id;

  insert into public.report_keys (organization_id, site_id) values (v_org, p_site_id) returning key into v_key;
  return v_key;
end;
$$;

revoke all on function public.rotate_report_key(uuid, uuid) from public;
grant execute on function public.rotate_report_key(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Report flags and spam limits
-- ---------------------------------------------------------------------------

alter table public.sites add column if not exists geofence_m integer not null default 1500;
alter table public.incidents add column if not exists ip_hash text;
alter table public.incidents add column if not exists device_hash text;
alter table public.incidents add column if not exists outside_area boolean;
alter table public.incidents add column if not exists distance_m integer;

create index if not exists incidents_ip_hash_idx on public.incidents (ip_hash, created_at) where ip_hash is not null;
create index if not exists incidents_device_hash_idx on public.incidents (device_hash, created_at) where device_hash is not null;

-- ---------------------------------------------------------------------------
-- Staff scope: which places a person sees (managers always see all of their company)
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists all_sites boolean not null default true;
alter table public.profiles add column if not exists site_ids uuid[] not null default '{}';

create or replace function public.can_see_site(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role in ('hse_manager', 'admin', 'super_admin')
        or p.all_sites
        or (p_site_id is not null and p_site_id = any (p.site_ids))
     from public.current_profile() p),
    true
  );
$$;

revoke all on function public.can_see_site(uuid) from public;
grant execute on function public.can_see_site(uuid) to authenticated;

drop policy if exists "incidents read" on public.incidents;
create policy "incidents read" on public.incidents
  for select to authenticated
  using (public.tenant_visible(organization_id) and ((public.is_staff() and public.can_see_site(site_id)) or public.is_assigned_to_me(id)));
drop policy if exists "incidents update" on public.incidents;
create policy "incidents update" on public.incidents
  for update to authenticated
  using (public.tenant_visible(organization_id) and ((public.is_staff() and public.can_see_site(site_id)) or public.is_assigned_to_me(id)))
  with check (public.tenant_visible(organization_id) and ((public.is_staff() and public.can_see_site(site_id)) or public.is_assigned_to_me(id)));
drop policy if exists "incidents staff delete" on public.incidents;
create policy "incidents staff delete" on public.incidents
  for delete to authenticated
  using (public.tenant_visible(organization_id) and public.is_staff() and public.can_see_site(site_id));

drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks
  for select to authenticated
  using (public.tenant_visible(organization_id) and ((public.is_staff() and public.can_see_site(site_id)) or assignee_id = public.current_profile_id()));
drop policy if exists "tasks update" on public.tasks;
create policy "tasks update" on public.tasks
  for update to authenticated
  using (public.tenant_visible(organization_id) and ((public.is_staff() and public.can_see_site(site_id)) or assignee_id = public.current_profile_id()))
  with check (public.tenant_visible(organization_id) and ((public.is_staff() and public.can_see_site(site_id)) or assignee_id = public.current_profile_id()));

-- ---------------------------------------------------------------------------
-- submit_incident: needs a valid key unless the caller is signed in to that company
-- ---------------------------------------------------------------------------

drop function if exists public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text, boolean, boolean, text);

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
  p_subcontractor text default null,
  p_report_key text default null,
  p_device text default null
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
  v_trusted boolean;
  v_headers json;
  v_ip text;
  v_ip_hash text;
  v_device_hash text;
  v_distance integer;
  v_outside boolean;
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

  -- Signed-in people of the company report without a code; everyone else needs the current QR key.
  v_trusted := coalesce(
    (select p.role = 'super_admin' or p.organization_id is not distinct from v_organization_id from public.current_profile() p),
    false
  ) and auth.uid() is not null;

  if not v_trusted then
    if p_report_key is null or v_organization_id is null or not exists (
      select 1 from public.report_keys k
      where k.key = p_report_key and k.active and k.organization_id = v_organization_id
        and (k.site_id is null or k.site_id = p_site_id)
    ) then
      raise exception 'this QR code is not valid any more';
    end if;

    begin
      v_headers := nullif(current_setting('request.headers', true), '')::json;
    exception when others then
      v_headers := null;
    end;
    v_ip := trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip', ''), ',', 1));
    v_ip_hash := case when v_ip <> '' then md5(v_ip) end;
    v_device_hash := case when length(trim(coalesce(p_device, ''))) >= 8 then md5(left(trim(p_device), 100)) end;

    if v_device_hash is not null and (
      select count(*) from public.incidents i where i.device_hash = v_device_hash and i.created_at > now() - interval '1 hour'
    ) >= 10 then
      raise exception 'too many reports from this device, please try again later';
    end if;
    if v_ip_hash is not null and (
      select count(*) from public.incidents i where i.ip_hash = v_ip_hash and i.created_at > now() - interval '1 hour'
    ) >= 40 then
      raise exception 'too many reports from this network, please try again later';
    end if;
    if (
      select count(*) from public.incidents i
      where i.organization_id = v_organization_id and i.source = 'report' and i.is_anonymous
        and i.created_at > now() - interval '1 hour'
    ) >= 150 then
      raise exception 'too many reports right now, please try again later';
    end if;
  end if;

  -- Where was the reporter? Only a flag: a report from outside the place is still kept, but a manager sees it.
  if p_site_id is not null and v_site.latitude is not null and v_site.longitude is not null
     and p_latitude is not null and p_longitude is not null then
    v_distance := round(
      2 * 6371000 * asin(least(1, sqrt(
        power(sin(radians(p_latitude - v_site.latitude) / 2), 2)
        + cos(radians(v_site.latitude)) * cos(radians(p_latitude)) * power(sin(radians(p_longitude - v_site.longitude) / 2), 2)
      )))
    )::integer;
    v_outside := v_distance > coalesce(v_site.geofence_m, 1500);
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
    hurt, danger_present, subcontractor, ip_hash, device_hash, outside_area, distance_m
  ) values (
    p_id, v_organization_id, p_site_id, v_location_ids[1], v_location_ids,
    coalesce(v_location_names, v_site.name),
    nullif(left(trim(coalesce(p_location_note, '')), 300), ''),
    coalesce(nullif(trim(p_type), ''), 'other'),
    nullif(left(trim(coalesce(p_type_note, '')), 120), ''),
    coalesce(v_categories[1], 'unclassified'), v_categories, v_severity, 'open', trim(p_description), 'report',
    coalesce(p_is_anonymous, false),
    case when coalesce(p_is_anonymous, false) then null else coalesce(v_reporter.full_name, nullif(left(trim(coalesce(p_reporter_name, '')), 120), '')) end,
    case when coalesce(p_is_anonymous, false) then null else v_reporter.id end,
    nullif(trim(coalesce(p_original_language, '')), ''),
    nullif(trim(coalesce(p_original_text, '')), ''),
    nullif(trim(coalesce(p_summary_sv, '')), ''),
    p_ai_confidence,
    p_latitude, p_longitude,
    p_hurt, p_danger_present,
    nullif(left(trim(coalesce(p_subcontractor, '')), 120), ''),
    v_ip_hash, v_device_hash, v_outside, v_distance
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

revoke all on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text, boolean, boolean, text, text, text) from public;
grant execute on function public.submit_incident(uuid, uuid, uuid, text, text, text, text, boolean, text, jsonb, text, text, text, real, uuid, double precision, double precision, uuid[], text[], uuid, text, text, boolean, boolean, text, text, text) to anon, authenticated;

select 'report keys + site scope + company address ready' as result;

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

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

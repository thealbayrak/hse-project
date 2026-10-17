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

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

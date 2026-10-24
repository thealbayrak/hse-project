-- Multi-role workflow: Area Responsible, Action Owner, Investigator, Follow-up Responsible.
-- Who is on a report lives in `assignments`; every change goes through a checked function.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('worker', 'foreman', 'area_responsible', 'action_owner', 'investigator', 'follow_up', 'safety_officer', 'hse_manager', 'admin', 'super_admin'));

drop policy if exists "profiles manager insert" on public.profiles;
create policy "profiles manager insert" on public.profiles
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id()
        and role in ('worker', 'foreman', 'area_responsible', 'action_owner', 'investigator', 'follow_up', 'safety_officer'))
  );
drop policy if exists "profiles manager update" on public.profiles;
create policy "profiles manager update" on public.profiles
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id()
        and role in ('worker', 'foreman', 'area_responsible', 'action_owner', 'investigator', 'follow_up', 'safety_officer'))
  )
  with check (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id()
        and role in ('worker', 'foreman', 'area_responsible', 'action_owner', 'investigator', 'follow_up', 'safety_officer'))
  );
drop policy if exists "profiles manager delete" on public.profiles;
create policy "profiles manager delete" on public.profiles
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.is_org_manager() and organization_id = public.current_organization_id()
        and role in ('worker', 'foreman', 'area_responsible', 'action_owner', 'investigator', 'follow_up', 'safety_officer'))
  );

-- ---------------------------------------------------------------------------
-- Who is responsible for which area (staff only: names are not public)
-- ---------------------------------------------------------------------------

create table if not exists public.area_responsibles (
  location_id uuid primary key references public.site_locations (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists area_responsibles_profile_idx on public.area_responsibles (profile_id);

alter table public.area_responsibles enable row level security;
drop policy if exists "area responsibles read" on public.area_responsibles;
create policy "area responsibles read" on public.area_responsibles
  for select to authenticated
  using (public.tenant_visible(organization_id));
drop policy if exists "area responsibles manager write" on public.area_responsibles;
create policy "area responsibles manager write" on public.area_responsibles
  for all to authenticated
  using (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()))
  with check (public.is_super_admin() or (public.is_org_manager() and organization_id = public.current_organization_id()));

-- ---------------------------------------------------------------------------
-- Assignments: one row per report
-- ---------------------------------------------------------------------------

create table if not exists public.assignments (
  incident_id uuid primary key references public.incidents (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  area_responsible_id uuid references public.profiles (id) on delete set null,
  area_responsible_name text,
  action_owner_id uuid references public.profiles (id) on delete set null,
  action_owner_name text,
  investigator_id uuid references public.profiles (id) on delete set null,
  investigator_name text,
  follow_up_id uuid references public.profiles (id) on delete set null,
  follow_up_name text,
  investigation_required boolean not null default false,
  investigation_due_date date,
  investigation_status text not null default 'open',
  root_cause text,
  investigation_notes text,
  investigation_completed_at timestamptz,
  follow_up_status text,
  follow_up_note text,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  -- Once a manager has set the people, an area responsible can no longer change them.
  manager_locked boolean not null default false,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_investigation_status_check') then
    alter table public.assignments add constraint assignments_investigation_status_check
      check (investigation_status in ('open', 'in-progress', 'done'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assignments_follow_up_status_check') then
    alter table public.assignments add constraint assignments_follow_up_status_check
      check (follow_up_status is null or follow_up_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists assignments_action_owner_idx on public.assignments (action_owner_id);
create index if not exists assignments_investigator_idx on public.assignments (investigator_id);
create index if not exists assignments_follow_up_idx on public.assignments (follow_up_id);

alter table public.assignments enable row level security;
-- Whoever can see the report can see who is on it. Nobody writes directly: only the functions below do.
drop policy if exists "assignments read" on public.assignments;
create policy "assignments read" on public.assignments
  for select to authenticated
  using (exists (select 1 from public.incidents i where i.id = incident_id));

-- Photos that prove an action was done
do $$
begin
  alter table public.incident_attachments drop constraint if exists incident_attachments_kind_check;
  alter table public.incident_attachments add constraint incident_attachments_kind_check
    check (kind in ('photo', 'voice', 'proof'));
end $$;

-- ---------------------------------------------------------------------------
-- Who may see a report because of their part in it
-- ---------------------------------------------------------------------------

create or replace function public.is_area_responsible_for(p_incident_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.incidents i
    join public.area_responsibles r
      on r.location_id = any (
        coalesce(i.location_ids, '{}'::uuid[]) || case when i.location_id is null then '{}'::uuid[] else array[i.location_id] end
      )
    where i.id = p_incident_id
      and r.profile_id = (select public.current_profile_id())
  );
$$;

-- Action owner, investigator, follow-up person, or the responsible of one of the report's areas.
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
  )
  or exists (
    select 1 from public.assignments s
    where s.incident_id = p_incident_id
      and (select public.current_profile_id()) in (s.action_owner_id, s.investigator_id, s.follow_up_id)
  )
  or public.is_area_responsible_for(p_incident_id);
$$;

revoke all on function public.is_area_responsible_for(uuid) from public;
grant execute on function public.is_area_responsible_for(uuid) to authenticated;
revoke all on function public.is_assigned_to_me(uuid) from public;
grant execute on function public.is_assigned_to_me(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The action owner on `actions` and the one on `assignments` stay the same person
-- ---------------------------------------------------------------------------

create or replace function public.sync_assignment_from_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_org uuid;
  v_just_done boolean;
begin
  if new.incident_id is null then
    return new;
  end if;
  v_owner := case
    when new.assignee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then new.assignee_id::uuid
  end;
  select i.organization_id into v_org from public.incidents i where i.id = new.incident_id;

  insert into public.assignments (incident_id, organization_id, action_owner_id, action_owner_name)
  values (new.incident_id, v_org, v_owner, nullif(new.assignee_name, ''))
  on conflict (incident_id) do update
    set action_owner_id = excluded.action_owner_id,
        action_owner_name = excluded.action_owner_name,
        updated_at = now();

  -- The owner says it is done: the follow-up person is asked to check it.
  if new.status = 'resolved' then
    -- OLD does not exist on INSERT, so it is only looked at for updates.
    if tg_op = 'INSERT' then
      v_just_done := true;
    else
      v_just_done := old.status is distinct from 'resolved';
    end if;
    if v_just_done then
      update public.assignments
         set follow_up_status = 'pending', verified_by = null, verified_at = null
       where incident_id = new.incident_id and follow_up_id is not null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists actions_sync_assignment on public.actions;
create trigger actions_sync_assignment after insert or update on public.actions
  for each row execute function public.sync_assignment_from_action();

-- Reports that already have an owner get their assignment row.
insert into public.assignments (incident_id, organization_id, action_owner_id, action_owner_name)
select distinct on (a.incident_id)
  a.incident_id, i.organization_id,
  case when a.assignee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then a.assignee_id::uuid end,
  nullif(a.assignee_name, '')
from public.actions a
join public.incidents i on i.id = a.incident_id
where a.incident_id is not null
order by a.incident_id, a.updated_at desc nulls last
on conflict (incident_id) do nothing;

-- ---------------------------------------------------------------------------
-- Assign people to a report (area responsible or manager)
-- ---------------------------------------------------------------------------

create or replace function public.assign_incident(
  p_incident_id uuid,
  p_action_owner_id uuid default null,
  p_investigator_id uuid default null,
  p_follow_up_id uuid default null,
  p_investigation_required boolean default false,
  p_investigation_due_date date default null,
  p_action_due_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inc public.incidents%rowtype;
  v_me public.profiles%rowtype;
  v_manager boolean;
  v_locked boolean;
  v_area_id uuid;
  v_area_name text;
  v_owner_name text;
  v_investigator_name text;
  v_follow_name text;
  v_person uuid;
  v_action_id uuid;
begin
  select * into v_inc from public.incidents i where i.id = p_incident_id;
  if not found then
    raise exception 'unknown report';
  end if;
  select * into v_me from public.current_profile();
  if v_me.id is null then
    raise exception 'sign in first';
  end if;

  v_manager := public.is_super_admin()
    or (public.is_org_manager() and v_me.organization_id is not distinct from v_inc.organization_id);
  if not (
    v_manager
    or (v_me.organization_id is not distinct from v_inc.organization_id
        and (public.is_staff() or public.is_area_responsible_for(p_incident_id)))
  ) then
    raise exception 'not allowed';
  end if;

  select s.manager_locked into v_locked from public.assignments s where s.incident_id = p_incident_id;
  if coalesce(v_locked, false) and not v_manager then
    raise exception 'a manager has set these assignments';
  end if;

  foreach v_person in array array_remove(array[p_action_owner_id, p_investigator_id, p_follow_up_id], null) loop
    if not exists (
      select 1 from public.profiles p
      where p.id = v_person and p.active and p.role not in ('worker', 'super_admin')
        and p.organization_id is not distinct from v_inc.organization_id
    ) then
      raise exception 'person is not in this company';
    end if;
  end loop;

  select p.full_name into v_owner_name from public.profiles p where p.id = p_action_owner_id;
  select p.full_name into v_investigator_name from public.profiles p where p.id = p_investigator_id;
  select p.full_name into v_follow_name from public.profiles p where p.id = p_follow_up_id;

  select r.profile_id, p.full_name into v_area_id, v_area_name
  from public.area_responsibles r
  join public.profiles p on p.id = r.profile_id
  where r.location_id = any (
    coalesce(v_inc.location_ids, '{}'::uuid[]) || case when v_inc.location_id is null then '{}'::uuid[] else array[v_inc.location_id] end
  )
  limit 1;

  insert into public.assignments (
    incident_id, organization_id, area_responsible_id, area_responsible_name,
    investigator_id, investigator_name, follow_up_id, follow_up_name,
    investigation_required, investigation_due_date, manager_locked, assigned_by
  ) values (
    p_incident_id, v_inc.organization_id, v_area_id, v_area_name,
    p_investigator_id, v_investigator_name, p_follow_up_id, v_follow_name,
    coalesce(p_investigation_required, false), p_investigation_due_date, v_manager, v_me.id
  )
  on conflict (incident_id) do update
    set area_responsible_id = excluded.area_responsible_id,
        area_responsible_name = excluded.area_responsible_name,
        investigator_id = excluded.investigator_id,
        investigator_name = excluded.investigator_name,
        follow_up_id = excluded.follow_up_id,
        follow_up_name = excluded.follow_up_name,
        investigation_required = excluded.investigation_required,
        investigation_due_date = excluded.investigation_due_date,
        manager_locked = public.assignments.manager_locked or v_manager,
        assigned_by = excluded.assigned_by,
        updated_at = now();

  -- The action owner lives on the action (status, due date, notes); a trigger copies the person back.
  select a.id into v_action_id
  from public.actions a where a.incident_id = p_incident_id
  order by a.updated_at desc nulls last limit 1;

  if v_action_id is not null then
    update public.actions
       set assignee_id = p_action_owner_id::text,
           assignee_name = v_owner_name,
           due_date = coalesce(p_action_due_date, due_date),
           updated_at = now()
     where id = v_action_id;
  elsif p_action_owner_id is not null then
    insert into public.actions (incident_id, assignee_id, assignee_name, due_date, status)
    values (p_incident_id, p_action_owner_id::text, v_owner_name, p_action_due_date, 'open');
  end if;

  if p_action_owner_id is not null and v_inc.status = 'open' then
    update public.incidents set status = 'in-progress' where id = p_incident_id;
  end if;
end;
$$;

revoke all on function public.assign_incident(uuid, uuid, uuid, uuid, boolean, date, date) from public;
grant execute on function public.assign_incident(uuid, uuid, uuid, uuid, boolean, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The investigator's report (root cause)
-- ---------------------------------------------------------------------------

create or replace function public.save_investigation(
  p_incident_id uuid,
  p_status text,
  p_root_cause text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inc public.incidents%rowtype;
  v_me public.profiles%rowtype;
  v_row public.assignments%rowtype;
begin
  if p_status not in ('open', 'in-progress', 'done') then
    raise exception 'unknown investigation status';
  end if;
  select * into v_inc from public.incidents i where i.id = p_incident_id;
  if not found then
    raise exception 'unknown report';
  end if;
  select * into v_me from public.current_profile();
  select * into v_row from public.assignments s where s.incident_id = p_incident_id;
  if v_me.id is null or v_row.incident_id is null then
    raise exception 'not allowed';
  end if;
  if not (
    v_row.investigator_id = v_me.id
    or public.is_super_admin()
    or ((public.is_org_manager() or public.is_staff()) and v_me.organization_id is not distinct from v_inc.organization_id)
  ) then
    raise exception 'not allowed';
  end if;

  update public.assignments
     set investigation_status = p_status,
         root_cause = nullif(left(trim(coalesce(p_root_cause, '')), 4000), ''),
         investigation_notes = nullif(left(trim(coalesce(p_notes, '')), 4000), ''),
         investigation_completed_at = case when p_status = 'done' then now() end,
         updated_at = now()
   where incident_id = p_incident_id;
end;
$$;

revoke all on function public.save_investigation(uuid, text, text, text) from public;
grant execute on function public.save_investigation(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The follow-up person's verdict on a finished action
-- ---------------------------------------------------------------------------

create or replace function public.verify_followup(
  p_incident_id uuid,
  p_approved boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inc public.incidents%rowtype;
  v_me public.profiles%rowtype;
  v_row public.assignments%rowtype;
begin
  select * into v_inc from public.incidents i where i.id = p_incident_id;
  if not found then
    raise exception 'unknown report';
  end if;
  select * into v_me from public.current_profile();
  select * into v_row from public.assignments s where s.incident_id = p_incident_id;
  if v_me.id is null or v_row.incident_id is null then
    raise exception 'not allowed';
  end if;
  if not (
    v_row.follow_up_id = v_me.id
    or public.is_super_admin()
    or (public.is_org_manager() and v_me.organization_id is not distinct from v_inc.organization_id)
  ) then
    raise exception 'not allowed';
  end if;
  if not coalesce(p_approved, false) and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'say what is missing when you send it back';
  end if;

  update public.assignments
     set follow_up_status = case when p_approved then 'approved' else 'rejected' end,
         follow_up_note = nullif(left(trim(coalesce(p_note, '')), 2000), ''),
         verified_by = v_me.id,
         verified_at = now(),
         updated_at = now()
   where incident_id = p_incident_id;

  -- Sent back: the owner has to do it again.
  if not p_approved then
    update public.incidents set status = 'in-progress' where id = p_incident_id;
    update public.actions set status = 'in-progress', updated_at = now()
     where id = (select a.id from public.actions a where a.incident_id = p_incident_id order by a.updated_at desc nulls last limit 1);
  end if;
end;
$$;

revoke all on function public.verify_followup(uuid, boolean, text) from public;
grant execute on function public.verify_followup(uuid, boolean, text) to authenticated;

select 'roles + assignments + areas ready' as result;

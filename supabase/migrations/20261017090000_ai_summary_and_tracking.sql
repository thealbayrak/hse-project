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

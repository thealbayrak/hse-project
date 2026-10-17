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

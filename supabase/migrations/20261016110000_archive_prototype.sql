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

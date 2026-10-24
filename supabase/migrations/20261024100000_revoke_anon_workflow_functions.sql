-- Supabase grants new functions to the anon role by default; these only make sense for signed-in people.
revoke execute on function public.assign_incident(uuid, uuid, uuid, uuid, boolean, date, date) from anon;
revoke execute on function public.save_investigation(uuid, text, text, text) from anon;
revoke execute on function public.verify_followup(uuid, boolean, text) from anon;
revoke execute on function public.rotate_report_key(uuid, uuid) from anon;
revoke execute on function public.is_area_responsible_for(uuid) from anon;
revoke execute on function public.is_assigned_to_me(uuid) from anon;

select 'workflow functions closed to anonymous callers' as result;

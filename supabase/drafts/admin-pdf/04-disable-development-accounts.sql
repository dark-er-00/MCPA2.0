-- UNEXECUTED REVIEW DRAFT — Production hardening: disable development/test account creation.
-- Revokes service_role execution on mcpa_development_account_step and replaces its body
-- so no test accounts can be created in production while preserving existing profile foreign keys.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.mcpa_development_account_step(p_actor uuid, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Development test account creation is disabled in production.' using errcode = '42501';
end $$;

revoke all on function public.mcpa_development_account_step(uuid, text, jsonb) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

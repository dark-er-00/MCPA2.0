-- DRAFT ONLY. Disable new writes, retaining all people, history and uploaded files.
-- Review preflight first; run only for installed components after separate approval.
-- FIRST disable MCPA_ENABLE_REGISTRATION_INVITATIONS in server configuration.
-- This is a write-disable rollback, not a schema/data rollback. Preserve every
-- historical identity, removal marker and restrictive Storage policy.
begin;
create or replace function public.mcpa_admin_lifecycle_capabilities() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;begin actor:=mcpa_auth_private.identity();if actor.role<>'admin' then raise exception 'Active Admin required.' using errcode='42501';end if;return jsonb_build_object('version',1,'removal',false,'invitations',false);end $$;
revoke execute on function public.mcpa_request_account_removal(uuid,text,uuid),public.mcpa_decide_account_removal(uuid,boolean),public.mcpa_set_my_profile_picture(text) from authenticated;
-- Retain removed-account read projection and reactivation guard. Never restore access implicitly.
-- Retain private photo read policies/pointers; disable additional uploads only.
drop policy if exists mcpa_profile_photo_insert on storage.objects;
create or replace function public.mcpa_my_profile_picture() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;begin actor:=mcpa_auth_private.identity();return jsonb_build_object('version',0,'object_name',(select object_name from public.mcpa_profile_pictures where profile_id=actor.id));end $$;
-- If invitation draft 03 was installed, remove its API privileges without
-- deleting pending/held jobs or reactivating anyone.
do $$ declare p record;begin
 for p in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'mcpa_registration_%' or proname='mcpa_activate_registration') loop
  execute format('revoke execute on function %s from service_role,authenticated,anon,public',p.signature);
 end loop;
end $$;
-- Own-profile edits may be disabled separately with REVOKE on
-- mcpa_update_my_profile(text,text). Restore exact captured function definitions
-- and ACLs only after reviewing dependencies; do not replay historical SQL.
notify pgrst,'reload schema';
commit;

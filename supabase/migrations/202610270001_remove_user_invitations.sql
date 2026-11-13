-- Retire Invite User without deleting people, Auth identities or audit history.
-- Apply after the installed account-management and development-account migrations.
-- Independent of the optional profile/whole-unit proposals. Run this file only;
-- do not replay historical migrations. Deploy the updated manage-accounts function
-- and frontend with it. Existing pending jobs remain historical records.
begin;
-- Serialize with account creation/access changes during this short migration.
select pg_advisory_xact_lock(672341,2027);
drop function if exists public.mcpa_invitation_step(uuid,text,jsonb);
-- Covers installations that applied the superseded revocation proposal.
drop function if exists mcpa_auth_private.mcpa_invitation_step(uuid,text,jsonb);

-- Keep legacy email information readable by Admin; expose no invitation actions.
create or replace function public.mcpa_accounts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
 actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Admin access required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'role',p.role,'account_status',p.account_status,'auth_user_id',p.auth_user_id,
   'email',coalesce(u.email,i.email),'email_confirmed_at',u.email_confirmed_at,
   'development_account',d.id is not null
 ) order by p.name,p.id) from public.profiles p left join auth.users u on u.id=p.auth_user_id
 left join public.mcpa_account_invitations i on i.profile_id=p.id
 left join public.mcpa_development_accounts d on d.profile_id=p.id),'[]'::jsonb);
end $$;
revoke all on function public.mcpa_accounts() from public,anon;
grant execute on function public.mcpa_accounts() to authenticated;

-- Prepared historical jobs no longer prevent verified recovery or access editing.
create or replace function public.mcpa_save_account(p_id uuid,p_name text,p_role text,p_status text,p_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; prior public.profiles; result uuid;
begin
 actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Admin access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(672341,2027);
 if p_id is not null then
   select * into prior from public.profiles where id=p_id for update;
   if not found then raise exception 'Profile no longer exists.' using errcode='22023';end if;
 end if;
 if p_role is null or p_status is null or p_role not in ('admin','engineer','architect','secretary','tool_handler')
   or p_status not in ('active','inactive') or nullif(btrim(p_name),'') is null or length(p_name)>120 then
   raise exception 'Check the account details.' using errcode='22023';end if;
 if p_role='admin' and prior.role is distinct from 'admin' then
   raise exception 'Creating administrators requires a separately authorized process.' using errcode='42501';end if;
 if p_id=actor.id and (p_role<>'admin' or p_status<>'active' or p_auth_user_id is distinct from actor.auth_user_id) then
   raise exception 'You cannot remove your own administrator access.' using errcode='42501';end if;
 if prior.auth_user_id is not null and p_auth_user_id is distinct from prior.auth_user_id then
   raise exception 'An existing account link cannot be reassigned or removed here.' using errcode='22023';end if;
 if p_status='active' and p_auth_user_id is null then raise exception 'Link a Supabase Auth account before activation.' using errcode='22023';end if;
 if p_auth_user_id is not null and not exists(select 1 from auth.users where id=p_auth_user_id) then
   raise exception 'Create the verified Auth account first.' using errcode='22023';end if;
 if p_id is null then
   if exists(select 1 from public.profiles where lower(btrim(name))=lower(btrim(p_name))) then
     raise exception 'A person with this name exists. Select the correct existing profile before recovery linking.' using errcode='22023';end if;
   result:=gen_random_uuid();
   insert into public.profiles(id,name,role,account_status,auth_user_id) values(result,btrim(p_name),p_role,p_status,p_auth_user_id);
 else
   update public.profiles set name=btrim(p_name),role=p_role,account_status=p_status,auth_user_id=p_auth_user_id,
     updated_at=clock_timestamp() where id=p_id returning id into result;
 end if;
 if prior.id is null then insert into public.mcpa_account_audit(actor_id,profile_id,event) values(actor.id,result,'person_created');end if;
 if p_auth_user_id is distinct from prior.auth_user_id then
   insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,result,'account_linked',jsonb_build_object('auth_user_id',p_auth_user_id));end if;
 if p_role is distinct from prior.role then
   insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,result,'role_changed',jsonb_build_object('from',prior.role,'to',p_role));end if;
 if p_status is distinct from prior.account_status then
   insert into public.mcpa_account_audit(actor_id,profile_id,event) values(actor.id,result,case when p_status='active' then 'account_reactivated' else 'account_deactivated' end);end if;
 if prior.id is not null and prior.name is distinct from btrim(p_name) then
   insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,result,'person_renamed',jsonb_build_object('from',prior.name,'to',btrim(p_name)));end if;
 return result;
end $$;


revoke all on function public.mcpa_save_account(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.mcpa_save_account(uuid,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

select jsonb_build_object(
 'invitation_rpc_removed',to_regprocedure('public.mcpa_invitation_step(uuid,text,jsonb)') is null,
 'private_invitation_rpc_removed',to_regprocedure('mcpa_auth_private.mcpa_invitation_step(uuid,text,jsonb)') is null,
 'account_reader_authenticated',has_function_privilege('authenticated','public.mcpa_accounts()','EXECUTE'),
 'account_editor_authenticated',has_function_privilege('authenticated','public.mcpa_save_account(uuid,text,text,text,uuid)','EXECUTE'),
 'anonymous_editor_blocked',not has_function_privilege('anon','public.mcpa_save_account(uuid,text,text,text,uuid)','EXECUTE'),
 'legacy_records_protected',(select relrowsecurity from pg_class where oid='public.mcpa_account_invitations'::regclass)
) as invite_user_removal_verification;

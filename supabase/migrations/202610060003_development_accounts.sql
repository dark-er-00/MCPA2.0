-- Development account jobs contain no passwords. Apply after account-management
-- and recipient-identity migrations. This file creates no Auth users or profiles.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.mcpa_development_accounts (
  id uuid primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('engineer','architect')),
  profile_id uuid unique references public.profiles(id) on delete restrict,
  state text not null default 'prepared' check (state in ('prepared','created')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  check ((state='prepared' and profile_id is null) or (state='created' and profile_id is not null))
);
alter table public.mcpa_development_accounts enable row level security;
revoke all on public.mcpa_development_accounts from public,anon,authenticated;

-- Trusted Edge Function only. p_actor is obtained with Auth.getUser(token), never
-- from submitted form fields. Recheck authorization on every operation.
create or replace function public.mcpa_development_account_step(p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; job public.mcpa_development_accounts; auth_record auth.users;
  v_email text; full_name text; account_role text; token uuid; target uuid;
begin
 perform pg_advisory_xact_lock(672341,2027);
 select * into actor from public.profiles where auth_user_id=p_actor and role='admin' and account_status='active' for share;
 if actor.id is null then raise exception 'Active Admin access required.' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload ? 'password' then
   raise exception 'Invalid development account operation.' using errcode='22023';end if;
 if p_action='list' then
   return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'role',role) order by created_at)
     from public.mcpa_development_accounts where state='prepared'),'[]'::jsonb);
 end if;
 if p_action='prepare' then
   v_email:=lower(btrim(p_payload->>'email')); full_name:=btrim(p_payload->>'name'); account_role:=p_payload->>'role';
   if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(full_name,'') is null or length(full_name)>120 or account_role is null
     or account_role not in ('engineer','architect') or nullif(p_payload->>'id','') is null then
     raise exception 'Enter a valid name, email and Engineer or Architect role.' using errcode='22023';end if;
   select * into job from public.mcpa_development_accounts where id=(p_payload->>'id')::uuid;
   if job.id is null then select * into job from public.mcpa_development_accounts where email=v_email;end if;
   if job.id is not null then
     if job.email<>v_email or job.name<>full_name or job.role<>account_role then
       raise exception 'This test account was already prepared with different details. Retry its original details.' using errcode='22023';end if;
     return to_jsonb(job);
   end if;
   if exists(select 1 from auth.users where lower(email)=v_email)
     or exists(select 1 from public.mcpa_account_invitations where email=v_email) then
     raise exception 'This email already belongs to an account or invitation. Use a new test email.' using errcode='22023';end if;
   if exists(select 1 from public.profiles where lower(btrim(name))=lower(full_name)) then
     raise exception 'A company person with this name exists. Use a distinct test name; existing people cannot be converted to test accounts.' using errcode='22023';end if;
   insert into public.mcpa_development_accounts(id,email,name,role,created_by)
     values((p_payload->>'id')::uuid,v_email,full_name,account_role,actor.id) returning * into job;
   return to_jsonb(job);
 end if;
 select * into job from public.mcpa_development_accounts where id=(p_payload->>'id')::uuid for update;
 if job.id is null then raise exception 'Test account request no longer exists.' using errcode='22023';end if;
 if job.state='created' then
   return jsonb_build_object('id',job.id,'profile_id',job.profile_id,'state',job.state);
 end if;
 if p_action='release' then
   if job.lease_id is distinct from (p_payload->>'lease_id')::uuid then
     raise exception 'Test account attempt changed. Refresh and retry.' using errcode='40001';end if;
   update public.mcpa_development_accounts set lease_id=null,lease_until=null where id=job.id;
   return jsonb_build_object('id',job.id);
 end if;
 select * into auth_record from auth.users where lower(email)=job.email;
 -- app_metadata is controlled by Auth Admin, unlike user-editable user_metadata.
 if auth_record.id is not null and (
   auth_record.raw_app_meta_data->>'mcpa_development_job_id' is distinct from job.id::text
   or auth_record.raw_app_meta_data->>'mcpa_development_account' is distinct from 'true'
   or auth_record.email_confirmed_at is null) then
   raise exception 'An unrelated Auth account owns this email. No account was changed.' using errcode='22023';end if;
 if exists(select 1 from public.profiles where auth_user_id=auth_record.id)
   or exists(select 1 from public.profiles where lower(btrim(name))=lower(job.name))
   or exists(select 1 from public.mcpa_account_invitations where email=job.email) then
   raise exception 'This person or email now belongs to another account or invitation. Review before retrying.' using errcode='22023';end if;
 if p_action='claim' then
   if job.lease_until>clock_timestamp() then raise exception 'Test account creation is already running. Wait two minutes, then retry.' using errcode='40001';end if;
   token:=gen_random_uuid();
   update public.mcpa_development_accounts set lease_id=token,lease_until=clock_timestamp()+interval '2 minutes' where id=job.id;
   return to_jsonb(job)||jsonb_build_object('lease_id',token,'auth_user_id',auth_record.id);
 elsif p_action='finish' then
   if job.lease_id is null or job.lease_id is distinct from (p_payload->>'lease_id')::uuid or job.lease_until<=clock_timestamp() then
     raise exception 'Test account attempt expired or changed. Retry the same request.' using errcode='40001';end if;
   if auth_record.id is null or auth_record.id is distinct from (p_payload->>'auth_user_id')::uuid then
     raise exception 'The test Auth account could not be verified.' using errcode='22023';end if;
   target:=gen_random_uuid();
   insert into public.profiles(id,name,role,account_status,auth_user_id) values(target,job.name,job.role,'active',auth_record.id);
   insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values
     (actor.id,target,'development_account_created',jsonb_build_object('auth_user_id',auth_record.id,'email',job.email,'role',job.role,'job_id',job.id));
   update public.mcpa_development_accounts set state='created',profile_id=target,completed_at=clock_timestamp(),lease_id=null,lease_until=null where id=job.id;
   return jsonb_build_object('id',job.id,'profile_id',target,'state','created');
 end if;
 raise exception 'Unsupported development account action.' using errcode='22023';
end $$;
revoke all on function public.mcpa_development_account_step(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcpa_development_account_step(uuid,text,jsonb) to service_role;

-- Preserve the invitation fields and mark test accounts for the Admin list.
create or replace function public.mcpa_accounts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
 actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Admin access required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'role',p.role,'account_status',p.account_status,'auth_user_id',p.auth_user_id,
   'email',coalesce(u.email,i.email),'invitation_id',i.id,
   'invitation_pending',coalesce(u.invited_at is not null and u.email_confirmed_at is null,false),
   'invitation_prepared',coalesce(i.state='prepared',false),
   'invited_at',u.invited_at,'email_confirmed_at',u.email_confirmed_at,
   'development_account',d.id is not null
 ) order by p.name,p.id) from public.profiles p left join auth.users u on u.id=p.auth_user_id
 left join public.mcpa_account_invitations i on i.profile_id=p.id
 left join public.mcpa_development_accounts d on d.profile_id=p.id),'[]'::jsonb);
end $$;
revoke all on function public.mcpa_accounts() from public,anon;
grant execute on function public.mcpa_accounts() to authenticated;
notify pgrst,'reload schema';
commit;

select jsonb_build_object(
 'rls_enabled',(select relrowsecurity from pg_class where oid='public.mcpa_development_accounts'::regclass),
 'browser_access',(select jsonb_agg(jsonb_build_object('role',r,
   'any_table_access',has_table_privilege(r,'public.mcpa_development_accounts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
   'any_column_access',has_any_column_privilege(r,'public.mcpa_development_accounts','SELECT,INSERT,UPDATE,REFERENCES'),
   'development_rpc_execute',has_function_privilege(r,'public.mcpa_development_account_step(uuid,text,jsonb)','EXECUTE')))
   from (values('anon'::text),('authenticated'::text)) roles(r)),
 'service_role_execute',has_function_privilege('service_role','public.mcpa_development_account_step(uuid,text,jsonb)','EXECUTE'),
 'invitation_rpc_service_only',has_function_privilege('service_role','public.mcpa_invitation_step(uuid,text,jsonb)','EXECUTE')
   and not has_function_privilege('anon','public.mcpa_invitation_step(uuid,text,jsonb)','EXECUTE')
   and not has_function_privilege('authenticated','public.mcpa_invitation_step(uuid,text,jsonb)','EXECUTE'),
 'existing_accounts',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'account_status',account_status,'auth_user_id',auth_user_id) order by name)
   from public.profiles where id in ('b28645de-d763-4cd8-91a3-68c31b7d03a5','9c31f387-788d-4ff5-9a87-96d13a394fe3'))
) as development_account_verification;

-- Apply after 202610040001_authenticated_access.sql. No profile IDs are rewritten.
begin;
-- Live preflight found a legacy Auth-backed primary identity. Refuse to install
-- the new-person workflow until its separately reviewed migration is complete.
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.conrelid='public.profiles'::regclass and c.contype='f'
      and c.confrelid='auth.users'::regclass and a.attname='id'
  ) then
    raise exception 'Stop: profiles.id still references auth.users. Complete the separately reviewed identity migration before account management.';
  end if;
end $$;
create table if not exists public.mcpa_account_invitations (
  id uuid primary key,
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  email text not null unique,
  name text not null,
  role text not null check (role in ('engineer','architect','secretary','tool_handler')),
  state text not null default 'prepared' check (state in ('prepared','sent')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  lease_until timestamptz,
  lease_id uuid,
  attempts integer not null default 0
);
create table if not exists public.mcpa_account_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.mcpa_account_invitations enable row level security;
alter table public.mcpa_account_audit enable row level security;
revoke all on public.mcpa_account_invitations,public.mcpa_account_audit from public,anon,authenticated;
grant select on public.mcpa_account_audit to authenticated;
drop policy if exists mcpa_account_audit_read on public.mcpa_account_audit;
create policy mcpa_account_audit_read on public.mcpa_account_audit for select to authenticated
  using(public.mcpa_has_role(array['admin']));

-- Email and invitation state come from Auth, not editable profile metadata.
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
   'invited_at',u.invited_at,'email_confirmed_at',u.email_confirmed_at
 ) order by p.name,p.id) from public.profiles p left join auth.users u on u.id=p.auth_user_id
 left join public.mcpa_account_invitations i on i.profile_id=p.id),'[]'::jsonb);
end $$;

-- Retained for Advanced / Recovery. Also used by the normal role/status editor.
-- Existing links cannot be reassigned: that would transfer historical accountability.
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
 if exists(select 1 from public.mcpa_account_invitations where profile_id=p_id and state='prepared') then
   raise exception 'Finish the prepared invitation before editing this account.' using errcode='22023';end if;
 if p_status='active' and p_auth_user_id is null then raise exception 'Link a Supabase Auth account before activation.' using errcode='22023';end if;
 if p_auth_user_id is not null and not exists(select 1 from auth.users where id=p_auth_user_id) then
   raise exception 'Create or invite the Auth account first.' using errcode='22023';end if;
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

-- Only the trusted function can call this RPC. It passes the user UUID returned
-- by Auth.getUser(token); the database rechecks the active linked Admin each time.
create or replace function public.mcpa_invitation_step(p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; person public.profiles; job public.mcpa_account_invitations;
  target uuid; v_email text; full_name text; account_role text; account_id uuid; auth_record auth.users; token uuid;
begin
 perform pg_advisory_xact_lock(672341,2027);
 select * into actor from public.profiles where auth_user_id=p_actor and role='admin' and account_status='active';
 if actor.id is null then raise exception 'Active Admin access required.' using errcode='42501';end if;
 if p_action='prepare' then
   v_email:=lower(btrim(p_payload->>'email')); full_name:=btrim(p_payload->>'name'); account_role:=p_payload->>'role';
   if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(full_name,'') is null or length(full_name)>120 or account_role is null
     or account_role not in ('engineer','architect','secretary','tool_handler') or nullif(p_payload->>'id','') is null then
     raise exception 'Enter a valid name, email, invitation ID and supported role.' using errcode='22023';end if;
   select * into job from public.mcpa_account_invitations where id=(p_payload->>'id')::uuid or mcpa_account_invitations.email=v_email;
   if job.id is not null then
     if job.email<>v_email or job.name<>full_name or job.role<>account_role
       or (nullif(p_payload->>'profile_id','') is not null and job.profile_id<>(p_payload->>'profile_id')::uuid) then
       raise exception 'This invitation already exists with different details. Open its existing person record.' using errcode='22023';end if;
     return to_jsonb(job);
   end if;
   if exists(select 1 from auth.users u where lower(u.email)=v_email) then
     raise exception 'This email already has an Auth account. Use Advanced / Recovery Account Linking for the correct person.' using errcode='22023';end if;
   target:=nullif(p_payload->>'profile_id','')::uuid;
   if target is not null then
     select * into person from public.profiles where id=target for update;
     if person.id is null or person.auth_user_id is not null or person.role='admin' then
       raise exception 'Select an existing unlinked, non-Admin company profile.' using errcode='22023';end if;
     if person.name<>full_name then raise exception 'Use the existing person name when inviting their account.' using errcode='22023';end if;
   else
     -- Never silently interpret matching display names as the same identity.
     if exists(select 1 from public.profiles where lower(btrim(name))=lower(full_name))
       and coalesce(p_payload->>'distinct_person','false')<>'true' then
       raise exception 'A person with this name exists. Select that profile, or explicitly confirm this is a different person.' using errcode='22023';end if;
     target:=gen_random_uuid();
     insert into public.profiles(id,name,role,account_status) values(target,full_name,account_role,'inactive');
     insert into public.mcpa_account_audit(actor_id,profile_id,event) values(actor.id,target,'person_created');
   end if;
   insert into public.mcpa_account_invitations(id,profile_id,email,name,role,created_by)
     values((p_payload->>'id')::uuid,target,v_email,full_name,account_role,actor.id) returning * into job;
   return to_jsonb(job);
 end if;
 select * into job from public.mcpa_account_invitations where id=(p_payload->>'id')::uuid for update;
 if job.id is null then raise exception 'Invitation no longer exists.' using errcode='22023';end if;
 select * into person from public.profiles where id=job.profile_id for update;
 if p_action='claim' then
   if job.lease_until>clock_timestamp() then raise exception 'Invitation is already being sent. Wait two minutes, then refresh.' using errcode='40001';end if;
   if job.sent_at>clock_timestamp()-interval '60 seconds' then raise exception 'Wait one minute before resending the invitation.' using errcode='40001';end if;
   if job.state='sent' and person.account_status<>'active' then raise exception 'Reactivate this account before resending.' using errcode='22023';end if;
   select * into auth_record from auth.users u where lower(u.email)=job.email;
   if auth_record.id is not null and (auth_record.raw_user_meta_data->>'mcpa_invitation_id' is distinct from job.id::text)
     and auth_record.id is distinct from person.auth_user_id then
     raise exception 'An Auth account already owns this email. Review its identity in Advanced / Recovery.' using errcode='22023';end if;
   if exists(select 1 from public.profiles where auth_user_id=auth_record.id and id<>person.id) then
     raise exception 'This Auth account is linked to another person.' using errcode='22023';end if;
   if job.state='sent' and auth_record.email_confirmed_at is not null then
     raise exception 'Invitation already accepted. Use Forgot password for password recovery.' using errcode='22023';end if;
   if person.auth_user_id is not null and person.auth_user_id is distinct from auth_record.id then
     raise exception 'The account link changed. Review it before continuing.' using errcode='22023';end if;
   token:=gen_random_uuid();
   update public.mcpa_account_invitations set lease_id=token,lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1 where id=job.id;
   return to_jsonb(job)||jsonb_build_object('lease_id',token,'auth_user_id',auth_record.id,'confirmed',auth_record.email_confirmed_at is not null);
 elsif p_action in ('finish','release') then
   if job.lease_id is null or job.lease_id is distinct from (p_payload->>'lease_id')::uuid then raise exception 'Invitation attempt changed. Refresh and retry.' using errcode='40001';end if;
   if p_action='release' then
     update public.mcpa_account_invitations set lease_id=null,lease_until=null where id=job.id;
     return jsonb_build_object('id',job.id);
   end if;
   account_id:=(p_payload->>'auth_user_id')::uuid;
   select * into auth_record from auth.users where id=account_id;
   if auth_record.id is null or lower(auth_record.email)<>job.email or auth_record.invited_at is null then
     raise exception 'Invitation account could not be verified.' using errcode='22023';end if;
   if person.auth_user_id is not null and person.auth_user_id<>account_id then
     raise exception 'The account link changed. Review it before continuing.' using errcode='22023';end if;
   if job.state='prepared' then
     update public.profiles set auth_user_id=account_id,role=job.role,account_status='active',updated_at=clock_timestamp() where id=person.id;
     insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,person.id,'account_linked',jsonb_build_object('auth_user_id',account_id));
     insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,person.id,'user_invited',jsonb_build_object('email',job.email,'role',job.role));
     if person.role is distinct from job.role then
       insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,person.id,'role_changed',jsonb_build_object('from',person.role,'to',job.role));end if;
     if person.account_status<>'active' then
       insert into public.mcpa_account_audit(actor_id,profile_id,event) values(actor.id,person.id,'account_reactivated');end if;
   else
     insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,person.id,'invitation_resent',jsonb_build_object('email',job.email));
   end if;
   update public.mcpa_account_invitations set state='sent',sent_at=clock_timestamp(),lease_id=null,lease_until=null where id=job.id;
   return jsonb_build_object('id',job.id,'profile_id',job.profile_id);
 end if;
 raise exception 'Unsupported invitation action.' using errcode='22023';
end $$;
revoke all on function public.mcpa_invitation_step(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcpa_invitation_step(uuid,text,jsonb) to service_role;
revoke all on function public.mcpa_accounts(),public.mcpa_save_account(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.mcpa_accounts(),public.mcpa_save_account(uuid,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

-- Return this result after applying the full file; no Auth users are created.
select jsonb_build_object(
  'tables',(
    select jsonb_agg(jsonb_build_object('table',c.relname,'rls_enabled',c.relrowsecurity,
      'anon_any_access',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'),
      'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT')
        or has_any_column_privilege('authenticated',c.oid,'SELECT'),
      'authenticated_any_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE,REFERENCES')
    ) order by c.relname) from pg_class c
    where c.oid in ('public.mcpa_account_invitations'::regclass,'public.mcpa_account_audit'::regclass)
  ),
  'rpc_permissions',(
    select jsonb_agg(jsonb_build_object('function',f.signature,
      'anon_execute',has_function_privilege('anon',f.signature,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',f.signature,'EXECUTE'),
      'service_role_execute',has_function_privilege('service_role',f.signature,'EXECUTE')
    ) order by f.signature) from (values
      ('public.mcpa_invitation_step(uuid,text,jsonb)'),
      ('public.mcpa_accounts()'),
      ('public.mcpa_save_account(uuid,text,text,text,uuid)')
    ) f(signature)
  ),
  'audit_read_policy',(
    select qual from pg_policies where schemaname='public' and tablename='mcpa_account_audit'
      and policyname='mcpa_account_audit_read'
  ),
  'existing_accounts',(
    select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,
      'account_status',account_status,'auth_user_id',auth_user_id,'same_uuid',id=auth_user_id) order by name)
    from public.profiles where id in ('b28645de-d763-4cd8-91a3-68c31b7d03a5','9c31f387-788d-4ff5-9a87-96d13a394fe3'))
) as account_management_verification;

-- DRAFT ONLY. Requires separate approval. Never invoked by app startup.
-- Apply once AFTER account management, invitation retirement and custody migrations.
begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(672341,2027);
create table public.mcpa_account_removal_requests (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null unique,
 profile_id uuid not null references public.profiles(id) on delete restrict,
 requested_by uuid not null references public.profiles(id) on delete restrict,
 requested_at timestamptz not null default now(), reason text not null check(length(btrim(reason)) between 1 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 decided_by uuid references public.profiles(id) on delete restrict, decided_at timestamptz,
 check((status='pending' and decided_by is null and decided_at is null) or (status<>'pending' and decided_by is not null and decided_at is not null and decided_by<>requested_by and decided_by<>profile_id))
);
create unique index mcpa_one_pending_removal on public.mcpa_account_removal_requests(profile_id) where status='pending';
alter table public.mcpa_account_removal_requests enable row level security;
revoke all on public.mcpa_account_removal_requests from public,anon,authenticated,service_role;
create function public.mcpa_admin_lifecycle_capabilities() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; begin actor:=mcpa_auth_private.identity();if actor.role<>'admin' then raise exception 'Active Admin required.' using errcode='42501';end if;return jsonb_build_object('version',1,'removal',true,'invitations',false);end $$;
create function public.mcpa_request_account_removal(p_profile_id uuid,p_reason text,p_operation_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; prior public.mcpa_account_removal_requests; target public.profiles; result uuid;
begin
 perform pg_advisory_xact_lock(672341,2027);actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Active Admin required.' using errcode='42501';end if;
 if p_operation_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then raise exception 'A reason and operation ID are required.' using errcode='22023';end if;
 select * into prior from public.mcpa_account_removal_requests where operation_id=p_operation_id;
 if found then if prior.requested_by<>actor.id or prior.profile_id<>p_profile_id or prior.reason<>btrim(p_reason) then raise exception 'Operation ID conflict.' using errcode='22023';end if;return prior.id;end if;
 select * into target from public.profiles where id=p_profile_id for update;
 if not found or target.id=actor.id then raise exception 'Choose another existing account.' using errcode='42501';end if;
 if exists(select 1 from public.mcpa_account_removal_requests where profile_id=target.id and status='approved') then raise exception 'This account is already removed.' using errcode='22023';end if;
 insert into public.mcpa_account_removal_requests(operation_id,profile_id,requested_by,reason) values(p_operation_id,target.id,actor.id,btrim(p_reason)) returning id into result;
 insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,target.id,'removal_requested',jsonb_build_object('request_id',result,'reason',btrim(p_reason)));return result;
end $$;
create function public.mcpa_decide_account_removal(p_id uuid,p_approve boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; request public.mcpa_account_removal_requests; target public.profiles;
begin
 perform pg_advisory_xact_lock(672341,2027);actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Active Admin required.' using errcode='42501';end if;
 select * into request from public.mcpa_account_removal_requests where id=p_id for update;
 if not found or p_approve is null then raise exception 'Choose a removal request.' using errcode='22023';end if;
 if request.requested_by=actor.id or request.profile_id=actor.id then raise exception 'A different authorized Admin must decide; self approval is prohibited.' using errcode='42501';end if;
 if request.status<>'pending' then if request.decided_by=actor.id and request.status=(case when p_approve then 'approved' else 'rejected' end) then return request.id;end if;raise exception 'A decision is already recorded.' using errcode='40001';end if;
 select * into target from public.profiles where id=request.profile_id for update;
 if p_approve then
  if target.role='admin' and target.account_status='active' and (select count(*) from public.profiles where role='admin' and account_status='active')<=1 then raise exception 'The last active Admin cannot be removed.' using errcode='42501';end if;
  if exists(select 1 from public.equipment where current_holder_id=target.id)
   or exists(select 1 from public.sites where assigned_engineer_id=target.id and is_active is true and archived_at is null)
   or exists(select 1 from public.mcpa_wa_equipment_requests where requester_id=target.id and status='pending')
   or exists(select 1 from public.mcpa_wa_material_requests where requester_id=target.id and status in ('pending','approved','partial'))
   or exists(select 1 from public.mcpa_movements m where coalesce(m.data->>'status','pending') not in ('received','inspected','completed','rejected','canceled','cancelled','withdrawn','accepted','returned','closed') and (m.actor_id=target.id or m.receiver_id=target.id or m.data->>'requesterId'=target.id::text or m.data->>'receiverId'=target.id::text or m.data->>'senderId'=target.id::text))
  then raise exception 'Resolve assigned equipment, active projects and open movements before removal.' using errcode='22023';end if;
  update public.profiles set account_status='inactive',updated_at=clock_timestamp() where id=target.id;
 end if;
 update public.mcpa_account_removal_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=actor.id,decided_at=clock_timestamp() where id=request.id;
 insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,target.id,case when p_approve then 'account_removed' else 'removal_rejected' end,jsonb_build_object('request_id',request.id,'requested_by',request.requested_by));return request.id;
end $$;
create function public.mcpa_account_removals() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; begin actor:=mcpa_auth_private.identity();if actor.role<>'admin' then raise exception 'Active Admin required.' using errcode='42501';end if;return coalesce((select jsonb_agg(to_jsonb(r) order by requested_at desc) from public.mcpa_account_removal_requests r),'[]');end $$;
-- A marker keeps existing active/inactive identity checks and historical foreign keys intact.
-- A trigger prevents older access editors from silently reactivating a removed person.
create function mcpa_auth_private.admin_pdf_removed_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.account_status<>'inactive' and exists(select 1 from public.mcpa_account_removal_requests where profile_id=new.id and status='approved') then raise exception 'Removed accounts require a separately approved restoration.' using errcode='42501';end if;return new;end $$;
create trigger mcpa_removed_account_guard before update on public.profiles for each row execute function mcpa_auth_private.admin_pdf_removed_guard();
-- Serialize new responsibilities with removal decisions, including pending requests
-- without movements. Historical/terminal rows are retained and remain editable by
-- their existing authorized maintenance paths.
create function mcpa_auth_private.admin_pdf_responsibility_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb:=to_jsonb(new); ids text[];
begin
 perform pg_advisory_xact_lock(672341,2027);
 if tg_table_name='equipment' then ids:=array[rowdata->>'current_holder_id'];
 elsif tg_table_name='sites' then
  if coalesce((rowdata->>'is_active')::boolean,false) and rowdata->>'archived_at' is null then ids:=array[rowdata->>'assigned_engineer_id'];end if;
 elsif tg_table_name='mcpa_movements' then
  if coalesce(rowdata->'data'->>'status','pending') not in ('received','inspected','completed','rejected','canceled','cancelled','withdrawn','accepted','returned','closed') then
   ids:=array[rowdata->>'actor_id',rowdata->>'receiver_id',rowdata->'data'->>'requesterId',rowdata->'data'->>'senderId',rowdata->'data'->>'receiverId'];end if;
 elsif rowdata->>'status' in ('pending','approved','partial') then ids:=array[rowdata->>'requester_id'];end if;
 if exists(select 1 from public.mcpa_account_removal_requests where status='approved' and profile_id::text=any(ids)) then raise exception 'Removed accounts cannot receive new responsibilities.' using errcode='42501';end if;
 return new;
end $$;
create trigger mcpa_removed_holder_guard before insert or update on public.equipment for each row execute function mcpa_auth_private.admin_pdf_responsibility_guard();
create trigger mcpa_removed_project_guard before insert or update on public.sites for each row execute function mcpa_auth_private.admin_pdf_responsibility_guard();
create trigger mcpa_removed_movement_guard before insert or update on public.mcpa_movements for each row execute function mcpa_auth_private.admin_pdf_responsibility_guard();
create trigger mcpa_removed_equipment_request_guard before insert or update on public.mcpa_wa_equipment_requests for each row execute function mcpa_auth_private.admin_pdf_responsibility_guard();
create trigger mcpa_removed_material_request_guard before insert or update on public.mcpa_wa_material_requests for each row execute function mcpa_auth_private.admin_pdf_responsibility_guard();
revoke all on function mcpa_auth_private.admin_pdf_responsibility_guard() from public,anon,authenticated,service_role;
-- Preserve the existing function OID, grants and dependent objects. Reject unknown bodies.
do $$ begin
 if (select md5(replace(prosrc,E'\r','')) from pg_proc where oid=to_regprocedure('public.mcpa_accounts()')) is distinct from 'bbbd9b42e0190a682e79e63c9ce4fe57' then raise exception 'Unreviewed mcpa_accounts implementation. Compare preflight before proceeding.';end if;
end $$;
create or replace function public.mcpa_accounts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
 actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Admin access required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'role',p.role,'account_status',case when exists(select 1 from public.mcpa_account_removal_requests r where r.profile_id=p.id and r.status='approved') then 'removed' else p.account_status end,'auth_user_id',p.auth_user_id,
   'email',coalesce(u.email,i.email),'email_confirmed_at',u.email_confirmed_at,
   'development_account',d.id is not null
 ) order by p.name,p.id) from public.profiles p left join auth.users u on u.id=p.auth_user_id
 left join public.mcpa_account_invitations i on i.profile_id=p.id
 left join public.mcpa_development_accounts d on d.profile_id=p.id),'[]'::jsonb);
end $$;
revoke all on function mcpa_auth_private.admin_pdf_removed_guard() from public,anon,authenticated,service_role;
revoke all on function public.mcpa_admin_lifecycle_capabilities(),public.mcpa_request_account_removal(uuid,text,uuid),public.mcpa_decide_account_removal(uuid,boolean),public.mcpa_account_removals(),public.mcpa_accounts() from public,anon,authenticated;
grant execute on function public.mcpa_admin_lifecycle_capabilities(),public.mcpa_request_account_removal(uuid,text,uuid),public.mcpa_decide_account_removal(uuid,boolean),public.mcpa_account_removals(),public.mcpa_accounts() to authenticated;
-- Recheck Admin authorization after waiting on the shared account lock.
do $$ begin
 if (select md5(replace(prosrc,E'\r','')) from pg_proc where oid=to_regprocedure('public.mcpa_save_account(uuid,text,text,text,uuid)')) is distinct from 'f6ac5bcc8097de15ce9fdcd3b1039bac' then raise exception 'Unreviewed mcpa_save_account implementation. Compare preflight before proceeding.';end if;
end $$;
create or replace function public.mcpa_save_account(p_id uuid,p_name text,p_role text,p_status text,p_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; prior public.profiles; result uuid;
begin
 actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Admin access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(672341,2027);
 actor:=mcpa_auth_private.identity();
 if actor.role<>'admin' then raise exception 'Active Admin required.' using errcode='42501';end if;
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
notify pgrst,'reload schema';
commit;

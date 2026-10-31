-- Apply AFTER the existing Sites, Movement and (if used) Consumables setup scripts.
-- Transactional, repeatable, no account seeds, no rewritten custody/history IDs.
-- Do not rerun legacy prototype setup scripts after this migration.
begin;
do $$
begin
  if to_regclass('auth.users') is null or to_regclass('public.profiles') is null
    or to_regclass('public.equipment') is null or to_regclass('public.mcpa_movements') is null then
    raise exception 'Preflight: Auth, profiles, equipment and movement setup must exist.';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id' and data_type='uuid')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='name') then
    raise exception 'Preflight: inspect profiles; expected existing UUID id and name.';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role' and data_type not in ('text','character varying')) then
    raise exception 'Preflight: existing profiles.role is not text. Review its enum/dependencies before adapting this migration.';
  end if;
end $$;

create schema if not exists mcpa_auth_private;
revoke all on schema mcpa_auth_private from public,anon,authenticated;
alter table public.profiles add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists account_status text not null default 'inactive';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
create unique index if not exists mcpa_profile_auth_user on public.profiles(auth_user_id) where auth_user_id is not null;
alter table public.sites add column if not exists assigned_engineer_id uuid references public.profiles(id) on delete restrict;
alter table public.sites add column if not exists archived_at timestamptz;
alter table public.sites add column if not exists is_active boolean not null default true;
-- Legacy unlinked profiles remain historical people, not login accounts.
do $$
begin
  if not exists(select 1 from pg_constraint where conname='mcpa_account_role' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint mcpa_account_role check(auth_user_id is null or role in ('admin','secretary','tool_handler','engineer','architect')) not valid;
    alter table public.profiles validate constraint mcpa_account_role;
  end if;
  if not exists(select 1 from pg_constraint where conname='mcpa_account_status' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint mcpa_account_status check(account_status in ('active','inactive'));
  end if;
end $$;

create or replace function mcpa_auth_private.identity()
returns public.profiles language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where auth_user_id=auth.uid();
  if p.id is null or p.account_status<>'active' or p.role is null or p.role not in ('admin','secretary','tool_handler','engineer','architect') then
    raise exception 'An active authorized account is required.' using errcode='42501';
  end if;
  return p;
end $$;
create or replace function public.mcpa_my_profile()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'name',name,'role',role,'account_status',account_status)
  from public.profiles where auth_user_id=auth.uid();
$$;
create or replace function public.mcpa_has_role(roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where auth_user_id=auth.uid() and account_status='active' and role=any(roles));
$$;
create or replace function mcpa_auth_private.can_view_tool(e public.equipment,p public.profiles)
returns boolean language sql stable security definer set search_path='' as $$
 select p.role in ('admin','tool_handler') or (p.role in ('engineer','architect') and (
   e.current_holder_id=p.id or exists(select 1 from public.sites s where s.id=e.site_id and s.assigned_engineer_id=p.id)
   or (e.current_holder_id is null and regexp_replace(lower(e.status::text),'[ _-]','','g') in ('available','inoffice'))
   or exists(select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id
     where a.equipment_id=e.id and m.receiver_id=p.id and m.data->>'status' in ('pending','approved','released'))));
$$;
create or replace function mcpa_auth_private.can_view_movement(m public.mcpa_movements,p public.profiles)
returns boolean language sql stable security definer set search_path='' as $$
 select p.role in ('admin','tool_handler') or (p.role in ('engineer','architect') and (
   m.actor_id=p.id or m.receiver_id=p.id
   or exists(select 1 from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id
     where a.movement_id=m.id and e.current_holder_id=p.id)
   or exists(select 1 from public.mcpa_movement_sites ms join public.sites s on s.id=ms.site_id
     where ms.movement_id=m.id and s.assigned_engineer_id=p.id)));
$$;

-- Preserve validated transaction code but remove every browser entry to it.
do $$
begin
 if to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)') is null then
   alter function public.mcpa_movement_action(text,jsonb,uuid) set schema mcpa_auth_private;
 end if;
end $$;
create or replace function public.mcpa_movement_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; payload jsonb; m public.mcpa_movements; allowed boolean; receiver public.profiles;
begin
 p:=mcpa_auth_private.identity();
 allowed:=case p.role
   when 'admin' then p_action in ('approveRequest','rejectRequest','releaseRequest','startRepair','completeRepair','recoverMissing')
   when 'tool_handler' then p_action='createTransfer'
   when 'engineer' then p_action in ('createRequest','createTransfer','receiveTransfer','createReturn','reportRepair','reportMissing')
   when 'architect' then p_action in ('createRequest','createTransfer','receiveTransfer','createReturn','reportRepair','reportMissing')
   else false end;
 if not coalesce(allowed,false) then raise exception 'This action is not permitted for your account.' using errcode='42501';end if;
 -- Bind retry payloads and audit entries to the authenticated person, never supplied actors.
 payload:=(p_payload-'actor')||jsonb_build_object('actor',jsonb_build_object('id',p.id,'name',p.name,
   'role',case when p.role in ('admin','tool_handler') then 'admin' else 'engineer' end));
 if p_action='createRequest' then
   payload:=payload||jsonb_build_object('receiver',p.name);
   if not exists(select 1 from public.sites where name=payload->>'destination' and assigned_engineer_id=p.id and is_active) then
     raise exception 'Request tools for a project assigned to your account.' using errcode='42501';end if;
 end if;
 if p_action in ('createRequest','createTransfer') then
   select * into receiver from public.profiles where name=coalesce(nullif(payload->>'receiver',''),p.name) and account_status='active' and auth_user_id is not null and role in ('engineer','architect');
   if receiver.id is null then raise exception 'Choose an active Engineer or Architect receiver.' using errcode='22023';end if;
 end if;
 if p_action='releaseRequest' then
   if not exists(select 1 from public.mcpa_movements req join public.profiles r on r.id=req.receiver_id
     where req.id=payload->>'id' and r.account_status='active' and r.auth_user_id is not null and r.role in ('engineer','architect')) then
     raise exception 'The receiver must have an active operational account.' using errcode='42501';end if;
 end if;
 if p_action='createTransfer' and p.role='tool_handler' and exists(
   select 1 from public.equipment where asset_id in (select jsonb_array_elements_text(payload->'toolIds')) and current_holder_id is not null) then
   raise exception 'The current holder must transfer tools already in custody.' using errcode='42501';end if;
 if p_action='receiveTransfer' then
   select * into m from public.mcpa_movements where id=payload->>'id';
   if m.receiver_id is distinct from p.id then raise exception 'Only the named receiver can confirm receipt.' using errcode='42501';end if;
   if jsonb_typeof(payload->'inspections') is distinct from 'array' or exists(
     select 1 from jsonb_array_elements(payload->'inspections') x where x->>'condition'<>'lost' and x->'tested' is distinct from 'true'::jsonb) then
     raise exception 'Test every received tool before confirming receipt.' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(payload->'inspections') x
     where x->>'condition'='damaged' and x->>'disposition' is distinct from 'accepted') then
     raise exception 'Explicitly accept custody with recorded damage, or contact Admin before confirming receipt.' using errcode='22023';end if;
 end if;
 return mcpa_auth_private.mcpa_movement_action(p_action,payload,p_operation_id);
end $$;

-- Operational snapshots explicitly project permitted fields; there is no full-table
-- equipment/profile SELECT grant for field personnel.
create or replace function public.mcpa_movement_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=mcpa_auth_private.identity();
 if p.role='secretary' then raise exception 'Equipment records are restricted.' using errcode='42501';end if;
 select jsonb_build_object(
 'tools',coalesce((select jsonb_agg(jsonb_build_object(
   'id',e.asset_id,'dbId',e.id,'name',e.name,'cat',e.category,'brand',e.brand,'qty',coalesce(e.quantity,0),
   'site',coalesce(s.name,'Unassigned'),'siteId',e.site_id,'holder',coalesce(h.name,''),'holderId',e.current_holder_id,
   'model',to_jsonb(e)->>'model','serial',to_jsonb(e)->>'serial_number','condition',to_jsonb(e)->>'condition',
   'image_url',to_jsonb(e)->>'image_url','photo_url',to_jsonb(e)->>'photo_url','color',to_jsonb(e)->>'color',
   'unit',to_jsonb(e)->>'unit','trackingType',to_jsonb(e)->>'tracking_type',
   'status',case when exists(select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id
     where a.equipment_id=e.id and m.kind='repair' and m.data->>'status'='underrepair') then 'underrepair'
     else case regexp_replace(lower(e.status::text),'[ _-]','','g') when 'forrepair' then 'repair' when 'inoffice' then 'available' else regexp_replace(lower(e.status::text),'[ _-]','','g') end end
 ) order by e.asset_id) from public.equipment e left join public.sites s on s.id=e.site_id left join public.profiles h on h.id=e.current_holder_id
 where mcpa_auth_private.can_view_tool(e,p)),'[]'::jsonb),
 'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'is_active',s.is_active,
   'assigned_engineer_id',case when p.role in ('admin','tool_handler') or s.assigned_engineer_id=p.id then s.assigned_engineer_id end)) from public.sites s),'[]'::jsonb),
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role)) from public.profiles
   where account_status='active' and auth_user_id is not null and role in ('engineer','architect')),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(data order by created_at desc) from public.mcpa_movements m where kind='request' and mcpa_auth_private.can_view_movement(m,p)),'[]'::jsonb),
 'transfers',coalesce((select jsonb_agg(data order by created_at desc) from public.mcpa_movements m where kind='transfer' and mcpa_auth_private.can_view_movement(m,p)),'[]'::jsonb),
 'returns',coalesce((select jsonb_agg(data order by created_at desc) from public.mcpa_movements m where kind='return' and mcpa_auth_private.can_view_movement(m,p)),'[]'::jsonb),
 'repairs',coalesce((select jsonb_agg(data order by created_at desc) from public.mcpa_movements m where kind='repair' and mcpa_auth_private.can_view_movement(m,p)),'[]'::jsonb),
 'missing',coalesce((select jsonb_agg(data order by created_at desc) from public.mcpa_movements m where kind='missing' and mcpa_auth_private.can_view_movement(m,p)),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(o.activity order by o.created_at desc) from public.mcpa_movement_operations o
   where exists(select 1 from public.mcpa_movements m where m.id=o.activity->>'entityId' and mcpa_auth_private.can_view_movement(m,p))),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- RLS plus revocation: old permissive prototype policies cannot OR around this.
do $$
declare t text; pol record; cols text;
begin
 foreach t in array array['profiles','equipment','sites','project_history','mcpa_movements','mcpa_movement_assets','mcpa_movement_sites','mcpa_movement_reservations','mcpa_movement_operations','consumables','consumable_requests','consumable_stock_movements'] loop
   if to_regclass('public.'||t) is null then continue;end if;
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   -- Table revocation alone leaves separately granted column privileges intact.
   select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
     where table_schema='public' and table_name=t;
   execute format('revoke all (%s) on public.%I from public,anon,authenticated',cols,t);
   for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
     execute format('drop policy %I on public.%I',pol.policyname,t);
   end loop;
 end loop;
end $$;
grant select on public.equipment,public.sites to authenticated;
create policy mcpa_equipment_read on public.equipment for select to authenticated using(public.mcpa_has_role(array['admin','tool_handler']));
create policy mcpa_equipment_insert on public.equipment for insert to authenticated with check(public.mcpa_has_role(array['admin','tool_handler']) and current_holder_id is null and site_id is null and status::text='AVAILABLE');
create policy mcpa_equipment_edit on public.equipment for update to authenticated using(public.mcpa_has_role(array['admin','tool_handler'])) with check(public.mcpa_has_role(array['admin','tool_handler']));
-- Direct editors can maintain descriptive metadata, never rewrite custody/status.
do $$
declare cols text;
begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns where table_schema='public' and table_name='equipment'
 and column_name in ('name','category','brand','model','serial_number','condition','tracking_type','quantity','unit','details','image_url','photo_url','color');
 execute 'grant update ('||cols||') on public.equipment to authenticated';
 grant insert on public.equipment to authenticated;
end $$;
create policy mcpa_sites_read on public.sites for select to authenticated using(public.mcpa_has_role(array['admin','tool_handler']));
grant insert,update on public.sites to authenticated;
create policy mcpa_sites_insert on public.sites for insert to authenticated with check(public.mcpa_has_role(array['admin']));
create policy mcpa_sites_update on public.sites for update to authenticated using(public.mcpa_has_role(array['admin'])) with check(public.mcpa_has_role(array['admin']));
grant select(id,name,role) on public.profiles to authenticated;
create policy mcpa_profiles_read on public.profiles for select to authenticated using(public.mcpa_has_role(array['admin','tool_handler']));
do $$
begin
 if to_regclass('public.project_history') is not null then
   grant select on public.project_history to authenticated;
   create policy mcpa_history_read on public.project_history for select to authenticated using(public.mcpa_has_role(array['admin','tool_handler']));
 end if;
end $$;

create or replace function public.mcpa_accounts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
 p:=mcpa_auth_private.identity();if p.role<>'admin' then raise exception 'Admin access required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'account_status',account_status,'auth_user_id',auth_user_id) order by name) from public.profiles),'[]'::jsonb);
end $$;
create or replace function public.mcpa_save_account(p_id uuid,p_name text,p_role text,p_status text,p_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; result uuid;
begin
 actor:=mcpa_auth_private.identity();if actor.role<>'admin' then raise exception 'Admin access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(672341,2027);
 if p_role is null or p_status is null or p_role not in ('admin','engineer','architect','secretary','tool_handler') or p_status not in ('active','inactive') or nullif(btrim(p_name),'') is null or length(p_name)>120 then raise exception 'Check the account details.' using errcode='22023';end if;
 if p_id=actor.id and (p_role<>'admin' or p_status<>'active' or p_auth_user_id is distinct from actor.auth_user_id) then raise exception 'You cannot remove your own administrator access.' using errcode='42501';end if;
 if p_status='active' and p_auth_user_id is null then raise exception 'Link a Supabase Auth account before activation.' using errcode='22023';end if;
 if p_auth_user_id is not null and not exists(select 1 from auth.users where id=p_auth_user_id) then raise exception 'Create or invite the Auth account first.' using errcode='22023';end if;
 if p_id is null then
   result:=gen_random_uuid();insert into public.profiles(id,name,role,account_status,auth_user_id) values(result,btrim(p_name),p_role,p_status,p_auth_user_id);
 else
   update public.profiles set name=btrim(p_name),role=p_role,account_status=p_status,auth_user_id=p_auth_user_id,updated_at=clock_timestamp() where id=p_id returning id into result;
   if result is null then raise exception 'Profile no longer exists.' using errcode='22023';end if;
 end if;
 return result;
end $$;

-- Secure existing Consumables RPCs without changing their stock transactions.
do $$
declare f record; signature text; declarations text; arg_names text; call_args text;
begin
 for f in select p.*,oidvectortypes(p.proargtypes) identity_args,pg_get_function_arguments(p.oid) args,pg_get_function_result(p.oid) result_type
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('consumables_save_item','consumables_adjust_stock','consumables_create_request','consumables_receive_request','consumables_cancel_request') loop
   signature:=f.proname||'('||f.identity_args||')';
   if to_regprocedure('mcpa_auth_private.'||signature) is null then execute 'alter function public.'||signature||' set schema mcpa_auth_private';end if;
   select string_agg(quote_ident(a),',') into arg_names from unnest(f.proargnames) a;
   call_args:=arg_names;
   if f.proname='consumables_create_request' then call_args:=replace(call_args,'p_requester','actor.name');end if;
   execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as $body$ declare actor public.profiles; begin actor:=mcpa_auth_private.identity(); if actor.role not in (''admin'',''secretary'') then raise exception ''Materials access required.'' using errcode=''42501'';end if; return mcpa_auth_private.%I(%s);end $body$',f.proname,f.args,f.result_type,f.proname,call_args);
 end loop;
end $$;
do $$
declare t text;
begin
 foreach t in array array['consumables','consumable_requests','consumable_stock_movements'] loop
   if to_regclass('public.'||t) is not null then
     execute format('grant select on public.%I to authenticated',t);
     execute format('create policy mcpa_materials_read on public.%I for select to authenticated using(public.mcpa_has_role(array[''admin'',''secretary'']))',t);
   end if;
 end loop;
end $$;

revoke all on all functions in schema mcpa_auth_private from public,anon,authenticated;
revoke all on function public.mcpa_movement_set_status(uuid,text) from public,anon,authenticated;
do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname in ('mcpa_my_profile','mcpa_has_role','mcpa_movement_action','mcpa_movement_snapshot','mcpa_accounts','mcpa_save_account') or p.proname like 'consumables_%') loop
   execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
   execute 'grant execute on function '||f.signature||' to authenticated';
 end loop;
end $$;
notify pgrst,'reload schema';
commit;

-- Review and apply manually after 202610060003_development_accounts.sql.
-- Additive APIs; no equipment, project, account or movement records are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table mcpa_auth_private.receiving_qr (
 token_hash text primary key,
 receiver_id uuid not null references public.profiles(id),
 site_id uuid not null references public.sites(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index receiving_qr_receiver on mcpa_auth_private.receiving_qr(receiver_id);
alter table mcpa_auth_private.receiving_qr enable row level security;
revoke all on mcpa_auth_private.receiving_qr from public,anon,authenticated;

-- A narrow personal-custody reader. The broader, existing request catalog is
-- deliberately separate and is never sent to the personal tracking screen.
create function public.mcpa_personal_equipment_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb; own_ids jsonb; collection text;
begin
 p:=mcpa_auth_private.identity();
 if p.role not in ('engineer','architect') then raise exception 'Engineer or Architect access required.' using errcode='42501';end if;
 result:=public.mcpa_movement_snapshot();
 select coalesce(jsonb_agg(t),'[]'::jsonb),coalesce(jsonb_agg(t->>'id'),'[]'::jsonb)
 into result,own_ids from jsonb_array_elements(result->'tools') t where t->>'holderId'=p.id::text;
 result:=jsonb_build_object('tools',result,'users','[]'::jsonb,'sites',coalesce((
   select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'is_active',s.is_active))
   from public.sites s where exists(select 1 from public.equipment e where e.site_id=s.id and e.current_holder_id=p.id)
 ),'[]'::jsonb));
 foreach collection in array array['requests','transfers','returns','repairs','missing'] loop
  result:=result||jsonb_build_object(collection,coalesce((
   select jsonb_agg(m.data order by m.created_at desc) from public.mcpa_movements m
   where m.kind=case collection when 'requests' then 'request' when 'transfers' then 'transfer' when 'returns' then 'return' when 'repairs' then 'repair' else 'missing' end
   and mcpa_auth_private.can_view_movement(m,p)
   and exists(select 1 from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id where a.movement_id=m.id and e.current_holder_id=p.id)
  ),'[]'::jsonb));
 end loop;
 return result||jsonb_build_object('activity',coalesce((select jsonb_agg(o.activity order by o.created_at desc)
  from public.mcpa_movement_operations o where exists(select 1 from public.mcpa_movements m
   where m.id=o.activity->>'entityId' and mcpa_auth_private.can_view_movement(m,p))
  and exists(select 1 from jsonb_array_elements_text(o.activity->'toolIds') t where own_ids ? t)
 ),'[]'::jsonb));
end $$;

-- One accountable person per project is the existing business model. Return
-- actual joined profile names, never the logged-in name substituted into rows.
create function public.mcpa_project_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; snapshot jsonb;
begin
 p:=mcpa_auth_private.identity();
 if p.role not in ('engineer','architect') then raise exception 'Engineer or Architect access required.' using errcode='42501';end if;
 snapshot:=public.mcpa_movement_snapshot();
 return jsonb_build_object(
  'sites',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('assigned_engineer',r.name) order by s.name)
    from public.sites s join public.profiles r on r.id=s.assigned_engineer_id where s.assigned_engineer_id=p.id),'[]'::jsonb),
  'tools',coalesce((select jsonb_agg(t) from jsonb_array_elements(snapshot->'tools') t
    where exists(select 1 from public.sites s where s.id::text=t->>'siteId' and s.assigned_engineer_id=p.id)),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at desc) from public.project_history h
    join public.sites s on s.id=h.project_id where s.assigned_engineer_id=p.id),'[]'::jsonb)
 );
end $$;

create function mcpa_auth_private.receiving_context(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q mcpa_auth_private.receiving_qr; r public.profiles; s public.sites;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid receiving QR. Ask the receiver to generate a new one.' using errcode='22023';end if;
 select * into q from mcpa_auth_private.receiving_qr where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for share;
 if q.token_hash is null or q.revoked_at is not null or q.expires_at<=clock_timestamp() then
  raise exception 'This receiving QR is expired or revoked. Ask the receiver to generate a new one.' using errcode='22023';end if;
 select * into r from public.profiles where id=q.receiver_id for share;
 select * into s from public.sites where id=q.site_id for share;
 if r.account_status is distinct from 'active' or r.auth_user_id is null or r.role is null or r.role not in ('engineer','architect') then
  raise exception 'The receiver no longer has an active Engineer or Architect account.' using errcode='22023';end if;
 if not s.is_active or s.assigned_engineer_id is distinct from r.id then
  raise exception 'The receiving project assignment changed. Ask the receiver for a new QR.' using errcode='22023';end if;
 return jsonb_build_object('receiver_id',r.id,'receiver_name',r.name,'site_id',s.id,'site_name',s.name,'expires_at',q.expires_at);
end $$;

create function public.mcpa_create_receiving_qr(p_site_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; s public.sites; token text;
begin
 p:=mcpa_auth_private.identity();
 if p.role not in ('engineer','architect') then raise exception 'Engineer or Architect access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(672341,2026);
 perform 1 from public.profiles where id=p.id for share;
 p:=mcpa_auth_private.identity();
 select * into s from public.sites where id=p_site_id and is_active and assigned_engineer_id=p.id for share;
 if not found then raise exception 'Choose an active project assigned to your account.' using errcode='42501';end if;
 update mcpa_auth_private.receiving_qr set revoked_at=clock_timestamp() where receiver_id=p.id and revoked_at is null;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into mcpa_auth_private.receiving_qr(token_hash,receiver_id,site_id,expires_at)
 values(encode(sha256(convert_to(token,'UTF8')),'hex'),p.id,s.id,clock_timestamp()+interval '15 minutes');
 return mcpa_auth_private.receiving_context(token)||jsonb_build_object('token',token);
end $$;

create function public.mcpa_resolve_receiving_qr(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 p:=mcpa_auth_private.identity();
 if p.role not in ('engineer','architect','tool_handler') then raise exception 'Transfer access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(672341,2026);
 return mcpa_auth_private.receiving_context(p_token);
end $$;

create function public.mcpa_revoke_receiving_qr(p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 p:=mcpa_auth_private.identity();
 perform pg_advisory_xact_lock(672341,2026);
 update mcpa_auth_private.receiving_qr set revoked_at=clock_timestamp()
 where receiver_id=p.id and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
end $$;

-- Retain the existing authorized workflow intact behind a narrower wrapper.
alter function public.mcpa_movement_action(text,jsonb,uuid) rename to movement_authorized;
alter function public.movement_authorized(text,jsonb,uuid) set schema mcpa_auth_private;
create function public.mcpa_movement_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.profiles; s public.sites; qr jsonb; payload jsonb;
begin
 p:=mcpa_auth_private.identity();
 perform pg_advisory_xact_lock(672341,2026);
 payload:=p_payload-'receivingToken'; -- Ephemeral QR secrets never enter movement/audit history.
 if p_action='createTransfer' and not exists(select 1 from public.mcpa_movement_operations where id=p_operation_id) then
  if p.role not in ('engineer','architect','tool_handler') then raise exception 'Transfer access required.' using errcode='42501';end if;
  select * into r from public.profiles where id=nullif(payload->>'receiverId','')::uuid for share;
  select * into s from public.sites where name=payload->>'destination' for share;
  if r.id is null or r.account_status is distinct from 'active' or r.auth_user_id is null or r.role is null or r.role not in ('engineer','architect') then
   raise exception 'Choose an active Engineer or Architect receiver.' using errcode='22023';end if;
  if s.id is null or not s.is_active or s.assigned_engineer_id is distinct from r.id then
   raise exception 'Choose an active destination assigned to the receiving Engineer or Architect. Contact Admin to arrange the assignment.' using errcode='22023';end if;
  if p_payload ? 'receivingToken' then
   qr:=mcpa_auth_private.receiving_context(p_payload->>'receivingToken');
   if qr->>'receiver_id'<>r.id::text or qr->>'site_id'<>s.id::text then
    raise exception 'The receiver or destination does not match this receiving QR. Scan again or enter details manually.' using errcode='22023';end if;
  end if;
 end if;
 -- Existing function still checks authenticated actor, operation retry identity,
 -- custody, reservations, conditions and named-recipient confirmation atomically.
 return mcpa_auth_private.movement_authorized(p_action,payload,p_operation_id);
end $$;

revoke all on all functions in schema mcpa_auth_private from public,anon,authenticated;
revoke all on function public.mcpa_personal_equipment_snapshot(),public.mcpa_project_snapshot(),
 public.mcpa_create_receiving_qr(uuid),public.mcpa_resolve_receiving_qr(text),public.mcpa_revoke_receiving_qr(text),
 public.mcpa_movement_action(text,jsonb,uuid) from public,anon;
grant execute on function public.mcpa_personal_equipment_snapshot(),public.mcpa_project_snapshot(),
 public.mcpa_create_receiving_qr(uuid),public.mcpa_resolve_receiving_qr(text),public.mcpa_revoke_receiving_qr(text),
 public.mcpa_movement_action(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

-- Read-only checks. No tokens, credentials, or profile details returned.
select jsonb_build_object('personal_snapshot',to_regprocedure('public.mcpa_personal_equipment_snapshot()') is not null,
 'project_snapshot',to_regprocedure('public.mcpa_project_snapshot()') is not null,
 'anonymous_qr_access',has_function_privilege('anon','public.mcpa_create_receiving_qr(uuid)','EXECUTE'),
 'authenticated_private_access',has_function_privilege('authenticated','mcpa_auth_private.receiving_context(text)','EXECUTE')) as engineer_portal_verification;

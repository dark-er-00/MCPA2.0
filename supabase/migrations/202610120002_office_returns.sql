-- MANUAL DEPLOYMENT GATE. Inspect office-return-preflight.sql first.
-- Office UUID verified by the user-provided October 12, 2026 preflight.
-- Office: 2826 Cagayan Valley Rd., Plaridel, Bulacan. No Office is created here.
-- No historical accounts, sites, equipment, custody or movements are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$
declare source_hash text; lifecycle_source text;
begin
  if to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regprocedure('mcpa_auth_private.movement_authorized(text,jsonb,uuid)') is null then
    raise exception 'Authenticated Engineer portal is required. Stop and review the preflight.';
  end if;
  select replace(prosrc,E'\r','') into lifecycle_source from pg_proc
    where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)');
  -- Deployment compatibility: optional purpose may already be installed live.
  -- Normalize ONLY that exact reviewed validation statement for comparison.
  -- This never edits/replaces the lifecycle function. All other source bytes
  -- must still match the reviewed lifecycle hash; unknown drift fails closed.
  source_hash := md5(replace(lifecycle_source,
    $optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$,
    $required$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;$required$));
  if source_hash is distinct from '5b94b3b5642f26981a80382a2b1b6be7' then
    raise exception 'The return lifecycle differs from the reviewed implementation. Stop and inspect it before installing Office returns.';
  end if;
  if to_regprocedure('mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid)') is null then
    select md5(replace(prosrc,E'\r','')) into source_hash from pg_proc
      where oid=to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)');
    if source_hash is null or source_hash not in ('582ea68af753d0fdd81461c537dbf9ab','9aa50e5af660aea383b993a3a578f86a') then
      raise exception 'The movement gateway differs from the reviewed portal/cancellation gateways. Stop and inspect the preflight.';
    end if;
  elsif (select md5(replace(prosrc,E'\r','')) from pg_proc
    where oid=to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')) is distinct from 'c26d3585fe9e140e072b12a273f7bb19' then
    raise exception 'The Office return gateway has changed. Stop rather than replacing it.';
  end if;
  if to_regclass('mcpa_auth_private.return_office') is not null
    and obj_description(to_regclass('mcpa_auth_private.return_office'),'pg_class') is distinct from 'MCPA Office returns v1' then
    raise exception 'Existing Office configuration differs. Stop and review.';
  end if;
end $$;

create table if not exists mcpa_auth_private.return_office (
  singleton boolean primary key default true check(singleton),
  site_id uuid not null references public.sites(id) on delete restrict
);
comment on table mcpa_auth_private.return_office is 'MCPA Office returns v1';
alter table mcpa_auth_private.return_office enable row level security;
revoke all on mcpa_auth_private.return_office from public,anon,authenticated,service_role;

do $$
declare
  verified_office_id constant uuid := 'ba8bef8c-139a-43b9-ae2b-5857293b7f33'; -- OFFICE_ID_FROM_PREFLIGHT
  office public.sites;
begin
  if verified_office_id is null then
    raise exception 'Choose the verified existing Office UUID from office-return-preflight.sql before deployment. No Office record has been created.';
  end if;
  select * into office from public.sites where id=verified_office_id for share;
  if not found or office.is_active is distinct from true then
    raise exception 'The selected receiving Office does not exist or is inactive. Stop and review.';
  end if;
  if (select count(*) from public.sites where name=office.name)<>1 then
    raise exception 'The receiving Office name is ambiguous to the existing movement engine. Stop and review.';
  end if;
  if exists(select 1 from mcpa_auth_private.return_office where site_id<>office.id) then
    raise exception 'A different receiving Office is already configured. Stop and review; do not silently rebind it.';
  end if;
  insert into mcpa_auth_private.return_office(singleton,site_id) values(true,office.id)
    on conflict(singleton) do nothing;
end $$;

create or replace function mcpa_auth_private.office_return_site()
returns public.sites language plpgsql security definer set search_path='' as $$
declare office public.sites;
begin
  -- Pin by existing company site UUID, not a name match or project assignment.
  -- Keep the configuration and canonical name stable throughout the return.
  select s.* into office from mcpa_auth_private.return_office c
    join public.sites s on s.id=c.site_id where c.singleton for share of c,s;
  if not found or office.is_active is distinct from true then
    raise exception 'The company Office return destination is unavailable. Contact Admin.' using errcode='22023';
  end if;
  if (select count(*) from public.sites where name=office.name)<>1 then
    raise exception 'The company Office destination is ambiguous. Contact Admin.' using errcode='22023';
  end if;
  return office;
end $$;

create or replace function public.mcpa_return_destination()
returns jsonb language plpgsql security definer set search_path='' as $$
declare person public.profiles; office public.sites;
begin
  person:=mcpa_auth_private.identity();
  if person.role not in ('engineer','architect') then
    raise exception 'Engineer or Architect return access required.' using errcode='42501';
  end if;
  office:=mcpa_auth_private.office_return_site();
  return jsonb_build_object('id',office.id,'name',office.name,'label','Office');
end $$;

do $$
begin
  if to_regprocedure('mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid)') is null then
    alter function public.mcpa_movement_action(text,jsonb,uuid) rename to movement_before_office_returns;
    alter function public.movement_before_office_returns(text,jsonb,uuid) set schema mcpa_auth_private;
  end if;
end $$;

create or replace function public.mcpa_movement_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
-- Office-only returns v1. Other actions use the existing unchanged gateway.
declare
  person public.profiles; office public.sites; existing public.mcpa_movement_operations;
  payload jsonb; result jsonb; supplied_id uuid;
begin
  if p_action is distinct from 'createReturn' then
    return mcpa_auth_private.movement_before_office_returns(p_action,p_payload,p_operation_id);
  end if;
  person:=mcpa_auth_private.identity();
  perform 1 from public.profiles where id=person.id for share;
  person:=mcpa_auth_private.identity();
  if person.role not in ('engineer','architect') then
    raise exception 'Engineer or Architect return access required.' using errcode='42501';
  end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>131072 then
    raise exception 'Supply a valid operation and return form.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(672341,2026);
  select * into existing from public.mcpa_movement_operations where id=p_operation_id;
  payload:=p_payload;
  if found then
    -- Preserve saved historical results and normalized retries without replaying
    -- custody changes or requiring the Office to retain its old display name.
    -- The previous gateway still validates the action, actor and full payload.
    if (not payload ? 'destination' or nullif(btrim(payload->>'destination'),'') is null)
      and existing.payload ? 'destination' then
      payload:=payload||jsonb_build_object('destination',existing.payload->'destination');
    end if;
    if (not payload ? 'destinationId' or nullif(btrim(payload->>'destinationId'),'') is null)
      and existing.payload ? 'destinationId' then
      payload:=payload||jsonb_build_object('destinationId',existing.payload->'destinationId');
    end if;
    return mcpa_auth_private.movement_before_office_returns(p_action,payload,p_operation_id);
  end if;
  office:=mcpa_auth_private.office_return_site();
  if payload ? 'destination' and payload->'destination'<>'null'::jsonb
    and (jsonb_typeof(payload->'destination')<>'string'
      or (nullif(btrim(payload->>'destination'),'') is not null and btrim(payload->>'destination')<>office.name)) then
    raise exception 'Equipment returns must go to the company Office. Use Transfers for project handovers.' using errcode='22023';
  end if;
  if nullif(payload->>'destinationId','') is not null then
    begin supplied_id:=(payload->>'destinationId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Equipment returns must use the configured Office destination.' using errcode='22023';
    end;
    if supplied_id is distinct from office.id then
      raise exception 'Equipment returns must use the configured Office destination.' using errcode='22023';
    end if;
  end if;
  payload:=payload||jsonb_build_object('destination',office.name,'destinationId',office.id);
  result:=mcpa_auth_private.movement_before_office_returns(p_action,payload,p_operation_id);
  -- The reviewed engine finalizes an inspected return in this transaction.
  -- Physically returned damaged equipment enters Office repair without remaining
  -- personal custody. Missing items keep their last holder/site for accountability.
  update public.equipment e set current_holder_id=null
    where e.current_holder_id=person.id and exists(
      select 1 from public.mcpa_movement_assets a
      join public.mcpa_movements m on m.id=a.movement_id and m.kind='return'
      cross join lateral jsonb_array_elements(m.data->'conditions') inspection
      where m.id=result->>'id' and a.equipment_id=e.id
        and inspection->>'toolId'=e.asset_id and inspection->>'condition'='damaged');
  return result;
end $$;

revoke all on function mcpa_auth_private.office_return_site(),
  mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid),
  public.mcpa_return_destination(),public.mcpa_movement_action(text,jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mcpa_return_destination(),public.mcpa_movement_action(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

-- Installation evidence only; does not read/change business or account records.
select jsonb_build_object(
  'office_configured',exists(select 1 from mcpa_auth_private.return_office),
  'office_destination_rpc',to_regprocedure('public.mcpa_return_destination()') is not null,
  'office_gateway',position('Office-only returns v1' in pg_get_functiondef(to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')))>0,
  'anonymous_movement_execute',has_function_privilege('anon','public.mcpa_movement_action(text,jsonb,uuid)','EXECUTE'),
  'authenticated_private_execute',has_function_privilege('authenticated','mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid)','EXECUTE')
) as office_return_verification;

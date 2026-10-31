-- Controlled cancellation extends the current authenticated movement gateway.
-- Applying this migration creates definitions only; it never rewrites movements,
-- equipment, reservations, activity, or existing operation records.
begin;

create table if not exists public.mcpa_movement_cancellations (
  operation_id uuid not null references public.mcpa_movement_operations(id) on delete restrict,
  movement_id text not null references public.mcpa_movements(id) on delete restrict,
  action text not null check (action in ('withdrawRequest','cancelReservation','cancelTransfer')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null,
  actor_role text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  canceled_at timestamptz not null,
  before_data jsonb not null check (jsonb_typeof(before_data)='object'),
  after_data jsonb not null check (jsonb_typeof(after_data)='object'),
  primary key (operation_id,movement_id)
);
alter table public.mcpa_movement_cancellations enable row level security;
revoke all on public.mcpa_movement_cancellations from public,anon,authenticated;

create table if not exists public.mcpa_movement_refusals (
  operation_id uuid primary key references public.mcpa_movement_operations(id) on delete restrict,
  movement_id text not null references public.mcpa_movements(id) on delete restrict,
  action text not null check (action in ('refuseTransfer','reopenTransfer')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null,
  actor_role text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  recorded_at timestamptz not null,
  before_data jsonb not null check (jsonb_typeof(before_data)='object'),
  after_data jsonb not null check (jsonb_typeof(after_data)='object')
);
alter table public.mcpa_movement_refusals enable row level security;
revoke all on public.mcpa_movement_refusals from public,anon,authenticated;

create or replace function mcpa_auth_private.cancellation_audit_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Cancellation history is immutable.' using errcode='42501';
end $$;
do $$
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.mcpa_movement_cancellations'::regclass and tgname='mcpa_cancellation_no_changes') then
    create trigger mcpa_cancellation_no_changes before update or delete on public.mcpa_movement_cancellations
      for each row execute function mcpa_auth_private.cancellation_audit_immutable();
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.mcpa_movement_cancellations'::regclass and tgname='mcpa_cancellation_no_truncate') then
    create trigger mcpa_cancellation_no_truncate before truncate on public.mcpa_movement_cancellations
      for each statement execute function mcpa_auth_private.cancellation_audit_immutable();
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.mcpa_movement_refusals'::regclass and tgname='mcpa_refusal_no_changes') then
    create trigger mcpa_refusal_no_changes before update or delete on public.mcpa_movement_refusals
      for each row execute function mcpa_auth_private.cancellation_audit_immutable();
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.mcpa_movement_refusals'::regclass and tgname='mcpa_refusal_no_truncate') then
    create trigger mcpa_refusal_no_truncate before truncate on public.mcpa_movement_refusals
      for each statement execute function mcpa_auth_private.cancellation_audit_immutable();
  end if;
end $$;
revoke all on function mcpa_auth_private.cancellation_audit_immutable() from public,anon,authenticated;

-- The user confirmed that new interruptions belong only to the accountable
-- Engineer / Architect. Existing initial Admin review/release is unchanged.
create or replace function mcpa_auth_private.can_adjust_movement(p_action text,m public.mcpa_movements,p public.profiles)
returns boolean language sql stable security definer set search_path='' as $$
  select p.role in ('engineer','architect') and case p_action
    when 'withdrawRequest' then m.kind='request' and m.actor_id=p.id and m.data->>'status'='pending'
    when 'cancelReservation' then m.kind='request' and m.actor_id=p.id and m.data->>'status'='approved'
      and nullif(m.data->>'transferId','') is null
    when 'cancelTransfer' then m.kind='transfer' and m.data->>'status' in ('pending','refused') and (
      m.actor_id=p.id or exists(select 1 from public.mcpa_movements req where req.kind='request'
        and req.id=m.data->>'requestId' and req.actor_id=p.id and req.data->>'status'='released'
        and req.data->>'transferId'=m.id))
    when 'refuseTransfer' then m.kind='transfer' and m.data->>'status'='pending' and m.receiver_id=p.id and (
      exists(select 1 from public.profiles sender where sender.id=m.actor_id and sender.role in ('engineer','architect')
        and sender.account_status='active' and sender.auth_user_id is not null)
      or exists(select 1 from public.mcpa_movements req where req.kind='request' and req.id=m.data->>'requestId'
        and req.actor_id=p.id and req.data->>'status'='released' and req.data->>'transferId'=m.id))
    when 'reopenTransfer' then m.kind='transfer' and m.data->>'status'='refused' and m.actor_id=p.id
    else false end;
$$;
revoke all on function mcpa_auth_private.can_adjust_movement(text,public.mcpa_movements,public.profiles) from public,anon,authenticated;

do $$
begin
  if to_regprocedure('mcpa_auth_private.movement_before_cancellation(text,jsonb,uuid)') is null then
    if to_regprocedure('mcpa_auth_private.movement_authorized(text,jsonb,uuid)') is null then
      raise exception 'Install the authenticated Engineer portal migration before cancellation.';
    end if;
    alter function public.mcpa_movement_action(text,jsonb,uuid) rename to movement_before_cancellation;
    alter function public.movement_before_cancellation(text,jsonb,uuid) set schema mcpa_auth_private;
  end if;
end $$;
create or replace function public.mcpa_movement_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.profiles; m public.mcpa_movements; req public.mcpa_movements;
  existing public.mcpa_movement_operations; payload jsonb; result jsonb; req_result jsonb;
  equipment_ids uuid[]; tool public.equipment; source_item jsonb; item jsonb;
  checks jsonb; seen text[]:=array[]::text[]; reason text; summary text; next_status text;
  recorded_at timestamptz:=clock_timestamp(); recorded_text text;
begin
  if p_action not in ('withdrawRequest','cancelReservation','cancelTransfer','refuseTransfer','reopenTransfer') or p_action is null then
    return mcpa_auth_private.movement_before_cancellation(p_action,p_payload,p_operation_id);
  end if;
  p:=mcpa_auth_private.identity();
  perform 1 from public.profiles where id=p.id for share;
  p:=mcpa_auth_private.identity();
  if p.role not in ('engineer','architect') then
    raise exception 'Only the accountable Engineer or Architect can perform this action.' using errcode='42501';
  end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072
    or jsonb_typeof(p_payload->'id') is distinct from 'string'
    or char_length(btrim(p_payload->>'id')) not between 1 and 120
    or jsonb_typeof(p_payload->'reason') is distinct from 'string'
    or char_length(btrim(p_payload->>'reason')) not between 1 and 2000 then
    raise exception 'Enter a movement reference and reason of 1 to 2000 characters.' using errcode='22023';
  end if;
  if p_payload->'confirmed' is distinct from 'true'::jsonb then
    raise exception 'Confirm the action before submitting.' using errcode='22023';
  end if;
  reason:=btrim(p_payload->>'reason');
  payload:=jsonb_build_object('id',btrim(p_payload->>'id'),'reason',reason,'confirmed',true,
    'actor',jsonb_build_object('id',p.id,'name',p.name,'role',p.role));
  if p_action='refuseTransfer' then payload:=payload||jsonb_build_object('inspections',p_payload->'inspections');end if;
  perform pg_advisory_xact_lock(672341,2026);
  select * into existing from public.mcpa_movement_operations where id=p_operation_id;
  if found then
    if existing.action is distinct from p_action or existing.payload is distinct from payload then
      raise exception 'This operation was already saved with different values or another account.' using errcode='40001';
    end if;
    return existing.result;
  end if;
  select * into m from public.mcpa_movements where id=payload->>'id' for update;
  if not found then raise exception 'Movement no longer exists. Refresh and try again.' using errcode='40001';end if;
  if not coalesce(mcpa_auth_private.can_adjust_movement(p_action,m,p),false) then
    raise exception 'This movement is no longer eligible, or belongs to another accountable person.' using errcode='42501';
  end if;
  select array_agg(equipment_id order by equipment_id) into equipment_ids from public.mcpa_movement_assets where movement_id=m.id;
  if coalesce(array_length(equipment_ids,1),0)=0 then raise exception 'Movement contains no tracked equipment.' using errcode='40001';end if;
  perform 1 from public.equipment where id=any(equipment_ids) order by id for update;
  if p_action='withdrawRequest' then
    if exists(select 1 from public.mcpa_movement_reservations where movement_id=m.id)
      or nullif(m.data->>'transferId','') is not null then
      raise exception 'The pending request has an unexpected reservation or handover. Refresh before continuing.' using errcode='40001';
    end if;
  else
    perform 1 from public.mcpa_movement_reservations where equipment_id=any(equipment_ids) order by equipment_id for update;
    if (select count(*) from public.mcpa_movement_reservations where movement_id=m.id)<>array_length(equipment_ids,1)
      or exists(select 1 from unnest(equipment_ids) id where not exists(
        select 1 from public.mcpa_movement_reservations r where r.equipment_id=id and r.movement_id=m.id)) then
      raise exception 'The reservation changed. Refresh and review the equipment before continuing.' using errcode='40001';
    end if;
    if p_action='cancelReservation' then
      if exists(select 1 from public.mcpa_movements trf where trf.kind='transfer' and trf.data->>'requestId'=m.id)
        or exists(select 1 from public.equipment where id=any(equipment_ids) and (current_holder_id is not null
          or regexp_replace(lower(status::text),'[ _-]','','g') not in ('available','inoffice'))) then
        raise exception 'This reservation has already been fulfilled or its inventory changed.' using errcode='40001';
      end if;
    else
      for tool in select * from public.equipment where id=any(equipment_ids) order by id loop
        select x into source_item from jsonb_array_elements(m.data->'source') x where x->>'toolId'=tool.asset_id;
        if not found or tool.site_id::text is distinct from source_item->>'siteId'
          or tool.current_holder_id::text is distinct from source_item->>'holderId'
          or tool.status::text is distinct from source_item->>'dbStatus'
          or to_jsonb(tool.quantity) is distinct from source_item->'qty' then
          raise exception 'Equipment custody or condition changed after dispatch. Refresh and review the handover.' using errcode='40001';
        end if;
      end loop;
    end if;
  end if;
  if p_action='refuseTransfer' then
    checks:=payload->'inspections';
    if jsonb_typeof(checks) is distinct from 'array' then
      raise exception 'Inspect every tool before refusing the handover.' using errcode='22023';end if;
    if jsonb_array_length(checks)<>array_length(equipment_ids,1) then
      raise exception 'Inspect every tool before refusing the handover.' using errcode='22023';end if;
    for item in select x from jsonb_array_elements(checks) x loop
      if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'toolId') is distinct from 'string'
        or item->>'toolId'=any(seen) or not exists(select 1 from public.equipment where id=any(equipment_ids) and asset_id=item->>'toolId')
        or item->>'condition' is null or item->>'condition' not in ('good','damaged','lost') then
        raise exception 'Inspection records must match each selected tool exactly once.' using errcode='22023';end if;
      seen:=array_append(seen,item->>'toolId');
      if char_length(coalesce(item->>'notes',''))>2000 or (item->>'condition' in ('damaged','lost')
        and (jsonb_typeof(item->'notes') is distinct from 'string' or nullif(btrim(item->>'notes'),'') is null)) then
        raise exception 'Describe each damaged or missing tool using at most 2000 characters.' using errcode='22023';end if;
      if item->>'condition'<>'lost' and item->'tested' is distinct from 'true'::jsonb then
        raise exception 'Test every received tool before recording the inspection.' using errcode='22023';end if;
      if item->>'condition'='damaged' and (item->>'disposition' is null or item->>'disposition' not in ('accepted','declined')) then
        raise exception 'Record a custody decision for each damaged tool.' using errcode='22023';end if;
    end loop;
    if not exists(select 1 from jsonb_array_elements(checks) x where x->>'condition'='damaged' and x->>'disposition'='declined') then
      raise exception 'Damage refusal requires at least one damaged tool declined with inspection notes.' using errcode='22023';end if;
  end if;
  recorded_text:=to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_action='refuseTransfer' then
    result:=m.data||jsonb_build_object('status','refused','refusedBy',p.name,'refusedById',p.id,'refusedAt',recorded_text,
      'refusalReason',reason,'refusalInspections',checks,'updatedAt',recorded_text);
    summary:='Handover refused after damage inspection; custody and reservations held. Reason: '||reason;
  elsif p_action='reopenTransfer' then
    result:=m.data||jsonb_build_object('status','pending','reopenedBy',p.name,'reopenedById',p.id,'reopenedAt',recorded_text,
      'reopenReason',reason,'updatedAt',recorded_text);
    summary:='Sender reopened handover for a new receiver inspection; custody unchanged. Reason: '||reason;
  else
    next_status:=case when p_action='withdrawRequest' then 'withdrawn' else 'canceled' end;
    result:=m.data||jsonb_build_object('status',next_status,'canceledBy',p.name,'canceledById',p.id,'canceledAt',recorded_text,
      'cancellationReason',reason,'updatedAt',recorded_text);
    if p_action='cancelTransfer' and nullif(m.data->>'requestId','') is not null then
      select * into req from public.mcpa_movements where id=m.data->>'requestId' for update;
      if not found or req.kind<>'request' or req.data->>'status'<>'released' or req.data->>'transferId' is distinct from m.id then
        raise exception 'The linked request changed. Refresh before canceling the handover.' using errcode='40001';end if;
      req_result:=req.data||jsonb_build_object('status','canceled','canceledBy',p.name,'canceledById',p.id,'canceledAt',recorded_text,
        'cancellationReason',reason,'updatedAt',recorded_text);
      update public.mcpa_movements set data=req_result where id=req.id;
    end if;
    if p_action<>'withdrawRequest' then
      delete from public.mcpa_movement_reservations where movement_id=m.id and equipment_id=any(equipment_ids);
    end if;
    summary:=case p_action when 'withdrawRequest' then 'Requester withdrew pending request. '
      when 'cancelReservation' then 'Requester canceled unfulfilled reservation; allocation released. '
      else 'Accountable field user canceled unreceived handover; custody unchanged and allocation released. ' end||'Reason: '||reason;
  end if;
  update public.mcpa_movements set data=result where id=m.id;
  insert into public.mcpa_movement_operations(id,action,payload,result,activity) values(p_operation_id,p_action,payload,result,
    jsonb_build_object('id',p_operation_id,'action',p_action,'entityId',m.id,'toolIds',m.data->'toolIds',
      'actor',p.name,'actorId',p.id,'role',p.role,'summary',summary,'createdAt',recorded_text));
  if p_action in ('refuseTransfer','reopenTransfer') then
    insert into public.mcpa_movement_refusals values(p_operation_id,m.id,p_action,p.id,p.name,p.role,reason,recorded_at,m.data,result);
  else
    insert into public.mcpa_movement_cancellations values(p_operation_id,m.id,p_action,p.id,p.name,p.role,reason,recorded_at,m.data,result);
    if req_result is not null then
      insert into public.mcpa_movement_cancellations values(p_operation_id,req.id,p_action,p.id,p.name,p.role,reason,recorded_at,req.data,req_result);
    end if;
  end if;
  return result;
end $$;
revoke all on function mcpa_auth_private.movement_before_cancellation(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.mcpa_movement_action(text,jsonb,uuid) from public,anon;
grant execute on function public.mcpa_movement_action(text,jsonb,uuid) to authenticated;

-- A refused handover still belongs in the named receiver's inspection context.
-- Preserve all earlier visibility rules and add only that held handover scope.
do $$
begin
  if to_regprocedure('mcpa_auth_private.can_view_tool_before_exceptions(public.equipment,public.profiles)') is null then
    alter function mcpa_auth_private.can_view_tool(public.equipment,public.profiles) rename to can_view_tool_before_exceptions;
  end if;
end $$;
create or replace function mcpa_auth_private.can_view_tool(e public.equipment,p public.profiles)
returns boolean language sql stable security definer set search_path='' as $$
  select mcpa_auth_private.can_view_tool_before_exceptions(e,p) or (p.role in ('engineer','architect') and exists(
    select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id
    where a.equipment_id=e.id and m.kind='transfer' and m.data->>'status'='refused' and m.receiver_id=p.id));
$$;
revoke all on function mcpa_auth_private.can_view_tool_before_exceptions(public.equipment,public.profiles),
  mcpa_auth_private.can_view_tool(public.equipment,public.profiles) from public,anon,authenticated;

-- UI decisions use authenticated IDs, never names that may be duplicated or
-- renamed. Enrich only the already-authorized snapshot; no stored JSON changes.
do $$
begin
  if to_regprocedure('mcpa_auth_private.movement_snapshot_before_cancellation()') is null then
    alter function public.mcpa_movement_snapshot() rename to movement_snapshot_before_cancellation;
    alter function public.movement_snapshot_before_cancellation() set schema mcpa_auth_private;
  end if;
end $$;
create or replace function public.mcpa_movement_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; p public.profiles;
begin
  p:=mcpa_auth_private.identity();
  result:=mcpa_auth_private.movement_snapshot_before_cancellation();
  return result||jsonb_build_object(
    'requests',coalesce((select jsonb_agg(x.entry||jsonb_build_object('requesterId',m.actor_id,'allowedActions',
      (select coalesce(jsonb_agg(a),'[]'::jsonb) from unnest(array['withdrawRequest','cancelReservation']) a
        where mcpa_auth_private.can_adjust_movement(a,m,p))) order by x.position)
      from jsonb_array_elements(result->'requests') with ordinality x(entry,position)
      join public.mcpa_movements m on m.id=x.entry->>'id' and m.kind='request'),'[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(x.entry||jsonb_build_object('senderId',m.actor_id,'allowedActions',
      (select coalesce(jsonb_agg(a),'[]'::jsonb) from unnest(array['cancelTransfer','refuseTransfer','reopenTransfer']) a
        where mcpa_auth_private.can_adjust_movement(a,m,p))) order by x.position)
      from jsonb_array_elements(result->'transfers') with ordinality x(entry,position)
      join public.mcpa_movements m on m.id=x.entry->>'id' and m.kind='transfer'),'[]'::jsonb)
  );
end $$;
revoke all on function mcpa_auth_private.movement_snapshot_before_cancellation() from public,anon,authenticated;
revoke all on function public.mcpa_movement_snapshot() from public,anon;
grant execute on function public.mcpa_movement_snapshot() to authenticated;
notify pgrst,'reload schema';

commit;

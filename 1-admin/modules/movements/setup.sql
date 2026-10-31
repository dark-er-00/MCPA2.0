-- Run after Sites setup.sql in the Supabase SQL Editor. Safe to rerun; no seeds.
-- PROTOTYPE ACCESS: login currently does not establish a Supabase Auth identity.
-- The actor/profile and role below are selected by the client and ARE NOT an
-- authorization boundary. Anyone with the public API configuration may invoke
-- these operations. Replace these grants and actor checks with authenticated
-- identity/role checks before production. Existing equipment policies are untouched.
begin;

create sequence if not exists public.mcpa_movement_number;
create table if not exists public.mcpa_movements (
  id text primary key,
  kind text not null check (kind in ('request','transfer','return','repair','missing')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  destination_id uuid references public.sites(id) on delete restrict,
  receiver_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check (data->>'id' = id)
);
create table if not exists public.mcpa_movement_assets (
  movement_id text not null references public.mcpa_movements(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  primary key (movement_id,equipment_id)
);
create table if not exists public.mcpa_movement_reservations (
  equipment_id uuid primary key references public.equipment(id) on delete restrict,
  movement_id text not null references public.mcpa_movements(id) on delete restrict
);
create table if not exists public.mcpa_movement_sites (
  movement_id text not null references public.mcpa_movements(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  primary key (movement_id,site_id)
);
create table if not exists public.mcpa_movement_operations (
  id uuid primary key,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  activity jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists mcpa_movements_kind on public.mcpa_movements(kind,created_at desc);
create index if not exists mcpa_movement_assets_equipment on public.mcpa_movement_assets(equipment_id);

-- This helper writes only one of the existing equipment status literals. Reported
-- and started repairs both use REPAIR in equipment; the repair record distinguishes
-- them so older equipment enums do not need to be altered.
create or replace function public.mcpa_movement_set_status(p_id uuid,p_status text)
returns void language plpgsql set search_path = '' as $$
begin
  case p_status
    when 'available' then update public.equipment set status='AVAILABLE' where id=p_id;
    when 'inuse' then update public.equipment set status='IN_USE' where id=p_id;
    when 'repair' then update public.equipment set status='REPAIR' where id=p_id;
    when 'missing' then update public.equipment set status='MISSING' where id=p_id;
    else raise exception 'Invalid equipment status.' using errcode='22023';
  end case;
end $$;

create or replace function public.mcpa_movement_snapshot()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'tools',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.asset_id,'dbId',e.id,'name',e.name,'cat',e.category,'brand',e.brand,
      'qty',coalesce(e.quantity,0),'site',coalesce(s.name,'Unassigned'),
      'holder',coalesce(p.name,'—'),'siteId',e.site_id,'holderId',e.current_holder_id,
      'model',to_jsonb(e)->>'model','serial',to_jsonb(e)->>'serial_number',
      'condition',case regexp_replace(lower(e.status::text),'[ _-]','','g')
        when 'repair' then 'Damaged' when 'underrepair' then 'Damaged' when 'forrepair' then 'Damaged'
        when 'missing' then 'Unconfirmed' else to_jsonb(e)->>'condition' end,
      'unit',to_jsonb(e)->>'unit','trackingType',to_jsonb(e)->>'tracking_type',
      'acquired',to_jsonb(e)->>'created_at',
      'status',case when exists(select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id where a.equipment_id=e.id and m.kind='repair' and m.data->>'status'='underrepair') then 'underrepair'
        else case regexp_replace(lower(e.status::text),'[ _-]','','g') when 'forrepair' then 'repair' else regexp_replace(lower(e.status::text),'[ _-]','','g') end end
      ) order by e.asset_id) from public.equipment e left join public.sites s on s.id=e.site_id left join public.profiles p on p.id=e.current_holder_id),'[]'::jsonb),
    'sites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.sites),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.profiles where nullif(btrim(name),'') is not null),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(data order by created_at desc,id) from public.mcpa_movements where kind='request'),'[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(data order by created_at desc,id) from public.mcpa_movements where kind='transfer'),'[]'::jsonb),
    'returns',coalesce((select jsonb_agg(data order by created_at desc,id) from public.mcpa_movements where kind='return'),'[]'::jsonb),
    'repairs',coalesce((select jsonb_agg(data order by created_at desc,id) from public.mcpa_movements where kind='repair'),'[]'::jsonb),
    'missing',coalesce((select jsonb_agg(data order by created_at desc,id) from public.mcpa_movements where kind='missing'),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(activity order by created_at desc,id) from public.mcpa_movement_operations),'[]'::jsonb)
  );
$$;

create or replace function public.mcpa_movement_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid; v_actor text; v_role text; v_now text := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_existing public.mcpa_movement_operations; v_record public.mcpa_movements;
  v_id text; v_request_id text; v_report_id text; v_kind text; v_prefix text;
  v_destination_id uuid; v_destination text; v_receiver_id uuid; v_receiver text;
  v_ids jsonb; v_source jsonb; v_checks jsonb; v_check jsonb; v_source_item jsonb;
  v_result jsonb; v_report jsonb; v_condition text; v_notes text; v_count integer;
  v_needed_until date;
  v_tool public.equipment; v_equipment_ids uuid[]; v_tool_id text; v_summary text;
begin
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072 then
    raise exception 'Supply a valid operation and movement form.' using errcode='22023';
  end if;
  -- Serializes movement operations. Asset row locks below also detect changes by
  -- existing equipment editors. This deliberately favors correctness at prototype scale.
  perform pg_advisory_xact_lock(672341,2026);
  select * into v_existing from public.mcpa_movement_operations where id=p_operation_id;
  if found then
    if v_existing.action is distinct from p_action or v_existing.payload is distinct from p_payload then
      raise exception 'This operation was already saved with different values. Refresh and try again.' using errcode='40001';
    end if;
    return v_existing.result;
  end if;
  if p_action is null or p_action not in ('createRequest','approveRequest','rejectRequest','releaseRequest','createTransfer','receiveTransfer','createReturn','reportRepair','reportMissing','startRepair','completeRepair','recoverMissing') then
    raise exception 'Unknown movement action.' using errcode='22023';
  end if;
  v_role := p_payload#>>'{actor,role}';
  if v_role is null or v_role not in ('admin','engineer') then raise exception 'Select an application role.' using errcode='22023'; end if;
  begin v_actor_id := (p_payload#>>'{actor,id}')::uuid;
  exception when invalid_text_representation then raise exception 'Select an existing profile.' using errcode='22023'; end;
  select name into v_actor from public.profiles where id=v_actor_id;
  if not found or nullif(btrim(v_actor),'') is null or v_actor is distinct from p_payload#>>'{actor,name}' then
    raise exception 'Select an existing profile before creating a movement.' using errcode='22023';
  end if;
  if p_action in ('approveRequest','rejectRequest','releaseRequest','startRepair','completeRepair','recoverMissing') and v_role<>'admin' then
    raise exception 'Switch to Admin review for this action.' using errcode='42501';
  end if;
  v_notes := btrim(coalesce(p_payload->>'notes',''));
  if char_length(v_notes)>2000 then raise exception 'Notes must be at most 2000 characters.' using errcode='22023'; end if;

  if p_action in ('approveRequest','rejectRequest','releaseRequest','receiveTransfer','startRepair','completeRepair','recoverMissing') then
    select * into v_record from public.mcpa_movements where id=p_payload->>'id' for update;
    if not found then raise exception 'Movement no longer exists. Refresh and try again.' using errcode='40001'; end if;
    v_id := v_record.id;
    v_ids := case when v_record.kind in ('repair','missing') then jsonb_build_array(v_record.data->>'toolId') else v_record.data->'toolIds' end;
    select array_agg(equipment_id order by equipment_id) into v_equipment_ids from public.mcpa_movement_assets where movement_id=v_id;
  else
    v_ids := case when p_action in ('reportRepair','reportMissing') then jsonb_build_array(p_payload->>'toolId') else p_payload->'toolIds' end;
    if jsonb_typeof(v_ids) is distinct from 'array' or jsonb_array_length(v_ids) not between 1 and 100 then
      raise exception 'Select between 1 and 100 tools.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(v_ids) x where jsonb_typeof(x)<>'string' or char_length(x#>>'{}') not between 1 and 120) or
       (select count(distinct x) from jsonb_array_elements_text(v_ids) x) <> jsonb_array_length(v_ids) then
      raise exception 'Choose each valid tool once.' using errcode='22023';
    end if;
    select array_agg(id order by id) into v_equipment_ids from public.equipment where asset_id in (select jsonb_array_elements_text(v_ids));
    if coalesce(array_length(v_equipment_ids,1),0) <> jsonb_array_length(v_ids) then
      raise exception 'A selected tool is missing or has an ambiguous asset ID. Refresh the masterlist.' using errcode='40001';
    end if;
  end if;
  if coalesce(array_length(v_equipment_ids,1),0)=0 then raise exception 'Movement contains no equipment.' using errcode='40001'; end if;
  perform 1 from public.equipment where id=any(v_equipment_ids) order by id for update;
  if exists(select 1 from public.equipment where id=any(v_equipment_ids) and (quantity is null or quantity<=0)) then
    raise exception 'Only equipment with a positive quantity can move.' using errcode='22023';
  end if;
  if exists(select 1 from public.equipment where id=any(v_equipment_ids) and asset_id not in (select jsonb_array_elements_text(v_ids))) then
    raise exception 'An asset identifier changed. Review the movement before continuing.' using errcode='40001';
  end if;

  -- Resolve names exactly and uniquely; persist stable IDs through site renames.
  if p_action in ('createRequest','createTransfer') or nullif(btrim(p_payload->>'destination'),'') is not null then
    select count(*),min(id::text)::uuid,min(name) into v_count,v_destination_id,v_destination from public.sites where name=p_payload->>'destination';
    if v_count<>1 then raise exception 'Choose an existing destination site.' using errcode='22023'; end if;
  end if;
  if p_action in ('createRequest','createTransfer') then
    v_receiver := coalesce(nullif(btrim(p_payload->>'receiver'),''),v_actor);
    select count(*),min(id::text)::uuid into v_count,v_receiver_id from public.profiles where name=v_receiver;
    if v_count<>1 then raise exception 'Choose an existing receiver with a unique profile name.' using errcode='22023'; end if;
    if p_action='createRequest' and v_role='engineer' and v_receiver_id<>v_actor_id then
      raise exception 'Engineers must request equipment for their own custody.' using errcode='42501';
    end if;
  end if;

  if p_action in ('createRequest','createTransfer','approveRequest','releaseRequest','createReturn','reportRepair','reportMissing') then
    if exists(select 1 from public.equipment where id=any(v_equipment_ids) and regexp_replace(lower(status::text),'[ _-]','','g') not in ('available','inuse')) then
      raise exception 'A tool is unavailable because it is missing, under repair, or retired.' using errcode='40001';
    end if;
    if p_action in ('createRequest','approveRequest','releaseRequest') and exists(
      select 1 from public.equipment where id=any(v_equipment_ids) and
        (regexp_replace(lower(status::text),'[ _-]','','g')<>'available' or current_holder_id is not null)) then
      raise exception 'Requests may allocate only available stock with no current holder. Ask the current holder to transfer equipment already in use.' using errcode='40001';
    end if;
    if p_action='createReturn' and exists(select 1 from public.equipment where id=any(v_equipment_ids) and regexp_replace(lower(status::text),'[ _-]','','g')<>'inuse') then
      raise exception 'Only equipment currently in use can be returned.' using errcode='40001';
    end if;
    if p_action<>'createRequest' and exists(select 1 from public.mcpa_movement_reservations where equipment_id=any(v_equipment_ids) and (p_action<>'releaseRequest' or movement_id<>v_id)) then
      raise exception 'A tool is reserved by an approved request or pending transfer.' using errcode='40001';
    end if;
    if p_action in ('createTransfer','createReturn','reportRepair','reportMissing') and v_role='engineer' and exists(
      select 1 from public.equipment where id=any(v_equipment_ids) and (current_holder_id is distinct from v_actor_id
        or (p_action='createTransfer' and regexp_replace(lower(status::text),'[ _-]','','g')<>'inuse'))) then
      raise exception 'Engineers may only transfer, return or report tools in their custody. Request available stock through Admin review.' using errcode='42501';
    end if;
  end if;

  if p_action='createRequest' then
    if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;
    if nullif(p_payload->>'neededUntil','') is not null then
      if (p_payload->>'neededUntil') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter the needed-until date as YYYY-MM-DD.' using errcode='22023'; end if;
      begin v_needed_until := (p_payload->>'neededUntil')::date;
      exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Enter a valid needed-until date.' using errcode='22023'; end;
      if to_char(v_needed_until,'YYYY-MM-DD')<>p_payload->>'neededUntil' then raise exception 'Enter a valid needed-until date.' using errcode='22023'; end if;
      if v_needed_until < (current_timestamp at time zone 'Asia/Manila')::date then raise exception 'The needed-until date cannot be in the past.' using errcode='22023'; end if;
    end if;
    v_id := 'REQ-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
    v_kind := 'request';
    v_result := jsonb_build_object('id',v_id,'toolIds',v_ids,'destination',v_destination,'destinationId',v_destination_id,'receiver',v_receiver,'receiverId',v_receiver_id,'requester',v_actor,'purpose',btrim(p_payload->>'purpose'),'neededUntil',p_payload->>'neededUntil','status','pending','createdAt',v_now,'updatedAt',v_now);
  elsif p_action in ('approveRequest','rejectRequest') then
    if v_record.kind<>'request' or v_record.data->>'status'<>'pending' then raise exception 'Only pending requests can be reviewed.' using errcode='40001'; end if;
    if p_action='rejectRequest' and (nullif(btrim(p_payload->>'reason'),'') is null or char_length(p_payload->>'reason')>2000) then raise exception 'Enter a rejection reason of at most 2000 characters.' using errcode='22023'; end if;
    v_result := v_record.data||jsonb_build_object('status',case when p_action='approveRequest' then 'approved' else 'rejected' end,'reviewedBy',v_actor,'updatedAt',v_now);
    if p_action='approveRequest' then
      insert into public.mcpa_movement_reservations(equipment_id,movement_id) select unnest(v_equipment_ids),v_id;
    else v_result := v_result||jsonb_build_object('reason',btrim(p_payload->>'reason')); end if;
    update public.mcpa_movements set data=v_result where id=v_id;
  elsif p_action in ('createTransfer','releaseRequest') then
    if p_action='releaseRequest' then
      if v_record.kind<>'request' or v_record.data->>'status'<>'approved' then raise exception 'Only approved requests can be released.' using errcode='40001'; end if;
      if (select count(*) from public.mcpa_movement_reservations where movement_id=v_id)<>array_length(v_equipment_ids,1) then raise exception 'The request reservation changed.' using errcode='40001'; end if;
      v_request_id := v_id;
      v_destination_id := v_record.destination_id; v_receiver_id := v_record.receiver_id;
      select name into v_destination from public.sites where id=v_destination_id;
      select name into v_receiver from public.profiles where id=v_receiver_id;
      v_notes := v_record.data->>'purpose';
    end if;
    select jsonb_agg(jsonb_build_object('toolId',e.asset_id,'site',coalesce(s.name,'Unassigned'),'holder',coalesce(p.name,'—'),
      'status',regexp_replace(lower(e.status::text),'[ _-]','','g'),'siteId',e.site_id,'holderId',e.current_holder_id,'dbStatus',e.status::text,'qty',e.quantity) order by e.asset_id)
      into v_source from public.equipment e left join public.sites s on s.id=e.site_id left join public.profiles p on p.id=e.current_holder_id where e.id=any(v_equipment_ids);
    v_id := 'TRF-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0'); v_kind := 'transfer';
    v_result := jsonb_build_object('id',v_id,'code',v_id,'toolIds',v_ids,'source',v_source,'destination',v_destination,'destinationId',v_destination_id,'receiver',v_receiver,'receiverId',v_receiver_id,'sender',v_actor,'notes',v_notes,'requestId',v_request_id,'status','pending','createdAt',v_now);
  elsif p_action='receiveTransfer' then
    if v_record.kind<>'transfer' or v_record.data->>'status'<>'pending' then raise exception 'Only pending transfers can be received.' using errcode='40001'; end if;
    if v_role<>'admin' and v_record.receiver_id is distinct from v_actor_id then raise exception 'Only the named receiver or Admin may confirm receipt.' using errcode='42501'; end if;
    v_checks := p_payload->'inspections';
    v_destination_id := v_record.destination_id; v_receiver_id := v_record.receiver_id;
    if (select count(*) from public.mcpa_movement_reservations where movement_id=v_id)<>array_length(v_equipment_ids,1) then raise exception 'Transfer reservation changed.' using errcode='40001'; end if;
    for v_tool in select * from public.equipment where id=any(v_equipment_ids) order by id loop
      select x into v_source_item from jsonb_array_elements(v_record.data->'source') x where x->>'toolId'=v_tool.asset_id;
      if not found or v_tool.site_id::text is distinct from v_source_item->>'siteId' or v_tool.current_holder_id::text is distinct from v_source_item->>'holderId' or v_tool.status::text is distinct from v_source_item->>'dbStatus' or to_jsonb(v_tool.quantity) is distinct from v_source_item->'qty' then
        raise exception 'Tool custody or status changed after dispatch. Refresh and resolve the transfer.' using errcode='40001';
      end if;
    end loop;
  elsif p_action='createReturn' then
    v_checks := p_payload->'conditions';
    select jsonb_agg(jsonb_build_object('toolId',e.asset_id,'site',coalesce(s.name,'Unassigned'),'holder',coalesce(p.name,'—'),
      'status',regexp_replace(lower(e.status::text),'[ _-]','','g'),'siteId',e.site_id,'holderId',e.current_holder_id,'dbStatus',e.status::text,'qty',e.quantity) order by e.asset_id)
      into v_source from public.equipment e left join public.sites s on s.id=e.site_id left join public.profiles p on p.id=e.current_holder_id where e.id=any(v_equipment_ids);
    v_id := 'RTN-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0'); v_kind := 'return';
    v_result := jsonb_build_object('id',v_id,'toolIds',v_ids,'source',v_source,'destination',coalesce(v_destination,'Current site'),'destinationId',v_destination_id,'returnedBy',v_actor,'conditions',v_checks,'notes',v_notes,'createdAt',v_now);
  elsif p_action in ('reportRepair','reportMissing') then
    if nullif(v_notes,'') is null then raise exception 'Describe the damage or missing tool.' using errcode='22023'; end if;
    v_kind := case when p_action='reportRepair' then 'repair' else 'missing' end;
    v_id := case when v_kind='repair' then 'REP-' else 'MIS-' end||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
    v_result := jsonb_build_object('id',v_id,'toolId',v_ids->>0,'status',case when v_kind='repair' then 'reported' else 'missing' end,'notes',v_notes,'reportedBy',v_actor,'createdAt',v_now,'updatedAt',v_now);
    perform public.mcpa_movement_set_status(v_equipment_ids[1],case when v_kind='repair' then 'repair' else 'missing' end);
  elsif p_action in ('startRepair','completeRepair','recoverMissing') then
    if (p_action in ('startRepair','completeRepair') and (v_record.kind<>'repair' or v_record.data->>'status' not in ('reported','underrepair'))) or
       (p_action='startRepair' and v_record.data->>'status'<>'reported') or
       (p_action='completeRepair' and v_record.data->>'status'<>'underrepair') or
       (p_action='recoverMissing' and (v_record.kind<>'missing' or v_record.data->>'status'<>'missing')) then
      raise exception 'This report is already closed or has changed.' using errcode='40001';
    end if;
    select * into v_tool from public.equipment where id=v_equipment_ids[1];
    if (p_action in ('startRepair','completeRepair') and regexp_replace(lower(v_tool.status::text),'[ _-]','','g') not in ('repair','underrepair','forrepair')) or
       (p_action='recoverMissing' and regexp_replace(lower(v_tool.status::text),'[ _-]','','g')<>'missing') then raise exception 'Equipment status changed. Review it before resolving this report.' using errcode='40001'; end if;
    if p_action='recoverMissing' and coalesce(p_payload->>'condition','') not in ('good','damaged') then raise exception 'Record the recovered tool condition.' using errcode='22023'; end if;
    if p_action='recoverMissing' and p_payload->>'condition'='damaged' and nullif(v_notes,'') is null then raise exception 'Describe the recovered damage.' using errcode='22023'; end if;
    if p_action<>'startRepair' then
      update public.equipment set site_id=coalesce(v_destination_id,site_id),current_holder_id=null where id=v_tool.id;
      perform public.mcpa_movement_set_status(v_tool.id,case when p_action='recoverMissing' and p_payload->>'condition'='damaged' then 'repair' else 'available' end);
    end if;
    v_result := v_record.data||jsonb_build_object('status',case p_action when 'startRepair' then 'underrepair' when 'completeRepair' then 'completed' else 'recovered' end,'updatedAt',v_now,'resolvedBy',v_actor,'resolutionNotes',v_notes);
    update public.mcpa_movements set data=v_result where id=v_id;
    if p_action='recoverMissing' and p_payload->>'condition'='damaged' then
      v_report_id := 'REP-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
      v_report := jsonb_build_object('id',v_report_id,'toolId',v_tool.asset_id,'status','reported','notes',v_notes,'reportedBy',v_actor,'sourceId',v_id,'createdAt',v_now,'updatedAt',v_now);
      insert into public.mcpa_movements(id,kind,data,actor_id) values(v_report_id,'repair',v_report,v_actor_id);
      insert into public.mcpa_movement_assets values(v_report_id,v_tool.id);
      insert into public.mcpa_movement_sites select v_report_id,site_id from public.equipment where id=v_tool.id and site_id is not null;
    end if;
  end if;

  if v_kind is not null then
    insert into public.mcpa_movements(id,kind,data,actor_id,destination_id,receiver_id) values(v_id,v_kind,v_result,v_actor_id,v_destination_id,v_receiver_id);
    insert into public.mcpa_movement_assets(movement_id,equipment_id) select v_id,unnest(v_equipment_ids);
    insert into public.mcpa_movement_sites(movement_id,site_id)
      select v_id,site_id from public.equipment where id=any(v_equipment_ids) and site_id is not null
      union select v_id,v_destination_id where v_destination_id is not null;
    if v_kind='transfer' then
      if v_request_id is not null then
        delete from public.mcpa_movement_reservations where movement_id=v_request_id;
        update public.mcpa_movements set data=data||jsonb_build_object('status','released','transferId',v_id,'updatedAt',v_now) where id=v_request_id;
      end if;
      insert into public.mcpa_movement_reservations(equipment_id,movement_id) select unnest(v_equipment_ids),v_id;
    end if;
  end if;

  if p_action in ('receiveTransfer','createReturn') then
    if jsonb_typeof(v_checks) is distinct from 'array' or jsonb_array_length(v_checks)<>array_length(v_equipment_ids,1) or
       (select count(distinct x->>'toolId') from jsonb_array_elements(v_checks) x)<>array_length(v_equipment_ids,1) then
      raise exception 'Record exactly one condition for every selected tool.' using errcode='22023';
    end if;
    for v_tool in select * from public.equipment where id=any(v_equipment_ids) order by id loop
      select x into v_check from jsonb_array_elements(v_checks) x where x->>'toolId'=v_tool.asset_id;
      v_condition := v_check->>'condition';
      if not found or coalesce(v_condition,'') not in ('good','damaged','lost') then raise exception 'Choose a valid condition for every tool.' using errcode='22023'; end if;
      v_notes := btrim(coalesce(v_check->>'notes',''));
      if char_length(v_notes)>2000 or (v_condition<>'good' and nullif(v_notes,'') is null) then raise exception 'Describe each damaged or lost tool using at most 2000 characters.' using errcode='22023'; end if;
      if p_action='receiveTransfer' and v_condition<>'lost' then
        update public.equipment set site_id=v_destination_id,current_holder_id=v_receiver_id where id=v_tool.id;
      elsif p_action='createReturn' and v_condition='good' then
        update public.equipment set site_id=coalesce(v_destination_id,site_id),current_holder_id=null where id=v_tool.id;
      elsif p_action='createReturn' and v_condition='damaged' then
        update public.equipment set site_id=coalesce(v_destination_id,site_id) where id=v_tool.id;
      end if;
      perform public.mcpa_movement_set_status(v_tool.id,case v_condition when 'damaged' then 'repair' when 'lost' then 'missing' else case when p_action='receiveTransfer' then 'inuse' else 'available' end end);
      if v_condition<>'good' then
        v_kind := case when v_condition='damaged' then 'repair' else 'missing' end;
        v_report_id := case when v_kind='repair' then 'REP-' else 'MIS-' end||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
        v_report := jsonb_build_object('id',v_report_id,'toolId',v_tool.asset_id,'status',case when v_kind='repair' then 'reported' else 'missing' end,'notes',v_notes,'reportedBy',v_actor,'sourceId',v_id,'createdAt',v_now,'updatedAt',v_now);
        insert into public.mcpa_movements(id,kind,data,actor_id) values(v_report_id,v_kind,v_report,v_actor_id);
        insert into public.mcpa_movement_assets values(v_report_id,v_tool.id);
        insert into public.mcpa_movement_sites select v_report_id,site_id from public.equipment where id=v_tool.id and site_id is not null;
      end if;
    end loop;
    if p_action='receiveTransfer' then
      v_result := v_record.data||jsonb_build_object('status','received','receivedAt',v_now,'receivedBy',v_actor,'inspections',v_checks);
      update public.mcpa_movements set data=v_result where id=v_id;
      delete from public.mcpa_movement_reservations where movement_id=v_id;
      update public.mcpa_movements set data=data||jsonb_build_object('status','received','updatedAt',v_now) where id=v_record.data->>'requestId' and kind='request';
    end if;
  end if;

  -- Resolution can assign a new destination after the report was first created.
  if v_destination_id is not null then
    insert into public.mcpa_movement_sites values(v_id,v_destination_id) on conflict do nothing;
  end if;

  v_summary := case p_action when 'createRequest' then 'Requested equipment' when 'approveRequest' then 'Approved request' when 'rejectRequest' then 'Rejected request' when 'releaseRequest' then 'Released request for transfer' when 'createTransfer' then 'Dispatched transfer' when 'receiveTransfer' then 'Received and inspected transfer' when 'createReturn' then 'Returned and inspected equipment' when 'reportRepair' then 'Reported equipment damage' when 'reportMissing' then 'Reported missing equipment' when 'startRepair' then 'Started repair' when 'completeRepair' then 'Completed repair' else 'Recovered missing equipment' end;
  insert into public.mcpa_movement_operations(id,action,payload,result,activity) values(p_operation_id,p_action,p_payload,v_result,
    jsonb_build_object('id',p_operation_id,'action',p_action,'entityId',v_id,'toolIds',v_ids,'actor',v_actor,'role',v_role,'summary',v_summary,'createdAt',v_now));
  return v_result;
end $$;

alter table public.mcpa_movements enable row level security;
alter table public.mcpa_movement_assets enable row level security;
alter table public.mcpa_movement_reservations enable row level security;
alter table public.mcpa_movement_sites enable row level security;
alter table public.mcpa_movement_operations enable row level security;
revoke all on public.mcpa_movements,public.mcpa_movement_assets,public.mcpa_movement_reservations,public.mcpa_movement_sites,public.mcpa_movement_operations from public,anon,authenticated;
revoke all on sequence public.mcpa_movement_number from public,anon,authenticated;
revoke all on function public.mcpa_movement_set_status(uuid,text) from public,anon,authenticated;
revoke all on function public.mcpa_movement_snapshot() from public,anon,authenticated;
revoke all on function public.mcpa_movement_action(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.mcpa_movement_snapshot() to anon,authenticated;
grant execute on function public.mcpa_movement_action(text,jsonb,uuid) to anon,authenticated;
notify pgrst, 'reload schema';
commit;

-- REVIEW ONLY. No deployment or live execution is authorized.
-- Requires the existing custody, monitoring and quantity/custody integration APIs.
-- Existing rows and historical operations are never backfilled or rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$ begin
  if to_regprocedure('public.mcpa_b_snapshot()') is null
    or to_regprocedure('mcpa_auth_private.inventory_lock(uuid)') is null
    or to_regclass('public.mcpa_notifications') is null then
    raise exception 'Install the incumbent custody and monitoring dependencies first.';
  end if;
end $$;

alter function public.mcpa_movement_action(text,jsonb,uuid) rename to movement_before_recipient_acceptance;
alter function public.movement_before_recipient_acceptance(text,jsonb,uuid) set schema mcpa_auth_private;
revoke all on function mcpa_auth_private.movement_before_recipient_acceptance(text,jsonb,uuid) from public,anon,authenticated,service_role;

-- Version 3 uses the incumbent tables, operation IDs, reservations and notices.
-- Admin may dispatch their own assets or unassigned stock, never another person's
-- custody. Admin recipients receive at Office; operational recipients retain the
-- existing assigned-project requirement. No administrator acceptance override.
create function mcpa_auth_private.recipient_transfer_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.profiles; recipient public.profiles; dest public.sites; m public.mcpa_movements;
  previous public.mcpa_movement_operations; e public.equipment;
  assets uuid[]; ids jsonb; source jsonb; saved jsonb; payload jsonb; checks jsonb; item jsonb; original jsonb; qr jsonb;
  entity text; reason text; at_time timestamptz:=clock_timestamp();
begin
  p:=mcpa_auth_private.identity();
  perform 1 from public.profiles where id=p.id for share;
  p:=mcpa_auth_private.identity();
  if p.role not in ('admin','engineer','architect','tool_handler') then
    raise exception 'Equipment transfer access required.' using errcode='42501'; end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>131072 or char_length(coalesce(p_payload->>'notes',''))>2000 then
    raise exception 'Provide a valid transfer operation and notes up to 2000 characters.' using errcode='22023'; end if;
  payload:=(p_payload-'actor'-'receivingToken')||jsonb_build_object('actor',jsonb_build_object('id',p.id,'name',p.name,'role',p.role));
  perform pg_advisory_xact_lock(672341,2026);
  select * into previous from public.mcpa_movement_operations where id=p_operation_id;
  if found then
    if previous.action is distinct from p_action or previous.payload is distinct from payload then
      raise exception 'Operation belongs to different values or another account.' using errcode='40001'; end if;
    return previous.result;
  end if;
  if exists(select 1 from public.mcpa_b_operations where id=p_operation_id) then
    raise exception 'Operation ID already belongs to a custody action.' using errcode='40001'; end if;

  if p_action='createTransfer' then
    ids:=coalesce(p_payload->'toolIds',p_payload->'assetIds');
    if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) not between 1 and 100
      or exists(select 1 from jsonb_array_elements(ids) x where jsonb_typeof(x)<>'string')
      or (select count(distinct value) from jsonb_array_elements(ids))<>jsonb_array_length(ids) then
      raise exception 'Select 1 to 100 distinct individual Asset IDs.' using errcode='22023'; end if;
    select * into recipient from public.profiles where id=nullif(p_payload->>'receiverId','')::uuid for share;
    if recipient.id is null or recipient.id=p.id or recipient.account_status<>'active'
      or recipient.auth_user_id is null or recipient.role not in ('admin','engineer','architect') then
      raise exception 'Choose another active Admin, Engineer or Architect recipient.' using errcode='22023'; end if;
    if nullif(p_payload->>'destinationId','') is not null then
      select * into dest from public.sites where id=(p_payload->>'destinationId')::uuid for share;
    else
      select * into dest from public.sites where name=p_payload->>'destination' for share;
    end if;
    if dest.id is null or not coalesce(dest.is_active,false) or to_jsonb(dest)->>'archived_at' is not null then
      raise exception 'Choose an active destination project.' using errcode='22023'; end if;
    if recipient.role='admin' then
      if not exists(select 1 from mcpa_auth_private.return_office where singleton and site_id=dest.id) then
        raise exception 'Admin custody is received at the configured Office.' using errcode='42501'; end if;
    elsif dest.assigned_engineer_id is distinct from recipient.id then
      raise exception 'Choose a project assigned to the named recipient.' using errcode='42501'; end if;
    if p_payload ? 'receivingToken' then
      qr:=mcpa_auth_private.receiving_context(p_payload->>'receivingToken');
      if qr->>'receiver_id' is distinct from recipient.id::text or qr->>'site_id' is distinct from dest.id::text then
        raise exception 'Recipient or destination does not match the receiving QR.' using errcode='22023'; end if;
    end if;
    select array_agg(id order by id) into assets from public.equipment where asset_id in (select jsonb_array_elements_text(ids));
    if coalesce(cardinality(assets),0)<>jsonb_array_length(ids) then
      raise exception 'An asset is unavailable or outside your custody.' using errcode='42501'; end if;
    perform 1 from public.equipment where id=any(assets) order by id for update;
    for e in select * from public.equipment where id=any(assets) loop
      if not mcpa_auth_private.b_individual(e) or mcpa_auth_private.b_retired(e.id)
        or mcpa_auth_private.inventory_lock(e.id) is not null
        or regexp_replace(lower(e.status::text),'[ _-]','','g') not in ('available','inuse')
        or regexp_replace(lower(coalesce(e.condition,'')),'[ _-]','','g') in ('damaged','repair','underrepair','missing','lost') then
        raise exception 'An individual asset is reserved, damaged, retired or unavailable.' using errcode='40001'; end if;
      if (p.role in ('engineer','architect') and (e.current_holder_id is distinct from p.id or e.status::text<>'IN_USE'))
        or (p.role='admin' and e.current_holder_id is not null and e.current_holder_id<>p.id)
        or (p.role='tool_handler' and e.current_holder_id is not null) then
        raise exception 'Only the current custodian may transfer held equipment.' using errcode='42501'; end if;
    end loop;
    select jsonb_agg(jsonb_build_object('toolId',eq.asset_id,'name',eq.name,'siteId',eq.site_id,
      'site',s.name,'holderId',eq.current_holder_id,'holder',h.name,'dbStatus',eq.status::text,
      'qty',eq.quantity,'condition',eq.condition) order by eq.asset_id) into source
      from public.equipment eq left join public.sites s on s.id=eq.site_id
      left join public.profiles h on h.id=eq.current_holder_id where eq.id=any(assets);
    entity:='TRF-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
    saved:=jsonb_build_object('id',entity,'code',entity,'transferVersion',3,'status','pending','toolIds',ids,
      'source',source,'sender',p.name,'senderId',p.id,'senderRole',p.role,'receiver',recipient.name,
      'receiverId',recipient.id,'destination',dest.name,'destinationId',dest.id,
      'notes',coalesce(p_payload->>'notes',''),'createdAt',at_time);
    insert into public.mcpa_movements(id,kind,data,actor_id,receiver_id,destination_id)
      values(entity,'transfer',saved,p.id,recipient.id,dest.id);
    insert into public.mcpa_movement_assets select entity,unnest(assets);
    insert into public.mcpa_movement_sites select entity,site_id from public.equipment
      where id=any(assets) and site_id is not null union select entity,dest.id;
    insert into public.mcpa_movement_reservations select unnest(assets),entity;
    -- Intentionally no equipment UPDATE at initiation.
  else
    select * into m from public.mcpa_movements where id=p_payload->>'id' for update;
    if m.id is null or m.kind<>'transfer' or m.data->>'transferVersion'<>'3' or m.data->>'status'<>'pending' then
      raise exception 'Only a pending transfer can receive a decision.' using errcode='40001'; end if;
    if (p_action in ('receiveTransfer','refuseTransfer') and m.receiver_id is distinct from p.id)
      or (p_action='cancelTransfer' and m.actor_id is distinct from p.id)
      or p_action not in ('receiveTransfer','refuseTransfer','cancelTransfer') then
      raise exception 'Only the named recipient may accept or reject; only the sender may cancel.' using errcode='42501'; end if;
    entity:=m.id; ids:=m.data->'toolIds';
    select array_agg(equipment_id order by equipment_id) into assets from public.mcpa_movement_assets where movement_id=m.id;
    perform 1 from public.equipment where id=any(assets) order by id for update;
    if coalesce(cardinality(assets),0)<>jsonb_array_length(ids)
      or (select count(*) from public.mcpa_movement_reservations where movement_id=m.id)<>cardinality(assets) then
      raise exception 'Transfer asset reservations changed. Refresh before deciding.' using errcode='40001'; end if;
    for e in select * from public.equipment where id=any(assets) loop
      select x into original from jsonb_array_elements(m.data->'source') x where x->>'toolId'=e.asset_id;
      if original is null or e.current_holder_id::text is distinct from original->>'holderId'
        or e.site_id::text is distinct from original->>'siteId' or e.status::text is distinct from original->>'dbStatus'
        or to_jsonb(e.quantity) is distinct from original->'qty' or e.condition is distinct from original->>'condition'
        or not mcpa_auth_private.b_individual(e) or mcpa_auth_private.b_retired(e.id) then
        raise exception 'Recorded custody or condition changed. Resolve the conflict first.' using errcode='40001'; end if;
    end loop;
    if p_action='receiveTransfer' then
      select * into dest from public.sites where id=m.destination_id for share;
      if not coalesce(dest.is_active,false) or to_jsonb(dest)->>'archived_at' is not null
        or (p.role='admin' and not exists(select 1 from mcpa_auth_private.return_office where singleton and site_id=dest.id))
        or (p.role in ('engineer','architect') and dest.assigned_engineer_id is distinct from p.id)
        or p.role not in ('admin','engineer','architect') then
        raise exception 'Recipient eligibility or project assignment changed.' using errcode='42501'; end if;
      checks:=p_payload->'inspections';
      if jsonb_typeof(checks) is distinct from 'array' or jsonb_array_length(checks)<>cardinality(assets)
        or (select count(distinct x->>'toolId') from jsonb_array_elements(checks) x)<>cardinality(assets)
        or exists(select 1 from jsonb_array_elements(checks) x where not (ids ? (x->>'toolId'))
          or coalesce(x->>'condition','') not in ('good','damaged') or x->'tested' is distinct from 'true'::jsonb
          or x->'physicallyReceived' is distinct from 'true'::jsonb or char_length(coalesce(x->>'notes',''))>2000
          or (x->>'condition'='damaged' and (x->>'disposition' is distinct from 'accepted' or nullif(btrim(x->>'notes'),'') is null))) then
        raise exception 'Physically inspect every exact Asset ID; explicitly accept and describe any damage.' using errcode='22023'; end if;
      saved:=m.data||jsonb_build_object('status','received','receivedAt',at_time,'receivedBy',p.name,
        'acceptedById',p.id,'inspections',checks);
      -- This state transition and all custody updates are in the same transaction.
      update public.mcpa_movements set data=saved where id=m.id;
      for e in select * from public.equipment where id=any(assets) loop
        select x into item from jsonb_array_elements(checks) x where x->>'toolId'=e.asset_id;
        update public.equipment set current_holder_id=p.id,site_id=m.destination_id,
          condition=case item->>'condition' when 'damaged' then 'Damaged' else 'Good' end where id=e.id;
        perform public.mcpa_movement_set_status(e.id,case item->>'condition' when 'damaged' then 'repair' else 'inuse' end);
        if item->>'condition'='damaged' then
          reason:='REP-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
          insert into public.mcpa_movements(id,kind,data,actor_id,destination_id) values(reason,'repair',
            jsonb_build_object('id',reason,'toolId',e.asset_id,'status','reported','notes',item->>'notes',
              'reportedBy',p.name,'sourceId',m.id,'createdAt',at_time),p.id,m.destination_id);
          insert into public.mcpa_movement_assets values(reason,e.id);
          insert into public.mcpa_movement_sites values(reason,m.destination_id);
        end if;
      end loop;
    else
      reason:=btrim(coalesce(p_payload->>'reason',''));
      if char_length(reason) not between 1 and 2000 then raise exception 'Record a reason up to 2000 characters.' using errcode='22023'; end if;
      saved:=m.data||jsonb_build_object('status',case p_action when 'refuseTransfer' then 'rejected' else 'canceled' end,
        'decisionById',p.id,'decisionBy',p.name,'decisionAt',at_time,'reason',reason);
      update public.mcpa_movements set data=saved where id=m.id;
    end if;
    delete from public.mcpa_movement_reservations where movement_id=m.id;
  end if;
  insert into public.mcpa_movement_operations(id,action,payload,result,activity) values(p_operation_id,p_action,payload,saved,
    jsonb_build_object('id',p_operation_id,'entityId',entity,'toolIds',ids,'actor',p.name,'actorId',p.id,'role',p.role,'transferVersion',3,
      'action',p_action,'createdAt',at_time,'summary',case p_action when 'createTransfer' then 'Transfer pending recipient acceptance'
        when 'receiveTransfer' then 'Recipient accepted transfer and custody' when 'refuseTransfer' then 'Recipient rejected transfer; custody unchanged'
        else 'Sender canceled transfer; custody unchanged' end));
  return saved;
end $$;
revoke all on function mcpa_auth_private.recipient_transfer_action(text,jsonb,uuid) from public,anon,authenticated,service_role;

create function public.mcpa_movement_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.mcpa_movements;
begin
  if p_action='createTransfer' then
    return mcpa_auth_private.recipient_transfer_action(p_action,p_payload,p_operation_id);
  end if;
  select * into m from public.mcpa_movements where id=p_payload->>'id' and kind='transfer';
  if m.data @> '{"transferVersion":3}'::jsonb then
    return mcpa_auth_private.recipient_transfer_action(p_action,p_payload,p_operation_id);
  end if;
  -- Existing request release, legacy transfer decisions, cancellation and retry
  -- semantics stay with their incumbent authorization engines.
  return mcpa_auth_private.movement_before_recipient_acceptance(p_action,p_payload,p_operation_id);
end $$;
revoke all on function public.mcpa_movement_action(text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mcpa_movement_action(text,jsonb,uuid) to authenticated;

-- Block alternate equipment editors/RPCs from changing pending accountability.
create function mcpa_auth_private.pending_transfer_custody_fence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.current_holder_id is distinct from old.current_holder_id or new.site_id is distinct from old.site_id
    or new.status is distinct from old.status or new.quantity is distinct from old.quantity
    or new.asset_id is distinct from old.asset_id or new.condition is distinct from old.condition)
    and exists(select 1 from public.mcpa_movement_assets a join public.mcpa_movements m on m.id=a.movement_id
      where a.equipment_id=old.id and m.kind='transfer' and m.data @> '{"transferVersion":3}'::jsonb
        and m.data->>'status' in ('pending','refused')) then
    raise exception 'Resolve the pending recipient handover before changing custody or condition.' using errcode='40001';
  end if;
  return new;
end $$;
create trigger mcpa_pending_transfer_custody_fence before update on public.equipment
for each row execute function mcpa_auth_private.pending_transfer_custody_fence();
revoke all on function mcpa_auth_private.pending_transfer_custody_fence() from public,anon,authenticated,service_role;

-- Enrich new notices inside the incumbent insert path. Never UPDATE immutable
-- notification event fields, and never touch an already-recorded notice.
create function mcpa_auth_private.recipient_transfer_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare operation public.mcpa_movement_operations;
begin
  if coalesce(new.data->>'operationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return new;
  end if;
  select * into operation from public.mcpa_movement_operations where id=(new.data->>'operationId')::uuid;
  if operation.activity @> '{"transferVersion":3}'::jsonb then
    new.data:=new.data||jsonb_build_object('transferVersion',3);
    new.title:=case operation.action when 'createTransfer' then 'Transfer pending acceptance'
      when 'receiveTransfer' then 'Transfer accepted' when 'refuseTransfer' then 'Transfer rejected' else 'Transfer canceled' end;
  end if;
  return new;
end $$;
create trigger mcpa_recipient_transfer_notice before insert on public.mcpa_notifications
for each row execute function mcpa_auth_private.recipient_transfer_notice();
revoke all on function mcpa_auth_private.recipient_transfer_notice() from public,anon,authenticated,service_role;

create function public.mcpa_transfer_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
  p:=mcpa_auth_private.identity();
  if p.role not in ('admin','engineer','architect','tool_handler') then raise exception 'Equipment transfer access required.' using errcode='42501'; end if;
  result:=public.mcpa_movement_snapshot();
  return result||jsonb_build_object('transferVersion',3,'profile',jsonb_build_object('id',p.id,'name',p.name,'role',p.role),
    'officeId',(select site_id from mcpa_auth_private.return_office where singleton),
    'sites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active,
      'assigned_engineer_id',assigned_engineer_id) order by name,id) from public.sites
      where is_active and to_jsonb(sites)->>'archived_at' is null),'[]'::jsonb),
    'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role) order by name,id)
      from public.profiles where account_status='active' and auth_user_id is not null and role in ('admin','engineer','architect')),'[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(m.data||jsonb_build_object('actorId',m.actor_id,'receiverId',m.receiver_id,
      'allowedActions',case when m.data @> '{"transferVersion":3}'::jsonb then
        case when m.data->>'status'<>'pending' then '[]'::jsonb when m.receiver_id=p.id then '["receiveTransfer","refuseTransfer"]'::jsonb
          when m.actor_id=p.id then '["cancelTransfer"]'::jsonb else '[]'::jsonb end
        else coalesce((select x->'allowedActions' from jsonb_array_elements(result->'transfers') x where x->>'id'=m.id),'[]'::jsonb)
          || case when p.role in ('engineer','architect') and m.receiver_id=p.id and m.data->>'status'='pending'
            then '["receiveTransfer"]'::jsonb else '[]'::jsonb end end)
      order by m.created_at desc,m.id) from public.mcpa_movements m where m.kind='transfer'
        and mcpa_auth_private.can_view_movement(m,p)),'[]'::jsonb));
end $$;
revoke all on function public.mcpa_transfer_snapshot() from public,anon,authenticated,service_role;
grant execute on function public.mcpa_transfer_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;

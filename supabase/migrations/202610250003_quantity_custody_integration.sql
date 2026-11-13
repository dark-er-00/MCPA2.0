-- Combined A+B correction. Apply after 202610250001 and 202610250002.
-- No inventory conversion, historical rewrite, or reservation deletion.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if to_regclass('public.mcpa_wa_equipment_requests') is null
    or to_regclass('public.mcpa_b_return_items') is null then
    raise exception 'Install Workstreams A and B in order before integration.';
  end if;
end $$;

-- Physical identity is permanent once an asset participates in accountability.
-- Existing aggregate records retain their meaning and require separate review.
create function mcpa_auth_private.integration_equipment_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (old.current_holder_id is not null
      or exists(select 1 from public.mcpa_movement_reservations where equipment_id=old.id)
      or exists(select 1 from public.mcpa_movement_assets where equipment_id=old.id))
    and (new.id is distinct from old.id or new.asset_id is distinct from old.asset_id
      or new.tracking_type is distinct from old.tracking_type or new.quantity is distinct from old.quantity) then
    raise exception 'Asset identity, tracking type and quantity are fixed after allocation or custody. Ask Admin to review legacy aggregate inventory separately.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger mcpa_integration_equipment_identity before update on public.equipment
for each row execute function mcpa_auth_private.integration_equipment_identity();

create function mcpa_auth_private.integration_physical_movement() returns trigger
language plpgsql security definer set search_path='' as $$
declare e public.equipment;
begin
  select * into e from public.equipment where id=new.equipment_id for update;
  if exists(select 1 from public.mcpa_movements where id=new.movement_id and kind in ('request','transfer','return'))
    and not mcpa_auth_private.b_individual(e) then
    raise exception 'This workflow requires individual Asset IDs with quantity one. Legacy aggregate equipment remains unchanged and cannot be released or transferred.' using errcode='22023';
  end if;
  return new;
end $$;
create trigger mcpa_integration_physical_movement before insert on public.mcpa_movement_assets
for each row execute function mcpa_auth_private.integration_physical_movement();

-- Browser cleanup cannot race a movement attachment. Completed uploads are
-- retained; future orphan cleanup must use a reviewed, privileged lifecycle.
create policy mcpa_integration_evidence_no_delete on storage.objects as restrictive for delete to public
using(bucket_id<>'mcpa-movement-evidence-v2');
create function mcpa_auth_private.integration_evidence_object() returns trigger
language plpgsql security definer set search_path='' as $$
declare ticket public.mcpa_b_evidence;
begin
  if old.bucket_id='mcpa-movement-evidence-v2' then
    select * into ticket from public.mcpa_b_evidence where object_name=old.name for update;
    -- Permit service-maintained timestamps and staged upload metadata. Browser
    -- UPDATE stays denied by B's restrictive fence. Completion freezes content
    -- metadata; path identity is never mutable.
    if (tg_op='DELETE' and (ticket.uploaded_at is not null or ticket.attached_at is not null))
      or (tg_op='UPDATE' and (new.id is distinct from old.id or new.name is distinct from old.name
        or new.bucket_id is distinct from old.bucket_id
        or ((ticket.uploaded_at is not null or ticket.attached_at is not null) and new.metadata is distinct from old.metadata))) then
      raise exception 'Completed movement evidence is retained and cannot be deleted or overwritten.' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger mcpa_integration_evidence_object before delete or update on storage.objects
for each row execute function mcpa_auth_private.integration_evidence_object();

create function mcpa_auth_private.integration_outward_archive() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists(
    select 1 from public.mcpa_wa_material_items i join public.mcpa_wa_material_requests r on r.id=i.request_id
    where i.consumable_id=old.id and r.status in ('pending','approved','partial')) then
    raise exception 'Resolve outstanding outward material requests before archiving this item.' using errcode='22023';
  end if;
  return new;
end $$;
create trigger mcpa_integration_outward_archive before update on public.consumables
for each row execute function mcpa_auth_private.integration_outward_archive();

create function mcpa_auth_private.integration_request_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare route text; title text; dedupe text;
begin
  route:=case when tg_table_name='mcpa_wa_equipment_requests' then 'quantity-request' else 'outward-materials' end;
  title:=case when route='quantity-request' then 'Equipment quantity request' else 'Outward materials request' end;
  dedupe:='integration:'||tg_table_name||':'||new.id::text||':'||txid_current()::text;
  if tg_op='INSERT' then
    insert into public.mcpa_notifications(recipient_id,kind,entity_id,dedupe_key,title,message,data)
      select id,'movement',new.id::text,dedupe,title,'A new request is ready for Admin review.',jsonb_build_object('route',route)
      from public.profiles where role='admin' and account_status='active' and auth_user_id is not null
      on conflict(recipient_id,dedupe_key) do nothing;
  else
    insert into public.mcpa_notifications(recipient_id,kind,entity_id,dedupe_key,title,message,data)
      select id,'movement',new.id::text,dedupe,title,'Your request status is now '||new.status||'.',jsonb_build_object('route',route)
      from public.profiles where id=new.requester_id and account_status='active' and auth_user_id is not null
      on conflict(recipient_id,dedupe_key) do nothing;
  end if;
  return new;
end $$;
create trigger mcpa_integration_quantity_notice after insert or update on public.mcpa_wa_equipment_requests
for each row execute function mcpa_auth_private.integration_request_notice();
create trigger mcpa_integration_material_notice after insert or update on public.mcpa_wa_material_requests
for each row execute function mcpa_auth_private.integration_request_notice();

create function mcpa_auth_private.integration_retirement_admins() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='approved' then
    perform 1 from public.profiles where id in (new.proposed_by,new.approved_by) order by id for share;
    if new.proposed_by=new.approved_by or (select count(*) from public.profiles
      where id in (new.proposed_by,new.approved_by) and role='admin' and account_status='active' and auth_user_id is not null)<>2 then
      raise exception 'Two distinct active Admin accounts must authorize retirement.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger mcpa_integration_retirement_admins before update on public.mcpa_b_retirements
for each row execute function mcpa_auth_private.integration_retirement_admins();

-- Match the incumbent approval engine: IN_OFFICE is diagnostic legacy stock,
-- not an AVAILABLE asset that can be promised to a new request.
create or replace function mcpa_auth_private.wa_equipment_available(e public.equipment)
returns boolean language sql stable security definer set search_path='' as $$
  select e.quantity>0 and e.current_holder_id is null
    and regexp_replace(lower(e.status::text),'[ _-]','','g')='available'
    and regexp_replace(lower(coalesce(e.condition,'')),'[ _-]','','g') not in ('damaged','repair','underrepair','missing','lost')
    and mcpa_auth_private.inventory_lock(e.id) is null
$$;
create or replace function mcpa_auth_private.inventory_lock(asset uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when exists(select 1 from public.mcpa_b_return_items where equipment_id=asset and outcome in ('pending','missing','disputed')) then 'inspection'
    when exists(select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id
      where a.equipment_id=asset and (m.kind='transfer' and m.data->>'status' in ('pending','refused')
        or m.kind='request' and m.data->>'status'='released')) then 'transfer'
    when exists(select 1 from public.mcpa_movement_reservations r join public.mcpa_movements m on m.id=r.movement_id
      where r.equipment_id=asset and m.kind='transfer') then 'transfer'
    when exists(select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id
      where a.equipment_id=asset and m.kind='request' and m.data->>'status'='approved') then 'request'
    when exists(select 1 from public.mcpa_movement_reservations where equipment_id=asset) then 'reserved'
    else null end
$$;

-- Preserve the scoped incumbent reader. Redact inspection notes for its wider
-- monitoring audience; B's sender/Admin RPC retains the original evidence.
alter function public.mcpa_movement_snapshot() rename to movement_snapshot_before_integration;
alter function public.movement_snapshot_before_integration() set schema mcpa_auth_private;
revoke all on function mcpa_auth_private.movement_snapshot_before_integration() from public,anon,authenticated,service_role;
create function public.mcpa_movement_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; p public.profiles; enriched jsonb; collection text;
begin
  p:=mcpa_auth_private.identity();
  result:=mcpa_auth_private.movement_snapshot_before_integration();
  select coalesce(jsonb_agg(t.value||jsonb_build_object('movementLock',mcpa_auth_private.inventory_lock(e.id),
    'retirementDisposition',(select disposition from public.mcpa_b_retirements where equipment_id=e.id and status='approved')) order by t.ordinality),'[]'::jsonb)
    into enriched from jsonb_array_elements(result->'tools') with ordinality t(value,ordinality)
    join public.equipment e on e.id::text=t.value->>'dbId';
  result:=result||jsonb_build_object('tools',enriched,'integrationVersion',3);
  if p.role<>'admin' then
    select coalesce(jsonb_agg(case when m.actor_id is distinct from p.id and
      ((m.data @> '{"custodyVersion":2}'::jsonb) or m.data ? 'inspectionBatchId') then
      (t.value-'notes'-'conditions')||jsonb_build_object('notes','Inspection details restricted to the custodian and Admin.') else t.value end order by t.ordinality),'[]'::jsonb)
      into enriched from jsonb_array_elements(result->'returns') with ordinality t(value,ordinality)
      join public.mcpa_movements m on m.id=t.value->>'id';
    result:=result||jsonb_build_object('returns',enriched);
    -- The incumbent return engine copies damaged-inspection notes into its
    -- generated repair. Apply the same audience boundary to that projection.
    foreach collection in array array['repairs','missing'] loop
      select coalesce(jsonb_agg(case when m.actor_id is distinct from p.id and exists(
        select 1 from public.mcpa_movements parent where parent.id=m.data->>'sourceId' and parent.data ? 'inspectionBatchId')
        then (t.value-'notes')||jsonb_build_object('notes','Inspection details restricted to the custodian and Admin.') else t.value end order by t.ordinality),'[]'::jsonb)
        into enriched from jsonb_array_elements(result->collection) with ordinality t(value,ordinality)
        join public.mcpa_movements m on m.id=t.value->>'id';
      result:=result||jsonb_build_object(collection,enriched);
    end loop;
  end if;
  return result;
end $$;

-- Current reports and future snapshots retain the business disposition. Saved
-- historical snapshots remain exactly as originally recorded.
alter function mcpa_auth_private.monitoring_current_tools() rename to monitoring_tools_before_integration;
create function mcpa_auth_private.monitoring_current_tools() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(t.value||jsonb_build_object('retirementDisposition',
    (select r.disposition from public.mcpa_b_retirements r join public.equipment e on e.id=r.equipment_id
      where e.asset_id=t.value->>'id' and r.status='approved')) order by t.ordinality),'[]'::jsonb)
  from jsonb_array_elements(mcpa_auth_private.monitoring_tools_before_integration()) with ordinality t(value,ordinality)
$$;
revoke all on function mcpa_auth_private.monitoring_current_tools(),mcpa_auth_private.monitoring_tools_before_integration() from public,anon,authenticated,service_role;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='mcpa_auth_private' and (p.proname like 'integration\_%' escape '\' or p.proname in ('wa_equipment_available','inventory_lock')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
revoke all on function public.mcpa_movement_snapshot() from public,anon,authenticated,service_role;
grant execute on function public.mcpa_movement_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;

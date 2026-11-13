-- MANUAL REVIEW ONLY. Definitions/grants only; no production record correction.
-- Supersedes 202610150001 inventory metadata (works with or without that wrapper).
-- Keeps the existing can_view_tool/can_view_movement scope and all RLS policies.
-- Requires the authenticated portal and stable-recipient lifecycle. Does not
-- reapply Office defaults, reconfigure Office, or resolve any existing movement.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Publish a lock category only. A reservation remains protective even if its
-- movement looks completed; mismatches require review, never automatic deletion.
create or replace function mcpa_auth_private.inventory_lock(asset uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when exists(select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id
      where a.equipment_id=asset and (m.kind='transfer' and m.data->>'status' in ('pending','refused')
        or m.kind='request' and m.data->>'status'='released')) then 'transfer'
    when exists(select 1 from public.mcpa_movement_reservations r join public.mcpa_movements m on m.id=r.movement_id
      where r.equipment_id=asset and m.kind='transfer') then 'transfer'
    when exists(select 1 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id
      where a.equipment_id=asset and m.kind='request' and m.data->>'status'='approved') then 'request'
    when exists(select 1 from public.mcpa_movement_reservations r where r.equipment_id=asset) then 'reserved'
    else null end
$$;
revoke all on function mcpa_auth_private.inventory_lock(uuid) from public,anon,authenticated;

do $migration$
declare
  target regprocedure := to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)');
  definition text; normalized text; reader_hash text;
  anchor text := $anchor$    if p_action<>'createRequest' and exists(select 1 from public.mcpa_movement_reservations$anchor$;
  guard text := $guard$    -- Verified request stock v1: runs after retry replay and equipment row locks.
    if p_action in ('createRequest','approveRequest','releaseRequest') and exists(
      select 1 from public.equipment e where e.id=any(v_equipment_ids) and
        (regexp_replace(lower(coalesce(e.condition,'')),'[ _-]','','g') in ('damaged','repair','underrepair','missing','lost')
          or (p_action='createRequest' and mcpa_auth_private.inventory_lock(e.id) is not null))) then
      raise exception 'Equipment is reserved, pending receipt, or has an unavailable condition. Refresh and review its authorized workflow.' using errcode='40001';
    end if;
$guard$;
begin
  if target is null or to_regprocedure('public.mcpa_movement_snapshot()') is null then
    raise exception 'Authenticated movement storage is required. Stop and review.';
  end if;
  select md5(replace(prosrc,E'\r','')) into reader_hash from pg_proc
    where oid=coalesce(to_regprocedure('mcpa_auth_private.movement_snapshot_before_availability()'),
      to_regprocedure('public.mcpa_movement_snapshot()'));
  if reader_hash is null or reader_hash not in ('bfc48d9588294e75f08e52429dd7ee92','3f823cb3ce510b6b20baccf07113436c') then
    raise exception 'The scoped snapshot reader differs from the reviewed implementation. Stop and inspect it.';
  end if;
  definition:=pg_get_functiondef(target);
  -- Fail on unreviewed lifecycle drift. Normalize only this patch and the
  -- previously reviewed optional-purpose statement, preserving all other code.
  select replace(prosrc,E'\r','') into normalized from pg_proc where oid=target;
  normalized:=replace(normalized,guard,'');
  normalized:=replace(normalized,
    $optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$,
    $required$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;$required$);
  if md5(normalized) is distinct from '5b94b3b5642f26981a80382a2b1b6be7' then
    raise exception 'The request lifecycle differs from the reviewed implementation. Stop and inspect it.';
  end if;
  if strpos(definition,guard)=0 then
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
      raise exception 'Unexpected reservation validation. Stop and review.';
    end if;
    execute replace(definition,anchor,guard||anchor);
  end if;
  if to_regprocedure('mcpa_auth_private.movement_snapshot_before_availability()') is null then
    -- Retain the existing authenticated/scoped reader as the only row source.
    alter function public.mcpa_movement_snapshot() rename to movement_snapshot_before_availability;
    alter function public.movement_snapshot_before_availability() set schema mcpa_auth_private;
  end if;
end $migration$;

create or replace function public.mcpa_movement_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; enriched jsonb;
begin
  result:=mcpa_auth_private.movement_snapshot_before_availability();
  select coalesce(jsonb_agg(t.value || jsonb_build_object(
    'recordedStatus',e.status::text,'movementLock',mcpa_auth_private.inventory_lock(e.id)
  ) order by t.ordinality),'[]'::jsonb) into enriched
  from jsonb_array_elements(result->'tools') with ordinality t(value,ordinality)
  join public.equipment e on e.id::text=t.value->>'dbId';
  return result || jsonb_build_object('tools',enriched,'inventoryAvailabilityVersion',1,'inventoryVerificationRevision',2);
end $$;
revoke all on function mcpa_auth_private.movement_snapshot_before_availability() from public,anon,authenticated;
revoke all on function public.mcpa_movement_snapshot() from public,anon;
grant execute on function public.mcpa_movement_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;

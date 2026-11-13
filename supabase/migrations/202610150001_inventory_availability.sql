-- REVIEW BEFORE MANUAL DEPLOYMENT. Read-only snapshot enrichment; no row writes.
-- The scoped movement list can omit another person's reservation while its tool
-- remains visible in the request catalog. Publish only its lock category, never
-- the private movement ID, requester, recipient, destination or notes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
begin
  if to_regprocedure('mcpa_auth_private.movement_snapshot_before_availability()') is null then
    alter function public.mcpa_movement_snapshot() rename to movement_snapshot_before_availability;
    alter function public.movement_snapshot_before_availability() set schema mcpa_auth_private;
  end if;
end $$;
create or replace function public.mcpa_movement_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; enriched jsonb;
begin
  -- The wrapped reader still authenticates and scopes every returned record.
  result:=mcpa_auth_private.movement_snapshot_before_availability();
  select coalesce(jsonb_agg(t.value || jsonb_build_object(
    'recordedStatus',e.status::text,
    'movementLock',(select case when m.kind='transfer' then 'transfer' when m.kind='request' then 'request' else 'reserved' end
      from public.mcpa_movement_reservations r left join public.mcpa_movements m on m.id=r.movement_id
      where r.equipment_id=e.id limit 1)
  ) order by t.ordinality),'[]'::jsonb) into enriched
  from jsonb_array_elements(result->'tools') with ordinality t(value,ordinality)
  join public.equipment e on e.id::text=t.value->>'dbId';
  return result || jsonb_build_object('tools',enriched,'inventoryAvailabilityVersion',1);
end $$;
revoke all on function mcpa_auth_private.movement_snapshot_before_availability() from public,anon,authenticated;
revoke all on function public.mcpa_movement_snapshot() from public,anon;
grant execute on function public.mcpa_movement_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;

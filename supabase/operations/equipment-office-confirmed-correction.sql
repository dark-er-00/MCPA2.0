-- SEPARATE MANUAL STEP after 202610120004_equipment_office_default.sql.
-- BLOCKED by the latest reported active reservation/handover. Do not execute.
-- The historical confirmation below is not authorization for the current state.
-- Obtain fresh physical verification and an authorized decision after resolving
-- the legitimate movement. Never weaken the active-workflow guards below.
-- User physically confirmed Welding Machine T-8862 at Office on October 12, 2026.
-- Only its current physical site is corrected. No historical record is rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Block new reservations/movements while validating the current custody state.
lock table public.equipment,public.mcpa_movement_reservations,
  public.mcpa_movement_assets,public.mcpa_movements in share row exclusive mode;
do $$
declare asset public.equipment; office public.sites;
begin
  if to_regprocedure('public.mcpa_inventory_office()') is null then
    raise exception 'Install the prospective Office inventory migration first.';
  end if;
  office:=mcpa_auth_private.office_return_site();
  select * into asset from public.equipment where asset_id='T-8862' for update;
  if not found or asset.name<>'Welding Machine' then
    raise exception 'The physically verified asset no longer matches the reviewed record. Stop and review.';
  end if;
  if (asset.site_id is not null and asset.site_id<>office.id)
    or asset.current_holder_id is not null or asset.status::text<>'AVAILABLE'
    or asset.quantity<=0
    or exists(select 1 from public.mcpa_movement_reservations r where r.equipment_id=asset.id)
    or exists(select 1 from public.mcpa_movement_assets a join public.mcpa_movements m on m.id=a.movement_id
      where a.equipment_id=asset.id and (m.kind='transfer' and m.data->>'status' in ('pending','refused')
        or m.kind='repair' and m.data->>'status' in ('reported','underrepair')
        or m.kind='missing' and m.data->>'status'='missing')) then
    raise exception 'T-8862 now has a real location or active custody/workflow. No equipment was changed. Rerun the preflight and verify physically again.';
  end if;
  update public.equipment set site_id=office.id where id=asset.id and site_id is null;
end $$;
commit;

select e.asset_id,e.name,s.name as location,e.status,e.quantity,e.current_holder_id
  from public.equipment e left join public.sites s on s.id=e.site_id where e.asset_id='T-8862';

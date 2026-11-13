-- MANUAL EXECUTION ONLY, after migrations 202610220000, 202610220001, 202610220002.
-- User confirmed this exact record is sample/test inventory. No quantity changes.
begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(22026022);
-- Obtain table locks before the item lock, so stock/request writers cannot race
-- the expected-state checks. Failure/timeouts roll back without changing data.
lock table public.consumables in exclusive mode;
lock table public.consumable_requests,public.consumable_stock_movements in share mode;
do $$
declare item public.consumables; movements_before jsonb; movements_after jsonb; changed integer;
  target constant uuid:='c3f58442-dc99-4466-8590-16642abdb7bc';
  reason constant text:='User-confirmed sample/test inventory; archived for the 126-SKU catalog import';
begin
  select * into item from public.consumables where id=target for update;
  if not found then raise exception 'Expected sample UUID not found. Nothing archived.';end if;
  if item.name is distinct from 'Cutting Disc' or item.unit is distinct from 'pieces'
    or item.current_stock is distinct from 24.000::numeric or item.minimum_stock is distinct from 120.000::numeric
    or nullif(btrim(coalesce(item.specification,'')),'') is not null or item.category is not null
    or item.item_code is not null or item.catalog_key is not null then
    raise exception 'Sample identity/state differs from reviewed preflight. Nothing archived.';
  end if;
  if exists(select 1 from public.consumable_requests where consumable_id=target)
    or (select count(*) from public.consumable_stock_movements where consumable_id=target)<>4 then
    raise exception 'Expected zero requests and exactly four stock movements. Nothing archived.';
  end if;
  select jsonb_agg(to_jsonb(m) order by m.id) into movements_before from public.consumable_stock_movements m where consumable_id=target;
  if item.archived_at is null then
    update public.consumables set archived_at=clock_timestamp(),archive_reason=reason,version=version+1,updated_at=clock_timestamp()
      where id=target and version=item.version and archived_at is null;
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'Expected exactly one sample archival.';end if;
  elsif item.archive_reason is distinct from reason then
    raise exception 'Sample was archived by a different workflow. Review before continuing.';
  end if;
  select jsonb_agg(to_jsonb(m) order by m.id) into movements_after from public.consumable_stock_movements m where consumable_id=target;
  if movements_after is distinct from movements_before then raise exception 'Stock history changed; rolling back archival.';end if;
  if exists(select 1 from public.consumables where id=target and (current_stock<>24.000 or minimum_stock<>120.000 or archived_at is null)) then
    raise exception 'Sample balance/archive verification failed.';
  end if;
end $$;
select id,name,unit,current_stock,minimum_stock,archived_at,archive_reason,
  (select count(*) from public.consumable_stock_movements m where m.consumable_id=c.id) preserved_stock_movements
from public.consumables c where id='c3f58442-dc99-4466-8590-16642abdb7bc';
commit;

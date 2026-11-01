-- READ ONLY. Optional adjustment proposal; NEVER part of the catalog import.
-- Do not automatically convert these proposals into writes. A physical count
-- and explicit approval are required for each row. New catalog openings excluded.
select c.id,c.item_code,c.name,c.specification,c.unit,c.version,
 c.current_stock previous_quantity,100 proposed_quantity,
 100-c.current_stock proposed_adjustment,c.minimum_stock preserved_minimum,
 'Reviewed initial stock reconciliation; attach approval and physical-count reference' proposed_reason
from public.consumables c
where c.archived_at is null and c.catalog_key like 'catalog-20261022:%' and c.current_stock<>100
 and not exists(select 1 from public.consumable_stock_movements m
   where m.consumable_id=c.id and m.note like 'Catalog import 2026-10-22:%')
order by c.item_code;
-- Approved adjustments use consumables_adjust_stock with kind='correction',
-- quantity=100, current version, a stable operation UUID, and a reviewed reason.
-- Sign in as an active Admin/Secretary; the RPC records the authorized actor,
-- previous balance, delta, final balance, and timestamp. No history is erased.

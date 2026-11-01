-- READ ONLY. Run in Supabase SQL Editor as an authorized administrator.
-- Contains operational identities/history: share only with authorized reviewers.
-- Run before and after any manually reviewed definition migration.
begin transaction read only;
select p.oid::regprocedure as function_name, p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('anon',p.oid,'execute') as anonymous_execute,
  md5(replace(p.prosrc,E'\r','')) as source_hash,
  pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('mcpa_movement_snapshot','mcpa_movement_action','mcpa_inventory_office'))
  or (n.nspname='mcpa_auth_private' and p.proname in ('movement_snapshot_before_availability','inventory_lock','can_view_tool','can_view_movement'));

select e.id,e.asset_id,e.name,e.status,e.quantity,e.condition,e.site_id,s.name as recorded_location,
  e.current_holder_id, h.name as recorded_holder,
  (select jsonb_agg(jsonb_build_object('movement_id',r.movement_id,'kind',m.kind,'status',m.data->>'status'))
    from public.mcpa_movement_reservations r left join public.mcpa_movements m on m.id=r.movement_id
    where r.equipment_id=e.id) as reservations,
  (select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'data',m.data,'actor_id',m.actor_id,
     'receiver_id',m.receiver_id,'destination_id',m.destination_id) order by m.created_at)
    from public.mcpa_movement_assets a join public.mcpa_movements m on m.id=a.movement_id
    where a.equipment_id=e.id) as movements
from public.equipment e left join public.sites s on s.id=e.site_id
left join public.profiles h on h.id=e.current_holder_id
where e.asset_id in ('T-6254','T-5559','T-8861','T-8862') order by e.asset_id;

-- Include linked handovers even if a historical asset association is missing.
with related as (
  select m.id from public.mcpa_movements m where m.id='REQ-00013'
    or m.data->>'requestId'='REQ-00013'
    or m.id=(select data->>'transferId' from public.mcpa_movements where id='REQ-00013')
    or exists(select 1 from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id
      where a.movement_id=m.id and e.asset_id='T-8862')
)
select m.*, (select jsonb_agg(to_jsonb(a)) from public.mcpa_movement_assets a where a.movement_id=m.id) as assets,
  (select jsonb_agg(to_jsonb(o) order by o.created_at) from public.mcpa_movement_operations o
    where o.activity->>'entityId'=m.id) as operation_history
from public.mcpa_movements m where m.id in (select id from related) order by m.created_at,m.id;

-- Destination authorization uses profile UUIDs, not matching names/Auth UUIDs.
select s.id,s.name,s.is_active,s.assigned_engineer_id,p.name as assigned_name,p.role,p.account_status
from public.sites s left join public.profiles p on p.id=s.assigned_engineer_id
where s.name in ('MCPA Development Receiving Test A','MCPA Development Transfer Test A')
  or s.id in (select site_id from public.equipment where asset_id in ('T-6254','T-5559'));
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('equipment','mcpa_movements','mcpa_movement_reservations');
-- Optional cancellation/refusal records remain read-only even when tables are absent.
select to_regclass('public.mcpa_movement_cancellations') as cancellation_history,
  to_regclass('public.mcpa_movement_refusals') as refusal_history;
commit;

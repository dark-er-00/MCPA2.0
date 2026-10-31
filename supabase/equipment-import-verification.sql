-- READ ONLY post-migration inspection. Functional writes belong in disposable tests.
begin transaction read only;
select n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname,p.proname) in (('public','mcpa_import_equipment'),('mcpa_auth_private','equipment_asset_id'),('mcpa_auth_private','equipment_import_immutable'));
select role_name,has_function_privilege(role_name,'public.mcpa_import_equipment(uuid,jsonb)','EXECUTE') as can_call_import
from (values('anon'),('authenticated'),('service_role')) r(role_name);
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid in ('public.equipment'::regclass,'public.mcpa_equipment_imports'::regclass) and not tgisinternal;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('equipment','mcpa_equipment_imports');
select relname,relrowsecurity from pg_class where oid in ('public.equipment'::regclass,'public.mcpa_equipment_imports'::regclass);
select conname,pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid in ('public.equipment'::regclass,'public.mcpa_equipment_imports'::regclass);
-- Empty immediately after migration; populated only by later confirmed imports.
select operation_id,actor_id,created_at,result->>'created' as created_records,
       jsonb_array_length(result->'assets') as receipt_assets from public.mcpa_equipment_imports order by created_at desc limit 20;
-- Must return no rows: a receipt must reference the real UUID/tag pair.
select i.operation_id,a->>'source_row' as spreadsheet_row,a->>'asset_id' as asset_id
from public.mcpa_equipment_imports i cross join lateral jsonb_array_elements(i.result->'assets') a
left join public.equipment e on e.id=(a->>'id')::uuid and e.asset_id=a->>'asset_id'
where e.id is null;
commit;

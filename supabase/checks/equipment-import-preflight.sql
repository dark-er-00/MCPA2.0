-- READ ONLY. Run as the database reviewer, export the results, and STOP for drift.
-- This file does not create equipment or allocate IDs.
begin transaction read only;
select current_database(),current_user,version();
select column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length
from information_schema.columns where table_schema='public' and table_name='equipment' order by ordinal_position;
select conname,contype,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid='public.equipment'::regclass;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename='equipment';
select relrowsecurity,relforcerowsecurity from pg_class where oid='public.equipment'::regclass;
select policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('equipment','mcpa_equipment_imports') order by tablename,policyname;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid='public.equipment'::regclass and not tgisinternal;
-- Inspect any existing allocator/default trigger before enabling another one.
select n.nspname,p.proname,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in (select tgfoid from pg_trigger where tgrelid='public.equipment'::regclass and not tgisinternal)
or (n.nspname in ('public','mcpa_auth_private') and p.proname in
  ('identity','office_return_site','mcpa_inventory_office','equipment_asset_id','mcpa_import_equipment'));
select to_regprocedure('mcpa_auth_private.office_return_site()') as office_configuration,
       to_regprocedure('public.mcpa_inventory_office()') as office_metadata,
       to_regprocedure('mcpa_auth_private.identity()') as authenticated_identity;
select asset_id,count(*) from public.equipment group by asset_id having count(*)>1;
select count(*) as existing_records,count(*) filter(where asset_id ~ '^T-[A-F0-9]{16}$') as current_format_records,
  count(*) filter(where asset_id is null) as null_tags from public.equipment;
-- Names are informational, NEVER a duplicate-registration rejection rule.
select name,count(*) from public.equipment group by name having count(*)>1 order by count(*) desc limit 20;
select serial_number,count(*) from public.equipment where nullif(btrim(serial_number),'') is not null
group by serial_number having count(*)>1 order by count(*) desc limit 20;
-- SECURITY DEFINER must be owned by the trusted migration owner, never an app role.
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='equipment' order by grantee,privilege_type;
commit;

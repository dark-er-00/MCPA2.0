-- MANUAL SUPABASE STEP: READ ONLY. Do not run the migration until reviewed.
-- Inspect all columns: stop if another field already stores equipment photos.
select column_name,data_type,is_nullable,column_default from information_schema.columns
 where table_schema='public' and table_name='equipment' order by ordinal_position;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets
 where id='equipment-photos';
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
 where (schemaname='storage' and tablename='objects')
 or (schemaname='public' and tablename='equipment') order by schemaname,policyname;
select n.nspname,p.proname,p.prosecdef,p.proconfig,obj_description(p.oid,'pg_proc') marker,
 pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname like '%equipment_photo%')
 or (n.nspname='mcpa_auth_private' and p.proname in ('identity','can_view_tool','guard_equipment_photo_reference'));
select tgname,pg_get_triggerdef(oid) from pg_trigger
 where tgrelid='public.equipment'::regclass and not tgisinternal;
select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='storage' and c.relname='objects') or (n.nspname='public' and c.relname='equipment');
-- No data rows or credentials are selected. Inspect historical migrations through
-- the dashboard before choosing the equipment-only migration versus the existing
-- broader feature-storage migration; do not apply both blindly.

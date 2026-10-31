-- MANUAL SUPABASE STEP: READ ONLY, run after manual installation.
select column_name,data_type,is_nullable from information_schema.columns
 where table_schema='public' and table_name='equipment' and column_name='image_url';
select id,not public as private,file_size_limit=5242880 as five_mb,
 allowed_mime_types from storage.buckets where id='equipment-photos';
select policyname,roles,cmd,qual,with_check from pg_policies
 where schemaname='storage' and tablename='objects' order by policyname;
select tgname,pg_get_triggerdef(oid) from pg_trigger
 where tgrelid='public.equipment'::regclass and tgname='mcpa_equipment_photo_guard';
select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('mcpa_can_read_equipment_photo','mcpa_can_write_equipment_photo','mcpa_can_discard_equipment_photo');
-- Expect private bucket, 5242880 bytes, JPEG/PNG/WebP only; authenticated SELECT,
-- INSERT, unlinked-only DELETE policies; no UPDATE/ALL or broad unrelated policies;
-- security-definer helpers with empty search_path and anon_execute=false.

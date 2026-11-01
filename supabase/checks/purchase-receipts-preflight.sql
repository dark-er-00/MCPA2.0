-- READ ONLY. Export every result set before installing the scoped migration.
-- Review the actual definitions; this script does not approve unexpected objects.
select current_database(),version();
select to_regprocedure('mcpa_auth_private.identity()') identity_helper,
 to_regprocedure('public.mcpa_has_role(text[])') role_helper,
 to_regclass('storage.buckets') buckets,to_regclass('storage.objects') objects,
 to_regclass('public.consumable_requests') material_requests,
 to_regclass('public.mcpa_purchases') purchases,to_regclass('public.mcpa_purchase_history') purchase_history,
 to_regprocedure('public.mcpa_purchase_snapshot()') purchase_snapshot;
select rolname,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname in ('anon','authenticated');
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='storage' and c.relname in ('buckets','objects')) or (n.nspname='public' and c.relname='equipment');
select p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check,obj_description(x.oid,'pg_policy') marker
 from pg_policies p join pg_namespace n on n.nspname=p.schemaname
 join pg_class c on c.relnamespace=n.oid and c.relname=p.tablename
 join pg_policy x on x.polrelid=c.oid and x.polname=p.policyname
 where (p.schemaname='storage' and p.tablename in ('objects','buckets')) or (p.schemaname='public' and p.tablename='equipment')
 order by p.schemaname,p.policyname;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) signature,
 p.prosecdef,p.provolatile,p.proconfig,p.proacl,pg_get_functiondef(p.oid) definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('mcpa_has_role','mcpa_can_access_purchase_receipt',
   'mcpa_can_read_equipment_photo','mcpa_can_write_equipment_photo','mcpa_can_discard_equipment_photo'))
 or (n.nspname='mcpa_auth_private' and p.proname in ('identity','guard_equipment_photo_reference'))
 order by n.nspname,p.proname,signature;
-- Requires real Supabase Storage; do not create a substitute service schema.
select to_jsonb(b) bucket_definition from storage.buckets b
 where id in ('equipment-photos','purchase-receipts') or name in ('equipment-photos','purchase-receipts') order by id;
select bucket_id,count(*) objects from storage.objects where bucket_id in ('equipment-photos','purchase-receipts') group by bucket_id;
select * from storage.objects where bucket_id='purchase-receipts' order by id;
-- Save this complete equipment baseline and compare against postflight output.
select jsonb_build_object(
 'bucket',(select to_jsonb(b) from storage.buckets b where id='equipment-photos'),
 'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='storage' and tablename='objects' and policyname like 'mcpa_equipment_photos_%'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'oid',p.oid,'definition',pg_get_functiondef(p.oid),'acl',p.proacl) order by p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('mcpa_can_read_equipment_photo','mcpa_can_write_equipment_photo','mcpa_can_discard_equipment_photo')) or (n.nspname='mcpa_auth_private' and p.proname='guard_equipment_photo_reference')),
 'triggers',(select jsonb_agg(jsonb_build_object('oid',t.oid,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.oid) from pg_trigger t where t.tgrelid='public.equipment'::regclass and not t.tgisinternal),
 'policy_catalog',(select jsonb_agg(to_jsonb(p) order by p.polname) from pg_policy p where p.polrelid='storage.objects'::regclass and p.polname like 'mcpa_equipment_photos_%'),
 'image_attribute',(select jsonb_agg(jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl)) from pg_attribute a where a.attrelid='public.equipment'::regclass and a.attname='image_url' and not a.attisdropped),
 'equipment_rls',(select jsonb_build_object('enabled',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl) from pg_class c where c.oid='public.equipment'::regclass),
 'equipment_policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='equipment'),
 'image_column',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public' and table_name='equipment' and column_name='image_url'),
 'image_values',(select jsonb_agg(jsonb_build_object('id',e.id,'image_url',to_jsonb(e)->'image_url') order by e.id) from public.equipment e),
 'objects',(select jsonb_agg(to_jsonb(o) order by o.id) from storage.objects o where o.bucket_id='equipment-photos')
) equipment_preservation_baseline;
-- Inspect migration history only if it exists; never INSERT/repair fake entries.
select to_regclass('supabase_migrations.schema_migrations') migration_history_relation;

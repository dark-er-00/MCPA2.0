-- READ ONLY, after receipt compatibility. Catalog checks are not real Storage API tests.
select b.id,b.name,b.public,b.file_size_limit,b.allowed_mime_types,
 b.public=false and b.name='purchase-receipts' and b.file_size_limit=10485760
 and b.allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp']
 and b.allowed_mime_types <@ array['application/pdf','image/jpeg','image/png','image/webp'] as expected_bucket
 from storage.buckets b where b.id='purchase-receipts';
select policyname,permissive,roles,cmd,qual,with_check from pg_policies
 where schemaname='storage' and tablename='objects' order by policyname;
select p.oid::regprocedure signature,p.prosecdef,p.provolatile,p.proconfig,p.proacl,
 pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'execute') anonymous_execute,
 has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
 not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute_revoked
 from pg_proc p where p.oid=to_regprocedure('public.mcpa_can_access_purchase_receipt(text)');
select c.relname,c.relrowsecurity storage_rls_enabled from pg_class c where c.oid in ('storage.objects'::regclass,'storage.buckets'::regclass);
-- Expected: exactly receipt SELECT + INSERT for authenticated, each AND-bound to
-- purchase-receipts + role helper. No receipt UPDATE/DELETE/ALL authorization.
-- Equipment cleanup DELETE is intentional and must remain equipment-only.
-- Review ALL inherited/PUBLIC browser-applicable policies, not just receipt names.
select p.polrelid::regclass policy_table,p.polname,p.polcmd,p.polroles,pg_get_expr(p.polqual,p.polrelid) using_expression,
 pg_get_expr(p.polwithcheck,p.polrelid) check_expression
 from pg_policy p where p.polrelid in ('storage.objects'::regclass,'storage.buckets'::regclass) and
 (0=any(p.polroles) or exists(select 1 from pg_roles r where r.oid=any(p.polroles)
   and (pg_has_role('authenticated',r.oid,'MEMBER') or pg_has_role('anon',r.oid,'MEMBER')))) order by p.polname;
-- This baseline must equal the saved preflight baseline for this scoped migration.
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
-- Do NOT infer authenticated upload/read authorization from these catalog results.
-- Perform the separate staging API scenarios in purchase-receipts DEPLOYMENT.md.

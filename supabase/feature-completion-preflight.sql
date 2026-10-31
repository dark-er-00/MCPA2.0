-- Read-only configuration inventory. No transaction, account or history writes.
-- Review before applying any feature migration. Do not run legacy setup scripts.
select jsonb_build_object(
 'authenticated_identity',to_regprocedure('mcpa_auth_private.identity()') is not null,
 'engineer_portal',to_regprocedure('public.mcpa_project_snapshot()') is not null,
 'project_history',to_regclass('public.project_history') is not null,
 'project_history_capture',exists(select 1 from pg_trigger where tgrelid=to_regclass('public.sites') and tgname='project_history_capture' and not tgisinternal),
 'storage_objects',to_regclass('storage.objects') is not null,
 'storage_buckets',to_regclass('storage.buckets') is not null,
 'photo_read_helper',to_regprocedure('public.mcpa_can_read_equipment_photo(text)') is not null,
 'purchase_ledger',to_regclass('public.mcpa_purchases') is not null,
 'purchase_api',to_regprocedure('public.mcpa_save_purchase(uuid,integer,uuid,jsonb)') is not null,
 'cancellation_audit',to_regclass('public.mcpa_movement_cancellations') is not null,
 'refusal_audit',to_regclass('public.mcpa_movement_refusals') is not null,
 'notifications',to_regclass('public.mcpa_notifications') is not null,
 'prospective_snapshots',to_regclass('public.mcpa_inventory_snapshots') is not null,
 'monitoring_generator',to_regprocedure('public.mcpa_generate_monitoring()') is not null,
 'report_api',to_regprocedure('public.mcpa_monitoring_report(date,date)') is not null
) as feature_configuration;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='storage' and tablename='objects' order by policyname;

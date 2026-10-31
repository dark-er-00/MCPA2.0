-- READ ONLY. Does not inspect any account, notification or business record.
-- Return this one result before installing the guarded turnover-copy migration.
select jsonb_build_object(
  'company_identity_rpc',to_regprocedure('public.mcpa_my_profile()') is not null,
  'movement_snapshot_rpc',to_regprocedure('public.mcpa_movement_snapshot()') is not null,
  'personal_equipment_rpc',to_regprocedure('public.mcpa_personal_equipment_snapshot()') is not null,
  'monitoring_snapshot_rpc',to_regprocedure('public.mcpa_monitoring_snapshot()') is not null,
  'monitoring_mark_read_rpc',to_regprocedure('public.mcpa_monitoring_mark_read(uuid)') is not null,
  'notification_table',to_regclass('public.mcpa_notifications') is not null,
  'notification_store_matches',coalesce(obj_description(to_regclass('public.mcpa_notifications'),'pg_class')='MCPA monitoring v1',false),
  'notification_rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.mcpa_notifications')),false),
  'own_notification_policy',exists(select 1 from pg_policies where schemaname='public' and tablename='mcpa_notifications' and policyname='mcpa_notifications_own_read'),
  'notification_trigger_enabled',exists(select 1 from pg_trigger where tgrelid=to_regclass('public.mcpa_movement_operations') and tgname='mcpa_future_movement_notifications' and tgenabled in ('O','A') and not tgisinternal and tgfoid=to_regprocedure('mcpa_auth_private.notify_new_movement_operation()')),
  'recipient_turnover_copy',coalesce(position('Equipment Pending Turnover' in pg_get_functiondef(to_regprocedure('mcpa_auth_private.notify_new_movement_operation()')))>0,false),
  'notifications_realtime_published',exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='mcpa_notifications'),
  'authenticated_monitoring_execute',coalesce(has_function_privilege('authenticated',to_regprocedure('public.mcpa_monitoring_snapshot()')::oid,'EXECUTE'),false),
  'anonymous_movement_execute',coalesce(has_function_privilege('anon',to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')::oid,'EXECUTE'),false)
) as request_turnover_preflight;

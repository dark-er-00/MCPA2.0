-- READ ONLY. Run after the Office migration, or to inspect an existing install.
-- No business RPC calls, writes, service credentials or account data.
select jsonb_build_object(
  'optional_purpose_installed',coalesce((select strpos(prosrc,
    $optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$)>0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),false),
  'required_purpose_absent',coalesce((select strpos(prosrc,
    $required$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000$required$)=0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),false),
  'stable_recipient_preserved',coalesce((select strpos(prosrc,
    $identity$v_receiver_id := nullif(p_payload->>'receiverId','')::uuid;$identity$)>0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),false),
  'office_destination_rpc',to_regprocedure('public.mcpa_return_destination()') is not null,
  'office_gateway_reviewed',coalesce((select md5(replace(prosrc,E'\r',''))='c26d3585fe9e140e072b12a273f7bb19'
    from pg_proc where oid=to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')),false),
  'turnover_notice_copy',coalesce((select strpos(prosrc,'Equipment Pending Turnover')>0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.notify_new_movement_operation()')),false),
  'notification_trigger_enabled',exists(select 1 from pg_trigger where
    tgrelid=to_regclass('public.mcpa_movement_operations') and tgname='mcpa_future_movement_notifications'
    and tgenabled in ('O','A') and not tgisinternal
    and tgfoid=to_regprocedure('mcpa_auth_private.notify_new_movement_operation()')),
  'anonymous_movement_execute',coalesce(has_function_privilege('anon',to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')::oid,'EXECUTE'),false),
  'authenticated_private_execute',coalesce(has_function_privilege('authenticated',to_regprocedure('mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid)')::oid,'EXECUTE'),false)
) as merge_integration_verification;
-- If office_destination_rpc is true, inspect the existing designation separately:
-- select c.site_id,s.name,s.location,s.is_active from mcpa_auth_private.return_office c
-- join public.sites s on s.id=c.site_id;
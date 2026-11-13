-- Manual deployment gate. Run request-turnover-preflight.sql first.
-- Reuses the installed monitoring trigger/store; no backfill, new table, RLS
-- change, custody change, scheduler change or historical record rewrite.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
begin
  if to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regclass('public.mcpa_notifications') is null
    or obj_description(to_regclass('public.mcpa_notifications'),'pg_class') is distinct from 'MCPA monitoring v1'
    or to_regclass('public.mcpa_movements') is null
    or to_regclass('public.mcpa_movement_assets') is null
    or to_regprocedure('public.mcpa_monitoring_snapshot()') is null then
    raise exception 'Existing authenticated monitoring setup is required. Stop and review the preflight result; do not rerun prototype setup scripts.';
  end if;
  if not exists(select 1 from pg_trigger
    where tgrelid='public.mcpa_movement_operations'::regclass
      and tgname='mcpa_future_movement_notifications' and not tgisinternal
      and tgenabled in ('O','A')
      and tgfoid=to_regprocedure('mcpa_auth_private.notify_new_movement_operation()')) then
    raise exception 'The existing movement notification trigger is missing, disabled or different. Stop and review before changing it.';
  end if;
end $$;

create or replace function mcpa_auth_private.notify_new_movement_operation()
returns trigger language plpgsql security definer set search_path='' as $$
declare movement public.mcpa_movements; performer uuid; notice_title text; equipment_names text;
begin
  select * into movement from public.mcpa_movements where id=new.activity->>'entityId';
  if not found then return new; end if;
  select p.id into performer from public.profiles p where p.auth_user_id=auth.uid();
  notice_title:=case new.action
    when 'createRequest' then 'New tool request'
    when 'approveRequest' then 'Tool request approved'
    when 'rejectRequest' then 'Tool request rejected'
    when 'releaseRequest' then 'Tools released'
    when 'createTransfer' then 'New equipment transfer'
    when 'receiveTransfer' then 'Equipment receipt recorded'
    when 'withdrawRequest' then 'Tool request withdrawn'
    when 'cancelReservation' then 'Reservation cancelled'
    when 'cancelTransfer' then 'Transfer cancelled'
    when 'refuseTransfer' then 'Equipment handover refused'
    when 'reopenTransfer' then 'Equipment handover reopened'
    when 'createReturn' then 'Equipment return recorded'
    when 'reportRepair' then 'Equipment repair reported'
    when 'startRepair' then 'Equipment repair started'
    when 'completeRepair' then 'Equipment repair completed'
    when 'reportMissing' then 'Equipment reported missing'
    when 'recoverMissing' then 'Missing equipment recovered'
    else 'Equipment movement updated' end;
  if new.action='releaseRequest' and movement.kind='transfer' then
    select string_agg(e.name||' ('||e.asset_id||')',', ' order by e.asset_id)
      into equipment_names from public.mcpa_movement_assets a
      join public.equipment e on e.id=a.equipment_id where a.movement_id=movement.id;
  end if;
  -- The operation insert and notice insert share the release transaction.
  -- Only its intended company profile receives the personal turnover wording;
  -- other authorized Admin observers retain the existing generic event.
  insert into public.mcpa_notifications(recipient_id,kind,entity_id,dedupe_key,title,message,data)
    select p.id,'movement',movement.id,'movement:'||new.id::text,
      case when new.action='releaseRequest' and movement.kind='transfer' and p.id=movement.receiver_id
        then 'Equipment Pending Turnover' else notice_title end,
      substring(case when new.action='releaseRequest' and movement.kind='transfer' and p.id=movement.receiver_id
        then 'Equipment from your approved request '||coalesce(movement.data->>'requestId','')||
          ' has been released and is awaiting your receipt confirmation. '||
          coalesce(equipment_names||'. ','')||'Please inspect and test each received tool before confirming receipt.'
        else coalesce(nullif(new.activity->>'summary',''),notice_title) end from 1 for 2000),
      jsonb_build_object('operationId',new.id,'action',new.action,'route',movement.kind)||
        case when new.action='releaseRequest' and movement.kind='transfer'
          then jsonb_build_object('requestId',movement.data->>'requestId','toolIds',movement.data->'toolIds')
          else '{}'::jsonb end
    from public.profiles p where p.account_status='active' and p.auth_user_id is not null
      and p.role in ('admin','engineer','architect','tool_handler')
      and (p.role='admin' or p.id=movement.actor_id or p.id=movement.receiver_id)
      and p.id is distinct from performer
    on conflict(recipient_id,dedupe_key) do nothing;
  return new;
end $$;
revoke all on function mcpa_auth_private.notify_new_movement_operation() from public,anon,authenticated,service_role;
commit;

-- Installation evidence only: no business records, names, emails or tokens.
select jsonb_build_object(
  'recipient_turnover_copy',position('Equipment Pending Turnover' in pg_get_functiondef(to_regprocedure('mcpa_auth_private.notify_new_movement_operation()')))>0,
  'trigger_enabled',exists(select 1 from pg_trigger where tgrelid='public.mcpa_movement_operations'::regclass
    and tgname='mcpa_future_movement_notifications' and tgenabled in ('O','A') and not tgisinternal),
  'notification_rls', (select relrowsecurity from pg_class where oid='public.mcpa_notifications'::regclass),
  'anonymous_trigger_execute',has_function_privilege('anon','mcpa_auth_private.notify_new_movement_operation()','EXECUTE'),
  'authenticated_trigger_execute',has_function_privilege('authenticated','mcpa_auth_private.notify_new_movement_operation()','EXECUTE')
) as request_turnover_verification;

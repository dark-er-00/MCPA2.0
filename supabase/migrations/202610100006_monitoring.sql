-- Prospective monitoring, own-recipient notices and historical inventory capture.
-- Apply manually after authenticated access. No historical backfill, live tests,
-- cron job, previous request edits or notification rewrites are performed here.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare relation_name text;
begin
  if to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regclass('public.mcpa_movement_operations') is null
    or to_regclass('public.mcpa_movement_assets') is null then
    raise exception 'Authenticated movement infrastructure is required for monitoring.';
  end if;
  foreach relation_name in array array['mcpa_notifications','mcpa_inventory_snapshots'] loop
    if to_regclass('public.'||relation_name) is not null
      and obj_description(to_regclass('public.'||relation_name),'pg_class') is distinct from 'MCPA monitoring v1' then
      raise exception 'Existing monitoring relation % differs from this implementation. Stop and review.',relation_name;
    end if;
  end loop;
end $$;

create table if not exists public.mcpa_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check(kind in ('overdue','weekly_monitoring','movement')),
  entity_id text,
  dedupe_key text not null,
  title text not null check(char_length(title) between 1 and 200),
  message text not null check(char_length(message) between 1 and 2000),
  data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique(recipient_id,dedupe_key)
);
comment on table public.mcpa_notifications is 'MCPA monitoring v1';
create index if not exists mcpa_notifications_recipient_date on public.mcpa_notifications(recipient_id,created_at desc);
create table if not exists public.mcpa_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default clock_timestamp(),
  local_date date not null,
  week_start date not null unique,
  tools jsonb not null check(jsonb_typeof(tools)='array'),
  check(extract(isodow from week_start)=1)
);
comment on table public.mcpa_inventory_snapshots is 'MCPA monitoring v1';
create index if not exists mcpa_inventory_snapshots_capture on public.mcpa_inventory_snapshots(captured_at);
create index if not exists mcpa_monitoring_receipt_lookup on public.mcpa_movement_operations((result->>'id'),created_at desc)
  where action='receiveTransfer';
alter table public.mcpa_notifications enable row level security;
alter table public.mcpa_inventory_snapshots enable row level security;
revoke all on public.mcpa_notifications,public.mcpa_inventory_snapshots from public,anon,authenticated,service_role;
grant select on public.mcpa_notifications,public.mcpa_inventory_snapshots to authenticated;
drop policy if exists mcpa_notifications_own_read on public.mcpa_notifications;
create policy mcpa_notifications_own_read on public.mcpa_notifications for select to authenticated
  using(recipient_id=(public.mcpa_my_profile()->>'id')::uuid
    and public.mcpa_has_role(array['admin','engineer','architect','tool_handler']));
drop policy if exists mcpa_inventory_snapshots_admin_read on public.mcpa_inventory_snapshots;
create policy mcpa_inventory_snapshots_admin_read on public.mcpa_inventory_snapshots for select to authenticated
  using(public.mcpa_has_role(array['admin']));

create or replace function mcpa_auth_private.monitoring_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='mcpa_notifications' and tg_op='UPDATE'
    and (to_jsonb(new)-'read_at')=(to_jsonb(old)-'read_at') then return new; end if;
  raise exception 'Monitoring history and notification event fields are immutable.' using errcode='42501';
end $$;
do $$
declare relation_name text;
begin
  foreach relation_name in array array['mcpa_notifications','mcpa_inventory_snapshots'] loop
    if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||relation_name) and tgname='mcpa_monitoring_immutable_rows') then
      execute format('create trigger mcpa_monitoring_immutable_rows before update or delete on public.%I for each row execute function mcpa_auth_private.monitoring_immutable()',relation_name);
      execute format('create trigger mcpa_monitoring_immutable_truncate before truncate on public.%I for each statement execute function mcpa_auth_private.monitoring_immutable()',relation_name);
    end if;
  end loop;
end $$;

create or replace function mcpa_auth_private.monitoring_due_date(value text)
returns date language plpgsql immutable set search_path='' as $$
declare parsed date;
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin parsed:=value::date; exception when datetime_field_overflow or invalid_datetime_format then return null; end;
  if to_char(parsed,'YYYY-MM-DD')<>value then return null; end if;
  return parsed;
end $$;

create or replace function mcpa_auth_private.monitoring_overdue()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('requestId',m.id,'receiverId',m.receiver_id,'receiverName',p.name,
    'neededUntil',due.date,'daysOverdue',(current_timestamp at time zone 'Asia/Manila')::date-due.date,
    'toolIds',tools.ids,'destination',m.data->>'destination') order by due.date,m.id),'[]'::jsonb)
  from public.mcpa_movements m join public.profiles p on p.id=m.receiver_id
  cross join lateral(select mcpa_auth_private.monitoring_due_date(m.data->>'neededUntil') as date) due
  cross join lateral(select jsonb_agg(e.asset_id order by e.asset_id) as ids
    from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id
    -- The newest successful physical receipt identifies the current loan. An
    -- earlier received request stays historical after return and reacquisition;
    -- matching the holder alone would incorrectly revive its old due date.
    join lateral(
      select operation.result->>'requestId' as request_id
      from public.mcpa_movement_assets receipt_asset
      join public.mcpa_movements transfer on transfer.id=receipt_asset.movement_id and transfer.kind='transfer'
      join public.mcpa_movement_operations operation on operation.result->>'id'=transfer.id and operation.action='receiveTransfer'
      where receipt_asset.equipment_id=e.id
        and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(operation.result->'inspections')='array'
          then operation.result->'inspections' else '[]'::jsonb end) inspection
          where inspection->>'toolId'=e.asset_id and inspection->>'condition' in ('good','damaged')
            and coalesce(inspection->>'disposition','accepted')<>'declined')
      order by operation.created_at desc,operation.id desc limit 1
    ) latest_receipt on latest_receipt.request_id=m.id
    where a.movement_id=m.id and e.current_holder_id=m.receiver_id and e.quantity>0) tools
  where m.kind='request' and m.data->>'status'='received'
    and due.date<(current_timestamp at time zone 'Asia/Manila')::date and tools.ids is not null;
$$;

create or replace function mcpa_auth_private.monitoring_current_tools()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.asset_id,'dbId',e.id,'name',e.name,'brand',e.brand,
    'cat',e.category,'serial',to_jsonb(e)->>'serial_number','qty',e.quantity,
    'siteId',e.site_id,'site',coalesce(s.name,'Unassigned'),'holderId',e.current_holder_id,'holder',coalesce(p.name,''),
    'status',regexp_replace(lower(e.status::text),'[ _-]','','g')) order by e.asset_id),'[]'::jsonb)
  from public.equipment e left join public.sites s on s.id=e.site_id left join public.profiles p on p.id=e.current_holder_id;
$$;

create or replace function public.mcpa_monitoring_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare person public.profiles; overdue jsonb;
begin
  person:=mcpa_auth_private.identity();
  if person.role='secretary' then raise exception 'Equipment monitoring is restricted.' using errcode='42501'; end if;
  overdue:=mcpa_auth_private.monitoring_overdue();
  if person.role not in ('admin','tool_handler') then
    select coalesce(jsonb_agg(item),'[]'::jsonb) into overdue from jsonb_array_elements(overdue) item where item->>'receiverId'=person.id::text;
  end if;
  return jsonb_build_object('serverDate',(current_timestamp at time zone 'Asia/Manila')::date,'overdue',overdue,
    'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'recipientId',n.recipient_id,'kind',n.kind,'entityId',n.entity_id,
      'title',n.title,'message',n.message,'data',n.data,'createdAt',n.created_at,'readAt',n.read_at) order by n.created_at desc,n.id)
      from public.mcpa_notifications n where n.recipient_id=person.id),'[]'::jsonb),
    'unreadCount',(select count(*) from public.mcpa_notifications n where n.recipient_id=person.id and n.read_at is null));
end $$;

create or replace function public.mcpa_monitoring_mark_read(p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare person public.profiles; notification_id uuid;
begin
  person:=mcpa_auth_private.identity();
  update public.mcpa_notifications set read_at=coalesce(read_at,clock_timestamp())
    where id=p_id and recipient_id=person.id returning id into notification_id;
  if notification_id is null then raise exception 'Notification is not available to your account.' using errcode='42501'; end if;
  return notification_id;
end $$;

-- Service role/scheduler only. Capture the actual current state and actual server
-- clock once per Manila week; callers cannot supply an earlier capture timestamp.
create or replace function public.mcpa_capture_inventory_snapshot()
returns uuid language plpgsql security definer set search_path='' as $$
declare captured timestamptz:=clock_timestamp(); local_day date:=(captured at time zone 'Asia/Manila')::date;
  local_week date:=date_trunc('week',captured at time zone 'Asia/Manila')::date; snapshot_id uuid;
begin
  insert into public.mcpa_inventory_snapshots(captured_at,local_date,week_start,tools)
    values(captured,local_day,local_week,mcpa_auth_private.monitoring_current_tools())
    on conflict(week_start) do nothing returning id into snapshot_id;
  if snapshot_id is null then select id into snapshot_id from public.mcpa_inventory_snapshots where week_start=local_week; end if;
  return snapshot_id;
end $$;

create or replace function public.mcpa_generate_monitoring()
returns jsonb language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=clock_timestamp() at time zone 'Asia/Manila'; local_day date:=local_now::date;
  local_week date:=date_trunc('week',local_now)::date; overdue jsonb; item jsonb;
  created integer:=0; inserted integer; before_snapshots integer; captured boolean:=false;
begin
  perform pg_advisory_xact_lock(1489210357);
  overdue:=mcpa_auth_private.monitoring_overdue();
  for item in select * from jsonb_array_elements(overdue) loop
    insert into public.mcpa_notifications(recipient_id,kind,entity_id,dedupe_key,title,message,data)
      select p.id,'overdue',item->>'requestId','overdue:'||(item->>'requestId')||':'||local_day::text,
        'Equipment return is overdue',(item->>'requestId')||' was needed until '||(item->>'neededUntil')||'. Review the tools still in custody.',item
      from public.profiles p where p.account_status='active' and p.auth_user_id is not null
        and (p.role='admin' or (p.id=(item->>'receiverId')::uuid and p.role in ('engineer','architect')))
      on conflict(recipient_id,dedupe_key) do nothing;
    get diagnostics inserted=row_count; created:=created+inserted;
  end loop;
  if local_now>=local_week::timestamp+interval '16 hours' then
    select count(*) into before_snapshots from public.mcpa_inventory_snapshots where week_start=local_week;
    perform public.mcpa_capture_inventory_snapshot(); captured:=before_snapshots=0;
    insert into public.mcpa_notifications(recipient_id,kind,dedupe_key,title,message,data)
      select p.id,'weekly_monitoring','weekly_monitoring:'||local_week::text,'Weekly equipment review',
        'Review current equipment custody, condition and outstanding returns. This week''s recorded inventory snapshot is available to Admin.',
        jsonb_build_object('weekStart',local_week,'route',case p.role when 'admin' then 'reports' else 'masterlist' end)
      from public.profiles p where p.account_status='active' and p.auth_user_id is not null and p.role in ('admin','tool_handler','engineer','architect')
      on conflict(recipient_id,dedupe_key) do nothing;
    get diagnostics inserted=row_count; created:=created+inserted;
  end if;
  return jsonb_build_object('notificationsCreated',created,'snapshotCaptured',captured,'serverDate',local_day);
end $$;

create or replace function public.mcpa_monitoring_report(p_start date,p_end date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare person public.profiles;
begin
  person:=mcpa_auth_private.identity();
  if person.role<>'admin' then raise exception 'Admin reports access required.' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then
    raise exception 'Choose a valid reporting range of at most 367 days.' using errcode='22023'; end if;
  return jsonb_build_object('start',p_start,'end',p_end,'timezone','Asia/Manila','generatedAt',current_timestamp,
    'activity',coalesce((select jsonb_agg(o.activity order by o.created_at desc,o.id) from public.mcpa_movement_operations o
      where (o.created_at at time zone 'Asia/Manila')::date between p_start and p_end),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'capturedAt',s.captured_at,'localDate',s.local_date,'weekStart',s.week_start,'tools',s.tools)
      order by s.captured_at desc) from public.mcpa_inventory_snapshots s where s.local_date between p_start and p_end),'[]'::jsonb),
    'current',mcpa_auth_private.monitoring_current_tools(),
    'historicalAvailableFrom',(select min(local_date) from public.mcpa_inventory_snapshots));
end $$;

-- Future operations only: do not backfill or rewrite old request notifications.
-- The existing transactional operation insert delivers affected recipients an
-- in-app event atomically. Names never determine the actor or recipient.
create or replace function mcpa_auth_private.notify_new_movement_operation()
returns trigger language plpgsql security definer set search_path='' as $$
declare movement public.mcpa_movements; performer uuid; notice_title text;
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
  insert into public.mcpa_notifications(recipient_id,kind,entity_id,dedupe_key,title,message,data)
    select p.id,'movement',movement.id,'movement:'||new.id::text,notice_title,
      substring(coalesce(nullif(new.activity->>'summary',''),notice_title) from 1 for 2000),
      jsonb_build_object('operationId',new.id,'action',new.action,'route',movement.kind)
    from public.profiles p where p.account_status='active' and p.auth_user_id is not null
      and p.role in ('admin','engineer','architect','tool_handler')
      and (p.role='admin' or p.id=movement.actor_id or p.id=movement.receiver_id)
      and p.id is distinct from performer
    on conflict(recipient_id,dedupe_key) do nothing;
  return new;
end $$;
do $$
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.mcpa_movement_operations'::regclass and tgname='mcpa_future_movement_notifications') then
    create trigger mcpa_future_movement_notifications after insert on public.mcpa_movement_operations
      for each row execute function mcpa_auth_private.notify_new_movement_operation();
  end if;
end $$;

revoke all on function mcpa_auth_private.monitoring_immutable(),mcpa_auth_private.monitoring_due_date(text),mcpa_auth_private.monitoring_overdue(),mcpa_auth_private.monitoring_current_tools(),mcpa_auth_private.notify_new_movement_operation() from public,anon,authenticated,service_role;
revoke all on function public.mcpa_monitoring_snapshot(),public.mcpa_monitoring_mark_read(uuid),public.mcpa_monitoring_report(date,date),public.mcpa_capture_inventory_snapshot(),public.mcpa_generate_monitoring() from public,anon,authenticated,service_role;
grant execute on function public.mcpa_monitoring_snapshot(),public.mcpa_monitoring_mark_read(uuid),public.mcpa_monitoring_report(date,date) to authenticated;
grant execute on function public.mcpa_capture_inventory_snapshot(),public.mcpa_generate_monitoring() to service_role;
notify pgrst,'reload schema';
commit;

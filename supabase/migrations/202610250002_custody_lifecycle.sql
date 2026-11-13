-- Workstream B v2. UNAPPLIED: review against the agreed baseline before rollout.
-- Additive definitions only; no historical returns or equipment are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare lifecycle_source text;
begin
  if to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regprocedure('mcpa_auth_private.office_return_site()') is null
    or to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)') is null
    or to_regprocedure('mcpa_auth_private.inventory_lock(uuid)') is null
    or to_regclass('public.mcpa_notifications') is null
    or to_regclass('storage.objects') is null then
    raise exception 'Preflight: authenticated movements, Office returns, monitoring, verified inventory and Storage are required.';
  end if;
  select replace(prosrc,E'\r','') into lifecycle_source from pg_proc
    where oid='mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)'::regprocedure;
  lifecycle_source:=replace(lifecycle_source,
    $optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$,
    $required$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;$required$);
  if md5(lifecycle_source) is distinct from 'a3855ca864dc46f2f53bb4b2f309e524'
    or has_function_privilege('authenticated','mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)','EXECUTE')
    or has_function_privilege('anon','public.mcpa_movement_action(text,jsonb,uuid)','EXECUTE') then
    raise exception 'Preflight: unreviewed custody engine or unsafe movement privileges. Review baseline compatibility before deployment.';
  end if;
end $$;

create table public.mcpa_b_return_items (
  movement_id text not null references public.mcpa_movements(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  asset_id text not null,
  source jsonb not null,
  outcome text not null default 'pending' check(outcome in ('pending','good','damaged','missing','disputed')),
  physically_received boolean not null default false,
  notes text not null default '' check(char_length(notes)<=2000),
  inspector_id uuid references public.profiles(id) on delete restrict,
  inspected_at timestamptz,
  finalized_movement_id text references public.mcpa_movements(id) on delete restrict,
  primary key(movement_id,equipment_id),
  check(physically_received=(outcome in ('good','damaged')))
);
create index mcpa_b_open_returns on public.mcpa_b_return_items(equipment_id) where outcome in ('pending','missing','disputed');
create table public.mcpa_b_retirements (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  asset_id text not null,
  disposition text not null check(disposition in ('sold','disposed')),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  effective_date date not null,
  status text not null default 'proposed' check(status in ('proposed','approved','rejected')),
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  approved_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_notes text,
  check(status<>'approved' or (approved_by is not null and approved_by<>proposed_by and decided_at is not null))
);
create unique index mcpa_b_retirement_open on public.mcpa_b_retirements(equipment_id) where status in ('proposed','approved');
create table public.mcpa_b_operations (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create table public.mcpa_b_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.mcpa_b_operations(id) on delete restrict,
  entity_id text not null,
  equipment_id uuid references public.equipment(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  details jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index mcpa_b_events_entity on public.mcpa_b_events(entity_id,created_at);
create table public.mcpa_b_evidence (
  id uuid primary key,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  uploader_id uuid not null references public.profiles(id) on delete restrict,
  phase text not null check(phase in ('submit_return','submit_transfer','accept_transfer','inspection','retirement')),
  target_id text,
  movement_id text references public.mcpa_movements(id) on delete restrict,
  retirement_id uuid references public.mcpa_b_retirements(id) on delete restrict,
  object_name text not null unique,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size bigint not null check(byte_size between 1 and 5242880),
  created_at timestamptz not null default clock_timestamp(),
  uploaded_at timestamptz,
  attached_at timestamptz,
  check(attached_at is null or (uploaded_at is not null and num_nonnulls(movement_id,retirement_id)=1))
);

-- New tables have no direct browser write grants. Readers use scoped RPCs.
do $$ declare t text; begin
  foreach t in array array['mcpa_b_return_items','mcpa_b_retirements','mcpa_b_operations','mcpa_b_events','mcpa_b_evidence'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

create function mcpa_auth_private.b_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Workstream B history is immutable.' using errcode='42501'; end $$;
create trigger mcpa_b_events_immutable before update or delete or truncate on public.mcpa_b_events for each statement execute function mcpa_auth_private.b_immutable();
create trigger mcpa_b_operations_immutable before update or delete or truncate on public.mcpa_b_operations for each statement execute function mcpa_auth_private.b_immutable();
create function mcpa_auth_private.b_retirement_history() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'UPDATE' then raise exception 'Retirement history cannot be removed.' using errcode='42501'; end if;
  if old.status<>'proposed' or new.status not in ('approved','rejected')
    or (to_jsonb(new)-array['status','approved_by','decided_at','decision_notes'])
      is distinct from (to_jsonb(old)-array['status','approved_by','decided_at','decision_notes']) then
    raise exception 'Retirement history is immutable.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger mcpa_b_retirement_history before update or delete on public.mcpa_b_retirements for each row execute function mcpa_auth_private.b_retirement_history();
create trigger mcpa_b_retirement_no_truncate before truncate on public.mcpa_b_retirements for each statement execute function mcpa_auth_private.b_immutable();

create function mcpa_auth_private.b_individual(e public.equipment) returns boolean language sql immutable set search_path='' as $$
  select coalesce(e.quantity,0)=1 and regexp_replace(lower(coalesce(e.tracking_type,'')),'[ _-]','','g') in ('individual','individualasset','serialized')
$$;
create function mcpa_auth_private.b_retired(asset uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.mcpa_b_retirements where equipment_id=asset and status='approved')
$$;
create function mcpa_auth_private.b_unresolved(asset uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.mcpa_movement_reservations where equipment_id=asset)
    or exists(select 1 from public.mcpa_b_return_items where equipment_id=asset and outcome in ('pending','missing','disputed'))
    or exists(select 1 from public.mcpa_movement_assets a join public.mcpa_movements m on m.id=a.movement_id
      where a.equipment_id=asset and (
        (m.kind='request' and m.data->>'status' in ('pending','approved','released'))
        or (m.kind='transfer' and m.data->>'status' in ('pending','refused'))
        or (m.kind='repair' and m.data->>'status' in ('reported','underrepair'))
        or (m.kind='missing' and m.data->>'status'='missing')))
$$;
create function mcpa_auth_private.b_eligible_retirement(e public.equipment) returns boolean language sql stable security definer set search_path='' as $$
  select mcpa_auth_private.b_individual(e) and e.current_holder_id is null
    and regexp_replace(lower(e.status::text),'[ _-]','','g') in ('available','repair')
    and not mcpa_auth_private.b_retired(e.id) and not mcpa_auth_private.b_unresolved(e.id)
$$;

-- Old browser forms cannot finalize NEW returns after this migration. Saved
-- historical return retries do not insert rows and continue to replay normally.
create function mcpa_auth_private.b_movement_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kind='return' and not (new.data @> '{"custodyVersion":2}'::jsonb)
    and not ((mcpa_auth_private.identity()).role='admin'
      and jsonb_array_length(new.data->'toolIds')>0
      and not exists(select 1 from jsonb_array_elements_text(new.data->'toolIds') asset
        where not exists(select 1 from public.mcpa_b_return_items i join public.mcpa_movements b on b.id=i.movement_id
          where i.asset_id=asset and b.actor_id=new.actor_id and b.destination_id=new.destination_id
            and i.outcome in ('good','damaged') and i.finalized_movement_id is null
            and i.inspector_id=(mcpa_auth_private.identity()).id)))
  then raise exception 'Submit this return through Admin inspection v2.' using errcode='42501'; end if;
  return new;
end $$;
create trigger mcpa_b_new_return_guard before insert on public.mcpa_movements for each row execute function mcpa_auth_private.b_movement_guard();

create function mcpa_auth_private.b_equipment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if mcpa_auth_private.b_retired(old.id) and
    (new.status is distinct from old.status or new.current_holder_id is distinct from old.current_holder_id
      or new.site_id is distinct from old.site_id or new.quantity is distinct from old.quantity
      or new.asset_id is distinct from old.asset_id) then
    raise exception 'Retired equipment cannot re-enter active custody.' using errcode='42501';
  end if;
  if exists(select 1 from public.mcpa_b_return_items where equipment_id=old.id and outcome in ('pending','missing','disputed'))
    and (new.current_holder_id is distinct from old.current_holder_id or new.site_id is distinct from old.site_id
      or new.status is distinct from old.status or new.quantity is distinct from old.quantity
      or new.asset_id is distinct from old.asset_id or new.condition is distinct from old.condition) then
    raise exception 'Resolve this asset through individual Admin return inspection.' using errcode='40001';
  end if;
  return new;
end $$;
create trigger mcpa_b_equipment_guard before update on public.equipment for each row execute function mcpa_auth_private.b_equipment_guard();
create function mcpa_auth_private.b_asset_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.equipment;
begin
  select * into e from public.equipment where id=new.equipment_id for update;
  if mcpa_auth_private.b_retired(e.id) or regexp_replace(lower(e.status::text),'[ _-]','','g') in ('sold','disposed','retired') then
    raise exception 'Retired equipment cannot enter a movement.' using errcode='40001';
  end if;
  if exists(select 1 from public.mcpa_movements where id=new.movement_id and kind='transfer')
    and not mcpa_auth_private.b_individual(e) then
    raise exception 'Transfers require allocated individual Asset IDs with quantity one.' using errcode='22023';
  end if;
  return new;
end $$;
create trigger mcpa_b_asset_guard before insert on public.mcpa_movement_assets for each row execute function mcpa_auth_private.b_asset_guard();

-- The incumbent repair engine restores AVAILABLE but leaves the descriptive
-- condition unchanged. Clear v2's recorded damage only on that engine's actual
-- repair completion, scoped to a repair generated by an accepted v2 return.
create function mcpa_auth_private.b_repair_completed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kind='repair' and old.data->>'status'='underrepair' and new.data->>'status'='completed' then
    update public.equipment eq set condition='Good'
      where eq.status::text='AVAILABLE' and eq.current_holder_id is null and exists(
        select 1 from public.mcpa_b_return_items item
        join public.mcpa_movement_assets link on link.equipment_id=item.equipment_id and link.movement_id=new.id
        where item.equipment_id=eq.id and item.outcome='damaged'
          and item.finalized_movement_id=new.data->>'sourceId' and item.asset_id=new.data->>'toolId');
  end if;
  return new;
end $$;
create trigger mcpa_b_repair_completed after update on public.mcpa_movements for each row execute function mcpa_auth_private.b_repair_completed();

-- Explicit asset lookup: QR possession never grants custody. Unknown and
-- unauthorized IDs share an error so the endpoint is not an inventory oracle.
create function public.mcpa_b_lookup(p_reference text,p_intent text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; e public.equipment; ref text;
begin
  p:=mcpa_auth_private.identity();
  if p.role not in ('engineer','architect') or p_intent is null or p_intent not in ('return','transfer') then
    raise exception 'Engineer or Architect movement access required.' using errcode='42501'; end if;
  ref:=btrim(p_reference);
  if ref like 'mcpa:asset:%' then ref:=substring(ref from 12); end if;
  if ref is null or char_length(ref) not between 1 and 120 or ref ~ '[[:cntrl:]]' then
    raise exception 'Scan a permanent Asset ID or enter it manually.' using errcode='22023'; end if;
  select * into e from public.equipment where asset_id=ref and current_holder_id=p.id;
  if not found then raise exception 'Asset unknown or outside your custody. Check the ID and current holder.' using errcode='42501'; end if;
  if not mcpa_auth_private.b_individual(e) then raise exception 'Select an allocated individual Asset ID, with quantity one.' using errcode='22023'; end if;
  if mcpa_auth_private.b_retired(e.id) or regexp_replace(lower(e.status::text),'[ _-]','','g')<>'inuse'
    or mcpa_auth_private.b_unresolved(e.id)
    or (p_intent='transfer' and regexp_replace(lower(coalesce(e.condition,'')),'[ _-]','','g') in ('damaged','missing','lost','repair','underrepair')) then
    raise exception 'Asset unavailable, disputed, retired or already in an unresolved movement.' using errcode='40001'; end if;
  return jsonb_build_object('id',e.asset_id,'dbId',e.id,'name',e.name,'siteId',e.site_id,'holderId',e.current_holder_id);
end $$;

create function mcpa_auth_private.b_can_retirement(r public.mcpa_b_retirements,p public.profiles) returns boolean language sql stable security definer set search_path='' as $$
  select p.role='admin' or (p.role in ('engineer','architect') and r.status='approved' and exists(
    select 1 from public.mcpa_movement_assets a join public.mcpa_movements m on m.id=a.movement_id
    where a.equipment_id=r.equipment_id and (m.actor_id=p.id or m.receiver_id=p.id)))
$$;

-- Evidence authorization is reevaluated at staging, upload, and final linking.
create function mcpa_auth_private.b_evidence_allowed(p public.profiles,asset uuid,phase text,target text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if phase in ('submit_return','submit_transfer') then
    return p.role in ('engineer','architect') and exists(select 1 from public.equipment e where e.id=asset
      and e.current_holder_id=p.id and mcpa_auth_private.b_individual(e)
      and not mcpa_auth_private.b_retired(e.id) and not mcpa_auth_private.b_unresolved(e.id)
      and regexp_replace(lower(e.status::text),'[ _-]','','g')='inuse');
  elsif phase='accept_transfer' then
    return p.role in ('engineer','architect') and exists(select 1 from public.mcpa_movements m
      join public.mcpa_movement_assets a on a.movement_id=m.id where m.id=target and m.kind='transfer'
      and m.receiver_id=p.id and m.data->>'status'='pending' and a.equipment_id=asset);
  elsif phase='inspection' then
    return p.role='admin' and exists(select 1 from public.mcpa_b_return_items where movement_id=target
      and equipment_id=asset and outcome in ('pending','missing','disputed'));
  elsif phase='retirement' then
    return p.role='admin' and exists(select 1 from public.mcpa_b_retirements where id::text=target and equipment_id=asset and status='proposed');
  end if;
  return false;
end $$;

create function public.mcpa_b_evidence_action(p_action text,p_payload jsonb,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; ticket public.mcpa_b_evidence; e public.equipment; suffix text; obj storage.objects;
begin
  p:=mcpa_auth_private.identity();
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192 then
    raise exception 'Supply a valid evidence operation.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(672341,2026);
  if p_action='stage' then
    select * into e from public.equipment where asset_id=p_payload->>'assetId' for update;
    suffix:=case p_payload->>'mimeType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
    if suffix is null or coalesce((p_payload->>'byteSize')::bigint,0) not between 1 and 5242880 then
      raise exception 'Use JPEG, PNG or WebP photos up to 5 MiB.' using errcode='22023'; end if;
    select * into ticket from public.mcpa_b_evidence where id=p_operation_id;
    if found then
      if ticket.uploader_id<>p.id or ticket.equipment_id<>e.id or ticket.phase is distinct from p_payload->>'phase'
        or ticket.target_id is distinct from p_payload->>'targetId' or ticket.mime_type<>p_payload->>'mimeType'
        or ticket.byte_size<>(p_payload->>'byteSize')::bigint then
        raise exception 'Evidence operation already used with different values.' using errcode='40001'; end if;
    else
      if e.id is null or not mcpa_auth_private.b_evidence_allowed(p,e.id,p_payload->>'phase',p_payload->>'targetId') then
        raise exception 'Evidence is not permitted for this asset or workflow.' using errcode='42501'; end if;
      insert into public.mcpa_b_evidence(id,equipment_id,uploader_id,phase,target_id,object_name,mime_type,byte_size)
        values(p_operation_id,e.id,p.id,p_payload->>'phase',p_payload->>'targetId',p.id::text||'/'||p_operation_id::text||'.'||suffix,
          p_payload->>'mimeType',(p_payload->>'byteSize')::bigint) returning * into ticket;
    end if;
  elsif p_action='complete' then
    select * into ticket from public.mcpa_b_evidence where id=p_operation_id and uploader_id=p.id for update;
    if not found then raise exception 'Evidence upload not found.' using errcode='42501'; end if;
    if ticket.uploaded_at is null then
      if not mcpa_auth_private.b_evidence_allowed(p,ticket.equipment_id,ticket.phase,ticket.target_id) then
        raise exception 'Evidence workflow has changed. Refresh before uploading.' using errcode='40001'; end if;
      select * into obj from storage.objects where bucket_id='mcpa-movement-evidence-v2' and name=ticket.object_name for share;
      if not found or obj.metadata->>'mimetype' is distinct from ticket.mime_type
        or (obj.metadata->>'size')::bigint is distinct from ticket.byte_size then
        raise exception 'Upload is incomplete or metadata differs. Retry the photo upload.' using errcode='22023'; end if;
      update public.mcpa_b_evidence set uploaded_at=clock_timestamp() where id=ticket.id returning * into ticket;
    end if;
  else raise exception 'Unknown evidence action.' using errcode='22023'; end if;
  return jsonb_build_object('id',ticket.id,'objectName',ticket.object_name,'uploadedAt',ticket.uploaded_at);
end $$;

create function mcpa_auth_private.b_attach(p public.profiles,ids jsonb,assets uuid[],phase text,target text,retirement boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; ticket public.mcpa_b_evidence;
begin
  if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)>20
    or (select count(distinct value) from jsonb_array_elements(ids))<>jsonb_array_length(ids) then
    raise exception 'Choose up to 20 distinct uploaded photos.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(ids) loop
    select * into ticket from public.mcpa_b_evidence where id=(item#>>'{}')::uuid for update;
    if not found or ticket.uploader_id<>p.id or ticket.uploaded_at is null or ticket.attached_at is not null
      or ticket.phase<>phase or not(ticket.equipment_id=any(assets))
      or (phase in ('inspection','accept_transfer','retirement') and ticket.target_id is distinct from target)
      or not exists(select 1 from storage.objects where bucket_id='mcpa-movement-evidence-v2' and name=ticket.object_name) then
      raise exception 'A photo is missing, already linked or not authorized for this asset.' using errcode='42501'; end if;
    update public.mcpa_b_evidence set attached_at=clock_timestamp(),
      movement_id=case when not retirement then target end,
      retirement_id=case when retirement then target::uuid end where id=ticket.id;
  end loop;
end $$;

create function public.mcpa_b_action(p_action text,p_payload jsonb,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.profiles; sender public.profiles; office public.sites; dest public.sites; recipient public.profiles;
  oldop public.mcpa_b_operations; batch public.mcpa_movements; r public.mcpa_b_retirements;
  e public.equipment; i public.mcpa_b_return_items; x jsonb; result jsonb; payload jsonb;
  assets uuid[]; ids jsonb; checks jsonb; source jsonb; evidence jsonb:=coalesce(p_payload->'evidenceIds','[]'::jsonb);
  entity text; phase text; final_result jsonb; accepted uuid[]:='{}'; n integer; now_at timestamptz:=clock_timestamp();
begin
  p:=mcpa_auth_private.identity();
  perform 1 from public.profiles where id=p.id for share;
  p:=mcpa_auth_private.identity();
  if p.role not in ('admin','engineer','architect') then raise exception 'Custody access required.' using errcode='42501'; end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072
    or char_length(coalesce(p_payload->>'notes',''))>2000 then
    raise exception 'Supply a valid operation and notes up to 2000 characters.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(672341,2026);
  select * into oldop from public.mcpa_b_operations where id=p_operation_id;
  if found then
    if oldop.actor_id<>p.id or oldop.action is distinct from p_action or oldop.payload is distinct from p_payload then
      raise exception 'Operation already saved with different values or identity.' using errcode='40001'; end if;
    return oldop.result;
  end if;
  if exists(select 1 from public.mcpa_movement_operations where id=p_operation_id) then
    raise exception 'Operation ID belongs to an existing movement. Use a new operation.' using errcode='40001'; end if;

  if p_action in ('submitReturn','createTransfer') then
    if p.role not in ('engineer','architect') then raise exception 'Current Engineer or Architect custodian required.' using errcode='42501'; end if;
    ids:=p_payload->'assetIds';
    if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) not between 1 and 100
      or exists(select 1 from jsonb_array_elements(ids) v where jsonb_typeof(v)<>'string')
      or (select count(distinct value) from jsonb_array_elements(ids))<>jsonb_array_length(ids) then
      raise exception 'Choose 1 to 100 distinct permanent Asset IDs.' using errcode='22023'; end if;
    select array_agg(id order by id) into assets from public.equipment where asset_id in (select jsonb_array_elements_text(ids));
    if coalesce(cardinality(assets),0)<>jsonb_array_length(ids) then raise exception 'Asset unknown or outside your custody.' using errcode='42501'; end if;
    perform 1 from public.equipment where id=any(assets) order by id for update;
    for e in select * from public.equipment where id=any(assets) loop
      perform public.mcpa_b_lookup(e.asset_id,case when p_action='submitReturn' then 'return' else 'transfer' end);
    end loop;
    if p_action='submitReturn' then
      office:=mcpa_auth_private.office_return_site();
      if (p_payload->>'destinationId')::uuid is distinct from office.id then
        raise exception 'Select the configured Office as the return destination.' using errcode='22023'; end if;
      entity:='RTI-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
      select jsonb_agg(jsonb_build_object('toolId',asset_id,'siteId',site_id,'holderId',current_holder_id,'dbStatus',status::text,'qty',quantity,'condition',condition) order by asset_id)
        into source from public.equipment where id=any(assets);
      result:=jsonb_build_object('id',entity,'custodyVersion',2,'status','pendingInspection','toolIds',ids,'source',source,
        'destinationId',office.id,'destination',office.name,'returnedBy',p.name,'notes',coalesce(p_payload->>'notes',''),'createdAt',now_at);
      insert into public.mcpa_movements(id,kind,data,actor_id,destination_id) values(entity,'return',result,p.id,office.id);
      insert into public.mcpa_movement_assets select entity,unnest(assets);
      insert into public.mcpa_movement_sites select entity,site_id from public.equipment where id=any(assets) and site_id is not null union select entity,office.id;
      insert into public.mcpa_b_return_items(movement_id,equipment_id,asset_id,source)
        select entity,eq.id,eq.asset_id,s from public.equipment eq cross join jsonb_array_elements(source) s where eq.id=any(assets) and s->>'toolId'=eq.asset_id;
      insert into public.mcpa_movement_reservations select unnest(assets),entity;
      phase:='submit_return';
    else
      if (p_payload->>'receiverId')::uuid=p.id then raise exception 'Select another receiving custodian.' using errcode='22023'; end if;
      select * into dest from public.sites where id=(p_payload->>'destinationId')::uuid for share;
      if dest.id is null then raise exception 'Select an active destination.' using errcode='22023'; end if;
      payload:=jsonb_build_object('toolIds',ids,'receiverId',p_payload->>'receiverId','destination',dest.name,'notes',coalesce(p_payload->>'notes',''));
      result:=public.mcpa_movement_action('createTransfer',payload,p_operation_id);
      entity:=result->>'id'; phase:='submit_transfer';
    end if;
    perform mcpa_auth_private.b_attach(p,evidence,assets,phase,entity);

  elsif p_action='receiveTransfer' then
    select * into batch from public.mcpa_movements where id=p_payload->>'id' for update;
    if batch.id is null or batch.kind<>'transfer' or batch.receiver_id is distinct from p.id
      or p.role not in ('engineer','architect') or batch.data->>'status'<>'pending' then
      raise exception 'Only the named recipient can accept a pending transfer.' using errcode='42501'; end if;
    select array_agg(equipment_id order by equipment_id) into assets from public.mcpa_movement_assets where movement_id=batch.id;
    perform 1 from public.equipment where id=any(assets) order by id for update;
    if exists(select 1 from public.equipment eq where eq.id=any(assets) and (not mcpa_auth_private.b_individual(eq) or mcpa_auth_private.b_retired(eq.id))) then
      raise exception 'Receive only active individual Asset IDs.' using errcode='40001'; end if;
    checks:=p_payload->'inspections';
    -- Require physical receipt of every unit; lost/unreceived units must use the
    -- incumbent refusal/cancellation flow and never finalize sender custody.
    if jsonb_typeof(checks) is distinct from 'array' or exists(select 1 from jsonb_array_elements(checks) c
      where coalesce(c->>'condition','') not in ('good','damaged') or c->'tested' is distinct from 'true'::jsonb
        or c->'physicallyReceived' is distinct from 'true'::jsonb) then
      raise exception 'Physically verify and test every item, or refuse the handover for sender follow-up.' using errcode='22023'; end if;
    result:=public.mcpa_movement_action('receiveTransfer',jsonb_build_object('id',batch.id,'inspections',checks),p_operation_id);
    entity:=batch.id;
    perform mcpa_auth_private.b_attach(p,evidence,assets,'accept_transfer',entity);

  elsif p_action='inspectReturn' then
    if p.role<>'admin' then raise exception 'Admin inspection required.' using errcode='42501'; end if;
    select * into batch from public.mcpa_movements where id=p_payload->>'id' and kind='return' for update;
    if batch.id is null or not (batch.data @> '{"custodyVersion":2}'::jsonb) then raise exception 'Inspection batch not found.' using errcode='22023'; end if;
    checks:=p_payload->'inspections';
    if jsonb_typeof(checks) is distinct from 'array' or jsonb_array_length(checks) not between 1 and 100
      or (select count(distinct c->>'assetId') from jsonb_array_elements(checks) c)<>jsonb_array_length(checks) then
      raise exception 'Inspect each selected Asset ID once.' using errcode='22023'; end if;
    select array_agg(equipment_id order by equipment_id) into assets from public.mcpa_b_return_items
      where movement_id=batch.id and asset_id in (select c->>'assetId' from jsonb_array_elements(checks) c);
    if coalesce(cardinality(assets),0)<>jsonb_array_length(checks) then raise exception 'Inspection contains assets outside this batch.' using errcode='22023'; end if;
    perform 1 from public.equipment where id=any(assets) order by id for update;
    select * into sender from public.profiles where id=batch.actor_id for share;
    office:=mcpa_auth_private.office_return_site();
    if office.id is distinct from batch.destination_id then raise exception 'Office configuration changed. Review the pending return.' using errcode='40001'; end if;
    for x in select value from jsonb_array_elements(checks) loop
      select * into i from public.mcpa_b_return_items where movement_id=batch.id and asset_id=x->>'assetId' for update;
      select * into e from public.equipment where id=i.equipment_id;
      if i.outcome not in ('pending','missing','disputed') or mcpa_auth_private.b_retired(e.id)
        or e.current_holder_id::text is distinct from i.source->>'holderId' or e.site_id::text is distinct from i.source->>'siteId'
        or e.asset_id<>i.asset_id or e.status::text is distinct from i.source->>'dbStatus'
        or to_jsonb(e.quantity) is distinct from i.source->'qty'
        or not exists(select 1 from public.mcpa_movement_reservations where equipment_id=e.id and movement_id=batch.id) then
        raise exception 'Asset custody or inspection changed. Refresh the batch.' using errcode='40001'; end if;
      if coalesce(x->>'outcome','') not in ('good','damaged','missing','disputed')
        or jsonb_typeof(x->'physicallyReceived') is distinct from 'boolean'
        or (x->>'physicallyReceived')::boolean is distinct from (x->>'outcome' in ('good','damaged'))
        or char_length(coalesce(x->>'notes',''))>2000
        or (x->>'outcome'<>'good' and nullif(btrim(x->>'notes'),'') is null) then
        raise exception 'Record receipt, condition and notes for every damaged, missing or disputed unit.' using errcode='22023'; end if;
      update public.mcpa_b_return_items set outcome=x->>'outcome',physically_received=(x->>'physicallyReceived')::boolean,
        notes=coalesce(x->>'notes',''),inspector_id=p.id,inspected_at=now_at where movement_id=i.movement_id and equipment_id=i.equipment_id;
      if x->>'outcome' in ('good','damaged') then accepted:=array_append(accepted,e.id); end if;
    end loop;
    if cardinality(accepted)>0 then
      delete from public.mcpa_movement_reservations where movement_id=batch.id and equipment_id=any(accepted);
      select jsonb_agg(asset_id order by asset_id),jsonb_agg(jsonb_build_object('toolId',asset_id,'condition',outcome,'notes',notes) order by asset_id)
        into ids,checks from public.mcpa_b_return_items where movement_id=batch.id and equipment_id=any(accepted);
      -- All authority is checked above. The existing private engine receives the
      -- original custodian for its established custody validation and audit.
      final_result:=mcpa_auth_private.mcpa_movement_action('createReturn',jsonb_build_object('toolIds',ids,'conditions',checks,
        'destination',office.name,'notes','Admin verified return batch '||batch.id,
        'actor',jsonb_build_object('id',sender.id,'name',sender.name,'role','engineer')),gen_random_uuid());
      update public.mcpa_movements set data=data||jsonb_build_object('inspectionBatchId',batch.id,'inspectedById',p.id,'custodyVersion',2) where id=final_result->>'id';
      update public.mcpa_b_return_items set finalized_movement_id=final_result->>'id' where movement_id=batch.id and equipment_id=any(accepted);
      update public.equipment set current_holder_id=null,condition=case when id in(select equipment_id from public.mcpa_b_return_items where movement_id=batch.id and outcome='damaged') then 'Damaged' else 'Good' end
        where id=any(accepted);
    end if;
    select count(*) into n from public.mcpa_b_return_items where movement_id=batch.id and outcome in ('pending','missing','disputed');
    result:=batch.data||jsonb_build_object('status',case when n=0 then 'completed' else 'partialInspection' end,'updatedAt',now_at,'unresolvedCount',n);
    update public.mcpa_movements set data=result where id=batch.id;
    entity:=batch.id;
    perform mcpa_auth_private.b_attach(p,evidence,assets,'inspection',entity);

  elsif p_action='proposeRetirement' then
    if p.role<>'admin' then raise exception 'Admin retirement proposal required.' using errcode='42501'; end if;
    select * into e from public.equipment where asset_id=p_payload->>'assetId' for update;
    if e.id is null or not mcpa_auth_private.b_eligible_retirement(e) then
      raise exception 'Retirement requires an unheld individual asset with no unresolved movements.' using errcode='40001'; end if;
    if coalesce(p_payload->>'disposition','') not in ('sold','disposed') or nullif(btrim(p_payload->>'reason'),'') is null
      or char_length(p_payload->>'reason')>2000 or (p_payload->>'effectiveDate')::date is null
      or (p_payload->>'effectiveDate')::date>(current_timestamp at time zone 'Asia/Manila')::date then
      raise exception 'Record Sold or Disposed, a reason, and a date no later than today.' using errcode='22023'; end if;
    insert into public.mcpa_b_retirements(equipment_id,asset_id,disposition,reason,effective_date,proposed_by)
      values(e.id,e.asset_id,p_payload->>'disposition',btrim(p_payload->>'reason'),(p_payload->>'effectiveDate')::date,p.id) returning * into r;
    entity:=r.id::text; result:=to_jsonb(r);

  elsif p_action='attachRetirementEvidence' then
    if p.role<>'admin' then raise exception 'Admin retirement access required.' using errcode='42501'; end if;
    select * into r from public.mcpa_b_retirements where id=(p_payload->>'id')::uuid and status='proposed' for update;
    if r.id is null then raise exception 'Retirement proposal no longer accepts evidence.' using errcode='40001'; end if;
    perform mcpa_auth_private.b_attach(p,evidence,array[r.equipment_id],'retirement',r.id::text,true);
    entity:=r.id::text;result:=to_jsonb(r);

  elsif p_action in ('approveRetirement','rejectRetirement') then
    if p.role<>'admin' then raise exception 'Admin retirement approval required.' using errcode='42501'; end if;
    select * into r from public.mcpa_b_retirements where id=(p_payload->>'id')::uuid for update;
    if r.id is null or r.status<>'proposed' then raise exception 'Retirement proposal already decided or missing.' using errcode='40001'; end if;
    if r.proposed_by=p.id then raise exception 'A different active Admin must decide this proposal.' using errcode='42501'; end if;
    select * into e from public.equipment where id=r.equipment_id for update;
    if p_action='approveRetirement' then
      if not mcpa_auth_private.b_eligible_retirement(e) or e.asset_id<>r.asset_id then
        raise exception 'Custody or unresolved movements now prevent retirement.' using errcode='40001'; end if;
      update public.equipment set status='DISPOSED' where id=e.id;
    elsif nullif(btrim(p_payload->>'notes'),'') is null then raise exception 'Record a rejection reason.' using errcode='22023'; end if;
    perform mcpa_auth_private.b_attach(p,evidence,array[e.id],'retirement',r.id::text,true);
    update public.mcpa_b_retirements set status=case when p_action='approveRetirement' then 'approved' else 'rejected' end,
      approved_by=p.id,decided_at=now_at,decision_notes=coalesce(p_payload->>'notes','') where id=r.id returning * into r;
    entity:=r.id::text; result:=to_jsonb(r);

  elsif p_action='reportRetirementIssue' then
    select * into r from public.mcpa_b_retirements where id=(p_payload->>'id')::uuid;
    if r.id is null or not mcpa_auth_private.b_can_retirement(r,p) or nullif(btrim(p_payload->>'notes'),'') is null then
      raise exception 'Choose a permitted retirement and describe the issue.' using errcode='42501'; end if;
    entity:=r.id::text; result:=jsonb_build_object('id',entity,'reported',true);
  else raise exception 'Unknown custody action.' using errcode='22023'; end if;

  insert into public.mcpa_b_operations(id,actor_id,action,payload,result) values(p_operation_id,p.id,p_action,p_payload,result);
  insert into public.mcpa_b_events(operation_id,entity_id,actor_id,action,details)
    values(p_operation_id,entity,p.id,p_action,p_payload);
  if p_action in ('submitReturn','inspectReturn') then
    insert into public.mcpa_movement_operations(id,action,payload,result,activity) values(p_operation_id,'b_'||p_action,p_payload,result,
      jsonb_build_object('id',p_operation_id,'entityId',entity,'actor',p.name,'actorId',p.id,'role',p.role,'action',p_action,
        'summary',case when p_action='submitReturn' then 'Return awaits individual Admin inspection' else 'Admin recorded individual return inspection' end,'createdAt',now_at));
  end if;
  -- Explicit own-recipient notifications for retirement actions; existing
  -- operation triggers deliver movement and pending-return Admin notifications.
  if p_action in ('proposeRetirement','approveRetirement','rejectRetirement','reportRetirementIssue') then
    insert into public.mcpa_notifications(recipient_id,kind,entity_id,dedupe_key,title,message,data)
      select id,'movement',entity,'custody-v2:'||p_operation_id::text,
        case when p_action='reportRetirementIssue' then 'Retirement issue reported' else 'Equipment retirement review' end,
        coalesce(nullif(p_payload->>'notes',''),nullif(p_payload->>'reason',''),'Retirement decision recorded.'),
        jsonb_build_object('route','asset-retirement-v2','action',p_action)
      from public.profiles where role='admin' and account_status='active' and auth_user_id is not null and id<>p.id
      on conflict(recipient_id,dedupe_key) do nothing;
  end if;
  return result;
end $$;

-- Scoped module snapshot. Uses the incumbent movement visibility for transfers,
-- but return evidence and inspection notes belong only to the sender and Admin.
create function public.mcpa_b_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  p:=mcpa_auth_private.identity();
  if p.role not in ('admin','engineer','architect') then raise exception 'Custody access required.' using errcode='42501'; end if;
  return jsonb_build_object('version',2,'profile',jsonb_build_object('id',p.id,'name',p.name,'role',p.role),
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',e.asset_id,'dbId',e.id,'name',e.name,'holderId',e.current_holder_id,
      'siteId',e.site_id,'status',e.status::text,'individual',mcpa_auth_private.b_individual(e),'movementLock',mcpa_auth_private.inventory_lock(e.id)) order by e.asset_id)
      from public.equipment e where p.role='admin' or e.current_holder_id=p.id),'[]'::jsonb),
    'sites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'assignedEngineerId',assigned_engineer_id)) from public.sites where is_active),'[]'::jsonb),
    'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.profiles where account_status='active' and auth_user_id is not null and role in ('engineer','architect')),'[]'::jsonb),
    'returnDestination',(select jsonb_build_object('id',s.id,'name',s.name) from mcpa_auth_private.return_office c join public.sites s on s.id=c.site_id where c.singleton and s.is_active),
    'returns',coalesce((select jsonb_agg(m.data||jsonb_build_object('actorId',m.actor_id,'items',
      (select jsonb_agg(to_jsonb(i) order by i.asset_id) from public.mcpa_b_return_items i where i.movement_id=m.id)) order by m.created_at desc)
      from public.mcpa_movements m where m.kind='return' and m.data @> '{"custodyVersion":2}'::jsonb
        and exists(select 1 from public.mcpa_b_return_items where movement_id=m.id) and (p.role='admin' or m.actor_id=p.id)),'[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(m.data||jsonb_build_object('actorId',m.actor_id) order by m.created_at desc) from public.mcpa_movements m
      where m.kind='transfer' and (p.role='admin' or m.actor_id=p.id or m.receiver_id=p.id)),'[]'::jsonb),
    'retirements',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('equipmentName',e.name) order by r.created_at desc) from public.mcpa_b_retirements r
      join public.equipment e on e.id=r.equipment_id where mcpa_auth_private.b_can_retirement(r,p)),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc) from public.mcpa_b_events v where p.role='admin'
      or v.actor_id=p.id or exists(select 1 from public.mcpa_movements m where m.id=v.entity_id and (m.actor_id=p.id or m.receiver_id=p.id))
      or exists(select 1 from public.mcpa_b_retirements r where r.id::text=v.entity_id and mcpa_auth_private.b_can_retirement(r,p))),'[]'::jsonb),
    'evidence',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at) from public.mcpa_b_evidence v where v.attached_at is not null and (
      p.role='admin' or exists(select 1 from public.mcpa_movements m where m.id=v.movement_id and (m.actor_id=p.id or m.receiver_id=p.id))
      or exists(select 1 from public.mcpa_b_retirements r where r.id=v.retirement_id and mcpa_auth_private.b_can_retirement(r,p)))),'[]'::jsonb));
end $$;

-- Separate private bucket; refuse collisions instead of editing an existing one.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mcpa-movement-evidence-v2','mcpa-movement-evidence-v2',false,5242880,array['image/jpeg','image/png','image/webp']);
create function public.mcpa_b_storage_allowed(p_name text,p_mode text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; t public.mcpa_b_evidence;
begin
  p:=mcpa_auth_private.identity();
  if p.role not in ('admin','engineer','architect') then return false; end if;
  select * into t from public.mcpa_b_evidence where object_name=p_name;
  if not found then return false; end if;
  if p_mode='insert' then return t.uploader_id=p.id and t.uploaded_at is null and t.attached_at is null
    and t.created_at>clock_timestamp()-interval '24 hours' and mcpa_auth_private.b_evidence_allowed(p,t.equipment_id,t.phase,t.target_id);
  elsif p_mode='delete' then return t.uploader_id=p.id and t.attached_at is null;
  elsif p_mode='read' then
    return t.uploader_id=p.id or (t.attached_at is not null and (p.role='admin'
      or exists(select 1 from public.mcpa_movements m where m.id=t.movement_id and (m.actor_id=p.id or m.receiver_id=p.id))
      or exists(select 1 from public.mcpa_b_retirements r where r.id=t.retirement_id and mcpa_auth_private.b_can_retirement(r,p))));
  end if;
  return false;
exception when insufficient_privilege then return false;
end $$;
create policy mcpa_b_evidence_insert on storage.objects for insert to authenticated
  with check(bucket_id='mcpa-movement-evidence-v2' and public.mcpa_b_storage_allowed(name,'insert'));
create policy mcpa_b_evidence_read on storage.objects for select to authenticated
  using(bucket_id='mcpa-movement-evidence-v2' and public.mcpa_b_storage_allowed(name,'read'));
create policy mcpa_b_evidence_delete on storage.objects for delete to authenticated
  using(bucket_id='mcpa-movement-evidence-v2' and public.mcpa_b_storage_allowed(name,'delete'));
-- Restrictive policies prevent unrelated permissive Storage policies OR-ing
-- around this bucket's rules. Other buckets retain their original behavior.
create policy mcpa_b_evidence_insert_fence on storage.objects as restrictive for insert to public
  with check(bucket_id<>'mcpa-movement-evidence-v2' or public.mcpa_b_storage_allowed(name,'insert'));
create policy mcpa_b_evidence_read_fence on storage.objects as restrictive for select to public
  using(bucket_id<>'mcpa-movement-evidence-v2' or public.mcpa_b_storage_allowed(name,'read'));
create policy mcpa_b_evidence_delete_fence on storage.objects as restrictive for delete to public
  using(bucket_id<>'mcpa-movement-evidence-v2' or public.mcpa_b_storage_allowed(name,'delete'));
create policy mcpa_b_evidence_no_update on storage.objects as restrictive for update to public
  using(bucket_id<>'mcpa-movement-evidence-v2') with check(bucket_id<>'mcpa-movement-evidence-v2');

-- Revoke only new functions. Never change privileges on incumbent functions.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='mcpa_auth_private' and p.proname like 'b\_%' escape '\')
      or (n.nspname='public' and p.proname like 'mcpa\_b\_%' escape '\') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function public.mcpa_b_action(text,jsonb,uuid),public.mcpa_b_snapshot(),public.mcpa_b_lookup(text,text),
  public.mcpa_b_evidence_action(text,jsonb,uuid),public.mcpa_b_storage_allowed(text,text) to authenticated;
notify pgrst,'reload schema';
commit;

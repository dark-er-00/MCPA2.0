-- Workstream A. REVIEW ONLY / UNAPPLIED. Additive request metadata; existing
-- equipment reservations and consumable stock/movement tables remain authoritative.
-- Requires all reviewed migrations through 202610240001_equipment_import.sql.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$ begin
  if to_regprocedure('mcpa_auth_private.inventory_lock(uuid)') is null
    or to_regprocedure('public.mcpa_import_equipment(uuid,jsonb)') is null
    or to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)') is null
    or to_regclass('public.consumable_archive_events') is null then
    raise exception 'Install reviewed auth, verified inventory, consumables archive and import prerequisites first.';
  end if;
  if exists(select 1 from pg_class where oid in ('public.equipment'::regclass,'public.profiles'::regclass,'public.sites'::regclass,
      'public.mcpa_movement_reservations'::regclass,'public.consumables'::regclass,'public.consumable_stock_movements'::regclass) and not relrowsecurity) then
    raise exception 'Authoritative inventory, identity and stock tables must retain enabled RLS.';
  end if;
end $$;

create table public.mcpa_wa_operations (
  id uuid primary key, actor_id uuid not null references public.profiles(id),
  action text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create table public.mcpa_wa_equipment_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id), site_id uuid not null references public.sites(id),
  type_id text not null, type_name text not null,
  requested_quantity integer not null check(requested_quantity between 1 and 100),
  approved_quantity integer not null default 0 check(approved_quantity>=0 and approved_quantity<=requested_quantity),
  purpose text not null default '' check(char_length(purpose)<=2000),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  rejection_reason text, movement_id text unique references public.mcpa_movements(id),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  check((status='pending' and approved_quantity=0 and movement_id is null) or
    (status='approved' and approved_quantity=requested_quantity and movement_id is not null) or
    (status='rejected' and approved_quantity=0 and movement_id is null and char_length(btrim(rejection_reason)) between 1 and 2000))
);
-- Existing consumable_requests describe procurement receipts. These distinct
-- outbound request headers/lines reference existing SKUs, never another stock table.
create table public.mcpa_wa_material_requests (
  id uuid primary key default gen_random_uuid(), request_number bigint generated always as identity unique,
  requester_id uuid not null references public.profiles(id), site_id uuid not null references public.sites(id),
  purpose text not null default '' check(char_length(purpose)<=2000),
  status text not null default 'pending' check(status in ('pending','approved','rejected','partial','issued')),
  note text not null default '' check(char_length(note)<=2000),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table public.mcpa_wa_material_items (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.mcpa_wa_material_requests(id),
  consumable_id uuid not null references public.consumables(id), item_name text not null, item_code text,
  category text, specification text, unit text not null,
  requested_quantity numeric(12,3) not null check(requested_quantity>0 and requested_quantity<1000000000),
  approved_quantity numeric(12,3) not null default 0 check(approved_quantity>=0 and approved_quantity<=requested_quantity),
  unique(request_id,consumable_id)
);
create table public.mcpa_wa_material_issues (
  id uuid primary key default gen_random_uuid(), operation_id uuid not null references public.mcpa_wa_operations(id) deferrable initially deferred,
  item_id uuid not null references public.mcpa_wa_material_items(id),
  stock_movement_id uuid not null unique references public.consumable_stock_movements(id),
  issued_at timestamptz not null, issued_by_id uuid not null references public.profiles(id),
  unique(operation_id,item_id)
);
create table public.mcpa_wa_import_operations (
  operation_id uuid primary key references public.mcpa_equipment_imports(operation_id),
  actor_id uuid not null references public.profiles(id), payload_digest text not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index mcpa_wa_equipment_requester on public.mcpa_wa_equipment_requests(requester_id,created_at desc);
create index mcpa_wa_material_requester on public.mcpa_wa_material_requests(requester_id,created_at desc);
create index mcpa_wa_material_items_request on public.mcpa_wa_material_items(request_id);
create index mcpa_wa_material_issues_item on public.mcpa_wa_material_issues(item_id,issued_at);

create function mcpa_auth_private.wa_actor(roles text[])
returns public.profiles language plpgsql security definer set search_path='' as $$
declare actor public.profiles;
begin
  actor:=mcpa_auth_private.identity();
  perform 1 from public.profiles where id=actor.id for share;
  actor:=mcpa_auth_private.identity();
  if (actor.role=any(roles)) is distinct from true then raise exception 'This action is not permitted for your account.' using errcode='42501'; end if;
  return actor;
end $$;
create function mcpa_auth_private.wa_replay(operation uuid,actor uuid,action_name text,body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.mcpa_wa_operations;
begin
  if operation is null or octet_length(body::text)>131072 then raise exception 'Valid operation and bounded payload required.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('mcpa:wa:operation:'||operation::text,0));
  select * into receipt from public.mcpa_wa_operations where id=operation;
  if found then
    if receipt.actor_id<>actor or receipt.action<>action_name or receipt.payload<>body then
      raise exception 'Operation already belongs to different values or account.' using errcode='22023';
    end if;
    return receipt.result;
  end if;
  return null;
end $$;
create function mcpa_auth_private.wa_site(site uuid,actor public.profiles)
returns public.sites language plpgsql security definer set search_path='' as $$
declare destination public.sites;
begin
  select * into destination from public.sites where id=site for share;
  if destination.id is null or not destination.is_active or destination.archived_at is not null
    or (actor.role in ('engineer','architect') and destination.assigned_engineer_id is distinct from actor.id) then
    raise exception 'Choose an active project assigned to your account.' using errcode='42501';
  end if;
  return destination;
end $$;

-- Exact metadata equality is deliberately conservative: no fuzzy name grouping.
-- Serial number is per physical item and therefore excluded from compatibility.
create function mcpa_auth_private.wa_equipment_type(e public.equipment)
returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(jsonb_build_array(e.name,e.category,e.brand,e.model,e.details,e.condition,e.tracking_type,e.unit)::text,'UTF8')),'hex')
$$;
create function mcpa_auth_private.wa_equipment_available(e public.equipment)
returns boolean language sql stable security definer set search_path='' as $$
  select e.quantity>0 and e.current_holder_id is null
    and regexp_replace(lower(e.status::text),'[ _-]','','g') in ('available','inoffice')
    and regexp_replace(lower(coalesce(e.condition,'')),'[ _-]','','g') not in ('damaged','repair','underrepair','missing','lost')
    and mcpa_auth_private.inventory_lock(e.id) is null
$$;
create function mcpa_auth_private.wa_equipment_request(request uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(r)||jsonb_build_object('site_name',s.name,'requester_name',p.name,
    'status',coalesce(m.data->>'status',r.status),
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'asset_id',e.asset_id) order by e.asset_id)
      from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id where a.movement_id=r.movement_id),'[]'::jsonb))
  from public.mcpa_wa_equipment_requests r join public.sites s on s.id=r.site_id join public.profiles p on p.id=r.requester_id
    left join public.mcpa_movements m on m.id=r.movement_id where r.id=request
$$;
create function public.mcpa_wa_equipment_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; result jsonb;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin','engineer','architect']);
  select jsonb_build_object('profile',jsonb_build_object('id',actor.id,'name',actor.name,'role',actor.role),
    'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from public.sites s
      where s.is_active and s.archived_at is null and (actor.role='admin' or s.assigned_engineer_id=actor.id)),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(g order by g->>'type_name',g->>'type_id') from (
      select jsonb_build_object('type_id',mcpa_auth_private.wa_equipment_type(e),'type_name',e.name,'name',e.name,
        'category',e.category,'brand',e.brand,'model',e.model,'details',e.details,'condition',e.condition,
        'tracking_type',e.tracking_type,'unit',e.unit,'physical_records',count(*),
        'requestable',e.tracking_type='Individual' and bool_and(e.quantity=1),
        'available_quantity',coalesce(sum(e.quantity) filter(where mcpa_auth_private.wa_equipment_available(e)),0),
        'reserved_quantity',coalesce(sum(e.quantity) filter(where mcpa_auth_private.inventory_lock(e.id) is not null),0),
        'deployed_quantity',coalesce(sum(e.quantity) filter(where e.current_holder_id is not null or regexp_replace(lower(e.status::text),'[ _-]','','g')='inuse'),0)) g
      from public.equipment e group by mcpa_auth_private.wa_equipment_type(e),e.name,e.category,e.brand,e.model,e.details,e.condition,e.tracking_type,e.unit
    ) groups),'[]'::jsonb)) into result;
  return result;
end $$;
create function public.mcpa_wa_equipment_requests()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin','engineer','architect']);
  return coalesce((select jsonb_agg(mcpa_auth_private.wa_equipment_request(r.id) order by r.created_at desc)
    from public.mcpa_wa_equipment_requests r where actor.role='admin' or r.requester_id=actor.id),'[]'::jsonb);
end $$;
create function public.mcpa_wa_submit_equipment(p_operation_id uuid,p_type_id text,p_site_id uuid,p_quantity integer,p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; destination public.sites; body jsonb; result jsonb; item public.equipment; request uuid;
begin
  actor:=mcpa_auth_private.wa_actor(array['engineer','architect']);
  body:=jsonb_build_object('type_id',p_type_id,'site_id',p_site_id,'quantity',p_quantity,'purpose',p_purpose);
  result:=mcpa_auth_private.wa_replay(p_operation_id,actor.id,'submit_equipment',body);if result is not null then return result;end if;
  if p_quantity is null or p_quantity not between 1 and 100 or char_length(coalesce(p_purpose,''))>2000 then raise exception 'Enter quantity 1 to 100 and purpose up to 2000 characters.' using errcode='22023';end if;
  destination:=mcpa_auth_private.wa_site(p_site_id,actor);
  select * into item from public.equipment e where mcpa_auth_private.wa_equipment_type(e)=p_type_id and e.tracking_type='Individual' and e.quantity=1 limit 1;
  if item.id is null then raise exception 'Choose a compatible Individual equipment type.' using errcode='22023';end if;
  if (select count(*) from public.equipment e where mcpa_auth_private.wa_equipment_type(e)=p_type_id and e.tracking_type='Individual' and e.quantity=1 and mcpa_auth_private.wa_equipment_available(e))<p_quantity then
    raise exception 'Requested quantity exceeds currently available stock. Refresh inventory.' using errcode='40001';end if;
  insert into public.mcpa_wa_equipment_requests(requester_id,site_id,type_id,type_name,requested_quantity,purpose)
    values(actor.id,p_site_id,p_type_id,item.name,p_quantity,btrim(coalesce(p_purpose,''))) returning id into request;
  result:=mcpa_auth_private.wa_equipment_request(request);
  insert into public.mcpa_wa_operations values(p_operation_id,actor.id,'submit_equipment',body,result,clock_timestamp());return result;
end $$;
create function public.mcpa_wa_suggest_equipment(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; request public.mcpa_wa_equipment_requests;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin']);
  select * into request from public.mcpa_wa_equipment_requests where id=p_request_id;
  if request.id is null or request.status<>'pending' then raise exception 'Choose a pending quantity request.' using errcode='22023';end if;
  return jsonb_build_object('request_id',request.id,'requested_quantity',request.requested_quantity,
    'eligible_assets',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'asset_id',e.asset_id,'name',e.name) order by e.asset_id)
      from public.equipment e where mcpa_auth_private.wa_equipment_type(e)=request.type_id and e.tracking_type='Individual' and e.quantity=1 and mcpa_auth_private.wa_equipment_available(e)),'[]'::jsonb),
    'suggested_asset_ids',coalesce((select jsonb_agg(x.id) from (select e.id from public.equipment e where mcpa_auth_private.wa_equipment_type(e)=request.type_id
      and e.tracking_type='Individual' and e.quantity=1 and mcpa_auth_private.wa_equipment_available(e) order by e.asset_id limit request.requested_quantity) x),'[]'::jsonb));
end $$;
create function public.mcpa_wa_allocate_equipment(p_operation_id uuid,p_request_id uuid,p_asset_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; request public.mcpa_wa_equipment_requests; destination public.sites; requester public.profiles;
  body jsonb; result jsonb; movement text; tool_ids jsonb; data jsonb; now_text text;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin']);
  body:=jsonb_build_object('request_id',p_request_id,'asset_ids',p_asset_ids);
  result:=mcpa_auth_private.wa_replay(p_operation_id,actor.id,'allocate_equipment',body);if result is not null then return result;end if;
  -- Same lock/order as the established movement RPC. The authoritative reservation
  -- PK protects both old and new workflows, including across concurrent Admins.
  perform pg_advisory_xact_lock(672341,2026);
  select * into request from public.mcpa_wa_equipment_requests where id=p_request_id for update;
  if request.id is null or request.status<>'pending' then raise exception 'Only pending requests can be allocated.' using errcode='40001';end if;
  if coalesce(cardinality(p_asset_ids),0)<>request.requested_quantity or (select count(distinct x) from unnest(p_asset_ids) x)<>request.requested_quantity then
    raise exception 'Allocate exactly the requested number of distinct physical assets.' using errcode='22023';end if;
  destination:=mcpa_auth_private.wa_site(request.site_id,actor);
  select * into requester from public.profiles where id=request.requester_id and account_status='active' and auth_user_id is not null and role in ('engineer','architect') for share;
  if requester.id is null or destination.assigned_engineer_id is distinct from requester.id then raise exception 'Requester or project assignment changed. Review request.' using errcode='40001';end if;
  perform 1 from public.equipment where id=any(p_asset_ids) order by id for update;
  if (select count(*) from public.equipment e where e.id=any(p_asset_ids) and e.tracking_type='Individual' and e.quantity=1
      and mcpa_auth_private.wa_equipment_type(e)=request.type_id and mcpa_auth_private.wa_equipment_available(e))<>request.requested_quantity then
    raise exception 'An asset is unavailable or incompatible. Refresh the suggested allocation.' using errcode='40001';end if;
  select jsonb_agg(e.asset_id order by e.asset_id) into tool_ids from public.equipment e where e.id=any(p_asset_ids);
  movement:='REQ-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
  now_text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  data:=jsonb_build_object('id',movement,'toolIds',tool_ids,'destination',destination.name,'destinationId',destination.id,
    'receiver',requester.name,'receiverId',requester.id,'requester',requester.name,'purpose',request.purpose,
    'status','pending','createdAt',now_text,'updatedAt',now_text,'quantityRequestId',request.id);
  insert into public.mcpa_movements(id,kind,data,actor_id,destination_id,receiver_id) values(movement,'request',data,requester.id,destination.id,requester.id);
  insert into public.mcpa_movement_assets select movement,unnest(p_asset_ids);
  insert into public.mcpa_movement_sites values(movement,destination.id);
  -- Reuse existing approval/audit/reservation code; later release/custody can use
  -- this movement and the existing per-equipment UUID/Asset ID relations directly.
  perform public.mcpa_movement_action('approveRequest',jsonb_build_object('id',movement),p_operation_id);
  update public.mcpa_wa_equipment_requests set approved_quantity=requested_quantity,status='approved',movement_id=movement,updated_at=clock_timestamp() where id=request.id;
  result:=mcpa_auth_private.wa_equipment_request(request.id);
  insert into public.mcpa_wa_operations values(p_operation_id,actor.id,'allocate_equipment',body,result,clock_timestamp());return result;
end $$;
create function public.mcpa_wa_reject_equipment(p_operation_id uuid,p_request_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; body jsonb; result jsonb;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin']);body:=jsonb_build_object('request_id',p_request_id,'reason',p_reason);
  result:=mcpa_auth_private.wa_replay(p_operation_id,actor.id,'reject_equipment',body);if result is not null then return result;end if;
  if coalesce(char_length(btrim(p_reason)),0) not between 1 and 2000 then raise exception 'Enter rejection reason up to 2000 characters.' using errcode='22023';end if;
  update public.mcpa_wa_equipment_requests set status='rejected',rejection_reason=btrim(p_reason),updated_at=clock_timestamp() where id=p_request_id and status='pending';
  if not found then raise exception 'Only pending requests can be rejected.' using errcode='40001';end if;
  result:=mcpa_auth_private.wa_equipment_request(p_request_id);
  insert into public.mcpa_wa_operations values(p_operation_id,actor.id,'reject_equipment',body,result,clock_timestamp());return result;
end $$;

create function mcpa_auth_private.wa_material_request(request uuid,from_time timestamptz default null,to_time timestamptz default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(r)||jsonb_build_object('site_name',s.name,'requester_name',p.name,
    'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('issued_quantity',coalesce((select sum(-m.quantity_change)
      from public.mcpa_wa_material_issues x join public.consumable_stock_movements m on m.id=x.stock_movement_id where x.item_id=i.id),0),
      'confirmed_consumed_quantity',null) order by i.item_name,i.id) from public.mcpa_wa_material_items i where i.request_id=r.id),'[]'::jsonb),
    'issues',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('quantity',-m.quantity_change,'issued_by_name',a.name) order by x.issued_at,x.id)
      from public.mcpa_wa_material_issues x join public.mcpa_wa_material_items i on i.id=x.item_id
      join public.consumable_stock_movements m on m.id=x.stock_movement_id join public.profiles a on a.id=x.issued_by_id
      where i.request_id=r.id and (from_time is null or x.issued_at>=from_time) and (to_time is null or x.issued_at<to_time)),'[]'::jsonb))
  from public.mcpa_wa_material_requests r join public.sites s on s.id=r.site_id join public.profiles p on p.id=r.requester_id where r.id=request
$$;
create function public.mcpa_wa_consumables_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin','engineer','architect']);
  return jsonb_build_object('profile',jsonb_build_object('id',actor.id,'name',actor.name,'role',actor.role),
    'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by c.category,c.name,c.specification) from public.consumables c where c.archived_at is null),'[]'::jsonb),
    'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from public.sites s
      where s.is_active and s.archived_at is null and (actor.role='admin' or s.assigned_engineer_id=actor.id)),'[]'::jsonb));
end $$;
create function public.mcpa_wa_consumables_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin','engineer','architect']);
  return public.mcpa_wa_consumables_catalog()||jsonb_build_object('requests',coalesce((select jsonb_agg(mcpa_auth_private.wa_material_request(r.id) order by r.created_at desc)
    from public.mcpa_wa_material_requests r where actor.role='admin' or r.requester_id=actor.id),'[]'::jsonb));
end $$;
create function public.mcpa_wa_submit_consumables(p_operation_id uuid,p_site_id uuid,p_purpose text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; body jsonb; result jsonb; request uuid; row jsonb; item public.consumables; quantity numeric;
begin
  actor:=mcpa_auth_private.wa_actor(array['engineer','architect']);body:=jsonb_build_object('site_id',p_site_id,'purpose',p_purpose,'items',p_items);
  result:=mcpa_auth_private.wa_replay(p_operation_id,actor.id,'submit_consumables',body);if result is not null then return result;end if;
  perform mcpa_auth_private.wa_site(p_site_id,actor);
  if char_length(coalesce(p_purpose,''))>2000 or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Supply bounded purpose and material items.' using errcode='22023';end if;
  if jsonb_array_length(p_items) not between 1 and 100 or (select count(distinct x->>'consumable_id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then
    raise exception 'Choose 1 to 100 distinct consumables.' using errcode='22023';end if;
  insert into public.mcpa_wa_material_requests(requester_id,site_id,purpose) values(actor.id,p_site_id,btrim(coalesce(p_purpose,''))) returning id into request;
  -- Deterministic SKU locks also serialize against existing restock/archive RPCs.
  perform 1 from public.consumables c where c.id in (select (x->>'consumable_id')::uuid from jsonb_array_elements(p_items) x) order by c.id for share;
  for row in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(row->'quantity') is distinct from 'number' then raise exception 'Quantity must be a number.' using errcode='22023';end if;
    quantity:=(row->>'quantity')::numeric;
    select * into item from public.consumables where id=(row->>'consumable_id')::uuid;
    if item.id is null or item.archived_at is not null or row->>'unit' is distinct from item.unit or quantity<=0 or quantity>=1000000000 or quantity<>trunc(quantity,3) then
      raise exception 'Choose an active SKU, its registered unit and positive quantity with at most three decimal places.' using errcode='22023';end if;
    insert into public.mcpa_wa_material_items(request_id,consumable_id,item_name,item_code,category,specification,unit,requested_quantity)
      values(request,item.id,item.name,item.item_code,item.category,item.specification,item.unit,quantity);
  end loop;
  result:=mcpa_auth_private.wa_material_request(request);
  insert into public.mcpa_wa_operations values(p_operation_id,actor.id,'submit_consumables',body,result,clock_timestamp());return result;
end $$;
create function public.mcpa_wa_review_consumables(p_operation_id uuid,p_request_id uuid,p_decision text,p_items jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; body jsonb; result jsonb; request public.mcpa_wa_material_requests; row jsonb; quantity numeric; positive boolean:=false;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin']);body:=jsonb_build_object('request_id',p_request_id,'decision',p_decision,'items',p_items,'note',p_note);
  result:=mcpa_auth_private.wa_replay(p_operation_id,actor.id,'review_consumables',body);if result is not null then return result;end if;
  select * into request from public.mcpa_wa_material_requests where id=p_request_id for update;
  if request.id is null or request.status<>'pending' then raise exception 'Only pending consumables requests can be reviewed.' using errcode='40001';end if;
  if p_decision is null or p_decision not in ('approve','reject') or char_length(coalesce(p_note,''))>2000 then raise exception 'Choose approve or reject and bounded review note.' using errcode='22023';end if;
  if p_decision='reject' then
    if coalesce(char_length(btrim(p_note)),0)=0 then raise exception 'Enter rejection reason.' using errcode='22023';end if;
    if p_items is distinct from '[]'::jsonb then raise exception 'Rejected requests must have an empty approval list.' using errcode='22023';end if;
  else
    if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Supply approval quantities.' using errcode='22023';end if;
    if jsonb_array_length(p_items)<>(select count(*) from public.mcpa_wa_material_items where request_id=request.id)
      or (select count(distinct x->>'item_id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'Review every request line exactly once.' using errcode='22023';end if;
    for row in select value from jsonb_array_elements(p_items) loop
      if jsonb_typeof(row->'quantity') is distinct from 'number' then raise exception 'Approval quantity must be numeric.' using errcode='22023';end if;
      quantity:=(row->>'quantity')::numeric;
      if quantity<0 or quantity>=1000000000 or quantity<>trunc(quantity,3) then raise exception 'Invalid approved quantity.' using errcode='22023';end if;
      update public.mcpa_wa_material_items set approved_quantity=quantity where id=(row->>'item_id')::uuid and request_id=request.id and quantity<=requested_quantity;
      if not found then raise exception 'Approval must reference this request and not exceed requested quantity.' using errcode='22023';end if;
      positive:=positive or quantity>0;
    end loop;
    if not positive then raise exception 'Approve at least one positive quantity, or reject the request.' using errcode='22023';end if;
  end if;
  update public.mcpa_wa_material_requests set status=case when p_decision='approve' then 'approved' else 'rejected' end,note=btrim(coalesce(p_note,'')),
    reviewed_by=actor.id,reviewed_at=clock_timestamp(),updated_at=clock_timestamp() where id=request.id;
  result:=mcpa_auth_private.wa_material_request(request.id);
  insert into public.mcpa_wa_operations values(p_operation_id,actor.id,'review_consumables',body,result,clock_timestamp());return result;
end $$;
create function public.mcpa_wa_issue_consumables(p_operation_id uuid,p_request_id uuid,p_items jsonb,p_issued_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; body jsonb; result jsonb; request public.mcpa_wa_material_requests; row jsonb;
  line public.mcpa_wa_material_items; item public.consumables; quantity numeric; already numeric; movement uuid; issued_time timestamptz;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin']);body:=jsonb_build_object('request_id',p_request_id,'items',p_items,'issued_at',p_issued_at);
  result:=mcpa_auth_private.wa_replay(p_operation_id,actor.id,'issue_consumables',body);if result is not null then return result;end if;
  select * into request from public.mcpa_wa_material_requests where id=p_request_id for update;
  if request.id is null or request.status not in ('approved','partial') then raise exception 'Only approved or partially issued requests can be issued.' using errcode='40001';end if;
  issued_time:=coalesce(p_issued_at,clock_timestamp());
  if issued_time>clock_timestamp() or issued_time<request.created_at then raise exception 'Issuance must occur between request creation and now.' using errcode='22023';end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Supply issuance items.' using errcode='22023';end if;
  if jsonb_array_length(p_items) not between 1 and 100 or (select count(distinct x->>'item_id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'Choose distinct request lines to issue.' using errcode='22023';end if;
  perform 1 from public.consumables c join public.mcpa_wa_material_items i on i.consumable_id=c.id
    where i.request_id=request.id and i.id in (select (x->>'item_id')::uuid from jsonb_array_elements(p_items) x) order by c.id for update of c;
  for row in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(row->'quantity') is distinct from 'number' then raise exception 'Issue quantity must be numeric.' using errcode='22023';end if;
    quantity:=(row->>'quantity')::numeric;
    select * into line from public.mcpa_wa_material_items where id=(row->>'item_id')::uuid and request_id=request.id;
    select * into item from public.consumables where id=line.consumable_id;
    select coalesce(sum(-m.quantity_change),0) into already from public.mcpa_wa_material_issues x
      join public.consumable_stock_movements m on m.id=x.stock_movement_id where x.item_id=line.id;
    if line.id is null or item.archived_at is not null or quantity<=0 or quantity>=1000000000 or quantity<>trunc(quantity,3)
      or quantity>line.approved_quantity-already or quantity>item.current_stock then raise exception 'Issue quantity exceeds approved remainder or available active stock.' using errcode='40001';end if;
    update public.consumables set current_stock=current_stock-quantity,version=version+1,updated_at=clock_timestamp() where id=item.id returning * into item;
    movement:=gen_random_uuid();
    insert into public.consumable_stock_movements(id,consumable_id,kind,quantity_change,balance_after,note)
      values(movement,item.id,'usage',-quantity,item.current_stock,'Workstream A issue for request '||request.request_number||' / project '||request.site_id::text);
    insert into public.mcpa_wa_material_issues(operation_id,item_id,stock_movement_id,issued_at,issued_by_id) values(p_operation_id,line.id,movement,issued_time,actor.id);
  end loop;
  update public.mcpa_wa_material_requests set status=case when exists(select 1 from public.mcpa_wa_material_items i where i.request_id=request.id and i.approved_quantity>
      coalesce((select sum(-m.quantity_change) from public.mcpa_wa_material_issues x join public.consumable_stock_movements m on m.id=x.stock_movement_id where x.item_id=i.id),0)) then 'partial' else 'issued' end,
    updated_at=clock_timestamp() where id=request.id;
  result:=mcpa_auth_private.wa_material_request(request.id);
  insert into public.mcpa_wa_operations values(p_operation_id,actor.id,'issue_consumables',body,result,clock_timestamp());return result;
end $$;
create function public.mcpa_wa_consumables_analytics(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin']);
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'Supply an increasing date range [from,to).' using errcode='22023';end if;
  -- All headers are retained so a request made before the interval can still
  -- explain its issuance inside the interval. Clients filter requested cohorts
  -- by created_at; only issues are filtered by issued_at here.
  return public.mcpa_wa_consumables_catalog()||jsonb_build_object('from',p_from,'to',p_to,'requests',coalesce((select jsonb_agg(mcpa_auth_private.wa_material_request(r.id,p_from,p_to) order by r.created_at desc)
    from public.mcpa_wa_material_requests r),'[]'::jsonb));
end $$;

create function public.mcpa_import_equipment_v2(p_operation_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; receipt public.mcpa_wa_import_operations; row jsonb; expanded jsonb:='[]'; mappings jsonb:='[]';
  qty integer; sequence integer:=0; source integer; idx integer; seen integer[]:='{}'; digest text; base jsonb; result jsonb;
begin
  actor:=mcpa_auth_private.wa_actor(array['admin']);
  if p_operation_id is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Supply operation and original spreadsheet rows.' using errcode='22023';end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>2097152 then raise exception 'Import allows 1 to 500 spreadsheet rows and at most 2 MiB.' using errcode='22023';end if;
  digest:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
  -- Same operation lock as v1, so cross-entry-point reuse cannot race.
  perform pg_advisory_xact_lock(hashtextextended('mcpa:equipment-import:'||p_operation_id::text,0));
  select * into receipt from public.mcpa_wa_import_operations where operation_id=p_operation_id;
  if found then
    if receipt.actor_id<>actor.id or receipt.payload_digest<>digest then raise exception 'Import operation belongs to different original rows or account.' using errcode='22023';end if;
    return receipt.result;
  end if;
  if exists(select 1 from public.mcpa_equipment_imports where operation_id=p_operation_id) then raise exception 'Operation belongs to another importer version.' using errcode='22023';end if;
  for row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(row) is distinct from 'object' or jsonb_typeof(row->'source_row') is distinct from 'number' or coalesce(row->>'source_row','')!~'^[0-9]{1,7}$'
      or jsonb_typeof(row->'quantity') is distinct from 'number' or coalesce(row->>'quantity','')!~'^[0-9]{1,10}$' then raise exception 'Source row and positive integer quantity required.' using errcode='22023';end if;
    if (row->>'quantity')::numeric>2147483647 then raise exception 'Quantity exceeds the existing signed integer limit.' using errcode='22023';end if;
    source:=(row->>'source_row')::integer;qty:=(row->>'quantity')::integer;
    if source not between 2 and 1000000 or source=any(seen) or qty<1 then raise exception 'Invalid/repeated source row or quantity.' using errcode='22023';end if;seen:=array_append(seen,source);
    if coalesce(row->>'condition','') not in ('Good','Fair','Damaged','Needs Inspection','Not Assessed') then raise exception 'Spreadsheet row %: explicitly supply a supported condition.',source using errcode='22023';end if;
    if row->>'tracking_type'='Individual' then
      if qty>500 or (qty>1 and coalesce(btrim(row->>'serial_number'),'')<>'') then raise exception 'Spreadsheet row %: Individual quantity at most 500; provide serials on separate rows.',source using errcode='22023';end if;
    elsif row->>'tracking_type'='Bulk' then qty:=1;
    else raise exception 'Spreadsheet row %: choose Individual or Bulk.',source using errcode='22023';end if;
    if sequence+qty>500 then raise exception 'Expanded import exceeds 500 physical/grouped records.' using errcode='22023';end if;
    for idx in 1..qty loop
      sequence:=sequence+1;
      expanded:=expanded||jsonb_build_array(row||jsonb_build_object('source_row',sequence+1,'quantity',case when row->>'tracking_type'='Individual' then 1 else (row->>'quantity')::integer end));
      mappings:=mappings||jsonb_build_array(jsonb_build_object('source_row',source,'expansion_index',idx));
    end loop;
  end loop;
  if octet_length(expanded::text)>2097152 then raise exception 'Expanded payload exceeds the existing 2 MiB batch limit.' using errcode='22023';end if;
  base:=public.mcpa_import_equipment(p_operation_id,expanded);
  select coalesce(jsonb_agg((a.value-'source_row')||(mappings->(a.ordinality::integer-1)) order by a.ordinality),'[]'::jsonb) into result
    from jsonb_array_elements(base->'assets') with ordinality a(value,ordinality);
  result:=base||jsonb_build_object('assets',result,'spreadsheet_rows',jsonb_array_length(p_rows),'expanded_records',sequence);
  insert into public.mcpa_wa_import_operations(operation_id,actor_id,payload_digest,result) values(p_operation_id,actor.id,digest,result);return result;
end $$;
create function public.mcpa_import_equipment_v2_receipt(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform mcpa_auth_private.wa_actor(array['admin']);
  return (select result from public.mcpa_wa_import_operations where operation_id=p_operation_id);
end $$;

-- No client write grants. RLS scopes own request metadata; private helpers cannot
-- be called through PostgREST. Receipts and issue mappings are immutable.
do $$ declare name text; begin
  foreach name in array array['mcpa_wa_operations','mcpa_wa_equipment_requests','mcpa_wa_material_requests','mcpa_wa_material_items','mcpa_wa_material_issues','mcpa_wa_import_operations'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
  end loop;
end $$;
create policy mcpa_wa_operations_read on public.mcpa_wa_operations for select to authenticated using(public.mcpa_has_role(array['admin']));
create policy mcpa_wa_equipment_read on public.mcpa_wa_equipment_requests for select to authenticated
  using(public.mcpa_has_role(array['admin']) or (public.mcpa_has_role(array['engineer','architect']) and requester_id=(public.mcpa_my_profile()->>'id')::uuid));
create policy mcpa_wa_material_read on public.mcpa_wa_material_requests for select to authenticated
  using(public.mcpa_has_role(array['admin']) or (public.mcpa_has_role(array['engineer','architect']) and requester_id=(public.mcpa_my_profile()->>'id')::uuid));
create policy mcpa_wa_material_items_read on public.mcpa_wa_material_items for select to authenticated
  using(exists(select 1 from public.mcpa_wa_material_requests r where r.id=request_id));
create policy mcpa_wa_material_issues_read on public.mcpa_wa_material_issues for select to authenticated
  using(exists(select 1 from public.mcpa_wa_material_items i where i.id=item_id));
create policy mcpa_wa_import_read on public.mcpa_wa_import_operations for select to authenticated using(public.mcpa_has_role(array['admin']));
create function mcpa_auth_private.wa_immutable()
returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Workstream A audit records are immutable.' using errcode='42501';end $$;
create trigger mcpa_wa_operations_immutable before update or delete or truncate on public.mcpa_wa_operations for each statement execute function mcpa_auth_private.wa_immutable();
create trigger mcpa_wa_issues_immutable before update or delete or truncate on public.mcpa_wa_material_issues for each statement execute function mcpa_auth_private.wa_immutable();
create trigger mcpa_wa_import_immutable before update or delete or truncate on public.mcpa_wa_import_operations for each statement execute function mcpa_auth_private.wa_immutable();
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='mcpa_auth_private' and p.proname like 'wa_%') or (n.nspname='public' and (p.proname like 'mcpa_wa_%' or p.proname in ('mcpa_import_equipment_v2','mcpa_import_equipment_v2_receipt'))) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
    if split_part(fn.signature::text,'.',1)<>'mcpa_auth_private' then execute format('grant execute on function %s to authenticated',fn.signature);end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;

-- Run this complete file in the Supabase SQL Editor. Safe to rerun; no demo data.
-- Only Consumables objects are created/changed. Existing modules are untouched.
-- ACCESS: the existing Sign In screen does not use Supabase Auth. As with Sites,
-- anon and authenticated can read and invoke the module's validated operations.
-- Anyone with the public API configuration can do this. Replace these grants and
-- policies with authenticated role checks when real application login is implemented.
begin;

create table if not exists public.consumables (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unit text not null check (char_length(btrim(unit)) between 1 and 30),
  current_stock numeric(12,3) not null default 0 check (current_stock >= 0 and current_stock < 1000000000),
  minimum_stock numeric(12,3) not null default 0 check (minimum_stock >= 0 and minimum_stock < 1000000000),
  stock_status text generated always as (case when current_stock = 0 then 'out' when current_stock < minimum_stock then 'low' else 'ok' end) stored,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists consumables_unique_name on public.consumables (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create table if not exists public.consumable_requests (
  id uuid primary key,
  request_number bigint generated always as identity unique,
  consumable_id uuid not null references public.consumables(id) on delete restrict,
  item_name text not null,
  unit text not null,
  quantity numeric(12,3) not null check (quantity > 0 and quantity < 1000000000),
  received_quantity numeric(12,3) not null default 0 check (received_quantity >= 0 and received_quantity <= quantity),
  requester text not null check (char_length(btrim(requester)) between 1 and 120 and requester ~ '\S'),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 1000 and purpose ~ '\S'),
  needed_by date,
  status text not null default 'pending' check (status in ('pending','partial','received','cancelled')),
  cancellation_reason text check (char_length(btrim(cancellation_reason)) between 1 and 1000 and cancellation_reason ~ '\S'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and received_quantity = 0) or (status = 'partial' and received_quantity > 0 and received_quantity < quantity) or (status = 'received' and received_quantity = quantity) or (status = 'cancelled' and received_quantity < quantity and cancellation_reason is not null))
);
create unique index if not exists consumable_requests_one_open on public.consumable_requests(consumable_id) where status in ('pending','partial');

create table if not exists public.consumable_stock_movements (
  id uuid primary key,
  consumable_id uuid not null references public.consumables(id) on delete restrict,
  request_id uuid references public.consumable_requests(id) on delete restrict,
  kind text not null check (kind in ('opening','usage','restock','correction','receipt')),
  quantity_change numeric(12,3) not null,
  balance_after numeric(12,3) not null check (balance_after >= 0 and balance_after < 1000000000),
  note text not null check (char_length(btrim(note)) between 1 and 1000 and note ~ '\S'),
  created_at timestamptz not null default now(),
  check ((kind = 'receipt' and request_id is not null and quantity_change > 0) or (kind <> 'receipt' and request_id is null)),
  check (kind not in ('restock','usage') or (kind = 'restock' and quantity_change > 0) or (kind = 'usage' and quantity_change < 0))
);
create index if not exists consumable_movements_item on public.consumable_stock_movements(consumable_id, created_at desc);
create index if not exists consumable_movements_request on public.consumable_stock_movements(request_id) where request_id is not null;

-- Writes use narrow transactional RPCs. Direct table writes are denied to clients,
-- so balances, receipts and audit entries cannot be saved independently.
create or replace function public.consumables_save_item(p_id uuid, p_version integer, p_name text, p_unit text, p_minimum numeric, p_opening numeric default 0)
returns public.consumables language plpgsql security definer set search_path = '' as $$
declare v_item public.consumables;
begin
  if p_id is null or p_minimum is null or p_minimum <> trunc(p_minimum,3) or p_opening is null or p_opening <> trunc(p_opening,3) then
    raise exception 'Enter quantities with at most three decimal places.' using errcode = '22023';
  end if;
  p_name := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  p_unit := regexp_replace(btrim(p_unit), '\s+', ' ', 'g');
  if p_version is null then
    insert into public.consumables(id,name,unit,minimum_stock,current_stock) values(p_id,p_name,p_unit,p_minimum,p_opening)
      on conflict (id) do nothing returning * into v_item;
    if not found then
      select * into v_item from public.consumables where id = p_id;
      if v_item.name is distinct from p_name or v_item.unit is distinct from p_unit or v_item.minimum_stock is distinct from p_minimum or
        not exists(select 1 from public.consumable_stock_movements where id=p_id and kind='opening' and quantity_change=p_opening) then
        raise exception 'This item was already saved. Refresh to see its latest details.' using errcode = '40001';
      end if;
      return v_item;
    end if;
    insert into public.consumable_stock_movements(id,consumable_id,kind,quantity_change,balance_after,note)
      values(p_id,p_id,'opening',p_opening,p_opening,'Opening stock');
  else
    -- Units are fixed after registration to keep historical quantities meaningful.
    update public.consumables set name=p_name, minimum_stock=p_minimum, version=version+1, updated_at=clock_timestamp()
      where id=p_id and version=p_version and unit=p_unit returning * into v_item;
    if not found then raise exception 'This item changed. Close the form and refresh before trying again.' using errcode = '40001'; end if;
  end if;
  return v_item;
end $$;

create or replace function public.consumables_adjust_stock(p_operation_id uuid, p_item_id uuid, p_version integer, p_kind text, p_quantity numeric, p_note text)
returns public.consumables language plpgsql security definer set search_path = '' as $$
declare v_item public.consumables; v_move public.consumable_stock_movements; v_delta numeric;
begin
  if p_kind is null or p_kind not in ('usage','restock','correction') or p_quantity is null or p_quantity < 0 or p_quantity >= 1000000000 or p_quantity <> trunc(p_quantity,3) or (p_kind <> 'correction' and p_quantity = 0) then
    raise exception 'Enter a valid stock quantity with at most three decimal places.' using errcode = '22023';
  end if;
  select * into v_item from public.consumables where id=p_item_id for update;
  if not found then raise exception 'Consumable no longer exists.' using errcode = '22023'; end if;
  select * into v_move from public.consumable_stock_movements where id=p_operation_id;
  if found then
    if v_move.consumable_id <> p_item_id or v_move.kind <> p_kind or v_move.note is distinct from btrim(p_note) or
      (p_kind='correction' and v_move.balance_after <> p_quantity) or
      (p_kind<>'correction' and abs(v_move.quantity_change) <> p_quantity) then
      raise exception 'This operation was already saved with different values. Refresh before trying again.' using errcode='40001';
    end if;
    return v_item;
  end if;
  if v_item.version is distinct from p_version then raise exception 'Stock changed. Close the form and refresh before trying again.' using errcode='40001'; end if;
  v_delta := case p_kind when 'usage' then -p_quantity when 'restock' then p_quantity else p_quantity-v_item.current_stock end;
  if v_item.current_stock+v_delta < 0 then raise exception 'Usage cannot exceed available stock.' using errcode='22023'; end if;
  update public.consumables set current_stock=current_stock+v_delta, version=version+1, updated_at=clock_timestamp() where id=p_item_id returning * into v_item;
  insert into public.consumable_stock_movements(id,consumable_id,kind,quantity_change,balance_after,note)
    values(p_operation_id,p_item_id,p_kind,v_delta,v_item.current_stock,btrim(p_note));
  return v_item;
end $$;

create or replace function public.consumables_create_request(p_id uuid, p_item_id uuid, p_quantity numeric, p_requester text, p_purpose text, p_needed_by date default null)
returns public.consumable_requests language plpgsql security definer set search_path = '' as $$
declare v_item public.consumables; v_request public.consumable_requests;
begin
  select * into v_item from public.consumables where id=p_item_id for update;
  if not found then raise exception 'Consumable no longer exists.' using errcode='22023'; end if;
  select * into v_request from public.consumable_requests where id=p_id;
  if found then
    if v_request.consumable_id is distinct from p_item_id or v_request.quantity is distinct from p_quantity or v_request.requester is distinct from btrim(p_requester) or v_request.purpose is distinct from btrim(p_purpose) or v_request.needed_by is distinct from p_needed_by then
      raise exception 'This request was already saved with different values. Refresh before trying again.' using errcode='40001';
    end if;
    return v_request;
  end if;
  if p_quantity is null or p_quantity <> trunc(p_quantity,3) or p_needed_by < (current_timestamp at time zone 'Asia/Manila')::date then
    raise exception 'Check the quantity and needed-by date. Past dates are not allowed.' using errcode='22023';
  end if;
  if exists(select 1 from public.consumable_requests where consumable_id=p_item_id and status in ('pending','partial')) then
    raise exception 'This item already has an open purchase request. Refresh to view it.' using errcode='23505';
  end if;
  insert into public.consumable_requests(id,consumable_id,item_name,unit,quantity,requester,purpose,needed_by)
    values(p_id,p_item_id,v_item.name,v_item.unit,p_quantity,btrim(p_requester),btrim(p_purpose),p_needed_by) returning * into v_request;
  return v_request;
end $$;

create or replace function public.consumables_receive_request(p_operation_id uuid, p_request_id uuid, p_version integer, p_quantity numeric, p_note text)
returns public.consumable_requests language plpgsql security definer set search_path = '' as $$
declare v_request public.consumable_requests; v_move public.consumable_stock_movements; v_balance numeric;
begin
  -- Always lock the item before the request, matching the request-creation order.
  perform 1 from public.consumables where id=(select consumable_id from public.consumable_requests where id=p_request_id) for update;
  select * into v_request from public.consumable_requests where id=p_request_id for update;
  if not found then raise exception 'Request no longer exists.' using errcode='22023'; end if;
  select * into v_move from public.consumable_stock_movements where id=p_operation_id;
  if found then
    if v_move.request_id is distinct from p_request_id or v_move.quantity_change is distinct from p_quantity or v_move.note is distinct from btrim(p_note) then
      raise exception 'This receipt was already saved with different values. Refresh before trying again.' using errcode='40001';
    end if;
    return v_request;
  end if;
  if v_request.version is distinct from p_version or v_request.status not in ('pending','partial') then
    raise exception 'Request changed or is closed. Close the form and refresh before trying again.' using errcode='40001';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > v_request.quantity-v_request.received_quantity or p_quantity <> trunc(p_quantity,3) then
    raise exception 'Received quantity must be positive and cannot exceed the outstanding quantity.' using errcode='22023';
  end if;
  update public.consumables set current_stock=current_stock+p_quantity, version=version+1, updated_at=clock_timestamp()
    where id=v_request.consumable_id returning current_stock into v_balance;
  update public.consumable_requests set received_quantity=received_quantity+p_quantity,
    status=case when received_quantity+p_quantity=quantity then 'received' else 'partial' end,
    version=version+1, updated_at=clock_timestamp() where id=p_request_id returning * into v_request;
  insert into public.consumable_stock_movements(id,consumable_id,request_id,kind,quantity_change,balance_after,note)
    values(p_operation_id,v_request.consumable_id,p_request_id,'receipt',p_quantity,v_balance,btrim(p_note));
  return v_request;
end $$;

create or replace function public.consumables_cancel_request(p_request_id uuid, p_version integer, p_reason text)
returns public.consumable_requests language plpgsql security definer set search_path = '' as $$
declare v_request public.consumable_requests;
begin
  update public.consumable_requests set status='cancelled', cancellation_reason=btrim(p_reason), version=version+1, updated_at=clock_timestamp()
    where id=p_request_id and version=p_version and status in ('pending','partial') returning * into v_request;
  if not found then raise exception 'Request changed or is closed. Close the form and refresh before trying again.' using errcode='40001'; end if;
  return v_request;
end $$;

alter table public.consumables enable row level security;
alter table public.consumable_requests enable row level security;
alter table public.consumable_stock_movements enable row level security;
revoke all on public.consumables, public.consumable_requests, public.consumable_stock_movements from public, anon, authenticated;
grant select on public.consumables, public.consumable_requests, public.consumable_stock_movements to anon, authenticated;
drop policy if exists consumables_read on public.consumables;
create policy consumables_read on public.consumables for select to anon, authenticated using(true);
drop policy if exists consumable_requests_read on public.consumable_requests;
create policy consumable_requests_read on public.consumable_requests for select to anon, authenticated using(true);
drop policy if exists consumable_movements_read on public.consumable_stock_movements;
create policy consumable_movements_read on public.consumable_stock_movements for select to anon, authenticated using(true);

revoke all on function public.consumables_save_item(uuid,integer,text,text,numeric,numeric) from public, anon, authenticated;
revoke all on function public.consumables_adjust_stock(uuid,uuid,integer,text,numeric,text) from public, anon, authenticated;
revoke all on function public.consumables_create_request(uuid,uuid,numeric,text,text,date) from public, anon, authenticated;
revoke all on function public.consumables_receive_request(uuid,uuid,integer,numeric,text) from public, anon, authenticated;
revoke all on function public.consumables_cancel_request(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.consumables_save_item(uuid,integer,text,text,numeric,numeric) to anon, authenticated;
grant execute on function public.consumables_adjust_stock(uuid,uuid,integer,text,numeric,text) to anon, authenticated;
grant execute on function public.consumables_create_request(uuid,uuid,numeric,text,text,date) to anon, authenticated;
grant execute on function public.consumables_receive_request(uuid,uuid,integer,numeric,text) to anon, authenticated;
grant execute on function public.consumables_cancel_request(uuid,integer,text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

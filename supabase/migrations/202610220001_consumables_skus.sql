-- MANUAL REVIEW ONLY. Requires setup.sql followed by authenticated_access.
-- Category insertion is generated from js/consumables-catalog.js in the companion
-- 202610220000_consumable_categories.sql; run that file first in the deployment transaction.
begin;
do $$ begin
  if to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regprocedure('mcpa_auth_private.consumables_adjust_stock(uuid,uuid,integer,text,numeric,text)') is null
    or to_regclass('public.consumable_categories') is null then
    raise exception 'Apply the existing Consumables/auth migrations and 202610220000_consumable_categories.sql first.';
  end if;
  if exists(select 1 from public.consumables where current_stock is null or current_stock < 0 or current_stock >= 1000000000 or minimum_stock is null or minimum_stock < 0 or minimum_stock >= 1000000000)
    or exists(select 1 from public.consumable_stock_movements where balance_after < 0 or balance_after >= 1000000000 or quantity_change<=-1000000000 or quantity_change>=1000000000 or balance_after-quantity_change<0 or balance_after-quantity_change>=1000000000) then
    raise exception 'Invalid historical stock detected. Review preflight; no balances were changed.';
  end if;
end $$;

alter table public.consumables add column if not exists category text references public.consumable_categories(name);
alter table public.consumables add column if not exists item_code text;
alter table public.consumables add column if not exists specification text not null default '';
alter table public.consumables add column if not exists catalog_key text;
-- Legacy null categories/codes stay visible until explicitly classified.
alter table public.consumables add constraint consumables_valid_code check(item_code is null or item_code ~ '^[A-Z][A-Z0-9]{1,9}-[0-9]{3,9}$');
alter table public.consumables add constraint consumables_spec_length check(char_length(specification)<=160);
alter table public.consumables add constraint consumables_stock_bounds check(current_stock >= 0 and current_stock < 1000000000 and minimum_stock >= 0 and minimum_stock < 1000000000);
create or replace function mcpa_auth_private.consumables_require_category()
returns trigger language plpgsql set search_path='' as $$ begin
  if new.category is null and (tg_op='INSERT' or old.category is not null) then
    raise exception 'Choose a valid consumable category.' using errcode='22023';
  end if;
  return new;
end $$;
create trigger consumables_require_category before insert or update on public.consumables
for each row execute function mcpa_auth_private.consumables_require_category();

create or replace function mcpa_auth_private.consumable_normalize(value text)
returns text language sql immutable set search_path='' as $$
  select lower(regexp_replace(btrim(coalesce(value,'')), '\s+', ' ', 'g'))
$$;
create or replace function mcpa_auth_private.consumable_unit(value text)
returns text language sql immutable set search_path='' as $$
  select case mcpa_auth_private.consumable_normalize(value)
    when 'pieces' then 'pcs' when 'piece' then 'pcs' when 'pc' then 'pcs'
    when 'rolls' then 'roll' when 'sheets' then 'sheet' when 'tubes' then 'tube'
    when 'boxes' then 'box' when 'packs' then 'pack' when 'bottles' then 'bottle'
    when 'bundles' then 'bundle' when 'kilograms' then 'kg' when 'kilogram' then 'kg'
    else mcpa_auth_private.consumable_normalize(value) end
$$;
drop index if exists public.consumables_unique_name;
create unique index consumables_unique_sku on public.consumables(
  mcpa_auth_private.consumable_normalize(name),mcpa_auth_private.consumable_normalize(specification),mcpa_auth_private.consumable_unit(unit));
create unique index consumables_unique_code on public.consumables(item_code) where item_code is not null;
create unique index consumables_unique_catalog on public.consumables(catalog_key) where catalog_key is not null;

alter table public.consumable_stock_movements add column if not exists actor_id uuid references public.profiles(id) on delete restrict;
alter table public.consumable_stock_movements add column if not exists actor_name text;
alter table public.consumable_stock_movements add column if not exists balance_before numeric(12,3) generated always as (balance_after-quantity_change) stored;
alter table public.consumable_stock_movements add constraint consumables_movement_bounds
check(quantity_change > -1000000000 and quantity_change < 1000000000 and balance_after >= 0 and balance_after < 1000000000 and balance_before >= 0 and balance_before < 1000000000);
create or replace function mcpa_auth_private.consumables_audit_actor()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor public.profiles;
begin
  if auth.uid() is not null then
    actor:=mcpa_auth_private.identity();
    if actor.role not in ('admin','secretary') then raise exception 'Materials access required.' using errcode='42501';end if;
    new.actor_id:=actor.id; new.actor_name:=actor.name;
  else
    new.actor_id:=null; new.actor_name:='Database maintenance / catalog import';
  end if;
  return new;
end $$;
create trigger consumables_audit_actor before insert on public.consumable_stock_movements
for each row execute function mcpa_auth_private.consumables_audit_actor();
create or replace function mcpa_auth_private.consumables_history_immutable()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception 'Consumable stock history is immutable.' using errcode='42501';
end $$;
create trigger consumables_history_immutable before update or delete or truncate on public.consumable_stock_movements
for each statement execute function mcpa_auth_private.consumables_history_immutable();

-- New overload uses the existing authenticated identity and role boundaries.
create or replace function public.consumables_save_item(p_id uuid,p_version integer,p_name text,p_unit text,p_minimum numeric,p_opening numeric,p_category text,p_specification text,p_item_code text)
returns public.consumables language plpgsql security definer set search_path='' as $$
declare actor public.profiles; v_item public.consumables; prefix text; next_number bigint;
begin
  actor:=mcpa_auth_private.identity();
  if actor.role not in ('admin','secretary') then raise exception 'Materials access required.' using errcode='42501';end if;
  if p_id is null or p_minimum is null or p_opening is null or p_minimum < 0 or p_opening < 0
    or p_minimum >= 1000000000 or p_opening >= 1000000000 or p_minimum<>trunc(p_minimum,3) or p_opening<>trunc(p_opening,3) then
    raise exception 'Enter non-negative quantities with at most three decimal places.' using errcode='22023';
  end if;
  select c.prefix into prefix from public.consumable_categories c where c.name=p_category;
  if not found then raise exception 'Choose a valid consumable category.' using errcode='22023';end if;
  p_name:=regexp_replace(btrim(p_name),'\s+',' ','g');p_unit:=regexp_replace(btrim(p_unit),'\s+',' ','g');
  p_specification:=btrim(coalesce(p_specification,''));p_item_code:=nullif(upper(btrim(p_item_code)),'');
  -- Serialize code allocation, including imports, without touching stock locks.
  perform pg_advisory_xact_lock(22026022);
  if p_version is null then
    select * into v_item from public.consumables where id=p_id for update;
    if found then
      if v_item.name is distinct from p_name or v_item.unit is distinct from p_unit or v_item.category is distinct from p_category
        or v_item.specification is distinct from p_specification or (p_item_code is not null and v_item.item_code is distinct from p_item_code)
        or v_item.minimum_stock is distinct from p_minimum
        or not exists(select 1 from public.consumable_stock_movements where id=p_id and kind='opening' and quantity_change=p_opening) then
        raise exception 'This item was already saved with different values. Refresh.' using errcode='40001';end if;
      return v_item;
    end if;
    if p_item_code is null then
      select coalesce(max(substring(item_code from '[0-9]+$')::bigint),0)+1 into next_number
        from public.consumables where item_code like prefix||'-%';
      p_item_code:=prefix||'-'||case when next_number<1000 then lpad(next_number::text,3,'0') else next_number::text end;
    end if;
    insert into public.consumables(id,name,unit,current_stock,minimum_stock,category,specification,item_code)
      values(p_id,p_name,p_unit,p_opening,p_minimum,p_category,p_specification,p_item_code) returning * into v_item;
    insert into public.consumable_stock_movements(id,consumable_id,kind,quantity_change,balance_after,note)
      values(p_id,p_id,'opening',p_opening,p_opening,'Opening stock');
  else
    update public.consumables set name=p_name,minimum_stock=p_minimum,category=p_category,specification=p_specification,
      item_code=p_item_code,version=version+1,updated_at=clock_timestamp()
      where id=p_id and version=p_version and unit=p_unit and p_item_code is not null returning * into v_item;
    if not found then raise exception 'This item changed or its code is missing. Close the form and refresh.' using errcode='40001';end if;
  end if;
  return v_item;
end $$;
-- Old clients cannot create uncategorized items through the legacy overload.
create or replace function public.consumables_save_item(p_id uuid,p_version integer,p_name text,p_unit text,p_minimum numeric,p_opening numeric default 0)
returns public.consumables language plpgsql security definer set search_path='' as $$
declare v_item public.consumables;
begin
  select * into v_item from public.consumables where id=p_id;
  return public.consumables_save_item(p_id,p_version,p_name,p_unit,p_minimum,p_opening,v_item.category,v_item.specification,v_item.item_code);
end $$;

-- Keep historical item_name snapshots intact; new requests snapshot the SKU too.
alter table public.consumable_requests add column if not exists item_code text;
alter table public.consumable_requests add column if not exists specification text;
create or replace function mcpa_auth_private.consumables_request_sku()
returns trigger language plpgsql security definer set search_path='' as $$ begin
  select c.item_code,c.specification into new.item_code,new.specification from public.consumables c where c.id=new.consumable_id;
  return new;
end $$;
create trigger consumables_request_sku before insert on public.consumable_requests
for each row execute function mcpa_auth_private.consumables_request_sku();

-- Optional existing purchase ledger: expose request SKU snapshots in its picker.
-- No purchases, prices, receipts or history rows are changed.
do $upgrade$ begin
  if to_regprocedure('public.mcpa_purchase_snapshot()') is not null then
    execute $definition$
      create or replace function public.mcpa_purchase_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $body$
      declare actor public.profiles;
      begin
        actor:=mcpa_auth_private.identity();
        if actor.role not in ('admin','secretary') then raise exception 'Materials access required.' using errcode='42501';end if;
        return jsonb_build_object(
          'purchases',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('delivery_status',coalesce(r.status,'unlinked'),'request_number',r.request_number,'created_by_name',c.name,'updated_by_name',u.name) order by p.purchase_date desc,p.purchase_number desc) from public.mcpa_purchases p left join public.consumable_requests r on r.id=p.request_id left join public.profiles c on c.id=p.created_by left join public.profiles u on u.id=p.updated_by),'[]'::jsonb),
          'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'request_number',request_number,'item_name',item_name,'item_code',item_code,'specification',specification,'status',status) order by request_number desc) from public.consumable_requests),'[]'::jsonb),
          'history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('actor_name',a.name) order by h.created_at desc) from public.mcpa_purchase_history h join public.profiles a on a.id=h.actor_id),'[]'::jsonb));
      end $body$;
    $definition$;
  end if;
end $upgrade$;

revoke all on function mcpa_auth_private.consumable_normalize(text),mcpa_auth_private.consumable_unit(text),
  mcpa_auth_private.consumables_require_category(),mcpa_auth_private.consumables_audit_actor(),
  mcpa_auth_private.consumables_history_immutable(),mcpa_auth_private.consumables_request_sku() from public,anon,authenticated;
revoke all on function public.consumables_save_item(uuid,integer,text,text,numeric,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.consumables_save_item(uuid,integer,text,text,numeric,numeric,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

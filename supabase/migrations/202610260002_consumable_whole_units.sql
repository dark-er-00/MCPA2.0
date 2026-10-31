-- REVIEW ONLY / UNAPPLIED. Enforce future count-unit transactions without
-- rounding, rewriting, deleting or retroactively rejecting historical records.
-- Measured/unknown units retain the installed three-decimal quantity rules.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function mcpa_auth_private.consumable_whole_unit(unit text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(regexp_replace(lower(btrim(unit)),'\.+$','') ~
    '^(pcs?|pieces?|bags?|box(es)?|sets?|pairs?|rolls?|sheets?|tubes?|packs?|bottles?|bundles?|cans?|lengths?|units?|each|ea|sacks?)$',false)
$$;
create function mcpa_auth_private.consumable_quantity_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare unit text;
begin
  if tg_table_name='consumable_stock_movements' then
    select c.unit into unit from public.consumables c where c.id=new.consumable_id;
    if mcpa_auth_private.consumable_whole_unit(unit) and
      ((new.kind='correction' and new.balance_after<>trunc(new.balance_after)) or
       (new.kind<>'correction' and new.quantity_change<>trunc(new.quantity_change))) then
      raise exception 'Enter a whole-number quantity for %. Fractions are not allowed.',unit using errcode='22023';
    end if;
  elsif not mcpa_auth_private.consumable_whole_unit(new.unit) then return new;
  elsif tg_table_name='consumables' then
    if tg_op='INSERT' then
      if new.current_stock<>trunc(new.current_stock) or new.minimum_stock<>trunc(new.minimum_stock) then
        raise exception 'Opening and minimum stock must be whole numbers for %.',new.unit using errcode='22023';end if;
    elsif (new.unit is distinct from old.unit and new.current_stock<>trunc(new.current_stock))
      or (new.minimum_stock is distinct from old.minimum_stock and new.minimum_stock<>trunc(new.minimum_stock)) then
      raise exception 'Enter a whole-number quantity for %.',new.unit using errcode='22023';
    end if;
  elsif tg_table_name='consumable_requests' then
    if tg_op='INSERT' then
      if new.quantity<>trunc(new.quantity) or new.received_quantity<>trunc(new.received_quantity) then
        raise exception 'Enter a whole-number purchase quantity for %.',new.unit using errcode='22023';end if;
    elsif (new.quantity is distinct from old.quantity and new.quantity<>trunc(new.quantity))
      or (new.received_quantity is distinct from old.received_quantity and
          new.received_quantity-old.received_quantity<>trunc(new.received_quantity-old.received_quantity)) then
      raise exception 'Enter a whole-number receipt quantity for %.',new.unit using errcode='22023';
    end if;
  elsif tg_table_name='mcpa_wa_material_items' then
    if tg_op='INSERT' then
      if new.requested_quantity<>trunc(new.requested_quantity) or new.approved_quantity<>trunc(new.approved_quantity) then
        raise exception 'Requested and approved quantities must be whole numbers for %.',new.unit using errcode='22023';end if;
    elsif (new.requested_quantity is distinct from old.requested_quantity and new.requested_quantity<>trunc(new.requested_quantity))
      or (new.approved_quantity is distinct from old.approved_quantity and new.approved_quantity<>trunc(new.approved_quantity)) then
      raise exception 'Enter a whole-number approval quantity for %.',new.unit using errcode='22023';
    end if;
  end if;
  return new;
end $$;
create trigger consumable_whole_item before insert or update on public.consumables
  for each row execute function mcpa_auth_private.consumable_quantity_guard();
create trigger consumable_whole_request before insert or update on public.consumable_requests
  for each row execute function mcpa_auth_private.consumable_quantity_guard();
create trigger consumable_whole_line before insert or update on public.mcpa_wa_material_items
  for each row execute function mcpa_auth_private.consumable_quantity_guard();
create trigger consumable_whole_movement before insert on public.consumable_stock_movements
  for each row execute function mcpa_auth_private.consumable_quantity_guard();
revoke all on function mcpa_auth_private.consumable_whole_unit(text),mcpa_auth_private.consumable_quantity_guard() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;

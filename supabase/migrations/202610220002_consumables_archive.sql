-- MANUAL REVIEW ONLY. Apply AFTER 202610220000 and 202610220001.
-- Schema/guards only: does not archive any record or change any stock quantity.
begin;
set local lock_timeout='5s';
do $$ begin
  if to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regclass('public.consumable_categories') is null
    or to_regprocedure('public.consumables_save_item(uuid,integer,text,text,numeric,numeric,text,text,text)') is null then
    raise exception 'Apply the authenticated Consumables SKU upgrade first.';
  end if;
end $$;

alter table public.consumables add column archived_at timestamptz;
alter table public.consumables add column archive_reason text;
alter table public.consumables add constraint consumables_archive_state check(
  (archived_at is null and archive_reason is null) or
  (archived_at is not null and archive_reason is not null and char_length(btrim(archive_reason)) between 1 and 1000));
-- Active duplicates remain forbidden. Historical codes/import keys stay globally unique.
drop index public.consumables_unique_sku;
create unique index consumables_unique_sku on public.consumables(
  mcpa_auth_private.consumable_normalize(name),mcpa_auth_private.consumable_normalize(specification),mcpa_auth_private.consumable_unit(unit))
  where archived_at is null;

create table public.consumable_archive_events(
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references public.consumables(id) on delete restrict,
  kind text not null check(kind in ('archive','restore')),
  reason text not null check(char_length(btrim(reason)) between 1 and 1000),
  actor_id uuid references public.profiles(id) on delete restrict,
  actor_name text not null,
  created_at timestamptz not null default now()
);
alter table public.consumable_archive_events enable row level security;
revoke all on public.consumable_archive_events from public,anon,authenticated;
grant select on public.consumable_archive_events to authenticated;
create policy consumable_archive_events_read on public.consumable_archive_events for select to authenticated
  using(public.mcpa_has_role(array['admin','secretary']));
create trigger consumable_archive_events_immutable before update or delete or truncate on public.consumable_archive_events
for each statement execute function mcpa_auth_private.consumables_history_immutable();

create function mcpa_auth_private.consumables_archive_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor public.profiles; reason text; event_kind text;
begin
  if tg_op='INSERT' then
    if new.archived_at is not null or new.archive_reason is not null then
      raise exception 'Create active inventory before archiving it.' using errcode='22023';
    end if;
    return new;
  end if;
  if old.archived_at is not null then
    -- Session-local markers carry only the audited restoration intent. They do
    -- not grant privileges: direct browser writes remain denied, and identity is
    -- independently verified here and in the sole public restoration RPC.
    if new.archived_at is not null or current_setting('mcpa.consumable_restore_id',true) is distinct from old.id::text then
      raise exception 'Consumable is archived. An Admin must explicitly restore it before changes.' using errcode='22023';
    end if;
    actor:=mcpa_auth_private.identity();
    if actor.role<>'admin' then raise exception 'Admin restoration required.' using errcode='42501';end if;
    reason:=btrim(current_setting('mcpa.consumable_restore_reason',true));event_kind:='restore';
  elsif new.archived_at is not null then
    if exists(select 1 from public.consumable_requests where consumable_id=old.id and status in ('pending','partial')) then
      raise exception 'Resolve open material requests before archiving.' using errcode='22023';
    end if;
    if auth.uid() is not null then
      actor:=mcpa_auth_private.identity();
      if actor.role<>'admin' then raise exception 'Admin archival required.' using errcode='42501';end if;
    end if;
    reason:=btrim(new.archive_reason);event_kind:='archive';
  else return new;
  end if;
  if reason is null or char_length(reason) not between 1 and 1000 then
    raise exception 'An archive/restoration reason is required.' using errcode='22023';
  end if;
  -- PostgreSQL computes generated stock_status after BEFORE triggers. Compare
  -- all stored identity/quantity inputs, excluding that derived value only.
  if (to_jsonb(new)-array['archived_at','archive_reason','version','updated_at','stock_status']) is distinct from
     (to_jsonb(old)-array['archived_at','archive_reason','version','updated_at','stock_status']) then
    raise exception 'Archival/restoration cannot change stock or item identity.' using errcode='22023';
  end if;
  insert into public.consumable_archive_events(consumable_id,kind,reason,actor_id,actor_name)
    values(old.id,event_kind,reason,actor.id,coalesce(actor.name,'Database maintenance'));
  return new;
end $$;
create trigger consumables_archive_guard before insert or update on public.consumables
for each row execute function mcpa_auth_private.consumables_archive_guard();

create function mcpa_auth_private.consumables_require_active()
returns trigger language plpgsql security definer set search_path='' as $$
declare item public.consumables;
begin
  -- Same item-first lock ordering as stock adjustment/receiving. Archival waits
  -- for an in-flight operation, and a new request cannot race past the archive.
  select * into item from public.consumables where id=new.consumable_id for update;
  if item.archived_at is not null then
    raise exception 'Consumable is archived. Restore it before new requests or stock operations.' using errcode='22023';
  end if;
  return new;
end $$;
create trigger consumable_requests_require_active before insert on public.consumable_requests
for each row execute function mcpa_auth_private.consumables_require_active();
create trigger consumable_movements_require_active before insert on public.consumable_stock_movements
for each row execute function mcpa_auth_private.consumables_require_active();

create function public.consumables_restore_item(p_id uuid,p_version integer,p_reason text)
returns public.consumables language plpgsql security definer set search_path='' as $$
declare actor public.profiles; item public.consumables; prior_id text; prior_reason text;
begin
  actor:=mcpa_auth_private.identity();
  if actor.role<>'admin' then raise exception 'Admin restoration required.' using errcode='42501';end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'A restoration reason is required.' using errcode='22023';end if;
  -- Match SKU allocation/import lock order. Active duplicate constraints still apply.
  perform pg_advisory_xact_lock(22026022);
  select * into item from public.consumables where id=p_id for update;
  if not found or item.version is distinct from p_version then raise exception 'Item changed. Refresh before restoring.' using errcode='40001';end if;
  if item.archived_at is null then raise exception 'Consumable is already active.' using errcode='22023';end if;
  prior_id:=current_setting('mcpa.consumable_restore_id',true);prior_reason:=current_setting('mcpa.consumable_restore_reason',true);
  perform set_config('mcpa.consumable_restore_id',p_id::text,true);
  perform set_config('mcpa.consumable_restore_reason',btrim(p_reason),true);
  update public.consumables set archived_at=null,archive_reason=null,version=version+1,updated_at=clock_timestamp()
    where id=p_id returning * into item;
  perform set_config('mcpa.consumable_restore_id',coalesce(prior_id,''),true);
  perform set_config('mcpa.consumable_restore_reason',coalesce(prior_reason,''),true);
  return item;
end $$;

-- Preserve old purchase links, but reject a new link to an archived consumable.
-- The existing purchase/history/security functions are not replaced.
create function mcpa_auth_private.consumables_purchase_active_link()
returns trigger language plpgsql security definer set search_path='' as $$
declare item public.consumables;
begin
  if tg_op='UPDATE' and new.request_id is not distinct from old.request_id then return new;end if;
  if new.request_id is not null then
    select c.* into item from public.consumables c join public.consumable_requests r on r.consumable_id=c.id
      where r.id=new.request_id for update of c;
    if item.archived_at is not null then raise exception 'Cannot link a new purchase to archived inventory.' using errcode='22023';end if;
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('public.mcpa_purchases') is not null then
    execute 'create trigger consumables_purchase_active_link before insert or update on public.mcpa_purchases for each row execute function mcpa_auth_private.consumables_purchase_active_link()';
  end if;
end $$;
-- Add archive state to authorized request choices, retaining historical request rows.
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
          'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'request_number',request_number,'item_name',item_name,'item_code',item_code,'specification',specification,'status',status,'consumable_archived',exists(select 1 from public.consumables c where c.id=consumable_id and c.archived_at is not null)) order by request_number desc) from public.consumable_requests),'[]'::jsonb),
          'history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('actor_name',a.name) order by h.created_at desc) from public.mcpa_purchase_history h join public.profiles a on a.id=h.actor_id),'[]'::jsonb));
      end $body$;
    $definition$;
  end if;
end $upgrade$;
revoke all on function mcpa_auth_private.consumables_archive_guard(),mcpa_auth_private.consumables_require_active(),
  mcpa_auth_private.consumables_purchase_active_link() from public,anon,authenticated;
revoke all on function public.consumables_restore_item(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.consumables_restore_item(uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;

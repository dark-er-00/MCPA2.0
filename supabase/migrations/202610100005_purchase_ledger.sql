-- Local implementation only: review and apply after feature_storage.sql.
-- Record-only procurement ledger. No stock, approvals or existing requests change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
 if to_regprocedure('mcpa_auth_private.identity()') is null or to_regclass('public.consumable_requests') is null
  or to_regclass('storage.objects') is null then raise exception 'Authenticated materials and private storage setup are required.';end if;
end $$;

create table public.mcpa_purchases (
 id uuid primary key,
 purchase_number bigint generated always as identity unique,
 supplier text not null check(char_length(btrim(supplier)) between 1 and 160),
 reference text not null check(char_length(btrim(reference)) between 1 and 120),
 purchase_date date not null,
 request_id uuid references public.consumable_requests(id) on delete restrict,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
 total numeric(18,2) not null check(total>=0 and total<10000000000000000),
 receipt_path text,
 notes text not null default '' check(char_length(notes)<=2000),
 version integer not null default 1 check(version>0),
 created_by uuid not null references public.profiles(id) on delete restrict,
 updated_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index mcpa_purchase_reference on public.mcpa_purchases(lower(btrim(supplier)),lower(btrim(reference)),purchase_date);
create index mcpa_purchase_date on public.mcpa_purchases(purchase_date desc);
create index mcpa_purchase_request on public.mcpa_purchases(request_id) where request_id is not null;
create table public.mcpa_purchase_history (
 operation_id uuid primary key,
 purchase_id uuid not null references public.mcpa_purchases(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 input jsonb not null,
 before_record jsonb,
 after_record jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.mcpa_purchases enable row level security;
alter table public.mcpa_purchase_history enable row level security;
revoke all on public.mcpa_purchases,public.mcpa_purchase_history from public,anon,authenticated;
grant select on public.mcpa_purchases,public.mcpa_purchase_history to authenticated;
create policy mcpa_purchase_read on public.mcpa_purchases for select to authenticated using(public.mcpa_has_role(array['admin','secretary']));
create policy mcpa_purchase_history_read on public.mcpa_purchase_history for select to authenticated using(public.mcpa_has_role(array['admin','secretary']));

create function mcpa_auth_private.purchase_history_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Purchase history is append-only.' using errcode='42501';end $$;
create trigger mcpa_purchase_history_immutable before update or delete on public.mcpa_purchase_history for each row execute function mcpa_auth_private.purchase_history_immutable();
create trigger mcpa_purchase_history_no_truncate before truncate on public.mcpa_purchase_history for each statement execute function mcpa_auth_private.purchase_history_immutable();

create function public.mcpa_save_purchase(p_id uuid,p_version integer,p_operation_id uuid,p_record jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; prior public.mcpa_purchases; saved public.mcpa_purchases; existing public.mcpa_purchase_history;
 line jsonb; lines jsonb:='[]'::jsonb; quantity numeric; price numeric; amount numeric:=0; link uuid; receipt text; purchased date;
begin
 actor:=mcpa_auth_private.identity();
 if actor.role not in ('admin','secretary') then raise exception 'Materials access required.' using errcode='42501';end if;
 if p_id is null or p_operation_id is null or jsonb_typeof(p_record) is distinct from 'object' or octet_length(p_record::text)>131072 then raise exception 'Valid purchase and operation IDs and a bounded purchase record are required.' using errcode='22023';end if;
 if jsonb_typeof(p_record->'supplier') is distinct from 'string' or char_length(btrim(p_record->>'supplier')) not between 1 and 160
  or jsonb_typeof(p_record->'reference') is distinct from 'string' or char_length(btrim(p_record->>'reference')) not between 1 and 120
  or char_length(coalesce(p_record->>'notes',''))>2000 then raise exception 'Enter a supplier, reference and notes within the allowed lengths.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 select * into existing from public.mcpa_purchase_history where operation_id=p_operation_id;
 if found then
  if existing.purchase_id<>p_id or existing.actor_id<>actor.id or existing.input is distinct from jsonb_build_object('version',p_version,'record',p_record) then raise exception 'This save was already submitted with different values.' using errcode='40001';end if;
  return existing.after_record;
 end if;
 if jsonb_typeof(p_record->'items') is distinct from 'array' or jsonb_array_length(p_record->'items') not between 1 and 100 then raise exception 'Add between one and 100 purchase items.' using errcode='22023';end if;
 for line in select * from jsonb_array_elements(p_record->'items') loop
  if jsonb_typeof(line) is distinct from 'object' or jsonb_typeof(line->'description') is distinct from 'string' or char_length(btrim(coalesce(line->>'description',''))) not between 1 and 300
   or coalesce(line->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,3})?$' or coalesce(line->>'unit_price','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Item descriptions, positive quantities and prices with at most two decimal places are required.' using errcode='22023';end if;
  quantity:=(line->>'quantity')::numeric;price:=(line->>'unit_price')::numeric;
  if quantity<=0 or quantity>=1000000000 or price>=1000000000000 then raise exception 'Purchase quantities or prices exceed the allowed limits.' using errcode='22023';end if;
  amount:=amount+round(quantity*price,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('description',btrim(line->>'description'),'quantity',quantity,'unit_price',price,'total',round(quantity*price,2)));
 end loop;
 if amount>=10000000000000000 then raise exception 'Purchase total exceeds the allowed limit.' using errcode='22023';end if;
 if coalesce(p_record->>'purchase_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter a purchase date.' using errcode='22023';end if;
 purchased:=(p_record->>'purchase_date')::date;
 link:=nullif(p_record->>'request_id','')::uuid;
 if link is not null and not exists(select 1 from public.consumable_requests where id=link) then raise exception 'The linked Material Request no longer exists.' using errcode='22023';end if;
 select * into prior from public.mcpa_purchases where id=p_id for update;
 if (prior.id is null and p_version is not null) or (prior.id is not null and prior.version is distinct from p_version) then raise exception 'This purchase changed. Reopen it before saving.' using errcode='40001';end if;
 receipt:=case when p_record ? 'receipt_path' then nullif(p_record->>'receipt_path','') else prior.receipt_path end;
 if receipt is not null and (receipt !~ ('^'||p_id::text||'/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') or not exists(select 1 from storage.objects where bucket_id='purchase-receipts' and name=receipt)) then raise exception 'Upload the receipt for this purchase before saving.' using errcode='22023';end if;
 if prior.id is null then
  insert into public.mcpa_purchases(id,supplier,reference,purchase_date,request_id,items,total,receipt_path,notes,created_by,updated_by)
   values(p_id,btrim(p_record->>'supplier'),btrim(p_record->>'reference'),purchased,link,lines,amount,receipt,coalesce(p_record->>'notes',''),actor.id,actor.id) returning * into saved;
 else
  update public.mcpa_purchases set supplier=btrim(p_record->>'supplier'),reference=btrim(p_record->>'reference'),purchase_date=purchased,request_id=link,items=lines,total=amount,receipt_path=receipt,notes=coalesce(p_record->>'notes',''),version=version+1,updated_by=actor.id,updated_at=clock_timestamp() where id=p_id returning * into saved;
 end if;
 insert into public.mcpa_purchase_history(operation_id,purchase_id,actor_id,input,before_record,after_record)
  values(p_operation_id,p_id,actor.id,jsonb_build_object('version',p_version,'record',p_record),case when prior.id is null then null else to_jsonb(prior) end,to_jsonb(saved));
 return to_jsonb(saved);
end $$;

create function public.mcpa_purchase_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
 actor:=mcpa_auth_private.identity();if actor.role not in ('admin','secretary') then raise exception 'Materials access required.' using errcode='42501';end if;
 return jsonb_build_object('purchases',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('delivery_status',coalesce(r.status,'unlinked'),'request_number',r.request_number,'created_by_name',c.name,'updated_by_name',u.name) order by p.purchase_date desc,p.purchase_number desc) from public.mcpa_purchases p left join public.consumable_requests r on r.id=p.request_id left join public.profiles c on c.id=p.created_by left join public.profiles u on u.id=p.updated_by),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'request_number',request_number,'item_name',item_name,'status',status) order by request_number desc) from public.consumable_requests),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('actor_name',a.name) order by h.created_at desc) from public.mcpa_purchase_history h join public.profiles a on a.id=h.actor_id),'[]'::jsonb));
end $$;
revoke all on function public.mcpa_save_purchase(uuid,integer,uuid,jsonb),public.mcpa_purchase_snapshot() from public,anon,authenticated;
grant execute on function public.mcpa_save_purchase(uuid,integer,uuid,jsonb),public.mcpa_purchase_snapshot() to authenticated;
revoke all on function mcpa_auth_private.purchase_history_immutable() from public,anon,authenticated;
commit;

-- REVIEW ONLY: run equipment-import-preflight.sql before deploying this migration.
-- New inventory only; no existing equipment, custody or movement records change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.equipment in share row exclusive mode;

do $$
declare policy_check text;
begin
  if to_regprocedure('mcpa_auth_private.office_return_site()') is null
    or to_regprocedure('public.mcpa_inventory_office()') is null then
    raise exception 'Install and verify the canonical Office inventory migrations first.';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.equipment'::regclass) then
    raise exception 'Equipment RLS must be enabled.';
  end if;
  -- The narrowly scoped definer RPC applies the reviewed Admin/Office/AVAILABLE/
  -- no-holder INSERT policy explicitly. Refuse custom policies that it might bypass.
  if (select count(*) from pg_policies where schemaname='public' and tablename='equipment' and cmd in ('INSERT','ALL'))<>1 then
    raise exception 'Unexpected equipment INSERT policies. Review the preflight.';
  end if;
  select lower(regexp_replace(replace(replace(with_check,'public.',''),'::text',''),'[[:space:]()]','','g'))
    into policy_check from pg_policies where schemaname='public' and tablename='equipment'
      and policyname='mcpa_equipment_insert' and cmd='INSERT' and roles=array['authenticated']::name[];
  if policy_check is distinct from 'mcpa_has_rolearray[''admin'',''tool_handler'']andcurrent_holder_idisnullandsite_id=mcpa_inventory_office->>''id''::uuidandstatus=''available''' then
    raise exception 'Equipment INSERT policy differs from the verified Office policy. Review before deployment.';
  end if;
  if not exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attname='asset_id'
    where i.indrelid='public.equipment'::regclass and i.indisunique and i.indisvalid
      and i.indnkeyatts=1 and i.indkey[0]=a.attnum and i.indpred is null and i.indexprs is null) then
    raise exception 'A non-partial unique Asset ID constraint is required.';
  end if;
  if exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attname='name'
    where i.indrelid='public.equipment'::regclass and i.indisunique and i.indnkeyatts=1 and i.indkey[0]=a.attnum) then
    raise exception 'Review the existing unique equipment-name index before enabling identical-name imports.';
  end if;
end $$;

-- Shared INSERT boundary: old manual clients may supply their photo-linked tag.
-- Missing tags use the exact existing T- + first 16 uppercase UUID hex format.
-- Serialize ALL inserts (including explicit manual tags); unique index is the final guard.
create function mcpa_auth_private.equipment_asset_id()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('mcpa:equipment-asset-id',0));
  if new.asset_id is null then
    loop
      new.asset_id := 'T-' || upper(left(replace(gen_random_uuid()::text,'-',''),16));
      exit when not exists(select 1 from public.equipment where asset_id=new.asset_id);
    end loop;
  end if;
  return new;
end $$;
revoke all on function mcpa_auth_private.equipment_asset_id() from public,anon,authenticated,service_role;
create trigger mcpa_equipment_asset_id before insert on public.equipment
  for each row execute function mcpa_auth_private.equipment_asset_id();

create table public.mcpa_equipment_imports (
  operation_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  payload_digest text not null,
  result jsonb not null
);
alter table public.mcpa_equipment_imports enable row level security;
revoke all on public.mcpa_equipment_imports from public,anon,authenticated,service_role;
grant select on public.mcpa_equipment_imports to authenticated;
create policy mcpa_equipment_imports_read on public.mcpa_equipment_imports for select to authenticated
  using(public.mcpa_has_role(array['admin']));
create function mcpa_auth_private.equipment_import_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Equipment import receipts are immutable.' using errcode='42501'; end $$;
revoke all on function mcpa_auth_private.equipment_import_immutable() from public,anon,authenticated,service_role;
create trigger mcpa_equipment_import_immutable before update or delete on public.mcpa_equipment_imports
  for each row execute function mcpa_auth_private.equipment_import_immutable();

create function public.mcpa_import_equipment(p_operation_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles; office public.sites; receipt public.mcpa_equipment_imports;
  r jsonb; k text; v text; source integer; qty integer; tracking text; cond text;
  item public.equipment; results jsonb:='[]'; seen integer[]:='{}'; digest text; detail text;
begin
  actor:=mcpa_auth_private.identity();
  if actor.role is distinct from 'admin' then raise exception 'Only Admin can import equipment.' using errcode='42501'; end if;
  if p_operation_id is null then raise exception 'Import operation ID is required.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Equipment rows must be an array.'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>2097152 then
    raise exception 'Import requires 1 to 500 rows and at most 2 MiB of row data.';
  end if;
  digest:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('mcpa:equipment-import:'||p_operation_id::text,0));
  select * into receipt from public.mcpa_equipment_imports where operation_id=p_operation_id;
  if found then
    if receipt.actor_id<>actor.id or receipt.payload_digest<>digest then
      raise exception 'Import operation already belongs to a different account or payload.' using errcode='22023';
    end if;
    return receipt.result;
  end if;
  office:=mcpa_auth_private.office_return_site();
  if office.id is null then
    raise exception 'Canonical Office inventory configuration is missing. Contact Admin.' using errcode='22023';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    source:=null;
    begin
      if jsonb_typeof(r) is distinct from 'object' then raise exception 'Expected a row object.'; end if;
      if jsonb_typeof(r->'source_row') is distinct from 'number' or (r->>'source_row') !~ '^[0-9]{1,7}$' then
        raise exception 'Original spreadsheet row number is required.';
      end if;
      source:=(r->>'source_row')::integer;
      if source<2 or source>1000000 or source=any(seen) then raise exception 'Invalid or repeated source row.'; end if;
      seen:=array_append(seen,source);
      for k,v in select key,value from jsonb_each_text(r) loop
        if k not in ('source_row','name','category','brand','model','serial_number','condition','tracking_type','quantity','unit','details') then
          raise exception 'Unsupported column: %. Custody, dates and deployment are excluded.',k;
        end if;
        if k not in ('quantity','source_row') then
          if jsonb_typeof(r->k) is distinct from 'string' then raise exception '% must be text.',k; end if;
          if char_length(v)>(case when k='details' then 2000 else 240 end) or v ~ '[[:cntrl:]]' or btrim(v) ~ '^[=+@]' then
            raise exception '% is too long or contains a formula/control character.',k;
          end if;
        end if;
      end loop;
      if coalesce(btrim(r->>'name'),'')='' then raise exception 'Item Name is required.'; end if;
      if coalesce(r->>'category','') not in ('Hand Tools','Power Tools','Equipment','Scaffolding','Construction Materials','Water & Plumbing','Electrical','Appliances','Storage Containers','Other') then
        raise exception 'Select a supported Category.';
      end if;
      tracking:=r->>'tracking_type';
      if coalesce(tracking,'') not in ('Individual','Bulk') then raise exception 'Tracking Type must be Individual or Bulk.'; end if;
      cond:=coalesce(nullif(r->>'condition',''),'Good');
      if cond not in ('Good','Fair','Damaged','Needs Inspection','Not Assessed') then raise exception 'Unsupported Condition.'; end if;
      if jsonb_typeof(r->'quantity') is distinct from 'number' or (r->>'quantity') !~ '^[0-9]{1,10}$' then raise exception 'Quantity must be a positive whole number.'; end if;
      qty:=(r->>'quantity')::integer;
      if qty<1 or (tracking='Individual' and qty<>1) then raise exception 'Individual quantity must be 1; Bulk quantity must be positive.'; end if;
      if tracking='Bulk' and coalesce(r->>'unit','')<>'' and r->>'unit' not in ('Pieces','Sets','Meters','Kilograms','Liters','Boxes','Rolls','Other') then
        raise exception 'Select a supported Unit or leave it blank.';
      end if;
      if tracking='Individual' and coalesce(r->>'unit','')<>'' then raise exception 'Unit is only supported for Bulk rows.'; end if;
      insert into public.equipment(id,asset_id,name,category,brand,model,serial_number,condition,tracking_type,quantity,unit,details,status,site_id,current_holder_id)
      values(gen_random_uuid(),null,btrim(r->>'name'),r->>'category',coalesce(r->>'brand',''),coalesce(r->>'model',''),coalesce(r->>'serial_number',''),
        cond,tracking,qty,case when tracking='Bulk' then r->>'unit' else null end,coalesce(r->>'details',''),'AVAILABLE',office.id,null)
      returning * into item;
      results:=results||jsonb_build_array(jsonb_build_object('source_row',source,'id',item.id,'asset_id',item.asset_id,'name',item.name,'quantity',item.quantity));
    exception when others then
      get stacked diagnostics detail=MESSAGE_TEXT;
      raise exception 'Spreadsheet row %: %. No rows were imported.',coalesce(source::text,'?'),detail using errcode='22023';
    end;
  end loop;
  results:=jsonb_build_object('operation_id',p_operation_id,'actor_id',actor.id,'created_at',clock_timestamp(),
    'created',jsonb_array_length(results),'rejected',0,'assets',results);
  insert into public.mcpa_equipment_imports(operation_id,actor_id,payload_digest,result) values(p_operation_id,actor.id,digest,results);
  return results;
end $$;
revoke all on function public.mcpa_import_equipment(uuid,jsonb) from public,anon,service_role;
grant execute on function public.mcpa_import_equipment(uuid,jsonb) to authenticated;
comment on function public.mcpa_import_equipment(uuid,jsonb) is 'MCPA equipment import v1: Admin only, atomic, idempotent, canonical Office inventory';
notify pgrst,'reload schema';
commit;

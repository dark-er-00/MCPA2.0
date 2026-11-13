-- REVIEW DRAFT ONLY. Not a deployed migration. No remote execution authorized.
-- Narrow authenticated reader for Engineer Equipment Inventory; no writes or RLS changes.
create or replace function public.mcpa_engineer_equipment_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; personal jsonb; catalog jsonb; tools jsonb; sites jsonb; office_id uuid;
begin
  p:=mcpa_auth_private.identity();
  if p.role<>'engineer' then raise exception 'Engineer access required.' using errcode='42501';end if;
  office_id:=(public.mcpa_inventory_office()->>'id')::uuid;
  if office_id is null then raise exception 'Office configuration could not be verified.';end if;
  personal:=public.mcpa_personal_equipment_snapshot();
  catalog:=public.mcpa_movement_snapshot();
  select coalesce(jsonb_agg(t.value order by t.value->>'id'),'[]'::jsonb) into tools
    from jsonb_array_elements(catalog->'tools') t(value)
    join public.equipment e on e.id::text=t.value->>'dbId'
    where e.current_holder_id=p.id
      and e.site_id<>office_id
      and exists(select 1 from public.sites assigned_site where assigned_site.id=e.site_id
        and assigned_site.assigned_engineer_id=p.id and assigned_site.is_active=true and assigned_site.archived_at is null)
      and not mcpa_auth_private.b_retired(e.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
      'is_active',s.is_active,'assigned_engineer_id',s.assigned_engineer_id) order by s.name),'[]'::jsonb)
    into sites from public.sites s where s.is_active=true and s.assigned_engineer_id=p.id
      and s.archived_at is null and s.id<>office_id;
  return personal||jsonb_build_object('tools',tools,'sites',sites,'engineerInventoryVersion',2,'officeId',office_id,
    'inventoryAvailabilityVersion',catalog->'inventoryAvailabilityVersion',
    'inventoryVerificationRevision',catalog->'inventoryVerificationRevision',
    'integrationVersion',catalog->'integrationVersion');
end $$;
revoke all on function public.mcpa_engineer_equipment_snapshot() from public,anon;
grant execute on function public.mcpa_engineer_equipment_snapshot() to authenticated;

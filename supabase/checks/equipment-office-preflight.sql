-- READ ONLY: installation metadata and equipment with an unknown physical location.
-- Eligibility is NOT evidence that an asset is physically at Office.
select jsonb_build_object(
  'office_locations',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
    'location',s.location,'is_active',s.is_active) order by s.name,s.id)
    from public.sites s where s.name ~* '\moffice\M'),'[]'::jsonb),
  'office_configuration_installed',to_regclass('mcpa_auth_private.return_office') is not null,
  'office_resolver_installed',to_regprocedure('mcpa_auth_private.office_return_site()') is not null,
  'inventory_office_rpc_installed',to_regprocedure('public.mcpa_inventory_office()') is not null,
  'equipment_rls',(select relrowsecurity from pg_class where oid='public.equipment'::regclass),
  'equipment_insert_policies',coalesce((select jsonb_agg(jsonb_build_object('name',policyname,
    'roles',roles,'command',cmd,'check',with_check) order by policyname)
    from pg_policies where schemaname='public' and tablename='equipment' and cmd in ('INSERT','ALL')),'[]'::jsonb),
  'equipment_office_trigger_installed',exists(select 1 from pg_trigger
    where tgrelid='public.equipment'::regclass and tgname='mcpa_new_equipment_office' and not tgisinternal and tgenabled in ('O','A')),
  'unassigned_location_equipment',coalesce((select jsonb_agg(jsonb_build_object(
    'asset_id',e.asset_id,'name',e.name,'status',e.status::text,'quantity',e.quantity,
    'has_custodian',e.current_holder_id is not null,
    'reserved_or_active_handover',busy.value,
    'eligible_only_after_physical_confirmation',e.current_holder_id is null and e.quantity>0
      and regexp_replace(lower(e.status::text),'[ _-]','','g') in ('available','inoffice') and not busy.value
    ) order by e.asset_id)
    from public.equipment e cross join lateral(select
      exists(select 1 from public.mcpa_movement_reservations r where r.equipment_id=e.id)
      or exists(select 1 from public.mcpa_movement_assets a join public.mcpa_movements m on m.id=a.movement_id
        where a.equipment_id=e.id and (m.kind='transfer' and m.data->>'status' in ('pending','refused')
          or m.kind='repair' and m.data->>'status' in ('reported','underrepair')
          or m.kind='missing' and m.data->>'status'='missing')) as value) busy
    where e.site_id is null),'[]'::jsonb)
) as equipment_office_preflight;

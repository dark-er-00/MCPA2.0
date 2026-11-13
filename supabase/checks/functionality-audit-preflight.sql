-- READ ONLY. Review against the intended target; never applies changes.
select jsonb_build_object(
  'identity',to_regprocedure('mcpa_auth_private.identity()') is not null,
  'account_jobs',to_regclass('public.mcpa_account_invitations') is not null,
  'account_audit',to_regclass('public.mcpa_account_audit') is not null,
  'integrated_materials',to_regclass('public.mcpa_wa_material_items') is not null,
  'read_rpc_correction',to_regprocedure('mcpa_auth_private.wa_read_actor(text[])') is not null,
  'profile_edit_installed',to_regprocedure('public.mcpa_update_my_profile(text,text)') is not null,
  'quantity_guard_installed',to_regprocedure('mcpa_auth_private.consumable_quantity_guard()') is not null,
  'invitation_entrypoint_removed',to_regprocedure('public.mcpa_invitation_step(uuid,text,jsonb)') is null,
  'rls', (select jsonb_object_agg(relname,relrowsecurity) from pg_class where oid in (
    to_regclass('public.profiles'),to_regclass('public.consumables'),to_regclass('public.consumable_stock_movements'),
    to_regclass('public.mcpa_wa_material_requests'),to_regclass('public.mcpa_wa_material_items'),to_regclass('public.mcpa_account_invitations')))
) as functionality_audit_preflight;

-- Report historical fractions, without rounding or changing any records.
select count(*) as legacy_count_items_with_fractional_stock
from public.consumables where regexp_replace(lower(btrim(unit)),'\.+$','') ~
  '^(pcs?|pieces?|bags?|box(es)?|sets?|pairs?|rolls?|sheets?|tubes?|packs?|bottles?|bundles?|cans?|lengths?|units?|each|ea|sacks?)$'
  and current_stock<>trunc(current_stock);

select r.status,count(*) as legacy_fractional_count_request_lines
from public.mcpa_wa_material_items i join public.mcpa_wa_material_requests r on r.id=i.request_id
where regexp_replace(lower(btrim(i.unit)),'\.+$','') ~
  '^(pcs?|pieces?|bags?|box(es)?|sets?|pairs?|rolls?|sheets?|tubes?|packs?|bottles?|bundles?|cans?|lengths?|units?|each|ea|sacks?)$'
  and (i.requested_quantity<>trunc(i.requested_quantity) or i.approved_quantity<>trunc(i.approved_quantity))
group by r.status;

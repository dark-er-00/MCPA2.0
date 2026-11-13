-- READ ONLY. Run only after the individually reviewed profile, quantity and invitation-removal migrations.
select jsonb_build_object(
  'profile_rpc_authenticated',has_function_privilege('authenticated','public.mcpa_update_my_profile(text,text)','EXECUTE'),
  'profile_rpc_anonymous_blocked',not has_function_privilege('anon','public.mcpa_update_my_profile(text,text)','EXECUTE'),
  'direct_profile_writes_blocked',not has_table_privilege('authenticated','public.profiles','UPDATE')
    and not has_any_column_privilege('authenticated','public.profiles','UPDATE'),
  'invitation_rpc_removed',to_regprocedure('public.mcpa_invitation_step(uuid,text,jsonb)') is null,
  'private_invitation_rpc_removed',to_regprocedure('mcpa_auth_private.mcpa_invitation_step(uuid,text,jsonb)') is null,
  'quantity_guards',(select count(*) from pg_trigger where not tgisinternal
    and tgname in ('consumable_whole_item','consumable_whole_request','consumable_whole_line','consumable_whole_movement')),
  'rls_preserved',(select bool_and(relrowsecurity) from pg_class where oid in (
    'public.profiles'::regclass,'public.consumables'::regclass,'public.consumable_stock_movements'::regclass,
    'public.mcpa_wa_material_requests'::regclass,'public.mcpa_wa_material_items'::regclass,'public.mcpa_account_invitations'::regclass))
) as functionality_audit_verification;

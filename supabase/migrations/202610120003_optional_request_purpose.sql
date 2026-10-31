-- REVIEW BEFORE MANUAL DEPLOYMENT. This changes one validation statement only.
-- Requires the stable-recipient migration 202610060002. No row writes, grants,
-- profile changes, custody changes, trigger changes or public gateway changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $migration$
declare
  target regprocedure := to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)');
  definition text;
  old_check text := $old$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;$old$;
  new_check text := $new$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$new$;
begin
  if target is null then raise exception 'Private movement implementation is missing. Stop and review.'; end if;
  definition := pg_get_functiondef(target);
  if strpos(definition,$identity$v_receiver_id := nullif(p_payload->>'receiverId','')::uuid;$identity$)=0 then
    raise exception 'Stable recipient identity is not installed. Stop and review.';
  end if;
  if strpos(definition,old_check)>0 then
    if (length(definition)-length(replace(definition,old_check,'')))/length(old_check)<>1 then
      raise exception 'Unexpected purpose validation definition. Stop and review.';
    end if;
    -- Preserve the installed function including every authorization, reservation,
    -- idempotency, condition, audit and QR-related call. Abort on unknown drift.
    execute replace(definition,old_check,new_check);
  elsif strpos(definition,new_check)=0 then
    raise exception 'Purpose validation differs from the reviewed implementation. Stop and review.';
  end if;
end $migration$;
notify pgrst,'reload schema';
commit;

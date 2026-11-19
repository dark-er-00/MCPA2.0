-- DRAFT ONLY. Requires approval; apply once after the existing self-profile draft.
begin;
create table public.mcpa_profile_pictures(profile_id uuid primary key references public.profiles(id) on delete restrict, object_name text not null, updated_at timestamptz not null default now());
alter table public.mcpa_profile_pictures enable row level security;
revoke all on public.mcpa_profile_pictures from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('mcpa-profile-photos','mcpa-profile-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
create function mcpa_auth_private.own_profile_photo(p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;begin actor:=mcpa_auth_private.identity();return p_name ~ ('^'||actor.id::text||'/[a-f0-9-]{36}\.(jpg|png|webp)$');exception when others then return false;end $$;
create function public.mcpa_my_profile_picture() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;begin actor:=mcpa_auth_private.identity();return jsonb_build_object('version',1,'object_name',(select object_name from public.mcpa_profile_pictures where profile_id=actor.id));end $$;
create function public.mcpa_set_my_profile_picture(p_object_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles;meta jsonb;begin actor:=mcpa_auth_private.identity();
 perform 1 from public.profiles where id=actor.id for update;actor:=mcpa_auth_private.identity();
 if not mcpa_auth_private.own_profile_photo(p_object_name) then raise exception 'Only your own photo can be saved.' using errcode='42501';end if;
 select metadata into meta from storage.objects where bucket_id='mcpa-profile-photos' and name=p_object_name for key share;
 if not found or meta->>'mimetype' not in ('image/jpeg','image/png','image/webp') or coalesce(meta->>'size','')!~'^[0-9]{1,10}$' then raise exception 'Upload a supported image first.' using errcode='22023';end if;
 if (meta->>'size')::bigint not between 1 and 2097152 then raise exception 'Photo must be at most 2 MiB.' using errcode='22023';end if;
 insert into public.mcpa_profile_pictures(profile_id,object_name) values(actor.id,p_object_name) on conflict(profile_id) do update set object_name=excluded.object_name,updated_at=clock_timestamp();
 insert into public.mcpa_account_audit(actor_id,profile_id,event) values(actor.id,actor.id,'profile_picture_changed');return public.mcpa_my_profile_picture();end $$;
create policy mcpa_profile_photo_read on storage.objects for select to authenticated using(bucket_id='mcpa-profile-photos' and mcpa_auth_private.own_profile_photo(name));
create policy mcpa_profile_photo_insert on storage.objects for insert to authenticated with check(bucket_id='mcpa-profile-photos' and mcpa_auth_private.own_profile_photo(name));
-- Automatic deletion is deliberately unavailable: a policy-only unused check races pointer saves.
-- Orphan cleanup requires a separately reviewed maintenance transaction.
-- Restrictive boundaries keep broad pre-existing permissive Storage policies from opening this bucket.
create policy mcpa_profile_photo_boundary_read on storage.objects as restrictive for select to authenticated using(bucket_id<>'mcpa-profile-photos' or mcpa_auth_private.own_profile_photo(name));
create policy mcpa_profile_photo_boundary_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'mcpa-profile-photos' or mcpa_auth_private.own_profile_photo(name));
create policy mcpa_profile_photo_boundary_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'mcpa-profile-photos') with check(bucket_id<>'mcpa-profile-photos');
create policy mcpa_profile_photo_boundary_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'mcpa-profile-photos');
create policy mcpa_profile_photo_boundary_anon on storage.objects as restrictive for all to anon using(bucket_id<>'mcpa-profile-photos') with check(bucket_id<>'mcpa-profile-photos');
revoke all on function mcpa_auth_private.own_profile_photo(text),public.mcpa_my_profile_picture(),public.mcpa_set_my_profile_picture(text) from public,anon,authenticated;
grant execute on function mcpa_auth_private.own_profile_photo(text),public.mcpa_my_profile_picture(),public.mcpa_set_my_profile_picture(text) to authenticated;
notify pgrst,'reload schema';
commit;

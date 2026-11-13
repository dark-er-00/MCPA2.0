-- READ ONLY. Run ONLY after diagnostics confirms return_office exists with the
-- reviewed singleton/site_id schema. No application function is executed.
-- Zero rows, inactive/missing site, non-singleton or duplicate name blocks returns.
select c.singleton,c.site_id,s.name,s.location,s.is_active,
  (select count(*) from mcpa_auth_private.return_office)=1 as exactly_one_configuration,
  (select count(*) from public.sites other where other.name=s.name)=1 as unique_destination_name,
  c.site_id=null::uuid as matches_separately_verified_office_requires_configuration
from mcpa_auth_private.return_office c left join public.sites s on s.id=c.site_id;

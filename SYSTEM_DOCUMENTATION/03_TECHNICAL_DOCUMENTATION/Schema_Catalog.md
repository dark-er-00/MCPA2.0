# Repository schema catalog

Reviewed 20 October 2026 (Asia/Manila), revision a5d51b3. This is a documentation extract, not executable installation instructions or a production catalog. No SQL was executed.

Twenty-one unique application tables have explicit repository CREATE TABLE bodies. The referenced profiles/equipment tables bring the documented application entities to 23; original DDL is incomplete. Managed auth.users/storage tables are external context. Definitions below are literal table-body extracts, without data records. Later ALTER statements and effective production state must be reviewed separately.

## Incomplete core entities

- public.profiles: UUID id and its primary key are asserted in the authenticated/independent-identity migrations. name is required by consumers; original name type/nullability/default is NEEDS VERIFICATION. Added definitions: auth_user_id UUID FK → auth.users(id) ON DELETE SET NULL; role text; account_status text NOT NULL default inactive; updated_at timestamptz NOT NULL default now(). Non-null Auth links have a unique partial index. Active supported roles: admin, secretary, tool_handler, engineer, architect. Person ID is independent of Auth ID after the reviewed identity migration.
- public.equipment: referenced UUID id; original PK declaration NEEDS VERIFICATION. Consumers require asset_id/name/category/brand/quantity/status/site_id/current_holder_id. Optional to_jsonb reads include model, serial_number, condition, unit, tracking_type, photo_url and color; this alone does not prove column existence/type. Admin form also writes details and those metadata fields. image_url text is explicitly added by feature_storage. Original equipment site/holder FK definitions, asset-code uniqueness, full enum/defaults/nullability and constraints NEEDS VERIFICATION.

Sources: supabase/migrations/202610040001_authenticated_access.sql:8; supabase/migrations/202610050002_independent_profile_identity.sql:43; supabase/migrations/202610100003_feature_storage.sql:56; 1-admin/modules/masterlist/masterlist.js.

## Foreign-key evidence register

Parent-to-child associations are foreign keys only when declared below. Required/nullable is from the table declaration, not inferred from current data. Unique child columns reduce the ordinary one-to-many FK shape to at most one.

| Child table | Referencing field / definition | Source |
| --- | --- | --- |
| public.consumable_requests | consumable_id uuid not null references public.consumables(id) on delete restrict | 1-admin/modules/consumables/setup.sql:22 |
| public.consumable_stock_movements | consumable_id uuid not null references public.consumables(id) on delete restrict | 1-admin/modules/consumables/setup.sql:42 |
| public.consumable_stock_movements | request_id uuid references public.consumable_requests(id) on delete restrict | 1-admin/modules/consumables/setup.sql:42 |
| public.mcpa_movements | actor_id uuid not null references public.profiles(id) on delete restrict | 1-admin/modules/movements/setup.sql:10 |
| public.mcpa_movements | destination_id uuid references public.sites(id) on delete restrict | 1-admin/modules/movements/setup.sql:10 |
| public.mcpa_movements | receiver_id uuid references public.profiles(id) on delete restrict | 1-admin/modules/movements/setup.sql:10 |
| public.mcpa_movement_assets | movement_id text not null references public.mcpa_movements(id) on delete restrict | 1-admin/modules/movements/setup.sql:20 |
| public.mcpa_movement_assets | equipment_id uuid not null references public.equipment(id) on delete restrict | 1-admin/modules/movements/setup.sql:20 |
| public.mcpa_movement_reservations | equipment_id uuid primary key references public.equipment(id) on delete restrict | 1-admin/modules/movements/setup.sql:25 |
| public.mcpa_movement_reservations | movement_id text not null references public.mcpa_movements(id) on delete restrict | 1-admin/modules/movements/setup.sql:25 |
| public.mcpa_movement_sites | movement_id text not null references public.mcpa_movements(id) on delete restrict | 1-admin/modules/movements/setup.sql:29 |
| public.mcpa_movement_sites | site_id uuid not null references public.sites(id) on delete restrict | 1-admin/modules/movements/setup.sql:29 |
| public.project_history | project_id uuid not null references public.sites(id) on delete restrict | supabase/migrations/202610100002_project_history.sql:54 |
| public.mcpa_account_invitations | profile_id uuid not null unique references public.profiles(id) on delete restrict | supabase/migrations/202610060001_account_management.sql:16 |
| public.mcpa_account_invitations | created_by uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610060001_account_management.sql:16 |
| public.mcpa_account_audit | actor_id uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610060001_account_management.sql:30 |
| public.mcpa_account_audit | profile_id uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610060001_account_management.sql:30 |
| public.mcpa_development_accounts | profile_id uuid unique references public.profiles(id) on delete restrict | supabase/migrations/202610060003_development_accounts.sql:7 |
| public.mcpa_development_accounts | created_by uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610060003_development_accounts.sql:7 |
| mcpa_auth_private.receiving_qr | receiver_id uuid not null references public.profiles(id) | supabase/migrations/202610100001_engineer_portal.sql:7 |
| mcpa_auth_private.receiving_qr | site_id uuid not null references public.sites(id) | supabase/migrations/202610100001_engineer_portal.sql:7 |
| public.mcpa_movement_cancellations | operation_id uuid not null references public.mcpa_movement_operations(id) on delete restrict | supabase/migrations/202610100004_movement_cancellation.sql:6 |
| public.mcpa_movement_cancellations | movement_id text not null references public.mcpa_movements(id) on delete restrict | supabase/migrations/202610100004_movement_cancellation.sql:6 |
| public.mcpa_movement_cancellations | actor_id uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610100004_movement_cancellation.sql:6 |
| public.mcpa_movement_refusals | operation_id uuid primary key references public.mcpa_movement_operations(id) on delete restrict | supabase/migrations/202610100004_movement_cancellation.sql:22 |
| public.mcpa_movement_refusals | movement_id text not null references public.mcpa_movements(id) on delete restrict | supabase/migrations/202610100004_movement_cancellation.sql:22 |
| public.mcpa_movement_refusals | actor_id uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610100004_movement_cancellation.sql:22 |
| public.mcpa_purchases | request_id uuid references public.consumable_requests(id) on delete restrict | supabase/migrations/202610100005_purchase_ledger.sql:11 |
| public.mcpa_purchases | created_by uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610100005_purchase_ledger.sql:11 |
| public.mcpa_purchases | updated_by uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610100005_purchase_ledger.sql:11 |
| public.mcpa_purchase_history | purchase_id uuid not null references public.mcpa_purchases(id) on delete restrict | supabase/migrations/202610100005_purchase_ledger.sql:31 |
| public.mcpa_purchase_history | actor_id uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610100005_purchase_ledger.sql:31 |
| public.mcpa_notifications | recipient_id uuid not null references public.profiles(id) on delete restrict | supabase/migrations/202610100006_monitoring.sql:23 |
| mcpa_auth_private.return_office | site_id uuid not null references public.sites(id) on delete restrict | supabase/migrations/202610120002_office_returns.sql:44 |
| public.profiles | auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL; unique non-null index | supabase/migrations/202610040001_authenticated_access.sql:22 |
| public.sites | assigned_engineer_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT; nullable | 1-admin/modules/sites/setup.sql:40; supabase/migrations/202610040001_authenticated_access.sql:27 |

equipment.site_id/current_holder_id are application associations with unverified original FKs. project_history.actor_id, notification.entity_id, operation activity/result links and Storage paths have no declared FK in the extracted repository definitions. JSON relationships are validated by workflow logic, not silently promoted to physical constraints.

## public.consumables

Source: 1-admin/modules/consumables/setup.sql:9.

```text
id uuid primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unit text not null check (char_length(btrim(unit)) between 1 and 30),
  current_stock numeric(12,3) not null default 0 check (current_stock >= 0 and current_stock < 1000000000),
  minimum_stock numeric(12,3) not null default 0 check (minimum_stock >= 0 and minimum_stock < 1000000000),
  stock_status text generated always as (case when current_stock = 0 then 'out' when current_stock < minimum_stock then 'low' else 'ok' end) stored,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
```

## public.consumable_requests

Source: 1-admin/modules/consumables/setup.sql:22.

```text
id uuid primary key,
  request_number bigint generated always as identity unique,
  consumable_id uuid not null references public.consumables(id) on delete restrict,
  item_name text not null,
  unit text not null,
  quantity numeric(12,3) not null check (quantity > 0 and quantity < 1000000000),
  received_quantity numeric(12,3) not null default 0 check (received_quantity >= 0 and received_quantity <= quantity),
  requester text not null check (char_length(btrim(requester)) between 1 and 120 and requester ~ '\S'),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 1000 and purpose ~ '\S'),
  needed_by date,
  status text not null default 'pending' check (status in ('pending','partial','received','cancelled')),
  cancellation_reason text check (char_length(btrim(cancellation_reason)) between 1 and 1000 and cancellation_reason ~ '\S'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and received_quantity = 0) or (status = 'partial' and received_quantity > 0 and received_quantity < quantity) or (status = 'received' and received_quantity = quantity) or (status = 'cancelled' and received_quantity < quantity and cancellation_reason is not null))
```

## public.consumable_stock_movements

Source: 1-admin/modules/consumables/setup.sql:42.

```text
id uuid primary key,
  consumable_id uuid not null references public.consumables(id) on delete restrict,
  request_id uuid references public.consumable_requests(id) on delete restrict,
  kind text not null check (kind in ('opening','usage','restock','correction','receipt')),
  quantity_change numeric(12,3) not null,
  balance_after numeric(12,3) not null check (balance_after >= 0 and balance_after < 1000000000),
  note text not null check (char_length(btrim(note)) between 1 and 1000 and note ~ '\S'),
  created_at timestamptz not null default now(),
  check ((kind = 'receipt' and request_id is not null and quantity_change > 0) or (kind <> 'receipt' and request_id is null)),
  check (kind not in ('restock','usage') or (kind = 'restock' and quantity_change > 0) or (kind = 'usage' and quantity_change < 0))
```

## public.mcpa_movements

Source: 1-admin/modules/movements/setup.sql:10.

```text
id text primary key,
  kind text not null check (kind in ('request','transfer','return','repair','missing')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  destination_id uuid references public.sites(id) on delete restrict,
  receiver_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check (data->>'id' = id)
```

## public.mcpa_movement_assets

Source: 1-admin/modules/movements/setup.sql:20.

```text
movement_id text not null references public.mcpa_movements(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  primary key (movement_id,equipment_id)
```

## public.mcpa_movement_reservations

Source: 1-admin/modules/movements/setup.sql:25.

```text
equipment_id uuid primary key references public.equipment(id) on delete restrict,
  movement_id text not null references public.mcpa_movements(id) on delete restrict
```

## public.mcpa_movement_sites

Source: 1-admin/modules/movements/setup.sql:29.

```text
movement_id text not null references public.mcpa_movements(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  primary key (movement_id,site_id)
```

## public.mcpa_movement_operations

Source: 1-admin/modules/movements/setup.sql:34.

```text
id uuid primary key,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  activity jsonb not null,
  created_at timestamptz not null default clock_timestamp()
```

## public.sites

Source: 1-admin/modules/sites/setup.sql:5.

```text
id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  location text not null check (char_length(btrim(location)) between 1 and 240),
  assigned_engineer text not null check (char_length(btrim(assigned_engineer)) between 1 and 120),
  phase text not null default '' check (char_length(btrim(phase)) <= 80),
  status text not null default 'planning'
    check (status in ('active', 'discrepancy', 'verified', 'turnover', 'idle', 'planning', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  last_inventory_check date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
```

## public.project_history

Source: supabase/migrations/202610100002_project_history.sql:54.

```text
id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sites(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  change_types text[] not null,
  before_values jsonb,
  after_values jsonb not null,
  actor_id uuid,
  actor_name text
```

## public.mcpa_account_invitations

Source: supabase/migrations/202610060001_account_management.sql:16.

```text
id uuid primary key,
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  email text not null unique,
  name text not null,
  role text not null check (role in ('engineer','architect','secretary','tool_handler')),
  state text not null default 'prepared' check (state in ('prepared','sent')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  lease_until timestamptz,
  lease_id uuid,
  attempts integer not null default 0
```

## public.mcpa_account_audit

Source: supabase/migrations/202610060001_account_management.sql:30.

```text
id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
```

## public.mcpa_development_accounts

Source: supabase/migrations/202610060003_development_accounts.sql:7.

```text
id uuid primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('engineer','architect')),
  profile_id uuid unique references public.profiles(id) on delete restrict,
  state text not null default 'prepared' check (state in ('prepared','created')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  check ((state='prepared' and profile_id is null) or (state='created' and profile_id is not null))
```

## mcpa_auth_private.receiving_qr

Source: supabase/migrations/202610100001_engineer_portal.sql:7.

```text
token_hash text primary key,
 receiver_id uuid not null references public.profiles(id),
 site_id uuid not null references public.sites(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
```

## public.mcpa_movement_cancellations

Source: supabase/migrations/202610100004_movement_cancellation.sql:6.

```text
operation_id uuid not null references public.mcpa_movement_operations(id) on delete restrict,
  movement_id text not null references public.mcpa_movements(id) on delete restrict,
  action text not null check (action in ('withdrawRequest','cancelReservation','cancelTransfer')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null,
  actor_role text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  canceled_at timestamptz not null,
  before_data jsonb not null check (jsonb_typeof(before_data)='object'),
  after_data jsonb not null check (jsonb_typeof(after_data)='object'),
  primary key (operation_id,movement_id)
```

## public.mcpa_movement_refusals

Source: supabase/migrations/202610100004_movement_cancellation.sql:22.

```text
operation_id uuid primary key references public.mcpa_movement_operations(id) on delete restrict,
  movement_id text not null references public.mcpa_movements(id) on delete restrict,
  action text not null check (action in ('refuseTransfer','reopenTransfer')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null,
  actor_role text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  recorded_at timestamptz not null,
  before_data jsonb not null check (jsonb_typeof(before_data)='object'),
  after_data jsonb not null check (jsonb_typeof(after_data)='object')
```

## public.mcpa_purchases

Source: supabase/migrations/202610100005_purchase_ledger.sql:11.

```text
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
```

## public.mcpa_purchase_history

Source: supabase/migrations/202610100005_purchase_ledger.sql:31.

```text
operation_id uuid primary key,
 purchase_id uuid not null references public.mcpa_purchases(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 input jsonb not null,
 before_record jsonb,
 after_record jsonb not null,
 created_at timestamptz not null default now()
```

## public.mcpa_notifications

Source: supabase/migrations/202610100006_monitoring.sql:23.

```text
id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check(kind in ('overdue','weekly_monitoring','movement')),
  entity_id text,
  dedupe_key text not null,
  title text not null check(char_length(title) between 1 and 200),
  message text not null check(char_length(message) between 1 and 2000),
  data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique(recipient_id,dedupe_key)
```

## public.mcpa_inventory_snapshots

Source: supabase/migrations/202610100006_monitoring.sql:38.

```text
id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default clock_timestamp(),
  local_date date not null,
  week_start date not null unique,
  tools jsonb not null check(jsonb_typeof(tools)='array'),
  check(extract(isodow from week_start)=1)
```

## mcpa_auth_private.return_office

Source: supabase/migrations/202610120002_office_returns.sql:44.

```text
singleton boolean primary key default true check(singleton),
  site_id uuid not null references public.sites(id) on delete restrict
```

## Significant later definitions and installation conditions

- sites: setup adds assigned_engineer_id, archived_at and non-null is_active; normalized unique name index; metadata history triggers. Authenticated migration replaces prototype access. project_history also has a guarded standalone repair migration; do not assume both CREATE bodies should be replayed.
- profiles: supported-role/account-status constraints, unique auth link, independent identity migration and account-management guards.
- equipment: private image_url reference trigger; prospective Office BEFORE INSERT trigger and replacement INSERT policy. The separate confirmed-correction SQL mutates selected historic rows and was not executed.
- movement functions: recipient-identity lifecycle replacement, portal wrappers, optional cancellation/refusal wrappers, Office outer wrapper, optional-purpose in-memory source replacement and availability snapshot enrichment. Function names alone cannot prove a complete safe delegate chain.
- immutable row/truncate triggers: project_history, purchase_history, cancellation/refusal audit, notifications and inventory snapshots (notifications permit only read_at updates). Browser grants restrict other operational/audit tables; do not assert identical trigger coverage.
- Storage: private bucket declarations and RLS predicates are service configuration; complete storage.objects/storage.buckets DDL is not supplied.
- Two filenames share migration version 202610120003: equipment_office_default and optional_request_purpose. Current installed migration ledger/order requires maintainer confirmation.

## Current production evidence required — NEEDS VERIFICATION

Obtain a sanitized schema/catalog export with table/column types, nullability/defaults, PK/unique/FK/check constraints, full status enum values, indexes, policy definitions and roles, table/column/function grants, function owners/security/search paths/delegate bodies, enabled triggers, bucket privacy/MIME limits, notification publication membership and applied versions/manual SQL history. No user records, Auth rows, attachment contents, private QR values or secrets are needed. This task has not collected or run these database checks.

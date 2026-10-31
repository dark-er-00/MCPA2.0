# Admin - People and Accountability / Account Management

- Invitations and development creation are conditional implemented features; availability is read from server capabilities.
- These diagrams document existing account mutations only; this documentation task invokes none of them.
- New account roles are Engineer, Architect, Secretary or Tool Handler. Creating new Admin accounts is disallowed here.
- Existing equipment custody and history remain attached to the stable company-person profile.

## Source evidence

- [1-admin/modules/users/users.js:1](../../../../../1-admin/modules/users/users.js#L1): Admin-only live people/account module
- [1-admin/modules/users/users.js:55](../../../../../1-admin/modules/users/users.js#L55): Capabilities, people reads, invoke/save helper and mutation status handling
- [1-admin/modules/users/users.js:105](../../../../../1-admin/modules/users/users.js#L105): Invite, development creation, recovery, role/status and retry actions
- [supabase/functions/manage-accounts/handler.mjs:19](../../../../../supabase/functions/manage-accounts/handler.mjs#L19): Origin/session/Admin validation and account service actions
- [supabase/functions/manage-accounts/handler.mjs:52](../../../../../supabase/functions/manage-accounts/handler.mjs#L52): Capability-gated development-account creation and durable retry
- [supabase/functions/manage-accounts/handler.mjs:85](../../../../../supabase/functions/manage-accounts/handler.mjs#L85): Invitation prepare/claim/email/finish/release lifecycle
- [supabase/migrations/202610060001_account_management.sql:65](../../../../../supabase/migrations/202610060001_account_management.sql#L65): Save-account validation, protected Admin and immutable Auth links
- [supabase/migrations/202610060001_account_management.sql:113](../../../../../supabase/migrations/202610060001_account_management.sql#L113): Durable invitation validations, leases and identity checks
- [supabase/migrations/202610060003_development_accounts.sql:26](../../../../../supabase/migrations/202610060003_development_accounts.sql#L26): Distinct test identity, durable lease, verified Auth linking and current account-list extension

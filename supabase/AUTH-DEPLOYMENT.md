# MCPA authentication deployment

For the final invitation-based People & Accountability workflow, continue with
[ACCOUNT-MANAGEMENT-DEPLOYMENT.md](ACCOUNT-MANAGEMENT-DEPLOYMENT.md) after this base
migration. Its newer migrations replace the manual-link-first UI and name-based
recipient resolution described below. Do not rerun this older migration after
those updates without reapplying the newer migrations in order.

For controlled real development accounts, see [TEST-ACCOUNTS.md](TEST-ACCOUNTS.md). Its trusted Node script reuses the profile linkage described below; it does not replace deployment of this migration.

Status (2026-10-05): the project owner reports the preflight and migration completed successfully. Live Admin and Engineer test accounts have now been created and verified through real Supabase password login, profile RPCs and the existing browser login form. Dashboard routing, session restoration, logout and selected role restrictions passed. Invitations, recovery email delivery and live business transaction workflows still require verification.

## What was inspected

- Existing HTML/JS portals, module loader, dashboard, movement store/UI, Supabase reads and RPCs, demo storage, theme persistence, Sites/Consumables setup SQL and integration tests.
- All 20 pages of `Notes_MCPA_081826.pdf`. Relevant interview sections: tool requests (7), confidential masterlist (16), roles (21), receipt confirmation (24), testing (25), white/black/gold with optional night mode (27).
- Read-only public API on 2026-10-04: equipment, Sites and Consumables are reachable. Equipment has UUID IDs, asset tags, current_holder_id, status, quantity and site_id. Live Sites did not expose assigned_engineer_id. The profile query returned no visible rows; this does not prove the table is empty. OpenAPI/policy introspection and direct movement-table access were denied. Auth supports email/password and reported public signup enabled.

## Existing structures retained

`profiles.id`, `equipment.current_holder_id`, `equipment.site_id`, movement actor/receiver IDs and all historical records remain intact. `profiles.name` remains the display-name source; there is no duplicate users table. A unique `profiles.auth_user_id` links the historical company identity to `auth.users.id`. Added profile fields are `role`, `account_status` and `updated_at` where absent. An explicit `sites.assigned_engineer_id` supplies trusted project assignment; names do not grant project access.

The existing movement transaction function moves to the unexposed `mcpa_auth_private` schema. Its public wrapper validates the authenticated profile and supplies the actor itself. Existing Consumables transactions receive equivalent role guards. The migration replaces prototype policies/grants for the known application tables; equipment custody/status cannot be directly edited by browser roles. Descriptive equipment editing remains available to authorized inventory roles. Movement, repair, return and audit records are not deleted or reseeded.

## Role scope

| Role | Access |
|---|---|
| Admin | Company inventory/projects, account access management, request approval/rejection/release, repair/recovery follow-up, reports and activity; no borrower request/receipt/return/report actions |
| Engineer / Architect | Requests for explicitly assigned projects, own custody, relevant movements/site equipment and a limited available-stock catalogue; no raw full-masterlist/profile reads, user management or Admin reports |
| Secretary | Existing Consumables purchasing/receipt workflows and account preferences; purchase ledger clearly marked unimplemented |
| Tool Handler | Inventory and movement monitoring, dispatch of unheld available stock to active Engineers/Architects; no approvals, other holders' transfers or account management |

Engineer/Architect snapshots project only operational equipment fields. Internal profile/auth data is not returned. Raw equipment SELECT is limited through RLS to Admin/Tool Handler. Account role/status changes are possible only through the guarded Admin RPC. Inactive/unlinked accounts have no business-data access, even if they retain an Auth session. Role labels remain distinct; the legacy transaction engine internally maps Architect to the existing Engineer workflow.

## Apply safely

1. Take a database backup. Run [preflight.sql](preflight.sql) in the existing project's SQL Editor. Review existing profile types, constraints, triggers, policies, grants, RPCs and views. Existing public views or unrelated security-definer RPCs that expose these tables must also be secured. The browser key cannot inspect these administrative definitions.
2. Confirm the repository's current Sites and Movement setup is installed. Install the current Consumables setup only if that module is used. Run required legacy setup **before** the auth migration; never run permissive prototype setup scripts afterward.
3. Review and run [202610040001_authenticated_access.sql](migrations/202610040001_authenticated_access.sql). It is transactional and repeatable. It stops on missing prerequisites or incompatible profile-role types. Do not bypass a preflight failure by deleting existing records; adapt the migration to the inspected schema.
4. In Supabase Authentication settings, disable **Allow new users to sign up**. Hiding a signup form does not disable the Auth signup API. Set the Site URL and allow only the actual MCPA login URL(s) as redirect URLs for password recovery/invitations. Keep email confirmation enabled.
5. Create/invite the first administrator using Supabase's trusted dashboard. Link the actual Auth UUID to the appropriate existing company profile. Do not change a historical profile ID to match an Auth UUID. Example (replace placeholders):

   ```sql
   update public.profiles
   set auth_user_id = 'AUTH-USER-UUID', role = 'admin', account_status = 'active'
   where id = 'EXISTING-COMPANY-PROFILE-UUID';
   ```

   If no company profile exists, insert a profile using a new UUID, the real person's name, their Auth UUID, role and active status. Never seed a shared password or infer Admin access from an email/name.
6. Sign in and use People & Accountability to link additional existing profiles or create authorized company profiles. Privileged account creation/invitation stays in Supabase Authentication; no service-role key is exposed in this frontend. This implementation intentionally separates that privileged operation instead of simulating invitations in JavaScript. Invited users can set a password via the supported Forgot password flow if their invitation does not already establish one.
7. Assign Engineers/Architects to projects using Projects. Confirm `assigned_engineer_id` is populated. Historical name-only assignments remain visible to Admin but do not grant project permissions until explicitly linked. Requesting for another site requires an authorized project assignment.
8. Verify two separate real accounts in separate browser profiles: Engineer submits a request; Admin approves/releases; Engineer tests and confirms receipt; verify holder changes only on receipt. Check Architect, Secretary and Tool Handler access, direct `#users`/`#reports` attempts, inactive-account denial, password recovery email, logout and refresh. Verify unrelated project equipment does not appear in an Engineer snapshot or raw API reads.
9. Review Storage separately if adding real equipment photos/attachments. The observed equipment table has no image column and this task does not create a new bucket or grant public file access. Existing code-native equipment visuals and optional picture fields are preserved.

Existing sample/operational statuses are preserved. Sold/disposed records are not converted to missing. No purchase ledger, automated weekly email or attachment-storage workflow was invented. Reports now export a current authorized monitoring snapshot; they do not claim to be scheduled reports or historical point-in-time inventory.

Live damaged receipts retain the existing transaction behavior: explicit acceptance transfers custody and opens a repair report. If a receiver cannot accept the damaged tool, they must contact Admin before confirming. Offline demo also retains its pre-existing decline-custody option; that option is not offered for live transactions.

## Demo

Choose **Try offline demo** from login, then an explicitly labelled demonstration identity. Demo identity is tab-local, records remain in browser storage and no live data calls are made. Exit demo to return to login. Production accounts have no role/profile switching control. Both existing HTML entry points restore the authenticated role; URL and localStorage role values do not grant production access.

## Verification

```powershell
npm.cmd test --prefix tests
npm.cmd run test:inventory --prefix tests
```

Requires Node 22+ and Chrome/Edge (`CHROME_PATH` overrides the executable). Browser tests use a local Auth transport and real local PostgreSQL/RLS via PGlite; external URLs are blocked. They are not a substitute for real Supabase Auth/SMTP verification after deployment. `auth.browser.cjs` supersedes the prototype's manual-profile/portal browser test; legacy transaction-unit/database tests remain to verify preserved business rules.

Reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth state events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [trusted account invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

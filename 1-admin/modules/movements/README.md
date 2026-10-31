# Engineer movement workflow

The Engineer portal now creates saved requests, transfers, inspected receipts,
returns, repair reports, and missing-tool reports. Admin reviews requests,
releases approved tools, and records repair completion or recovery. Dashboard,
Engineer Masterlist, activity logs, and Sites history read those same records.

## Start with live project data

1. In the existing Supabase project's SQL Editor, run
   [Sites setup.sql](../sites/setup.sql) if Sites is not installed.
2. Run all of [Movement setup.sql](setup.sql). The script is repeatable and
   does not seed, replace, or reassign existing equipment.
3. Serve this repository over HTTP using the existing VS Code Live Server.
   Open `2-engr/index.html` and keep **Live database** selected.
4. Select the existing person in **Acting profile**. Profiles, equipment, and
   sites must exist in the project. The workflow never creates invented people
   or projects when a lookup is missing.
5. Submit an available-tool request. Use **Open Admin review**, sign into the
   existing prototype shell, select the Admin profile, approve the request,
   and release it. Copy the generated transfer code.
6. Back in the Engineer portal, open Transfers, enter that code, and record a
   condition for every item before confirming receipt.

The schema was verified locally; it has **not been applied to the live project**.
The configured browser key cannot run database schema changes.

## Try the workflow immediately

Choose **Demo data**, or **Try demo data** on the connection/setup screen.
Demo mode is explicitly labelled and uses only browser storage. Both role
portals must run on the same origin to share its records. The Engineer demo
identity is Engr Sky; Admin is Engr Pau. Begin by requesting an available asset
(for example GRD-002), then approve and release it through Admin review.

Demo data persists through reloads and updates other tabs. Switching back to
Live database reads the project's actual records; it never uploads demo data.
The data-source selection applies to movement screens, Dashboard, Engineer
inventory, and Sites. Consumables remains its separate existing live module.

## Movement rules

| Action | Effect |
| --- | --- |
| Submit request | Saves purpose, destination, selected asset IDs, optional needed-until date, requester, and pending status. |
| Approve | Reserves available, unassigned tools; custody stays unchanged. |
| Reject | Saves a reason visible to the requester. |
| Release | Creates a pending transfer with a lookup/QR code and source snapshots. |
| Direct transfer | Engineers dispatch only their own tools in use. Admin can also release available stock. |
| Receive | Requires one condition per asset. Good and damaged tools move to the receiver and destination; missing items retain their prior holder and site. Damage/loss requires notes and opens a linked report. |
| Return | Good tools move to the return site and become available. Damaged tools move to the return site but retain accountability pending repair. Lost tools retain their holder and last known site. |
| Repair | Admin starts the reported repair, then completes it to make the tool available. |
| Recover missing | Admin records the location and condition; damaged recovery opens a repair report. |

Each tracked asset record moves as a whole, including a bulk/set quantity.
Partial quantities are not split. Reservations prevent competing transfers;
receipt rechecks the original holder, location, status, and quantity.
Database writes, inspection outcomes, issue records, and audit entries commit
together. Retry operation IDs prevent duplicated actions after a lost response.
Historic asset and source/destination site references prevent deleting records
needed by the audit trail. A failed save preserves the form; if saving succeeds
but reloading fails, refresh before making another change.

Camera scanning starts only when requested, stops on navigation, and requires
browser camera access on HTTPS/localhost. Manual codes remain available if the
camera or optional QR libraries cannot load. Scans only locate existing transfers;
arbitrary scanned equipment payloads cannot create custody records.

## Access model and boundaries

The existing Sign In screen does not establish a Supabase Auth session. Acting
profiles and portal roles demonstrate the workflow; they are **not authenticated
identities or a security boundary**. Following the existing prototype, the SQL
grants the two validated movement RPCs to `anon` and `authenticated`. Anyone
with the public project API configuration can call those functions. Internal
movement tables have RLS enabled, no direct browser write grants, and all writes
go through transactions. Existing equipment access policies remain unchanged.
Production deployment needs real login and server-side role checks derived from
that identity, replacing client-supplied actor/role values and anonymous grants.

Names are resolved to stable database IDs when a movement is created. Historical
names remain in records after a rename. Duplicate profile names must be resolved
before they can be selected as a receiver. The existing Admin asset editor stays
available; status/location bulk buttons lead into the movement workflow so those
actions can be recorded. Engineer inventory and Sites are read-only views.
Purchases, Reports, Users, Settings, attachments, and real authentication are
outside this movement implementation.

## Verification

Node 22+ and Chrome/Edge are required for browser checks. Set `CHROME_PATH` if
the browser is elsewhere. On Windows, use `npm.cmd` if PowerShell blocks npm.ps1.

```powershell
npm.cmd install --prefix tests
npm.cmd test --prefix tests
```

The suites cover local persistence and isolation, the shipped SQL in PGlite,
role/custody validation, reservations, complete inspection, lost-response retries,
rollback, repairs/recovery, site history references, reloads, escaping, and mobile
layout. Browser tests serve the real screens with an SDK transport connected to
the local database and block external requests. They never write to Supabase.
Temporary browser screenshot paths are printed by the runner.

# Engineer/Architect inventory parity ? unexecuted draft

01-engineer-architect-parity.sql is a local review draft. It was not executed and is outside the migration runner. The user's parity approval authorizes preparing this file, not a live rollout.

The accepted Engineer-side client and Architect now call the existing mcpa_engineer_equipment_snapshot RPC. Its legacy name and version-2 response contract are retained to preserve the Engineer baseline. Both roles receive only assets in their legitimate own custody located at their explicitly assigned, active, nonarchived, non-Office projects, while available Office stock is requested through Equipment Requests.

The original 00-engineer-inventory.sql is preserved unchanged. Draft 01 copies that reader and changes only its role guard/error text to accept Engineer and Architect. Its assignment, custody, status, Office, lock and individual-asset predicates are unchanged. Existing authenticated-only grant/revoke statements are retained; no policy, table or write-procedure change is proposed.

A separately authorized backend rollout must inspect actual installed definitions, privileges and dependencies, then consider the prerequisite 00 followed by 01. Verify that the active identity helper returns profiles.id, that both roles remain isolated by project/custody IDs, and that non-field/inactive identities remain denied. Unknown installed contracts need review before installation.

The local JavaScript fixtures model the desired reader. Source assertions verified the role-guard-only delta; no SQL interpreter/database was used. Until the reader is installed and authorized for both roles, missing/forbidden live reads fail closed in the UI.

See docs/engineer-architect-parity-20261113.md for frontend changes, tests, preservation evidence and working isolated preview links.

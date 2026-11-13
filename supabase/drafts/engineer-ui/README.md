# Engineer inventory reader - review draft

This folder is a local review draft, not an installed migration. No Production or Staging execution is authorized by this UI task.

`00-engineer-inventory.sql` adds `public.mcpa_engineer_equipment_snapshot()` without changing existing readers, write procedures, tables, policies or grants on existing objects. The function accepts no user-selected identity. It uses the existing authenticated identity helper and requires an active Engineer account.

The response contains confirmed own custody plus eligible available individual assets located at active, non-archived projects assigned to the authenticated Engineer. Available Office stock and stock at another Engineer's projects are excluded by authoritative IDs. Another Engineer's damaged, missing or deployed equipment is excluded by the server. The project list contains only active construction projects assigned to the authenticated profile ID; the verified Office location is excluded from project choices. Own equipment retains its real custody/status, including unresolved inspection or condition issues. Request availability remains separate from recorded status.

Dependencies are the existing identity, personal/movement snapshots, verified Office configuration, inventory-lock and custody-lifecycle helpers. They must be reviewed in the intended environment before a later, separately approved backend rollout. This task makes no claim that those features, or this new reader, are installed remotely.

The Engineer UI requires the versioned reader and fails closed when it is missing. It does not fall back to a broader inventory response. Architect and Admin readers are unchanged.

Only disposable in-memory PGlite fixtures initialize this draft during local checks and the synthetic preview. `tests/engineer-ui.inventory.test.cjs` checks available/own/other custody, repair and missing scope, zero stock, assignments, role rejection and inactive-account rejection.

Manual UI acceptance does not authorize deployment of this draft.

The correction uses response version 2 and includes the verified `officeId`. Both inventory rows and global equipment search require this version. Request catalog functions are unchanged and still include eligible Office stock.

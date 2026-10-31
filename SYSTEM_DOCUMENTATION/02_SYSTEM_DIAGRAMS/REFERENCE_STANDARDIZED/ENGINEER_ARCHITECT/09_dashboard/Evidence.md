# Engineer / Architect - Dashboard / Movement Overview

- Admin sees company equipment quantities; Engineer/Architect sees individual assets in confirmed custody.
- Dashboard actions open their owning module; mutation validation is documented in those module diagrams.
- Pending turnover has not yet changed custody. Engineer/Architect dashboard uses movement data to retain those handovers.

## Source evidence

- [js/movement-overview.js:89](../../../../../js/movement-overview.js#L89): Role-aware dashboard load, partial failure, retry and watch
- [js/dashboard-view.js:23](../../../../../js/dashboard-view.js#L23): Company versus confirmed personal custody scope
- [js/dashboard-view.js:161](../../../../../js/dashboard-view.js#L161): KPI cards, tasks, active projects, activity and workflow panels
- [js/permissions.js:7](../../../../../js/permissions.js#L7): Authorized route matrix; Engineer and Architect share routes

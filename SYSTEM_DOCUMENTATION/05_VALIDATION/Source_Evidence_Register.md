# Source evidence register

Review date: 20 October 2026, Asia/Manila. Static index at revision a5d51b3. Source presence and historical QA do not establish live behavior.

## Application RPC call sites

| RPC | Source line |
| --- | --- |
| mcpa_purchase_snapshot | 1-admin/modules/purchases/purchases.js:31 |
| mcpa_save_purchase | 1-admin/modules/purchases/purchases.js:77 |
| mcpa_monitoring_report | 1-admin/modules/reports/reports.js:50 |
| mcpa_project_snapshot | 1-admin/modules/sites/sites.js:117 |
| mcpa_project_snapshot | 1-admin/modules/sites/sites.js:162 |
| mcpa_accounts | 1-admin/modules/users/users.js:62 |
| mcpa_save_account | 1-admin/modules/users/users.js:75 |
| mcpa_my_profile | js/auth.js:85 |
| mcpa_monitoring_snapshot | js/monitoring.js:54 |
| mcpa_monitoring_mark_read | js/monitoring.js:70 |
| mcpa_movement_snapshot | js/movement-cloud.js:38 |
| mcpa_movement_action | js/movement-cloud.js:68 |
| mcpa_return_destination | js/movement-cloud.js:87 |
| mcpa_personal_equipment_snapshot | js/movement-overview.js:98 |
| mcpa_project_snapshot | js/movement-ui.js:203 |

## SQL function definitions

Repeated definitions represent source evolution/overrides, not independently callable installed versions. Dynamically generated wrappers and renamed delegates are explained in technical documentation.

| Function | Definition source line |
| --- | --- |
| public.consumables_save_item | 1-admin/modules/consumables/setup.sql:59 |
| public.consumables_adjust_stock | 1-admin/modules/consumables/setup.sql:90 |
| public.consumables_create_request | 1-admin/modules/consumables/setup.sql:117 |
| public.consumables_receive_request | 1-admin/modules/consumables/setup.sql:141 |
| public.consumables_cancel_request | 1-admin/modules/consumables/setup.sql:172 |
| public.mcpa_movement_set_status | 1-admin/modules/movements/setup.sql:48 |
| public.mcpa_movement_snapshot | 1-admin/modules/movements/setup.sql:60 |
| public.mcpa_movement_action | 1-admin/modules/movements/setup.sql:87 |
| public.sites_sync_archive | 1-admin/modules/sites/realtime-archive.sql:10 |
| public.sites_touch_updated_at | 1-admin/modules/sites/setup.sql:49 |
| public.project_record_history | 1-admin/modules/sites/setup.sql:82 |
| public.project_history_immutable | 1-admin/modules/sites/setup.sql:125 |
| mcpa_auth_private.identity | supabase/migrations/202610040001_authenticated_access.sql:42 |
| public.mcpa_my_profile | supabase/migrations/202610040001_authenticated_access.sql:52 |
| public.mcpa_has_role | supabase/migrations/202610040001_authenticated_access.sql:57 |
| mcpa_auth_private.can_view_tool | supabase/migrations/202610040001_authenticated_access.sql:61 |
| mcpa_auth_private.can_view_movement | supabase/migrations/202610040001_authenticated_access.sql:69 |
| public.mcpa_movement_action | supabase/migrations/202610040001_authenticated_access.sql:86 |
| public.mcpa_movement_snapshot | supabase/migrations/202610040001_authenticated_access.sql:133 |
| public.mcpa_accounts | supabase/migrations/202610040001_authenticated_access.sql:210 |
| public.mcpa_save_account | supabase/migrations/202610040001_authenticated_access.sql:217 |
| public.mcpa_accounts | supabase/migrations/202610060001_account_management.sql:47 |
| public.mcpa_save_account | supabase/migrations/202610060001_account_management.sql:65 |
| public.mcpa_invitation_step | supabase/migrations/202610060001_account_management.sql:113 |
| mcpa_auth_private.mcpa_movement_action | supabase/migrations/202610060002_recipient_identity.sql:3 |
| public.mcpa_movement_action | supabase/migrations/202610060002_recipient_identity.sql:258 |
| public.mcpa_movement_snapshot | supabase/migrations/202610060002_recipient_identity.sql:306 |
| public.mcpa_development_account_step | supabase/migrations/202610060003_development_accounts.sql:26 |
| public.mcpa_accounts | supabase/migrations/202610060003_development_accounts.sql:107 |
| public.mcpa_personal_equipment_snapshot | supabase/migrations/202610100001_engineer_portal.sql:21 |
| public.mcpa_project_snapshot | supabase/migrations/202610100001_engineer_portal.sql:51 |
| mcpa_auth_private.receiving_context | supabase/migrations/202610100001_engineer_portal.sql:68 |
| public.mcpa_create_receiving_qr | supabase/migrations/202610100001_engineer_portal.sql:85 |
| public.mcpa_resolve_receiving_qr | supabase/migrations/202610100001_engineer_portal.sql:103 |
| public.mcpa_revoke_receiving_qr | supabase/migrations/202610100001_engineer_portal.sql:113 |
| public.mcpa_movement_action | supabase/migrations/202610100001_engineer_portal.sql:126 |
| public.project_record_history | supabase/migrations/202610100002_project_history.sql:75 |
| public.project_history_immutable | supabase/migrations/202610100002_project_history.sql:110 |
| public.mcpa_can_write_equipment_photo | supabase/migrations/202610100003_feature_storage.sql:64 |
| public.mcpa_can_read_equipment_photo | supabase/migrations/202610100003_feature_storage.sql:73 |
| public.mcpa_can_access_purchase_receipt | supabase/migrations/202610100003_feature_storage.sql:85 |
| mcpa_auth_private.guard_equipment_photo_reference | supabase/migrations/202610100003_feature_storage.sql:100 |
| mcpa_auth_private.cancellation_audit_immutable | supabase/migrations/202610100004_movement_cancellation.sql:37 |
| mcpa_auth_private.can_adjust_movement | supabase/migrations/202610100004_movement_cancellation.sql:65 |
| public.mcpa_movement_action | supabase/migrations/202610100004_movement_cancellation.sql:95 |
| mcpa_auth_private.can_view_tool | supabase/migrations/202610100004_movement_cancellation.sql:250 |
| public.mcpa_movement_snapshot | supabase/migrations/202610100004_movement_cancellation.sql:268 |
| mcpa_auth_private.purchase_history_immutable | supabase/migrations/202610100005_purchase_ledger.sql:47 |
| public.mcpa_save_purchase | supabase/migrations/202610100005_purchase_ledger.sql:52 |
| public.mcpa_purchase_snapshot | supabase/migrations/202610100005_purchase_ledger.sql:98 |
| mcpa_auth_private.monitoring_immutable | supabase/migrations/202610100006_monitoring.sql:62 |
| mcpa_auth_private.monitoring_due_date | supabase/migrations/202610100006_monitoring.sql:80 |
| mcpa_auth_private.monitoring_overdue | supabase/migrations/202610100006_monitoring.sql:90 |
| mcpa_auth_private.monitoring_current_tools | supabase/migrations/202610100006_monitoring.sql:119 |
| public.mcpa_monitoring_snapshot | supabase/migrations/202610100006_monitoring.sql:128 |
| public.mcpa_monitoring_mark_read | supabase/migrations/202610100006_monitoring.sql:145 |
| public.mcpa_capture_inventory_snapshot | supabase/migrations/202610100006_monitoring.sql:158 |
| public.mcpa_generate_monitoring | supabase/migrations/202610100006_monitoring.sql:170 |
| public.mcpa_monitoring_report | supabase/migrations/202610100006_monitoring.sql:201 |
| mcpa_auth_private.notify_new_movement_operation | supabase/migrations/202610100006_monitoring.sql:221 |
| mcpa_auth_private.notify_new_movement_operation | supabase/migrations/202610120001_request_turnover_notifications.sql:26 |
| mcpa_auth_private.office_return_site | supabase/migrations/202610120002_office_returns.sql:74 |
| public.mcpa_return_destination | supabase/migrations/202610120002_office_returns.sql:91 |
| public.mcpa_movement_action | supabase/migrations/202610120002_office_returns.sql:111 |
| public.mcpa_inventory_office | supabase/migrations/202610120003_equipment_office_default.sql:46 |
| mcpa_auth_private.new_equipment_office | supabase/migrations/202610120003_equipment_office_default.sql:61 |
| public.mcpa_movement_snapshot | supabase/migrations/202610150001_inventory_availability.sql:15 |

## Historical QA evidence inspected

| Report / definitions | Evidence boundary |
| --- | --- |
| SUPABASE-RELEASE-READINESS.md | October 12 local suites and supported gateway arrangements; live verification pending. |
| documentation/inventory-status-verification.md | October 15 fixture/browser results and unapplied availability patch statement. |
| PDF-REPORTS-VERIFICATION.md | October 15 local PDF parser/layout/browser/role tests; no deployed validation. |
| GLOBAL-SEARCH-VERIFICATION.md | Search scope/navigation local results. |
| documentation/project-count-navigation-verification.md | Role-correct project count/history/navigation local results. |
| REQUEST-TURNOVER-SYNC-REPORT.md; OFFICE-RETURN-IMPLEMENTATION.md; EQUIPMENT-OFFICE-IMPLEMENTATION.md | Implemented source and prior local workflow evidence; no current live-install inference. |
| tests/package.json; tests/*.test.cjs; tests/*.browser-checks.cjs | Test definitions inspected/indexed, not rerun by this documentation task. |
| documentation/user-manuals/validation-report.json | Historical document QA; predates some current UI changes, not reused as fresh screenshots. |

## Complete static file index

Repository_Index.json inventories tracked non-vendor source/documentation files with line counts and matching DDL/function/policy/RPC/error branches. Source_Baseline.json hashes all 1,098 pre-existing tracked files, including vendor assets and prior documentation. No existing file was edited. The Feature Inventory workbook has a source worksheet for application, SQL and test files.

# Rubric analysis and conversion boundaries

Source reviewed before changing application code: `RUBRICS-for-PROJECT.pdf`, three pages, IT305W Advanced Web Applications. The document is assessment material; its group-size and presentation instructions are not commands to this application.

The existing system is a browser application with a Node static development server, Supabase Auth, PostgreSQL transactional functions and row-level security, private Storage attachments, and realtime subscriptions. It already uses JSON and AJAX throughout. It has no PHP backend. The rubric permits an existing SAD project and does not require MySQL or a particular PHP framework.

| Criterion | Weight | Existing evidence | Internal conversion |
| --- | ---: | --- | --- |
| JSON implementation | 20 | RPC payloads/results, saved requests, API errors | PHP decodes and validates requests, encodes responses, and preserves JSON database contracts. |
| AJAX implementation | 20 | Asynchronous reads/writes and dynamically loaded modules | Route SDK HTTP requests through the same-origin PHP API using its supported custom fetch option. Keep existing async UI flows. |
| PHP/server-side processing | 20 | Missing; static Node hosting and a JavaScript account Edge Function | PHP entry points, configuration, routing, request validation, Auth/data/Storage processing, session metadata, and a PHP account service. |
| HTML/CSS | 10 | Existing structured HTML, responsive styles and portal modules | Serve the same markup and assets. No redesign. |
| jQuery/additional technology | +5 optional | Native DOM APIs, Supabase realtime, QR scanning and PDF generation | Retain useful existing technologies; do not add jQuery solely to increase file count. Bonus grading remains the instructor's decision. |
| Database/data management | 10 | PostgreSQL migrations, RLS, transactional functions and idempotent operations | PHP calls the existing database API as the signed-in user. Keep atomic inventory/custody rules and constraints in PostgreSQL. |
| Integration | 10 | Shared client across Admin, Engineer, Architect and other roles | Connect both client factories to one PHP transport; preserve API shapes, operation IDs, pagination, errors and realtime. |
| Creativity/UX | 5 | Existing interface and workflows | Preserve appearance, navigation, wording and interaction behavior. |
| Security/validation/errors | 5 | Auth, RLS, private storage, role checks and SQL validation | Add bounded PHP requests, fixed upstream destinations, safe header forwarding, same-origin request checks, upload checks and server-only account credentials. |

## What stays in JavaScript and SQL

DOM rendering, events, navigation, browser camera/QR APIs, workers, local demonstration records, PDF downloads and realtime WebSockets require browser execution. These are not usefully converted to PHP. HTML and CSS remain their native formats. PostgreSQL functions retain their transactions, locking, permissions and retry semantics; replacing those with separate PHP queries would risk changing business behavior. PHP owns the server HTTP boundary and account orchestration.

## Preservation requirements

- No database schema migration or live-data mutation is needed for this conversion.
- The existing `index.html` URL, engineer redirect, hosted subpaths, screen modules and assets remain supported.
- No changes to stylesheet, image, PDF layout or feature templates are planned.
- Auth and regular database operations use the caller's token and the project publishable key. Only the explicitly privileged account service can use a server secret.
- PHP hosting replaces static-only hosting. GitHub Pages cannot execute PHP; this is a deployment requirement of the rubric.
- Existing server-side account feature flags must be carried into PHP environment configuration when deploying.

## Verification

Run the existing syntax/resource, unit/database and browser checks; add focused PHP/transport tests for malformed JSON, authorization, account retry behavior, HTTP compatibility, uploads and private-file isolation. Compare the PHP-rendered shell with the checked-in HTML and confirm no stylesheet or feature-template changes.

Completed verification: the resource/syntax check passed for 173 public files and 11 PHP files; all 365 unit, database and PHP integration tests passed. The combined browser workflow check passed with the existing headless Chrome sandbox override. Tests use isolated records and a local upstream fixture. Two baseline test failures were repaired by pointing their preflight reads to the existing `supabase/checks/` location. Source comparison confirmed that the only shell markup addition is the PHP transport script; stylesheets, feature templates, the PDF module and database migrations are unchanged.

## Implementation references

The transport uses Supabase's documented [`global.fetch` option](https://supabase.com/docs/reference/javascript/initializing). PHP session handling follows the [PHP session security guidance](https://www.php.net/manual/en/session.security.ini.php). The [PHP cURL API](https://www.php.net/manual/en/function.curl-setopt.php) supplies server-side HTTPS requests; redirects are disabled to keep credentials on the configured upstream. Modern Supabase keys use the [`apikey` header](https://supabase.com/docs/guides/getting-started/api-keys); only actual user tokens or legacy JWT keys belong in bearer authorization. Multipart uploads retain metadata fields before the file, as required by the [Storage uploader](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts).

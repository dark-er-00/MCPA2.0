# MCPA

Construction Asset Management and Accountability System. The existing browser interface now uses a PHP backend for JSON/AJAX requests, authentication request processing, private uploads, session metadata and account orchestration. Supabase continues to provide PostgreSQL, Auth, private Storage and realtime subscriptions.

Read [the rubric analysis](docs/rubric-analysis.md) for the assessment mapping and preservation boundaries.

## Run locally

Requirements: PHP 8.2 or later with cURL, JSON, fileinfo, mbstring and sessions; Node 22 or later for the existing development and test tools. No Composer dependencies are required.

1. Copy `.env.example` to `.env` if this environment does not already have one. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the existing database. Keep its current migrations and data.
2. Run `npm install` when dependencies are not installed.
3. Run `npm start`, then open `http://127.0.0.1:4173`.

On Windows PowerShell installations that block npm's script shim, use `npm.cmd` instead of `npm`. `PORT` changes the development port; `PHP_BINARY` can specify the PHP executable path.

PHP serves the public connection configuration at `app/core/config.js` from the environment. `npm run configure` also regenerates the checked-in JavaScript configuration for isolated existing test fixtures. Public configuration includes only the Supabase origin and publishable key.

## Deployment

Use PHP hosting with **`public/` as the document root**. Keep `server/`, `.env`, `supabase/`, test sources and Node dependencies outside that root. With Apache, enable `mod_rewrite` and `.htaccess` overrides; the supplied configuration preserves `index.html`, `index.php` and the existing engineer entry. For Nginx, pass only `index.php`, `api/index.php` and `app/core/config.php` to PHP-FPM, map `/index.html` to `/index.php`, map `/app/core/config.js` to `/app/core/config.php`, and serve existing assets normally. Block dotfiles and directory listings.

Set `MCPA_APP_URL` to the public login URL. The application and its PHP API must share an origin. On HTTPS, PHP sessions use Secure, HttpOnly, SameSite=Lax cookies. Terminate TLS where PHP can correctly observe HTTPS, or configure the web server to set its HTTPS variable through a trusted proxy. PHP session metadata complements the existing SDK sessions; it does not replace bearer-token verification or authorize database operations.

Set PHP `upload_max_filesize=10M` and `post_max_size=16M` so existing 5 MiB photos and 10 MiB receipts remain supported. The local startup command sets these limits automatically. Configure the web server's request-body limit to at least 16 MiB as well.

Account management now runs in [server/Accounts.php](server/Accounts.php). Ordinary reads, writes and Storage operations always use the caller's token and publishable key, preserving RLS and transactional RPC checks. For privileged test-account creation, configure `MCPA_SUPABASE_SECRET_KEY` (also accepts existing `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`). Carry over `MCPA_ENABLE_DEVELOPMENT_ACCOUNTS=true` only in environments where that feature was already enabled; its original default is disabled. Missing account credentials do not block normal operations. Never put a server secret in browser configuration. The old `supabase/functions/manage-accounts/` files are retained as historical compatibility/test fixtures; PHP-hosted requests execute the PHP service.

Update Supabase Auth's allowed redirect URLs to include the PHP-hosted `index.html` URL so password recovery keeps working. Realtime WebSockets and signed attachment downloads still connect directly to Supabase; SDK HTTP operations go through PHP. GitHub Pages and other static-only hosts cannot execute this PHP application.

No production database migration, data import or account creation is performed by this conversion.

## Checks

```sh
npm run check
npm test
npm run test:browser
```

The PHP tests are included in `npm test`; use `npm run test:php` for a focused run. They use a local upstream fixture and never contact the live Supabase project. The existing database suite checks the same transactional rules using an isolated PostgreSQL-compatible test database. The browser suite uses Chrome and isolated records; set `CHROME_PATH` if necessary. In environments where Chrome's sandbox prevents headless startup, the existing `MCPA_CHROME_NO_SANDBOX=1` test option is available.

Browser DOM events, workers, QR/camera APIs, PDF rendering, realtime subscriptions and explicit offline demonstrations remain JavaScript. Templates and CSS keep their existing layout and styling. Database transactions, locks, constraints and permissions remain PostgreSQL.

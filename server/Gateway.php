<?php
declare(strict_types=1);

namespace MCPA;

use JsonException;
use stdClass;

final class Gateway
{
    public const MAX_BODY = 16 * 1024 * 1024;
    private const BUCKETS = ['equipment-photos', 'purchase-receipts', 'mcpa-movement-evidence-v2'];

    public function __construct(private readonly Config $config, private readonly Upstream $upstream) {}

    public function handle(string $method, string $route, array $headers, string $body, array $files = [], array $fields = [], string $origin = ''): Response
    {
        if (($headers['x-mcpa-request'] ?? '') !== '1' || ($headers['sec-fetch-site'] ?? '') === 'cross-site'
            || (isset($headers['origin']) && $headers['origin'] !== $origin)) {
            throw new RequestError('This application origin is not allowed.', 403, '42501');
        }
        if (!in_array($method, ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) throw new RequestError('Unsupported request method.', 405);
        if (strlen($body) > self::MAX_BODY) throw new RequestError('Request is too large.', 413);
        if ($route === '' || $route[0] !== '/' || str_starts_with($route, '//') || preg_match('/[\x00-\x20\x7f#\\\\]/', $route)) {
            throw new RequestError('Choose a valid application API route.', 404);
        }
        $path = explode('?', $route, 2)[0];
        $decoded = rawurldecode($path);
        if (preg_match('/[\x00-\x1f\x7f%\\\\]/', $decoded) || array_intersect(explode('/', $decoded), ['.', '..'])) {
            throw new RequestError('Choose a valid application API route.', 404);
        }
        $auth = str_starts_with($path, '/auth/v1/');
        $rest = preg_match('~^/rest/v1/(?:[a-z][a-z0-9_]*|rpc/(?:mcpa_|consumables_)[a-z0-9_]+)$~', $path) === 1;
        $storage = preg_match('~^/storage/v1/object/(?!public/|authenticated/)(?:sign/|list/)?([^/]+)(?:/.*)?$~', $decoded, $storageMatch) === 1
            && in_array($storageMatch[1], self::BUCKETS, true);
        $accounts = $path === '/functions/v1/manage-accounts';
        if (!$auth && !$rest && !$storage && !$accounts) throw new RequestError('Choose a valid application API route.', 404);
        if (in_array($path, ['/rest/v1/rpc/mcpa_development_account_step', '/rest/v1/rpc/mcpa_invitation_step'], true)) {
            throw new RequestError('This operation is server-only.', 403, '42501');
        }
        foreach (['accept-profile', 'content-profile'] as $header) {
            if (isset($headers[$header]) && $headers[$header] !== 'public') throw new RequestError('Only application data is available.', 403, '42501');
        }
        $token = '';
        if (preg_match('/^Bearer (\S+)$/i', $headers['authorization'] ?? '', $match)) $token = $match[1];
        if (!$auth && ($token === '' || $token === $this->config->publishableKey || Config::isPublishable($token)
            || str_starts_with($token, 'sb_secret_') || ($this->config->serverKey !== '' && hash_equals($this->config->serverKey, $token)))) {
            throw new RequestError('Sign in with an active company account.', 401, 'PGRST301');
        }
        $contentType = strtolower(explode(';', $headers['content-type'] ?? '')[0]);
        $json = null;
        if ($body !== '' && ($contentType === 'application/json' || str_ends_with($contentType, '+json'))) {
            try { $json = json_decode($body, false, 512, JSON_THROW_ON_ERROR); }
            catch (JsonException) { throw new RequestError('Send a valid JSON request.'); }
            if (!$json instanceof stdClass && !is_array($json)) throw new RequestError('Send a JSON object or array.');
        } elseif ($body !== '' && !$storage) throw new RequestError('Send an application/json request.', 415);
        if ($accounts) {
            if ($method !== 'POST') throw new RequestError('Use POST.', 405);
            if (strlen($body) > 4096) throw new RequestError('Request is too large.', 413);
            if (!$json instanceof stdClass) throw new RequestError('Send a valid JSON request.');
            return (new Accounts($this->config, $this->upstream))->handle($json, $token);
        }
        if ($auth) $this->validateAuth($method, $path, $route, $json, $origin);
        if ($rest) {
            $allowed = str_contains($path, '/rpc/') ? ['GET', 'HEAD', 'POST'] : ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'];
            if (!in_array($method, $allowed, true)) throw new RequestError('Unsupported data method.', 405);
            if (in_array($method, ['POST', 'PATCH'], true) && $json === null) throw new RequestError('Send a valid JSON request.');
            if (str_contains($path, '/rpc/') && $json !== null && !$json instanceof stdClass) throw new RequestError('RPC arguments must be a JSON object.');
        }
        $forward = array_intersect_key($headers, array_flip([
            'content-type', 'accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile',
            'x-client-info', 'x-supabase-api-version', 'x-upsert', 'cache-control', 'if-match', 'if-none-match',
        ]));
        $payload = $body === '' ? null : $body;
        if ($storage && in_array($method, ['POST', 'PUT'], true) && !str_contains($path, '/sign/') && !str_contains($path, '/list/')) {
            $limit = $storageMatch[1] === 'purchase-receipts' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
            if (str_starts_with($contentType, 'multipart/form-data')) {
                if (count($files) !== 1) throw new RequestError('Choose one valid attachment.');
                $payload = $fields;
                foreach ($files as $name => $file) {
                    if (!is_array($file) || is_array($file['error'] ?? null) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                        throw new RequestError('Attachment upload could not complete. Check the file size and retry.');
                    }
                    $bytes = file_get_contents($file['tmp_name']);
                    self::validateAttachment($bytes, $file['type'], $limit, $storageMatch[1] === 'purchase-receipts');
                    $payload[$name] = new \CURLFile($file['tmp_name'], $file['type'], basename($file['name']));
                }
                // cURL supplies a fresh multipart boundary for PHP-parsed files.
                unset($forward['content-type']);
            } else {
                self::validateAttachment($body, $contentType, $limit, $storageMatch[1] === 'purchase-receipts');
            }
        }
        return $this->upstream->send($method, $route, $token, $payload, $forward);
    }

    private function validateAuth(string $method, string $path, string $route, mixed $json, string $origin): void
    {
        $methods = ['/auth/v1/token' => ['POST'], '/auth/v1/user' => ['GET', 'PUT'], '/auth/v1/recover' => ['POST'],
            '/auth/v1/logout' => ['POST'], '/auth/v1/verify' => ['POST'], '/auth/v1/settings' => ['GET']];
        if (!isset($methods[$path])) throw new RequestError('This authentication operation is unavailable.', 404);
        if (!in_array($method, $methods[$path], true)) throw new RequestError('Unsupported authentication method.', 405);
        if (in_array($method, ['POST', 'PUT'], true) && $path !== '/auth/v1/logout' && !$json instanceof stdClass) throw new RequestError('Send a valid JSON request.');
        parse_str(parse_url($route, PHP_URL_QUERY) ?? '', $query);
        if (isset($query['redirect_to'])) {
            $redirect = $query['redirect_to'];
            if (!is_string($redirect) || self::origin($redirect) !== $origin) throw new RequestError('Use the application password reset URL.');
        }
        if ($path === '/auth/v1/token') {
            $grant = $query['grant_type'] ?? '';
            if (!in_array($grant, ['password', 'refresh_token', 'pkce'], true)) throw new RequestError('Choose a supported sign-in operation.');
            if ($grant === 'password' && (!is_string($json->email ?? null) || !filter_var(trim($json->email), FILTER_VALIDATE_EMAIL)
                || !is_string($json->password ?? null) || $json->password === '')) throw new RequestError('Enter your email and password.');
            if ($grant === 'refresh_token' && (!is_string($json->refresh_token ?? null) || $json->refresh_token === '')) throw new RequestError('A refresh token is required.');
        }
        if ($path === '/auth/v1/recover' && (!is_string($json->email ?? null) || !filter_var(trim($json->email), FILTER_VALIDATE_EMAIL))) throw new RequestError('Enter a valid email.');
    }

    public static function origin(string $url): string
    {
        $parts = parse_url($url);
        if (!$parts || !isset($parts['scheme'], $parts['host']) || isset($parts['user']) || isset($parts['pass'])) return '';
        return $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    }

    public static function validateAttachment(string $bytes, string $declared, int $limit, bool $allowPdf): void
    {
        $allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if ($allowPdf) $allowed[] = 'application/pdf';
        if ($bytes === '' || strlen($bytes) > $limit || !in_array($declared, $allowed, true)
            || (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) !== $declared) {
            throw new RequestError('Choose a valid attachment with matching contents and an allowed file size.');
        }
    }
}

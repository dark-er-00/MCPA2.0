<?php
declare(strict_types=1);

namespace MCPA;

use RuntimeException;

final class Config
{
    public function __construct(
        public readonly string $url,
        public readonly string $publishableKey,
        public readonly string $serverKey = '',
        public readonly bool $developmentEnabled = false,
        public readonly string $appUrl = '',
    ) {
        $parts = parse_url($url);
        $local = in_array($parts['host'] ?? '', ['localhost', '127.0.0.1', '[::1]'], true);
        if (!$parts || !isset($parts['host']) || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['query']) || isset($parts['fragment']) || !empty($parts['path'])
            || (($parts['scheme'] ?? '') !== 'https' && !(($parts['scheme'] ?? '') === 'http' && $local))) {
            throw new RuntimeException('Use an HTTPS Supabase origin or a loopback development origin.');
        }
        if (!self::isPublishable($publishableKey)) {
            throw new RuntimeException('SUPABASE_PUBLISHABLE_KEY must be a publishable or anon key.');
        }
        if ($appUrl !== '') {
            $app = parse_url($appUrl);
            if (!$app || !isset($app['host']) || isset($app['user']) || isset($app['pass'])
                || !in_array($app['scheme'] ?? '', ['http', 'https'], true)
                || ($app['scheme'] !== 'https' && !in_array($app['host'], ['localhost', '127.0.0.1', '[::1]'], true))) {
                throw new RuntimeException('MCPA_APP_URL must be an HTTPS application URL or a loopback URL.');
            }
        }
    }

    public static function load(?string $root = null): self
    {
        $root ??= dirname(__DIR__);
        $values = [];
        $file = $root . '/.env';
        if (is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES) as $line) {
                if (!preg_match('/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/', $line, $match)) continue;
                $value = trim($match[2]);
                if (strlen($value) >= 2 && in_array($value[0], ['"', "'"], true) && substr($value, -1) === $value[0]) {
                    $value = substr($value, 1, -1);
                } else {
                    $value = preg_replace('/\s+#.*$/', '', $value);
                }
                $values[$match[1]] = $value;
            }
        }
        $get = static function (string $name) use ($values): string {
            $injected = getenv($name);
            return $injected !== false ? $injected : ($values[$name] ?? '');
        };
        return new self(
            rtrim($get('SUPABASE_URL'), '/'), $get('SUPABASE_PUBLISHABLE_KEY'),
            $get('MCPA_SUPABASE_SECRET_KEY') ?: ($get('SUPABASE_SECRET_KEY') ?: $get('SUPABASE_SERVICE_ROLE_KEY')),
            $get('MCPA_ENABLE_DEVELOPMENT_ACCOUNTS') === 'true', $get('MCPA_APP_URL'),
        );
    }

    public static function isPublishable(string $key): bool
    {
        if (str_starts_with($key, 'sb_publishable_') && strlen($key) > 15) return true;
        $parts = explode('.', $key);
        $payload = json_decode(base64_decode(strtr($parts[1] ?? '', '-_', '+/')) ?: '', true);
        return count($parts) === 3 && ($payload['role'] ?? '') === 'anon';
    }

    public function browserScript(): string
    {
        return "/* Public browser configuration. Regenerate with npm run configure. */\nwindow.MCPA_CONFIG = Object.freeze("
            . json_encode(['supabaseUrl' => $this->url, 'supabasePublishableKey' => $this->publishableKey],
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_THROW_ON_ERROR) . ");\n";
    }
}

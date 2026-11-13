<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
try {
    $command = $argv[1] ?? '';
    if (!in_array($command, ['configure', 'preflight', 'doctor'], true)) throw new RuntimeException('Usage: php server/console.php configure|preflight|doctor');
    if ($command !== 'configure') {
        if (PHP_VERSION_ID < 80200) throw new RuntimeException('PHP 8.2 or later is required.');
        foreach (['curl', 'json', 'fileinfo', 'mbstring', 'session'] as $extension) {
            if (!extension_loaded($extension)) throw new RuntimeException('Enable the PHP ' . $extension . ' extension in the loaded php.ini.');
        }
    }
    $config = MCPA\Config::load();
    if ($command === 'configure') {
        if (file_put_contents(dirname(__DIR__) . '/public/app/core/config.js', $config->browserScript()) === false) throw new RuntimeException('Could not write public browser configuration.');
        echo "Updated public browser configuration. Server credentials remain private.\n";
    } else {
        echo "PHP runtime and application configuration are ready.\n";
        if ($command === 'doctor') {
            echo PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')
                ? "TLS verification uses the Windows certificate store and configured CA files.\n"
                : "TLS verification uses the PHP/cURL certificate configuration.\n";
            $response = (new MCPA\Upstream($config))->send('GET', '/auth/v1/settings');
            if (!$response->ok() || !is_array($response->data())) {
                throw new RuntimeException('Supabase Auth check failed (HTTP ' . $response->status . '). Verify SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
            }
            echo "Supabase Auth connection succeeded. No account or application data was changed.\n";
        }
    }
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}

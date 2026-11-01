<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
try {
    if (($argv[1] ?? '') !== 'configure') throw new RuntimeException('Usage: php server/console.php configure');
    $script = MCPA\Config::load()->browserScript();
    if (file_put_contents(dirname(__DIR__) . '/public/app/core/config.js', $script) === false) throw new RuntimeException('Could not write public browser configuration.');
    echo "Updated public browser configuration. Server credentials remain private.\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}

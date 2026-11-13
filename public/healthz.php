<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}

try {
    if (PHP_VERSION_ID < 80200) throw new RuntimeException('PHP version');
    foreach (['curl', 'json', 'fileinfo', 'mbstring', 'session', 'openssl'] as $extension) {
        if (!extension_loaded($extension)) throw new RuntimeException('PHP extension');
    }
    require_once dirname(__DIR__) . '/server/Config.php';
    MCPA\Config::load();
    $status = 'ok';
} catch (Throwable) {
    http_response_code(503);
    $status = 'unavailable';
}
if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') echo json_encode(['status' => $status], JSON_THROW_ON_ERROR);

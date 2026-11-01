<?php
declare(strict_types=1);

// The existing shell is the view: PHP returns its exact bytes and asset paths.
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache');
if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') readfile(__DIR__ . '/index.html');

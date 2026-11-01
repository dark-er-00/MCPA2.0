<?php
declare(strict_types=1);

// Development router. Production Apache uses public/ as DocumentRoot.
$public = realpath(dirname(__DIR__) . '/public');
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (preg_match('~(?:^|/)\.|[\x00-\x1f\x7f\\\\]~', $path)) {
    http_response_code(404);
    exit('Not found');
}
$file = realpath($public . '/' . ltrim($path, '/'));
$inside = $file !== false && ($file === $public || str_starts_with($file, $public . DIRECTORY_SEPARATOR));
if (!$inside) {
    http_response_code(404);
    exit('Not found');
}
if ($path === '/' || $path === '/index.html' || $path === '/index.php') {
    require $public . '/index.php';
    return true;
}
if ($path === '/app/core/config.js' || $path === '/app/core/config.php') {
    require $public . '/app/core/config.php';
    return true;
}
if ($path === '/api/' || $path === '/api/index.php') {
    // SCRIPT_NAME is the router path for rewritten requests; set the public entry.
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require $public . '/api/index.php';
    return true;
}
if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) === 'php') {
    http_response_code(404);
    exit('Not found');
}
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}
if (is_dir($file)) {
    $file = realpath($file . '/index.html');
    if ($file === false || !str_starts_with($file, $public . DIRECTORY_SEPARATOR)) {
        http_response_code(404);
        exit('Not found');
    }
}
if (str_ends_with($file, '.mjs')) {
    header('Content-Type: text/javascript; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') readfile($file);
    return true;
}
return false;

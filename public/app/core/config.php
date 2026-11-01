<?php
declare(strict_types=1);

require dirname(__DIR__, 3) . '/server/bootstrap.php';
header('Content-Type: text/javascript; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    echo MCPA\Config::load()->browserScript();
} catch (Throwable) {
    http_response_code(503);
    echo 'throw new Error("The application connection is not configured.");';
}

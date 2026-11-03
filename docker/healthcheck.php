<?php
declare(strict_types=1);

// Probe Apache and PHP over loopback; never probe the Supabase service here.
$port = getenv('PORT') ?: '10000';
if (!ctype_digit($port) || (int) $port < 1 || (int) $port > 65535) exit(1);
$curl = curl_init('http://127.0.0.1:' . $port . '/healthz');
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 1,
    CURLOPT_TIMEOUT => 3,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_PROXY => '',
]);
$body = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
exit($status === 200 && $body !== false && (json_decode($body, true)['status'] ?? '') === 'ok' ? 0 : 1);

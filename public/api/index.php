<?php
declare(strict_types=1);

use MCPA\Config;
use MCPA\Gateway;
use MCPA\RequestError;
use MCPA\Response;
use MCPA\SessionState;
use MCPA\Upstream;

require dirname(__DIR__, 2) . '/server/bootstrap.php';

try {
    $headers = array_change_key_case(getallheaders(), CASE_LOWER);
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $origin = ($secure ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > Gateway::MAX_BODY) throw new RequestError('Request is too large.', 413);
    $body = file_get_contents('php://input', false, null, 0, Gateway::MAX_BODY + 1);
    $route = $_GET['route'] ?? '';
    if (!is_string($route)) throw new RequestError('Choose a valid application API route.');
    $config = Config::load();
    if ($config->appUrl !== '' && Gateway::origin($config->appUrl) !== $origin) throw new RequestError('This application host is not allowed.', 403, '42501');
    $response = (new Gateway($config, new Upstream($config)))->handle($_SERVER['REQUEST_METHOD'], $route, $headers, $body, $_FILES, $_POST, $origin);
    $cookiePath = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME']))), '/') . '/';
    SessionState::observe($route, $response, $cookiePath, $secure);
} catch (RequestError $error) {
    $response = Response::json(['code' => $error->errorCode, 'message' => $error->getMessage(), 'error' => $error->getMessage(), 'details' => null, 'hint' => null], $error->status);
} catch (Throwable $error) {
    error_log('MCPA API failure: ' . get_class($error));
    $response = Response::json(['code' => 'MCPA_SERVER', 'message' => 'The server could not complete the request. Check server configuration and retry.', 'error' => 'The server could not complete the request.'], 503);
}
$response->emit($_SERVER['REQUEST_METHOD'] === 'HEAD');

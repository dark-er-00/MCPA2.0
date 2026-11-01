<?php
declare(strict_types=1);

namespace MCPA;

use Closure;
use RuntimeException;

final class RequestError extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400, public readonly string $errorCode = '22023')
    {
        parent::__construct($message);
    }
}

final class Response
{
    public function __construct(public readonly int $status, public readonly string $body = '', public readonly array $headers = []) {}

    public static function json(mixed $value, int $status = 200): self
    {
        return new self($status, json_encode($value, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), ['content-type' => 'application/json; charset=utf-8']);
    }

    public function data(): mixed
    {
        return json_decode($this->body, true);
    }

    public function ok(): bool { return $this->status >= 200 && $this->status < 300; }

    public function emit(bool $head = false): void
    {
        http_response_code($this->status);
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        foreach ($this->headers as $key => $value) header($key . ': ' . $value);
        if (!$head && $this->status !== 204) echo $this->body;
    }
}

/** A fixed-origin client. Regular requests never use the privileged server key. */
final class Upstream
{
    private ?Closure $transport;
    public function __construct(private readonly Config $config, ?callable $transport = null)
    {
        $this->transport = $transport === null ? null : Closure::fromCallable($transport);
    }

    public function send(string $method, string $route, string $token = '', string|array|null $body = null, array $headers = [], bool $privileged = false): Response
    {
        $key = $privileged ? $this->config->serverKey : $this->config->publishableKey;
        if ($key === '') throw new RequestError('Server account credentials are not configured.', 503, 'MCPA_CONFIGURATION');
        $headers['apikey'] = $key;
        // Supabase secret/publishable keys are API keys, not JWT bearer tokens.
        if ($privileged) {
            unset($headers['authorization']);
            if (!str_starts_with($key, 'sb_secret_')) $headers['authorization'] = 'Bearer ' . $key;
        } elseif ($token !== '' && !str_starts_with($token, 'sb_publishable_')) {
            $headers['authorization'] = 'Bearer ' . $token;
        }
        if ($this->transport !== null) return ($this->transport)($method, $route, $body, $headers, $privileged);

        $curl = curl_init($this->config->url . $route);
        $responseHeaders = [];
        $allowed = ['content-type', 'content-range', 'range-unit', 'preference-applied', 'retry-after', 'www-authenticate', 'x-sb-error-code', 'x-supabase-api-version'];
        $lines = [];
        foreach ($headers as $key => $value) $lines[] = $key . ': ' . $value;
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $lines, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 60,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_NOBODY => $method === 'HEAD',
            CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$responseHeaders, $allowed): int {
                if (preg_match('/^HTTP\//', $line)) $responseHeaders = [];
                elseif (str_contains($line, ':')) {
                    [$key, $value] = explode(':', $line, 2);
                    $key = strtolower(trim($key));
                    if (in_array($key, $allowed, true)) $responseHeaders[$key] = trim($value);
                }
                return strlen($line);
            },
        ]);
        if ($body !== null && !in_array($method, ['GET', 'HEAD'], true)) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
        $result = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        if ($result === false || $status === 0) throw new RequestError('The data service is unavailable. Check your connection and retry the same request.', 503, 'MCPA_UPSTREAM');
        if ($status >= 300 && $status < 400) throw new RequestError('The data service returned an unexpected redirect.', 502, 'MCPA_UPSTREAM');
        return new Response($status, $result, $responseHeaders);
    }

    public function json(string $method, string $route, mixed $body, string $token = '', bool $privileged = false): Response
    {
        return $this->send($method, $route, $token, json_encode($body, JSON_THROW_ON_ERROR), ['content-type' => 'application/json'], $privileged);
    }
}

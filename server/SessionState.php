<?php
declare(strict_types=1);

namespace MCPA;

/** PHP tracks verified Auth metadata; Supabase retains token refresh and RLS. */
final class SessionState
{
    public static function observe(string $route, Response $response, string $cookiePath, bool $secure): void
    {
        if (!$response->ok() || !str_starts_with($route, '/auth/v1/')) return;
        $path = parse_url($route, PHP_URL_PATH);
        $data = $response->data();
        $user = $data['user'] ?? ($path === '/auth/v1/user' ? $data : null);
        $logout = $path === '/auth/v1/logout';
        if (!$logout && empty($user['id'])) return;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_name('MCPA_SESSION');
        session_set_cookie_params(['lifetime' => 0, 'path' => $cookiePath, 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
        session_start();
        if ($logout) {
            $_SESSION = [];
            session_destroy();
            setcookie(session_name(), '', ['expires' => 1, 'path' => $cookiePath, 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
            return;
        }
        if (($_SESSION['user_id'] ?? null) !== $user['id']) session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['verified_at'] = time();
        // Never store passwords, keys, user-submitted roles or bearer tokens here.
        session_write_close();
    }
}

<?php
declare(strict_types=1);

namespace MCPA;

use stdClass;
use Throwable;

/** Registration is closed unless BOTH the server flag and reviewed SQL are installed. */
final class Invitations
{
    public function __construct(private readonly Config $config, private readonly Upstream $upstream) {}

    private function configured(): bool
    {
        return $this->config->invitationsEnabled && $this->config->serverKey !== '' && $this->config->appUrl !== '';
    }

    public function available(string $actor): bool
    {
        if (!$this->configured()) return false;
        try { return ($this->step('list', ['p_actor' => $actor])['version'] ?? 0) === 2; }
        catch (RequestError) { return false; }
    }

    private function step(string $action, array $args): mixed
    {
        $response = $this->upstream->json('POST', '/rest/v1/rpc/mcpa_registration_' . $action, $args, privileged: true);
        $data = $response->data();
        if (!$response->ok()) {
            $code = $data['code'] ?? '';
            if (in_array($code, ['22023', '42501', '40001', 'P0001'], true)) {
                throw new RequestError($data['message'], $code === '42501' ? 403 : ($code === 'P0001' ? 429 : 409), $code);
            }
            throw new RequestError('Invitation storage is unavailable. Ask an Admin to review the invitation setup.', 503);
        }
        return $data;
    }

    public function admin(stdClass $input, string $actor): Response
    {
        if (!$this->configured()) throw new RequestError('Invitations require the approved database and server configuration.', 503);
        if ($input->action === 'createInvitation') {
            if (array_diff(array_keys((array) $input), ['action', 'name', 'email', 'role'])
                || !is_string($input->name ?? null) || !is_string($input->email ?? null)
                || !filter_var(trim($input->email), FILTER_VALIDATE_EMAIL)
                || !in_array($input->role ?? '', ['engineer', 'architect', 'secretary', 'tool_handler'], true)) {
                throw new RequestError('Enter a name, email and authorized non-Admin role.');
            }
            $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $result = $this->step('prepare', ['p_actor' => $actor, 'p_name' => trim($input->name),
                'p_email' => strtolower(trim($input->email)), 'p_role' => $input->role, 'p_token_hash' => hash('sha256', $token)]);
            // A fragment keeps the bearer invitation out of HTTP URLs and Referer headers.
            return Response::json(['id' => $result['id'], 'expires_at' => $result['expires_at'],
                'link' => rtrim($this->config->appUrl, '/') . '/index.html#register=' . $token]);
        }
        if ($input->action === 'reviewInvitations') return Response::json($this->step('list', ['p_actor' => $actor]));
        if (array_diff(array_keys((array) $input), ['action', 'id']) || !is_string($input->id ?? null)
            || !preg_match('/^[a-f0-9-]{36}$/i', $input->id)) throw new RequestError('Choose an invitation.');
        return Response::json($this->step($input->action === 'revokeInvitation' ? 'revoke' : 'reconcile', ['p_actor' => $actor, 'p_id' => $input->id]));
    }

    public function register(stdClass $input): Response
    {
        if (!$this->configured()) throw new RequestError('Registration invitations are unavailable. Contact your Admin.', 503);
        // REMOTE_ADDR is supplied by the web server; never trust forwarded IP headers.
        $this->step('throttle', ['p_key' => hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $this->config->serverKey)]);
        if (!in_array($input->action ?? '', ['redeem', 'resend'], true)
            || array_diff(array_keys((array) $input), ['action', 'token', 'password'])
            || !is_string($input->token ?? null) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $input->token)) {
            throw new RequestError('Use a valid invitation link from your Admin.');
        }
        $hash = hash('sha256', $input->token);
        if ($input->action === 'redeem') {
            if (!is_string($input->password ?? null) || mb_strlen($input->password) < 12
                || mb_strlen($input->password) > 128 || trim($input->password) === '') {
                throw new RequestError('Use a password with 12–128 characters.');
            }
            $claim = $this->step('claim', ['p_token_hash' => $hash]);
            try {
                $created = $this->upstream->json('POST', '/auth/v1/admin/users', [
                    'email' => $claim['email'], 'password' => $input->password, 'email_confirm' => false,
                    'app_metadata' => ['mcpa_invite_id' => $claim['id']],
                ], privileged: true);
                $user = $created->data();
                if (!$created->ok() || empty($user['id'])) throw new RequestError('Account creation needs Admin review. Do not register again.', 503);
                $this->step('finish', ['p_id' => $claim['id'], 'p_auth_id' => $user['id']]);
            } catch (Throwable $error) {
                try { $this->step('hold', ['p_id' => $claim['id']]); } catch (Throwable) { /* A claimed row cannot be reused. */ }
                throw new RequestError('Registration needs Admin review. Your link cannot create another account; ask your Admin to reconcile it.', 503);
            }
        }
        // Leased/rate-limited in SQL. Never accept a browser-supplied email or redirect.
        $mail = $this->step('mail', ['p_token_hash' => $hash]);
        $sent = $this->upstream->json('POST', '/auth/v1/resend?redirect_to=' . rawurlencode(rtrim($this->config->appUrl, '/') . '/index.html?registration=verify'),
            ['type' => 'signup', 'email' => $mail['email']]);
        if (!$sent->ok()) throw new RequestError('Your account is pending email verification. Sending failed or was rate limited; wait a minute and use Send verification email again.', 503);
        return Response::json(['ok' => true, 'message' => 'Check the invited email address and confirm your email to activate your account.']);
    }
}

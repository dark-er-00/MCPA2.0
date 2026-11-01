<?php
declare(strict_types=1);

namespace MCPA;

use stdClass;
use Throwable;

/** PHP equivalent of the existing manage-accounts Edge Function orchestration. */
final class Accounts
{
    public function __construct(private readonly Config $config, private readonly Upstream $upstream) {}

    public function handle(stdClass $input, string $token): Response
    {
        $identity = $this->upstream->send('GET', '/auth/v1/user', $token);
        $user = $identity->data();
        if (!$identity->ok() || empty($user['id'])) throw new RequestError('Your session could not be verified. Sign in again.', 401, 'PGRST301');
        $profile = $this->upstream->json('POST', '/rest/v1/rpc/mcpa_my_profile', new stdClass(), $token);
        $actor = $profile->data();
        if (!$profile->ok() || ($actor['role'] ?? '') !== 'admin' || ($actor['account_status'] ?? '') !== 'active') {
            throw new RequestError('Active Admin access required.', 403, '42501');
        }
        if (!in_array($input->action ?? '', ['capabilities', 'createDevelopmentAccount'], true)
            || ($input->action !== 'capabilities' && !self::uuid($input->id ?? null))) {
            throw new RequestError('Choose a valid account action and request ID.');
        }
        $step = function (string $action, array $payload) use ($user): mixed {
            $response = $this->upstream->json('POST', '/rest/v1/rpc/mcpa_development_account_step', [
                'p_actor' => $user['id'], 'p_action' => $action, 'p_payload' => (object) $payload,
            ], privileged: true);
            $result = $response->data();
            if (!$response->ok()) {
                $code = $result['code'] ?? '';
                if (in_array($code, ['22023', '42501', '40001'], true)) throw new RequestError($result['message'], $code === '42501' ? 403 : 409, $code);
                if ($code === '23505') throw new RequestError('This person or email already has an account link. Refresh the people list.', 409);
                throw new RequestError('Account storage could not complete the request. Verify the account-management migration and retry.', 503);
            }
            return $result;
        };
        if ($input->action === 'capabilities') {
            $enabled = $this->config->developmentEnabled;
            $pending = [];
            if ($enabled) {
                try { $pending = $step('list', []); }
                catch (RequestError $error) { if (in_array($error->status, [401, 403], true)) throw $error; $enabled = false; }
            }
            return Response::json(['development_enabled' => $enabled, 'pending_development_accounts' => $pending]);
        }
        if (!$this->config->developmentEnabled) throw new RequestError('Development account creation is disabled.', 403, '42501');
        if (!is_string($input->name ?? null) || trim($input->name) === '' || mb_strlen(trim($input->name)) > 120
            || !is_string($input->email ?? null) || strlen($input->email) > 254 || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', trim($input->email))
            || !in_array($input->role ?? '', ['engineer', 'architect'], true) || !is_string($input->password ?? null)
            || mb_strlen($input->password) < 12 || mb_strlen($input->password) > 128 || trim($input->password) === '' || isset($input->profile_id)) {
            throw new RequestError('Enter a new test name, email, a 12–128 character password, and Engineer or Architect role.');
        }
        $job = $step('prepare', ['id' => $input->id, 'name' => trim($input->name), 'email' => strtolower(trim($input->email)), 'role' => $input->role]);
        $existing = static fn ($value) => Response::json(['ok' => true, 'profile_id' => $value['profile_id'], 'message' => 'This test account already exists. Its password and access were not changed.']);
        if ($job['state'] === 'created') return $existing($job);
        $claim = $step('claim', ['id' => $job['id']]);
        if ($claim['state'] === 'created') return $existing($claim);
        try {
            $authId = $claim['auth_user_id'] ?? null;
            if (!$authId) {
                $created = $this->upstream->json('POST', '/auth/v1/admin/users', [
                    'email' => $claim['email'], 'password' => $input->password, 'email_confirm' => true,
                    'app_metadata' => ['mcpa_development_account' => true, 'mcpa_development_job_id' => $claim['id']],
                ], privileged: true);
                $account = $created->data();
                // The Auth HTTP API returns a user directly; SDK wrappers add {user}.
                $authId = $account['id'] ?? null;
                if (!$created->ok() || !$authId) throw new RequestError($created->status === 429
                    ? 'Account creation is rate limited. Wait and retry the same test account.'
                    : 'Auth could not create the test account. Check password requirements and Auth logs, then retry the same request.', 503);
            }
            $result = $step('finish', ['id' => $claim['id'], 'lease_id' => $claim['lease_id'], 'auth_user_id' => $authId]);
            return Response::json(['ok' => true, 'profile_id' => $result['profile_id'], 'message' => !empty($claim['auth_user_id'])
                ? 'Test account linked. Sign in with the password from the original creation attempt.'
                : 'Test account created. Sign in with its email and temporary password. No email was sent.']);
        } catch (Throwable $error) {
            try { $step('release', ['id' => $claim['id'], 'lease_id' => $claim['lease_id']]); } catch (Throwable) { /* Lease expiry permits retry. */ }
            throw $error;
        }
    }

    private static function uuid(mixed $value): bool
    {
        return is_string($value) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value) === 1;
    }
}

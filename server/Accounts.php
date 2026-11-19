<?php
declare(strict_types=1);

namespace MCPA;

use stdClass;

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
        $invitations = new Invitations($this->config, $this->upstream);
        if (in_array($input->action ?? '', ['createInvitation', 'reviewInvitations', 'reconcileInvitation', 'revokeInvitation'], true)) {
            return $invitations->admin($input, $actor['id']);
        }
        if (($input->action ?? '') === 'capabilities') {
            return Response::json([
                'invitation_enabled' => $invitations->available($actor['id']),
            ]);
        }
        throw new RequestError('Choose a valid account action and request ID.');
    }
}

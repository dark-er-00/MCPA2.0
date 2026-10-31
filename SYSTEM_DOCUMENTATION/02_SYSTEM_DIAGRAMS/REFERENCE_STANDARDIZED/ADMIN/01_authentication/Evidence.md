# Admin - Authentication and session

- Entry points include the sign-in screen, invitation/reset callbacks and account-menu logout. These are documented entry events, not an invented authenticated menu.
- Existing sessions are checked by getSession and mcpa_my_profile. Invalid callbacks are rejected before workspace entry.

## Source evidence

- [js/auth.js:115](../../../../../js/auth.js#L115): Profile verification, sign-in, reset, demo, sign-out and callback boot.
- [js/app.js:48](../../../../../js/app.js#L48): Authorized module loading and retry.
- [js/permissions.js:6](../../../../../js/permissions.js#L6): Admin and identical Engineer / Architect route permissions.

# Admin - My Account / Display Preferences and Sign Out

- Settings displays existing authorized identity. Role edits occur only in Admin People and Accountability.
- Password reset is reached after signout through Forgot password; it is part of authentication documentation.

## Source evidence

- [js/app.js:89](../../../../../js/app.js#L89): All authorized roles load the shared Admin settings module
- [1-admin/modules/settings/settings.js:1](../../../../../1-admin/modules/settings/settings.js#L1): Actual settings identity, theme and logout actions
- [js/app.js:154](../../../../../js/app.js#L154): Apply/toggle theme and best-effort localStorage persistence
- [js/auth.js:141](../../../../../js/auth.js#L141): Local signout, application cleanup, confirmation and retry

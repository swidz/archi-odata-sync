# Changelog

## 0.2.0

- Replace manual bearer-token input with OAuth 2.0 client credentials: token URL, resource, client ID and masked client secret.
- Acquire tokens using a form-encoded POST; support resource-based endpoints and Entra v2 `/.default` scopes.
- Reuse tokens during discovery, renew before expiry, and retry one time with a fresh token after a 401.
- Keep credentials in process memory, clear the session after each run, refuse token endpoint redirects and redact authentication errors.
- Retain Anonymous and Basic authentication.
- Include MIT licensing in installations.

## 0.1.0

- Initial OData entity discovery, selective synchronization, field documentation and native Archi dialogs.

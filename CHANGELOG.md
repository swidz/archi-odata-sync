# Changelog

## 0.5.0

- Remember the last OData URL and submitted OAuth/Basic connection values, including masked secrets, in process memory until Archi closes.
- Restore credentials separately for each service URL across script runs and open models; put the previous authentication choice first and preserve submitted values when edits are canceled.
- Keep access tokens scoped to each synchronization run. Never persist connection-form defaults to the model or settings.
- Stop reading the legacy model-backed URL default and remove it during successful synchronization.

## 0.4.0

- Create one environment Node per OData service URL in the Technology & Physical layer.
- Add Serving relationships from the environment to each selected Application Interface.
- Add missing environments and Serving links when existing models are resynchronized; retain IDs, environment names, manual notes and unselected entity links.
- Include the environment and Serving relationships in native Undo/Redo and preflight validation.

## 0.3.0

- Group Application Interfaces under `OData / service URL / API` and Data Objects under `OData / service URL / Entities`.
- Move selected existing concepts into the type folders during synchronization, preserving IDs, documentation, diagram references and relationships; support Undo/Redo of these moves.
- Preserve unselected concepts and preflight conflicts with manually created folder names.

## 0.2.1

- Raise the default OData response limit from 32 MiB to 256 MiB for large metadata documents.
- Report the actual or minimum received response size, the configured cap and the installed setting to change when the cap is exceeded.
- Prefill the Entra v2 token URL template and require replacement of `{tenant-id}`.

## 0.2.0

- Replace manual bearer-token input with OAuth 2.0 client credentials: token URL, resource, client ID and masked client secret.
- Acquire tokens using a form-encoded POST; support resource-based endpoints and Entra v2 `/.default` scopes.
- Reuse tokens during discovery, renew before expiry, and retry one time with a fresh token after a 401.
- Keep credentials in process memory, clear the session after each run, refuse token endpoint redirects and redact authentication errors.
- Retain Anonymous and Basic authentication.
- Include MIT licensing in installations.

## 0.1.0

- Initial OData entity discovery, selective synchronization, field documentation and native Archi dialogs.

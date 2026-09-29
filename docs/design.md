# Design

`scripts/Sync OData.ajs` loads the libraries relative to its own directory, then runs the workflow against the current model. It does not depend on a machine-specific path.

| Module | Responsibility |
|---|---|
| `core.js` | Portable URL normalization, CSDL type resolution, service-list joining and field documentation |
| `oauth.js` | Form encoding, client-credentials requests, token validation, expiry, renewal and session cleanup |
| `java-runtime.js` | Java HTTP GET/token POST requests, namespace-aware XML parsing, authentication header encoding |
| `ui.js` | Native SWT credentials and searchable checkbox entity picker |
| `archi-adapter.js` | Preflight validation, managed identity lookup, model mutations and properties |
| `app.js` | URL → authentication → discovery → selection → preflight → synchronization |

Discovery completes before model changes. The service document is authoritative for the available list; `$metadata` supplies each listed entity's structure. Invalid or incomplete metadata is shown as an unavailable row. No entity record requests occur.

Selected entities are fully prepared before any model mutation. Duplicate managed IDs, changed concept/relationship types, conflicting folders and malformed generated documentation blocks fail preflight. Unexpected errors during application may leave an undoable partial change; the script reports the error and never saves automatically.

The identity property `OData-Key` is a JSON tuple `[canonicalServiceUrl, entitySetName, role]`, where role is `interface`, `data`, or `access`. Same-named manual elements remain separate. The script only updates its own concepts (`OData-ManagedBy=archi-odata-sync`). Existing manual relationships are preserved.

Application concepts are placed under `OData / service URL / API` for Application Interfaces and `OData / service URL / Entities` for Data Objects. Type folders are identified by managed keys `type:interface` and `type:data`. Synchronizing selected existing concepts also moves them into these folders using jArchi's undoable folder API, retaining IDs and diagram references. Unselected concepts are untouched. Access relationships remain directly under their service folder in the Relations category. Conflicts with unmanaged type-folder names are caught during preflight.

Owned properties include `OData-ServiceUrl`, `OData-EntitySet`, `OData-EntityType`, `OData-EntityUrl`, `OData-Role`, `OData-FieldCount`, `OData-LastSyncAt`, `CreatedDate`, `CreatedTime`, `LastSyncDate` and `LastSyncTime`. Creation timestamps are written only once. Model properties store the last successful URL, per-service selections, and synchronization time. No authentication data is stored.

The default response limit is 256 MiB (`268435456` bytes). Both the advertised Content-Length and the actual bytes received are checked, including responses without a length header. Size-limit errors report the known or minimum received size and the configured cap. Connect timeout is 20 seconds, response read timeout is 60 seconds, with an additional elapsed-body-read check. Standard JVM proxy/trust configuration applies; certificate validation is never disabled. Error messages omit response bodies. XML parsing still builds a DOM, so memory consumption can exceed the response size.

OAuth uses a user-supplied token endpoint, resource, client ID and client secret. Secrets are submitted in a UTF-8 URL-encoded `client_credentials` POST body only to that token endpoint. The token response is capped at 1 MiB; redirects are disabled. Only known OAuth error codes are included in errors, never raw descriptions or responses. Resource endpoints receive only the access token. Both credentialed service requests and token requests require HTTPS except explicit localhost tests.

The session holds credentials until discovery completes and the user finishes/cancels the operation. It reuses the token, acquires another before expiry, and invalidates/retries once on a 401; a second 401 fails. Refresh tokens are not used. A token response without `expires_in` is reused for this run until rejected. All successful, cancelled and failed discovery/application paths clear the OAuth session. Authentication failures clear the session before it is returned to the application.

The executable package is portable JavaScript and Java/SWT. Automated portable tests can run on Windows, macOS and Linux; native Archi verification has been performed on Windows only.

## Primary references

- [OData 4.0 JSON format, section 5: Service Document](https://docs.oasis-open.org/odata/odata-json-format/v4.0/errata03/os/odata-json-format-v4.0-errata03-os-complete.html): advertised entity sets, entry names, kinds and URLs.
- [OData 4.0 CSDL](https://docs.oasis-open.org/odata/odata/v4.0/os/part3-csdl/odata-v4.0-os-part3-csdl.html): entity types, properties, keys, aliases, inheritance and entity sets.
- [jArchi Model API](https://github.com/archimatetool/archi-scripting-plugin/wiki/Model): element and relationship creation.
- [jArchi Relationship API](https://github.com/archimatetool/archi-scripting-plugin/wiki/Relationships): `accessType = "readwrite"`.
- [Public TripPin OData service](https://services.odata.org/V4/TripPinServiceRW/): optional anonymous integration check.
- [OAuth 2.0, RFC 6749](https://www.rfc-editor.org/rfc/rfc6749): client credentials grant, form encoding and token responses.
- [Microsoft identity platform client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow): Entra v2 token POST and the resource `/.default` scope.

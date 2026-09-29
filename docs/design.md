# Design

`scripts/Sync OData.ajs` loads the libraries relative to its own directory, then runs the workflow against the current model. It does not depend on a machine-specific path.

| Module | Responsibility |
|---|---|
| `core.js` | Portable URL normalization, CSDL type resolution, service-list joining and field documentation |
| `oauth.js` | Form encoding, client-credentials requests, token validation, expiry, renewal and session cleanup |
| `java-runtime.js` | Java HTTP GET/token POST requests, namespace-aware XML parsing, authentication header encoding |
| `session.js` | Process-only connection defaults, isolated per canonical service URL |
| `progress.js` | SWT event pumping, worker lifetime and cancelable preflight followed by UI-thread model application |
| `discovery-worker.js` | Background authentication/discovery in a private GraalJS context, reporting through Java atomics |
| `ui.js` | Native SWT credentials and searchable checkbox entity picker |
| `archi-adapter.js` | Preflight validation, managed identity lookup, model mutations and properties |
| `app.js` | URL → authentication → discovery → selection → preflight → synchronization |

Discovery completes before model changes. The service document is authoritative for the available list; `$metadata` supplies each listed entity's structure. Invalid or incomplete metadata is shown as an unavailable row. No entity record requests occur.

The connection form collects credentials on the UI thread, then the progress coordinator starts a Java Thread with a Runnable created inside a separate GraalJS context. The worker loads only core, OAuth and Java runtime modules; it receives no model or SWT objects. Inputs, progress and results cross through Java AtomicReferences containing Java Strings, with an AtomicBoolean cancellation flag. JS objects and callbacks are not shared between concurrently active contexts. Only the worker performs authentication, HTTP reads, XML parsing and entity analysis. Tokens remain inside the worker and are cleared before the context closes. The per-run credential copy is cleared separately from the application-lifetime form cache.

The UI polls progress every 25 ms and pumps SWT events; worker updates are throttled to about 100 ms, except stage changes and completion. Downloads report actual bytes and use a determinate bar only with positive Content-Length. Unknown lengths and XML parsing use an activity indicator. No percentage is inferred for the whole workflow. A separate modal window wraps preflight and model mutation, with actual element and entity counts. Model operations stay on the UI thread and retain native Undo/Redo. Cancellation is checked again at the mutation boundary; afterward the Cancel button and close action cannot interrupt writes.

Cancellation is cooperative. The worker checks at stage transitions and read-loop checkpoints; a blocking connection/read or DOM parse must finish or time out before its next checkpoint. While stopping, the UI remains responsive and shows a canceling status. The coordinator waits for the worker before closing its context, clears shared references and closes the progress window on success, cancellation or error. No partial discovery result is offered for synchronization.

Selected entities are fully prepared before any model mutation. Duplicate managed IDs, changed concept/relationship types, conflicting folders and malformed generated documentation blocks fail preflight. Unexpected errors during application may leave an undoable partial change; the script reports the error and never saves automatically.

The identity property `OData-Key` is a JSON tuple `[canonicalServiceUrl, entitySetName, role]`, where role is `interface`, `data`, `access`, `serving`, or `environment`. The environment uses an empty entity-set name, giving one shared Node per service URL. Same-named manual elements remain separate. The script only updates its own concepts (`OData-ManagedBy=archi-odata-sync`). Existing manual relationships are preserved.

Application concepts are placed under `OData / service URL / API` for Application Interfaces and `OData / service URL / Entities` for Data Objects. Type folders are identified by managed keys `type:interface` and `type:data`. Synchronizing selected existing concepts also moves them into these folders using jArchi's undoable folder API, retaining IDs and diagram references. Unselected concepts are untouched. Access relationships remain directly under their service folder in the Relations category. Conflicts with unmanaged type-folder names are caught during preflight.

An environment `node` is created in the Technology & Physical category under `OData / service URL`. The plan places it before interface/data operations, then creates `serving-relationship` links from that environment to each selected Application Interface. Both Serving and Access relationship types and endpoints are checked in preflight, along with the environment's Node type. Read/Write is set only on Access relationships. Resync reuses the environment and links; changing the selected entity set updates the shared environment but preserves unselected entity content and links. Environment names and manual documentation are preserved. Entity counts exclude the shared Node and relationships.

Owned properties include `OData-ServiceUrl`, `OData-EntitySet`, `OData-EntityType`, `OData-EntityUrl`, `OData-Role`, `OData-FieldCount`, `OData-LastSyncAt`, `CreatedDate`, `CreatedTime`, `LastSyncDate` and `LastSyncTime`. Creation timestamps are written only once. Model properties store per-service entity selections and synchronization time. No connection-form defaults or authentication data are stored. Successful application removes the legacy `OData-LastServiceUrl` property through the undoable jArchi API; form defaults never read it.

Connection defaults use a namespaced SWT Display data entry containing a Java String of JSON, so they survive separate jArchi/GraalJS contexts in the same application without retaining guest objects or callbacks. There is no file, model, Java preferences or system-property persistence. The last normalized URL is remembered when accepted; credentials and authentication choice are remembered when their form is submitted, before network access. Canceled forms leave the cache unchanged. Allowlisted credential fields are copied by value and scoped to canonical service URL and authentication mode. Access tokens are never included. The cache, including client secrets or Basic passwords, exists only in process memory until Archi closes. Configured non-secret defaults apply when no remembered values exist.

The default response limit is 256 MiB (`268435456` bytes). Both the advertised Content-Length and the actual bytes received are checked, including responses without a length header. Size-limit errors report the known or minimum received size and the configured cap. Connect timeout is 20 seconds, response read timeout is 60 seconds, with an additional elapsed-body-read check. Standard JVM proxy/trust configuration applies; certificate validation is never disabled. Error messages omit response bodies. XML parsing still builds a DOM, so memory consumption can exceed the response size.

OAuth uses a user-supplied token endpoint, resource, client ID and client secret. Secrets are submitted in a UTF-8 URL-encoded `client_credentials` POST body only to that token endpoint. The token response is capped at 1 MiB; redirects are disabled. Only known OAuth error codes are included in errors, never raw descriptions or responses. Resource endpoints receive only the access token. Both credentialed service requests and token requests require HTTPS except explicit localhost tests.

The OAuth operation holds its own credential copy until discovery completes or is canceled. It reuses the token, acquires another before expiry, and invalidates/retries once on a 401; a second 401 fails. Refresh tokens are not used. A token response without `expires_in` is reused for discovery until rejected. Successful, canceled and failed discovery paths clear the OAuth operation before the entity picker opens. Authentication failures also clear it. This does not clear the separate connection-form cache.

The executable package is portable JavaScript and Java/SWT. Automated portable tests can run on Windows, macOS and Linux; native Archi verification has been performed on Windows only.

## Primary references

- [OData 4.0 JSON format, section 5: Service Document](https://docs.oasis-open.org/odata/odata-json-format/v4.0/errata03/os/odata-json-format-v4.0-errata03-os-complete.html): advertised entity sets, entry names, kinds and URLs.
- [OData 4.0 CSDL](https://docs.oasis-open.org/odata/odata/v4.0/os/part3-csdl/odata-v4.0-os-part3-csdl.html): entity types, properties, keys, aliases, inheritance and entity sets.
- [jArchi Model API](https://github.com/archimatetool/archi-scripting-plugin/wiki/Model): element and relationship creation.
- [SWT Display API](https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.isv/reference/api/org/eclipse/swt/widgets/Display.html): display-scoped application data through `getData` and `setData`.
- [GraalJS multithreading](https://www.graalvm.org/jdk24/reference-manual/js/Multithreading/): independent contexts and concurrent Java-object access; no concurrent access to shared JavaScript objects.
- [jArchi Relationship API](https://github.com/archimatetool/archi-scripting-plugin/wiki/Relationships): `accessType = "readwrite"`.
- [Public TripPin OData service](https://services.odata.org/V4/TripPinServiceRW/): optional anonymous integration check.
- [OAuth 2.0, RFC 6749](https://www.rfc-editor.org/rfc/rfc6749): client credentials grant, form encoding and token responses.
- [Microsoft identity platform client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow): Entra v2 token POST and the resource `/.default` scope.

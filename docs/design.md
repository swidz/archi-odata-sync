# Design

`scripts/Sync OData.ajs` loads the libraries relative to its own directory, then runs the workflow against the current model. It does not depend on a machine-specific path.

| Module | Responsibility |
|---|---|
| `core.js` | Portable URL normalization, CSDL type resolution, service-list joining and field documentation |
| `java-runtime.js` | Java HTTP requests, namespace-aware XML parsing, authentication header encoding |
| `ui.js` | Native SWT credentials and searchable checkbox entity picker |
| `archi-adapter.js` | Preflight validation, managed identity lookup, model mutations and properties |
| `app.js` | URL → authentication → discovery → selection → preflight → synchronization |

Discovery completes before model changes. The service document is authoritative for the available list; `$metadata` supplies each listed entity's structure. Invalid or incomplete metadata is shown as an unavailable row. No entity record requests occur.

Selected entities are fully prepared before any model mutation. Duplicate managed IDs, changed concept/relationship types, conflicting folders and malformed generated documentation blocks fail preflight. Unexpected errors during application may leave an undoable partial change; the script reports the error and never saves automatically.

The identity property `OData-Key` is a JSON tuple `[canonicalServiceUrl, entitySetName, role]`, where role is `interface`, `data`, or `access`. Same-named manual elements remain separate. The script only updates its own concepts (`OData-ManagedBy=archi-odata-sync`). Existing manual relationships are preserved.

Owned properties include `OData-ServiceUrl`, `OData-EntitySet`, `OData-EntityType`, `OData-EntityUrl`, `OData-Role`, `OData-FieldCount`, `OData-LastSyncAt`, `CreatedDate`, `CreatedTime`, `LastSyncDate` and `LastSyncTime`. Creation timestamps are written only once. Model properties store the last successful URL, per-service selections, and synchronization time. No authentication data is stored.

The default response limit is 32 MiB. Connect timeout is 20 seconds, response read timeout is 60 seconds, with an additional elapsed-body-read check. Standard JVM proxy/trust configuration applies; certificate validation is never disabled. Error messages omit response bodies.

The executable package is portable JavaScript and Java/SWT. Automated portable tests can run on Windows, macOS and Linux; native Archi verification has been performed on Windows only.

## Primary references

- [OData 4.0 JSON format, section 5: Service Document](https://docs.oasis-open.org/odata/odata-json-format/v4.0/errata03/os/odata-json-format-v4.0-errata03-os-complete.html): advertised entity sets, entry names, kinds and URLs.
- [OData 4.0 CSDL](https://docs.oasis-open.org/odata/odata/v4.0/os/part3-csdl/odata-v4.0-os-part3-csdl.html): entity types, properties, keys, aliases, inheritance and entity sets.
- [jArchi Model API](https://github.com/archimatetool/archi-scripting-plugin/wiki/Model): element and relationship creation.
- [jArchi Relationship API](https://github.com/archimatetool/archi-scripting-plugin/wiki/Relationships): `accessType = "readwrite"`.
- [Public TripPin OData service](https://services.odata.org/V4/TripPinServiceRW/): optional anonymous integration check.

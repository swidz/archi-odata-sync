# Archi OData Sync

Synchronize selected **OData 4.0 entity sets** into an Archi model using the **jArchi JavaScript engine**. The package follows the script/library layout used by Archi Azure Sync and Archi Power Platform Sync. It is a jArchi script package, not an Eclipse plug-in JAR.

For every checked entity, it creates or updates:

| Source | Archi concept | Name |
|---|---|---|
| Advertised entity set | Application Interface | Entity-set name |
| Entity's data structure | Data Object (application layer) | Same entity-set name |
| Interface → Data Object | Access relationship, **Read/Write** | Unnamed |

Both elements contain the available fields in their **Documentation** tab as a **numbered Markdown enumeration**. The data object represents the table/entity. The numbered list remains readable in Archi's plain-text documentation editor; Markdown-aware report tools can render the markup.

## Install

Requires Archi with jArchi installed and a JavaScript engine supporting Java interop (tested with GraalJS in jArchi 1.12). The runtime uses the bundled JDK's HTTP/XML APIs. Node.js and npm are needed only for development tests.

1. Extract the release ZIP.
2. Copy the entire `archi-odata-sync` directory under your jArchi Scripts directory. Keep `scripts`, `lib`, and `config` together.
3. Refresh the jArchi Scripts tree.
4. Open your model and run **archi-odata-sync / scripts / Sync OData.ajs**.

Windows installation alternative, from this repository:

```powershell
./tools/Install-ArchiScripts.ps1 -ScriptsDirectory "$env:USERPROFILE/Documents/Archi/scripts"
```

The installer creates a new package directory and refuses to overwrite an existing installation. macOS and Linux use the same package via the manual copy procedure.

## Synchronize

1. Enter the **service root URL**, for example `https://host.example/odata/`. Pasting its `$metadata` URL also works.
2. Choose **Anonymous**, **Bearer token**, or **Basic** authentication. Token/password inputs are masked. Use an access token issued for your service when it requires OAuth; this version does not acquire or renew tokens.
3. The script reads the service's JSON entity list and XML `$metadata` document.
4. In **Select OData entities**, search, sort, and check the entity sets you want. **Select filtered** adds the visible available entries to the selection. Checked entries stay checked when filtering or sorting.
5. Click **Synchronize**. Review the result and save your model when ready.

The popup lists the entity-set name, title, type, and field count or an explanation of unavailable metadata. Newly discovered entries start unchecked; the last successful selection is remembered separately for each service. Cancel closes the operation without changing the model.

New concepts are placed under **Application / OData / service URL**. Access relationships are under **Relations / OData / service URL**. Existing concepts stay in their current folders when refreshed.

## Repeated runs

- Identity is the canonical service URL, case-sensitive entity-set name and concept role. Interface, Data Object and Access relationship keep their Archi IDs.
- Rerunning with a different selection leaves previous unselected entities, diagrams and relationships unchanged.
- Missing entities are not deleted or marked deleted. This is an additive metadata synchronizer.
- Selected entities have their names, owned metadata properties and generated documentation refreshed. Other properties and documentation outside the generated block are preserved.
- The script never saves the model automatically. All model mutations use jArchi's Undo support.

Example field documentation:

```markdown
### Fields

1. **Id** — Edm.Int64; required; key
2. **Name** — Edm.String; nullable; maxLength=120
3. **Balance** — Edm.Decimal; nullable; precision=18; scale=2
4. **Address.City** — Edm.String; nullable
```

Generated sections are bounded by `<!-- archi-odata-sync:begin -->` and `<!-- archi-odata-sync:end -->`. Put your own notes above or below these markers. Broken or duplicated markers block synchronization so notes cannot be silently overwritten.

## Coverage and limits

- OData 4.x JSON service documents and XML CSDL using the OData 4 namespace. This package targets OData **4.0**; OData 2/3 and JSON CSDL are unsupported.
- Only advertised `EntitySet` entries are imported. Singletons, actions and function imports are excluded. Hidden metadata-only entity sets are excluded.
- Structural properties, inherited fields and keys, namespace aliases, complex fields, collections, enum members, named primitive types, nullability, maximum length, precision, scale and inline descriptions are documented. Navigation properties have their own numbered section.
- Recursive complex types are listed with an explicit expansion limit. Dynamic fields of open types cannot be enumerated from static metadata; documentation notes this.
- External CSDL reference documents are not downloaded. If a required type is outside the retrieved document, that entity is listed as unavailable rather than imported with incomplete fields.
- The script reads **schema information only**. It does not retrieve records or write to the OData service. Read/Write Access is the requested architectural mapping, not a claim about the endpoint's CRUD capabilities or the signed-in user's permissions.
- Anonymous, supplied bearer token, and Basic credentials are supported. Browser sign-in, integrated Windows authentication, OAuth token acquisition and custom-header API keys are not included.
- Service URLs must not contain credentials, query parameters, or fragments. Credentials stay in process memory and are not stored in the model, files, logs or settings. Credentialed requests require HTTPS except for localhost testing.
- Redirects are limited to the same origin. XML DTDs/external entities are disabled. Response size and timeout limits are configurable in `config/settings.js`.
- Requests run synchronously in the jArchi script; large metadata responses can temporarily block Archi interaction until the request completes or times out.

## Development

```text
npm test
npm run check
```

There are no npm dependencies. See [verification](docs/verification.md) for real Archi, dialog and HTTP tests. See [design and sources](docs/design.md) for the module boundaries and protocol references.

## License

Copyright (c) 2026 Sebastian Widz. Licensed under the [MIT License](LICENSE).

# Archi OData Sync

Synchronize selected **OData 4.0 entity sets** into an Archi model using the **jArchi JavaScript engine**. The package follows the script/library layout used by Archi Azure Sync and Archi Power Platform Sync. It is a jArchi script package, not an Eclipse plug-in JAR.

For every checked entity, it creates or updates:

| Source | Archi concept | Name |
|---|---|---|
| Advertised entity set | Application Interface | Entity-set name |
| Entity's data structure | Data Object (application layer) | Same entity-set name |
| Interface → Data Object | Access relationship, **Read/Write** | Unnamed |
| OData service environment (one per service URL) | Node (Technology & Physical layer) | `OData Environment - <service URL>` |
| Environment → Application Interface | **Serving** relationship | Unnamed |

Both elements contain the available fields in their **Documentation** tab as a **numbered Markdown enumeration**. The data object represents the table/entity. The numbered list remains readable in Archi's plain-text documentation editor; Markdown-aware report tools can render the markup.

## Install

Requires Archi with jArchi installed and the **GraalJS** JavaScript engine (tested in jArchi 1.12). Responsive background discovery uses an isolated GraalJS context and the bundled JDK's HTTP/XML APIs. Node.js and npm are needed only for development tests.

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
2. If a snapshot exists, choose **Use cached metadata** or **Download fresh**. The dialog shows the download date and metadata size. Reuse is selected by default and skips authentication and network requests.
3. For a fresh download, choose **OAuth 2.0 (client credentials)** and enter the **OAuth token URL**, **resource**, **client ID** and **client secret value**. The secret input is masked. The script obtains the access token, reads the service's JSON entity list and XML `$metadata`, and saves a temporary snapshot after successful analysis. Anonymous and Basic authentication remain available.
4. In **Select OData entities**, search, sort, and check the entity sets you want. **Select filtered** adds the visible available entries to the selection. Checked entries stay checked when filtering or sorting.
5. Click **Synchronize**. Review the result and save your model when ready.

The popup lists the entity-set name, title, type, and field count or an explanation of unavailable metadata. Newly discovered entries start unchecked; the last successful selection is remembered separately for each service. Cancel closes the operation without changing the model.

A progress window shows authentication, downloading, metadata parsing and entity analysis. Downloads show received **MB** and a percentage when the server supplies a total size; otherwise an activity indicator is shown. Authentication and discovery run in the background so Archi can process UI events. The window closes before the entity picker opens.

After **Synchronize**, progress shows preparation, updated elements and completed entities. **Cancel** is available during discovery and preparation. Canceling leaves the model unchanged; an active network request or XML parse may need to finish or time out before the window closes. Once model updates start, Cancel and window closing are disabled. The updates remain a single **Edit > Undo** operation. Progress is specific to each stage, with no estimated overall percentage.

### Temporary metadata cache

The first successful download saves the **complete entity list and metadata** for that service URL, regardless of which entities you select afterward. Run the script again, choose **Use cached metadata**, and select the next few entities/APIs. Earlier imported elements remain unchanged unless selected again. Loading and parsing the snapshot still happens in the background with progress.

Snapshots are stored as ZIP files under the operating system's temporary directory, in `archi-odata-sync` (normally `%TEMP%\archi-odata-sync` on Windows). Each service has its own file, containing `service.json`, `metadata.xml` and a small URL/date manifest. Nothing about the cache is stored in your Archi model. Client IDs, secrets, passwords, tokens and authentication responses are not added to the cache. Connection-form values continue to be remembered only until Archi closes.

The metadata snapshot can survive restarting Archi and can be reused offline. It has no automatic expiry; the operating system or you can remove these temporary files, after which the next run downloads again. Choose **Download fresh** when the schema or connection/account has changed: reuse uses the snapshot from the previous connection and does not recheck service access. Refresh downloads both documents and replaces the snapshot only after they have been successfully analyzed. A failed download, invalid metadata or interrupted cache write preserves the previous snapshot; refresh failures never silently fall back to cached content.

If the cache cannot be saved, the script tells you and still lets you import the freshly discovered entities. Missing or damaged snapshots can be replaced by downloading fresh. `maxResponseBytes` also limits the uncompressed documents loaded from cache. An optional non-secret `cacheDirectory` in `config/settings.js` can override the temporary cache location.

Concepts are grouped by type beneath the service URL:

```text
Application
└── OData
    └── service URL
        ├── API         (Application Interfaces)
        └── Entities    (Data Objects)
```

Access relationships are under **Relations / OData / service URL**. On the next sync, selected existing interfaces and data objects move into the corresponding type folders, preserving their IDs, documentation, diagram instances and relationships. Unselected entities keep their existing folders; select them in a later run to reorganize them. Folder moves are included in the script's Undo operation.

The infrastructure environment Node is placed under **Technology & Physical / OData / service URL**. One environment is shared by all interfaces imported from the same service URL. It **serves each selected API interface**, which in turn has Read/Write Access to its Data Object. Serving relationships are stored beside Access relationships under **Relations / OData / service URL**.

Rerunning an older model adds the environment and missing Serving links for the selected entities. Existing Node and Serving IDs are reused; unselected interfaces and their existing links remain untouched. You can rename the environment Node and add documentation outside its generated block; these edits are preserved. Different service URLs get separate environment Nodes. The Node represents the service environment for this architecture mapping; the script does not discover physical hosting infrastructure.

### OAuth 2.0 connection

The OData URL identifies the service to inspect. The OAuth token URL is initially prefilled with the Microsoft Entra v2 template below. Replace `{tenant-id}` with your tenant ID, or enter another full token endpoint. A configured `oauthTokenUrl` takes precedence over the template; values remembered during the current Archi session take precedence over configuration.

| Input | Example / meaning |
|---|---|
| OData service URL | `https://your-environment.example.com/data/` |
| OAuth token URL | `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token` |
| Resource | `https://your-environment.example.com` — the API's registered resource/audience identifier |
| Client ID | Application registration's client ID |
| Client secret | The secret **value**, not the secret's ID |

For a resource-based token endpoint, the script posts `grant_type=client_credentials`, `resource`, `client_id` and `client_secret` as URL-encoded form data. For an Entra endpoint ending in `/oauth2/v2.0/token`, it sends `scope=<resource>/.default` instead of `resource`. The resource identifier is preserved exactly, including a trailing slash if required by that API; an already supplied `/.default` suffix is not duplicated.

The application must have the target API's required application permissions and any service-specific application mapping. Credentials are not inferred from the OData URL. The token endpoint uses `client_secret_post` authentication; certificate credentials and endpoints requiring HTTP Basic client authentication are not supported by this OAuth option.

Tokens are reused during the run, renewed before their reported expiry, and reacquired once after an HTTP 401. Tokens and the authentication operation's credential copy are cleared on completion or cancellation. The connection form keeps its own in-memory copy until Archi closes, as described below. No refresh token is required. Token endpoint redirects are rejected, and error dialogs omit token response bodies and server error descriptions.

Optional non-secret defaults can be set in `config/settings.js`: `oauthTokenUrl`, `oauthResource` and `oauthClientId`. Never add a secret or token to that file.

### Remembering connection forms

The last valid OData URL and submitted connection values are remembered **only until Archi closes**. OAuth token URL, resource, client ID and masked client secret are restored separately for each canonical service URL. Basic username/password and the last authentication choice are also remembered. The previous authentication choice appears first in the chooser. Values remain available across script runs and open models in the same Archi process.

Clicking **Connect** or **Continue** remembers that form even if the subsequent network request fails. Canceling or closing a form leaves its previous submitted values intact. Changing to an unfamiliar service URL starts with configured defaults and an empty secret. The script does not write connection defaults to files, preferences, settings or the model. After restarting Archi, enter the secret again; configured non-secret defaults still apply.

Earlier versions stored the URL prompt default as the model property `OData-LastServiceUrl`. It is no longer read and is removed during the next successful synchronization, with normal Undo support. Imported elements still carry their source URLs for identity and documentation, and per-service entity selections remain part of the model; these are separate from connection-form memory.

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
- OAuth 2.0 client credentials, Anonymous and Basic credentials are supported. Manual bearer-token entry has been removed. Browser sign-in, integrated Windows authentication and custom-header API keys are not included.
- Service URLs must not contain credentials, query parameters, or fragments. Credentials stay in process memory and are not stored in the model, files, logs or settings. Credentialed requests require HTTPS except for localhost testing.
- Redirects are limited to the same origin. XML DTDs/external entities are disabled. The response size limit defaults to **256 MiB** (`maxResponseBytes: 268435456`), accommodating metadata documents larger than the original 32 MiB limit. Size-limit errors report the response size and configured cap. Adjust this and the timeout limits in the **installed** `archi-odata-sync/config/settings.js` when needed; increasing the cap also allows higher memory use while XML is parsed.
- Requests run synchronously in the jArchi script; large metadata responses can temporarily block Archi interaction until the request completes or times out.

## Development

```text
npm test
npm run check
```

There are no npm dependencies. See [verification](docs/verification.md) for real Archi, dialog and HTTP tests. See [design and sources](docs/design.md) for the module boundaries and protocol references.

## License

Copyright (c) 2026 Sebastian Widz. Licensed under the [MIT License](LICENSE).

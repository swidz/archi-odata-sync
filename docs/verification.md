# Verification

Verified on Windows with the installed Archi and jArchi 1.12/GraalJS runtime. All native runs use isolated runtime configuration and disposable models; no existing user model is opened or modified.

| Check | Result |
|---|---|
| Node regression suite | 71 passing tests, including OAuth/session/cache behavior, per-entity and total analysis budgets, exact boundaries, cancellation within expansion/resolution, duplicate fields, independent cached rows and deep inheritance |
| Native Archi/XML/model suite | 42 checks, including shared environment Nodes, Serving direction, legacy-model upgrade, removal of the model-backed URL default, cross-service isolation, ID preservation, folder grouping, preflight conflicts and Undo/Redo |
| Native SWT dialogs | 37 checks: entity selection, OAuth form fields, validation, restored masked secrets, configured defaults, service isolation, canceled edits, Basic defaults and the dated cache reuse/refresh/cancel dialog |
| Native session lifecycle | 4 checks across closed GraalJS contexts; repeated in a second Archi process to verify no connection values survive application exit |
| Native progress and background discovery | 18 checks: known/unknown download sizes, responsive OAuth and download cancellation, credential cleanup, safe failures, preflight cancellation without writes, disabled cancellation during model updates, entity counts, Undo/Redo and large metadata parsing in the worker |
| Native analysis limits and cancellation | 12 checks: bounded acyclic expansion, configurable budgets in direct/fresh/cached paths, preserved limit diagnostics and snapshots, cancellation within one entity and the worker progress window |
| Temporary metadata cache | 17 checks: fresh OAuth snapshot, zero-network reuse, successive subset imports, URL isolation, schema refresh, preservation on download/parse/write failure, no credential payloads, bounded reads, corrupt-cache handling and unavailable storage |
| Cache after restart, offline | 2 checks in a new Archi process after stopping the fixture: snapshot discovery and entity analysis without a running server |
| Java HTTP client with synthetic loopback service | 23 checks: OAuth acquisition and renewal, response size diagnostics, Content-Length and chunked response caps, redirect refusal, redaction and timeout |
| Large metadata in native Archi | 6 checks: CSDL with 180,000 synthetic fields exceeds the old 32 MiB cap and completes XML parsing and entity discovery with the 256 MiB default |
| Public OData TripPin live integration | 4 entity sets discovered; People imported with 12 fields |
| JavaScript/jArchi syntax | 22 scripts passed |

The public sample check performs only GET requests for its service document and metadata. Its write-capable name does not change the synchronizer's read-only HTTP behavior.

Not verified: a user-provided OData endpoint or real OAuth tenant, native Archi on macOS/Linux, and the current change's GitHub Actions run. OAuth integration was verified using synthetic credentials and a local token endpoint; the public TripPin test uses anonymous access.

## Repeat locally

```powershell
npm test
npm run check

# Point to a bundles.info file from an Archi configuration containing jArchi.
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/config/org.eclipse.equinox.simpleconfigurator/bundles.info'
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script ui-smoke.ajs

# In another terminal, run the synthetic service (Ctrl+C to stop):
node tools/http-fixture.cjs
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script http-smoke.ajs
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script progress-smoke.ajs
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script discovery-limits-smoke.ajs
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script large-metadata-smoke.ajs
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script cache-smoke.ajs

# Stop the synthetic service, then verify reuse in a new Archi process:
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script cache-restart-smoke.ajs

# Optional public-network check:
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script live-smoke.ajs
```

Results and test runtime files are written beneath ignored `work/`. The launcher fails if it does not receive a fresh `status: passed` result. The default Archi installation is `C:/Program Files/Archi`; override `-ArchiHome` as needed.

For connection-form memory, run `./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script session-smoke.ajs` twice. Each invocation starts a fresh process, verifies its cache is empty, and tests restoration after the writing GraalJS context closes. The test deliberately leaves synthetic values in the first process's memory to verify the next process cannot recover them. No credentials are written to its result file.

For v0.7.1, all 71 Node tests, 161 native checks across the nine local suites, and syntax checks were rerun. The public-service result is retained from earlier verification; no real tenant was contacted. Cache tests use unique directories under ignored `work/`, never a user's production cache. The progress suite also saves an image of the native dialog to `work/progress-preview.png` for visual review.

The synthetic branching fixture contains eight acyclic complex types with four properties each. With a deliberately raised budget it produces 87,382 fields in native Archi; the default per-entity limit now rejects it without offering a partial list. These tests exercise both fresh and cached worker paths and cancellation during analysis.

A local Node comparison of v0.7.0 and v0.7.1 used the same metadata and separate VM contexts, two warm-up runs and the median of seven measured runs. Resolving a flat 8,000-field entity improved from 100.16 ms to 5.64 ms, with identical serialized output. The 2,000- and 4,000-field cases also matched exactly (12.97 to 1.44 ms and 21.75 to 2.45 ms). These are synthetic field-resolution measurements, not end-to-end download or production-service timings.

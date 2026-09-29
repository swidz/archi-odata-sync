# Verification

Verified on Windows with the installed Archi and jArchi 1.12/GraalJS runtime. All native runs use isolated runtime configuration and disposable models; no existing user model is opened or modified.

| Check | Result |
|---|---|
| Node regression suite | 56 passing tests, including OAuth encoding, expiry, cleanup, authentication failures, per-service form memory, URL defaults across models and progress cancellation |
| Native Archi/XML/model suite | 42 checks, including shared environment Nodes, Serving direction, legacy-model upgrade, removal of the model-backed URL default, cross-service isolation, ID preservation, folder grouping, preflight conflicts and Undo/Redo |
| Native SWT dialogs | 25 checks: entity selection, OAuth form fields, validation, restored masked secrets, configured defaults, service isolation, canceled edits and Basic defaults |
| Native session lifecycle | 4 checks across closed GraalJS contexts; repeated in a second Archi process to verify no connection values survive application exit |
| Native progress and background discovery | 18 checks: known/unknown download sizes, responsive OAuth and download cancellation, credential cleanup, safe failures, preflight cancellation without writes, disabled cancellation during model updates, entity counts, Undo/Redo and large metadata parsing in the worker |
| Java HTTP client with synthetic loopback service | 23 checks: OAuth acquisition and renewal, response size diagnostics, Content-Length and chunked response caps, redirect refusal, redaction and timeout |
| Large metadata in native Archi | 6 checks: CSDL with 180,000 synthetic fields exceeds the old 32 MiB cap and completes XML parsing and entity discovery with the 256 MiB default |
| Public OData TripPin live integration | 4 entity sets discovered; People imported with 12 fields |
| JavaScript/jArchi syntax | Passed |

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
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script large-metadata-smoke.ajs

# Optional public-network check:
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script live-smoke.ajs
```

Results and test runtime files are written beneath ignored `work/`. The launcher fails if it does not receive a fresh `status: passed` result. The default Archi installation is `C:/Program Files/Archi`; override `-ArchiHome` as needed.

For connection-form memory, run `./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script session-smoke.ajs` twice. Each invocation starts a fresh process, verifies its cache is empty, and tests restoration after the writing GraalJS context closes. The test deliberately leaves synthetic values in the first process's memory to verify the next process cannot recover them. No credentials are written to its result file.

For v0.6.0, all suites above except the public TripPin service were rerun. The public-service result is retained from earlier verification. The progress suite also saves an image of the native dialog to `work/progress-preview.png` for visual review.

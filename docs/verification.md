# Verification

Verified on Windows with the installed Archi and jArchi 1.12/GraalJS runtime. All native runs use isolated runtime configuration and disposable models; no existing user model is opened or modified.

| Check | Result |
|---|---|
| Node regression suite | 48 passing tests, including OAuth encoding, expiry, cleanup and authentication failures |
| Native Archi/XML/model suite | 22 checks, including stable IDs, Read/Write Access, documentation preservation and Undo/Redo |
| Native SWT dialogs | 17 checks: entity selection, OAuth form fields, validation, masked client secret and cancellation |
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
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script large-metadata-smoke.ajs

# Optional public-network check:
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script live-smoke.ajs
```

Results and test runtime files are written beneath ignored `work/`. The launcher fails if it does not receive a fresh `status: passed` result. The default Archi installation is `C:/Program Files/Archi`; override `-ArchiHome` as needed.

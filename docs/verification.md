# Verification

Verified on Windows with the installed Archi and jArchi 1.12/GraalJS runtime. All native runs use isolated runtime configuration and disposable models; no existing user model is opened or modified.

| Check | Result |
|---|---|
| Node regression suite | 25 passing tests |
| Native Archi/XML/model suite | 22 checks, including stable IDs, Read/Write Access, documentation preservation and Undo/Redo |
| Native SWT dialogs | 12 checks: search, sorting, checked-state persistence, unavailable rows, cancellation and masked credential entry |
| Java HTTP client with synthetic loopback service | 9 checks: discovery, bearer/Basic authentication, redirects, error redaction, size cap and timeout |
| Public OData TripPin live integration | 4 entity sets discovered; People imported with 12 fields |
| JavaScript/jArchi syntax | Passed |

The public sample check performs only GET requests for its service document and metadata. Its write-capable name does not change the synchronizer's read-only HTTP behavior.

Not verified: a user-provided OData endpoint or tenant, native Archi on macOS/Linux, and OAuth token acquisition (not implemented). The included GitHub Actions workflow has not been run remotely.

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

# Optional public-network check:
./tools/test-archi.ps1 -BundlesFile 'C:/path/to/bundles.info' -Script live-smoke.ajs
```

Results and test runtime files are written beneath ignored `work/`. The launcher fails if it does not receive a fresh `status: passed` result. The default Archi installation is `C:/Program Files/Archi`; override `-ArchiHome` as needed.

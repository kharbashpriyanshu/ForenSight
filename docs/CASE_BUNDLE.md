# Signed `.forensight` Case Bundle

The case export endpoint creates a temporary ZIP-compatible `.forensight` archive containing:

- `case.json`: case-scoped case, evidence, analysis, job, observation, finding, note, lineage, audit, and report records.
- `evidence/`: original acquired bitstreams. Each one is checked against its recorded acquisition SHA-256 before packaging.
- `artifacts/` and `reports/`: available generated files referenced by analysis results or reports.
- `manifest.json`: schema version, case identifier, Ed25519 public-key fingerprint, and SHA-256/size for each included member.
- `manifest.sig`: Ed25519 signature over the canonical manifest bytes.

## Configure signing

Generate an Ed25519 key pair from the backend directory:

```bash
python scripts/generate_case_export_key.py
```

Place the printed `CASE_EXPORT_SIGNING_PRIVATE_KEY` value in the deployment secret store or local `.env`. The private key is not included in the archive. Share the printed public fingerprint with recipients through an independent trusted channel.

## Export and verify

An authenticated investigator with access to a case can select **Export signed case bundle** on the case Reports page. The API records the export action and streams a temporary archive to the browser.

Verify its cryptographic signature and every listed member without extracting any archive paths:

```bash
cd backend
python scripts/verify_case_bundle.py ../FS-CASE-XXXXXXXX.forensight --trusted-fingerprint <trusted-public-key-sha256>
```

Without `--trusted-fingerprint`, the tool checks that the bundle is internally consistent but reports that signer identity is unverified. Keep the manifest signature and public-key fingerprint with the handoff record.

The archive is a portable case-scoped data package, not a PostgreSQL backup or an automatic importer. Bundle consumers must preserve the source archive and verify it before any manual processing.

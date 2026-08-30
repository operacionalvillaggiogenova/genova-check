# Blexo V10 Cloudflare preservation inventory

Restored from `blexo-suite-D1-v10_1788056741983.zip`.  Archive content was
extracted without transformation: the static `public/` tree is at
`../public/legacy/`; this directory contains the Worker package material.

## Modules

- Static modules: Leiturista/Check, administration, Adm-Rateio, Ronda,
  Fiscalização, Diário, budgets, reimbursements, scanner, and PWA assets.
- Worker: `src/index.js`; its D1 schema history is the seven unmodified files
  `src/migrations/0001_initial.sql` through
  `src/migrations/0007_diario_source_id.sql`.
- Configuration and metadata: `wrangler.jsonc`, `package.json`, `.gitignore`,
  `README.md`, and `CLOUDFLARE-SETUP.md`.

## Worker configuration and routes

- Bindings: `ASSETS` (the configured `./public` static-assets directory), `DB`
  (D1 database `blexo-suite`), and `BUCKET` (R2 bucket
  `blexo-check-evidence`).
- Host policy: administrative pages/APIs and `/api/files/` are limited to
  `rateio.blexo.com.br` (with `*.workers.dev` allowed for testing).
- Routes: `GET /api/health`; POST sync endpoints for leiturista, ronda,
  fiscalização, and diário; GET admin listing/detail endpoints; rateio cycle
  GET/PUT plus reopen/recalculate/reading-delete/close actions; evidence
  upload; and R2 file download at `GET /api/files/:key`. Non-API requests are
  served through `ASSETS`.

## Storage and offline behavior

D1 stores reports, cycles, readings, administrative data, and rateio results;
R2 stores evidence images/PDFs. The legacy browser modules use IndexedDB for
local records/drafts, service-worker registration (`sw.js`), online/offline
status events, and `offline-pdf.js` for offline PDF generation. No Rateio
source or calculation was modified.

## Integrity verification

Each extracted file was SHA-256-compared directly with the corresponding
archive member (all comparisons passed at restoration). V11 adds files and
intentionally changes only this inventory, `README.md`, and `wrangler.jsonc`;
the V10 Worker and migrations `0001`–`0007` remain unchanged. V11 adds
`../public/legacy/v11-sw.js`, served at `/sw.js`, without changing preserved
`sw.js`; the original checksum facts below remain the restoration-time
snapshot. The canonical config is
`artifacts/blexo-suite/cloudflare-v10/wrangler.jsonc`; deploy from repository
root with `pnpm --filter @workspace/blexo-suite run cloudflare:deploy`, or
from build root `artifacts/blexo-suite` with `pnpm run cloudflare:deploy`.

| Tree | Files verified | SHA-256 of sorted `sha256sum` manifest |
| --- | ---: | --- |
| `../public/legacy` | 50 | `c7eec17e81a95693ac4509a7945af8623d8e3bd0bb96b89dd670098b57f0e6a9` |
| original restored Cloudflare package (before V11 additions) | 13 | `ce12639b300d9ad245fd69050e5d5384d148d204bbeccba88e1554c32326b433` |

The manifest hashes are computed from path-sorted lines in the form
`<file-sha256><two spaces><relative path>`. Selected preservation-critical
file checksums:

```text
a2a9e63c1b9117b36e781a6b2bc25b21f35cde3c198dda866c8a4a43cb3b2884  src/index.js
b774f94d7dc86edb0ba0a02c0d9bb79cbf3d16cbbd936bd864c3ca8727b90f39  wrangler.jsonc
8782c94d63795af10d9636c2be0682b97813ba23c2a3ae9faa1d32ff093ffe72  src/migrations/0001_initial.sql
f5ce1344fddc82e2d67c7fe068e98a27066790ae1cf0e86ca614236e380a70a9  src/migrations/0002_admin_rateio_controls.sql
4e32455086f096a6c058b7c43a40aa0a3622cc5b796fb481573132ffef6e2bed  src/migrations/0003_admin_modules.sql
84f5d8033c5c62041f171c05c65a9293ee9ae4a95bc7ac726937664e30da0d70  src/migrations/0004_ronda_admin.sql
bf4121b26464bcc21db19b27a128a56b92b9beb6406dac1a295fe7a3f16b2590  src/migrations/0005_fiscalizacao_d1.sql
2abfa0d9d7de75ad0ef5f11f05d3db191e068d09b833d449ced1bb0a2f986a6b  src/migrations/0006_diario_d1.sql
637a502032e97c92aceed1a4ef5a67c0ebc5ca957b4277f73b230b5198385332  src/migrations/0007_diario_source_id.sql
cbc1c17803e20d04789edaccb98e6501c44bfbaac8e7dbfcb72c22d6faada9be  ../public/legacy/adm-rateio.html
473629d17c27f91a9a33275c5dab60bf48d0355c3c2cf3a01ff05a26413fb409  ../public/legacy/adm-rateio.js
97f20682af383a2bf1afb1f51b6c384700887694034716d0b5327db516944157  ../public/legacy/adm-rateio.css
```
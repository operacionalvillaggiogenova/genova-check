# Fonte de produção do Blexo Check V11

Esta pasta é a única fonte de produção do Blexo Check V11.

- Runtime: Cloudflare Worker (`src/v11-worker.mjs`).
- Dados: binding D1 `DB` e migrations incrementais em `src/migrations/`.
- Arquivos: binding R2 `BUCKET`.
- Interface publicada: assets estáticos em `../public/legacy`.

O Worker V11 importa o Worker V10 preservado (`src/index.js`) para manter os
módulos existentes. Não edite migrations `0001` a `0007`, nem substitua o
Worker V10. Toda evolução deve ser aditiva.

## O que não é produção

`artifacts/api-server`, `lib/db`, `lib/api-*` e o frontend React em
`artifacts/blexo-suite/src` são material de protótipo/preview. Eles usam
Express, PostgreSQL e Drizzle e não devem receber credenciais Cloudflare, nem
ser usados nos comandos de deploy, migrations ou no build configurado no
Cloudflare.

## Comandos autorizados

Execute a partir da raiz do repositório:

```sh
pnpm --filter @workspace/blexo-suite run cloudflare:check
pnpm --filter @workspace/blexo-suite run cloudflare:migrate:local
pnpm --filter @workspace/blexo-suite run cloudflare:dev
pnpm --filter @workspace/blexo-suite run cloudflare:deploy
```

Antes do primeiro uso, defina somente no ambiente Cloudflare os secrets
`BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD`.

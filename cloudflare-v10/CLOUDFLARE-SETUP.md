# Blexo Check — Cloudflare/GitHub

## Recursos
- Worker: `genova-check` (o repositório GitHub pode continuar se chamando `genova-check`).
- D1: `blexo-suite`
- D1 ID: `8bdb42e8-0a0b-4b13-a416-de3ff283be25`
- R2: `blexo-check-evidence`

## Cloudflare Workers Builds
Configure o repositório GitHub `genova-check`, branch `principal`.

Install command: `bun install` (ou `npm install`).
No repositório workspace, o deploy command é
`pnpm --filter @workspace/blexo-suite run cloudflare:deploy`.
Com build root `artifacts/blexo-suite`, use `pnpm run cloudflare:deploy`.
O arquivo de configuração canônico é
`artifacts/blexo-suite/cloudflare-v10/wrangler.jsonc`.

O comando de deploy aplica as migrations remotas do D1 e depois publica o Worker.

## Domínios
- Aplicação principal: `app.blexo.com.br`
- Adm-Rateio: `rateio.blexo.com.br`

Durante testes, o Adm-Rateio também pode ser acessado pelo domínio `*.workers.dev`. Em produção, a intenção é restringir o módulo ao domínio `rateio.blexo.com.br` e posteriormente colocar Cloudflare Access.


## IMPORTANTE — Workers Builds

No Cloudflare Workers > Settings > Builds, use o comando pnpm acima. Não use
apenas `npx wrangler deploy`, pois isso pula a aplicação das migrations D1.

O repositório pode continuar se chamando `genova-check`. O Worker também usa `genova-check` no `wrangler.jsonc`; o domínio público pode ser personalizado depois.

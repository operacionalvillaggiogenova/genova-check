# Implantação Blexo Check — Cloudflare + GitHub

## 1. GitHub

Crie um repositório privado chamado `blexo-check`.

Na página do repositório:
- Add file → Upload files
- envie todos os arquivos deste pacote mantendo as pastas.
- Commit changes na branch `main`.

## 2. D1

Cloudflare Dashboard → Workers & Pages → D1 → Create database.

Nome:
`blexo-check`

Copie o Database ID.

No GitHub, abra `wrangler.jsonc` e substitua:
`COLE_AQUI_O_DATABASE_ID_DO_D1`

pelo ID real.

## 3. R2

Cloudflare Dashboard → R2 → Create bucket.

Nome:
`blexo-check-evidence`

O nome precisa ser igual ao `bucket_name` do `wrangler.jsonc`.

## 4. GitHub → Cloudflare

Cloudflare Dashboard → Workers & Pages → Create application → Import a repository.

Conecte GitHub, selecione `blexo-check` e publique.

A configuração de build pode usar:

Build command:
`npm install`

Deploy command:
`npx wrangler deploy`

Production branch:
`main`

## 5. Migration D1

No D1, abra o SQL Editor e execute o conteúdo de:
`src/migrations/0001_initial.sql`

Faça isso uma única vez no banco vazio.

## 6. Domínios

No Worker `blexo-check`, adicione:

`app.blexo.com.br`
`rateio.blexo.com.br`

O Worker já bloqueia o Adm-Rateio quando a requisição não vem de `rateio.blexo.com.br`.

## 7. Primeiro teste

Abra:
`https://app.blexo.com.br`

Depois:
`https://rateio.blexo.com.br/adm-rateio.html`

Teste o endpoint:
`https://app.blexo.com.br/api/health`

O resultado esperado é JSON com `ok: true`.

## 8. Deploys futuros

Depois da instalação inicial, o fluxo passa a ser:

GitHub → Commit/Push → Cloudflare Workers Builds → Deploy automático.

Não é necessário servidor Windows, PostgreSQL, PM2, NSSM ou Cloudflare Tunnel para o Blexo Check.

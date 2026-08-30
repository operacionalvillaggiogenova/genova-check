# Blexo Check — Cloudflare + GitHub

> Esta é a fonte canônica de produção. Consulte também
> [`PRODUCTION.md`](./PRODUCTION.md) para os limites entre esta aplicação
> Cloudflare e os protótipos locais que não devem ser publicados.

Aplicação do Blexo Check com frontend estático em Cloudflare Workers Static Assets, API em Cloudflare Workers, banco D1 e arquivos em R2.

## Arquitetura

- GitHub: código-fonte e histórico.
- Cloudflare Workers: aplicação/API.
- Workers Static Assets: páginas HTML/CSS/JS.
- D1: ciclos, leituras, contas, correções e resultados de rateio.
- R2: fotos e PDFs de evidências.
- `app.blexo.com.br`: aplicação principal.
- `rateio.blexo.com.br`: módulo administrativo de rateio.

O Adm-Rateio é bloqueado por host no Worker e só responde no domínio `rateio.blexo.com.br`.

## Configuração inicial — sem servidor local

1. Crie um repositório GitHub vazio, por exemplo `blexo-check`.
2. Envie o conteúdo deste pacote para a branch `main`.
3. No Cloudflare Dashboard, abra **Workers & Pages → Create application → Import a repository** e conecte o GitHub.
4. Selecione o repositório `blexo-check`.
5. A raiz do projeto é a raiz do repositório. Não use `public` como raiz.
6. O Worker deve se chamar exatamente `blexo-check`.
7. Antes do primeiro deploy, crie o D1 `blexo-check` e o R2 `blexo-check-evidence`.
8. Copie o `database_id` do D1 e substitua `COLE_AQUI_O_DATABASE_ID_DO_D1` em `wrangler.jsonc`.
9. No Cloudflare, configure o Worker para o domínio principal e o domínio de rateio.
10. Em **Workers & Pages → blexo-check → Settings → Builds**, conecte o repositório GitHub e selecione `main` como production branch.
11. Faça o primeiro deploy.
12. Aplique a migration `src/migrations/0001_initial.sql` pelo D1 SQL Editor ou pelo processo de migration configurado no projeto.

## Domínios

Recomendado:

- `app.blexo.com.br` → aplicação principal.
- `rateio.blexo.com.br` → Adm-Rateio.

O domínio `rateio.blexo.com.br` precisa apontar para o mesmo Worker. O Worker permite as rotas administrativas somente quando o Host é exatamente `rateio.blexo.com.br`.

## Fluxo operacional

Leiturista:

1. Preenche leituras de água/gás.
2. Registra fotos.
3. Gera o PDF de evidências.
4. Usa **Enviar leituras e evidências ao banco**.
5. Leituras vão para D1.
6. Fotos/PDF vão para R2.

Adm-Rateio:

1. Abre `rateio.blexo.com.br`.
2. Seleciona Água ou Gás.
3. Confere as leituras.
4. Corrige valores e informa o motivo.
5. Cadastra uma ou várias contas/faturas.
6. Confere consumo, média, percentual e valores.
7. Fecha o ciclo.
8. O resultado do rateio é gravado em `rateio_results` e as leituras ficam bloqueadas.

## Regras principais

Água:

`consumo do bloco = leitura atual - leitura anterior`

`consumo condomínio = consumo da fatura - soma dos blocos`

A parcela do bloco é proporcional ao consumo medido. A parcela do consumo do condomínio é distribuída igualmente entre as unidades do bloco.

Gás:

`kg = m³ × fator de conversão`

O fator padrão é `2,2`, mas pode ser alterado no Adm-Rateio. Várias contas podem ser lançadas no mesmo ciclo.

## Evolução futura

A próxima camada de segurança recomendada é Cloudflare Access para proteger `rateio.blexo.com.br`, sem criar autenticação própria no Blexo.


## Deploy Cloudflare
No repositório workspace, use `pnpm --filter @workspace/blexo-suite run cloudflare:deploy`.
Como alternativa, defina a raiz de build como `artifacts/blexo-suite` e use
`pnpm run cloudflare:deploy`. A configuração canônica é
`artifacts/blexo-suite/cloudflare-v10/wrangler.jsonc`; não use `npm run deploy`
na raiz do repositório.


### Deploy no Cloudflare
O comando de deploy deve ser `pnpm --filter @workspace/blexo-suite run cloudflare:deploy`
(ou `pnpm run cloudflare:deploy` com build root `artifacts/blexo-suite`). Ele
aplica as migrations do D1 `blexo-suite` remotamente e só depois publica o Worker.


### Atalho administrativo
A central `/adm.html` não aparece na tela inicial. Para acesso discreto, use **Ctrl+Shift+A**. Isso é apenas ocultação da interface; a proteção real deve ser feita posteriormente se houver necessidade.

## V11: identidade, permissões e atividades

Migration `0008_v11_identity_activities.sql` é aditiva; nunca edite ou
reaplique seletivamente as migrations históricas `0001`–`0007`. Aplique todas
as migrations localmente com `npx wrangler d1 migrations apply blexo-suite
--local`, ou no banco de produção com `npm run migrate`. Antes do primeiro
acesso V11, configure os Secrets do Worker `BOOTSTRAP_ADMIN_EMAIL` e
`BOOTSTRAP_ADMIN_PASSWORD` (senha com no mínimo oito caracteres). O primeiro
administrador só é criado quando a tabela `users` está vazia; não há credencial
de desenvolvimento embutida.

Para desenvolvimento use `npx wrangler dev`; para publicar use
`pnpm --filter @workspace/blexo-suite run cloudflare:deploy` (ou
`pnpm run cloudflare:deploy` com a raiz de build `artifacts/blexo-suite`),
que migra o D1 remoto antes do deploy. O Worker V11 usa
`src/v11-worker.mjs`, mantendo `src/index.js` como o Worker V10 preservado.
Sessões usam cookie `Secure`, `HttpOnly` e `SameSite=Strict`; hashes de senha e
tokens são feitos com Web Crypto. Permissões usam chaves `módulo.ação`, com
substituições `allow`/`deny` por usuário.

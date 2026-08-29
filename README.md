# Blexo Check — Cloudflare + GitHub

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
Use `npm run deploy` no Workers Builds para aplicar as migrations D1 e publicar o Worker.


### Deploy no Cloudflare
O comando de deploy deve ser `npm run deploy`. Ele aplica as migrations do D1 `blexo-suite` remotamente e só depois publica o Worker.


### Atalho administrativo
A central `/adm.html` não aparece na tela inicial. Para acesso discreto, use **Ctrl+Shift+A**. Isso é apenas ocultação da interface; a proteção real deve ser feita posteriormente se houver necessidade.

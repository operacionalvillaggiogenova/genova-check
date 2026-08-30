# Blexo Check V11 — prontidão Cloudflare

## Correções aplicadas nesta RC2

- A rota pública `POST /api/requests` é a única solicitação sem sessão. A
  listagem `GET /api/requests` voltou a exigir autenticação e permissão.
- O pacote de distribuição foi reconstruído sem `.wrangler`, `node_modules` ou
  qualquer estado local de D1/R2.
- A estrutura entregue contém um único Worker, assets estáticos, migrations D1
  e o binding R2 configurados em `cloudflare-v10/wrangler.jsonc`.
- O `package.json` na raiz do pacote permite ao Cloudflare executar
  diretamente `npm run deploy`, sem configurar um diretório-raiz alternativo.

## Compatibilidade verificada por inspeção e testes locais

| Item | Estado |
| --- | --- |
| Worker | `src/v11-worker.mjs` é o entrypoint configurado. |
| D1 | binding `DB`, migrations `0001` a `0011`, diretório `src/migrations`. |
| R2 | binding `BUCKET`, bucket `blexo-check-evidence`; evidências usam R2. |
| Cron | gatilho a cada cinco minutos para materializar recorrências. |
| Verificação local | sintaxe do Worker e 15 testes unitários aprovados. |

## O que ainda falta para a V11 final

1. Confirmar na conta Cloudflare que o `database_id` e o bucket do
   `wrangler.jsonc` são os recursos de produção corretos. Os dados fornecidos
   confirmam o D1 `blexo-suite` (`8bdb42e8-0a0b-4b13-a416-de3ff283be25`) e o
   bucket R2 `blexo-check-evidence`.
2. Aplicar as migrations em um D1 de homologação e executar o roteiro
   `cloudflare-v10/TEST-PLAN.md`, incluindo upload/leitura de evidência no R2
   e execução do Cron.
3. Configurar os segredos de bootstrap apenas se a base não possuir usuários;
   não há segredos incluídos no pacote.
4. Fazer o teste controlado de não regressão das telas V10 em produção.

As pendências funcionais não bloqueantes do plano são: configuração
compartilhada persistida no D1, interface para converter solicitações públicas
e checklists vinculados a modelos recorrentes. Indicadores permanecem fora do
escopo, conforme definido.

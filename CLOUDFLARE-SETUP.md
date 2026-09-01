# Cloudflare — blexo-suite

## Recursos preservados

- Worker técnico: `genova-check`;
- D1: `blexo-suite`;
- R2: `blexo-check-evidence`;
- aplicação pública: `app.blexo.com.br`;
- domínio adicional de Rateio, se ainda utilizado: `rateio.blexo.com.br`.

O nome técnico do Worker e do bucket foi preservado para evitar a criação acidental de novos recursos. O nome apresentado ao usuário é `blexo-suite`. Uma eventual renomeação de recursos Cloudflare deve ser tratada como uma migração separada.

## Build

Instalação:

```bash
npm ci
```

Validação:

```bash
npm test
npx wrangler deploy --dry-run
```

## Produção

Não houve publicação remota nesta entrega. Para uma janela autorizada:

1. exporte/guarde uma cópia do D1;
2. valide o `database_id`, o binding `DB` e o bucket `BUCKET` em `wrangler.jsonc`;
3. aplique `npm run migrate:remote` e confira cada migration;
4. publique com `npm run deploy`;
5. execute o roteiro pós-publicação de `docs/DEPLOYMENT-CHECKLIST.md`.

As migrations e o deploy não são mais executados por um único script. Isso evita que uma publicação automática altere o banco antes de uma revisão explícita.

# Checklist de implantação

## Antes da janela

- confirmar autorização explícita para alterar produção;
- exportar o D1 e registrar horário/arquivo do backup;
- confirmar Worker, D1 e R2 do ambiente correto;
- revisar migrations pendentes com `npx wrangler d1 migrations list blexo-suite --remote`;
- executar `npm test`, smoke local e `npx wrangler deploy --dry-run`;
- confirmar que nenhuma credencial ou arquivo `.dev.vars` entrou no pacote.

## Ordem de implantação

1. colocar a aplicação em uma janela de baixa utilização;
2. executar `npm run migrate:remote`;
3. verificar que todas as migrations ficaram aplicadas;
4. executar `npm run deploy`;
5. não renomear Worker, D1 ou R2 nesta mesma mudança.

## Validação pós-publicação

- abrir login e autenticar o administrador;
- confirmar nome `blexo-suite` e versão discreta em Configurações;
- abrir a tela inicial em celular;
- criar uma atividade de teste e iniciar/concluir;
- criar uma recorrência futura e confirmar a listagem;
- enviar um chamado pela página pública e conferir o roteamento;
- abrir Ronda com uma atividade vinculada e confirmar a sincronização;
- enviar um Rateio e confirmar tabela/documentos no Adm-Rateio;
- conferir um usuário Operacional sem acesso à Ronda;
- conferir um Supervisor com Configurações somente para consulta;
- verificar logs do Worker e objetos recentes no R2.

## Reversão

Migrations são aditivas e não apagam dados. Se o frontend/Worker apresentar regressão, publique o código anterior sem tentar remover colunas ou tabelas. Qualquer reversão de dados deve partir do backup e de uma análise específica; não use comandos destrutivos genéricos.

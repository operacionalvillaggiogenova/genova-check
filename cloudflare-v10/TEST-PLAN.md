# Roteiro de validação da V11

Execute em D1/R2 de homologação antes do deploy. Não use dados de produção.

## Identidade e acesso

- Login válido, senha inválida, usuário inativo, logout e expiração/renovação de sessão.
- Confirmar que cookies são `HttpOnly`, `Secure` e `SameSite=Strict`.
- Testar Administrador, Síndico, Zeladoria, Manutenção, Limpeza, Serviços Gerais e Leiturista.
- Para cada perfil, chamar diretamente uma API proibida e confirmar HTTP 403.
- Criar, editar, desativar e redefinir senha de usuário; confirmar que desativação e reset encerram sessões.
- Alterar permissões de perfil e exceções `allow`/`deny`; confirmar menu, página e API.

## Atividades e evidências

- Criar, atribuir, iniciar, concluir, cancelar, reatribuir e reabrir atividade.
- Verificar que executor sem permissão administrativa não altera a demanda.
- Validar exigência de foto, observação e foto + observação.
- Validar upload de JPEG, PNG e PDF até 15 MB; rejeitar formato inválido e arquivo maior.
- Confirmar histórico append-only, autor e horário em cada alteração.

## Recorrências

- Criar modelos diário, semanal, mensal e personalizado.
- Confirmar que modelos aparecem somente em `/recorrencias`.
- Disparar o Cron Trigger em homologação e confirmar uma atividade `pending` para cada execução vencida.
- Executar o Cron novamente e confirmar que não há duplicação de ocorrência.
- Pausar, reativar e confirmar que a próxima execução respeita o estado do modelo.

## Solicitações e checklists

- Enviar solicitação pública com e sem foto; verificar roteamento de equipe e R2.
- Converter solicitação em atividade e confirmar origem `public_request` e vínculo único.
- Criar checklist, marcar/desmarcar itens como executor e conferir histórico.

## Não regressão V10

- Leiturista: água, gás, sincronização, fotos e PDF.
- Rateio: abertura, cálculo, fechamento e reabertura de ciclo.
- Check, Ronda, Fiscalização e Diário: registro, evidências e visualização administrativa.
- PWA: instalação, cache, logout, navegação autorizada offline e bloqueio de páginas não autorizadas.

## Liberação

Só publicar após todos os itens acima aprovados, migrations `0008` a `0011` aplicadas em ordem e backup lógico do D1 confirmado.

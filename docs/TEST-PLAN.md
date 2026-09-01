# Plano de testes

## Automatizados já disponíveis

- hash e verificação de senha;
- normalização de usuário;
- regra de senha simples;
- bootstrap/login e matriz inicial;
- criação e conclusão de atividade;
- Diário operacional;
- geração idempotente de recorrência;
- chamado público e roteamento;
- envio de Rateio e consulta no Adm-Rateio;
- vínculo do resultado da ferramenta ao histórico da atividade.

## Aceite funcional recomendado

1. criar um usuário para cada perfil e para cada equipe;
2. confirmar que a página inicial mostra somente o escopo esperado;
3. testar cada módulo comum em modo avião após um primeiro login online;
4. restaurar a rede e confirmar a sincronização sem duplicar eventos;
5. executar uma Ronda como Vigilante e tentar acessar a mesma URL como Manutenção;
6. criar atividades pontual e recorrente e conferir ambas no Diário;
7. enviar chamados de Portaria, Limpeza, Manutenção e Área externa;
8. conferir filtros globais da Zeladoria;
9. enviar Leiturista e fechar um ciclo de água e gás no Adm-Rateio;
10. enviar Tags, Mudanças e Ressarcimentos com documentos e exportar CSV;
11. validar relatórios administrativos por período;
12. testar telas em 390 px, tablet e desktop.

## Regras de negócio que exigem homologação

- valores e exceções de Tags, Mudanças e Ressarcimentos;
- fórmulas finais de consumo comum, conversão de gás e distribuição por unidade;
- calendário de recorrências em feriados e exceções operacionais;
- política de retenção de fotos e relatórios;
- quais supervisores podem alterar regras do Rateio.

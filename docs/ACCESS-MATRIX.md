# Matriz inicial de acesso

## Perfis

| Ação | Administrador | Supervisor | Operacional |
|---|---:|---:|---:|
| Consultar atividades do escopo | Sim | Sim | Sim |
| Executar atividades | Sim | Sim | Sim |
| Criar/atribuir/cancelar atividades | Sim | Sim | Não |
| Consultar recorrências | Sim | Sim | Manutenção |
| Cadastrar recorrências | Sim | Conforme permissão | Manutenção da própria equipe |
| Consultar chamados do escopo | Sim | Sim | Sim |
| Administrar usuários e acessos | Sim | Não | Não |
| Consultar configurações | Sim | Sim | Não |
| Alterar módulos e roteamento | Sim | Não | Não |
| Consultar relatórios administrativos | Sim | Sim | Não |
| Administrar regras do rateio | Sim | Somente se liberado | Não |

## Equipes e módulos iniciais

Todas as equipes recebem Atividades, Diário de Serviços, Checagem, Scanner/Documentos, Orçamentos, Reembolso e Fiscalização.

| Equipe | Módulos adicionais | Escopo de atividades |
|---|---|---|
| Portaria | Chamados | Portaria |
| Manutenção | Chamados, Recorrências, Leiturista, Rateio | Manutenção |
| Limpeza | — | Limpeza |
| Terceiros | — | Terceiros |
| Zeladoria | Chamados, Leiturista, Rateio | Todas as equipes, com filtros |
| Vigilantes | Ronda | Vigilantes |
| Serviços Gerais | — | Serviços Gerais |

O administrador pode alterar a liberação de módulos em Configurações. A liberação visual não substitui a validação de API.

## Roteamento inicial dos chamados

- Portaria → Portaria;
- Limpeza → Limpeza;
- Manutenção, Hidráulica, Elétrica e Estrutural → Manutenção;
- Área externa → Zeladoria;
- Serviços gerais → Serviços Gerais;
- Outro → Zeladoria, sem criação automática por padrão.

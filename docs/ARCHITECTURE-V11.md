# Arquitetura funcional V11

## Princípio central

`Atividade` é a unidade de trabalho. Chamados e recorrências criam atividades; ferramentas de campo produzem resultados vinculados a elas. O histórico da atividade registra criação, início, sincronização de ferramenta, evidências e conclusão.

```text
Chamado público ─┐
Recorrência ─────┼──> Atividade ──> Execução ──> Histórico / evidências
Cadastro manual ─┘                     │
                                      └──> Ronda, Leiturista, Diário,
                                           Fiscalização ou Rateio
```

## Identidade e acesso

- `roles` controla ações permitidas;
- `teams` controla escopo de atividades e módulos visíveis;
- `role_permissions` fornece o padrão do perfil;
- `user_permission_overrides` suporta exceções futuras;
- `team_modules` libera ferramentas por equipe;
- `user_module_overrides` suporta exceções individuais futuras;
- `sessions` armazena somente o hash do token de sessão.

Perfis e equipes não são duplicados: são duas dimensões complementares do mesmo acesso. Exemplo: um Operacional da equipe Vigilantes recebe atividades de Vigilantes e o módulo Ronda; um Supervisor da Manutenção gerencia atividades da Manutenção, mas não administra usuários.

## Operação offline

- shells e ativos estáticos são armazenados pelo Service Worker;
- o último usuário validado e sua matriz de módulos ficam disponíveis no aparelho;
- atividades consultadas são mantidas no IndexedDB;
- início, conclusão e evidências entram em uma fila idempotente;
- ferramentas V10 mantêm seus rascunhos e fotos localmente;
- o Rateio marca o envio como pendente e tenta novamente quando a rede volta;
- APIs administrativas nunca são armazenadas no cache do Service Worker.

O primeiro login de um aparelho exige rede. A fila não substitui a autenticação: ela apenas preserva trabalho já autorizado naquele aparelho.

## D1 e R2

D1 armazena identidade, regras de acesso, atividades, eventos, chamados, recorrências, metadados dos relatórios e cálculos. R2 armazena fotos, PDFs e documentos. O banco guarda somente as chaves dos objetos.

Migrations V11:

- `0008`: estabiliza sincronizações V10 sem impor unicidade sobre dados históricos;
- `0009`: identidade, perfis, equipes, módulos e roteamento;
- `0010`: atividades, eventos, evidências, recorrências e chamados;
- `0011`: vínculos entre atividades e ferramentas e recebimentos do Rateio.

## Decisões de segurança

- senhas usam PBKDF2-SHA256 com salt individual;
- senha mínima de 8 caracteres, sem regra de composição;
- cookie de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS;
- mutações verificam origem quando o navegador a informa;
- toda API protegida valida sessão, permissão e/ou módulo;
- downloads administrativos exigem permissão de relatórios;
- a interface oculta módulos não liberados, mas a proteção real está no Worker.

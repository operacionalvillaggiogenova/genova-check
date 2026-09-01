# Relatório de implementação — blexo-suite V11

Data da entrega: 1º de setembro de 2026

## Resultado

Foi criada uma evolução funcional da base estabilizada V10, mantendo as ferramentas existentes e reconstruindo o núcleo que havia perdido estrutura. Nenhuma alteração foi enviada à Cloudflare, ao D1 remoto, ao R2 remoto ou ao repositório de produção.

O nome apresentado pelo sistema é **blexo-suite**. A versão **11.0.0** aparece somente no detalhe de Sistema dentro de Configurações.

## Núcleo implementado

- autenticação própria e sessões seguras;
- senha simples, com mínimo de 8 caracteres e sem exigência de mistura de caracteres;
- perfis Administrador, Supervisor e Operacional;
- sete equipes operacionais;
- permissões por perfil e liberação de módulos por equipe;
- Ronda liberada inicialmente apenas para Vigilantes;
- Zeladoria com visão global das atividades;
- Configurações completas para Administrador e consulta para Supervisor;
- página inicial operacional com atividades diárias, atrasadas e pendentes;
- atividades pontuais com início, conclusão, observação e evidência;
- recorrências independentes, sem sobrescrever o histórico;
- chamados públicos roteados por categoria e convertidos em atividades;
- Diário de Serviços com histórico das atividades do usuário;
- fila offline idempotente para atividades e evidências;
- vínculo da atividade com Ronda, Leiturista, Fiscalização, Diário e Rateio;
- Rateio de campo com envio de tabelas e documentos para o Adm-Rateio;
- Adm-Rateio com recebimentos, consulta, status e exportação CSV;
- proteção real das APIs por sessão, permissão, equipe e módulo;
- migrations aditivas que não apagam dados históricos V10.

## Decisões estruturais

Perfil e equipe foram modelados como dimensões complementares: o perfil define ações e a equipe define escopo/módulos. Isso evita criar combinações rígidas como “Operacional-Manutenção” ou “Supervisor-Portaria” e permite administrar a aplicação em Configurações.

Atividade passou a ser a unidade central. Chamados e recorrências geram atividades; ferramentas de campo produzem resultados vinculados à atividade. Assim, o Diário pode reunir atividades pontuais, recorrentes e relatórios de campo no mesmo histórico.

O Worker técnico `genova-check` e o bucket `blexo-check-evidence` foram preservados para não criar recursos Cloudflare novos por acidente. Isso não altera o nome visível `blexo-suite`.

## Validações executadas

- 4 testes unitários aprovados;
- smoke test integral aprovado;
- bloqueio de Ronda para Operacional da Manutenção aprovado;
- acesso de consulta às Configurações pelo Supervisor aprovado;
- fluxo Atividade → Rateio → Adm-Rateio → histórico aprovado;
- aplicação das 11 migrations em banco local vazio aprovada;
- build do Worker em `--dry-run` aprovado: 72 arquivos estáticos, sem publicação;
- inspeção visual móvel em 390 × 844 px nas telas inicial, Diário, Rateio e Adm-Rateio;
- verificação sintática de todos os arquivos JavaScript aprovada.

## Itens que dependem de homologação de negócio

- fórmulas e exceções finais de água, gás, Tags, Mudanças e Ressarcimentos;
- política de feriados e exceções das recorrências;
- retenção de fotos e documentos;
- quais supervisores poderão alterar regras do Rateio;
- centralização futura dos relatórios de Checagem, Scanner, Orçamentos e Reembolso.

## Implantação

Esta entrega está pronta para homologação local, mas **não foi publicada**. Antes de produção:

1. exportar o D1 atual;
2. validar os bindings do ambiente;
3. aplicar as migrations remotas explicitamente;
4. publicar o Worker;
5. executar o checklist pós-publicação incluído em `docs/DEPLOYMENT-CHECKLIST.md`.

Os comandos de migração e deploy foram separados para impedir que um build automático altere o banco sem revisão.

# blexo-suite 11.0.0

Aplicação operacional exclusiva para administração de equipes, atividades, recorrências, chamados e ferramentas de campo. A versão 11 reorganiza a base estabilizada V10 sem habilitar multitenancy e preserva os recursos Cloudflare já existentes.

## O que esta versão entrega

- autenticação própria com sessão segura e senha simples de no mínimo 8 caracteres;
- perfis `Administrador`, `Supervisor` e `Operacional`;
- equipes Portaria, Manutenção, Limpeza, Terceiros, Zeladoria, Vigilantes e Serviços Gerais;
- liberação de módulos por equipe, configurável pelo administrador;
- início operacional com atividades do dia, atrasadas e pendentes;
- atividades pontuais, recorrências independentes e chamados públicos roteados por categoria;
- Diário de Serviços com histórico das atividades do usuário e relatório manual com evidências;
- operação offline das atividades e ferramentas locais, com fila de sincronização;
- vínculo entre atividade e resultados de Ronda, Leiturista, Fiscalização, Diário e Rateio;
- recebimento de tabelas e documentos do Rateio no Adm-Rateio, com exportação CSV;
- relatórios administrativos existentes de Ronda, Fiscalização, Diário e Rateio;
- nome do produto `blexo-suite`; versão visível apenas nos detalhes de Configurações.

## Regras de acesso

O perfil define o que o usuário pode fazer. A equipe define quais atividades e ferramentas ele recebe.

- Administrador: administração completa e visão de todas as equipes.
- Supervisor: gestão operacional de sua equipe e consulta das configurações; alterações sensíveis permanecem com o administrador.
- Operacional: executa as próprias atividades ou as atividades disponíveis para sua equipe.
- Zeladoria: escopo de atividades de todas as equipes, com filtros, além das próprias atividades.
- Manutenção: pode cadastrar recorrências da própria equipe.
- Ronda: liberada por padrão somente para Vigilantes.

A matriz detalhada está em [docs/ACCESS-MATRIX.md](docs/ACCESS-MATRIX.md).

## Desenvolvimento local

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run migrate:local
npm run dev
```

Abra `http://127.0.0.1:8787`. No primeiro banco vazio, a aplicação direciona para a criação do administrador inicial.

## Verificação

Com o servidor local em execução:

```powershell
npm test
.\tests\smoke-local.ps1
npx wrangler deploy --dry-run
```

O smoke test cobre autenticação, sete equipes, usuário, atividade, Diário, recorrência, chamado público, envio do Rateio, Adm-Rateio e vínculo do relatório à atividade.

## Publicação

Esta entrega não executa migração nem deploy remoto. Os comandos foram separados deliberadamente:

```bash
npm run migrate:remote
npm run deploy
```

Antes de usá-los, faça backup/exportação do D1, confira os bindings e siga [docs/DEPLOYMENT-CHECKLIST.md](docs/DEPLOYMENT-CHECKLIST.md). Não configure um build automático que publique código dependente de migrations ainda não aplicadas.

## Estrutura

- `src/index.js`: roteamento do Worker e compatibilidade com APIs V10;
- `src/*-api.js`: identidade, atividades, recorrências, chamados e Rateio;
- `src/migrations`: evolução cumulativa do D1, sem apagar dados históricos;
- `public`: PWA, páginas operacionais e ferramentas de campo;
- `tests`: testes unitários e smoke test local;
- `docs`: arquitetura, acessos, implantação e roteiro de validação.

## Limites conscientes desta etapa

- multitenancy permanece fora do escopo;
- fórmulas específicas adicionais do rateio só devem ser implementadas após validação formal das regras de negócio;
- Checagem, Scanner, Orçamentos e Reembolso continuam com seus geradores locais já existentes; a centralização desses relatórios pode entrar em uma etapa posterior sem alterar o núcleo de atividades;
- nenhuma credencial de produção deve ser incluída no repositório.

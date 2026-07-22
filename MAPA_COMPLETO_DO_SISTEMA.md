# Mapa completo do sistema Vetor

## Metadados e método da análise

- Data da reanálise: **2026-07-15** (America/Sao_Paulo).
- Repositório: `C:\Apps\Vetor - Gerencia`; aplicação: `gestao-obras-vetor/`.
- Branch: `main`.
- Commit: `e3d9cc289c0121bc4a69c8d2eb7b3bff1879f65d` — `feat: adicionar cockpit da obra`, de 2026-07-15 21:22:19 -03:00.
- Fonte de verdade: código, configurações, manifests, migrations, testes e bancos SQLite locais abertos em modo somente leitura. O conteúdo anterior deste documento não foi presumido correto.
- Limitações: não houve acesso ao host/containers de produção nesta reanálise; não foram validados secrets, mounts efetivos, backups externos, restauração real nem estado implantado. O worktree já continha alterações de código e logs antes da tarefa, inclusive em `backend/server.js`, `backend/middleware/rbac.js`, Navbar, bootstrap/CSS e telas RNC; elas foram consideradas como estado atual e não foram alteradas.
- Restrições respeitadas: nenhum código, banco, migration, serviço ou deploy foi alterado; nenhum serviço foi reiniciado.

## 1. Visão geral e arquitetura

O Vetor é uma plataforma multiobra e multitenant para planejamento, execução, qualidade, suprimentos, ativos, comunicação e administração. Há três clientes/camadas:

- Web: React 18 + Vite 5, React Router, Axios, Recharts, Quill e Socket.IO Client.
- API: Node.js, Express 4, JWT, RBAC próprio, Socket.IO, SQLite3, Multer, ExcelJS/xlsx, PDFKit/Puppeteer e integrações SMTP/IMAP.
- Mobile: Expo 51/React Native 0.74, navegação nativa, SecureStore/AsyncStorage, NetInfo, cache e fila offline.

O banco principal mantém identidade/tenants e também dados legados. A operação usa arquivos `database/tenants/tenant_<id>.db`, selecionados por `AsyncLocalStorage` após a autenticação. Novos tenants são provisionados a partir de schema limpo, recebem migrations centralizadas e só são ativados após verificações de integridade.

Em produção, Nginx serve a SPA e encaminha `/api`; Compose monta `database` e `uploads` de um `APP_DATA_DIR` obrigatório. O deploy faz validação do diretório, backup pré-deploy, migrations controladas, integrity/FK check, subida e health check.

## 2. Estrutura relevante

- `.github/workflows/deploy.yml`: deploy da `main` por SSH.
- `backend/server.js`: montagem das APIs, Socket.IO, health e guard de migrations.
- `backend/routes/`: 19 módulos de rota; 209 definições de endpoint detectadas nos módulos montados e 12 adicionais no financeiro desativado.
- `backend/services/`: Cockpit, provisionamento de tenant, Gantt, financeiro, email, mensageria e PDFs/correções de RDO/RNC.
- `backend/scripts/migrations/`: 10 migrations versionadas atuais (`000001` a `000010`).
- `backend/tests/`: `tenantProvisioning.test.js` e `cockpitService.test.js`.
- `frontend/src/pages/`: rotas/telas web; `ProjetoDetalhes.jsx` agora é o Cockpit da Obra.
- `frontend/src/components/cockpit/`: primitives, planejamento, operação, transforms e estilos do Cockpit.
- `mobile/src/`: autenticação, projetos, EAP/planejamento, RDO, RNC, compras, almoxarifado, mensagens e notificações.
- `docker-compose.yml`, `backend/entrypoint.sh`, `nginx/default.conf`: runtime de produção.

## 3. Módulos e estado funcional

| Domínio | Implementação atual | Estado |
|---|---|---|
| Autenticação e conta | Login, registro/trial, convite, primeiro acesso, recuperação de senha, cancelamento e renovação | Ativo |
| Tenants | Banco por tenant, provisionamento seguro, contexto por requisição e validação no login/startup | Ativo, com riscos legados de dados descritos adiante |
| Usuários | CRUD, perfis/setores, vínculos, soft delete, exclusão permanente, presença, avatar e assinatura | Ativo |
| Projetos | Lista por escopo, detalhe, criação/edição, arquivar/desarquivar e copiar EAP; exclusão retorna 405 | Ativo |
| Cockpit da Obra | Consolidação de planejamento, operação, qualidade, suprimentos, ativos, fotos, agenda e rastreabilidade | Novo e ativo |
| EAP/planejamento | CRUD, importação Excel, histórico/eventos, recalcular, análise de cronograma, dependências e Gantt | Ativo |
| RDO | CRUD, status/aprovação, PDF/Excel, logs, mão de obra, clima, materiais, ocorrências, equipamentos, fotos e anexos | Ativo |
| RNC | CRUD, correção, envio/aprovação, assinatura, anexos, timeline e PDF | Ativo |
| Suprimentos | Pedidos legados e requisições multi-itens, kanban, cotações, aprovações, compras e fornecedores | Ativo; dois fluxos coexistem |
| Almoxarifado/ativos | Ferramentas, alocações, retirada, devolução, transferência, manutenção, perdas, RDO e relatórios | Ativo |
| Mensagens | Conversas, recibos, anexos, exclusão, Socket.IO e agenda de reuniões | Ativo |
| Notificações | Lista, leitura individual/global e eventos de negócio | Ativo |
| Email | SMTP/IMAP, envio, recebidos, flags, templates, assinatura e histórico | Ativo |
| Financeiro | Código, tabelas, serviço e tela existem, mas mount da API e rotas web estão comentados | Desativado |
| Relatório Semanal | Nenhuma rota, tela, componente, serviço ou migration atual no repositório | Removido da aplicação; há resíduo de schema local |

## 4. Cockpit da Obra

### Entrada, componentes e comportamento

`/projeto/:projetoId` renderiza `ProjetoDetalhes.jsx`, hoje o Cockpit. O carregamento principal chama `GET /api/dashboard/projeto/:projetoId/cockpit` e, conforme as permissões retornadas, busca em paralelo Curva S, Gantt, kanban de requisições, dashboard do almoxarifado e reuniões do dia. A galeria de RDO é carregada sob demanda na aba Operação.

Componentes documentados:

- `CockpitPrimitives.jsx`: skeleton, erro com retry, empty state, card, cabeçalho, tabs, status de domínios, KPIs e métricas.
- `CockpitPlanning.jsx`: Curva S, status das atividades, atividades críticas e próximas atividades.
- `CockpitOperations.jsx`: pontos de atenção, execução recente, mão de obra/HH, equipamentos, qualidade, suprimentos, ativos, álbum/lightbox e rastreabilidade.
- `cockpitTransforms.js`: prazo, normalização temporal, visão de atividades, suprimentos, alertas e status por domínio.
- `cockpitService.js`: consolidação read-only de RDOs, efetivo, HH, equipamentos, RNCs e metadados EAP; cada fonte usa `safeBlock`, de modo que falha parcial não derruba o restante.

Abas visíveis por permissão: Visão Geral; Planejamento (`eap`); Operação (`rdo`); Qualidade e Suprimentos (`quality` ou `procurement`); Recursos (`rdo` ou `assets`). O painel mostra prazo, atualização manual, agenda do dia, alertas/retry por fonte e rastreabilidade para perfis gestores/ADM.

### KPIs e fontes

- Progresso físico e SPI: Curva S.
- Atividades críticas e próximas: Gantt/EAP.
- RNCs abertas/críticas: RNC.
- Requisições pendentes/urgentes: kanban de suprimentos.
- Efetivo mais recente, média de 7 dias e HH: RDO/mão de obra.
- Equipamentos e álbum: equipamentos/fotos de RDO.
- Ativos indisponíveis: manutenção + atrasados do almoxarifado.
- Pontos de atenção: combinação derivada das fontes acima.

### Endpoints consumidos pelo Cockpit

- `GET /api/dashboard/projeto/:projetoId/cockpit` — payload consolidado, tenant + acesso ao projeto + permissões por bloco.
- `GET /api/dashboard/projeto/:projetoId/curva-s`.
- `GET /api/eap/projeto/:projetoId/gantt-data`.
- `GET /api/requisicoes/kanban/projeto/:projetoId`.
- `GET /api/almoxarifado/dashboard/projeto/:projetoId`.
- `GET /api/dashboard/projeto/:projetoId/galeria-rdos` — lazy load.
- `GET /api/mensagens/reunioes/hoje?projeto_id=...`.
- Navegação contextual para EAP, Gantt, Curva S, RDO/RDO específico, RNC, compras, almoxarifado e mensagens.

## 5. Rotas web

Públicas: `/`, `/login`, `/acesso`, `/register/:token`, `/redefinir-senha/:token`; `/criar-conta` redireciona para `/acesso`.

Autenticadas globais: `/primeiro-acesso`, `/perfil`, `/projetos`, `/usuarios`, `/compras`, `/compras/kanban`, `/compras/finalizadas`, `/compras/negadas`, `/compras/status/:statusSlug`, `/compras/:id`, `/fornecedores`, `/email-dashboard`, `/mensagens` e seletores `/rdos`, `/eap`, `/planejamento`, `/curva-s`, `/gantt`, `/rnc`, `/ativos`. `/dashboard` redireciona para `/projetos`.

No projeto: Cockpit; EAP/lista/form; planejamento; Curva S; Gantt; pedidos legados; compras/lista/detalhe/kanban/status/finalizadas/negadas/fornecedores; RDOs/lista/novo/detalhe/editar; usuários; email; mensagens; RNC/lista/novo/detalhe; almoxarifado/dashboard/ferramentas/retirada/devolução/manutenção/perdas/relatórios.

Financeiro permanece comentado. Não há rota de Relatório Semanal.

## 6. API por módulo

Todos os caminhos abaixo recebem o prefixo indicado em `server.js`. Rotas com `router.use(auth)` também estão autenticadas mesmo quando `auth` não aparece na declaração individual.

- `/api/health`: `GET` de saúde/versão.
- `/api/auth`: `POST login`, `register`, `convites`, `register/:token`, `esqueci-senha`, `redefinir-senha`, `cancelar-conta`, `renovar-trial`; `GET register/:token`.
- `/api/usuarios`: lista/detalhe/criar/editar; deletados; novo login; mão de obra direta CRUD/baixa; bulk update; flags gestor/ADM; soft/permanent delete; senha, avatar, assinatura, info, presença e primeiro acesso.
- `/api/projetos`: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` (405), `PATCH arquivar/desarquivar`, `POST copiar-eap`.
- `/api/dashboard`: Cockpit, avanço, stats RDO, galeria RDO e Curva S por projeto.
- `/api/eap`: unidades/modelo Excel; preview/confirmar importação; lista por projeto; copiar; CRUD; recalcular/histórico; preview/recalcular tudo; análise; sugerir/confirmar/listar dependências; aplicar cronograma; Gantt.
- `/api/rdos`: lista por projeto, detalhe, criar/editar, status, excluir, PDF, Excel, apagar todos por projeto e logs.
- `/api/rdo`: execução/colaboradores por projeto; mão de obra, clima, comentário, material, ocorrência, assinatura, equipamentos e fotos (upload/download/editar/excluir/ordem).
- `/api/anexos`: upload/lista por RDO ou RNC, download autenticado e delete.
- `/api/uploads/*`: entrega autenticada de uploads.
- `/api/rnc`: PDF, lista por projeto, CRUD, status, enviar para aprovação e corrigir.
- `/api/pedidos-compra`: pedido legado CRUD parcial, aprovação inicial, cotações, seleção, comprado, reprovação e consultas.
- `/api/requisicoes`: criar/listar/detalhar/editar/concluir; listas finalizadas/encerradas/negadas; kanban global/projeto; badges; análise/correção/aprovação/cotação/seleção/compra/edição/quantidade/cancelamento/devolução por item; ações em lote.
- `/api/fornecedores`: CRUD (autenticado por `router.use`).
- `/api/almoxarifado`: perfil/colaboradores; ferramentas; transferências; alocações; retiradas/devoluções; manutenção; perdas; dashboard; relatórios; vínculo de ferramenta ao RDO.
- `/api/notificacoes`: listar, marcar uma ou todas como lidas.
- `/api/mensagens`: não lidas; conversas/mensagens/recibos/anexos/exclusão; reuniões listar/hoje/criar/editar/cancelar.
- `/api/email`: configuração/teste; envio/upload inline; assinatura; histórico/favorito/delete; sync IMAP; recebidos/flags/read/delete; templates CRUD.
- `/api/mao_obra`: catálogo CRUD autenticado.
- `/api/financeiro`: 12 endpoints de dashboard, saldo, receitas, despesas, estornos, fluxo e consolidado existem no arquivo, mas **não são montados**.

## 7. Perfis e permissões

Perfis canônicos: ADM, Gestor Geral, Gestor da Obra, Gestor da Qualidade, Almoxarife, Financeiro e Fiscal; aliases legados de Gestor Local/Qualidade são normalizados.

- Usuários: Gestor Geral e ADM.
- Projeto: Gestor Geral, Gestor da Obra, Gestor da Qualidade, ADM, Almoxarife e Fiscal.
- RDO: visão para gestores de obra/geral/qualidade e Fiscal; aprovação para gestores geral/obra; reprovação também para Fiscal.
- RNC/Curva S: gestores geral/obra/qualidade e Fiscal.
- EAP: gestores geral/obra/qualidade.
- Compras/requisições: gestores geral/obra, ADM, Financeiro e Almoxarife; ações de análise, cotação, seleção e compra são mais restritas.
- Ativos: visão para Gestor Geral/Obra, ADM e Almoxarife; gestão para Gestor Geral e Almoxarife.
- Acesso global a obras no middleware: Gestor Geral, ADM e Financeiro; demais dependem de `projeto_usuarios`.

O frontend oculta/redireciona telas por perfil, mas a API é a barreira obrigatória. O Cockpit aplica `assertProjectAccess` e só consulta blocos permitidos. Risco ainda presente: `inferirPerfil()` e `mapPerfilParaLegado()` usam ADM como fallback para perfil inválido/ausente.

## 8. Banco, migrations e multitenancy

### Schema

Foram observadas 60 tabelas nos bancos locais. Grupos principais:

- Identidade: `usuarios`, `tenants`, `usuario_tenants`, `projeto_usuarios`, `mao_obra_direta`.
- Obra/EAP: `projetos`, `atividades_eap`, `atividades_dependencias`, `historico_atividades`, `atividade_eap_eventos`, `rdo_alertas_atividade`.
- RDO: `rdos`, `rdo_atividades`, `rdo_mao_obra`, `rdo_clima`, `rdo_materiais`, `rdo_equipamentos`, `rdo_fotos`, `rdo_comentarios`, `rdo_ocorrencias`, `rdo_assinaturas`, `rdo_logs`, `anexos`.
- Qualidade: `rnc` e anexos relacionados.
- Suprimentos: `pedidos_compra`, `cotacoes`, `pedidos_compra_historico`, `fornecedores`, `requisicoes`, itens/cotações/histórico.
- Ativos: ferramentas, alocações, manutenções, perdas, movimentações e `rdo_ferramentas`.
- Comunicação: notificações; conversas, itens, recibos, anexos, reuniões e participantes; configuração/templates/histórico/recebidos de email.
- Financeiro: configuração, receitas, despesas e estornos, embora o módulo esteja desativado.
- Controle: `schema_migrations`, auditoria.
- Resíduo removido: `relatorios_semanais`, `relatorio_semanal_rdos`, `relatorio_semanal_fotos` e índices continuam nos DBs locais.

### Migrations e startup

O runner central registra aplicações em `schema_migrations`, aplica a cada target (principal e tenants), suporta status/dry-run e exige `MIGRATIONS_ALLOW_PRODUCTION=true` para escrita em produção. O repositório contém 10 migrations, de schema de usuários até assinatura/aprovação RNC. Os DBs locais registram também `000011_relatorios_semanais`, cujo arquivo foi removido junto com o módulo; não há migration de downgrade e nenhum schema foi alterado nesta auditoria.

Em produção, `database.js` exige diretórios e DB principal existentes e não cria/copia/recria tenant DB. `ensureTenantDatabase()` bloqueia arquivo ausente ou metadados divergentes. `validateStartupDatabase.js` abre read-only, exige tabelas e metadados mínimos e avisa sobre tenant ativo sem arquivo. `server.js` executa `runMigrations.js --status` antes de ouvir e aborta com pendência. Observação: `entrypoint.sh` ainda executa o runner com permissão de produção antes da validação; no pipeline normal isso ocorre depois do backup e do passo explícito de migrations, mas a imagem iniciada fora do workflow ainda pode aplicar migration no entrypoint.

### Estado local somente leitura em 2026-07-15

| DB | Tabelas | Projetos/RDOs/EAP/RNC/anexos | Migrations | integrity | FK violations |
|---|---:|---|---:|---|---:|
| principal | 60 | 1 / 2 / 8 / 2 / 3 | 11 | ok | 28 |
| tenant_1 | 60 | 3 / 6 / 76 / 3 / 13 | 11 | ok | 253 |
| tenant_3 | 60 | 3 / 7 / 268 / 1 / 10 | 11 | ok | 0 |
| tenant_4 | 60 | 1 / 0 / 0 / 0 / 0 | 11 | ok | 0 |

`UFV MESQUITA 1`, antes sem vínculo, está ativo em `tenant_1.db` e agora tem 1 vínculo. As violações legadas concentram-se em FKs para `rdos_old`, vínculos de usuários órfãos no tenant 1 e alguns registros de almoxarifado/fotos; portanto o antigo risco de FK **não** está resolvido globalmente.

## 9. Uploads e segurança

Uploads públicos diretos foram removidos de `server.js`; arquivos são servidos por `/api/uploads/*` com autenticação. Novos anexos/fotos usam diretórios `tenant_<id>`. RDO/RNC PDF embute imagens quando necessário. Permanecem compatibilidade com arquivos históricos planos e token por query para alguns recursos, o que pode expor token em histórico/logs. CORS do Express segue aberto. Não há antivírus/varredura de conteúdo. Limites variam por rota e Nginx limita body a 25 MB.

## 10. Deploy, volumes, backup e restauração

- Compose exige `APP_DATA_DIR`; não há mais fallback silencioso. Caminho oficial no workflow: `/home/ubuntu/app_data/gestao-obras-vetor`.
- Mounts: `$APP_DATA_DIR/database:/app/database` e `$APP_DATA_DIR/uploads:/app/uploads`.
- `validate_data_dir.sh` aceita apenas o caminho oficial e exige diretórios legíveis/escrevíveis e DB principal não vazio.
- Workflow aborta em branch errada/worktree sujo, valida JWT, Compose e DB; constrói imagens; para apenas backend; cria backup pré-deploy de **todo** `database` e `uploads`; valida/aplica migrations; executa integrity/FK check; sobe e testa health.
- `backupDatabase.js` copia recursivamente bancos (incluindo tenants) e uploads e grava manifesto. `server-setup.sh` aponta o backup diário para o caminho oficial, mas sua rotina simples copia apenas `gestao_obras.db`; deve ser alinhada ao backup completo.
- Não existe procedimento automatizado de restore nem teste de restauração no repositório. Rollback de código não equivale a rollback de schema/dados.
- Estado real de produção, execução do cron e recuperabilidade dos backups não foram validados nesta tarefa.

## 11. Relatório Semanal: remoção confirmada

A remoção está confirmada no código atual: não há página, componente, serviço, rota frontend, endpoint backend, item de Navbar, arquivo de migration `000011` nem referência funcional ao módulo. As ocorrências de “semanal” restantes são apenas granularidade de gráfico financeiro desativado e documentação antiga, não o módulo Relatório Semanal.

A remoção não apagou dados/schema: todos os quatro DBs locais ainda registram `000011_relatorios_semanais` e contêm as três tabelas e índices. Isso é resíduo histórico, não funcionalidade ativa. Removê-lo exigiria migration explícita e ficou fora desta tarefa.

## 12. Testes, build e lint

Executado em 2026-07-15:

- `frontend npm run build`: **sucesso**, 2.334 módulos, com avisos de chunk JS de 1.531,50 kB e import estático/dinâmico misto de `api.js`.
- `backend npm run test:tenant`: **sucesso**; cria DBs apenas em diretório temporário, valida isolamento, integridade, migrations e bloqueio de sobrescrita.
- `backend npm run test:cockpit`: **sucesso**, 14 cenários de datas, RDO, efetivo/HH, equipamentos, qualidade, permissões e degradação parcial.
- Lint: **não executado**, porque nenhum dos três `package.json` define script de lint ou configuração de linter.
- Mobile: não há script local de build/test/lint; os builds definidos dependem de Expo/EAS e não foram executados.

Cobertura ainda ausente: endpoints/autorizações completos; RDO/EAP/RNC end-to-end; suprimentos; ativos; email/mensagens/Socket.IO multitenant; uploads; migrations em bancos legados; deploy e restore.

## 13. Riscos revisados

### Resolvidos

- Fallback silencioso de `APP_DATA_DIR` no Compose.
- Criação do DB principal/diretórios em startup de produção.
- Cópia, exclusão ou recriação automática de tenant DB por `ensureTenantDatabase()`.
- Tenant ativado antes de DB válido no registro público.
- Cancelamento de conta apagando fisicamente tenant DB.
- `/uploads` público e novos uploads sem pasta de tenant.
- Migrations dispersas de startup no `server.js`; schema atual centralizado em migrations versionadas.
- Exclusão física de projeto: endpoint agora devolve 405 e orienta arquivamento.
- Projeto `UFV MESQUITA 1` sem `projeto_usuarios` no DB local: há 1 vínculo atual.
- Ausência total de testes: agora existem testes de tenant e Cockpit.

### Parcialmente resolvidos ou ainda presentes

- **Ainda presente:** FKs locais para `rdos_old` e 28/253 violações nos DBs principal/tenant 1.
- **Ainda presente:** fallback de perfil inválido para ADM.
- **Ainda presente:** rota de apagar todos os RDOs de uma obra.
- **Ainda presente:** token em query em fluxos compatíveis; CORS aberto; ausência de antivírus.
- **Ainda presente:** financeiro morto/desativado e dois fluxos de compras.
- **Ainda presente:** resíduos do Relatório Semanal no schema.
- **Parcial:** migrations são centralizadas, mas `entrypoint.sh` ainda pode aplicá-las ao iniciar em produção e há código lazy legado em rotas.
- **Parcial:** backup pré-deploy cobre DBs/tenants/uploads; backup diário e restore testado ainda não estão equivalentes.
- **Parcial:** multitenancy tem provisionamento/teste básico, mas módulos em tempo real, email e uploads históricos carecem de teste dedicado.
- **Não validado:** volumes, dados, backups e commit efetivamente implantados em produção.

### Atualizacao de seguranca - 2026-07-22

As correcoes abaixo foram implementadas, testadas localmente e registradas no commit `b840c32` da branch `codex/correcoes-mapa-riscos`:

- Perfil ausente ou invalido deixou de receber fallback para ADM. A autenticacao agora responde `403 INVALID_USER_PROFILE` e nega o acesso.
- O `entrypoint.sh` de producao nao aplica migrations. Ele valida o banco em modo somente leitura e falha se houver migration pendente; a aplicacao de migrations permanece exclusiva da etapa controlada de deploy.
- O script de backup diario passou a chamar `backupDatabase.js`, incluindo banco principal, todos os bancos tenant e uploads, com retencao dos 30 backups mais recentes.

Verificacoes executadas: `npm run test:tenant`, `npm run test:cockpit`, build do frontend e verificacao de sintaxe dos arquivos JavaScript alterados.

Status de producao: nenhuma destas alteracoes foi implantada, nenhum banco foi alterado e nenhum container foi reiniciado. A atualizacao do script de backup tambem exige instalacao ou atualizacao explicita no servidor; ela nao e acionada por deploy.

Itens que continuam pendentes: reparo das FKs legadas, verificacao do banco e dos volumes efetivamente montados em producao, ensaio de restauracao, token em query string, CORS restrito, varredura de uploads e cobertura de testes por modulo/tenant.

## 14. Roadmap atual

1. Corrigir por migration versionada as FKs `rdos_old` e reparar órfãos, sempre com backup e ensaio em cópia.
2. Trocar fallback de perfil por negação segura e ampliar testes de RBAC/escopo por endpoint.
3. Tornar migrations exclusivamente uma etapa de deploy, deixando entrypoint somente validar/iniciar.
4. Unificar backup diário com `backupDatabase.js`, definir retenção/armazenamento externo e executar teste periódico de restauração de principal, tenants e uploads.
5. Criar testes de isolamento para mensagens/Socket.IO, notificações, compras, almoxarifado, email e arquivos históricos.
6. Proteger operações destrutivas de RDO e padronizar autorização/limites de upload.
7. Decidir e remover ou reativar de forma completa o financeiro e o fluxo legado de pedidos.
8. Planejar limpeza dos resíduos do Relatório Semanal somente após política de retenção e backup.
9. Reduzir bundle do frontend com code splitting e criar lint/testes de frontend/mobile.
10. Documentar e ensaiar runbook de deploy, rollback de aplicação e restauração de dados.

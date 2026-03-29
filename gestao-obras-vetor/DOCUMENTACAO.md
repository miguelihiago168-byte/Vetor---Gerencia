# Documentação — Gestão de Obras - Vetor

## Visão Geral

Sistema web de gestão de obras civis. Permite acompanhar projetos, atividades (EAP), diários de obra (RDO), não conformidades (RNC), compras/requisições e almoxarifado.

| Camada    | Tecnologia                        |
|-----------|-----------------------------------|
| Backend   | Node.js + Express + SQLite        |
| Frontend  | React 18 + Vite                   |
| Uploads   | Multer (armazenamento local)      |
| Infra     | Docker Compose (nginx + serviços) |

---

## Perfis de Usuário e Permissões

Definidos em `backend/constants/access.js` e aplicados via middleware RBAC (`backend/middleware/rbac.js`).

| Perfil              | Dashboard Projeto | RDO | RNC | EAP | Curva-S | Compras | Almoxarifado | Usuários |
|---------------------|:-----------------:|:---:|:---:|:---:|:-------:|:-------:|:------------:|:--------:|
| ADM                 | ✓                 | —   | —   | —   | —       | ✓       | ✓            | ✓        |
| Gestor Geral        | ✓                 | ✓   | ✓   | ✓   | ✓       | ✓       | ✓            | ✓        |
| Gestor da Obra      | ✓                 | ✓   | ✓   | ✓   | ✓       | ✓       | ✓            | —        |
| Gestor da Qualidade | ✓                 | ✓   | ✓   | ✓   | ✓       | —       | ✓            | —        |
| Fiscal              | ✓                 | ✓   | ✓   | —   | ✓       | —       | —            | —        |
| **Almoxarife**      | **—**             | —   | —   | —   | —       | ✓       | ✓            | —        |

> **Almoxarife**: ao clicar em um projeto na tela de Projetos, é redirecionado diretamente para `/compras`. O link "Dashboard" não aparece na navbar.

Aliases aceitos: `Gestor Local` → `Gestor da Obra`; `Gestor de Qualidade` → `Gestor da Qualidade`.

---

## Módulos do Sistema

### 1. Projetos (`/projetos`)
- CRUD completo de projetos (nome, empresa responsável/executante, prazo, cidade).
- Vinculação de usuários por projeto.
- Arquivamento/desarquivamento de projetos.
- Card de progresso com avanço percentual calculado a partir da EAP.

### 2. Dashboard do Projeto (`/projeto/:id`)
- Visão geral do projeto: sinaleiros de status (RDO, RNC, Compras, Curva S).
- Gráfico de Curva S (previsto × realizado).
- Últimos RDOs e RNCs registrados.
- Painel de compras com resumo por estágio (cotação, liberado, comprado).
- **Acesso bloqueado para perfil Almoxarife.**

### 3. EAP — Estrutura Analítica do Projeto (`/projeto/:id/eap`)
- Árvore hierárquica de atividades (pai → filhos folhas).
- Cada atividade possui: código EAP, nome/descrição, unidade de medida, quantidade total, peso percentual no projeto.
- Cálculo agregado de avanço para nós pai (baseado nas folhas).
- Rota de criação/edição: `/eap/novo` e `/eap/:atividadeId`.
- Cópia de EAP entre projetos (`POST /api/eap/copiar`).

### 4. RDO — Relatório Diário de Obra (`/projeto/:id/rdos`)
- Formulário (`RDOForm2.jsx`) com seções colapsáveis:
  1. Horário de trabalho (entrada, saída, intervalo)
  2. Condições climáticas por período (Manhã / Tarde / Noite)
  3. Mão de obra (colaboradores, tipo, horas)
  4. Equipamentos
  5. **Atividades executadas** — só exibe atividades com progresso < 100%
  6. Fotos
  7. Materiais utilizados
  8. Ocorrências
  9. Comentários
  10. Anexos
- Fluxo de status: `rascunho` → `enviado` → `aprovado` / `reprovado`.
- Aprovação com assinatura digital (canvas).
- Histórico de versões de RDO.
- Execução acumulada: cálculo de quantidade restante por atividade considerando todos os RDOs aprovados anteriores.
- **Atividades 100% concluídas** são ocultadas automaticamente do formulário de inserção.

### 5. RNC — Relatório de Não Conformidade (`/projeto/:id/rnc`)
- Registro de não conformidades com título, descrição, gravidade, fotos e anexos.
- Fluxo: `aberto` → `em_correcao` → `corrigido` → `fechado`.
- Timeline de histórico de status.
- Campos extras: descrição da correção, data de correção.

### 6. Compras / Requisições (`/projeto/:id/compras`)
- Requisições multi-itens com fluxo Kanban por status do item:
  - `solicitado` → `analisado` → `em_cotacao` → `cot_recebida` → `ag_decisao` →  `liberado` → `comprado` → `entregue`
- Cotações por item com seleção de fornecedor vencedor.
- Visualização global de compras (`/compras`) e por projeto.
- Cotações finalizadas (`/compras/finalizadas`) e negadas (`/compras/negadas`).
- Gestão de fornecedores (`/fornecedores`) — apenas ADM e Gestor Geral.
- Pedidos legados mantidos em `/pedidos` para compatibilidade.

### 7. Almoxarifado / Ativos (`/projeto/:id/almoxarifado`)
Submódulos acessíveis via sidebar (`AlmoxarifadoLayout`):

| Rota                        | Página               | Descrição                          |
|-----------------------------|----------------------|------------------------------------|
| `/almoxarifado`             | Dashboard            | Resumo de ferramentas e movimentos |
| `/almoxarifado/ferramentas` | AlmoxFerramentas     | Cadastro e listagem de ferramentas |
| `/almoxarifado/retirada`    | AlmoxRetirada        | Registro de retirada de itens      |
| `/almoxarifado/devolucao`   | AlmoxDevolucao       | Registro de devolução              |
| `/almoxarifado/manutencao`  | AlmoxManutencao      | Manutenções e baixas               |
| `/almoxarifado/perdas`      | AlmoxPerdas          | Registro de perdas                 |
| `/almoxarifado/relatorios`  | AlmoxRelatorios      | Relatórios consolidados            |

### 8. Curva S (`/projeto/:id/curva-s`)
- Gráfico de avanço físico previsto × realizado ao longo do tempo.
- Dados calculados a partir da EAP e dos RDOs aprovados.

### 9. Usuários (`/usuarios`, `/projeto/:id/usuarios`)
- CRUD de usuários com perfil, setor e vínculo a projetos.
- Acesso exclusivo para ADM e Gestor Geral.

### 10. Financeiro
- **Módulo desativado.** Código preservado em `FinanceiroFluxoCaixa.jsx` e rota comentada em `main.jsx`.

---

## Rotas de API (Backend)

| Prefixo              | Arquivo de rota          | Descrição                                  |
|----------------------|--------------------------|--------------------------------------------|
| `/api/auth`          | `routes/auth.js`         | Login, logout, token                       |
| `/api/usuarios`      | `routes/usuarios.js`     | CRUD de usuários                           |
| `/api/projetos`      | `routes/projetos.js`     | CRUD de projetos                           |
| `/api/eap`           | `routes/eap.js`          | EAP: atividades, cópia, métricas           |
| `/api/rdos`          | `routes/rdos.js`         | CRUD de RDOs, status, versões              |
| `/api/rdo-related`   | `routes/rdo_related.js`  | Execução acumulada, colaboradores          |
| `/api/mao-obra`      | `routes/mao_obra.js`     | Colaboradores de mão de obra              |
| `/api/rnc`           | `routes/rnc.js`          | CRUD de RNCs                               |
| `/api/anexos`        | `routes/anexos.js`       | Upload e listagem de anexos               |
| `/api/dashboard`     | `routes/dashboard.js`    | Métricas do dashboard do projeto           |
| `/api/pedidos`       | `routes/pedidos_compra.js` | Pedidos de compra legados                |
| `/api/requisicoes`   | `routes/requisicoes.js`  | Requisições multi-itens (compras)          |
| `/api/fornecedores`  | `routes/fornecedores.js` | Cadastro de fornecedores                   |
| `/api/almoxarifado`  | `routes/almoxarifado.js` | Ferramentas, retiradas, devoluções, etc.   |
| `/api/notificacoes`  | `routes/notificacoes.js` | Notificações do usuário                    |
| `/api/financeiro`    | `routes/financeiro.js`   | *(módulo desativado)*                      |

Consulte `frontend/src/services/api.js` para o mapeamento completo de chamadas do frontend.

---

## Autenticação e Segurança

- JWT com expiração configurável (`auth` middleware em `backend/middleware/auth.js`).
- RBAC granular por permissão definido em `backend/middleware/rbac.js` com matriz `permissionMatrix`.
- Auditoria de alterações registrada na tabela `auditoria` via `backend/middleware/auditoria.js`.
- Frontend protege rotas com `PrivateRoute` — redireciona para `/projetos` se o perfil não tiver acesso.

---

## Regras de Integridade de Dados

- **EAP requer Projeto**: `atividades_eap.projeto_id` é obrigatório (FK com `ON DELETE CASCADE`).
- **RDO requer EAP**: criação bloqueada se o projeto não tiver atividades EAP cadastradas.
- **RDO requer atividades**: mudança de status bloqueada se o RDO não tiver atividades vinculadas.
- **Consistência projeto**: cada `rdo_atividades` deve referenciar uma `atividade_eap` do mesmo `projeto_id` do RDO.
- **Atividade 100%**: atividades com execução acumulada ≥ quantidade total (ou `percentual_executado ≥ 100`) não aparecem no formulário de inserção de RDO.
- Triggers SQLite e validações na API reforçam as regras acima.

---

## Índices de Performance (SQLite)

- `atividades_eap(projeto_id, pai_id)`
- `rdos(projeto_id, data_relatorio)`
- `rdo_atividades(rdo_id, atividade_eap_id)`
- `notificacoes` — índice único para evitar duplicatas

---

## Estrutura de Diretórios

```
gestao-obras-vetor/
├── backend/
│   ├── server.js              # Entry point Express
│   ├── config/database.js     # Conexão SQLite + helpers
│   ├── constants/access.js    # Perfis, setores, mapeamento de permissões
│   ├── middleware/
│   │   ├── auth.js            # Validação JWT
│   │   ├── rbac.js            # Controle de acesso baseado em perfil
│   │   └── auditoria.js       # Log de alterações
│   ├── routes/                # Um arquivo por módulo de API
│   ├── scripts/               # Migrações e utilitários de banco
│   ├── services/              # Lógica de negócio desacoplada
│   └── uploads/               # Arquivos enviados pelos usuários
├── frontend/
│   ├── src/
│   │   ├── main.jsx           # Roteamento global (React Router)
│   │   ├── pages/             # Uma página por módulo
│   │   ├── components/        # Navbar, PrivateRoute, Layouts, Modais
│   │   ├── context/           # AuthContext, NotificationContext, DialogContext, LeaveGuardContext
│   │   ├── services/api.js    # Axios — todos os endpoints do backend
│   │   └── utils/             # Formatadores (moeda, datas, etc.)
│   └── index.html
├── nginx/default.conf         # Proxy reverso (produção)
├── docker-compose.yml
└── start.ps1 / start.bat      # Scripts de inicialização local
```

---

## Execução Local

```bash
# Backend
cd backend
npm install
node server.js        # porta 3001

# Frontend
cd frontend
npm install
npm run dev           # porta 3000 (Vite)
```

Ou via Docker:
```bash
docker-compose up --build
```

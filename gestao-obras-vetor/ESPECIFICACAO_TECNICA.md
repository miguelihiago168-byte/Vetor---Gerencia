# ESPECIFICAÇÃO TÉCNICA COMPLETA
# Sistema: Gestão de Obras - Vetor

---

## 📋 ÍNDICE

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Modelo de Dados](#modelo-de-dados)
4. [Especificação Funcional](#especificação-funcional)
5. [APIs REST](#apis-rest)
6. [Regras de Negócio](#regras-de-negócio)
7. [Fluxos do Sistema](#fluxos-do-sistema)
8. [Segurança e Permissões](#segurança-e-permissões)
9. [Rastreabilidade e Auditoria](#rastreabilidade-e-auditoria)

---

## 1. VISÃO GERAL

### 1.1 Objetivo
Sistema de gestão de obras focado em:
- Estruturação hierárquica de projetos (EAP)
- Registro diário de execução (RDO)
- Controle de avanço físico (previsto vs executado)
- Aprovação e rastreabilidade completa

### 1.2 Tecnologias

**Backend:**
- Node.js 18+
- Express.js 4.18
- SQLite 3 (desenvolvimento)
- JWT para autenticação
- Multer para uploads
- Bcrypt para criptografia

**Frontend:**
- React 18
- Vite 5
- React Router 6
- Axios
- Recharts (gráficos)
- Lucide React (ícones)

### 1.3 Portas
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

---

## 2. ARQUITETURA DO SISTEMA

### 2.1 Estrutura de Diretórios

```
gestao-obras-vetor/
│
├── backend/
│   ├── config/
│   │   └── database.js          # Configuração SQLite
│   ├── middleware/
│   │   ├── auth.js              # Autenticação JWT
│   │   └── auditoria.js         # Registro de ações
│   ├── routes/
│   │   ├── auth.js              # Login
│   │   ├── usuarios.js          # CRUD usuários
│   │   ├── projetos.js          # CRUD projetos
│   │   ├── eap.js               # CRUD atividades EAP
│   │   ├── rdos.js              # CRUD RDOs
│   │   ├── anexos.js            # Upload/Download
│   │   └── dashboard.js         # Estatísticas
│   ├── scripts/
│   │   └── initDatabase.js      # Criação do banco
│   ├── database/
│   │   └── gestao_obras.db      # SQLite (gerado)
│   ├── uploads/                 # Arquivos anexados
│   ├── .env                     # Variáveis de ambiente
│   ├── server.js                # Servidor principal
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Navbar.jsx       # Barra de navegação
    │   │   └── PrivateRoute.jsx # Proteção de rotas
    │   ├── context/
    │   │   └── AuthContext.jsx  # Contexto de autenticação
    │   ├── pages/
    │   │   ├── Login.jsx        # Tela de login
    │   │   └── Dashboard.jsx    # Dashboard principal
    │   ├── services/
    │   │   └── api.js           # Cliente Axios
    │   ├── index.css            # Estilos globais
    │   └── main.jsx             # Entry point
    ├── index.html
    ├── vite.config.js
    └── package.json
```

### 2.2 Fluxo de Dados

```
Cliente (React) 
    ↓ HTTP Request
Frontend Router (React Router)
    ↓ Axios
API REST (Express)
    ↓ Middleware Auth (JWT)
Rotas / Controllers
    ↓ SQL Queries
Banco de Dados (SQLite)
    ↓ Response
Cliente (React)
```

---

## 3. MODELO DE DADOS

### 3.1 Diagrama ER (Entidade-Relacionamento)

```
┌─────────────┐       ┌──────────────┐       ┌─────────────────┐
│  USUARIOS   │──┐    │   PROJETOS   │──┐    │ ATIVIDADES_EAP  │
├─────────────┤  │    ├──────────────┤  │    ├─────────────────┤
│ id (PK)     │  │    │ id (PK)      │  │    │ id (PK)         │
│ login       │  │    │ nome         │  │    │ projeto_id (FK) │
│ senha       │  │    │ emp_resp     │  │    │ codigo_eap      │
│ nome        │  │    │ emp_exec     │  │    │ descricao       │
│ email       │  │    │ prazo        │  │    │ perc_previsto   │
│ is_gestor   │  │    │ cidade       │  │    │ perc_executado  │
│ ativo       │  │    │ criado_por   │  │    │ status          │
└─────────────┘  │    │ (FK)         │  │    │ pai_id (FK)     │
       │         │    └──────────────┘  │    └─────────────────┘
       │         │            │          │             │
       │         │            │          │             │
       │         └────────────┼──────────┘             │
       │                      │                        │
       │         ┌────────────┴────────────┐          │
       │         │  PROJETO_USUARIOS       │          │
       │         ├─────────────────────────┤          │
       │         │ id (PK)                 │          │
       │         │ projeto_id (FK)         │          │
       │         │ usuario_id (FK)         │          │
       │         └─────────────────────────┘          │
       │                                               │
       │         ┌──────────────┐                     │
       └────────>│     RDOS     │<────────────────────┘
                 ├──────────────┤
                 │ id (PK)      │
                 │ projeto_id   │
                 │ data         │
                 │ dia_semana   │
                 │ clima_manha  │
                 │ clima_tarde  │
                 │ mao_obra     │
                 │ equipamentos │
                 │ ocorrencias  │
                 │ status       │
                 │ criado_por   │
                 │ aprovado_por │
                 └──────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
┌────────▼───────┐  ┌──▼────────────┐ ┌▼──────────────┐
│ RDO_ATIVIDADES │  │    ANEXOS     │ │   HISTORICO   │
├────────────────┤  ├───────────────┤ │   ATIVIDADES  │
│ id (PK)        │  │ id (PK)       │ ├───────────────┤
│ rdo_id (FK)    │  │ rdo_id (FK)   │ │ id (PK)       │
│ atividade_id   │  │ tipo          │ │ atividade_id  │
│ perc_executado │  │ nome_arquivo  │ │ rdo_id (FK)   │
│ observacao     │  │ caminho       │ │ perc_anterior │
└────────────────┘  └───────────────┘ │ perc_executado│
                                       │ perc_novo     │
                                       │ data_execucao │
                                       └───────────────┘
```

### 3.2 Tabelas Detalhadas

#### USUARIOS
```sql
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,              -- 6 dígitos (000001)
  senha TEXT NOT NULL,                     -- Hash bcrypt
  nome TEXT NOT NULL,
  email TEXT,
  is_gestor INTEGER DEFAULT 0,             -- 0=não, 1=sim
  ativo INTEGER DEFAULT 1,                 -- 0=inativo, 1=ativo
  criado_por INTEGER,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);
```

**Regras:**
- Login gerado automaticamente (sequencial, 6 dígitos)
- Senha definida pelo gestor (6 dígitos numéricos)
- Senha armazenada com hash bcrypt
- Usuário criado inicialmente não é gestor
- Apenas gestor pode promover outro usuário

#### PROJETOS
```sql
CREATE TABLE projetos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  empresa_responsavel TEXT NOT NULL,
  empresa_executante TEXT NOT NULL,
  prazo_termino DATE NOT NULL,
  cidade TEXT NOT NULL,
  ativo INTEGER DEFAULT 1,
  criado_por INTEGER NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);
```

**Regras:**
- Cada projeto tem sua própria EAP
- Cada projeto tem seus próprios usuários vinculados
- Informações utilizadas como cabeçalho do RDO

#### PROJETO_USUARIOS
```sql
CREATE TABLE projeto_usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE(projeto_id, usuario_id)
);
```

**Regras:**
- Gestores veem todos os projetos
- Usuários comuns veem apenas projetos vinculados

#### ATIVIDADES_EAP
```sql
CREATE TABLE atividades_eap (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL,
  codigo_eap TEXT NOT NULL,                -- Ex: 1.0, 1.1, 2.0
  descricao TEXT NOT NULL,
  percentual_previsto REAL DEFAULT 100.0,
  percentual_executado REAL DEFAULT 0.0,
  status TEXT DEFAULT 'Não iniciada',      -- Não iniciada/Em andamento/Concluída
  pai_id INTEGER,                          -- Hierarquia
  ordem INTEGER DEFAULT 0,
  criado_por INTEGER NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
  FOREIGN KEY (pai_id) REFERENCES atividades_eap(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id),
  UNIQUE(projeto_id, codigo_eap)
);
```

**Status Automático:**
- `percentual_executado = 0` → "Não iniciada"
- `0 < percentual_executado < 100` → "Em andamento"
- `percentual_executado >= 100` → "Concluída"

#### RDOS
```sql
CREATE TABLE rdos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL,
  data_relatorio DATE NOT NULL,
  dia_semana TEXT NOT NULL,
  clima_manha TEXT,
  praticabilidade_manha TEXT,
  clima_tarde TEXT,
  praticabilidade_tarde TEXT,
  mao_obra_direta INTEGER DEFAULT 0,
  mao_obra_indireta INTEGER DEFAULT 0,
  mao_obra_terceiros INTEGER DEFAULT 0,
  equipamentos TEXT,
  ocorrencias TEXT,
  comentarios TEXT,
  intervalo_almoco TEXT,
  status TEXT DEFAULT 'Em preenchimento',  -- Em preenchimento/Em análise/Aprovado/Reprovado
  criado_por INTEGER NOT NULL,
  aprovado_por INTEGER,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  aprovado_em DATETIME,
  FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id),
  FOREIGN KEY (aprovado_por) REFERENCES usuarios(id),
  UNIQUE(projeto_id, data_relatorio)       -- Um RDO por dia
);
```

**Status e Cores:**
- 🟡 `Em preenchimento` - Amarelo
- 🔵 `Em análise` - Azul
- 🟢 `Aprovado` - Verde
- 🔴 `Reprovado` - Vermelho

#### RDO_ATIVIDADES
```sql
CREATE TABLE rdo_atividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rdo_id INTEGER NOT NULL,
  atividade_eap_id INTEGER NOT NULL,
  percentual_executado REAL NOT NULL,
  observacao TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
  FOREIGN KEY (atividade_eap_id) REFERENCES atividades_eap(id) ON DELETE CASCADE
);
```

**Regras:**
- Vincula RDO com atividades executadas no dia
- Percentual executado alimenta histórico da EAP
- Soma acumulada quando RDO aprovado

#### ANEXOS
```sql
CREATE TABLE anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rdo_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,                      -- MIME type
  nome_arquivo TEXT NOT NULL,
  caminho_arquivo TEXT NOT NULL,           -- Path no servidor
  tamanho INTEGER,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
);
```

**Tipos aceitos:**
- Imagens: JPEG, PNG
- Documentos: PDF, DOC, DOCX, XLS, XLSX
- Limite: 10MB por arquivo

#### HISTORICO_ATIVIDADES
```sql
CREATE TABLE historico_atividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atividade_eap_id INTEGER NOT NULL,
  rdo_id INTEGER NOT NULL,
  percentual_anterior REAL NOT NULL,
  percentual_executado REAL NOT NULL,      -- Do dia
  percentual_novo REAL NOT NULL,           -- Acumulado
  usuario_id INTEGER NOT NULL,
  data_execucao DATE NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (atividade_eap_id) REFERENCES atividades_eap(id) ON DELETE CASCADE,
  FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

**Rastreabilidade:**
- Registra cada avanço diário
- Permite auditoria completa
- Vincula RDO → Atividade → Usuário

#### AUDITORIA
```sql
CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  registro_id INTEGER NOT NULL,
  acao TEXT NOT NULL,                      -- CREATE/UPDATE/DELETE
  dados_anteriores TEXT,                   -- JSON
  dados_novos TEXT,                        -- JSON
  usuario_id INTEGER NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

**Ações auditadas:**
- Criação, edição e exclusão de registros
- Mudança de status
- Aprovações/reprovações
- Recálculos de avanço

#### RNC (Relatório de Não Conformidade)
```sql
CREATE TABLE rnc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL,
  rdo_id INTEGER,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  gravidade TEXT NOT NULL,                 -- Baixa/Média/Alta/Crítica
  status TEXT DEFAULT 'Aberta',            -- Aberta/Em Tratamento/Resolvida
  acao_corretiva TEXT,
  responsavel_id INTEGER,
  criado_por INTEGER NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolvido_em DATETIME,
  FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
  FOREIGN KEY (rdo_id) REFERENCES rdos(id),
  FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);
```

---

## 4. ESPECIFICAÇÃO FUNCIONAL

### 4.1 Tela de Login

**Elementos:**
- Logo Vetor
- Título: "Gestão de Obras"
- Subtítulo: "Controle diário de execução, evidências e progresso por atividade"
- Campo: Login (6 dígitos numéricos)
- Campo: Senha (6 dígitos numéricos)
- Botão: Entrar

**Validações:**
- Login deve ter exatamente 6 dígitos
- Senha deve ter exatamente 6 dígitos
- Ambos apenas números
- Mensagens de erro claras

**Credenciais padrão:**
- Login: `000001`
- Senha: `123456`
- Perfil: Gestor

### 4.2 Dashboard

**Componentes:**

1. **Navbar Superior**
   - Logo e nome do sistema
   - Links: Dashboard | Projetos | Usuários (se gestor)
   - Usuário logado (nome + perfil)
   - Botão Sair

2. **Métricas Principais** (Cards)
   - Avanço Físico Geral (%)
   - Atividades Concluídas
   - Atividades em Andamento
   - Atividades Não Iniciadas

3. **Estatísticas de RDOs**
   - Total de RDOs
   - RDOs Aprovados
   - RDOs em Análise
   - RDOs em Preenchimento
   - Total de Mão de Obra

4. **Gráfico de Evolução**
   - Avanço físico ao longo do tempo
   - Filtros: Diário / Semanal / Mensal

5. **Lista de Atividades Principais**
   - Código EAP
   - Descrição
   - Previsto vs Executado
   - Status com cores

6. **Atalhos Rápidos**
   - Criar novo RDO
   - Ver lista de RDOs
   - Gerenciar EAP
   - Abrir RNC

### 4.3 Cadastro de Projetos

**Campos:**
- Nome do Projeto *
- Empresa Responsável *
- Empresa Executante *
- Prazo de Término * (data)
- Cidade da Execução *
- Usuários Vinculados (seleção múltipla)

**Ações:**
- Criar Projeto (gestor)
- Editar Projeto (gestor)
- Desativar Projeto (gestor)
- Adicionar/Remover Usuários (gestor)

**Listagem:**
- Tabela com todos os projetos
- Colunas: Nome | Empresas | Prazo | Cidade | Ações
- Filtros e busca
- Ordenação por data de criação

### 4.4 Estruturação da EAP

**Interface:**
- Visualização hierárquica (árvore)
- Indentação por nível
- Ícones de expandir/colapsar

**Campos por Atividade:**
- Código EAP * (ex: 1.0, 1.1, 2.0)
- Descrição *
- Percentual Previsto (padrão 100%)
- Percentual Executado (calculado automaticamente)
- Status (calculado automaticamente)
- Atividade Pai (para hierarquia)

**Ações:**
- Adicionar Atividade (raiz ou sub-nível)
- Editar Atividade
- Deletar Atividade
- Reordenar Atividades (drag & drop ideal)
- Ver Histórico de Execuções
- Recalcular Avanço Físico (gestor)

**Exemplo de Estrutura:**
```
📁 1.0 Documentação
    📄 1.1 Alvará de Funcionamento
    📄 1.2 Projetos
📁 2.0 Elétrica
    📄 2.1 Lançamento de Cabos
    📄 2.2 Conexões
📁 3.0 Civil
    📄 3.1 Escavação
    📄 3.2 Concretagem
```

### 4.5 Formulário de RDO

**Seção 1: Informações Gerais**
- Data do Relatório * (auto-preenchido: hoje)
- Dia da Semana * (auto-preenchido)
- Projeto (cabeçalho automático)

**Seção 2: Condições Climáticas**
- Manhã:
  - Clima (Ensolarado/Nublado/Chuvoso)
  - Praticabilidade (Boa/Regular/Ruim)
- Tarde:
  - Clima
  - Praticabilidade

**Seção 3: Recursos**
- Mão de Obra Direta (número)
- Mão de Obra Indireta (número)
- Mão de Obra Terceiros (número)
- Equipamentos (texto livre)
- Intervalo de Almoço (horário)

**Seção 4: Atividades Executadas**
- Botão: "Adicionar Atividade"
- Para cada atividade:
  - Selecionar da EAP (dropdown)
  - Percentual Executado * (0-100%)
  - Observação (opcional)
- Validação: Total não pode ultrapassar 100% por atividade

**Seção 5: Ocorrências e Comentários**
- Ocorrências (textarea)
- Comentários Gerais (textarea)

**Seção 6: Anexos**
- Upload de Arquivos
- Tipos: Fotos (JPG, PNG), Documentos (PDF, DOC, XLS)
- Limite: 10MB por arquivo
- Lista de anexos com preview e opção de deletar

**Rodapé:**
- Usuário que Criou (automático)
- Data/Hora da Última Atualização (automático)
- Status Atual (badge colorido)

**Ações:**
- Salvar Rascunho
- Enviar para Análise
- Cancelar

### 4.6 Lista de RDOs

**Visualização:**
- Tabela com filtros
- Colunas:
  - Data
  - Dia da Semana
  - Status (badge colorido)
  - Criado Por
  - Atividades Trabalhadas
  - Ações

**Filtros:**
- Por Status
- Por Data (intervalo)
- Por Criador

**Ações por RDO:**
- Ver Detalhes
- Editar (se não aprovado e se criador ou gestor)
- Aprovar (somente gestor)
- Reprovar (somente gestor)
- Deletar (se não aprovado e se criador ou gestor)

**Detalhamento:**
- Popup/Modal com todas as informações
- Exibição de anexos
- Histórico de mudanças de status
- Atividades executadas com percentuais

### 4.7 Gestão de Usuários

**Listagem:**
- Tabela com todos os usuários
- Colunas: Login | Nome | Email | Perfil | Status | Ações

**Criar Usuário** (somente gestor):
- Nome *
- Email
- Senha * (6 dígitos)
- Login (gerado automaticamente)
- Perfil inicial: Usuário Comum

**Ações** (somente gestor):
- Tornar Gestor / Remover Gestor
- Desativar Usuário
- Resetar Senha (futura implementação)

**Informações Exibidas:**
- Login gerado (ex: 000002, 000003...)
- Nome completo
- Email
- Se é gestor (badge)
- Data de criação

---

## 5. APIS REST

### 5.1 Autenticação

#### POST `/api/auth/login`
**Request:**
```json
{
  "login": "000001",
  "senha": "123456"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 1,
    "login": "000001",
    "nome": "Administrador",
    "email": "admin@vetor.com",
    "is_gestor": 1
  }
}
```

**Response 401:**
```json
{
  "erro": "Credenciais inválidas."
}
```

### 5.2 Usuários

#### GET `/api/usuarios`
**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
[
  {
    "id": 1,
    "login": "000001",
    "nome": "Administrador",
    "email": "admin@vetor.com",
    "is_gestor": 1,
    "ativo": 1,
    "criado_em": "2025-12-10T10:00:00.000Z"
  }
]
```

#### POST `/api/usuarios`
**Headers:** `Authorization: Bearer {token}` (gestor)

**Request:**
```json
{
  "nome": "João Silva",
  "email": "joao@vetor.com",
  "senha": "654321"
}
```

**Response 201:**
```json
{
  "mensagem": "Usuário criado com sucesso.",
  "usuario": {
    "id": 2,
    "login": "000002",
    "nome": "João Silva",
    "email": "joao@vetor.com"
  }
}
```

#### PATCH `/api/usuarios/:id/gestor`
**Headers:** `Authorization: Bearer {token}` (gestor)

**Request:**
```json
{
  "is_gestor": 1
}
```

**Response 200:**
```json
{
  "mensagem": "Permissões atualizadas com sucesso."
}
```

### 5.3 Projetos

#### GET `/api/projetos`
**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
[
  {
    "id": 1,
    "nome": "Construção Galpão Industrial",
    "empresa_responsavel": "Construtora ABC",
    "empresa_executante": "Vetor Engenharia",
    "prazo_termino": "2026-06-30",
    "cidade": "São Paulo",
    "criador": "Administrador",
    "criado_em": "2025-12-10T10:00:00.000Z"
  }
]
```

#### POST `/api/projetos`
**Headers:** `Authorization: Bearer {token}` (gestor)

**Request:**
```json
{
  "nome": "Reforma Comercial",
  "empresa_responsavel": "Empresa X",
  "empresa_executante": "Vetor",
  "prazo_termino": "2026-03-15",
  "cidade": "Rio de Janeiro",
  "usuarios": [1, 2]
}
```

**Response 201:**
```json
{
  "mensagem": "Projeto criado com sucesso.",
  "projeto": {
    "id": 2,
    "nome": "Reforma Comercial"
  }
}
```

#### GET `/api/projetos/:id`
**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "id": 1,
  "nome": "Construção Galpão Industrial",
  "empresa_responsavel": "Construtora ABC",
  "empresa_executante": "Vetor Engenharia",
  "prazo_termino": "2026-06-30",
  "cidade": "São Paulo",
  "usuarios": [
    {
      "id": 1,
      "login": "000001",
      "nome": "Administrador",
      "is_gestor": 1
    }
  ]
}
```

### 5.4 EAP

#### GET `/api/eap/projeto/:projetoId`
**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
[
  {
    "id": 1,
    "projeto_id": 1,
    "codigo_eap": "1.0",
    "descricao": "Documentação",
    "percentual_previsto": 100,
    "percentual_executado": 50,
    "status": "Em andamento",
    "pai_id": null,
    "ordem": 0
  },
  {
    "id": 2,
    "projeto_id": 1,
    "codigo_eap": "1.1",
    "descricao": "Alvará de Funcionamento",
    "percentual_previsto": 100,
    "percentual_executado": 100,
    "status": "Concluída",
    "pai_id": 1,
    "ordem": 1
  }
]
```

#### POST `/api/eap`
**Headers:** `Authorization: Bearer {token}`

**Request:**
```json
{
  "projeto_id": 1,
  "codigo_eap": "2.0",
  "descricao": "Elétrica",
  "percentual_previsto": 100,
  "pai_id": null,
  "ordem": 2
}
```

**Response 201:**
```json
{
  "mensagem": "Atividade criada com sucesso.",
  "atividade": {
    "id": 3,
    "codigo_eap": "2.0",
    "descricao": "Elétrica"
  }
}
```

#### POST `/api/eap/:id/recalcular`
**Headers:** `Authorization: Bearer {token}` (gestor)

**Response 200:**
```json
{
  "mensagem": "Avanço físico recalculado com sucesso.",
  "percentual_executado": 75.5
}
```

### 5.5 RDOs

#### GET `/api/rdos/projeto/:projetoId`
**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
[
  {
    "id": 1,
    "projeto_id": 1,
    "data_relatorio": "2025-12-10",
    "dia_semana": "Terça-feira",
    "status": "Aprovado",
    "criado_por_nome": "João Silva",
    "aprovado_por_nome": "Administrador",
    "criado_em": "2025-12-10T14:00:00.000Z",
    "aprovado_em": "2025-12-10T16:00:00.000Z"
  }
]
```

#### POST `/api/rdos`
**Headers:** `Authorization: Bearer {token}`

**Request:**
```json
{
  "projeto_id": 1,
  "data_relatorio": "2025-12-10",
  "dia_semana": "Terça-feira",
  "clima_manha": "Ensolarado",
  "praticabilidade_manha": "Boa",
  "clima_tarde": "Nublado",
  "praticabilidade_tarde": "Boa",
  "mao_obra_direta": 15,
  "mao_obra_indireta": 3,
  "mao_obra_terceiros": 5,
  "equipamentos": "Betoneira, Andaimes",
  "ocorrencias": "Atraso na entrega de materiais",
  "comentarios": "Dia produtivo",
  "intervalo_almoco": "12:00 - 13:00",
  "atividades": [
    {
      "atividade_eap_id": 2,
      "percentual_executado": 25,
      "observacao": "Instalação de cabos no setor A"
    }
  ]
}
```

**Response 201:**
```json
{
  "mensagem": "RDO criado com sucesso.",
  "rdo": {
    "id": 2,
    "data_relatorio": "2025-12-10"
  }
}
```

#### PATCH `/api/rdos/:id/status`
**Headers:** `Authorization: Bearer {token}`

**Request:**
```json
{
  "status": "Aprovado"
}
```

**Response 200:**
```json
{
  "mensagem": "RDO aprovado com sucesso."
}
```

**Permissões:**
- `Em análise`: Apenas criador
- `Aprovado/Reprovado`: Apenas gestor

### 5.6 Dashboard

#### GET `/api/dashboard/projeto/:projetoId/avanco`
**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "avanco_geral": {
    "avanco_medio": 45.5,
    "concluidas": 3,
    "em_andamento": 5,
    "nao_iniciadas": 2,
    "total_atividades": 10
  },
  "atividades_principais": [
    {
      "codigo_eap": "1.0",
      "descricao": "Documentação",
      "percentual_previsto": 100,
      "percentual_executado": 80,
      "status": "Em andamento"
    }
  ],
  "evolucao_diaria": [
    {
      "data_relatorio": "2025-12-10",
      "atividades_trabalhadas": 3,
      "percentual_dia": 15
    }
  ]
}
```

---

## 6. REGRAS DE NEGÓCIO

### 6.1 Usuários

1. **Criação de Usuário**
   - Login gerado automaticamente (sequencial, 6 dígitos)
   - Primeiro usuário: 000001
   - Usuário criado não é gestor por padrão
   - Apenas gestor pode criar usuários

2. **Promoção a Gestor**
   - Apenas gestor pode promover outro usuário
   - Ação registrada na auditoria

3. **Autenticação**
   - Login e senha devem ter exatamente 6 dígitos
   - Token JWT válido por 8 horas
   - Token armazenado em localStorage

### 6.2 Projetos

1. **Criação**
   - Apenas gestor pode criar projetos
   - Todos os campos obrigatórios devem ser preenchidos
   - Usuários podem ser vinculados na criação ou posteriormente

2. **Acesso**
   - Gestor vê todos os projetos
   - Usuário comum vê apenas projetos vinculados
   - Projeto desativado não aparece nas listagens

### 6.3 EAP

1. **Estrutura Hierárquica**
   - Atividades podem ter sub-atividades (pai_id)
   - Código EAP deve ser único por projeto
   - Recomendado usar notação: 1.0, 1.1, 1.2, 2.0, 2.1, etc.

2. **Status Automático**
   - Sistema calcula automaticamente:
     - 0% → "Não iniciada"
     - 1-99% → "Em andamento"
     - 100% → "Concluída"

3. **Percentual Executado**
   - Calculado pela soma dos RDOs aprovados
   - Máximo: 100%
   - Pode ser recalculado por gestor

### 6.4 RDO

1. **Criação**
   - Qualquer usuário vinculado ao projeto pode criar
   - Apenas um RDO por dia por projeto
   - Data não pode ser futura
   - Status inicial: "Em preenchimento"

2. **Edição**
   - Apenas criador ou gestor pode editar
   - RDO aprovado não pode ser editado
   - RDO aprovado não pode ser deletado

3. **Fluxo de Status**
   ```
   Em preenchimento (🟡)
        ↓ (criador)
   Em análise (🔵)
        ↓ (gestor)
   Aprovado (🟢) ou Reprovado (🔴)
   ```

4. **Aprovação**
   - Apenas gestor pode aprovar/reprovar
   - Ao aprovar:
     - Percentuais são somados nas atividades EAP
     - Status das atividades é recalculado
     - Histórico é atualizado
   - Ao reprovar:
     - RDO volta para "Em preenchimento"
     - Percentuais não são contabilizados

5. **Atividades no RDO**
   - Uma atividade não pode ultrapassar 100% acumulado
   - Sistema valida antes de aprovar
   - Gestor pode recalcular se houver erro

### 6.5 Anexos

1. **Upload**
   - Formatos aceitos: JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX
   - Tamanho máximo: 10MB por arquivo
   - Anexos vinculados ao RDO
   - Anexos deletados quando RDO deletado

2. **Segurança**
   - Apenas usuários autenticados podem fazer download
   - Arquivos armazenados em diretório protegido

### 6.6 Auditoria

1. **Registro Automático**
   - Todas as operações CREATE, UPDATE, DELETE
   - Mudanças de status
   - Aprovações e reprovações
   - Recálculos de avanço

2. **Dados Armazenados**
   - Quem fez a ação
   - Data e hora
   - Dados anteriores (JSON)
   - Dados novos (JSON)
   - Tabela e ID do registro

---

## 7. FLUXOS DO SISTEMA

### 7.1 Fluxo de Criação de Projeto

```
1. Gestor acessa "Projetos"
2. Clica em "Novo Projeto"
3. Preenche formulário:
   - Nome do Projeto
   - Empresa Responsável
   - Empresa Executante
   - Prazo de Término
   - Cidade
   - Seleciona Usuários
4. Clica em "Salvar"
5. Sistema cria projeto
6. Sistema vincula usuários
7. Sistema registra na auditoria
8. Retorna para lista de projetos
```

### 7.2 Fluxo de Criação da EAP

```
1. Usuário acessa projeto
2. Clica em "Gerenciar EAP"
3. Clica em "Nova Atividade"
4. Preenche:
   - Código EAP (ex: 1.0)
   - Descrição
   - Percentual Previsto (padrão 100%)
   - Atividade Pai (opcional)
5. Clica em "Salvar"
6. Sistema cria atividade
7. Sistema define status inicial: "Não iniciada"
8. Sistema registra na auditoria
9. Atualiza visualização da árvore EAP

Repetir para criar sub-atividades:
- Definir pai_id
- Usar código hierárquico (ex: 1.1, 1.2)
```

### 7.3 Fluxo de Preenchimento de RDO

```
1. Usuário acessa projeto
2. Clica em "Novo RDO"
3. Sistema pré-preenche:
   - Data de hoje
   - Dia da semana
   - Cabeçalho com dados do projeto
4. Usuário preenche:
   - Condições climáticas (manhã/tarde)
   - Mão de obra (direta/indireta/terceiros)
   - Equipamentos
   - Intervalo de almoço
5. Usuário adiciona atividades executadas:
   - Seleciona atividade da EAP
   - Informa percentual executado
   - Adiciona observação (opcional)
   - Repete para outras atividades
6. Usuário faz upload de fotos/anexos
7. Usuário preenche ocorrências e comentários
8. Usuário salva:
   - Opção 1: "Salvar Rascunho" (status: Em preenchimento)
   - Opção 2: "Enviar para Análise" (status: Em análise)
9. Sistema cria RDO no banco
10. Sistema registra histórico de atividades
11. Sistema registra na auditoria
```

### 7.4 Fluxo de Aprovação de RDO

```
1. Gestor acessa "Lista de RDOs"
2. Filtra RDOs "Em análise"
3. Clica em "Ver Detalhes" de um RDO
4. Gestor analisa:
   - Informações preenchidas
   - Atividades executadas
   - Percentuais informados
   - Anexos/fotos
5. Gestor decide:

   APROVAÇÃO:
   a. Clica em "Aprovar"
   b. Sistema atualiza status para "Aprovado"
   c. Sistema soma percentuais nas atividades EAP:
      - Para cada atividade no RDO:
        * percentual_executado_EAP += percentual_RDO
        * Se >= 100%, limita a 100%
   d. Sistema recalcula status das atividades:
      - 0% → "Não iniciada"
      - 1-99% → "Em andamento"
      - 100% → "Concluída"
   e. Sistema atualiza histórico_atividades
   f. Sistema registra aprovação na auditoria
   g. RDO não pode mais ser editado

   REPROVAÇÃO:
   a. Clica em "Reprovar"
   b. Informa motivo (opcional)
   c. Sistema atualiza status para "Reprovado"
   d. Percentuais NÃO são contabilizados
   e. RDO volta para edição do criador
   f. Sistema registra reprovação na auditoria
```

### 7.5 Fluxo de Recálculo de Avanço

```
Quando usar:
- Correção de RDO aprovado incorretamente
- Ajuste de percentual irreal
- Auditoria de dados

Procedimento:
1. Gestor acessa atividade na EAP
2. Clica em "Recalcular Avanço"
3. Sistema:
   a. Busca todos os RDOs aprovados que afetam a atividade
   b. Soma os percentuais executados
   c. Limita a 100%
   d. Atualiza atividades_eap.percentual_executado
   e. Recalcula status
   f. Registra na auditoria
4. Exibe novo percentual para gestor
```

---

## 8. SEGURANÇA E PERMISSÕES

### 8.1 Autenticação

**JWT (JSON Web Token):**
- Token gerado no login
- Expira em 8 horas
- Contém: id, login, nome, is_gestor
- Armazenado em localStorage

**Middleware de Auth:**
```javascript
// Todas as rotas (exceto login) requerem autenticação
app.use('/api', auth);

// Rotas de gestão requerem perfil gestor
app.use('/api/usuarios', [auth, isGestor]);
app.use('/api/projetos', [auth, isGestor]); // para CREATE/UPDATE/DELETE
```

### 8.2 Matriz de Permissões

| Funcionalidade | Usuário Comum | Gestor |
|---|---|---|
| **Login** | ✅ | ✅ |
| **Ver projetos vinculados** | ✅ | ✅ |
| **Ver todos os projetos** | ❌ | ✅ |
| **Criar projeto** | ❌ | ✅ |
| **Editar projeto** | ❌ | ✅ |
| **Ver EAP do projeto** | ✅ | ✅ |
| **Criar/editar atividade EAP** | ✅ | ✅ |
| **Recalcular avanço físico** | ❌ | ✅ |
| **Criar RDO** | ✅ | ✅ |
| **Editar RDO próprio** | ✅ (se não aprovado) | ✅ |
| **Editar RDO de outro** | ❌ | ✅ (se não aprovado) |
| **Enviar RDO para análise** | ✅ | ✅ |
| **Aprovar/Reprovar RDO** | ❌ | ✅ |
| **Ver lista de usuários** | ✅ | ✅ |
| **Criar usuário** | ❌ | ✅ |
| **Promover a gestor** | ❌ | ✅ |
| **Desativar usuário** | ❌ | ✅ |
| **Upload de anexos** | ✅ | ✅ |
| **Download de anexos** | ✅ | ✅ |
| **Ver dashboard** | ✅ | ✅ |

### 8.3 Validações de Segurança

1. **Validação de Entrada**
   - Express-validator em todas as rotas
   - Sanitização de dados
   - Validação de tipos
   - Limites de tamanho

2. **SQL Injection**
   - Uso de prepared statements
   - Parametrização de queries
   - Nenhuma concatenação de strings SQL

3. **Senhas**
   - Hash com bcrypt (10 rounds)
   - Nunca retornar senha em responses
   - Validação de formato (6 dígitos)

4. **Upload de Arquivos**
   - Validação de tipo MIME
   - Validação de extensão
   - Limite de tamanho: 10MB
   - Geração de nome único (evita override)

5. **CORS**
   - Configurado para localhost em desenvolvimento
   - Ajustar para domínio específico em produção

---

## 9. RASTREABILIDADE E AUDITORIA

### 9.1 Tabela de Auditoria

Toda ação crítica gera registro:

```javascript
registrarAuditoria(
  tabela: 'rdos',
  registroId: 5,
  acao: 'UPDATE',
  dadosAnteriores: { status: 'Em análise' },
  dadosNovos: { status: 'Aprovado', aprovado_por: 1 },
  usuarioId: 1
);
```

**Resultado no banco:**
```json
{
  "id": 123,
  "tabela": "rdos",
  "registro_id": 5,
  "acao": "UPDATE",
  "dados_anteriores": "{\"status\":\"Em análise\"}",
  "dados_novos": "{\"status\":\"Aprovado\",\"aprovado_por\":1}",
  "usuario_id": 1,
  "criado_em": "2025-12-10T16:30:00.000Z"
}
```

### 9.2 Histórico de Atividades

Registro específico para avanço de atividades:

```sql
INSERT INTO historico_atividades (
  atividade_eap_id,
  rdo_id,
  percentual_anterior,
  percentual_executado,
  percentual_novo,
  usuario_id,
  data_execucao
) VALUES (
  10,                    -- ID da atividade
  5,                     -- ID do RDO
  30.0,                  -- % antes desta execução
  15.0,                  -- % executado neste RDO
  45.0,                  -- % após esta execução
  2,                     -- Usuário que executou
  '2025-12-10'
);
```

**Consulta de Histórico:**
```sql
SELECT 
  h.*,
  u.nome as usuario_nome,
  r.data_relatorio,
  ae.codigo_eap,
  ae.descricao
FROM historico_atividades h
INNER JOIN usuarios u ON h.usuario_id = u.id
INNER JOIN rdos r ON h.rdo_id = r.id
INNER JOIN atividades_eap ae ON h.atividade_eap_id = ae.id
WHERE h.atividade_eap_id = 10
ORDER BY h.data_execucao DESC;
```

### 9.3 Timestamps Automáticos

Todas as tabelas principais possuem:
- `criado_em` - Data/hora de criação
- `atualizado_em` - Data/hora da última modificação
- `criado_por` - ID do usuário criador
- `aprovado_por` / `aprovado_em` (quando aplicável)

### 9.4 Relatórios de Auditoria (Futura Implementação)

**Consultas úteis:**

1. **Quem aprovou RDOs hoje?**
```sql
SELECT 
  r.id, 
  r.data_relatorio, 
  u.nome as aprovador,
  r.aprovado_em
FROM rdos r
INNER JOIN usuarios u ON r.aprovado_por = u.id
WHERE DATE(r.aprovado_em) = DATE('now')
AND r.status = 'Aprovado';
```

2. **Alterações em um projeto específico:**
```sql
SELECT * FROM auditoria
WHERE tabela IN ('projetos', 'atividades_eap', 'rdos')
AND registro_id IN (
  SELECT id FROM projetos WHERE id = 1
  UNION
  SELECT id FROM atividades_eap WHERE projeto_id = 1
  UNION
  SELECT id FROM rdos WHERE projeto_id = 1
)
ORDER BY criado_em DESC;
```

3. **Ações de um usuário:**
```sql
SELECT 
  tabela,
  acao,
  criado_em,
  dados_anteriores,
  dados_novos
FROM auditoria
WHERE usuario_id = 2
ORDER BY criado_em DESC
LIMIT 50;
```

---

## 🎯 CONCLUSÃO

Este documento apresenta a especificação técnica completa do sistema **Gestão de Obras - Vetor**.

**Implementado:**
- ✅ Backend completo (Node.js + Express + SQLite)
- ✅ APIs REST funcionais
- ✅ Banco de dados estruturado
- ✅ Autenticação JWT
- ✅ Sistema de permissões (Usuário/Gestor)
- ✅ Frontend base (React + Vite)
- ✅ Login e Dashboard
- ✅ Rastreabilidade e auditoria

**Próximos passos de desenvolvimento:**
- Completar telas de CRUD no frontend (Projetos, EAP, RDO)
- Implementar upload de arquivos visual
- Adicionar gráficos avançados (Recharts)
- Implementar RNC (Relatório de Não Conformidade)
- Exportação para PDF/Excel
- Notificações
- Busca avançada e filtros

**Para produção:**
- Migrar de SQLite para PostgreSQL/MySQL
- Implementar HTTPS
- Adicionar rate limiting
- Log centralizado
- Backup automatizado
- Deploy em servidor (backend + frontend)

---

**Documentação criada em:** 10 de dezembro de 2025  
**Versão:** 1.0.0  
**Sistema:** Gestão de Obras - Vetor

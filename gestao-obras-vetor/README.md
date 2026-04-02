# Gestão de Obras - Vetor

Sistema completo de gestão de obras com controle de EAP e RDO.

Última atualização de documentação: 01/04/2026.

## 🚀 Tecnologias

### Backend
- Node.js + Express
- SQLite
- JWT para autenticação
- Multer para upload de arquivos

### Frontend
- React 18
- Vite
- React Router
- Axios
- Recharts (gráficos)
- Lucide React (ícones)

## 📦 Instalação

### Pré-requisitos (versões fixas)

- Node.js `18.20.4`
- npm `10.8.2`
- Dependências do projeto fixadas nos arquivos `package.json` (sem `^`)

> Recomendado: usar `npm ci` para instalação determinística baseada no `package-lock.json`.

### 1. Instalar dependências do Backend

```powershell
cd backend
npm ci
```

### 2. Inicializar o banco de dados

```powershell
npm run init-db
```

### 3. Instalar dependências do Frontend

```powershell
cd ../frontend
npm ci
```

## ▶️ Executar o Sistema

### Opção 1: Executar manualmente (2 terminais)

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

### Opção 2: Script automatizado

Na raiz do projeto:
```powershell
.\start.ps1
```

## 🌐 Acessar o Sistema

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001/api
- **Health Check:** http://localhost:3001/api/health

---

## Como rodar localmente (ordem recomendada)

- **Passo 1 — Backend:** abra um terminal, vá para `backend/` e inicie o servidor.

```powershell
cd 'c:\Apps\Vetor - Gerencia\gestao-obras-vetor\backend'
# em desenvolvimento (com nodemon):


# ou em produção/simulação com node direto:

node server.js

# (ou, se já estiver no diretório backend, apenas)
# node server.js
```

- **Passo 2 — Frontend:** depois que o backend estiver com `/api/health` retornando OK, inicie o Vite.

```powershell
cd 'c:\Apps\Vetor - Gerencia\gestao-obras-vetor\frontend'

npm run dev
```

### Evitar EADDRINUSE / travamentos ao subir o backend

- **Sempre pare processos Node antigos** que possam estar usando a porta (`3001` por padrão). No PowerShell:

```powershell
$nodes = Get-Process node -ErrorAction SilentlyContinue
if ($nodes) { $nodes | ForEach-Object { Stop-Process -Id $_.Id -Force } }
```

- **Use PM2** para rodar o backend de forma estável em background (opcional):

1. Instale PM2 globalmente (uma vez):

```powershell
npm install -g pm2
```

2. No diretório `backend/`, inicie com o arquivo `ecosystem.config.js` (adicionado neste repositório):

```powershell
cd 'c:\Apps\Vetor - Gerencia\gestao-obras-vetor\backend'
pm2 start ecosystem.config.js --env development
pm2 save
pm2 status
```

- **Boas práticas**:
   - Use variáveis de ambiente (`.env`) para `JWT_SECRET`, `DATABASE_URL`, `PORT`.
   - Sempre verifique `GET /api/health` antes de iniciar o frontend.
   - Se o backend falhar ao iniciar, cheque o log (`server.log` ou `pm2 logs`) e libere a porta como acima.


## 🔐 Credenciais Padrão

- **Login:** 000001
- **Senha:** 123456

Este usuário é **gestor** e tem todas as permissões.

## 📚 Estrutura do Projeto

```
gestao-obras-vetor/
├── backend/
│   ├── config/          # Configuração do banco
│   ├── middleware/      # Auth e auditoria
│   ├── routes/          # Rotas da API
│   ├── scripts/         # Script de inicialização
│   ├── database/        # Arquivo SQLite (criado automaticamente)
│   ├── uploads/         # Arquivos anexados aos RDOs
│   └── server.js        # Servidor principal
│
└── frontend/
    ├── src/
    │   ├── components/  # Componentes React
    │   ├── context/     # Context API (Auth)
    │   ├── pages/       # Páginas da aplicação
    │   ├── services/    # API client (Axios)
    │   └── main.jsx     # Entry point
    └── index.html
```

## 📋 Funcionalidades Implementadas

### ✅ Autenticação
- Login com 6 dígitos (login e senha)
- JWT tokens
- Proteção de rotas

### ✅ Gestão de Usuários
- Criação automática de login (sequencial)
- Perfis: Usuário comum e Gestor
- Apenas gestor pode promover outros usuários

### ✅ Gestão de Projetos
- CRUD completo
- Vinculação de usuários por projeto
- Campos: nome, empresas, prazo, cidade

### ✅ EAP (Estrutura Analítica do Projeto)
- Estrutura hierárquica
- Código EAP customizável
- Status automático (Não iniciada / Em andamento / Concluída)
- Percentual previsto vs executado
- Histórico de execuções

### ✅ RDO (Relatório Diário de Obra)
- Preenchimento completo conforme especificação
- Status com cores:
  - 🟡 Em preenchimento
  - 🔵 Em análise
  - 🟢 Aprovado
  - 🔴 Reprovado
- Upload de anexos (fotos, PDFs)
- Vinculação com atividades da EAP
- Registro de mão de obra e equipamentos

### ✅ Controle de Aprovação
- Apenas gestores aprovam/reprovam
- Recálculo de avanço físico
- Auditoria completa (quem/quando)

### ✅ Dashboard
- Avanço físico consolidado
- Gráficos de evolução
- Estatísticas de RDOs
- Status das atividades

### ✅ Rastreabilidade
- Histórico de todas as alterações
- Tabela de auditoria
- Registro de criador/modificador

## 🔧 APIs Disponíveis

### Auth
- `POST /api/auth/login` - Login

### Usuários
- `GET /api/usuarios` - Listar
- `POST /api/usuarios` - Criar
- `PATCH /api/usuarios/:id/gestor` - Alterar permissão
- `DELETE /api/usuarios/:id` - Desativar

### Projetos
- `GET /api/projetos` - Listar
- `GET /api/projetos/:id` - Detalhes
- `POST /api/projetos` - Criar
- `PUT /api/projetos/:id` - Atualizar
- `PATCH /api/projetos/:id/arquivar` - Arquivar
- `PATCH /api/projetos/:id/desarquivar` - Desarquivar

### EAP
- `GET /api/eap/projeto/:projetoId` - Listar atividades
- `POST /api/eap` - Criar atividade
- `PUT /api/eap/:id` - Atualizar
- `POST /api/eap/:id/recalcular` - Recalcular avanço
- `GET /api/eap/:id/historico` - Histórico
- `DELETE /api/eap/:id` - Deletar

### RDOs
- `GET /api/rdos/projeto/:projetoId` - Listar
- `GET /api/rdos/:id` - Detalhes
- `POST /api/rdos` - Criar
- `PUT /api/rdos/:id` - Atualizar
- `PATCH /api/rdos/:id/status` - Alterar status
- `DELETE /api/rdos/:id` - Deletar

### Anexos
- `POST /api/anexos/upload/:rdoId` - Upload
- `GET /api/anexos/rdo/:rdoId` - Listar
- `GET /api/anexos/download/:id` - Download
- `DELETE /api/anexos/:id` - Deletar

### Dashboard
- `GET /api/dashboard/projeto/:projetoId/avanco` - Avanço físico
- `GET /api/dashboard/projeto/:projetoId/rdos-stats` - Estatísticas
- `GET /api/dashboard/projeto/:projetoId/galeria-rdos` - Galeria de fotos agrupada por RDO

## 🎯 Próximos Passos

Para expandir o sistema, você pode:

1. **Adicionar mais páginas no frontend:**
   - Listagem de projetos
   - Gerenciamento de EAP (visual)
   - Formulário completo de RDO
   - Gestão de usuários
   - Seção de RNC

2. **Melhorias:**
   - Relatórios em PDF
   - Exportação Excel
   - Notificações
   - Busca avançada
   - Filtros e ordenação

3. **Deploy:**
   - Backend: Heroku, Railway, DigitalOcean
   - Frontend: Vercel, Netlify
   - Banco: PostgreSQL para produção

## 📝 Notas

- O banco SQLite é local e adequado para desenvolvimento/testes
- Para produção, migre para PostgreSQL ou MySQL
- Os arquivos de upload ficam em `backend/uploads/`
- Logs são exibidos no console do backend
- PDF de RDO inclui links clicáveis para anexos e fotos embutidas
- PDF de RNC inclui fotos anexadas e links para abertura dos anexos

## 🐛 Troubleshooting

### Erro: "Cannot find module"
```powershell
# Reinstalar dependências
cd backend
Remove-Item node_modules -Recurse -Force
npm ci

cd ../frontend
Remove-Item node_modules -Recurse -Force
npm ci
```

### Erro: "Port already in use"
```powershell
# Verificar processos nas portas 3000 e 3001
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# Matar processo se necessário
taskkill /PID <PID> /F
```

### Resetar banco de dados
```powershell
cd backend
Remove-Item database\gestao_obras.db
npm run init-db
```

## 📄 Licença

ISC - Uso interno da Vetor

---

**Desenvolvido para Vetor - Sistema de Gestão de Obras**

# Teste de Deploy Final


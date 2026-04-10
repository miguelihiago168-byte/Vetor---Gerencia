# Gestão de Obras - Vetor


Sistema completo de gestão de obras com módulos de planejamento (EAP, Curva S, Gantt), execução diária (RDO), controle de compras/requisições, almoxarifado, gestão de usuários, RNC, notificações, email e rastreabilidade.

Última atualização de documentação: 01/04/2026.
Observação: linha adicionada em 10/04/2026 para acionar novo deploy na branch main.

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

### Reinício rápido após deploy

Na raiz do projeto, execute:

```powershell
.\scripts\restart_after_deploy.ps1
```

Ou, via atalho `.bat`:

```bat
restart-deploy.bat
```

### PDF rico em produção (Linux/Ubuntu)

Para que o PDF gerado na web fique igual ao PDF do localhost, o deploy do backend precisa incluir um navegador headless.

- Em Docker: o `backend/Dockerfile` já instala `chromium` e define `PUPPETEER_EXECUTABLE_PATH`.
- Em PM2/Linux direto: use o `backend/ecosystem.config.js`, que já define `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`.

Após atualizar essas dependências no servidor, faça rebuild/restart do backend:

```bash
docker compose up -d --build backend
```

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
   - Use variáveis de ambiente (`.env`) para `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL`, `PORT`.
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

### ✅ Autenticação e Perfis
- Login com 6 dígitos (login e senha)
- JWT tokens
- Proteção de rotas
- Perfis: Usuário comum, Gestor, ADM, Almoxarife, Fiscal, Gestor de Qualidade

### ✅ Gestão de Usuários
- Criação automática de login (sequencial)
- Perfis e permissões editáveis
- Apenas gestor/adm pode promover outros usuários
- Vinculação de usuários por projeto

### ✅ Gestão de Projetos
- CRUD completo
- Campos: nome, empresas, prazo, cidade
- Arquivar/desarquivar projetos

### ✅ EAP (Estrutura Analítica do Projeto)
- Estrutura hierárquica
- Código EAP customizável
- Status automático (Não iniciada / Em andamento / Concluída)
- Percentual previsto vs executado
- Histórico de execuções
- Curva S e Gantt
- Dependências e sugestões automáticas

### ✅ RDO (Relatório Diário de Obra)
- Preenchimento completo conforme especificação
- Status com cores:
   - 🟡 Em preenchimento
   - 🔵 Em análise
   - 🟢 Aprovado
   - 🔴 Reprovado
- Upload de anexos (fotos, PDFs)
- Vinculação com atividades da EAP
- Registro de mão de obra, equipamentos, clima, materiais, ocorrências, assinaturas e fotos
- Logs de alterações

### ✅ Compras e Requisições
- Requisições multi-itens
- Pedidos de compra
- Fluxo de aprovação e análise
- Cotação, seleção de fornecedor, status detalhado
- Kanban de compras
- Exportação Excel

### ✅ Fornecedores
- Cadastro, edição e exclusão de fornecedores

### ✅ Almoxarifado
- Controle de ferramentas, retiradas, devoluções, manutenções, perdas, transferências
- Relatórios de movimentações
- Dashboard de ativos

### ✅ RNC (Registro de Não Conformidade)
- Cadastro, edição, aprovação, correção e exclusão de RNC
- Upload de anexos e fotos
- PDF de RNC

### ✅ Notificações
- Notificações por usuário e contexto
- Marcação de lidas

### ✅ Email
- Configuração de SMTP
- Envio de emails, templates, histórico
- Upload de imagens para email

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
- `POST /api/auth/register` - Cadastro via convite

### Usuários
- `GET /api/usuarios` - Listar
- `POST /api/usuarios` - Criar
- `PATCH /api/usuarios/:id/gestor` - Alterar permissão gestor
- `PATCH /api/usuarios/:id/adm` - Alterar permissão ADM
- `DELETE /api/usuarios/:id` - Desativar
- `PATCH /api/usuarios/:id/senha` - Alterar senha

### Projetos
- `GET /api/projetos` - Listar
- `GET /api/projetos/:id` - Detalhes
- `POST /api/projetos` - Criar
- `PUT /api/projetos/:id` - Atualizar
- `PATCH /api/projetos/:id/arquivar` - Arquivar
- `PATCH /api/projetos/:id/desarquivar` - Desarquivar
- `POST /api/projetos/:destinoId/copiar-eap` - Copiar EAP

### EAP
- `GET /api/eap/projeto/:projetoId` - Listar atividades
- `POST /api/eap` - Criar atividade
- `PUT /api/eap/:id` - Atualizar
- `POST /api/eap/:id/recalcular` - Recalcular avanço
- `GET /api/eap/:id/historico` - Histórico
- `DELETE /api/eap/:id` - Deletar
- `POST /api/eap/projeto/:projetoId/recalcular-tudo` - Recalcular tudo
- `POST /api/eap/projeto/:projetoId/sugerir-dependencias` - Sugerir dependências
- `GET /api/eap/projeto/:projetoId/gantt-data` - Dados para Gantt

### RDOs
- `GET /api/rdos/projeto/:projetoId` - Listar
- `GET /api/rdos/:id` - Detalhes
- `POST /api/rdos` - Criar
- `PUT /api/rdos/:id` - Atualizar
- `PATCH /api/rdos/:id/status` - Alterar status
- `DELETE /api/rdos/:id` - Deletar
- `GET /api/rdos/:id/pdf` - PDF do RDO
- `GET /api/rdos/:id/logs` - Logs do RDO

### Anexos
- `POST /api/anexos/upload/:rdoId` - Upload RDO
- `POST /api/anexos/upload-rnc/:rncId` - Upload RNC
- `GET /api/anexos/rdo/:rdoId` - Listar anexos RDO
- `GET /api/anexos/rnc/:rncId` - Listar anexos RNC
- `GET /api/anexos/download/:id` - Download
- `DELETE /api/anexos/:id` - Deletar

### Compras e Requisições
- `POST /api/requisicoes` - Criar requisição
- `GET /api/requisicoes/projeto/:projetoId` - Listar requisições do projeto
- `GET /api/requisicoes/:id` - Detalhes da requisição
- `PATCH /api/requisicoes/:id/editar` - Editar requisição
- `PATCH /api/requisicoes/:id/concluir` - Concluir requisição
- `PATCH /api/requisicoes/:id/analisar-todos` - Analisar todos os itens
- `PATCH /api/requisicoes/:id/comprar-todos` - Comprar todos os itens
- `PATCH /api/requisicoes/:id/itens/:itemId/analisar` - Analisar item
- `PATCH /api/requisicoes/:id/itens/:itemId/cancelar` - Cancelar item
- `PATCH /api/requisicoes/:id/itens/:itemId/alterar-quantidade` - Alterar quantidade
- `POST /api/requisicoes/:id/itens/:itemId/cotacoes` - Adicionar cotação
- `PATCH /api/requisicoes/:id/itens/:itemId/cotacoes/:cotacaoId` - Editar cotação
- `PATCH /api/requisicoes/:id/itens/:itemId/cotacoes/:cotacaoId/selecionar` - Selecionar cotação
- `PATCH /api/requisicoes/:id/itens/:itemId/finalizar-cotacao` - Finalizar cotação
- `PATCH /api/requisicoes/:id/itens/:itemId/editar` - Editar item

### Pedidos de Compra
- `POST /api/pedidos-compra` - Criar pedido
- `GET /api/pedidos-compra/projeto/:projetoId` - Listar pedidos
- `GET /api/pedidos-compra/:id` - Detalhes
- `PATCH /api/pedidos-compra/:id/aprovar-inicial` - Aprovar
- `PATCH /api/pedidos-compra/:id/reprovar` - Reprovar
- `PATCH /api/pedidos-compra/:id/comprado` - Marcar como comprado

### Fornecedores
- `GET /api/fornecedores` - Listar
- `POST /api/fornecedores` - Criar
- `PATCH /api/fornecedores/:id` - Editar
- `DELETE /api/fornecedores/:id` - Excluir

### Almoxarifado
- `GET /api/almoxarifado/perfil` - Perfil do almoxarifado
- `GET /api/almoxarifado/ferramentas` - Listar ferramentas
- `POST /api/almoxarifado/ferramentas` - Cadastrar ferramenta
- `POST /api/almoxarifado/retiradas` - Registrar retirada
- `POST /api/almoxarifado/devolucoes/:alocacaoId` - Registrar devolução
- `POST /api/almoxarifado/manutencao/enviar` - Enviar para manutenção
- `POST /api/almoxarifado/manutencao/:id/concluir` - Concluir manutenção
- `POST /api/almoxarifado/perdas` - Registrar perda
- `POST /api/almoxarifado/transferencias` - Transferir ferramenta
- `GET /api/almoxarifado/dashboard/projeto/:projetoId` - Dashboard de ativos
- `GET /api/almoxarifado/relatorios/movimentacoes` - Relatório de movimentações
- `GET /api/almoxarifado/relatorios/perdas` - Relatório de perdas

### RNC
- `GET /api/rnc/projeto/:projetoId` - Listar RNCs
- `POST /api/rnc` - Criar RNC
- `PUT /api/rnc/:id` - Editar RNC
- `PATCH /api/rnc/:id/status` - Alterar status
- `POST /api/rnc/:id/enviar-aprovacao` - Enviar para aprovação
- `POST /api/rnc/:id/corrigir` - Corrigir RNC
- `DELETE /api/rnc/:id` - Excluir
- `GET /api/rnc/:id/pdf` - PDF da RNC

### Notificações
- `GET /api/notificacoes` - Listar notificações
- `PATCH /api/notificacoes/:id/read` - Marcar como lida
- `PATCH /api/notificacoes/marcar-todas-lidas` - Marcar todas como lidas

### Email
- `GET /api/email/config` - Obter config
- `POST /api/email/config` - Salvar config
- `POST /api/email/config/test` - Testar config
- `POST /api/email/send` - Enviar email
- `GET /api/email/history` - Histórico
- `GET /api/email/history/:id` - Detalhe do email
- `GET /api/email/templates` - Listar templates
- `POST /api/email/templates` - Criar template
- `GET /api/email/templates/:id` - Detalhe template
- `DELETE /api/email/templates/:id` - Excluir template
- `POST /api/email/upload-image` - Upload de imagem

### Dashboard
- `GET /api/dashboard/projeto/:projetoId/avanco` - Avanço físico
- `GET /api/dashboard/projeto/:projetoId/rdos-stats` - Estatísticas
- `GET /api/dashboard/projeto/:projetoId/galeria-rdos` - Galeria de fotos agrupada por RDO
- `GET /api/dashboard/projeto/:projetoId/curva-s` - Dados Curva S

### (Financeiro - desativado)
- Rotas presentes mas desativadas


## 🎯 Próximos Passos

1. **Aprimorar módulos existentes:**
   - Melhorias no fluxo de aprovação de compras e requisições
   - Relatórios customizados (PDF, Excel) para todos os módulos
   - Filtros e busca avançada em todas as telas
   - Integração de notificações por email e push
   - Otimização de performance para grandes obras

2. **Financeiro:**
   - Reativar e aprimorar módulo financeiro (fluxo de caixa, receitas, despesas)

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



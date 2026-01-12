# 🚀 GUIA RÁPIDO - Gestão de Obras Vetor

## ⚡ Iniciar o Sistema

### Opção 1: Script Automatizado (Recomendado)
```powershell
cd "c:\Apps\Vetor - Gerencia\gestao-obras-vetor"
.\start.ps1
```

### Opção 2: Manual (2 terminais)

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

## 🌐 Acessar

- **Sistema:** http://localhost:3000
- **API:** http://localhost:3001/api

## 🔐 Login Padrão

- **Login:** 000001
- **Senha:** 123456
- **Perfil:** Gestor

## 📝 Primeiros Passos

### 1. Criar Usuários
1. Faça login como gestor (000001)
2. Acesse "Usuários" no menu
3. Clique em "Novo Usuário"
4. Preencha nome, email e senha (6 dígitos)
5. Sistema gera login automaticamente (000002, 000003...)
6. Para tornar gestor: clique no botão "Promover a Gestor"

### 2. Criar Projeto
1. Acesse "Projetos" no menu
2. Clique em "Novo Projeto"
3. Preencha:
   - Nome do Projeto
   - Empresa Responsável
   - Empresa Executante
   - Prazo de Término
   - Cidade
4. Selecione usuários que terão acesso
5. Salve

### 3. Estruturar EAP
1. Entre no projeto criado
2. Clique em "Gerenciar EAP"
3. Adicione atividades principais (ex: "1.0 Documentação")
4. Adicione sub-atividades (ex: "1.1 Alvará")
5. Defina percentual previsto (padrão: 100%)

**Exemplo de estrutura:**
```
1.0 Documentação
  1.1 Alvará de Funcionamento
  1.2 Projetos
2.0 Elétrica
  2.1 Lançamento de Cabos
  2.2 Conexões
3.0 Civil
  3.1 Escavação
  3.2 Concretagem
```

### 4. Criar RDO
1. No projeto, clique em "Novo RDO"
2. Preencha:
   - Condições climáticas (manhã/tarde)
   - Mão de obra (direta/indireta/terceiros)
   - Equipamentos utilizados
3. Adicione atividades executadas:
   - Selecione atividade da EAP
   - Informe percentual executado (%)
   - Adicione observação
4. Faça upload de fotos/documentos
5. Preencha ocorrências e comentários
6. Salve ou envie para análise

### 5. Aprovar RDO (Gestor)
1. Acesse "Lista de RDOs"
2. Filtre por "Em análise"
3. Clique em "Ver Detalhes"
4. Analise informações e anexos
5. Clique em "Aprovar" ou "Reprovar"
6. Ao aprovar:
   - Percentuais são somados nas atividades
   - Status das atividades é atualizado
   - RDO não pode mais ser editado

## 📊 Dashboard

Visualize:
- Avanço físico geral do projeto
- Atividades concluídas/em andamento/não iniciadas
- Estatísticas de RDOs
- Evolução diária/semanal/mensal

## 🎨 Cores dos Status de RDO

- 🟡 **Amarelo** - Em preenchimento
- 🔵 **Azul** - Em análise
- 🟢 **Verde** - Aprovado
- 🔴 **Vermelho** - Reprovado

## ⚙️ Comandos Úteis

### Backend

```powershell
cd backend

# Instalar dependências
npm install

# Inicializar banco de dados
npm run init-db

# Iniciar servidor
npm start        # Produção
npm run dev      # Desenvolvimento (com nodemon)
```

### Frontend

```powershell
cd frontend

# Instalar dependências
npm install

# Iniciar servidor
npm run dev      # Desenvolvimento

# Build para produção
npm run build

# Preview do build
npm run preview
```

### Resetar Banco de Dados

```powershell
cd backend
Remove-Item database\gestao_obras.db
npm run init-db
```

## 🔧 Testar API Diretamente

### Health Check
```
GET http://localhost:3001/api/health
```

### Login
```
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "login": "000001",
  "senha": "123456"
}
```

### Listar Projetos (com token)
```
GET http://localhost:3001/api/projetos
Authorization: Bearer {seu-token-aqui}
```

## 📁 Estrutura de Arquivos

```
backend/
├── database/          # Banco SQLite (gestao_obras.db)
├── uploads/           # Arquivos anexados aos RDOs
├── routes/            # APIs REST
└── server.js          # Servidor principal

frontend/
├── src/
│   ├── pages/         # Telas (Login, Dashboard, etc)
│   ├── components/    # Componentes React
│   └── services/      # API client (Axios)
└── index.html
```

## 🐛 Solução de Problemas

### Porta já em uso
```powershell
# Verificar processo na porta
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# Matar processo (substitua <PID>)
taskkill /PID <PID> /F
```

### Erro de módulo não encontrado
```powershell
# Reinstalar dependências
cd backend
Remove-Item node_modules -Recurse -Force
npm install

cd ..\frontend
Remove-Item node_modules -Recurse -Force
npm install
```

### Erro de autenticação
1. Limpe localStorage do navegador (F12 → Application → Local Storage)
2. Faça login novamente

## 📞 Fluxo Completo (Exemplo)

1. **Gestor cria projeto** "Galpão Industrial"
2. **Gestor adiciona EAP:**
   - 1.0 Fundação
   - 1.1 Escavação
   - 1.2 Concretagem
3. **Usuário cria RDO** do dia:
   - Executou 30% da atividade 1.1 (Escavação)
   - Anexou 5 fotos
4. **Usuário envia para análise**
5. **Gestor aprova RDO:**
   - Atividade 1.1 passa de 0% → 30%
   - Status muda de "Não iniciada" → "Em andamento"
6. **Dashboard atualiza automaticamente:**
   - Avanço físico geral recalculado
   - Gráfico de evolução atualizado

---

## 🎯 Dicas

✅ **Organize a EAP antes de começar os RDOs**  
✅ **Tire fotos durante a execução para anexar**  
✅ **Preencha RDOs diariamente**  
✅ **Gestores devem revisar RDOs regularmente**  
✅ **Use a auditoria para rastrear mudanças**

❌ **Não aprove RDOs sem revisar as informações**  
❌ **Não ultrapasse 100% em nenhuma atividade**  
❌ **Não delete RDOs aprovados**

---

**Sistema desenvolvido para Vetor Engenharia**  
**Versão 1.0.0 - Dezembro 2025**

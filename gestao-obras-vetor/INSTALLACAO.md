Guia de Instalação — Gestão de Obras - Vetor

Pré-requisitos
- Node.js 18.20.4
- npm 10.8.2
- Git (opcional)
- Windows (testado) ou Linux/macOS

Versões fixadas do projeto
- Backend: dependências fixadas em `backend/package.json` (sem `^`)
- Frontend: dependências fixadas em `frontend/package.json` (sem `^`)
- Instalação determinística: use `npm ci` (respeita `package-lock.json`)

1) Clone do repositório
```bash
git clone <repo> gestao-obras-vetor
cd gestao-obras-vetor
```

2) Instalar dependências
- Backend
```powershell
cd backend
npm ci
```
- Frontend
```powershell
cd ../frontend
npm ci
```

3) Variáveis de ambiente
- Copie `.env.example` (se existir) ou crie um `.env` em `backend/` com as configurações necessárias.
- Exemplo mínimo (`backend/.env`):
```
PORT=3001
DATABASE_FILE=database/gestao_obras.db
JWT_SECRET=troque_por_uma_chave_segura
```

4) Inicializar o banco (SQLite)
```powershell
cd backend
npm run init-db
```

5) Rodar em ambiente de desenvolvimento
- Backend (com nodemon):
```powershell
cd backend
npm run dev
```
- Frontend (Vite):
```powershell
cd frontend
npm run dev
```

Acessos
- Frontend: http://localhost:3000/
- Backend (health): http://localhost:3001/api/health

6) Build de produção do frontend
```powershell
cd frontend
npm run build
# arquivos gerados em frontend/dist
```

7) Executando em produção com PM2 (opcional)
```powershell
cd backend
npm run pm2-start
```

Soluções de problemas comuns
- Porta em uso (EADDRINUSE): verifique qual processo está usando a porta e finalize-o:
```powershell
netstat -ano | findstr ":3001"
tasklist /FI "PID eq <PID>"
taskkill /PID <PID> /F
```
- Problemas com dependências: delete `node_modules` e rode `npm ci` novamente.
- Se o frontend não carregar, confirme se o dev server (Vite) está ativo e acessível na porta 3000.

Observações
- O backend usa SQLite por padrão; arquivo de banco fica em `backend/database/gestao_obras.db`.
- Credenciais padrão para testes: Login `000001` / Senha `123456` (somente ambiente de desenvolvimento).

Se quiser, eu posso gerar um `docker-compose.yml` para rodar backend + frontend em containers.

Docker com HTTPS automático (produção)

O Docker Compose publica somente o Caddy nas portas TCP 80 e 443. Ele obtém e
renova automaticamente o certificado Let's Encrypt; o frontend, API e Socket.IO
ficam na rede interna Docker.

1) No DNS, crie o registro A/AAAA de `vetor.damjam.com.br` apontando para o IP
do servidor Linux. Libere e, se necessário, encaminhe as portas TCP 80 e 443
para esse servidor. Nenhum outro serviço pode ocupar essas portas.

2) Copie `.env.example` para `.env` na raiz do projeto e preencha:
```dotenv
APP_DOMAIN=vetor.damjam.com.br
LETSENCRYPT_EMAIL=admin@damjam.com.br
APP_DATA_DIR=/srv/gestao-obras-vetor
```
`APP_DOMAIN` deve conter somente o domínio, sem `http://` ou `https://`.

3) Mantenha as credenciais do backend em `backend/.env` (use
`backend/.env.production.example` como referência) e inicie uma única vez:
```bash
docker compose up -d --build
```

4) Verifique a emissão e o acesso:
```bash
docker compose logs -f caddy
curl -I http://vetor.damjam.com.br
curl https://vetor.damjam.com.br/api/health
```
O primeiro comando `curl` deve redirecionar para HTTPS. Certificados e dados
ACME ficam nos volumes `caddy_data` e `caddy_config`, preservados em recriações
normais dos containers.

### Deploy automático pelo GitHub Actions

Antes do primeiro push para `main`, crie o `.env` **na raiz do projeto no
servidor** a partir de `.env.example`. Esse arquivo é ignorado pelo Git e será
preservado pelo `git reset --hard` usado no deploy. O workflow valida sua
presença, recria o Caddy a cada publicação e falha com uma mensagem clara se
`APP_DOMAIN`, `LETSENCRYPT_EMAIL` ou `APP_DATA_DIR` não estiverem disponíveis.


**Acesso remoto em desenvolvimento**

Para testes somente na rede local, o Vite pode ser acessado em
`http://<IP_DA_MAQUINA>:3000/` e a API em
`http://<IP_DA_MAQUINA>:3001/api/health`. Não encaminhe essas portas para a
internet. Em produção, use exclusivamente o fluxo Docker HTTPS acima; somente
as portas TCP 80 e 443 do Caddy devem estar publicadas.

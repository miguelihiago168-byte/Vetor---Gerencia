Guia de Instalação — Gestão de Obras - Vetor

Pré-requisitos

- Node.js 18.20.4
- npm 10.8.2
- Docker Desktop/Engine ativo
- Docker Compose (comando `docker compose`)
- Git (opcional)
- Windows (testado) ou Linux/macOS

Versões fixadas do projeto

- Backend: dependências fixadas em `backend/package.json` (sem `^`)
- Frontend: dependências fixadas em `frontend/package.json` (sem `^`)
- Instalação determinística: use `npm ci` (respeita `package-lock.json`)

1. Clone do repositório

```bash
git clone <repo> gestao-obras-vetor
cd gestao-obras-vetor
```

2. Variáveis de ambiente

- Na raiz:

```bash
cp .env.example .env
```

- Defina principalmente:
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `PGADMIN_DEFAULT_EMAIL`
  - `PGADMIN_DEFAULT_PASSWORD`

- No backend:

```bash
cp backend/.env.example backend/.env
```

- Garanta:
  - `DB_HOST=postgres`
  - `DB_NAME` igual a `POSTGRES_DB`
  - `DB_USER` igual a `POSTGRES_USER`
  - `DB_PASSWORD` igual a `POSTGRES_PASSWORD`

3. Verificar Docker ativo

```bash
docker info
docker compose version
```

4. Subir PostgreSQL antes da aplicação

```bash
docker compose up -d postgres
```

5. Inicializar banco e aplicar migrations

```bash
docker compose build backend
docker compose run --rm backend npm run db:init
docker compose run --rm -e MIGRATIONS_ALLOW_PRODUCTION=true backend npm run db:migrate
docker compose run --rm backend npm run db:check
```

6. Subir stack completa

```bash
docker compose up -d
docker compose ps
```

Acessos

- Aplicação: https://localhost/
- Backend (health): https://localhost/api/health
- pgAdmin: http://127.0.0.1:5050

6. Build de produção do frontend

```powershell
cd frontend
npm run build
# arquivos gerados em frontend/dist
```

7. Executando em produção com PM2 (opcional)

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

- O backend usa PostgreSQL via Docker.
- Credenciais padrão iniciais da aplicação (após `db:init`): Login `000001` / Senha `123456`.

Se quiser, eu posso gerar um `docker-compose.yml` para rodar backend + frontend em containers.

Docker com HTTPS automático (produção)

O Docker Compose publica somente o Caddy nas portas TCP 80 e 443. Ele obtém e
renova automaticamente o certificado Let's Encrypt; o frontend, API e Socket.IO
ficam na rede interna Docker.

1. No DNS, crie o registro A/AAAA de `vetor.damjam.com.br` apontando para o IP
   do servidor Linux. Libere e, se necessário, encaminhe as portas TCP 80 e 443
   para esse servidor. Nenhum outro serviço pode ocupar essas portas.

2. Copie `.env.example` para `.env` na raiz do projeto e preencha:

```dotenv
APP_DOMAIN=vetor.damjam.com.br
LETSENCRYPT_EMAIL=admin@damjam.com.br
APP_DATA_DIR=/srv/gestao-obras-vetor
```

`APP_DOMAIN` deve conter somente o domínio, sem `http://` ou `https://`.

3. Mantenha as credenciais do backend em `backend/.env` (use
   `backend/.env.production.example` como referência) e inicie uma única vez:

```bash
docker compose up -d --build
```

4. Verifique a emissão e o acesso:

```bash
docker compose logs -f caddy
curl -I http://vetor.damjam.com.br
curl https://vetor.damjam.com.br/api/health
curl -I https://vetor.damjam.com.br/pgadmin/
```

O primeiro comando `curl` deve redirecionar para HTTPS. Certificados e dados
ACME ficam nos volumes `caddy_data` e `caddy_config`, preservados em recriações
normais dos containers.

O pgAdmin é publicado somente em `https://vetor.damjam.com.br/pgadmin/`, com
login próprio e cookie de sessão marcado como seguro. O Caddy remove o prefixo
internamente e informa o caminho ao pgAdmin, preservando links e redirecionamentos
em HTTPS. A porta `5050` fica restrita ao loopback do servidor para suporte local
e não deve ser liberada no firewall. Não exponha a porta do PostgreSQL na internet.

### Deploy automático pelo GitHub Actions

O workflow **Deploy para GitHub Pages** publica o frontend estático a cada push
na branch `main`. Antes do primeiro deploy, em **GitHub → Settings → Pages**,
selecione **GitHub Actions** como fonte de publicação.

Após o push, acompanhe **GitHub → Actions → Deploy para GitHub Pages**. A etapa
final mostra a URL publicada.

O GitHub Pages não hospeda a API, o banco de dados ou uploads. Para recursos
que dependem deles, configure uma API externa e os respectivos CORS e URLs de
acesso.

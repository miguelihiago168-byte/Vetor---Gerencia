Guia de Instalação — Gestão de Obras - Vetor

Pré-requisitos
- Node.js (>= 18) e npm
- Git (opcional)
- Windows (testado) ou Linux/macOS

1) Clone do repositório
```bash
git clone <repo> gestao-obras-vetor
cd gestao-obras-vetor
```

2) Instalar dependências
- Backend
```powershell
cd backend
npm install
```
- Frontend
```powershell
cd ../frontend
npm install
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
- Frontend: http://localhost:5173/
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
- Problemas com dependências: delete `node_modules` e rode `npm install` novamente.
- Se o frontend não carregar, confirme se o dev server (Vite) está ativo e acessível na porta 5173.

Observações
- O backend usa SQLite por padrão; arquivo de banco fica em `backend/database/gestao_obras.db`.
- Credenciais padrão para testes: Login `000001` / Senha `123456` (somente ambiente de desenvolvimento).

Se quiser, eu posso gerar um `docker-compose.yml` para rodar backend + frontend em containers.

Docker (opção recomendada para disponibilizar em produção/servidores)
- Para rodar com Docker e Nginx (frontend estático + proxy para `/api`):

1) Pré-requisitos: instale `docker` e `docker-compose`.

2) Construir e subir os serviços (no diretório raiz do projeto):
```bash
docker compose build
docker compose up -d
```

3) Acesse via `http://<IP_DA_MAQUINA>/` (porta 80) — o Nginx do container serve o frontend e encaminha `/api` para o backend.

4) Volumes:
- `backend/uploads` e `backend/database` são montados no container do backend para persistência.

Expor pela Internet
- Configure port forwarding no roteador para a porta 80 (HTTP) para a máquina que executa o Docker.
- Para segurança, use um proxy reverso com TLS (Let's Encrypt) ou um serviço de túnel (`ngrok`, `cloudflared`) para evitar abrir portas diretamente.

Exemplo rápido com `ngrok` (teste):
```bash
# suposição: ngrok instalado e você tem uma conta conectada
ngrok http 80
# ngrok irá criar um domínio público https://xxxx.ngrok.io apontando para seu localhost:80
```


**Acesso remoto**
- Para permitir que outras pessoas na sua rede (ou pela internet) acessem a instância, faça o seguinte:
	- Backend: defina no arquivo `.env` ou na variável de ambiente `HOST=0.0.0.0` (padrão agora) e `PORT=3001` se desejar porta diferente.
	- Frontend (desenvolvimento): o script `npm run dev` já foi atualizado para expor o Vite em `0.0.0.0` na porta `5173`.
	- Abra/encaminhe as portas no firewall/roteador:
		- Na rede local, abra a porta TCP `3001` (backend) e `5173` (frontend) no host Windows/Linux.
		- Para acesso pela Internet, configure port forwarding no seu roteador para o IP da máquina que executa o app.
	- Alternativa segura para exposição pública: use um proxy reverso (NGINX) com HTTPS, ou uma ferramenta de túnel como `ngrok`/`cloudflared`.
	- Verificação: após iniciar os servidores, acesse `http://<IP_DA_MAQUINA>:5173/` (frontend) e `http://<IP_DA_MAQUINA>:3001/api/health` (backend).
	- Segurança: se for disponibilizar pela Internet, proteja o backend com HTTPS/Firewall, troque `JWT_SECRET` e não deixe credenciais padrão em produção.

Se quiser, eu posso gerar um `docker-compose.yml` e um `nginx` básico para colocar em produção.

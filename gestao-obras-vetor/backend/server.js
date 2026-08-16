require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { spawnSync } = require('child_process');
const { Server } = require('socket.io');
const { carregarPerfilUsuario } = require('./middleware/rbac');
const { ensureTenantDatabase, runWithTenantContext, getQuery } = require('./config/database');
const { setMensageriaBroadcaster } = require('./services/mensageriaRealtime');

if (process.env.NODE_ENV === 'production') {
  process.env.DISABLE_STARTUP_SCHEMA_MUTATIONS = 'true';
}

const app = express();
// A aplicação recebe requisições por Caddy e Nginx; assim req.ip preserva o IP do visitante.
app.set('trust proxy', 2);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploads sao servidos apenas por rota autenticada em /api/uploads.
const uploadsPath = path.join(__dirname, 'uploads');
try { if (!require('fs').existsSync(uploadsPath)) require('fs').mkdirSync(uploadsPath, { recursive: true }); } catch (e) {}

// Rotas
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const projetosRoutes = require('./routes/projetos');
const eapRoutes = require('./routes/eap');
const rdosRoutes = require('./routes/rdos');
const rdoOccurrencesRoutes = require('./routes/rdo_occurrences');
const anexosRoutes = require('./routes/anexos');
const maoObraRoutes = require('./routes/mao_obra');
const rdoRelatedRoutes = require('./routes/rdo_related');
const rastreabilidadeRoutes = require('./routes/rastreabilidade');
const dashboardRoutes = require('./routes/dashboard');
const rncRoutes = require('./routes/rnc');
const pedidosCompraRoutes = require('./routes/pedidos_compra');
const requisicoesRoutes = require('./routes/requisicoes');
const fornecedoresRoutes = require('./routes/fornecedores');
// FINANCEIRO DESATIVADO
// const financeiroRoutes = require('./routes/financeiro');
const notificacoesRoutes = require('./routes/notificacoes');
const almoxarifadoRoutes = require('./routes/almoxarifado');
const emailRoutes = require('./routes/email');
const mensagensRoutes = require('./routes/mensagens');
const uploadsRoutes = require('./routes/uploads');
const oauthRoutes = require('./routes/oauth');
const serviceAuthRoutes = require('./routes/service_auth');
const transferenciasRoutes = require('./routes/transferencias');
const contatoRoutes = require('./routes/contato');
// Startup nao executa migrations automaticas. Use npm run migrate/status antes de subir a aplicacao.
console.log('[startup-db-guard] Migrations automaticas de startup desativadas.');

app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/auth/service', serviceAuthRoutes);
app.use('/api/contato', contatoRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/projetos', projetosRoutes);
app.use('/api/eap', eapRoutes);
app.use('/api/rdos', rdoOccurrencesRoutes);
app.use('/api/rdos', rdosRoutes);
app.use('/api/anexos', anexosRoutes);
app.use('/api/mao_obra', maoObraRoutes);
app.use('/api/rdo', rdoRelatedRoutes);
app.use('/api/rastreabilidade', rastreabilidadeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rnc', rncRoutes);
app.use('/api/pedidos-compra', pedidosCompraRoutes);
app.use('/api/requisicoes', requisicoesRoutes);
app.use('/api/fornecedores', fornecedoresRoutes);
app.use('/api/transferencias', transferenciasRoutes);
// FINANCEIRO DESATIVADO
// app.use('/api/financeiro', financeiroRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/almoxarifado', almoxarifadoRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/mensagens', mensagensRoutes);
app.use('/api/uploads', uploadsRoutes);

const createRealtimeServer = (server) => {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const headerToken = socket.handshake.auth?.token
        || String(socket.handshake.headers?.authorization || '').replace('Bearer ', '');

      if (!headerToken) return next(new Error('Token ausente.'));

      const decoded = jwt.verify(headerToken, process.env.JWT_SECRET);
      const usuarioAtual = await carregarPerfilUsuario(decoded.id);
      if (!usuarioAtual) return next(new Error('Usuário inválido.'));

      const tokenTenantIds = Array.isArray(decoded.tenant_ids)
        ? decoded.tenant_ids.map((t) => Number(t)).filter(Boolean)
        : [];
      const tenantId = Number(decoded.tenant_id || tokenTenantIds[0]);

      if (!tenantId) return next(new Error('Tenant inválido.'));
      if (tokenTenantIds.length > 0 && !tokenTenantIds.includes(tenantId)) {
        return next(new Error('Tenant fora do escopo do usuário.'));
      }

      const tenant = await ensureTenantDatabase(tenantId);
      const membership = await getQuery(
        'SELECT 1 FROM usuario_tenants WHERE usuario_id = ? AND tenant_id = ? AND ativo = 1',
        [usuarioAtual.id, tenantId]
      );
      if (!membership || !tenant.grupo_id) return next(new Error('Tenant fora do escopo do usuário.'));

      socket.data.usuario = {
        id: Number(usuarioAtual.id),
        nome: usuarioAtual.nome,
        tenantId,
        grupoId: Number(tenant.grupo_id),
        perfil: usuarioAtual.perfil,
      };

      return next();
    } catch (error) {
      return next(new Error('Falha na autenticação do socket.'));
    }
  });

  io.on('connection', (socket) => {
    const { tenantId, grupoId, perfil, id: usuarioId } = socket.data.usuario;
    socket.join(`tenant:${tenantId}`);
    socket.join(`tenant:${tenantId}:user:${usuarioId}`);

    socket.on('mensagens:join-conversa', async ({ conversaId }) => {
      const id = Number(conversaId);
      if (!id) return;

      try {
        await runWithTenantContext(tenantId, async () => {
          const conversa = await getQuery(
            `SELECT id
             FROM mensagem_conversas
             WHERE id = ?
               AND tenant_id = ?
               AND (usuario_a_id = ? OR usuario_b_id = ?)
             LIMIT 1`,
            [id, tenantId, usuarioId, usuarioId]
          );

          if (conversa) socket.join(`tenant:${tenantId}:conversa:${id}`);
        }, { userId: usuarioId, groupId: grupoId, role: perfil });
      } catch (_) {
        // ignora join inválido
      }
    });

    socket.on('mensagens:leave-conversa', ({ conversaId }) => {
      const id = Number(conversaId);
      if (!id) return;
      socket.leave(`tenant:${tenantId}:conversa:${id}`);
    });
  });

  setMensageriaBroadcaster((eventName, event) => {
    const tenantId = Number(event?.tenantId);
    if (!tenantId) return;

    const targetUsers = Array.isArray(event.targetUserIds)
      ? event.targetUserIds.map((u) => Number(u)).filter(Boolean)
      : [];

    if (targetUsers.length === 0) {
      io.to(`tenant:${tenantId}`).emit(eventName, event.payload);
      return;
    }

    targetUsers.forEach((userId) => {
      io.to(`tenant:${tenantId}:user:${userId}`).emit(eventName, event.payload);
    });

    const conversaId = Number(event?.conversaId);
    if (conversaId) {
      io.to(`tenant:${tenantId}:conversa:${conversaId}`).emit(eventName, event.payload);
    }
  });

  return io;
};

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    mensagem: 'Gestão de Obras - Vetor API',
    versao: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(err.status || 500).json({
    erro: err.message || 'Erro interno do servidor.'
  });
});

// Rota 404
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

const PORT = parseInt(process.env.PORT || '3001', 10);

const validateProductionMigrations = () => {
  if (process.env.NODE_ENV !== 'production') return;

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'scripts', 'runMigrations.js'), '--status'],
    {
      cwd: __dirname,
      env: process.env,
      encoding: 'utf8'
    }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    console.error('[startup-db-guard] Migrations pendentes ou schema invalido. Execute npm run db:migrate antes de iniciar.');
    process.exit(1);
  }
};

// Função de inicialização com tentativas em caso de EADDRINUSE
const startServer = (maxAttempts = 10) => {
  let attempt = 0;

  const tryListen = () => {
    attempt += 1;
    const server = http.createServer(app);
    createRealtimeServer(server);

    server.listen(PORT, () => {
      console.log(`\nServidor inicializado na porta ${PORT}`);
      console.log(`Acesse http://localhost:${PORT}/api/health`);
      console.log(`Socket.IO ativo em ws://localhost:${PORT}`);
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(`Tentativa ${attempt}: Porta ${PORT} está em uso.`);
        try {
          const { execSync } = require('child_process');
          const list = execSync(`netstat -ano | findstr ":${PORT}"`).toString();
          console.error('Processos escutando na porta:', list);
        } catch (e) {
          // ignore
        }

        if (attempt < maxAttempts) {
          const delay = Math.min(5000 * attempt, 30000); // backoff
          console.log(`Aguardando ${delay}ms antes de nova tentativa...`);
          setTimeout(tryListen, delay);
        } else {
          console.error(`Não foi possível iniciar o servidor na porta ${PORT} após ${maxAttempts} tentativas.`);
          // sair com código 1 para feedback do gerenciador de processos
          process.exit(1);
        }
      } else {
        console.error('Erro no servidor:', err);
        process.exit(1);
      }
    });
  };

  tryListen();
};

// Inicia com até 10 tentativas (padrão)
validateProductionMigrations();
startServer(10);

// Global handlers para evitar que exceções não tratadas deixem o processo em estado inconsistente
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

module.exports = app;

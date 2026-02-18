require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos enviados (uploads)
const uploadsPath = path.join(__dirname, 'uploads');
try { if (!require('fs').existsSync(uploadsPath)) require('fs').mkdirSync(uploadsPath, { recursive: true }); } catch (e) {}
app.use('/uploads', express.static(uploadsPath));

// Rotas
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const projetosRoutes = require('./routes/projetos');
const eapRoutes = require('./routes/eap');
const rdosRoutes = require('./routes/rdos');
const anexosRoutes = require('./routes/anexos');
const maoObraRoutes = require('./routes/mao_obra');
const rdoRelatedRoutes = require('./routes/rdo_related');
const dashboardRoutes = require('./routes/dashboard');
const rncRoutes = require('./routes/rnc');
const pedidosCompraRoutes = require('./routes/pedidos_compra');

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/projetos', projetosRoutes);
app.use('/api/eap', eapRoutes);
app.use('/api/rdos', rdosRoutes);
app.use('/api/anexos', anexosRoutes);
app.use('/api/mao_obra', maoObraRoutes);
app.use('/api/rdo', rdoRelatedRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rnc', rncRoutes);
app.use('/api/pedidos-compra', pedidosCompraRoutes);

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

// Função de inicialização com tentativas em caso de EADDRINUSE
const startServer = (maxAttempts = 10) => {
  let attempt = 0;

  const tryListen = () => {
    attempt += 1;
    const server = app.listen(PORT, () => {
      console.log(`\nServidor inicializado na porta ${PORT}`);
      console.log(`Acesse http://localhost:${PORT}/api/health`);
      console.log('Credenciais padrão: Login: 000001 Senha: 123456');
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

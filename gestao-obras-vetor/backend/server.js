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
const requisicoesRoutes = require('./routes/requisicoes');
const fornecedoresRoutes = require('./routes/fornecedores');
// FINANCEIRO DESATIVADO
// const financeiroRoutes = require('./routes/financeiro');
const notificacoesRoutes = require('./routes/notificacoes');
const almoxarifadoRoutes = require('./routes/almoxarifado');
const emailRoutes = require('./routes/email');
// Garantir esquema de notificações e índice único para evitar duplicidades
try {
  const { db } = require('./config/database');
  const { ensureMultitenancySchema } = require('./scripts/migrate_multitenancy');
  const { ensureRdoLogsSchema } = require('./scripts/migrate_add_rdo_logs');
  const migrateAddRequisicoes = require('./scripts/migrate_add_requisicoes');
  const { migrateAddCotacaoFields } = require('./scripts/migrate_add_cotacao_fields');

  const runDb = (sql) => new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const ensureColumn = async (table, columnName, columnSql) => {
    try {
      await runDb(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (!msg.includes('duplicate column')) throw err;
    }
  };

  ensureMultitenancySchema().catch((e) => {
    console.warn('Aviso: não foi possível aplicar schema de multitenancy:', e?.message || e);
  });

  ensureRdoLogsSchema().catch((e) => {
    console.warn('Aviso: não foi possível aplicar schema de rdo_logs:', e?.message || e);
  });

  // Garantir colunas de RDO esperadas pelas rotas atuais
  ensureColumn('rdos', 'mao_obra_detalhada', 'mao_obra_detalhada TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rdos.mao_obra_detalhada:', e?.message || e);
  });
  ensureColumn('rdos', 'atividades_avulsas', 'atividades_avulsas TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rdos.atividades_avulsas:', e?.message || e);
  });

  // Garantir colunas extras de RNC usadas pela API
  ensureColumn('rnc', 'descricao_correcao', 'descricao_correcao TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rnc.descricao_correcao:', e?.message || e);
  });
  ensureColumn('rnc', 'descricao_correcao_em', 'descricao_correcao_em DATETIME').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rnc.descricao_correcao_em:', e?.message || e);
  });
  ensureColumn('rnc', 'data_prevista_encerramento', 'data_prevista_encerramento DATE').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rnc.data_prevista_encerramento:', e?.message || e);
  });
  ensureColumn('rnc', 'origem', 'origem TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rnc.origem:', e?.message || e);
  });
  ensureColumn('rnc', 'area_afetada', 'area_afetada TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rnc.area_afetada:', e?.message || e);
  });
  ensureColumn('rnc', 'norma_referencia', 'norma_referencia TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rnc.norma_referencia:', e?.message || e);
  });
  ensureColumn('rnc', 'registros_fotograficos', 'registros_fotograficos TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna rnc.registros_fotograficos:', e?.message || e);
  });

  // Garantir tabelas do módulo de requisições/compras multi-itens
  migrateAddRequisicoes().catch((e) => {
    console.warn('Aviso: não foi possível aplicar schema de requisições:', e?.message || e);
  });

  // Garantir schema de cotações com fornecedor_id nullable (nome livre)
  migrateAddCotacaoFields().catch((e) => {
    console.warn('Aviso: não foi possível aplicar schema de cotações:', e?.message || e);
  });

  // Garantir colunas novas em requisicao_cotacoes para compatibilidade das consultas
  ensureColumn('requisicao_cotacoes', 'fornecedor_nome', 'fornecedor_nome TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna requisicao_cotacoes.fornecedor_nome:', e?.message || e);
  });
  ensureColumn('requisicao_cotacoes', 'cnpj', 'cnpj TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna requisicao_cotacoes.cnpj:', e?.message || e);
  });
  ensureColumn('requisicao_cotacoes', 'telefone', 'telefone TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna requisicao_cotacoes.telefone:', e?.message || e);
  });
  ensureColumn('requisicao_cotacoes', 'email', 'email TEXT').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna requisicao_cotacoes.email:', e?.message || e);
  });
  ensureColumn('requisicao_cotacoes', 'frete', 'frete REAL DEFAULT 0').catch((e) => {
    console.warn('Aviso: não foi possível garantir coluna requisicao_cotacoes.frete:', e?.message || e);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      referencia_tipo TEXT,
      referencia_id INTEGER,
      lido INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_unique
    ON notificacoes (usuario_id, tipo, referencia_tipo, referencia_id)
  `);
  // Migration: campos de auditoria de alteração de quantidade em requisicao_itens
  db.run('ALTER TABLE requisicao_itens ADD COLUMN quantidade_original REAL', () => {});
  db.run('ALTER TABLE requisicao_itens ADD COLUMN alterado_em DATETIME', () => {});
  db.run('ALTER TABLE requisicao_itens ADD COLUMN alterado_por_nome TEXT', () => {});
} catch (e) {
  console.warn('Aviso: não foi possível garantir índice único de notificações:', e?.message || e);
}

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
app.use('/api/requisicoes', requisicoesRoutes);
app.use('/api/fornecedores', fornecedoresRoutes);
// FINANCEIRO DESATIVADO
// app.use('/api/financeiro', financeiroRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/almoxarifado', almoxarifadoRoutes);
app.use('/api/email', emailRoutes);

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

      // Recalcular EAP ao iniciar para corrigir eventuais inconsistências
      const path = require('path');
      try {
        const { recalcularTodasAtividades } = require('./scripts/recalcular_eap_startup');
        recalcularTodasAtividades().catch(e => console.warn('Aviso: falha no recálculo EAP inicial:', e?.message));
      } catch (e) {
        // se o módulo não existir, ignora silenciosamente
      }
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

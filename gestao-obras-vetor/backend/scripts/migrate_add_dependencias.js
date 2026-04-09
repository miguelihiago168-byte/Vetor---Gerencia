const { db } = require('../config/database');

const migrateDependencias = async () => {
  console.log('Iniciando migração: Adicionando suporte a Dependências entre atividades EAP...');

  try {
    // Criar tabela atividades_dependencias
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS atividades_dependencias (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL,
          tenant_id INTEGER,
          atividade_origem_id INTEGER NOT NULL,
          atividade_destino_id INTEGER NOT NULL,
          tipo_vinculo TEXT DEFAULT 'FS' CHECK(tipo_vinculo IN ('FS', 'FF', 'SS')),
          sugerida_por_sistema INTEGER DEFAULT 1,
          confirmada_usuario INTEGER DEFAULT 0,
          score_sugestao REAL,
          motivo_sugestao TEXT,
          criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          confirmada_em DATETIME,
          confirmada_por INTEGER,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (atividade_origem_id) REFERENCES atividades_eap(id) ON DELETE CASCADE,
          FOREIGN KEY (atividade_destino_id) REFERENCES atividades_eap(id) ON DELETE CASCADE,
          FOREIGN KEY (confirmada_por) REFERENCES usuarios(id),
          UNIQUE(atividade_origem_id, atividade_destino_id)
        )
      `, (err) => {
        if (err) {
          console.error('Erro ao criar tabela atividades_dependencias:', err);
          reject(err);
        } else {
          console.log('✓ Tabela atividades_dependencias criada');
          resolve();
        }
      });
    });

    // Criar índices para performance
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_dependencias_projeto 
        ON atividades_dependencias(projeto_id, confirmada_usuario)
      `, (err) => {
        if (err) {
          console.error('Erro ao criar índice idx_dependencias_projeto:', err);
          reject(err);
        } else {
          console.log('✓ Índice idx_dependencias_projeto criado');
          resolve();
        }
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_dependencias_origem 
        ON atividades_dependencias(atividade_origem_id)
      `, (err) => {
        if (err) {
          console.error('Erro ao criar índice idx_dependencias_origem:', err);
          reject(err);
        } else {
          console.log('✓ Índice idx_dependencias_origem criado');
          resolve();
        }
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_dependencias_destino 
        ON atividades_dependencias(atividade_destino_id)
      `, (err) => {
        if (err) {
          console.error('Erro ao criar índice idx_dependencias_destino:', err);
          reject(err);
        } else {
          console.log('✓ Índice idx_dependencias_destino criado');
          resolve();
        }
      });
    });

    console.log('\n✅ Migração de Dependências concluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante migração:', error);
    throw error;
  }
};

// Executar migração se for chamada diretamente
if (require.main === module) {
  migrateDependencias()
    .then(() => {
      console.log('Migração completada!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Erro na migração:', error);
      process.exit(1);
    });
}

module.exports = migrateDependencias;

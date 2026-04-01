const { db, allQuery, runQuery } = require('../config/database');

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rdo_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rdo_id INTEGER NOT NULL,
    usuario_id INTEGER,
    acao TEXT NOT NULL CHECK (acao IN ('VIEW', 'UPDATE')),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  )
`;

const createIndexes = async () => {
  await runQuery('CREATE INDEX IF NOT EXISTS idx_rdo_logs_rdo_id ON rdo_logs(rdo_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_rdo_logs_usuario_id ON rdo_logs(usuario_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_rdo_logs_acao ON rdo_logs(acao)');
};

const normalizeAction = (value) => {
  const action = String(value || '').toUpperCase();
  return action === 'VIEW' ? 'VIEW' : 'UPDATE';
};

const ensureRdoLogsSchema = async () => {
  const columns = await allQuery('PRAGMA table_info(rdo_logs)');

  if (!Array.isArray(columns) || columns.length === 0) {
    await runQuery(TABLE_SQL);
    await createIndexes();
    return { migrated: false, created: true };
  }

  const columnNames = columns.map((column) => column.name);
  const isCompatible =
    columnNames.includes('id') &&
    columnNames.includes('rdo_id') &&
    columnNames.includes('usuario_id') &&
    columnNames.includes('acao') &&
    columnNames.includes('criado_em');

  if (isCompatible) {
    await createIndexes();
    return { migrated: false, created: false };
  }

  const legacyTable = `rdo_logs_legacy_${Date.now()}`;

  await runQuery('BEGIN TRANSACTION');

  try {
    await runQuery(`ALTER TABLE rdo_logs RENAME TO ${legacyTable}`);
    await runQuery(TABLE_SQL);

    const legacyRows = await allQuery(`SELECT * FROM ${legacyTable}`);
    for (const row of legacyRows) {
      await runQuery(
        `
          INSERT INTO rdo_logs (id, rdo_id, usuario_id, acao, criado_em)
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          row.id,
          row.rdo_id,
          row.usuario_id ?? null,
          normalizeAction(row.acao ?? row.tipo),
          row.criado_em ?? row.timestamp ?? new Date().toISOString()
        ]
      );
    }

    await createIndexes();
    await runQuery(`DROP TABLE ${legacyTable}`);
    await runQuery('COMMIT');
    return { migrated: true, created: false };
  } catch (error) {
    await runQuery('ROLLBACK').catch(() => {});
    throw error;
  }
};

const migrateAddRdoLogs = async () => {
  console.log('Iniciando migração: adicionando tabela rdo_logs...');

  try {
    const result = await ensureRdoLogsSchema();
    if (result.created) {
      console.log('✓ Tabela rdo_logs criada');
    } else if (result.migrated) {
      console.log('✓ Tabela rdo_logs migrada para o schema atual');
    } else {
      console.log('✓ Tabela rdo_logs já estava compatível');
    }

    console.log('✓ Índices de rdo_logs garantidos');
    console.log('\n✅ Migração rdo_logs concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  }
};

if (require.main === module) {
  migrateAddRdoLogs()
    .catch(() => {
      process.exitCode = 1;
    })
    .finally(() => {
      db.close();
    });
}

module.exports = { migrateAddRdoLogs, ensureRdoLogsSchema };
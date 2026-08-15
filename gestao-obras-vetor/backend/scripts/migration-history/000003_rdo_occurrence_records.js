const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const columnExists = async ({ all }, table, column) => {
  const columns = await all(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return columns.some((item) => String(item.name) === column);
};

const addColumn = async (context, table, definition) => {
  const name = String(definition).trim().split(/\s+/)[0];
  if (!(await columnExists(context, table, name))) {
    await context.run(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${definition}`);
  }
};

module.exports = {
  id: '000003_rdo_occurrence_records',
  description: 'Evolui ocorrencias do RDO para registros operacionais detalhados',
  async up(context) {
    const { run } = context;

    await addColumn(context, 'rdos', 'sem_ocorrencias INTEGER');

    // Mantem titulo/descricao/gravidade para compatibilidade com clientes antigos.
    for (const definition of [
      'numero INTEGER',
      "categoria TEXT DEFAULT 'Outra'",
      'categoria_outra TEXT',
      'data_ocorrencia DATE',
      'hora_inicio TEXT',
      'hora_fim TEXT',
      'em_andamento INTEGER DEFAULT 0',
      'local_frente TEXT',
      'atividade_eap_id INTEGER',
      'envolvidos TEXT',
      'descricao_detalhada TEXT',
      'providencia_imediata TEXT',
      'recomendacao TEXT',
      'paralisacao INTEGER DEFAULT 0',
      'trabalhadores_afetados INTEGER DEFAULT 0',
      'impacto_cronograma TEXT',
      'atualizado_por INTEGER',
      'atualizado_em DATETIME'
    ]) await addColumn(context, 'rdo_ocorrencias', definition);

    await run(`
      CREATE TABLE IF NOT EXISTS rdo_ocorrencia_impactos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ocorrencia_id INTEGER NOT NULL,
        impacto TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ocorrencia_id, impacto)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_ocorrencia_evidencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ocorrencia_id INTEGER NOT NULL,
        anexo_id INTEGER,
        rdo_foto_id INTEGER,
        legenda TEXT,
        momento TEXT DEFAULT 'durante',
        atividade_eap_id INTEGER,
        criado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (anexo_id IS NOT NULL OR rdo_foto_id IS NOT NULL)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_ocorrencia_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ocorrencia_id INTEGER NOT NULL,
        usuario_id INTEGER,
        acao TEXT NOT NULL,
        antes TEXT,
        depois TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_rdo_ocorrencias_numero ON rdo_ocorrencias(rdo_id, numero) WHERE numero IS NOT NULL');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_ocorrencias_atividade ON rdo_ocorrencias(atividade_eap_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_ocorrencia_impactos_ocorrencia ON rdo_ocorrencia_impactos(ocorrencia_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_ocorrencia_evidencias_ocorrencia ON rdo_ocorrencia_evidencias(ocorrencia_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_ocorrencia_historico_ocorrencia ON rdo_ocorrencia_historico(ocorrencia_id, criado_em)');

    // Registros legados viram ocorrencias "Outra" no dia do RDO, preservando a gravidade e texto.
    await run(`
      UPDATE rdo_ocorrencias
      SET numero = (
            SELECT COUNT(*) FROM rdo_ocorrencias anterior
            WHERE anterior.rdo_id = rdo_ocorrencias.rdo_id
              AND (anterior.criado_em < rdo_ocorrencias.criado_em
                   OR (anterior.criado_em = rdo_ocorrencias.criado_em AND anterior.id <= rdo_ocorrencias.id))
          ),
          categoria = COALESCE(NULLIF(TRIM(categoria), ''), 'Outra'),
          categoria_outra = CASE WHEN categoria_outra IS NULL OR TRIM(categoria_outra) = '' THEN COALESCE(titulo, 'Registro legado') ELSE categoria_outra END,
          data_ocorrencia = COALESCE(data_ocorrencia, (SELECT data_relatorio FROM rdos WHERE rdos.id = rdo_ocorrencias.rdo_id)),
          descricao_detalhada = COALESCE(NULLIF(descricao_detalhada, ''), descricao),
          gravidade = COALESCE(NULLIF(gravidade, ''), 'Baixa'),
          trabalhadores_afetados = COALESCE(trabalhadores_afetados, 0),
          em_andamento = COALESCE(em_andamento, 0),
          paralisacao = COALESCE(paralisacao, 0)
      WHERE numero IS NULL OR categoria IS NULL OR data_ocorrencia IS NULL OR descricao_detalhada IS NULL
    `);

    // Texto antigo do campo rdos.ocorrencias vira um registro se ainda nao existir ocorrencia estruturada.
    await run(`
      INSERT INTO rdo_ocorrencias (
        rdo_id, numero, titulo, descricao, descricao_detalhada, gravidade, categoria,
        categoria_outra, data_ocorrencia, criado_por, criado_em, trabalhadores_afetados, em_andamento, paralisacao
      )
      SELECT r.id, 1, 'Registro legado', r.ocorrencias, r.ocorrencias, 'Baixa', 'Outra',
             'Texto legado do RDO', r.data_relatorio, r.criado_por, COALESCE(r.criado_em, CURRENT_TIMESTAMP), 0, 0, 0
      FROM rdos r
      WHERE TRIM(COALESCE(r.ocorrencias, '')) <> ''
        AND NOT EXISTS (SELECT 1 FROM rdo_ocorrencias ro WHERE ro.rdo_id = r.id)
    `);
  }
};

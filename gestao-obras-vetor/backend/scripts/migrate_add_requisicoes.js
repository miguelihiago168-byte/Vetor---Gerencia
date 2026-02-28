/**
 * Migração: Módulo de Compras — Requisições Multi-itens
 * Cria tabelas: fornecedores, requisicoes, requisicao_itens,
 *               requisicao_cotacoes, requisicao_historico
 */
const { runQuery } = require('../config/database');

const run = async () => {
  console.log('[migrate_add_requisicoes] Iniciando migração...');

  // ─── Fornecedores ─────────────────────────────────────────────────────────
  await runQuery(`
    CREATE TABLE IF NOT EXISTS fornecedores (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      razao_social    TEXT NOT NULL,
      nome_fantasia   TEXT,
      cnpj            TEXT,
      telefone        TEXT,
      email           TEXT,
      observacao      TEXT,
      ativo           INTEGER DEFAULT 1,
      criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ─── Requisições ──────────────────────────────────────────────────────────
  await runQuery(`
    CREATE TABLE IF NOT EXISTS requisicoes (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_requisicao   TEXT NOT NULL UNIQUE,
      projeto_id          INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
      solicitante_id      INTEGER NOT NULL REFERENCES usuarios(id),
      centro_custo        TEXT,
      tipo_material       TEXT NOT NULL,
      urgencia            TEXT NOT NULL DEFAULT 'Normal',
      observacao_geral    TEXT,
      status_requisicao   TEXT NOT NULL DEFAULT 'Em análise',
      criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ─── Itens da Requisição ───────────────────────────────────────────────────
  await runQuery(`
    CREATE TABLE IF NOT EXISTS requisicao_itens (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      requisicao_id           INTEGER NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
      descricao               TEXT NOT NULL,
      quantidade              REAL NOT NULL,
      unidade                 TEXT,
      especificacao_tecnica   TEXT,
      justificativa           TEXT,
      foto_url                TEXT,
      aprovado_para_cotacao   INTEGER,
      motivo_reprovacao       TEXT,
      status_item             TEXT NOT NULL DEFAULT 'Aguardando análise',
      impacto_cronograma      INTEGER DEFAULT 0,
      impacto_seguranca       INTEGER DEFAULT 0,
      impacto_qualidade       INTEGER DEFAULT 0,
      criado_em               DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em           DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ─── Cotações por Item ─────────────────────────────────────────────────────
  await runQuery(`
    CREATE TABLE IF NOT EXISTS requisicao_cotacoes (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id             INTEGER NOT NULL REFERENCES requisicao_itens(id) ON DELETE CASCADE,
      fornecedor_id       INTEGER NOT NULL REFERENCES fornecedores(id),
      valor_unitario      REAL NOT NULL,
      prazo_entrega       TEXT,
      condicao_pagamento  TEXT,
      observacao          TEXT,
      selecionada         INTEGER DEFAULT 0,
      criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ─── Histórico / Auditoria ────────────────────────────────────────────────
  await runQuery(`
    CREATE TABLE IF NOT EXISTS requisicao_historico (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      requisicao_id    INTEGER NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
      item_id          INTEGER REFERENCES requisicao_itens(id) ON DELETE SET NULL,
      usuario_id       INTEGER REFERENCES usuarios(id),
      tipo_evento      TEXT NOT NULL,
      status_anterior  TEXT,
      status_novo      TEXT,
      detalhes         TEXT,
      criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ─── Índices ───────────────────────────────────────────────────────────────
  const indices = [
    `CREATE INDEX IF NOT EXISTS idx_req_projeto   ON requisicoes(projeto_id)`,
    `CREATE INDEX IF NOT EXISTS idx_req_status    ON requisicoes(status_requisicao)`,
    `CREATE INDEX IF NOT EXISTS idx_req_tipo      ON requisicoes(tipo_material)`,
    `CREATE INDEX IF NOT EXISTS idx_item_req      ON requisicao_itens(requisicao_id)`,
    `CREATE INDEX IF NOT EXISTS idx_item_status   ON requisicao_itens(status_item)`,
    `CREATE INDEX IF NOT EXISTS idx_cot_item      ON requisicao_cotacoes(item_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hist_req      ON requisicao_historico(requisicao_id)`,
  ];
  for (const sql of indices) {
    await runQuery(sql);
  }

  console.log('[migrate_add_requisicoes] Migração concluída com sucesso.');
};

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = run;

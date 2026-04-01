/**
 * migrate_add_cotacao_fields.js
 *
 * Objetivo:
 *   - Tornar fornecedor_id nullable em requisicao_cotacoes
 *   - Adicionar campos livres: fornecedor_nome, cnpj, telefone, email, frete
 *
 * Estratégia: recrear a tabela (SQLite não suporta ALTER COLUMN)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { runQuery, allQuery } = require('../config/database');

async function isSchemaCompativel() {
  const cols = await allQuery('PRAGMA table_info(requisicao_cotacoes)');
  if (!Array.isArray(cols) || cols.length === 0) return false;

  const map = Object.fromEntries(cols.map((c) => [c.name, c]));
  const required = ['fornecedor_id', 'fornecedor_nome', 'cnpj', 'telefone', 'email', 'frete'];
  const hasAll = required.every((name) => !!map[name]);
  if (!hasAll) return false;

  // fornecedor_id deve aceitar NULL para permitir cotação com nome livre
  return Number(map.fornecedor_id.notnull || 0) === 0;
}

async function migrateAddCotacaoFields() {
  console.log('[migrate_add_cotacao_fields] Iniciando...');

  const compativel = await isSchemaCompativel();
  if (compativel) {
    console.log('[migrate_add_cotacao_fields] Schema já compatível.');
    return;
  }

  // 1. Criar tabela nova com fornecedor_id nullable e novos campos
  await runQuery(`
    CREATE TABLE IF NOT EXISTS requisicao_cotacoes_new (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id             INTEGER NOT NULL REFERENCES requisicao_itens(id) ON DELETE CASCADE,
      fornecedor_id       INTEGER REFERENCES fornecedores(id),
      fornecedor_nome     TEXT,
      cnpj                TEXT,
      telefone            TEXT,
      email               TEXT,
      valor_unitario      REAL NOT NULL,
      frete               REAL DEFAULT 0,
      prazo_entrega       TEXT,
      condicao_pagamento  TEXT,
      observacao          TEXT,
      selecionada         INTEGER DEFAULT 0,
      criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Copiar dados existentes
  await runQuery(`
    INSERT INTO requisicao_cotacoes_new
      (id, item_id, fornecedor_id, valor_unitario, frete,
       prazo_entrega, condicao_pagamento, observacao, selecionada, criado_em)
    SELECT
      id, item_id, fornecedor_id, valor_unitario, 0,
      prazo_entrega, condicao_pagamento, observacao, selecionada, criado_em
    FROM requisicao_cotacoes
  `);

  // 3. Dropar tabela antiga
  await runQuery(`DROP TABLE requisicao_cotacoes`);

  // 4. Renomear nova
  await runQuery(`ALTER TABLE requisicao_cotacoes_new RENAME TO requisicao_cotacoes`);

  // 5. Recriar índice
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_cot_item ON requisicao_cotacoes(item_id)`);

  console.log('[migrate_add_cotacao_fields] Concluída com sucesso.');
}

module.exports = { migrateAddCotacaoFields };

if (require.main === module) {
  migrateAddCotacaoFields()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate_add_cotacao_fields] ERRO:', err);
      process.exit(1);
    });
}

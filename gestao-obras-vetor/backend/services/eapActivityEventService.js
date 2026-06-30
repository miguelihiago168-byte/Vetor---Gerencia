const { allQuery, getQuery, runQuery } = require('../config/database');

const EVENT_TYPES = {
  AVANCO: 'avanco',
  REGRESSAO: 'regressao',
  AJUSTE: 'ajuste'
};

const ORIGINS = {
  RDO_CRIADO: 'rdo_criado',
  RDO_EDITADO: 'rdo_editado',
  RDO_APROVADO: 'rdo_aprovado',
  RDO_REVERTIDO: 'rdo_revertido',
  EAP_EDITADA: 'eap_editada',
  RECALCULO_MANUAL: 'recalculo_manual'
};

const EVENT_TYPE_LABELS = {
  [EVENT_TYPES.AVANCO]: 'Avanço',
  [EVENT_TYPES.REGRESSAO]: 'Regressão',
  [EVENT_TYPES.AJUSTE]: 'Ajuste'
};

const ORIGIN_LABELS = {
  [ORIGINS.RDO_CRIADO]: 'RDO criado',
  [ORIGINS.RDO_EDITADO]: 'RDO editado',
  [ORIGINS.RDO_APROVADO]: 'RDO aprovado',
  [ORIGINS.RDO_REVERTIDO]: 'RDO revertido',
  [ORIGINS.EAP_EDITADA]: 'Atividade EAP editada',
  [ORIGINS.RECALCULO_MANUAL]: 'Recálculo manual'
};

const hasTable = async (tableName) => {
  const row = await getQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row);
};

const tableColumns = async (tableName) => {
  const rows = await allQuery(`PRAGMA table_info("${String(tableName).replace(/"/g, '""')}")`);
  return new Set((rows || []).map((row) => String(row.name)));
};

const addColumnIfMissing = async (tableName, columnSql) => {
  if (!(await hasTable(tableName))) return;
  const columnName = String(columnSql).trim().split(/\s+/)[0];
  const columns = await tableColumns(tableName);
  if (!columns.has(columnName)) {
    await runQuery(`ALTER TABLE "${String(tableName).replace(/"/g, '""')}" ADD COLUMN ${columnSql}`);
  }
};

const ensureEapActivityEventSchema = async () => {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS atividade_eap_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      atividade_eap_id INTEGER NOT NULL,
      rdo_id INTEGER,
      tipo TEXT NOT NULL,
      origem TEXT NOT NULL,
      percentual_anterior REAL,
      percentual_novo REAL,
      quantidade_anterior REAL,
      quantidade_nova REAL,
      mensagem TEXT,
      usuario_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS rdo_alertas_atividade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rdo_id INTEGER NOT NULL,
      atividade_eap_id INTEGER,
      tipo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_por INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolvido_em DATETIME
    )
  `);

  await addColumnIfMissing('atividade_eap_eventos', 'percentual_anterior REAL');
  await addColumnIfMissing('atividade_eap_eventos', 'percentual_novo REAL');
  await addColumnIfMissing('atividade_eap_eventos', 'quantidade_anterior REAL');
  await addColumnIfMissing('atividade_eap_eventos', 'quantidade_nova REAL');
  await addColumnIfMissing('atividade_eap_eventos', 'mensagem TEXT');
  await addColumnIfMissing('atividade_eap_eventos', 'usuario_id INTEGER');
  await addColumnIfMissing('rdo_alertas_atividade', 'ativo INTEGER DEFAULT 1');
  await addColumnIfMissing('rdo_alertas_atividade', 'resolvido_em DATETIME');

  await runQuery('CREATE INDEX IF NOT EXISTS idx_atividade_eap_eventos_atividade ON atividade_eap_eventos(atividade_eap_id, criado_em)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_atividade_eap_eventos_rdo ON atividade_eap_eventos(rdo_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_rdo_alertas_atividade_rdo ON rdo_alertas_atividade(rdo_id, ativo)');

  await runQuery(`
    UPDATE rdo_alertas_atividade
    SET ativo = 0, resolvido_em = COALESCE(resolvido_em, CURRENT_TIMESTAMP)
    WHERE ativo = 1
  `);
};

const normalizeNumber = (value) => {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const classifyChange = ({ percentualAnterior, percentualNovo, quantidadeAnterior, quantidadeNova }) => {
  const before = normalizeNumber(percentualAnterior);
  const after = normalizeNumber(percentualNovo);
  if (before !== null && after !== null && Math.abs(after - before) > 0.0001) {
    return after > before ? EVENT_TYPES.AVANCO : EVENT_TYPES.REGRESSAO;
  }

  const beforeQty = normalizeNumber(quantidadeAnterior);
  const afterQty = normalizeNumber(quantidadeNova);
  if (beforeQty !== null && afterQty !== null && Math.abs(afterQty - beforeQty) > 0.0001) {
    return afterQty > beforeQty ? EVENT_TYPES.AVANCO : EVENT_TYPES.REGRESSAO;
  }

  return EVENT_TYPES.AJUSTE;
};

const formatRdoNumber = (row) => {
  const raw = row?.numero_rdo ?? row?.id ?? row?.rdo_id;
  const match = String(raw || '').match(/(\d+)$/);
  const numero = match ? Number(match[1]) : Number(raw || 0);
  return `RDO-${String(numero || raw || '').padStart(3, '0')}`;
};

const getActivityLabel = async (atividadeId) => {
  const atividade = await getQuery(
    'SELECT codigo_eap, nome, descricao FROM atividades_eap WHERE id = ?',
    [atividadeId]
  );
  const codigo = String(atividade?.codigo_eap || '').trim();
  const nome = String(atividade?.nome || atividade?.descricao || '').trim();
  if (codigo && nome) return `${codigo} - ${nome}`;
  return codigo || nome || `Atividade #${atividadeId}`;
};

const buildAlertMessage = async ({ atividadeId, tipo, origem }) => {
  const label = await getActivityLabel(atividadeId);
  const typeLabel = EVENT_TYPE_LABELS[tipo] || 'Ajuste';
  const originLabel = ORIGIN_LABELS[origem] || 'alteração';
  return `${typeLabel} registrado em ${label} (${originLabel}). Revise o RDO.`;
};

const recordActivityEvent = async ({
  atividadeId,
  rdoId = null,
  tipo,
  origem,
  percentualAnterior = null,
  percentualNovo = null,
  quantidadeAnterior = null,
  quantidadeNova = null,
  mensagem = null,
  usuarioId = null
} = {}) => {
  if (!atividadeId || !origem) return null;
  await ensureEapActivityEventSchema();

  const eventType = tipo || classifyChange({
    percentualAnterior,
    percentualNovo,
    quantidadeAnterior,
    quantidadeNova
  });
  const finalMessage = mensagem || await buildAlertMessage({ atividadeId, tipo: eventType, origem });

  const result = await runQuery(
    `INSERT INTO atividade_eap_eventos (
      atividade_eap_id, rdo_id, tipo, origem,
      percentual_anterior, percentual_novo, quantidade_anterior, quantidade_nova,
      mensagem, usuario_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      atividadeId,
      rdoId || null,
      eventType,
      origem,
      normalizeNumber(percentualAnterior),
      normalizeNumber(percentualNovo),
      normalizeNumber(quantidadeAnterior),
      normalizeNumber(quantidadeNova),
      finalMessage,
      usuarioId || null
    ]
  );

  return { id: result?.lastID, tipo: eventType, mensagem: finalMessage };
};

const markRdosAffectedByEapEdit = async ({ atividadeIds = [], usuarioId = null, origem = ORIGINS.EAP_EDITADA } = {}) => {
  await ensureEapActivityEventSchema();
  const ids = [...new Set((atividadeIds || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return { affectedRDOs: 0, rdos: [] };

  const placeholders = ids.map(() => '?').join(',');
  const rows = await allQuery(`
    SELECT DISTINCT
      ra.atividade_eap_id,
      ra.percentual_executado,
      ra.quantidade_executada,
      r.id AS rdo_id,
      r.numero_rdo,
      r.data_relatorio
    FROM rdo_atividades ra
    INNER JOIN rdos r ON r.id = ra.rdo_id
    WHERE ra.atividade_eap_id IN (${placeholders})
  `, ids);

  const affected = [];
  for (const row of rows || []) {
    const event = await recordActivityEvent({
      atividadeId: row.atividade_eap_id,
      rdoId: row.rdo_id,
      origem,
      percentualAnterior: row.percentual_executado,
      percentualNovo: row.percentual_executado,
      quantidadeAnterior: row.quantidade_executada,
      quantidadeNova: row.quantidade_executada,
      usuarioId
    });
    affected.push({
      id: row.rdo_id,
      numero_rdo: formatRdoNumber(row),
      data: row.data_relatorio,
      alerta_tipo: event?.tipo || EVENT_TYPES.AJUSTE
    });
  }

  return { affectedRDOs: 0, rdos: [], eventosRegistrados: affected.length };
};

const clearRdoActivityAlerts = async ({ rdoId } = {}) => {
  if (!rdoId) return false;
  await ensureEapActivityEventSchema();
  const result = await runQuery(
    `UPDATE rdo_alertas_atividade
     SET ativo = 0, resolvido_em = CURRENT_TIMESTAMP
     WHERE rdo_id = ? AND ativo = 1`,
    [rdoId]
  );
  return Number(result?.changes || 0) > 0;
};

const getActiveAlertsForRdos = async (rdoIds = []) => {
  await ensureEapActivityEventSchema();
  return new Map();
};

const getActivityHistory = async (atividadeId) => {
  await ensureEapActivityEventSchema();
  return allQuery(`
    SELECT
      e.*,
      u.nome AS usuario_nome,
      r.data_relatorio,
      r.numero_rdo,
      ae.codigo_eap,
      ae.nome,
      ae.descricao
    FROM atividade_eap_eventos e
    LEFT JOIN usuarios u ON u.id = e.usuario_id
    LEFT JOIN rdos r ON r.id = e.rdo_id
    LEFT JOIN atividades_eap ae ON ae.id = e.atividade_eap_id
    WHERE e.atividade_eap_id = ?
    ORDER BY e.criado_em DESC, e.id DESC
  `, [atividadeId]);
};

module.exports = {
  EVENT_TYPES,
  ORIGINS,
  ensureEapActivityEventSchema,
  recordActivityEvent,
  markRdosAffectedByEapEdit,
  clearRdoActivityAlerts,
  getActiveAlertsForRdos,
  getActivityHistory,
  classifyChange
};

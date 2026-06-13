const { allQuery, getQuery, runQuery } = require('../config/database');
const { ensureSchemaReady } = require('../utils/schemaGuard');

const CORRECAO_ORIGEM_EAP = 'Recálculo automático da EAP';

const formatRdoNumber = (rdo) => {
  const raw = rdo?.numero_rdo ?? rdo?.id;
  const match = String(raw || '').match(/(\d+)$/);
  const numero = match ? Number(match[1]) : Number(raw || 0);
  return `RDO-${String(numero || rdo?.id || '').padStart(3, '0')}`;
};

const normalizeActivityLabel = (atividade) => {
  const codigo = String(atividade?.codigo_eap || '').trim();
  const nome = String(atividade?.nome || atividade?.descricao || '').trim();
  if (codigo && nome) return `${codigo} - ${nome}`;
  return codigo || nome || `Atividade ${atividade?.id}`;
};

const buildMotivo = (labels) => {
  const unique = [...new Set(labels.filter(Boolean))];
  if (unique.length === 0) return 'Atividade recalculada.';
  if (unique.length === 1) return `Atividade recalculada: ${unique[0]}`;
  const shown = unique.slice(0, 4).join('; ');
  const extra = unique.length > 4 ? `; +${unique.length - 4} atividade(s)` : '';
  return `Atividades recalculadas: ${shown}${extra}`;
};

const notifyUser = async ({ usuarioId, rdoId, numero }) => {
  if (!usuarioId) return;
  const tipo = 'rdo_correcao_automatica';
  const mensagem = `Seu ${numero} foi impactado por um recálculo de atividade e necessita revisão.`;

  const update = await runQuery(
    `UPDATE notificacoes
     SET mensagem = ?, lido = 0, criado_em = CURRENT_TIMESTAMP
     WHERE usuario_id = ? AND tipo = ? AND referencia_tipo = 'rdo' AND referencia_id = ?`,
    [mensagem, usuarioId, tipo, rdoId]
  );

  if (!update || update.changes === 0) {
    await runQuery(
      'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, tipo, mensagem, 'rdo', rdoId]
    );
  }
};

const insertCorrectionComment = async ({ rdoId, usuarioId, motivo }) => {
  const comentario = [
    'Correção solicitada automaticamente.',
    '',
    `Motivo: ${motivo}`,
    '',
    'O RDO retornou para "Em preenchimento" e deverá ser revisado antes de novo envio.'
  ].join('\n');

  await runQuery(
    'INSERT INTO rdo_comentarios (rdo_id, usuario_id, comentario) VALUES (?, ?, ?)',
    [rdoId, usuarioId, comentario]
  );
};

const ensureRdoCorrectionColumns = async () => {
  await ensureSchemaReady({ getQuery, allQuery }, {
    columns: {
      rdos: [
        'correcao_solicitada',
        'correcao_motivo',
        'correcao_origem',
        'correcao_solicitada_em',
        'correcao_solicitada_por',
        'status_anterior_correcao'
      ]
    }
  });
};

const markAffectedRDOs = async ({ atividadeIds = [], usuario, origem = CORRECAO_ORIGEM_EAP } = {}) => {
  const ids = [...new Set((atividadeIds || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return { affectedRDOs: 0, rdos: [] };

  await ensureRdoCorrectionColumns();

  const placeholders = ids.map(() => '?').join(',');
  const rows = await allQuery(`
    SELECT DISTINCT
      r.id,
      r.numero_rdo,
      r.data_relatorio AS data,
      r.status,
      r.criado_por,
      r.correcao_solicitada,
      r.status_anterior_correcao,
      ae.id AS atividade_id,
      ae.codigo_eap,
      ae.nome,
      ae.descricao
    FROM rdo_atividades ra
    INNER JOIN rdos r ON r.id = ra.rdo_id
    INNER JOIN atividades_eap ae ON ae.id = ra.atividade_eap_id
    WHERE ra.atividade_eap_id IN (${placeholders})
  `, ids);

  const grouped = new Map();
  for (const row of rows || []) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: row.id,
        numero_rdo: formatRdoNumber(row),
        data: row.data,
        status_anterior: row.status,
        status_atual: row.status === 'Em preenchimento' ? row.status : 'Em preenchimento',
        criado_por: row.criado_por,
        correcao_solicitada: row.correcao_solicitada,
        status_anterior_correcao: row.status_anterior_correcao,
        atividades: []
      });
    }
    grouped.get(row.id).atividades.push(normalizeActivityLabel(row));
  }

  const affected = [];
  const usuarioLabel = String(usuario?.nome || usuario?.id || 'Sistema');
  const usuarioId = usuario?.id || null;

  for (const rdo of grouped.values()) {
    const motivo = buildMotivo(rdo.atividades);
    const statusAnteriorCorrecao = rdo.status_anterior_correcao || rdo.status_anterior;

    await runQuery(`
      UPDATE rdos SET
        correcao_solicitada = 1,
        correcao_motivo = ?,
        correcao_origem = ?,
        correcao_solicitada_em = CURRENT_TIMESTAMP,
        correcao_solicitada_por = ?,
        status_anterior_correcao = ?,
        status = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      motivo,
      origem,
      usuarioLabel,
      statusAnteriorCorrecao,
      rdo.status_atual,
      rdo.id
    ]);

    await insertCorrectionComment({ rdoId: rdo.id, usuarioId, motivo });
    await notifyUser({ usuarioId: rdo.criado_por, rdoId: rdo.id, numero: rdo.numero_rdo });

    affected.push({
      id: rdo.id,
      numero_rdo: rdo.numero_rdo,
      data: rdo.data,
      status_anterior: rdo.status_anterior,
      status_atual: rdo.status_atual
    });
  }

  return { affectedRDOs: affected.length, rdos: affected };
};

const clearRdoCorrection = async ({ rdoId, usuarioId } = {}) => {
  await ensureRdoCorrectionColumns();
  const rows = await allQuery('SELECT id, correcao_solicitada FROM rdos WHERE id = ? AND COALESCE(correcao_solicitada, 0) = 1', [rdoId]);
  if (!rows || rows.length === 0) return false;

  await runQuery(`
    UPDATE rdos SET
      correcao_solicitada = 0,
      correcao_motivo = NULL,
      correcao_origem = NULL,
      correcao_solicitada_em = NULL,
      correcao_solicitada_por = NULL,
      status_anterior_correcao = NULL,
      atualizado_em = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [rdoId]);

  if (usuarioId) {
    await runQuery(
      'INSERT INTO rdo_comentarios (rdo_id, usuario_id, comentario) VALUES (?, ?, ?)',
      [rdoId, usuarioId, 'Correção realizada e pendência encerrada.']
    );
  }

  return true;
};

module.exports = {
  CORRECAO_ORIGEM_EAP,
  ensureRdoCorrectionColumns,
  markAffectedRDOs,
  clearRdoCorrection
};

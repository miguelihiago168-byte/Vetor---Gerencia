const { allQuery, getQuery, runQuery } = require('../config/database');

const OCCURRENCE_CATEGORIES = [
  { value: 'Segurança', label: 'Segurança' },
  { value: 'Qualidade', label: 'Qualidade' },
  { value: 'Clima', label: 'Clima' },
  { value: 'Produtividade', label: 'Produtividade' },
  { value: 'Equipamento', label: 'Equipamento' },
  { value: 'Material', label: 'Material' },
  { value: 'Projeto', label: 'Projeto / EAP' },
  { value: 'Terceiros', label: 'Terceiros' },
  { value: 'Outra', label: 'Outra' }
];

const OCCURRENCE_IMPACTS = [
  'Nenhum impacto identificado', 'Segurança', 'Qualidade', 'Prazo', 'Custo', 'Produtividade', 'Meio ambiente', 'Equipe', 'Cliente / terceiros'
];
const SEVERITIES = ['Baixa', 'Média', 'Alta', 'Crítica'];
const EDITABLE_STATUSES = new Set(['Em preenchimento', 'Reprovado']);

const asText = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const asBool = (value) => value === true || value === 1 || value === '1' || value === 'true';
const asInt = (value, fallback = 0) => {
  if (value === '' || value === null || typeof value === 'undefined') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : NaN;
};

const assertEditable = async (rdoId, user, tenantId) => {
  const rdo = await getQuery('SELECT * FROM rdos WHERE id = ? AND tenant_id = ?', [rdoId, tenantId]);
  if (!rdo) {
    const error = new Error('RDO não encontrado no tenant ativo.'); error.status = 404; throw error;
  }
  if (Number(rdo.criado_por) !== Number(user.id) && !user.is_gestor) {
    const error = new Error('Você não tem permissão para alterar ocorrências deste RDO.'); error.status = 403; throw error;
  }
  if (!EDITABLE_STATUSES.has(rdo.status)) {
    const error = new Error('Ocorrências são somente leitura após o envio para análise.'); error.status = 403; throw error;
  }
  return rdo;
};

const validateOccurrence = async (item, { projetoId }) => {
  const categoria = asText(item?.categoria, 80) || 'Outra';
  if (!OCCURRENCE_CATEGORIES.some((entry) => entry.value === categoria)) throw new Error('Categoria de ocorrência inválida.');
  const categoriaOutra = asText(item?.categoria_outra, 180);
  if (categoria === 'Outra' && !categoriaOutra) throw new Error('Informe a descrição da categoria “Outra”.');
  const descricaoDetalhada = asText(item?.descricao_detalhada || item?.descricao, 8000);
  if (!descricaoDetalhada) throw new Error('Descrição completa da ocorrência é obrigatória.');
  const gravidade = asText(item?.gravidade, 30) || 'Baixa';
  if (!SEVERITIES.includes(gravidade)) throw new Error('Gravidade da ocorrência inválida.');
  const emAndamento = asBool(item?.em_andamento);
  const horaInicio = asText(item?.hora_inicio, 5);
  const horaFim = asText(item?.hora_fim, 5);
  if (horaInicio && !/^\d{2}:\d{2}$/.test(horaInicio)) throw new Error('Horário inicial inválido.');
  if (horaFim && !/^\d{2}:\d{2}$/.test(horaFim)) throw new Error('Horário final inválido.');
  if (!emAndamento && horaInicio && !horaFim) throw new Error('Informe o horário final ou marque a ocorrência como em andamento.');
  const trabalhadoresAfetados = asInt(item?.trabalhadores_afetados, 0);
  if (!Number.isFinite(trabalhadoresAfetados)) throw new Error('Quantidade de trabalhadores afetados inválida.');
  const atividadeEapId = item?.atividade_eap_id ? Number(item.atividade_eap_id) : null;
  if (atividadeEapId) {
    const atividade = await getQuery('SELECT id FROM atividades_eap WHERE id = ? AND projeto_id = ?', [atividadeEapId, projetoId]);
    if (!atividade) throw new Error('A atividade EAP vinculada não pertence ao projeto do RDO.');
  }
  const impacts = [...new Set((Array.isArray(item?.impactos) ? item.impactos : []).map((value) => asText(value, 80)).filter(Boolean))];
  if (impacts.some((impact) => !OCCURRENCE_IMPACTS.includes(impact))) throw new Error('Impacto de ocorrência inválido.');
  if (impacts.includes('Nenhum impacto identificado') && impacts.length > 1) throw new Error('“Nenhum impacto identificado” não pode ser combinado com outros impactos.');
  return {
    id: item?.id ? Number(item.id) : null,
    titulo: asText(item?.titulo, 240) || null,
    categoria, categoria_outra: categoriaOutra || null,
    data_ocorrencia: asText(item?.data_ocorrencia, 10) || null,
    hora_inicio: horaInicio || null, hora_fim: emAndamento ? null : (horaFim || null), em_andamento: emAndamento ? 1 : 0,
    local_frente: asText(item?.local_frente, 400) || null,
    atividade_eap_id: atividadeEapId,
    envolvidos: asText(item?.envolvidos, 2000) || null,
    descricao: descricaoDetalhada, descricao_detalhada: descricaoDetalhada,
    providencia_imediata: asText(item?.providencia_imediata, 4000) || null,
    recomendacao: asText(item?.recomendacao, 4000) || null,
    impactos: impacts, gravidade,
    paralisacao: asBool(item?.paralisacao) ? 1 : 0,
    trabalhadores_afetados: trabalhadoresAfetados,
    impacto_cronograma: asText(item?.impacto_cronograma, 2000) || null
  };
};

const hydrateOccurrences = async (rdoId) => {
  const rows = await allQuery(`
    SELECT ro.*, ae.codigo_eap AS atividade_codigo, COALESCE(ae.nome, ae.descricao) AS atividade_descricao,
           u.nome AS autor_nome, uu.nome AS atualizado_por_nome
    FROM rdo_ocorrencias ro
    LEFT JOIN atividades_eap ae ON ae.id = ro.atividade_eap_id
    LEFT JOIN usuarios u ON u.id = ro.criado_por
    LEFT JOIN usuarios uu ON uu.id = ro.atualizado_por
    WHERE ro.rdo_id = ? ORDER BY COALESCE(ro.numero, 999999), ro.criado_em, ro.id
  `, [rdoId]);
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const qs = ids.map(() => '?').join(',');
  const [impacts, evidences] = await Promise.all([
    allQuery(`SELECT * FROM rdo_ocorrencia_impactos WHERE ocorrencia_id IN (${qs}) ORDER BY id`, ids),
    allQuery(`
      SELECT ev.*, a.nome_arquivo AS anexo_nome, a.caminho_arquivo AS anexo_caminho,
             rf.nome_arquivo AS foto_nome, rf.caminho_arquivo AS foto_caminho
      FROM rdo_ocorrencia_evidencias ev
      LEFT JOIN anexos a ON a.id = ev.anexo_id
      LEFT JOIN rdo_fotos rf ON rf.id = ev.rdo_foto_id
      WHERE ev.ocorrencia_id IN (${qs}) ORDER BY ev.id
    `, ids)
  ]);
  const impactsById = new Map();
  impacts.forEach((row) => impactsById.set(row.ocorrencia_id, [...(impactsById.get(row.ocorrencia_id) || []), row.impacto]));
  const evidenceById = new Map();
  evidences.forEach((row) => evidenceById.set(row.ocorrencia_id, [...(evidenceById.get(row.ocorrencia_id) || []), row]));
  return rows.map((row) => ({ ...row, impactos: impactsById.get(row.id) || [], evidencias: evidenceById.get(row.id) || [] }));
};

const syncOccurrences = async ({ rdoId, projetoId, tenantId, user, occurrences, semOcorrencias, dataRelatorio }) => {
  const rdo = await assertEditable(rdoId, user, tenantId);
  const source = Array.isArray(occurrences) ? occurrences : [];
  if (semOcorrencias === true && source.length > 0) throw new Error('Não é possível declarar ausência de ocorrências com registros preenchidos.');
  const normalized = [];
  for (const item of source) {
    const entry = await validateOccurrence(item, { projetoId: projetoId || rdo.projeto_id });
    entry.data_ocorrencia = entry.data_ocorrencia || dataRelatorio || rdo.data_relatorio;
    normalized.push(entry);
  }
  const existing = await allQuery('SELECT * FROM rdo_ocorrencias WHERE rdo_id = ?', [rdoId]);
  const existingById = new Map(existing.map((row) => [Number(row.id), row]));
  const submittedIds = new Set(normalized.filter((entry) => entry.id).map((entry) => entry.id));
  for (const old of existing) {
    if (!submittedIds.has(Number(old.id))) {
      await runQuery('DELETE FROM rdo_ocorrencia_impactos WHERE ocorrencia_id = ?', [old.id]);
      await runQuery('DELETE FROM rdo_ocorrencia_evidencias WHERE ocorrencia_id = ?', [old.id]);
      await runQuery('DELETE FROM rdo_ocorrencias WHERE id = ?', [old.id]);
      await runQuery('INSERT INTO rdo_ocorrencia_historico (ocorrencia_id, usuario_id, acao, antes) VALUES (?, ?, ?, ?)', [old.id, user.id, 'EXCLUIDA', JSON.stringify(old)]);
    }
  }
  let nextNumber = Number((await getQuery('SELECT COALESCE(MAX(numero), 0) + 1 AS next FROM rdo_ocorrencias WHERE rdo_id = ?', [rdoId]))?.next || 1);
  for (const entry of normalized) {
    let occurrenceId = entry.id;
    const fields = [entry.titulo, entry.descricao, entry.gravidade, entry.categoria, entry.categoria_outra, entry.data_ocorrencia, entry.hora_inicio, entry.hora_fim, entry.em_andamento, entry.local_frente, entry.atividade_eap_id, entry.envolvidos, entry.descricao_detalhada, entry.providencia_imediata, entry.recomendacao, entry.paralisacao, entry.trabalhadores_afetados, entry.impacto_cronograma];
    if (occurrenceId && existingById.has(occurrenceId)) {
      await runQuery(`UPDATE rdo_ocorrencias SET titulo=?, descricao=?, gravidade=?, categoria=?, categoria_outra=?, data_ocorrencia=?, hora_inicio=?, hora_fim=?, em_andamento=?, local_frente=?, atividade_eap_id=?, envolvidos=?, descricao_detalhada=?, providencia_imediata=?, recomendacao=?, paralisacao=?, trabalhadores_afetados=?, impacto_cronograma=?, atualizado_por=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [...fields, user.id, occurrenceId]);
      await runQuery('INSERT INTO rdo_ocorrencia_historico (ocorrencia_id, usuario_id, acao, antes, depois) VALUES (?, ?, ?, ?, ?)', [occurrenceId, user.id, 'ATUALIZADA', JSON.stringify(existingById.get(occurrenceId)), JSON.stringify(entry)]);
    } else {
      const result = await runQuery(`INSERT INTO rdo_ocorrencias (rdo_id, numero, titulo, descricao, gravidade, categoria, categoria_outra, data_ocorrencia, hora_inicio, hora_fim, em_andamento, local_frente, atividade_eap_id, envolvidos, descricao_detalhada, providencia_imediata, recomendacao, paralisacao, trabalhadores_afetados, impacto_cronograma, criado_por, atualizado_por, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [rdoId, nextNumber++, ...fields, user.id, user.id]);
      occurrenceId = result.lastID;
      await runQuery('INSERT INTO rdo_ocorrencia_historico (ocorrencia_id, usuario_id, acao, depois) VALUES (?, ?, ?, ?)', [occurrenceId, user.id, 'CRIADA', JSON.stringify(entry)]);
    }
    await runQuery('DELETE FROM rdo_ocorrencia_impactos WHERE ocorrencia_id = ?', [occurrenceId]);
    for (const impact of entry.impactos) await runQuery('INSERT INTO rdo_ocorrencia_impactos (ocorrencia_id, impacto) VALUES (?, ?)', [occurrenceId, impact]);
  }
  await runQuery('UPDATE rdos SET sem_ocorrencias = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [semOcorrencias === true ? 1 : (source.length ? 0 : null), rdoId]);
  return hydrateOccurrences(rdoId);
};

const assertApprovalOccurrenceDeclaration = async (rdoId) => {
  const rdo = await getQuery('SELECT sem_ocorrencias FROM rdos WHERE id = ?', [rdoId]);
  const count = await getQuery('SELECT COUNT(*) AS total FROM rdo_ocorrencias WHERE rdo_id = ?', [rdoId]);
  if (Number(rdo?.sem_ocorrencias) !== 1 && Number(count?.total || 0) === 0) {
    const error = new Error('Declare que não houve ocorrências ou registre ao menos uma antes de enviar para aprovação.'); error.status = 400; throw error;
  }
};

module.exports = { OCCURRENCE_CATEGORIES, OCCURRENCE_IMPACTS, hydrateOccurrences, syncOccurrences, assertEditable, assertApprovalOccurrenceDeclaration };

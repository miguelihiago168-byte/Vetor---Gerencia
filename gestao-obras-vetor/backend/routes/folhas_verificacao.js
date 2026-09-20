const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { PERFIS, inferirPerfil } = require('../constants/access');
const { assertProjectAccess } = require('../middleware/rbac');
const { allQuery, getQuery, runQuery, withClient, getWithClient, allWithClient, execWithClient } = require('../config/database');
const { registrarAuditoria } = require('../middleware/auditoria');
const rules = require('../services/folhasVerificacaoService');
const { generateFolhaVerificacaoPdfBuffer } = require('../services/folhasVerificacaoPdfService');

const router = express.Router();
const writeProfiles = [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE, PERFIS.FISCAL];
const approveProfiles = [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE];
const modelProfiles = [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_QUALIDADE];
const can = (req, profiles) => profiles.includes(inferirPerfil(req.usuario));
const requireProfiles = (profiles) => (req, res, next) => can(req, profiles) ? next() : res.status(403).json({ erro: 'Acesso negado para esta ação.' });
const parseJson = (value, fallback = {}) => { try { return typeof value === 'string' ? JSON.parse(value) : (value ?? fallback); } catch { return fallback; } };
const quantityVerified = (value) => {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantidade verificada deve ser um número inteiro maior que zero.');
  return quantity;
};
const measuredAt = (value) => {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Data e hora da medição inválidas.');
  return date;
};

const uploadsDir = path.join(__dirname, '..', 'uploads');
const uploadStorage = multer.diskStorage({
  destination: (req, _file, callback) => {
    const folder = path.join(uploadsDir, `tenant_${Number(req.tenantId)}`);
    fs.mkdirSync(folder, { recursive: true }); callback(null, folder);
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = path.basename(file.originalname || 'evidencia', ext).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'evidencia';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${name}${ext}`);
  }
});
const evidenceUpload = multer({ storage: uploadStorage, limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (_req, file, callback) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (/^\.(jpe?g|png|webp|heic|heif|pdf|doc|docx|xls|xlsx|csv)$/i.test(ext)) return callback(null, true);
  return callback(new Error('Formato de evidência não permitido.'));
} });

const assertSheetAccess = async (req, res, sheetId) => {
  const sheet = await getQuery('SELECT * FROM folhas_verificacao WHERE id=? AND tenant_id=?', [Number(sheetId), req.tenantId]);
  if (!sheet) { res.status(404).json({ erro: 'Folha não encontrada.' }); return null; }
  if (!(await assertProjectAccess(req, res, sheet.projeto_id))) return null;
  return sheet;
};
const assertDraft = (res, sheet) => {
  if (sheet.status !== rules.STATUS.RASCUNHO) { res.status(409).json({ erro: 'Somente folhas em rascunho podem ser alteradas diretamente.' }); return false; }
  return true;
};
const history = async (client, { tenantId, folhaId, action, before, after, userId, data = {} }) => {
  await execWithClient(client, `INSERT INTO folhas_verificacao_historico (tenant_id,folha_id,acao,status_anterior,status_novo,dados,usuario_id)
    VALUES (?,?,?,?,?,?,?)`, [tenantId, folhaId, action, before || null, after || null, JSON.stringify(data), userId]);
};
const refreshSummary = async (client, sheet) => {
  const measurements = await allWithClient(client, "SELECT resultado AS result, COALESCE(NULLIF(dados_extras->>'quantidade_verificada','')::int, 1) AS quantity FROM folhas_verificacao_medicoes WHERE folha_id=?", [sheet.id]);
  const answers = await allWithClient(client, 'SELECT resultado, item_snapshot FROM folhas_verificacao_respostas WHERE folha_id=?', [sheet.id]);
  const links = await allWithClient(client, `SELECT v.obrigatorio AS required, f.status, f.resultado_lote AS result
    FROM folhas_verificacao_vinculos v JOIN folhas_verificacao f ON f.id=v.folha_destino_id WHERE v.folha_origem_id=?`, [sheet.id]);
  const summary = rules.summarizeLot({ population: sheet.populacao_total, sampleSize: sheet.amostra_prevista, acceptanceCriterion: sheet.criterio_aceitacao, maxNonConformities: sheet.maximo_nc, measurements, requiredTorqueLinks: links });
  const modelSnapshot = parseJson(sheet.modelo_snapshot);
  const expectedRequiredAnswers = (modelSnapshot?.configuracao?.sections || []).reduce((total, section) => total + (Array.isArray(section.items) ? section.items.length : 0), 0);
  const requiredAnswers = answers.filter((answer) => parseJson(answer.item_snapshot)?.obrigatorio !== false);
  const pendingAnswers = Math.max(0, expectedRequiredAnswers - requiredAnswers.length) + requiredAnswers.filter((answer) => answer.resultado === rules.RESULT.PENDENTE).length;
  const nonConformingAnswers = answers.filter((answer) => answer.resultado === rules.RESULT.NAO_CONFORME).length;
  summary.itens = Math.max(answers.length, expectedRequiredAnswers);
  summary.itensPendentes = pendingAnswers;
  summary.itensNaoConformes = nonConformingAnswers;
  if (pendingAnswers) summary.result = rules.RESULT.PENDENTE;
  if (nonConformingAnswers && summary.result !== rules.RESULT.BLOQUEADO) summary.result = rules.RESULT.NAO_CONFORME;
  await execWithClient(client, 'UPDATE folhas_verificacao SET resumo=?, resultado_lote=?, atualizado_em=NOW() WHERE id=?', [JSON.stringify(summary), summary.result, sheet.id]);
  // O ponto/estrutura é o resumo visual do conjunto de medições. Folhas
  // antigas podiam manter o ponto como PENDENTE mesmo depois de todas as
  // medições serem concluídas; sincronize-o com o resultado calculado.
  const pointResult = summary.result === rules.RESULT.CONFORME
    ? rules.RESULT.CONFORME
    : [rules.RESULT.NAO_CONFORME, rules.RESULT.BLOQUEADO].includes(summary.result)
      ? rules.RESULT.NAO_CONFORME
      : rules.RESULT.PENDENTE;
  const pointTorqueStatus = sheet.tipo_folha === 'TORQUE' ? pointResult : rules.RESULT.NAO_APLICAVEL;
  await execWithClient(client, 'UPDATE folhas_verificacao_pontos SET resultado=?, status_montagem=?, status_torque=?, liberado=? WHERE folha_id=?', [pointResult, pointResult, pointTorqueStatus, pointResult === rules.RESULT.CONFORME, sheet.id], { returnColumn: null });
  return summary;
};

// A revisão mantém a identificação e todos os registros conformes da folha
// anterior. Somente os itens que estavam não conformes voltam como pendentes
// para reinspeção. Este helper também permite recuperar revisões criadas por
// versões antigas do fluxo que ficaram sem os registros copiados.
const copyRevisionData = async (client, { source, targetId, tenantId }) => {
  const oldPoints = await allWithClient(client, 'SELECT * FROM folhas_verificacao_pontos WHERE folha_id=? ORDER BY id', [source.id]);
  const pointMap = new Map();
  for (const point of oldPoints) {
    const copiedPoint = await execWithClient(client, `INSERT INTO folhas_verificacao_pontos (tenant_id,folha_id,identificacao,localizacao,responsavel_id,status_montagem,status_torque,resultado,liberado,dados)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [tenantId, targetId, point.identificacao, point.localizacao, point.responsavel_id, point.status_montagem, point.status_torque, point.resultado === rules.RESULT.NAO_CONFORME ? rules.RESULT.PENDENTE : point.resultado, point.liberado, JSON.stringify({ ...parseJson(point.dados, {}), folha_origem_id: source.id, ponto_origem_id: point.id, resultado_original: point.resultado })]);
    pointMap.set(Number(point.id), copiedPoint.lastID);
  }
  const oldAnswers = await allWithClient(client, 'SELECT * FROM folhas_verificacao_respostas WHERE folha_id=? ORDER BY id', [source.id]);
  for (const answer of oldAnswers) {
    const pending = answer.resultado === rules.RESULT.NAO_CONFORME;
    await execWithClient(client, `INSERT INTO folhas_verificacao_respostas (tenant_id,folha_id,ponto_id,modelo_item_id,item_snapshot,resultado,valor_texto,valor_numero,justificativa,observacao,responsavel_id,prazo_correcao)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [tenantId, targetId, pointMap.get(Number(answer.ponto_id)) || null, answer.modelo_item_id, JSON.stringify({ ...parseJson(answer.item_snapshot, {}), folha_origem_id: source.id, resposta_origem_id: answer.id, resultado_original: answer.resultado }), pending ? rules.RESULT.PENDENTE : answer.resultado, pending ? null : answer.valor_texto, pending ? null : answer.valor_numero, answer.justificativa, answer.observacao, answer.responsavel_id, answer.prazo_correcao]);
  }
  const oldMeasurements = await allWithClient(client, 'SELECT * FROM folhas_verificacao_medicoes WHERE folha_id=? ORDER BY id', [source.id]);
  for (const measurement of oldMeasurements) {
    const pending = measurement.resultado === rules.RESULT.NAO_CONFORME;
    const original = { id: measurement.id, valor_medido: measurement.valor_medido, resultado: measurement.resultado, medido_em: measurement.medido_em, observacao: measurement.observacao };
    const extras = { ...parseJson(measurement.dados_extras, {}), folha_origem_id: source.id, medicao_origem_id: measurement.id, reinspecao_pendente: pending, resultado_original: measurement.resultado, medicao_original: original };
    await execWithClient(client, `INSERT INTO folhas_verificacao_medicoes (tenant_id,folha_id,ponto_id,numero_ponto,localizacao,elemento,identificacao_fixador,requisito_nominal,limite_inferior,limite_superior,valor_medido,unidade,resultado,selo_torque,observacao,dados_extras,medido_em,responsavel_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [tenantId, targetId, pointMap.get(Number(measurement.ponto_id)) || null, measurement.numero_ponto, measurement.localizacao, measurement.elemento, measurement.identificacao_fixador, measurement.requisito_nominal, measurement.limite_inferior, measurement.limite_superior, pending ? null : measurement.valor_medido, measurement.unidade, pending ? rules.RESULT.PENDENTE : measurement.resultado, measurement.selo_torque, pending ? null : measurement.observacao, JSON.stringify(extras), pending ? null : measurement.medido_em, pending ? null : measurement.responsavel_id]);
  }
  const torque = await getWithClient(client, 'SELECT * FROM folhas_verificacao_torque_config WHERE folha_id=?', [source.id]);
  if (torque) {
    await execWithClient(client, `INSERT INTO folhas_verificacao_torque_config (folha_id,tenant_id,tipo_ligacao,componente,fixador,classe_material,condicao_montagem,torque_esperado,unidade,tipo_tolerancia,tolerancia,limite_inferior,limite_superior,metodo_verificacao,fonte_requisito,documento_referencia,revisao_documento,instrumento_snapshot,liberacao_excepcional)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [targetId, torque.tenant_id, torque.tipo_ligacao, torque.componente, torque.fixador, torque.classe_material, torque.condicao_montagem, torque.torque_esperado, torque.unidade, torque.tipo_tolerancia, torque.tolerancia, torque.limite_inferior, torque.limite_superior, torque.metodo_verificacao, torque.fonte_requisito, torque.documento_referencia, torque.revisao_documento, torque.instrumento_snapshot, torque.liberacao_excepcional], { returnColumn: null });
  }
  return refreshSummary(client, { ...source, id: targetId, resumo: {}, resultado_lote: rules.RESULT.PENDENTE });
};

router.get('/projeto/:projetoId/contexto', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!(await assertProjectAccess(req, res, projetoId))) return;
    const project = await getQuery(`SELECT id,nome,empresa_responsavel,empresa_executante FROM projetos WHERE id=? AND tenant_id=?`, [projetoId, req.tenantId]);
    if (!project) return res.status(404).json({ erro: 'Obra não encontrada.' });
    // Context data is optional for a new sheet. Keep the form available when a
    // legacy optional register has a schema variation instead of failing all
    // of the form because of one select.
    const optionalRows = async (name, sql) => {
      try { return await allQuery(sql, [projetoId]); }
      catch (error) { console.warn(`[folhas-verificacao] contexto ${name}:`, error.message); return []; }
    };
    const [activities, rdos, users, tools] = await Promise.all([
      optionalRows('EAP', 'SELECT id,codigo_eap AS codigo,descricao AS atividade FROM atividades_eap WHERE projeto_id=? ORDER BY codigo_eap,descricao'),
      optionalRows('RDO', 'SELECT id,numero_rdo,data_relatorio,status FROM rdos WHERE projeto_id=? ORDER BY data_relatorio DESC,id DESC'),
      optionalRows('usuarios', `SELECT u.id,u.nome,u.perfil,u.funcao FROM usuarios u JOIN projeto_usuarios pu ON pu.usuario_id=u.id WHERE pu.projeto_id=? AND u.ativo=1 AND u.deletado_em IS NULL ORDER BY u.nome`),
      optionalRows('ativos', `SELECT id,codigo,nome,marca,modelo,unidade,quantidade_disponivel,quantidade_total FROM almox_ferramentas WHERE projeto_id=? AND ativo=1 AND quantidade_total>0 ORDER BY codigo,nome`)
    ]);
    res.json({ projeto: project, empresas: [project.empresa_responsavel, project.empresa_executante].filter(Boolean), atividades: activities, rdos, usuarios: users, equipe: users, ativos: tools });
  } catch (error) { res.status(500).json({ erro: error.message || 'Erro ao carregar contexto da obra.' }); }
});

router.get('/modelos', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const rows = await allQuery(`SELECT m.* FROM folhas_verificacao_modelos m
      WHERE m.tenant_id=? ${req.query.ativo === 'false' ? '' : 'AND m.ativo=TRUE'} ORDER BY m.tipo_folha,m.nome`, [req.tenantId]);
    res.json(rows);
  } catch (error) {
    const missingSchema = /folhas_verificacao_(modelos|categorias|disciplinas).*does not exist|relation .*folhas_verificacao/i.test(error.message || '');
    res.status(missingSchema ? 503 : 500).json({
      codigo: missingSchema ? 'FOLHAS_SCHEMA_PENDENTE' : 'FOLHAS_MODELOS_ERRO',
      erro: missingSchema
        ? 'O módulo de Folhas de Verificação ainda não foi instalado neste banco. Execute a migration 000018_folhas_verificacao_montagem em ambiente de desenvolvimento/teste.'
        : 'Erro ao listar modelos.'
    });
  }
});

router.post('/modelos', [auth, requireProfiles(modelProfiles), body('codigo').trim().notEmpty(), body('nome').trim().notEmpty(), body('tipo_folha').isIn(['MONTAGEM', 'TORQUE'])], async (req, res) => {
  try {
    const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).json({ erro: 'Dados de modelo inválidos.' });
    const category = await getQuery(`SELECT c.id FROM folhas_verificacao_categorias c JOIN folhas_verificacao_disciplinas d ON d.id=c.disciplina_id WHERE c.id=? AND c.tenant_id=?`, [Number(req.body.categoria_id), req.tenantId]);
    if (!category) return res.status(400).json({ erro: 'Categoria inválida.' });
    const result = await runQuery(`INSERT INTO folhas_verificacao_modelos (tenant_id,categoria_id,codigo,nome,tipo_folha,descricao,configuracao,criado_por)
      VALUES (?,?,?,?,?,?,?,?)`, [req.tenantId, category.id, req.body.codigo.trim(), req.body.nome.trim(), req.body.tipo_folha, req.body.descricao || null, JSON.stringify(req.body.configuracao || {}), req.usuario.id]);
    res.status(201).json({ id: result.lastID });
  } catch (error) { res.status(409).json({ erro: error.message || 'Não foi possível criar o modelo.' }); }
});

router.patch('/modelos/:id', [auth, requireProfiles(modelProfiles)], async (req, res) => {
  try {
    const model = await getQuery('SELECT * FROM folhas_verificacao_modelos WHERE id=? AND tenant_id=?', [Number(req.params.id), req.tenantId]);
    if (!model) return res.status(404).json({ erro: 'Modelo não encontrado.' });
    await runQuery('UPDATE folhas_verificacao_modelos SET nome=?,descricao=?,configuracao=?,ativo=?,atualizado_em=NOW() WHERE id=?', [req.body.nome ?? model.nome, req.body.descricao ?? model.descricao, JSON.stringify(req.body.configuracao ?? parseJson(model.configuracao)), req.body.ativo ?? model.ativo, model.id]);
    res.json({ mensagem: 'Modelo atualizado.' });
  } catch (error) { res.status(500).json({ erro: 'Erro ao atualizar modelo.' }); }
});

router.get('/projeto/:projetoId/indicadores', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const projectId = Number(req.params.projetoId); if (!(await assertProjectAccess(req, res, projectId))) return;
    const rows = await allQuery(`SELECT status,resultado_lote,COUNT(*)::int total,COALESCE(SUM((resumo->>'measured')::int),0)::int medicoes,
      COALESCE(SUM((resumo->>'conforming')::int),0)::int conformes,COALESCE(SUM((resumo->>'nonConforming')::int),0)::int nao_conformes
      FROM folhas_verificacao WHERE tenant_id=? AND projeto_id=? GROUP BY status,resultado_lote`, [req.tenantId, projectId]);
    res.json(rows);
  } catch (error) { res.status(500).json({ erro: 'Erro ao carregar indicadores.' }); }
});

router.get('/projeto/:projetoId', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const projectId = Number(req.params.projetoId); if (!(await assertProjectAccess(req, res, projectId))) return;
    const params = [req.tenantId, projectId]; const filters = ['f.tenant_id=?', 'f.projeto_id=?'];
    for (const [field, column] of [['tipo','f.tipo_folha'],['status','f.status'],['resultado','f.resultado_lote']]) if (req.query[field]) { params.push(req.query[field]); filters.push(`${column}=?`); }
    if (req.query.lote) { params.push(`%${req.query.lote}%`); filters.push(`f.identificacao->>'codigo_lote' ILIKE ?`); }
    const page = Math.max(1, Number(req.query.page || 1)); const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25))); params.push(limit, (page - 1) * limit);
    const rows = await allQuery(`SELECT f.*,u.nome criador_nome,m.nome modelo_nome,(SELECT rnc_id FROM folhas_verificacao_rncs fr WHERE fr.folha_id=f.id) rnc_id,
        (SELECT MAX(f2.revisao) FROM folhas_verificacao f2 WHERE f2.folha_origem_id=f.id AND f2.tenant_id=f.tenant_id) ultima_revisao_aberta
      FROM folhas_verificacao f LEFT JOIN usuarios u ON u.id=f.criado_por LEFT JOIN folhas_verificacao_modelos m ON m.id=f.modelo_id
      WHERE ${filters.join(' AND ')} ORDER BY f.criado_em DESC LIMIT ? OFFSET ?`, params);
    res.json({ page, limit, data: rows });
  } catch (error) { res.status(500).json({ erro: 'Erro ao listar folhas.' }); }
});

router.post('/projeto/:projetoId', [auth, requireProfiles(writeProfiles), body('modelo_id').isInt()], async (req, res) => {
  try {
    const projectId = Number(req.params.projetoId); if (!(await assertProjectAccess(req, res, projectId))) return;
    const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).json({ erro: 'Modelo obrigatório.' });
    const model = await getQuery('SELECT * FROM folhas_verificacao_modelos WHERE id=? AND tenant_id=? AND ativo=TRUE', [Number(req.body.modelo_id), req.tenantId]);
    if (!model) return res.status(404).json({ erro: 'Modelo não encontrado ou inativo.' });
    const project = await getQuery('SELECT id,empresa_responsavel,empresa_executante FROM projetos WHERE id=? AND tenant_id=?', [projectId, req.tenantId]);
    if (!project) return res.status(404).json({ erro: 'Obra não encontrada.' });
    if (req.body.atividade_eap_id) {
      const activity = await getQuery('SELECT id FROM atividades_eap WHERE id=? AND projeto_id=? AND tenant_id=?', [Number(req.body.atividade_eap_id), projectId, req.tenantId]);
      if (!activity) return res.status(400).json({ erro: 'Atividade da EAP não pertence à obra.' });
    }
    if (req.body.rdo_id) {
      const rdo = await getQuery('SELECT id FROM rdos WHERE id=? AND projeto_id=? AND tenant_id=?', [Number(req.body.rdo_id), projectId, req.tenantId]);
      if (!rdo) return res.status(400).json({ erro: 'RDO não pertence à obra.' });
    }
    if (model.tipo_folha === 'TORQUE' && req.body.torque?.instrumento?.id) {
      const asset = await getQuery(`SELECT id,codigo,nome,marca,modelo,unidade,quantidade_disponivel FROM almox_ferramentas
        WHERE id=? AND projeto_id=? AND tenant_id=? AND ativo=1`, [Number(req.body.torque.instrumento.id), projectId, req.tenantId]);
      if (!asset) return res.status(400).json({ erro: 'Instrumento não pertence à obra ou está indisponível.' });
      req.body.torque.instrumento = { ...req.body.torque.instrumento, ...asset };
    }
    const sheet = await withClient(async (client) => {
      const sequence = await getWithClient(client, `INSERT INTO folhas_verificacao_sequencias (tenant_id,projeto_id,tipo_folha,ultimo_numero) VALUES (?,?,?,1)
        ON CONFLICT (tenant_id,projeto_id,tipo_folha) DO UPDATE SET ultimo_numero=folhas_verificacao_sequencias.ultimo_numero+1 RETURNING ultimo_numero`, [req.tenantId, projectId, model.tipo_folha]);
      const prefix = model.tipo_folha === 'TORQUE' ? 'FV-TOR' : 'FV-MON';
      const number = `${prefix}-${String(sequence.ultimo_numero).padStart(6, '0')}`;
      const result = await execWithClient(client, `INSERT INTO folhas_verificacao (tenant_id,projeto_id,modelo_id,tipo_folha,numero,empresa_responsavel_snapshot,empresa_executante_snapshot,equipe_snapshot,identificacao,modelo_snapshot,populacao_total,unidade_populacao,amostra_prevista,criterio_aceitacao,maximo_nc,rdo_id,atividade_eap_id,criado_por,atualizado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [req.tenantId, projectId, model.id, model.tipo_folha, number, JSON.stringify({ nome: project.empresa_responsavel || null }), JSON.stringify({ nome: project.empresa_executante || null }), JSON.stringify(req.body.equipe || []), JSON.stringify(req.body.identificacao || {}), JSON.stringify({ id:model.id,codigo:model.codigo,nome:model.nome,configuracao:parseJson(model.configuracao) }), req.body.populacao_total || null, req.body.unidade_populacao || null, req.body.amostra_prevista || null, req.body.criterio_aceitacao || rules.ACCEPTANCE.C_ZERO, req.body.maximo_nc || 0, req.body.rdo_id || null, req.body.atividade_eap_id || null, req.usuario.id, req.usuario.id]);
      if (model.tipo_folha === 'TORQUE' && req.body.torque) {
        const limits = rules.calculateLimits(req.body.torque);
        rules.assertInstrument({ expectedTorque: limits.expected, ...(req.body.torque.instrumento || {}), exceptionReleased: Boolean(req.body.torque.liberacao_excepcional), exceptionJustification: req.body.torque.liberacao_justificativa });
        await execWithClient(client, `INSERT INTO folhas_verificacao_torque_config (folha_id,tenant_id,tipo_ligacao,componente,fixador,classe_material,condicao_montagem,torque_esperado,unidade,tipo_tolerancia,tolerancia,limite_inferior,limite_superior,metodo_verificacao,fonte_requisito,documento_referencia,revisao_documento,instrumento_snapshot,liberacao_excepcional)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING folha_id`, [result.lastID, req.tenantId, req.body.torque.tipo_ligacao || null, req.body.torque.componente || null, req.body.torque.fixador || null, req.body.torque.classe_material || null, req.body.torque.condicao_montagem || null, limits.expected, req.body.torque.unidade, req.body.torque.toleranceType || req.body.torque.tipo_tolerancia, req.body.torque.tolerance ?? req.body.torque.tolerancia ?? null, limits.lower, limits.upper, req.body.torque.metodo_verificacao || null, req.body.torque.fonte_requisito || null, req.body.torque.documento_referencia || null, req.body.torque.revisao_documento || null, JSON.stringify(req.body.torque.instrumento || {}), JSON.stringify(req.body.torque.liberacao_excepcional ? { justificativa:req.body.torque.liberacao_justificativa, autorizado_por:req.usuario.id } : {})]);
      }
      await history(client, { tenantId:req.tenantId, folhaId:result.lastID, action:'CREATE', userId:req.usuario.id, data:{ numero:number, tipo:model.tipo_folha } });
      return { id:result.lastID, numero:number };
    });
    await registrarAuditoria('folhas_verificacao', sheet.id, 'CREATE', null, { numero:sheet.numero, projeto_id:projectId }, req.usuario.id, { tenantId:req.tenantId });
    res.status(201).json(sheet);
  } catch (error) { res.status(400).json({ erro: error.message || 'Não foi possível criar a folha.' }); }
});

router.get('/:id', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    const [torque, points, measurements, responses, links, signatures, evidences, historyRows, rnc, activity, rdo, revisions] = await Promise.all([
      getQuery('SELECT * FROM folhas_verificacao_torque_config WHERE folha_id=?', [sheet.id]), allQuery('SELECT * FROM folhas_verificacao_pontos WHERE folha_id=? ORDER BY identificacao', [sheet.id]),
      allQuery("SELECT *, COALESCE(NULLIF(dados_extras->>'quantidade_verificada','')::int, 1) AS quantidade_verificada FROM folhas_verificacao_medicoes WHERE folha_id=? ORDER BY numero_ponto,id", [sheet.id]), allQuery('SELECT * FROM folhas_verificacao_respostas WHERE folha_id=? ORDER BY id', [sheet.id]),
      allQuery(`SELECT v.*,f.numero,f.tipo_folha,f.status,f.resultado_lote FROM folhas_verificacao_vinculos v JOIN folhas_verificacao f ON f.id=v.folha_destino_id WHERE v.folha_origem_id=?`, [sheet.id]),
      allQuery('SELECT s.*,u.nome usuario_nome FROM folhas_verificacao_assinaturas s JOIN usuarios u ON u.id=s.usuario_id WHERE s.folha_id=? ORDER BY s.assinado_em', [sheet.id]),
      allQuery('SELECT * FROM folhas_verificacao_evidencias WHERE folha_id=? ORDER BY criado_em DESC', [sheet.id]), allQuery('SELECT h.*,u.nome usuario_nome FROM folhas_verificacao_historico h LEFT JOIN usuarios u ON u.id=h.usuario_id WHERE h.folha_id=? ORDER BY h.criado_em DESC', [sheet.id]),
      getQuery(`WITH RECURSIVE origem AS (SELECT id,folha_origem_id,0 profundidade FROM folhas_verificacao WHERE id=? UNION ALL SELECT f.id,f.folha_origem_id,o.profundidade+1 FROM folhas_verificacao f JOIN origem o ON f.id=o.folha_origem_id) SELECT l.rnc_id,r.status AS rnc_status,r.descricao_correcao AS rnc_descricao_correcao FROM folhas_verificacao_rncs l JOIN origem o ON o.id=l.folha_id JOIN rnc r ON r.id=l.rnc_id ORDER BY o.profundidade LIMIT 1`, [sheet.id]),
      sheet.atividade_eap_id ? getQuery('SELECT id,codigo_eap,descricao FROM atividades_eap WHERE id=? AND projeto_id=?', [sheet.atividade_eap_id, sheet.projeto_id]) : Promise.resolve(null),
      sheet.rdo_id ? getQuery('SELECT id,numero_rdo,data_relatorio FROM rdos WHERE id=? AND projeto_id=?', [sheet.rdo_id, sheet.projeto_id]) : Promise.resolve(null),
      allQuery('SELECT id,revisao,status,resultado_lote FROM folhas_verificacao WHERE folha_origem_id=? AND tenant_id=? ORDER BY revisao', [sheet.id, req.tenantId])
    ]);
    if (sheet.aprovado_por && !signatures.some((signature) => signature.tipo === 'APROVADOR')) {
      const approver = await getQuery('SELECT nome,perfil,assinatura_png FROM usuarios WHERE id=?', [sheet.aprovado_por]);
      if (approver?.assinatura_png) signatures.push({ tipo:'APROVADOR', tenant_id:sheet.tenant_id, nome_snapshot:approver.nome, perfil_snapshot:approver.perfil, assinatura_snapshot:approver.assinatura_png, assinado_em:sheet.aprovado_em, versao_folha:sheet.versao });
    }
    res.json({ ...sheet, torque, atividade_eap:activity, rdo, revisoes:revisions, pontos:points, medicoes:measurements, respostas:responses, vinculos:links, assinaturas:signatures, evidencias:evidences, historico:historyRows, rnc_id:rnc?.rnc_id || null, rnc_status:rnc?.rnc_status || null, rnc_descricao_correcao:rnc?.rnc_descricao_correcao || null });
  } catch (error) { res.status(500).json({ erro: 'Erro ao carregar folha.' }); }
});

router.patch('/:id', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet || !assertDraft(res, sheet)) return;
    if (req.body.versao && Number(req.body.versao) !== Number(sheet.versao)) return res.status(409).json({ erro: 'A folha foi alterada por outro usuário. Recarregue os dados.' });
    await runQuery(`UPDATE folhas_verificacao SET identificacao=?,equipe_snapshot=?,populacao_total=?,unidade_populacao=?,amostra_prevista=?,criterio_aceitacao=?,maximo_nc=?,rdo_id=?,atividade_eap_id=?,versao=versao+1,atualizado_por=?,atualizado_em=NOW() WHERE id=?`,
      [JSON.stringify(req.body.identificacao ?? parseJson(sheet.identificacao)), JSON.stringify(req.body.equipe ?? parseJson(sheet.equipe_snapshot, [])), req.body.populacao_total ?? sheet.populacao_total, req.body.unidade_populacao ?? sheet.unidade_populacao, req.body.amostra_prevista ?? sheet.amostra_prevista, req.body.criterio_aceitacao ?? sheet.criterio_aceitacao, req.body.maximo_nc ?? sheet.maximo_nc, req.body.rdo_id ?? sheet.rdo_id, req.body.atividade_eap_id ?? sheet.atividade_eap_id, req.usuario.id, sheet.id]);
    await registrarAuditoria('folhas_verificacao', sheet.id, 'UPDATE_DRAFT', sheet, req.body, req.usuario.id, { tenantId:req.tenantId });
    res.json({ mensagem: 'Rascunho salvo.' });
  } catch (error) { res.status(500).json({ erro: 'Erro ao salvar rascunho.' }); }
});

router.post('/:id/pontos', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try { const sheet = await assertSheetAccess(req,res,req.params.id); if (!sheet || !assertDraft(res,sheet)) return;
    if (!String(req.body.identificacao || '').trim()) return res.status(400).json({ erro: 'Identificação do ponto é obrigatória.' });
    const result = await runQuery('INSERT INTO folhas_verificacao_pontos (tenant_id,folha_id,identificacao,localizacao,responsavel_id,dados) VALUES (?,?,?,?,?,?)', [req.tenantId,sheet.id,req.body.identificacao.trim(),req.body.localizacao || null,req.body.responsavel_id || null,JSON.stringify(req.body.dados || {})]);
    res.status(201).json({ id:result.lastID });
  } catch (error) { res.status(409).json({ erro:error.message || 'Erro ao criar ponto.' }); } });

router.post('/:id/respostas', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet || !assertDraft(res, sheet)) return;
    const item = req.body.item || {};
    const result = req.body.resultado || rules.RESULT.PENDENTE;
    if (!['CONFORME', 'NAO_CONFORME', 'NAO_APLICAVEL', 'PENDENTE'].includes(result)) return res.status(400).json({ erro: 'Resultado inválido.' });
    if (result === 'NAO_APLICAVEL' && item.exige_justificativa !== false && !String(req.body.justificativa || '').trim()) return res.status(400).json({ erro: 'Justificativa obrigatória para não aplicável.' });
    if (!String(item.chave || '').trim() || !String(item.rotulo || '').trim()) return res.status(400).json({ erro: 'Item de verificação inválido.' });
    const prior = await getQuery(`SELECT id FROM folhas_verificacao_respostas WHERE folha_id=? AND ponto_id IS NOT DISTINCT FROM ? AND item_snapshot->>'chave'=? LIMIT 1`, [sheet.id, req.body.ponto_id || null, item.chave]);
    const snapshot = { chave:item.chave, rotulo:item.rotulo, obrigatorio:item.obrigatorio !== false, tipo_resposta:item.tipo_resposta || 'STATUS', exige_justificativa:item.exige_justificativa !== false };
    // The sheet-level checklist is a creation-stage snapshot. It is never
    // overwritten during execution; point-level model answers may still be
    // adjusted while the draft is open.
    if (prior && !req.body.ponto_id) return res.status(409).json({ erro:'A verificação preliminar já foi registrada e não pode ser alterada. Use reinspeção quando necessário.' });
    if (prior) await runQuery(`UPDATE folhas_verificacao_respostas SET resultado=?,valor_texto=?,valor_numero=?,justificativa=?,observacao=?,responsavel_id=?,prazo_correcao=?,atualizado_em=NOW() WHERE id=?`, [result, req.body.valor_texto || null, req.body.valor_numero || null, req.body.justificativa || null, req.body.observacao || null, req.body.responsavel_id || null, req.body.prazo_correcao || null, prior.id]);
    else await runQuery(`INSERT INTO folhas_verificacao_respostas (tenant_id,folha_id,ponto_id,item_snapshot,resultado,valor_texto,valor_numero,justificativa,observacao,responsavel_id,prazo_correcao) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [req.tenantId,sheet.id,req.body.ponto_id || null,JSON.stringify(snapshot),result,req.body.valor_texto || null,req.body.valor_numero || null,req.body.justificativa || null,req.body.observacao || null,req.body.responsavel_id || null,req.body.prazo_correcao || null]);
    await withClient(async client => refreshSummary(client, sheet));
    res.json({ mensagem:'Verificação registrada.' });
  } catch (error) { res.status(400).json({ erro:error.message || 'Erro ao registrar verificação.' }); }
});

router.post('/:id/medicoes', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try { const sheet = await assertSheetAccess(req,res,req.params.id); if (!sheet || !assertDraft(res,sheet)) return;
    const input = req.body; const quantity = quantityVerified(input.quantidade_verificada); const registeredAt = measuredAt(input.medido_em); let limits = { lower:input.limite_inferior, upper:input.limite_superior, expected:input.requisito_nominal }; let unit = input.unidade || null;
    if (sheet.tipo_folha === 'TORQUE') { const torque = await getQuery('SELECT * FROM folhas_verificacao_torque_config WHERE folha_id=?',[sheet.id]); limits = { lower:torque.limite_inferior, upper:torque.limite_superior, expected:torque.torque_esperado }; unit = torque.unidade; }
    const result = rules.calculateMeasurementResult({ value:input.valor_medido, lower:limits.lower, upper:limits.upper, notApplicable:input.nao_aplicavel, justification:input.justificativa });
    const extras = { ...parseJson(input.dados_extras, {}), quantidade_verificada: quantity };
    const insert = await runQuery(`INSERT INTO folhas_verificacao_medicoes (tenant_id,folha_id,ponto_id,numero_ponto,localizacao,elemento,identificacao_fixador,requisito_nominal,limite_inferior,limite_superior,valor_medido,unidade,resultado,selo_torque,observacao,dados_extras,medido_em,responsavel_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.tenantId,sheet.id,input.ponto_id || null,input.numero_ponto || null,input.localizacao || null,input.elemento || null,input.identificacao_fixador || null,limits.expected,limits.lower,limits.upper,input.valor_medido || null,unit,result,input.selo_torque || null,input.observacao || null,JSON.stringify(extras),registeredAt,req.usuario.id]);
    await withClient(async client => refreshSummary(client, sheet)); res.status(201).json({ id:insert.lastID,resultado:result });
  } catch (error) { res.status(400).json({ erro:error.message || 'Erro ao registrar medição.' }); } });

router.patch('/:id/medicoes/:medicaoId', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id);
    if (!sheet || !assertDraft(res, sheet)) return;
    const existing = await getQuery('SELECT * FROM folhas_verificacao_medicoes WHERE id=? AND folha_id=? AND tenant_id=?', [Number(req.params.medicaoId), sheet.id, req.tenantId]);
    if (!existing) return res.status(404).json({ erro: 'Medição não encontrada.' });
    const input = { ...existing, ...req.body };
    const quantity = quantityVerified(req.body.quantidade_verificada ?? parseJson(existing.dados_extras, {}).quantidade_verificada);
    const registeredAt = measuredAt(req.body.medido_em ?? existing.medido_em);
    let limits = { lower: existing.limite_inferior, upper: existing.limite_superior, expected: existing.requisito_nominal };
    if (sheet.tipo_folha === 'TORQUE') {
      const torque = await getQuery('SELECT * FROM folhas_verificacao_torque_config WHERE folha_id=?', [sheet.id]);
      limits = { lower: torque.limite_inferior, upper: torque.limite_superior, expected: torque.torque_esperado };
      input.unidade = torque.unidade;
    }
    const result = rules.calculateMeasurementResult({ value: input.valor_medido, lower: limits.lower, upper: limits.upper, notApplicable: input.resultado === rules.RESULT.NAO_APLICAVEL });
    const extras = { ...parseJson(existing.dados_extras, {}), ...parseJson(req.body.dados_extras, {}), quantidade_verificada: quantity };
    await runQuery(`UPDATE folhas_verificacao_medicoes SET numero_ponto=?,localizacao=?,elemento=?,identificacao_fixador=?,requisito_nominal=?,limite_inferior=?,limite_superior=?,valor_medido=?,unidade=?,resultado=?,selo_torque=?,observacao=?,dados_extras=?,medido_em=?,atualizado_em=NOW()
      WHERE id=? AND folha_id=? AND tenant_id=?`, [input.numero_ponto || null, input.localizacao || null, input.elemento || null, input.identificacao_fixador || null, limits.expected, limits.lower, limits.upper, input.valor_medido ?? null, input.unidade || existing.unidade, result, input.selo_torque || null, input.observacao || null, JSON.stringify(extras), registeredAt, existing.id, sheet.id, req.tenantId]);
    await withClient(async (client) => refreshSummary(client, sheet));
    res.json({ mensagem: 'Medição atualizada.', resultado: result });
  } catch (error) { res.status(400).json({ erro: error.message || 'Erro ao atualizar medição.' }); }
});

router.delete('/:id/medicoes/:medicaoId', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if (!sheet || !assertDraft(res,sheet)) return; await runQuery('DELETE FROM folhas_verificacao_medicoes WHERE id=? AND folha_id=? AND tenant_id=?',[Number(req.params.medicaoId),sheet.id,req.tenantId]); await withClient(async client=>refreshSummary(client,sheet)); res.json({mensagem:'Medição removida.'}); } catch { res.status(500).json({erro:'Erro ao remover medição.'}); } });

router.post('/:id/vinculos', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if (!sheet || !assertDraft(res,sheet)) return; const target=await getQuery('SELECT * FROM folhas_verificacao WHERE id=? AND tenant_id=?',[Number(req.body.folha_destino_id),req.tenantId]); if (!target) return res.status(404).json({erro:'Folha complementar não encontrada.'}); if (target.projeto_id !== sheet.projeto_id) return res.status(400).json({erro:'Folhas devem pertencer à mesma obra.'}); await runQuery('INSERT INTO folhas_verificacao_vinculos (tenant_id,folha_origem_id,folha_destino_id,tipo_vinculo,obrigatorio,bloqueia_liberacao,criado_por) VALUES (?,?,?,?,?,?,?)',[req.tenantId,sheet.id,target.id,req.body.tipo_vinculo || 'COMPLEMENTAR',Boolean(req.body.obrigatorio),Boolean(req.body.bloqueia_liberacao),req.usuario.id]); res.status(201).json({mensagem:'Folha vinculada.'}); } catch(error) {res.status(409).json({erro:error.message || 'Erro ao vincular folha.'});} });

router.post('/:id/enviar-analise', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if (!sheet || !assertDraft(res,sheet)) return; if (String(sheet.criado_por)!==String(req.usuario.id) && !can(req,approveProfiles)) return res.status(403).json({erro:'Somente criador, responsável ou gestor pode enviar.'}); const summary=await withClient(async client=>refreshSummary(client,sheet)); if (summary.sampleIncomplete || summary.torqueBlocked) return res.status(409).json({erro:'Amostra incompleta ou folha complementar obrigatória pendente.'}); await runQuery('UPDATE folhas_verificacao SET status=?,enviado_em=NOW(),atualizado_por=? WHERE id=?',[rules.STATUS.EM_ANALISE,req.usuario.id,sheet.id]); await runQuery('INSERT INTO folhas_verificacao_historico (tenant_id,folha_id,acao,status_anterior,status_novo,dados,usuario_id) VALUES (?,?,?,?,?,?,?)',[req.tenantId,sheet.id,'SEND',sheet.status,rules.STATUS.EM_ANALISE,JSON.stringify(summary),req.usuario.id]); res.json({mensagem:'Folha enviada para análise.'}); } catch(error) {res.status(400).json({erro:error.message || 'Erro ao enviar folha.'});} });

+router.post('/:id/aprovar', [auth, requireProfiles(approveProfiles)], async (req,res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    rules.assertTransition(sheet.status, rules.STATUS.APROVADA);
    const approver = await getQuery('SELECT nome,perfil,assinatura_png FROM usuarios WHERE id=?', [req.usuario.id]);
    if (!approver?.assinatura_png) return res.status(409).json({ erro: 'Cadastre sua assinatura no perfil antes de aprovar a folha.' });
    const summary = await withClient(async (client) => refreshSummary(client, sheet));
    if ([rules.RESULT.PENDENTE, rules.RESULT.NAO_CONFORME, rules.RESULT.BLOQUEADO].includes(summary.result)) return res.status(409).json({ erro: 'A folha não atende aos critérios para aprovação.' });
    await runQuery('UPDATE folhas_verificacao SET status=?,aprovado_em=NOW(),aprovado_por=?,atualizado_por=? WHERE id=?', [rules.STATUS.APROVADA, req.usuario.id, req.usuario.id, sheet.id]);
    await runQuery('INSERT INTO folhas_verificacao_assinaturas (tenant_id,folha_id,tipo,usuario_id,nome_snapshot,perfil_snapshot,assinatura_snapshot,versao_folha,ip) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (folha_id,tipo,versao_folha) DO UPDATE SET usuario_id=EXCLUDED.usuario_id,nome_snapshot=EXCLUDED.nome_snapshot,perfil_snapshot=EXCLUDED.perfil_snapshot,assinatura_snapshot=EXCLUDED.assinatura_snapshot,ip=EXCLUDED.ip,assinado_em=NOW()', [req.tenantId, sheet.id, 'APROVADOR', req.usuario.id, approver.nome, approver.perfil, approver.assinatura_png, sheet.versao, req.ip]);
    await runQuery('INSERT INTO folhas_verificacao_historico (tenant_id,folha_id,acao,status_anterior,status_novo,dados,usuario_id) VALUES (?,?,?,?,?,?,?)', [req.tenantId, sheet.id, 'APPROVE', sheet.status, rules.STATUS.APROVADA, JSON.stringify(summary), req.usuario.id]);
    res.json({ mensagem: 'Folha aprovada e assinatura do aprovador registrada.' });
  } catch (error) { res.status(400).json({ erro: error.message || 'Erro ao aprovar folha.' }); }
});

router.post('/:id/reprovar', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if (!sheet) return; rules.assertTransition(sheet.status,rules.STATUS.REPROVADA_BLOQUEADA); const summary=await withClient(async client=>refreshSummary(client,sheet)); await runQuery('UPDATE folhas_verificacao SET status=?,resultado_lote=?,atualizado_por=? WHERE id=?',[rules.STATUS.REPROVADA_BLOQUEADA,rules.RESULT.BLOQUEADO,req.usuario.id,sheet.id]); await runQuery('INSERT INTO folhas_verificacao_historico (tenant_id,folha_id,acao,status_anterior,status_novo,dados,usuario_id) VALUES (?,?,?,?,?,?,?)',[req.tenantId,sheet.id,'REJECT',sheet.status,rules.STATUS.REPROVADA_BLOQUEADA,JSON.stringify({summary,decisao:req.body.decisao || null,justificativa:req.body.justificativa || null}),req.usuario.id]); res.json({mensagem:'Folha reprovada e bloqueada.'}); } catch(error) {res.status(400).json({erro:error.message || 'Erro ao reprovar folha.'});} });

router.post('/:id/correcoes', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    rules.assertTransition(sheet.status, rules.STATUS.EM_CORRECAO);
    const rnc = await getQuery('SELECT l.rnc_id,r.status FROM folhas_verificacao_rncs l JOIN rnc r ON r.id=l.rnc_id WHERE l.folha_id=?', [sheet.id]);
    if (!rnc) return res.status(409).json({ erro:'Gere e vincule a RNC antes de iniciar a correção.' });
    if (rnc.status !== 'Encerrada') return res.status(409).json({ erro:'A correção da folha só pode iniciar após o plano de ação da RNC ser aprovado e encerrado pela Qualidade.' });
    if (!String(req.body.justificativa || '').trim() || !req.body.prazo) return res.status(400).json({ erro:'Prazo e descrição da correção são obrigatórios.' });
    const responsibleId = req.body.responsavel_id || req.usuario.id;
    await runQuery('UPDATE folhas_verificacao SET status=?,atualizado_por=?,atualizado_em=NOW() WHERE id=?', [rules.STATUS.EM_CORRECAO, req.usuario.id, sheet.id]);
    await runQuery('INSERT INTO folhas_verificacao_historico (tenant_id,folha_id,acao,status_anterior,status_novo,dados,usuario_id) VALUES (?,?,?,?,?,?,?)', [req.tenantId,sheet.id,'CORRECTION_STARTED',sheet.status,rules.STATUS.EM_CORRECAO,JSON.stringify({rnc_id:rnc.rnc_id,responsavel_id:responsibleId,prazo:req.body.prazo,justificativa:req.body.justificativa}),req.usuario.id]);
    res.json({ mensagem:'Correção iniciada.' });
  } catch (error) { res.status(400).json({ erro:error.message || 'Erro ao iniciar correção.' }); }
});

router.post('/:id/finalizar-correcao', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    if (![rules.STATUS.EM_CORRECAO, rules.STATUS.REPROVADA_BLOQUEADA].includes(sheet.status)) return res.status(409).json({ erro:'A folha não está pronta para abrir uma nova revisão.' });
    const rnc = await getQuery('SELECT l.rnc_id,r.status,r.descricao_correcao FROM folhas_verificacao_rncs l JOIN rnc r ON r.id=l.rnc_id WHERE l.folha_id=?', [sheet.id]);
    if (!rnc) return res.status(409).json({ erro:'A folha reprovada precisa ter uma RNC vinculada.' });
    if (rnc.status !== 'Encerrada') return res.status(409).json({ erro:'A RNC vinculada precisa estar aprovada e encerrada antes de abrir a revisão.' });
    const resolution = String(req.body.resolucao || rnc.descricao_correcao || '').trim();
    if (!resolution) return res.status(400).json({ erro:'A RNC encerrada não possui uma resolução registrada.' });
    const existingRevision = await getQuery('SELECT id,revisao FROM folhas_verificacao WHERE folha_origem_id=? ORDER BY revisao DESC LIMIT 1', [sheet.id]);
    if (existingRevision) {
      const counts = await getQuery(`SELECT
        (SELECT count(*)::int FROM folhas_verificacao_medicoes WHERE folha_id=?) AS measurements,
        (SELECT count(*)::int FROM folhas_verificacao_pontos WHERE folha_id=?) AS points,
        (SELECT count(*)::int FROM folhas_verificacao_respostas WHERE folha_id=?) AS answers`, [existingRevision.id, existingRevision.id, existingRevision.id]);
      if (!counts || Number(counts.measurements) + Number(counts.points) + Number(counts.answers) === 0) {
        const repaired = await withClient(async (client) => {
          await execWithClient(client, 'DELETE FROM folhas_verificacao_torque_config WHERE folha_id=?', [existingRevision.id], { returnColumn: null });
          const summary = await copyRevisionData(client, { source: sheet, targetId: existingRevision.id, tenantId: req.tenantId });
          await execWithClient(client, 'UPDATE folhas_verificacao SET status=?,atualizado_por=?,atualizado_em=NOW() WHERE id=?', [rules.STATUS.EM_REINSPECAO, req.usuario.id, sheet.id], { returnColumn: null });
          await history(client, { tenantId:req.tenantId, folhaId:existingRevision.id, action:'REVISION_REHYDRATED_FROM_CORRECTION', userId:req.usuario.id, data:{ folha_origem_id:sheet.id, rnc_id:rnc.rnc_id, resolucao:resolution, revisao:existingRevision.revisao, conformes_preservados:summary.measured, reinspecoes_pendentes:summary.pending } });
          return summary;
        });
        return res.status(200).json({ mensagem:'A revisão existente foi recuperada com os registros da folha anterior.', id:existingRevision.id, revisao:existingRevision.revisao, reused:true, rehydrated:true, resumo:repaired });
      }
      await runQuery('UPDATE folhas_verificacao SET status=?,atualizado_por=?,atualizado_em=NOW() WHERE id=?', [rules.STATUS.EM_REINSPECAO, req.usuario.id, sheet.id]);
      return res.status(200).json({ mensagem:'A revisão já foi aberta.', id:existingRevision.id, revisao:existingRevision.revisao, reused:true });
    }
    const revision = await withClient(async (client) => {
      const next = await getWithClient(client, 'SELECT COALESCE(MAX(revisao),0)+1 AS revisao FROM folhas_verificacao WHERE tenant_id=? AND projeto_id=? AND tipo_folha=? AND numero=?', [req.tenantId, sheet.projeto_id, sheet.tipo_folha, sheet.numero]);
      const inserted = await execWithClient(client, `INSERT INTO folhas_verificacao (tenant_id,projeto_id,modelo_id,tipo_folha,numero,revisao,versao,status,resultado_lote,empresa_responsavel_snapshot,empresa_executante_snapshot,equipe_snapshot,identificacao,modelo_snapshot,populacao_total,unidade_populacao,amostra_prevista,criterio_aceitacao,maximo_nc,resumo,rdo_id,atividade_eap_id,folha_origem_id,criado_por,atualizado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [req.tenantId,sheet.projeto_id,sheet.modelo_id,sheet.tipo_folha,sheet.numero,next.revisao,1,rules.STATUS.RASCUNHO,rules.RESULT.PENDENTE,sheet.empresa_responsavel_snapshot,sheet.empresa_executante_snapshot,sheet.equipe_snapshot,sheet.identificacao,sheet.modelo_snapshot,sheet.populacao_total,sheet.unidade_populacao,sheet.amostra_prevista,sheet.criterio_aceitacao,sheet.maximo_nc,JSON.stringify({}),sheet.rdo_id,sheet.atividade_eap_id,sheet.id,req.usuario.id,req.usuario.id]);
      const oldPoints = await allWithClient(client, 'SELECT * FROM folhas_verificacao_pontos WHERE folha_id=? ORDER BY id', [sheet.id]);
      const pointMap = new Map();
      for (const point of oldPoints) {
        const copiedPoint = await execWithClient(client, `INSERT INTO folhas_verificacao_pontos (tenant_id,folha_id,identificacao,localizacao,responsavel_id,status_montagem,status_torque,resultado,liberado,dados)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [req.tenantId, inserted.lastID, point.identificacao, point.localizacao, point.responsavel_id, point.status_montagem, point.status_torque, point.resultado === rules.RESULT.NAO_CONFORME ? rules.RESULT.PENDENTE : point.resultado, point.liberado, JSON.stringify({ ...parseJson(point.dados, {}), folha_origem_id: sheet.id, ponto_origem_id: point.id, resultado_original: point.resultado })]);
        pointMap.set(Number(point.id), copiedPoint.lastID);
      }
      const oldAnswers = await allWithClient(client, 'SELECT * FROM folhas_verificacao_respostas WHERE folha_id=? ORDER BY id', [sheet.id]);
      for (const answer of oldAnswers) {
        const pending = answer.resultado === rules.RESULT.NAO_CONFORME;
        await execWithClient(client, `INSERT INTO folhas_verificacao_respostas (tenant_id,folha_id,ponto_id,modelo_item_id,item_snapshot,resultado,valor_texto,valor_numero,justificativa,observacao,responsavel_id,prazo_correcao)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [req.tenantId, inserted.lastID, pointMap.get(Number(answer.ponto_id)) || null, answer.modelo_item_id, JSON.stringify({ ...parseJson(answer.item_snapshot, {}), folha_origem_id: sheet.id, resposta_origem_id: answer.id, resultado_original: answer.resultado }), pending ? rules.RESULT.PENDENTE : answer.resultado, pending ? null : answer.valor_texto, pending ? null : answer.valor_numero, answer.justificativa, answer.observacao, answer.responsavel_id, answer.prazo_correcao]);
      }
      const oldMeasurements = await allWithClient(client, 'SELECT * FROM folhas_verificacao_medicoes WHERE folha_id=? ORDER BY id', [sheet.id]);
      for (const measurement of oldMeasurements) {
        const pending = measurement.resultado === rules.RESULT.NAO_CONFORME;
        const original = { id: measurement.id, valor_medido: measurement.valor_medido, resultado: measurement.resultado, medido_em: measurement.medido_em, observacao: measurement.observacao };
        const extras = { ...parseJson(measurement.dados_extras, {}), folha_origem_id: sheet.id, medicao_origem_id: measurement.id, reinspecao_pendente: pending, resultado_original: measurement.resultado, medicao_original: original };
        await execWithClient(client, `INSERT INTO folhas_verificacao_medicoes (tenant_id,folha_id,ponto_id,numero_ponto,localizacao,elemento,identificacao_fixador,requisito_nominal,limite_inferior,limite_superior,valor_medido,unidade,resultado,selo_torque,observacao,dados_extras,medido_em,responsavel_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [req.tenantId, inserted.lastID, pointMap.get(Number(measurement.ponto_id)) || null, measurement.numero_ponto, measurement.localizacao, measurement.elemento, measurement.identificacao_fixador, measurement.requisito_nominal, measurement.limite_inferior, measurement.limite_superior, pending ? null : measurement.valor_medido, measurement.unidade, pending ? rules.RESULT.PENDENTE : measurement.resultado, measurement.selo_torque, pending ? null : measurement.observacao, JSON.stringify(extras), pending ? null : measurement.medido_em, pending ? null : measurement.responsavel_id]);
      }
      const torque = await getWithClient(client, 'SELECT * FROM folhas_verificacao_torque_config WHERE folha_id=?', [sheet.id]);
      if (torque) await execWithClient(client, `INSERT INTO folhas_verificacao_torque_config (folha_id,tenant_id,tipo_ligacao,componente,fixador,classe_material,condicao_montagem,torque_esperado,unidade,tipo_tolerancia,tolerancia,limite_inferior,limite_superior,metodo_verificacao,fonte_requisito,documento_referencia,revisao_documento,instrumento_snapshot,liberacao_excepcional)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [inserted.lastID,torque.tenant_id,torque.tipo_ligacao,torque.componente,torque.fixador,torque.classe_material,torque.condicao_montagem,torque.torque_esperado,torque.unidade,torque.tipo_tolerancia,torque.tolerancia,torque.limite_inferior,torque.limite_superior,torque.metodo_verificacao,torque.fonte_requisito,torque.documento_referencia,torque.revisao_documento,torque.instrumento_snapshot,torque.liberacao_excepcional], { returnColumn: null });
      const copiedSummary = await refreshSummary(client, { ...sheet, id: inserted.lastID, resumo: {}, resultado_lote: rules.RESULT.PENDENTE });
      await execWithClient(client, 'UPDATE folhas_verificacao SET status=?,atualizado_por=?,atualizado_em=NOW() WHERE id=?', [rules.STATUS.EM_REINSPECAO, req.usuario.id, sheet.id], { returnColumn: null });
      await history(client, { tenantId:req.tenantId, folhaId:sheet.id, action:'CORRECTION_RESOLVED', before:sheet.status, after:rules.STATUS.EM_REINSPECAO, userId:req.usuario.id, data:{ rnc_id:rnc.rnc_id, resolucao:resolution, revisao_criada:next.revisao, folha_revisao_id:inserted.lastID, conformes_preservados:copiedSummary.measured, reinspecoes_pendentes:copiedSummary.pending } });
      await history(client, { tenantId:req.tenantId, folhaId:inserted.lastID, action:'REVISION_CREATED_FROM_CORRECTION', userId:req.usuario.id, data:{ folha_origem_id:sheet.id, rnc_id:rnc.rnc_id, resolucao:resolution, revisao:next.revisao } });
      return { id:inserted.lastID, revisao:next.revisao };
    });
    res.status(201).json({ mensagem:'Correção registrada. Revisão aberta para reinspeção.', ...revision });
  } catch (error) { res.status(400).json({ erro:error.message || 'Erro ao finalizar correção.' }); }
});

router.post('/:id/reinspecoes', [auth, requireProfiles(writeProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    if (![rules.STATUS.EM_CORRECAO, rules.STATUS.EM_REINSPECAO].includes(sheet.status)) return res.status(409).json({ erro:'A folha não está em correção.' });
    if (!req.body.medicao_original_id && !req.body.resposta_original_id) return res.status(400).json({ erro:'Informe a medição ou resposta original.' });
    const result = await runQuery(`INSERT INTO folhas_verificacao_reinspecoes (tenant_id,folha_id,medicao_original_id,resposta_original_id,acao_executada,valor_corrigido,instrumento_snapshot,executado_por,dados)
      VALUES (?,?,?,?,?,?,?,?,?)`, [req.tenantId,sheet.id,req.body.medicao_original_id || null,req.body.resposta_original_id || null,req.body.acao_executada || 'Correção executada',req.body.valor_corrigido || null,JSON.stringify(req.body.instrumento || {}),req.usuario.id,JSON.stringify({ fotos_antes:req.body.fotos_antes || [],fotos_depois:req.body.fotos_depois || [] })]);
    if (sheet.status === rules.STATUS.EM_CORRECAO) await runQuery('UPDATE folhas_verificacao SET status=?,atualizado_por=? WHERE id=?', [rules.STATUS.EM_REINSPECAO,req.usuario.id,sheet.id]);
    await runQuery('INSERT INTO folhas_verificacao_historico (tenant_id,folha_id,acao,status_anterior,status_novo,dados,usuario_id) VALUES (?,?,?,?,?,?,?)', [req.tenantId,sheet.id,'REINSPECTION',sheet.status,rules.STATUS.EM_REINSPECAO,JSON.stringify({reinspecao_id:result.lastID}),req.usuario.id]);
    res.status(201).json({ id:result.lastID });
  } catch (error) { res.status(400).json({ erro:error.message || 'Erro ao registrar reinspeção.' }); }
});

router.post('/:id/liberacao-instrumento', [auth, requireProfiles(approveProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet || !assertDraft(res, sheet)) return;
    if (sheet.tipo_folha !== 'TORQUE' || !String(req.body.justificativa || '').trim()) return res.status(400).json({ erro:'Justificativa obrigatória para liberação excepcional.' });
    await runQuery('UPDATE folhas_verificacao_torque_config SET liberacao_excepcional=? WHERE folha_id=? AND tenant_id=?', [JSON.stringify({justificativa:req.body.justificativa,autorizado_por:req.usuario.id,autorizado_em:new Date().toISOString()}),sheet.id,req.tenantId]);
    await registrarAuditoria('folhas_verificacao',sheet.id,'INSTRUMENT_EXCEPTION_RELEASE',null,{justificativa:req.body.justificativa},req.usuario.id,{tenantId:req.tenantId});
    res.json({ mensagem:'Liberação excepcional registrada.' });
  } catch (error) { res.status(500).json({ erro:'Erro ao registrar liberação.' }); }
});

router.post('/:id/revisoes', [auth, requireProfiles(approveProfiles)], async (req, res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    if (sheet.status !== rules.STATUS.APROVADA) return res.status(409).json({ erro:'Somente folha aprovada pode gerar revisão.' });
    const copy = await withClient(async (client) => {
      const next = await getWithClient(client,'SELECT COALESCE(MAX(revisao),0)+1 AS revisao FROM folhas_verificacao WHERE tenant_id=? AND projeto_id=? AND tipo_folha=? AND numero=?',[req.tenantId,sheet.projeto_id,sheet.tipo_folha,sheet.numero]);
      const inserted = await execWithClient(client,`INSERT INTO folhas_verificacao (tenant_id,projeto_id,modelo_id,tipo_folha,numero,revisao,versao,status,resultado_lote,empresa_responsavel_snapshot,empresa_executante_snapshot,equipe_snapshot,identificacao,modelo_snapshot,populacao_total,unidade_populacao,amostra_prevista,criterio_aceitacao,maximo_nc,resumo,rdo_id,atividade_eap_id,folha_origem_id,criado_por,atualizado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[req.tenantId,sheet.projeto_id,sheet.modelo_id,sheet.tipo_folha,sheet.numero,next.revisao,1,rules.STATUS.RASCUNHO,rules.RESULT.PENDENTE,sheet.empresa_responsavel_snapshot,sheet.empresa_executante_snapshot,sheet.equipe_snapshot,sheet.identificacao,sheet.modelo_snapshot,sheet.populacao_total,sheet.unidade_populacao,sheet.amostra_prevista,sheet.criterio_aceitacao,sheet.maximo_nc,JSON.stringify({}),sheet.rdo_id,sheet.atividade_eap_id,sheet.id,req.usuario.id,req.usuario.id]);
      await history(client,{tenantId:req.tenantId,folhaId:inserted.lastID,action:'REVISION_CREATED',userId:req.usuario.id,data:{origem:sheet.id,revisao:next.revisao}}); return inserted.lastID;
    });
    res.status(201).json({ id:copy });
  } catch (error) { res.status(500).json({ erro:error.message || 'Erro ao criar revisão.' }); }
});

router.post('/:id/rnc', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if (!sheet) return; const link=await getQuery('SELECT rnc_id FROM folhas_verificacao_rncs WHERE folha_id=?',[sheet.id]); if (link) return res.json({id:link.rnc_id,reused:true}); const nc=await allQuery(`SELECT * FROM folhas_verificacao_medicoes WHERE folha_id=? AND resultado='NAO_CONFORME' ORDER BY id`,[sheet.id]); if (!nc.length) return res.status(409).json({erro:'Não há medições não conformes para gerar RNC.'}); const acaoCorretiva=`Corrigir os pontos não conformes da folha ${sheet.numero}, conforme o requisito técnico registrado, e realizar a reinspeção antes da liberação.`; const result=await withClient(async client=>{ const rnc=await execWithClient(client,`INSERT INTO rnc (tenant_id,projeto_id,rdo_id,titulo,descricao,gravidade,status,acao_corretiva,criado_por) VALUES (?,?,?,?,?,?,?,?,?)`,[req.tenantId,sheet.projeto_id,sheet.rdo_id || null,`Não conformidade ${sheet.numero}`,`Gerada pela Folha de Verificação ${sheet.numero}. Pontos NC: ${nc.map(x=>x.numero_ponto || x.localizacao || x.id).join(', ')}.`,req.body.gravidade || 'Média','Aberta',acaoCorretiva,req.usuario.id]); await execWithClient(client,'INSERT INTO folhas_verificacao_rncs (tenant_id,folha_id,rnc_id,dados_snapshot) VALUES (?,?,?,?)',[req.tenantId,sheet.id,rnc.lastID,JSON.stringify({origem:'Folha de Verificação',folha:sheet.numero,medicoes:nc,acao_corretiva:acaoCorretiva})]); await history(client,{tenantId:req.tenantId,folhaId:sheet.id,action:'RNC_CREATE',userId:req.usuario.id,data:{rnc_id:rnc.lastID}}); return rnc.lastID; }); res.status(201).json({id:result}); } catch(error) {res.status(409).json({erro:error.message || 'Erro ao gerar RNC.'});} });

router.post('/:id/assinaturas/:tipo', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if (!sheet) return; const type=String(req.params.tipo || '').toUpperCase(); if (!['EXECUTANTE','INSPETOR','APROVADOR'].includes(type)) return res.status(400).json({erro:'Tipo de assinatura inválido.'}); if (type==='APROVADOR' && !can(req,approveProfiles)) return res.status(403).json({erro:'Aprovador sem permissão.'}); const user=await getQuery('SELECT nome,perfil,assinatura_png FROM usuarios WHERE id=?',[req.usuario.id]); if (!user?.assinatura_png) return res.status(409).json({erro:'Cadastre sua assinatura no perfil antes de assinar.'}); await runQuery('INSERT INTO folhas_verificacao_assinaturas (tenant_id,folha_id,tipo,usuario_id,nome_snapshot,perfil_snapshot,assinatura_snapshot,versao_folha,ip) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (folha_id,tipo,versao_folha) DO UPDATE SET usuario_id=EXCLUDED.usuario_id,nome_snapshot=EXCLUDED.nome_snapshot,perfil_snapshot=EXCLUDED.perfil_snapshot,assinatura_snapshot=EXCLUDED.assinatura_snapshot,ip=EXCLUDED.ip,assinado_em=NOW()',[req.tenantId,sheet.id,type,req.usuario.id,user.nome,user.perfil,user.assinatura_png,sheet.versao,req.ip]); res.json({mensagem:'Assinatura registrada.'}); } catch(error) {res.status(500).json({erro:error.message || 'Erro ao assinar.'});} });

router.post('/:id/evidencias', [auth, requireProfiles(writeProfiles), evidenceUpload.single('arquivo')], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if (!sheet) return; if (!req.file) return res.status(400).json({erro:'Arquivo obrigatório.'}); const stored=path.posix.join(`tenant_${req.tenantId}`,req.file.filename); const result=await runQuery('INSERT INTO folhas_verificacao_evidencias (tenant_id,projeto_id,folha_id,medicao_id,resposta_id,categoria,nome_arquivo,caminho_arquivo,tipo,tamanho,descricao,localizacao,criado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[req.tenantId,sheet.projeto_id,sheet.id,req.body.medicao_id || null,req.body.resposta_id || null,req.body.categoria || 'EVIDENCIA',req.file.originalname,stored,req.file.mimetype,req.file.size,req.body.descricao || null,JSON.stringify(req.body.localizacao ? parseJson(req.body.localizacao) : null),req.usuario.id]); res.status(201).json({id:result.lastID,caminho_arquivo:stored}); } catch(error) { if(req.file?.path) fs.unlink(req.file.path,()=>{}); res.status(500).json({erro:error.message || 'Erro ao enviar evidência.'});} });

router.delete('/:id/evidencias/:evidenciaId', [auth, requireProfiles(writeProfiles)], async (req,res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    if (!['RASCUNHO', 'EM_CORRECAO', 'EM_REINSPECAO'].includes(sheet.status)) return res.status(409).json({ erro: 'Anexos não podem ser alterados após a aprovação da folha.' });
    const evidence = await getQuery('SELECT * FROM folhas_verificacao_evidencias WHERE id=? AND folha_id=? AND tenant_id=?', [Number(req.params.evidenciaId), sheet.id, req.tenantId]);
    if (!evidence) return res.status(404).json({ erro: 'Anexo não encontrado.' });
    await runQuery('DELETE FROM folhas_verificacao_evidencias WHERE id=? AND folha_id=? AND tenant_id=?', [evidence.id, sheet.id, req.tenantId]);
    const storedPath = path.resolve(uploadsDir, String(evidence.caminho_arquivo || '').replace(/\\/g, '/'));
    const uploadsRoot = path.resolve(uploadsDir);
    if (storedPath.startsWith(`${uploadsRoot}${path.sep}`) && fs.existsSync(storedPath)) fs.unlink(storedPath, () => {});
    res.json({ mensagem: 'Anexo removido.' });
  } catch (error) { res.status(500).json({ erro: error.message || 'Erro ao remover anexo.' }); }
});

router.get('/:id/pdf', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if(!sheet) return; const pdf=await generateFolhaVerificacaoPdfBuffer(sheet.id); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="${pdf.filename}"`); res.send(pdf.buffer); } catch(error) {res.status(500).json({erro:error.message || 'Erro ao gerar PDF.'});} });

router.delete('/:id', [auth, requireProfiles(writeProfiles)], async (req,res) => { try { const sheet=await assertSheetAccess(req,res,req.params.id); if(!sheet || !assertDraft(res,sheet)) return; if(String(sheet.criado_por)!==String(req.usuario.id) && !can(req,approveProfiles)) return res.status(403).json({erro:'Somente criador ou gestor pode excluir rascunho.'}); await runQuery('DELETE FROM folhas_verificacao WHERE id=? AND tenant_id=?',[sheet.id,req.tenantId]); await registrarAuditoria('folhas_verificacao',sheet.id,'DELETE',sheet,null,req.usuario.id,{tenantId:req.tenantId}); res.json({mensagem:'Rascunho removido.'}); } catch {res.status(500).json({erro:'Erro ao remover rascunho.'});} });

// Vincula uma RNC criada pelo formulário padrão à folha que originou a NC.
router.post('/:id/rnc/vincular', [auth, requireProfiles(writeProfiles)], async (req,res) => {
  try {
    const sheet = await assertSheetAccess(req, res, req.params.id); if (!sheet) return;
    const rncId = Number(req.body?.rnc_id);
    if (!Number.isInteger(rncId) || rncId < 1) return res.status(400).json({ erro:'RNC inválida.' });
    const nc = await allQuery(`SELECT * FROM folhas_verificacao_medicoes WHERE folha_id=? AND resultado='NAO_CONFORME' ORDER BY id`, [sheet.id]);
    if (!nc.length) return res.status(409).json({ erro:'Não há medições não conformes para vincular à RNC.' });
    const result = await withClient(async (client) => {
      const existing = await getWithClient(client, 'SELECT rnc_id FROM folhas_verificacao_rncs WHERE folha_id=?', [sheet.id]);
      if (existing) {
        if (Number(existing.rnc_id) === rncId) return rncId;
        throw new Error('Esta folha já possui uma RNC vinculada.');
      }
      const rnc = await getWithClient(client, 'SELECT id,projeto_id FROM rnc WHERE id=? AND tenant_id=?', [rncId, req.tenantId]);
      if (!rnc || Number(rnc.projeto_id) !== Number(sheet.projeto_id)) throw new Error('A RNC deve pertencer ao mesmo projeto da folha.');
      await execWithClient(client, 'INSERT INTO folhas_verificacao_rncs (tenant_id,folha_id,rnc_id,dados_snapshot) VALUES (?,?,?,?)', [req.tenantId, sheet.id, rncId, JSON.stringify({ origem:'Folha de Verificação', folha:sheet.numero, medicoes:nc })]);
      await history(client, { tenantId:req.tenantId, folhaId:sheet.id, action:'RNC_LINKED', userId:req.usuario.id, data:{ rnc_id:rncId } });
      return rncId;
    });
    return res.status(201).json({ id:result });
  } catch (error) { return res.status(409).json({ erro:error.message || 'Erro ao vincular RNC.' }); }
});

module.exports = router;

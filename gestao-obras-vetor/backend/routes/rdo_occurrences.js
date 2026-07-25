const express = require('express');
const { auth } = require('../middleware/auth');
const { allQuery, getQuery, runQuery } = require('../config/database');
const {
  OCCURRENCE_CATEGORIES,
  OCCURRENCE_IMPACTS,
  hydrateOccurrences,
  syncOccurrences,
  assertEditable
} = require('../services/rdoOccurrenceService');

const router = express.Router();

const sendError = (res, error) => res.status(error.status || 400).json({ erro: error.message || 'Não foi possível processar a ocorrência.' });

router.get('/ocorrencias/configuracao', auth, (_req, res) => {
  res.json({ categorias: OCCURRENCE_CATEGORIES, impactos: OCCURRENCE_IMPACTS, gravidades: ['Baixa', 'Média', 'Alta', 'Crítica'] });
});

router.get('/:rdoId/ocorrencias', auth, async (req, res) => {
  try {
    const rdo = await getQuery('SELECT id FROM rdos WHERE id = ? AND tenant_id = ?', [req.params.rdoId, req.tenantId]);
    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado no tenant ativo.' });
    res.json(await hydrateOccurrences(req.params.rdoId));
  } catch (error) { sendError(res, error); }
});

// Sincroniza a coleção inteira em uma única chamada: evita duplicação por inserções incrementais.
router.put('/:rdoId/ocorrencias', auth, async (req, res) => {
  try {
    const rdo = await getQuery('SELECT projeto_id, data_relatorio FROM rdos WHERE id = ? AND tenant_id = ?', [req.params.rdoId, req.tenantId]);
    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado no tenant ativo.' });
    const ocorrencias = await syncOccurrences({
      rdoId: Number(req.params.rdoId), projetoId: rdo.projeto_id, tenantId: req.tenantId,
      user: req.usuario, occurrences: req.body?.ocorrencias, semOcorrencias: req.body?.sem_ocorrencias === true,
      dataRelatorio: rdo.data_relatorio
    });
    res.json({ mensagem: 'Ocorrências sincronizadas.', ocorrencias });
  } catch (error) { sendError(res, error); }
});

router.post('/:rdoId/ocorrencias', auth, async (req, res) => {
  try {
    const rdo = await assertEditable(Number(req.params.rdoId), req.usuario, req.tenantId);
    const current = await hydrateOccurrences(rdo.id);
    const ocorrencias = await syncOccurrences({ rdoId: rdo.id, projetoId: rdo.projeto_id, tenantId: req.tenantId, user: req.usuario, occurrences: [...current, req.body], semOcorrencias: false, dataRelatorio: rdo.data_relatorio });
    res.status(201).json({ ocorrencia: ocorrencias[ocorrencias.length - 1], ocorrencias });
  } catch (error) { sendError(res, error); }
});

router.get('/:rdoId/ocorrencias/:ocorrenciaId', auth, async (req, res) => {
  try {
    const rdo = await getQuery('SELECT id FROM rdos WHERE id = ? AND tenant_id = ?', [req.params.rdoId, req.tenantId]);
    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado no tenant ativo.' });
    const occurrence = (await hydrateOccurrences(rdo.id)).find((item) => Number(item.id) === Number(req.params.ocorrenciaId));
    if (!occurrence) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
    res.json(occurrence);
  } catch (error) { sendError(res, error); }
});

router.put('/:rdoId/ocorrencias/:ocorrenciaId', auth, async (req, res) => {
  try {
    const rdo = await assertEditable(Number(req.params.rdoId), req.usuario, req.tenantId);
    const current = await hydrateOccurrences(rdo.id);
    const target = current.find((item) => Number(item.id) === Number(req.params.ocorrenciaId));
    if (!target) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
    const ocorrencias = await syncOccurrences({ rdoId: rdo.id, projetoId: rdo.projeto_id, tenantId: req.tenantId, user: req.usuario, occurrences: current.map((item) => Number(item.id) === Number(target.id) ? { ...item, ...req.body, id: target.id } : item), semOcorrencias: false, dataRelatorio: rdo.data_relatorio });
    res.json({ ocorrencia: ocorrencias.find((item) => Number(item.id) === Number(target.id)), ocorrencias });
  } catch (error) { sendError(res, error); }
});

router.delete('/:rdoId/ocorrencias/:ocorrenciaId', auth, async (req, res) => {
  try {
    const rdo = await assertEditable(Number(req.params.rdoId), req.usuario, req.tenantId);
    const current = await hydrateOccurrences(rdo.id);
    if (!current.some((item) => Number(item.id) === Number(req.params.ocorrenciaId))) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
    const ocorrencias = await syncOccurrences({ rdoId: rdo.id, projetoId: rdo.projeto_id, tenantId: req.tenantId, user: req.usuario, occurrences: current.filter((item) => Number(item.id) !== Number(req.params.ocorrenciaId)), semOcorrencias: false, dataRelatorio: rdo.data_relatorio });
    res.json({ mensagem: 'Ocorrência excluída.', ocorrencias });
  } catch (error) { sendError(res, error); }
});

router.post('/:rdoId/ocorrencias/:ocorrenciaId/duplicar', auth, async (req, res) => {
  try {
    const rdo = await assertEditable(Number(req.params.rdoId), req.usuario, req.tenantId);
    const occurrences = await hydrateOccurrences(rdo.id);
    const source = occurrences.find((item) => Number(item.id) === Number(req.params.ocorrenciaId));
    if (!source) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
    const copy = { ...source, id: null, titulo: source.titulo ? `${source.titulo} (cópia)` : 'Cópia de ocorrência' };
    const saved = await syncOccurrences({ rdoId: rdo.id, projetoId: rdo.projeto_id, tenantId: req.tenantId, user: req.usuario, occurrences: [...occurrences, copy], semOcorrencias: false, dataRelatorio: rdo.data_relatorio });
    res.status(201).json({ mensagem: 'Ocorrência duplicada.', ocorrencias: saved });
  } catch (error) { sendError(res, error); }
});

router.get('/:rdoId/ocorrencias/:ocorrenciaId/historico', auth, async (req, res) => {
  try {
    const rdo = await getQuery('SELECT id FROM rdos WHERE id = ? AND tenant_id = ?', [req.params.rdoId, req.tenantId]);
    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado no tenant ativo.' });
    const history = await allQuery(`SELECT h.*, u.nome AS usuario_nome FROM rdo_ocorrencia_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.ocorrencia_id = ? ORDER BY h.criado_em DESC, h.id DESC`, [req.params.ocorrenciaId]);
    res.json(history);
  } catch (error) { sendError(res, error); }
});

// Arquivos são enviados pelas rotas existentes de fotos/anexos; aqui apenas se vincula uma evidência já pertencente ao RDO.
router.post('/:rdoId/ocorrencias/:ocorrenciaId/evidencias', auth, async (req, res) => {
  try {
    const rdo = await assertEditable(Number(req.params.rdoId), req.usuario, req.tenantId);
    const occurrence = await getQuery('SELECT id FROM rdo_ocorrencias WHERE id = ? AND rdo_id = ?', [req.params.ocorrenciaId, rdo.id]);
    if (!occurrence) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
    const anexoId = req.body?.anexo_id ? Number(req.body.anexo_id) : null;
    const fotoId = req.body?.rdo_foto_id ? Number(req.body.rdo_foto_id) : null;
    if ((anexoId && fotoId) || (!anexoId && !fotoId)) return res.status(400).json({ erro: 'Informe uma foto ou um anexo da evidência.' });
    if (anexoId && !(await getQuery('SELECT id FROM anexos WHERE id = ? AND rdo_id = ?', [anexoId, rdo.id]))) return res.status(400).json({ erro: 'Anexo não pertence ao RDO.' });
    if (fotoId && !(await getQuery('SELECT id FROM rdo_fotos WHERE id = ? AND rdo_id = ?', [fotoId, rdo.id]))) return res.status(400).json({ erro: 'Foto não pertence ao RDO.' });
    const momento = ['antes', 'durante', 'depois'].includes(req.body?.momento) ? req.body.momento : 'durante';
    const result = await runQuery('INSERT INTO rdo_ocorrencia_evidencias (ocorrencia_id, anexo_id, rdo_foto_id, legenda, momento, atividade_eap_id, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)', [occurrence.id, anexoId, fotoId, String(req.body?.legenda || '').trim() || null, momento, req.body?.atividade_eap_id || null, req.usuario.id]);
    res.status(201).json({ id: result.lastID, mensagem: 'Evidência vinculada.' });
  } catch (error) { sendError(res, error); }
});

router.delete('/:rdoId/ocorrencias/:ocorrenciaId/evidencias/:evidenciaId', auth, async (req, res) => {
  try {
    await assertEditable(Number(req.params.rdoId), req.usuario, req.tenantId);
    await runQuery('DELETE FROM rdo_ocorrencia_evidencias WHERE id = ? AND ocorrencia_id = ?', [req.params.evidenciaId, req.params.ocorrenciaId]);
    res.json({ mensagem: 'Evidência desvinculada.' });
  } catch (error) { sendError(res, error); }
});

module.exports = router;

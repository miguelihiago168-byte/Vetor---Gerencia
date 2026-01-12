const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, allQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');

const router = express.Router();

// Uploads config (reusing backend/uploads)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Adicionar mão de obra a um RDO (registro de horário)
router.post('/rdo/:rdoId/mao_obra', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { mao_obra_id, horario_entrada, horario_saida_almoco, horario_retorno_almoco, horario_saida_final } = req.body;

    const toMinutes = (t) => {
      if (!t) return null;
      const m = t.match(/(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1],10) * 60 + parseInt(m[2],10);
    };

    const inicio = toMinutes(horario_entrada);
    const fim = toMinutes(horario_saida_final);
    const intInicio = toMinutes(horario_saida_almoco);
    const intFim = toMinutes(horario_retorno_almoco);

    let total = 0;
    if (inicio != null && fim != null && fim > inicio) {
      total = Math.max(0, fim - inicio);
      if (intInicio != null && intFim != null && intFim > intInicio) total = Math.max(0, total - (intFim - intInicio));
    }
    const horas = Math.round((total / 60) * 100) / 100;

    const result = await runQuery(`
      INSERT INTO rdo_mao_obra (rdo_id, mao_obra_id, horario_entrada, horario_saida_almoco, horario_retorno_almoco, horario_saida_final, horas_trabalhadas)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [rdoId, mao_obra_id, horario_entrada, horario_saida_almoco, horario_retorno_almoco, horario_saida_final, horas]);

    res.status(201).json({ mensagem: 'Mão de obra vinculada ao RDO', id: result.lastID, horas_trabalhadas: horas });
  } catch (err) {
    console.error('Erro ao vincular mão de obra', err);
    res.status(500).json({ erro: 'Erro ao vincular mão de obra.' });
  }
});

// Listar mao_obra vinculada a um RDO
router.get('/rdo/:rdoId/mao_obra', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const rows = await allQuery('SELECT rmo.*, mo.nome, mo.funcao FROM rdo_mao_obra rmo LEFT JOIN mao_obra mo ON rmo.mao_obra_id = mo.id WHERE rmo.rdo_id = ? ORDER BY rmo.id', [rdoId]);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar mão de obra do RDO', err);
    res.status(500).json({ erro: 'Erro ao listar.' });
  }
});

// Clima: criar/atualizar
router.post('/rdo/:rdoId/clima', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { periodo, condicao_tempo, condicao_trabalho, pluviometria_mm } = req.body;
    if (!periodo) return res.status(400).json({ erro: 'Período requerido.' });

    // Upsert: se já existir registro para periodo neste rdo, atualizar
    const existe = await getQuery('SELECT id FROM rdo_clima WHERE rdo_id = ? AND periodo = ?', [rdoId, periodo]);
    if (existe) {
      await runQuery('UPDATE rdo_clima SET condicao_tempo = ?, condicao_trabalho = ?, pluviometria_mm = ?, criado_em = CURRENT_TIMESTAMP WHERE id = ?', [condicao_tempo, condicao_trabalho, pluviometria_mm || 0, existe.id]);
      return res.json({ mensagem: 'Clima atualizado.' });
    }

    const result = await runQuery('INSERT INTO rdo_clima (rdo_id, periodo, condicao_tempo, condicao_trabalho, pluviometria_mm) VALUES (?, ?, ?, ?, ?)', [rdoId, periodo, condicao_tempo || null, condicao_trabalho || null, pluviometria_mm || 0]);
    res.status(201).json({ mensagem: 'Clima registrado.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar clima', err);
    res.status(500).json({ erro: 'Erro ao registrar clima.' });
  }
});

// Comentários
router.post('/rdo/:rdoId/comentario', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { comentario } = req.body;
    if (!comentario) return res.status(400).json({ erro: 'Comentario vazio.' });
    const result = await runQuery('INSERT INTO rdo_comentarios (rdo_id, usuario_id, comentario) VALUES (?, ?, ?)', [rdoId, req.usuario.id, comentario]);
    res.status(201).json({ mensagem: 'Comentário adicionado.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao adicionar comentario', err);
    res.status(500).json({ erro: 'Erro ao adicionar comentário.' });
  }
});

// Materiais
router.post('/rdo/:rdoId/material', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { nome_material, quantidade, unidade } = req.body;
    if (!nome_material) return res.status(400).json({ erro: 'Nome do material requerido.' });
    const result = await runQuery('INSERT INTO rdo_materiais (rdo_id, nome_material, quantidade, unidade) VALUES (?, ?, ?, ?)', [rdoId, nome_material, quantidade || 0, unidade || null]);
    res.status(201).json({ mensagem: 'Material registrado.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar material', err);
    res.status(500).json({ erro: 'Erro ao registrar material.' });
  }
});

// Ocorrências
router.post('/rdo/:rdoId/ocorrencia', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { titulo, descricao, gravidade } = req.body;
    if (!descricao) return res.status(400).json({ erro: 'Descrição requerida.' });
    const result = await runQuery('INSERT INTO rdo_ocorrencias (rdo_id, titulo, descricao, gravidade, criado_por) VALUES (?, ?, ?, ?, ?)', [rdoId, titulo || null, descricao, gravidade || null, req.usuario.id]);
    res.status(201).json({ mensagem: 'Ocorrência registrada.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar ocorrencia', err);
    res.status(500).json({ erro: 'Erro ao registrar ocorrencia.' });
  }
});

// Assinaturas (registro simples)
router.post('/rdo/:rdoId/assinatura', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { tipo, arquivo_assinatura } = req.body;
    if (!tipo) return res.status(400).json({ erro: 'Tipo requerido.' });
    const result = await runQuery('INSERT INTO rdo_assinaturas (rdo_id, usuario_id, tipo, arquivo_assinatura) VALUES (?, ?, ?, ?)', [rdoId, req.usuario.id, tipo, arquivo_assinatura || null]);
    res.status(201).json({ mensagem: 'Assinatura registrada.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar assinatura', err);
    res.status(500).json({ erro: 'Erro ao registrar assinatura.' });
  }
});

// Upload de fotos vinculadas a atividade do RDO
router.post('/rdo/:rdoId/foto', auth, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    const { rdoId } = req.params;
    const { rdo_atividade_id, descricao } = req.body;
    const { originalname, filename, mimetype, size } = req.file;

    // Salvar no table rdo_fotos
    const result = await runQuery('INSERT INTO rdo_fotos (rdo_id, rdo_atividade_id, nome_arquivo, caminho_arquivo, descricao, criado_por) VALUES (?, ?, ?, ?, ?, ?)', [rdoId, rdo_atividade_id || null, originalname, filename, descricao || null, req.usuario.id]);

    // Também manter em anexos para download se necessário
    await runQuery('INSERT INTO anexos (rdo_id, tipo, nome_arquivo, caminho_arquivo, tamanho) VALUES (?, ?, ?, ?, ?)', [rdoId, mimetype, originalname, filename, size]);

    // Retornar informação do arquivo para o frontend
    res.status(201).json({ mensagem: 'Foto enviada.', id: result.lastID, arquivo: { nome_arquivo: originalname, caminho_arquivo: filename } });
  } catch (err) {
    console.error('Erro ao enviar foto', err);
    res.status(500).json({ erro: 'Erro ao enviar foto.' });
  }
});

module.exports = router;

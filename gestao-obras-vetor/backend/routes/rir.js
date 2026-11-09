const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { auth } = require('../middleware/auth');
const { inferirPerfil } = require('../constants/access');
const { allQuery, getQuery, runQuery, withClient, getWithClient, execWithClient } = require('../config/database');
const { generateRirPdfBuffer } = require('../services/rirPdfService');

const router = express.Router();
router.use(auth);
const viewRoles = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Almoxarife'];
const editRoles = ['ADM', 'Gestor Geral', 'Gestor da Qualidade', 'Almoxarife'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const root = path.resolve(__dirname, '..', 'uploads', 'rir');
const fields = ['fornecedor', 'data', 'pedido_compra', 'nota_fiscal', 'romaneio', 'veiculo', 'placa_veiculo', 'placa_carreta', 'motorista', 'transportadora', 'situacao_carga', 'condicoes_descarga', 'equipamentos', 'observacoes', 'conclusao', 'conformidade'];
const error = (res, err) => { console.error('[rir]', err); res.status(err.status || 400).json({ erro: err.message || 'Erro ao processar o RIR.' }); };
const deny = (message, status = 403) => Object.assign(new Error(message), { status });
async function access(req, projetoId, write = false) {
  const role = inferirPerfil(req.usuario);
  if (!(write ? editRoles : viewRoles).includes(role)) throw deny('Sem permissão para acessar o RIR.');
  const project = await getQuery('SELECT id, nome FROM projetos WHERE id=? AND tenant_id=?', [Number(projetoId), req.tenantId]);
  if (!project) throw deny('Obra não encontrada.', 404);
  if (!['ADM', 'Gestor Geral'].includes(role) && !(await getQuery('SELECT id FROM projeto_usuarios WHERE projeto_id=? AND usuario_id=? LIMIT 1', [project.id, req.usuario.id]))) throw deny('Sem acesso a esta obra.');
  return project;
}
async function report(req, id, write = false) {
  const row = await getQuery('SELECT * FROM rir_relatorios WHERE id=? AND tenant_id=?', [Number(id), req.tenantId]);
  if (!row) throw deny('RIR não encontrado.', 404);
  const project = await access(req, row.projeto_id, write);
  const [itens, anexos] = await Promise.all([
    allQuery(`SELECT ri.*, COALESCE(ri.descricao, i.nome) AS descricao, COALESCE(ri.unidade, i.unidade) AS unidade,
      COALESCE(ri.quantidade, ri.quantidade_prevista) AS quantidade, COALESCE(ri.quantidade_total, ri.quantidade_prevista) AS quantidade_total,
      l.lote, l.status_qualidade FROM rir_itens ri LEFT JOIN estoque_lotes l ON l.id=ri.lote_id AND l.tenant_id=ri.tenant_id
      LEFT JOIN estoque_insumos i ON i.id=l.insumo_id WHERE ri.rir_id=? AND ri.tenant_id=? ORDER BY ri.id`, [row.id, req.tenantId]),
    allQuery('SELECT id, nome, tipo, legenda FROM rir_anexos WHERE rir_id=? AND tenant_id=? ORDER BY id', [row.id, req.tenantId])
  ]);
  return { ...row, projeto_nome: project.nome, itens, anexos };
}
function validateItem(item) {
  const descricao = String(item.descricao || '').trim(); const unidade = String(item.unidade || '').trim();
  if (!descricao || !unidade) throw new Error('Informe a descrição e a unidade de cada item.');
  const number = (value, label, positive = false) => {
    if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || (positive && Number(value) === 0)) throw new Error(`${label} inválida. ${positive ? 'Informe um valor maior que zero.' : 'Informe um valor igual ou maior que zero.'}`);
    return Number(value);
  };
  return { codigo: String(item.codigo || '').trim(), descricao, unidade, quantidade: number(item.quantidade, 'Quantidade'), quantidade_recebida: number(item.quantidade_recebida, 'Quantidade recebida'), quantidade_total: number(item.quantidade_total, 'Quantidade total', true) };
}
async function insertItem(client, req, rirId, item) {
  const data = validateItem(item);
  await execWithClient(client, 'INSERT INTO rir_itens (tenant_id,rir_id,codigo,descricao,unidade,quantidade,quantidade_recebida,quantidade_total) VALUES (?,?,?,?,?,?,?,?)', [req.tenantId, rirId, data.codigo, data.descricao, data.unidade, data.quantidade, data.quantidade_recebida, data.quantidade_total]);
}
router.get('/projeto/:projetoId', async (req, res) => { try {
  await access(req, req.params.projetoId);
  res.json(await allQuery('SELECT r.*, (SELECT COUNT(*) FROM rir_itens i WHERE i.rir_id=r.id AND i.tenant_id=r.tenant_id) AS total_itens FROM rir_relatorios r WHERE r.tenant_id=? AND r.projeto_id=? ORDER BY r.id DESC', [req.tenantId, Number(req.params.projetoId)]));
} catch (e) { error(res, e); } });
router.get('/projeto/:projetoId/entradas', async (req, res) => { try {
  const project = await access(req, req.params.projetoId);
  res.json(await allQuery(`SELECT l.id, l.lote, l.nota_fiscal, l.fornecedor_nome, i.nome, i.unidade,
    COALESCE(old.quantidade_recebida, (SELECT SUM(m.quantidade) FROM estoque_movimentacoes m WHERE m.lote_id=l.id AND m.tenant_id=l.tenant_id AND m.projeto_destino_id=? AND m.tipo='ENTRADA_COMPRA')) AS quantidade_recebida FROM estoque_lotes l
    JOIN estoque_insumos i ON i.id=l.insumo_id
    LEFT JOIN material_recebimentos old ON old.id=l.material_recebimento_id AND old.tenant_id=l.tenant_id AND old.projeto_id=?
    WHERE l.tenant_id=? AND (old.id IS NOT NULL OR EXISTS (SELECT 1 FROM estoque_movimentacoes m WHERE m.lote_id=l.id AND m.tenant_id=l.tenant_id AND m.projeto_destino_id=? AND m.tipo='ENTRADA_COMPRA'))
      AND NOT EXISTS (SELECT 1 FROM rir_itens ri WHERE ri.tenant_id=l.tenant_id AND ri.lote_id=l.id)
    ORDER BY l.id DESC`, [project.id, project.id, req.tenantId, project.id]));
} catch (e) { error(res, e); } });
router.get('/:id', async (req, res) => { try { res.json(await report(req, req.params.id)); } catch (e) { error(res, e); } });
router.post('/', async (req, res) => { try {
  const body = req.body || {}; const project = await access(req, body.projeto_id, true);
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (!itens.length) throw new Error('Adicione pelo menos um item.');
  const dados = Object.fromEntries(fields.map(key => [key, String(body.dados?.[key] || '').trim()]));
  const id = await withClient(async client => {
    const created = await execWithClient(client, 'INSERT INTO rir_relatorios (tenant_id,projeto_id,dados,criado_por) VALUES (?,?,?,?)', [req.tenantId, project.id, JSON.stringify(dados), req.usuario.id]);
    for (const item of itens) await insertItem(client, req, created.lastID, item);
    return created.lastID;
  });
  res.status(201).json(await report(req, id));
} catch (e) { if (e.code === '23505') e.message = 'Uma das entradas já está vinculada a outro RIR.'; error(res, e); } });
router.put('/:id', async (req, res) => { try {
  const existing = await report(req, req.params.id, true);
  const dados = Object.fromEntries(fields.map(key => [key, String(req.body?.dados?.[key] || '').trim()]));
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) throw new Error('Adicione pelo menos um item.');
  const ids = itens.filter(item => item.id != null).map(item => Number(item.id));
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0 || !existing.itens.some(old => Number(old.id) === id)) || new Set(ids).size !== ids.length) throw new Error('Identificação de item inválida.');
  await withClient(async client => {
    await getWithClient(client, 'SELECT id FROM rir_relatorios WHERE id=? AND tenant_id=? FOR UPDATE', [existing.id, req.tenantId]);
    await execWithClient(client, 'UPDATE rir_relatorios SET dados=?, atualizado_em=NOW() WHERE id=? AND tenant_id=?', [JSON.stringify(dados), Number(req.params.id), req.tenantId]);
    for (const old of existing.itens) if (!ids.includes(Number(old.id))) await execWithClient(client, 'DELETE FROM rir_itens WHERE id=? AND rir_id=? AND tenant_id=?', [old.id, existing.id, req.tenantId]);
    for (const item of itens) {
      if (item.id == null) { await insertItem(client, req, existing.id, item); continue; }
      const data = validateItem(item);
      await execWithClient(client, 'UPDATE rir_itens SET codigo=?, descricao=?, unidade=?, quantidade=?, quantidade_recebida=?, quantidade_total=? WHERE id=? AND rir_id=? AND tenant_id=?', [data.codigo, data.descricao, data.unidade, data.quantidade, data.quantidade_recebida, data.quantidade_total, Number(item.id), existing.id, req.tenantId]);
    }
  });
  res.json(await report(req, req.params.id));
} catch (e) { if (e.code === '23505') e.message = 'Uma das entradas já está vinculada a outro RIR.'; error(res, e); } });
router.post('/:id/anexos', upload.single('arquivo'), async (req, res) => { let filePath; try {
  const row = await report(req, req.params.id, true);
  if (!req.file || !['image/jpeg', 'image/png', 'application/pdf'].includes(req.file.mimetype)) throw new Error('Anexe uma imagem JPEG ou PNG, ou um PDF.');
  const bytes = req.file.buffer;
  const valid = req.file.mimetype === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) : req.file.mimetype === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.subarray(0, 5).toString() === '%PDF-';
  if (!valid) throw new Error('O conteúdo do arquivo não corresponde ao tipo informado.');
  if (req.file.mimetype.startsWith('image/')) {
    try { const probe = new PDFDocument(); probe.image(bytes, { fit: [1, 1] }); probe.end(); }
    catch (_) { throw new Error('A imagem está inválida ou não pode ser usada no relatório.'); }
  }
  const dir = path.join(root, String(req.tenantId)); fs.mkdirSync(dir, { recursive: true });
  filePath = path.join(dir, crypto.randomBytes(20).toString('hex'));
  fs.writeFileSync(filePath, req.file.buffer);
  await runQuery('INSERT INTO rir_anexos (tenant_id,rir_id,caminho,nome,tipo,legenda,criado_por) VALUES (?,?,?,?,?,?,?)', [req.tenantId, row.id, filePath, path.basename(req.file.originalname), req.file.mimetype, String(req.body.legenda || ''), req.usuario.id]);
  res.status(201).json(await report(req, row.id));
} catch (e) { if (filePath) fs.unlink(filePath, () => {}); error(res, e); } });
router.get('/:id/anexos/:anexoId', async (req, res) => { try {
  await report(req, req.params.id);
  const a = await getQuery('SELECT * FROM rir_anexos WHERE id=? AND rir_id=? AND tenant_id=?', [Number(req.params.anexoId), Number(req.params.id), req.tenantId]);
  if (!a) throw deny('Anexo não encontrado.', 404);
  res.type(a.tipo); res.setHeader('Content-Disposition', `inline; filename="${String(a.nome).replace(/[^a-zA-Z0-9._-]/g, '_')}"`); res.sendFile(a.caminho);
} catch (e) { error(res, e); } });
router.delete('/:id/anexos/:anexoId', async (req, res) => { try {
  await report(req, req.params.id, true);
  const a = await getQuery('SELECT * FROM rir_anexos WHERE id=? AND rir_id=? AND tenant_id=?', [Number(req.params.anexoId), Number(req.params.id), req.tenantId]);
  if (!a) throw deny('Anexo não encontrado.', 404);
  await runQuery('DELETE FROM rir_anexos WHERE id=? AND tenant_id=?', [a.id, req.tenantId]); fs.unlink(a.caminho, () => {}); res.json(await report(req, req.params.id));
} catch (e) { error(res, e); } });
router.get('/:id/pdf', async (req, res) => { try {
  const row = await report(req, req.params.id);
  const photos = await allQuery("SELECT * FROM rir_anexos WHERE rir_id=? AND tenant_id=? AND tipo IN ('image/jpeg','image/png') ORDER BY id", [row.id, req.tenantId]);
  const pdf = await generateRirPdfBuffer(row, photos);
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="RIR-${row.id}.pdf"`); res.send(pdf);
} catch (e) { if (!res.headersSent) error(res, e); else res.destroy(e); } });
module.exports = router;

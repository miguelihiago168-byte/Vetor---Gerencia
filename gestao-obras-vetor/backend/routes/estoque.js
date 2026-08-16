const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');
const { inferirPerfil } = require('../constants/access');
const { withClient, getQuery, allQuery, getWithClient, allWithClient, execWithClient } = require('../config/database');
const { normalizarNomeInsumo } = require('../utils/estoque');

const router = express.Router();
router.use(auth);

const PERFIS_VISUALIZACAO = ['ADM', 'Financeiro', 'Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Almoxarife'];
const PERFIS_OPERACAO = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
const PERFIS_GLOBAIS = ['ADM', 'Gestor Geral'];

const uploadsDir = path.join(__dirname, '..', 'uploads', 'estoque');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
  })
});

const fail = (res, status, erro) => res.status(status).json({ erro });
const perfil = (req) => inferirPerfil(req.usuario);
const isGlobal = (req) => PERFIS_GLOBAIS.includes(perfil(req));
const local = (projetoId) => projetoId ? { chave: `OBRA:${Number(projetoId)}`, tipo: 'OBRA', projetoId: Number(projetoId) } : { chave: 'CENTRAL', tipo: 'CENTRAL', projetoId: null };

const ensureView = (req, res) => {
  if (!PERFIS_VISUALIZACAO.includes(perfil(req))) { fail(res, 403, 'Sem permissao para consultar o estoque.'); return false; }
  return true;
};
const ensureOperation = (req, res) => {
  if (!PERFIS_OPERACAO.includes(perfil(req))) { fail(res, 403, 'Sem permissao para movimentar o estoque.'); return false; }
  return true;
};
const isBusinessApprover = (req) => [PERFIS.ADM, PERFIS.GESTOR_GERAL].includes(perfil(req));
const isWarehouseOperator = (req) => [PERFIS.ALMOXARIFE, PERFIS.ADM, PERFIS.GESTOR_GERAL].includes(perfil(req));
const isLocalManager = (req) => perfil(req) === PERFIS.GESTOR_OBRA;
const canAccessProject = async (req, projetoId) => {
  if (!projetoId || isGlobal(req)) return true;
  const row = await getQuery('SELECT id FROM projeto_usuarios WHERE projeto_id=? AND usuario_id=? LIMIT 1', [Number(projetoId), req.usuario.id]);
  return Boolean(row);
};
const canAccessLocation = async (req, location) => location.tipo === 'CENTRAL' ? PERFIS_OPERACAO.includes(perfil(req)) : canAccessProject(req, location.projetoId);
const getProject = (id, tenantId) => getQuery('SELECT id, nome FROM projetos WHERE id=? AND tenant_id=? AND ativo=1', [Number(id), tenantId]);

const listTransferItems = (transferId) => allQuery(`
  SELECT ti.*, l.nota_fiscal, l.lote, l.fornecedor_nome, pe.dados_compra, i.nome, i.unidade
  FROM estoque_transferencia_itens ti
  JOIN estoque_lotes l ON l.id=ti.lote_id
  JOIN estoque_insumos i ON i.id=l.insumo_id
  LEFT JOIN estoque_pendencias_recebimento pe ON pe.id=l.pendencia_recebimento_id
  WHERE ti.transferencia_id=? ORDER BY ti.id
`, [transferId]);

const hydrateTransfer = async (id, tenantId) => {
  const transfer = await getQuery(`
    SELECT t.*, po.nome AS origem_obra_nome, pd.nome AS destino_obra_nome,
      us.nome AS solicitante_nome, uo.nome AS aprovada_origem_nome, ud.nome AS recebida_destino_nome
    FROM estoque_transferencias t
    LEFT JOIN projetos po ON po.id=t.origem_projeto_id
    LEFT JOIN projetos pd ON pd.id=t.destino_projeto_id
    LEFT JOIN usuarios us ON us.id=t.solicitada_por
    LEFT JOIN usuarios uo ON uo.id=t.aprovada_origem_por
    LEFT JOIN usuarios ud ON ud.id=t.recebida_destino_por
    WHERE t.id=? AND t.tenant_id=?
  `, [Number(id), tenantId]);
  if (!transfer) return null;
  transfer.itens = await listTransferItems(transfer.id);
  return transfer;
};

const destinatariosTransferencia = async (transfer, { solicitante = true, gestoresGlobais = false, almoxarifes = false, gestoresDestino = false } = {}) => {
  const ids = new Set();
  if (solicitante && transfer.solicitada_por) ids.add(Number(transfer.solicitada_por));

  if (gestoresGlobais) {
    const rows = await allQuery(`
      SELECT DISTINCT u.id FROM usuarios u
      JOIN usuario_tenants ut ON ut.usuario_id=u.id AND ut.tenant_id=? AND ut.ativo=TRUE
      WHERE u.ativo=1 AND u.deletado_em IS NULL
        AND (u.perfil IN ('ADM','Gestor Geral') OR (u.perfil IS NULL AND (u.is_adm=1 OR u.is_gestor=1)))
    `, [transfer.tenant_id]);
    rows.forEach((row) => ids.add(Number(row.id)));
  }

  if (almoxarifes) {
    const rows = await allQuery(`
      SELECT DISTINCT u.id FROM usuarios u
      JOIN usuario_tenants ut ON ut.usuario_id=u.id AND ut.tenant_id=? AND ut.ativo=TRUE
      WHERE u.ativo=1 AND u.deletado_em IS NULL
        AND u.perfil='Almoxarife'
    `, [transfer.tenant_id]);
    rows.forEach((row) => ids.add(Number(row.id)));
  }

  if (gestoresDestino && transfer.destino_projeto_id) {
    const rows = await allQuery(`
      SELECT DISTINCT u.id FROM usuarios u
      JOIN projeto_usuarios pu ON pu.usuario_id=u.id AND pu.projeto_id=?
      JOIN usuario_tenants ut ON ut.usuario_id=u.id AND ut.tenant_id=? AND ut.ativo=TRUE
      WHERE u.ativo=1 AND u.deletado_em IS NULL
        AND (u.perfil='Gestor da Obra' OR (u.perfil IS NULL AND u.is_gestor=1))
    `, [transfer.destino_projeto_id, transfer.tenant_id]);
    rows.forEach((row) => ids.add(Number(row.id)));
  }

  return [...ids].filter(Boolean);
};

const resumirTransferencia = (transfer) => (transfer.itens || [])
  .map((item) => `${item.descricao_snapshot || item.nome} (${item.quantidade} ${item.unidade_snapshot || item.unidade})`)
  .join(', ');

const notificarTransferencia = async (transfer, { tipo, titulo, mensagem, destinatarios }, usuarioAutorId) => {
  const ids = await destinatariosTransferencia(transfer, destinatarios);
  const texto = `${mensagem} Itens: ${resumirTransferencia(transfer) || 'não informado'}. Origem: ${transfer.origem_obra_nome || 'Estoque central'}; destino: ${transfer.destino_obra_nome || 'Estoque central'}.`;
  for (const usuarioId of ids) {
    if (Number(usuarioId) === Number(usuarioAutorId)) continue;
    await runQuery(
      `INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, titulo, mensagem, referencia_tipo, referencia_id)
       VALUES (?, ?, ?, ?, 'estoque_transferencia', ?)`,
      [usuarioId, tipo, titulo, texto, transfer.id]
    );
  }
};

router.get('/saldos', async (req, res) => {
  try {
    if (!ensureView(req, res)) return;
    const projetoId = req.query.projeto_id ? Number(req.query.projeto_id) : null;
    if (projetoId && !(await canAccessProject(req, projetoId))) return fail(res, 403, 'Sem acesso a esta obra.');
    const q = String(req.query.q || '').trim();
    const where = ['s.tenant_id=?'];
    const params = [req.tenantId];
    if (projetoId) { where.push('s.local_chave=?'); params.push(local(projetoId).chave); }
    else if (req.query.local === 'CENTRAL') { where.push("s.local_chave='CENTRAL'"); }
    if (q) {
      where.push('(i.nome ILIKE ? OR l.nota_fiscal ILIKE ? OR l.fornecedor_nome ILIKE ? OR l.lote ILIKE ?)');
      params.push(...Array(4).fill(`%${q}%`));
    }
    const rows = await allQuery(`
      SELECT i.id AS insumo_id, i.nome, i.unidade, s.local_chave, s.tipo_local, s.projeto_id,
        COALESCE(p.nome, 'Estoque central') AS local_nome,
        SUM(s.quantidade) AS quantidade_fisica,
        SUM(s.quantidade_reservada) AS quantidade_reservada,
        SUM(s.quantidade-s.quantidade_reservada) AS quantidade_disponivel,
        COUNT(DISTINCT l.id) AS total_lotes
      FROM estoque_saldos s
      JOIN estoque_lotes l ON l.id=s.lote_id
      JOIN estoque_insumos i ON i.id=l.insumo_id
      LEFT JOIN projetos p ON p.id=s.projeto_id
      WHERE ${where.join(' AND ')}
      GROUP BY i.id, i.nome, i.unidade, s.local_chave, s.tipo_local, s.projeto_id, p.nome
      HAVING SUM(s.quantidade) > 0
      ORDER BY i.nome, i.unidade, local_nome
    `, params);
    res.json(rows);
  } catch (error) {
    console.error('[estoque] saldos:', error);
    fail(res, 500, 'Erro ao listar saldos de estoque.');
  }
});

router.get('/insumos/:id/lotes', async (req, res) => {
  try {
    if (!ensureView(req, res)) return;
    const projectId = req.query.projeto_id ? Number(req.query.projeto_id) : null;
    if (projectId && !(await canAccessProject(req, projectId))) return fail(res, 403, 'Sem acesso a esta obra.');
    const requestedLocal = projectId ? local(projectId).chave : String(req.query.local || 'CENTRAL');
    const rows = await allQuery(`
      SELECT l.*, i.nome, i.unidade, s.quantidade, s.quantidade_reservada,
        s.quantidade-s.quantidade_reservada AS quantidade_disponivel,
        u.nome AS recebido_por_nome,
        COALESCE(json_agg(json_build_object('id', a.id, 'nome_arquivo', a.nome_arquivo, 'caminho_arquivo', a.caminho_arquivo)) FILTER (WHERE a.id IS NOT NULL), '[]') AS anexos
      FROM estoque_lotes l
      JOIN estoque_insumos i ON i.id=l.insumo_id
      JOIN estoque_saldos s ON s.lote_id=l.id AND s.tenant_id=l.tenant_id
      LEFT JOIN usuarios u ON u.id=l.recebido_por
      LEFT JOIN estoque_lote_anexos a ON a.lote_id=l.id
      WHERE l.tenant_id=? AND l.insumo_id=? AND s.local_chave=? AND s.quantidade > 0
      GROUP BY l.id, i.nome, i.unidade, s.quantidade, s.quantidade_reservada, u.nome
      ORDER BY l.recebido_em ASC, l.id ASC
    `, [req.tenantId, Number(req.params.id), requestedLocal]);
    res.json(rows);
  } catch (error) {
    console.error('[estoque] lotes:', error);
    fail(res, 500, 'Erro ao detalhar lotes.');
  }
});

router.get('/pendencias', async (req, res) => {
  try {
    if (!ensureView(req, res)) return;
    const visibility = isGlobal(req) ? '' : ' AND EXISTS (SELECT 1 FROM projeto_usuarios pu WHERE pu.projeto_id=pe.projeto_solicitante_id AND pu.usuario_id=?)';
    const params = isGlobal(req) ? [req.tenantId] : [req.tenantId, req.usuario.id];
    const rows = await allQuery(`
      SELECT pe.*, p.nome AS projeto_solicitante_nome,
        pe.quantidade_comprada-pe.quantidade_recebida AS quantidade_pendente
      FROM estoque_pendencias_recebimento pe
      LEFT JOIN projetos p ON p.id=pe.projeto_solicitante_id
      WHERE pe.tenant_id=? AND pe.status IN ('AGUARDANDO_RECEBIMENTO','RECEBIMENTO_PARCIAL')${visibility}
      ORDER BY pe.criado_em ASC
    `, params);
    res.json(rows);
  } catch (error) {
    console.error('[estoque] pendencias:', error);
    fail(res, 500, 'Erro ao listar recebimentos pendentes.');
  }
});

router.post('/pendencias/:id/receber', async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    const body = req.body || {};
    const quantidade = Number(body.quantidade);
    if (!(quantidade > 0)) return fail(res, 400, 'Informe uma quantidade recebida maior que zero.');
    const result = await withClient(async (client) => {
      const pending = await getWithClient(client, 'SELECT * FROM estoque_pendencias_recebimento WHERE id=? AND tenant_id=? FOR UPDATE', [Number(req.params.id), req.tenantId]);
      if (!pending || !['AGUARDANDO_RECEBIMENTO', 'RECEBIMENTO_PARCIAL'].includes(pending.status)) throw new Error('Pendencia de recebimento indisponivel.');
      const remaining = Number(pending.quantidade_comprada) - Number(pending.quantidade_recebida);
      if (quantidade > remaining + 0.000001) throw new Error(`Quantidade superior ao pendente (${remaining} ${pending.unidade}).`);
      // Compras solicitadas por uma obra entram diretamente no estoque dela.
      // Somente compras sem projeto associado alimentam o estoque central.
      const localDestino = local(pending.projeto_solicitante_id ? Number(pending.projeto_solicitante_id) : null);
      const normalized = normalizarNomeInsumo(pending.descricao);
      await execWithClient(client, `
        INSERT INTO estoque_insumos (tenant_id,nome,nome_normalizado,unidade,criado_por)
        VALUES (?,?,?,?,?)
        ON CONFLICT (tenant_id,nome_normalizado,unidade) DO UPDATE SET atualizado_em=NOW()
      `, [req.tenantId, pending.descricao, normalized, pending.unidade, req.usuario.id]);
      const insumo = await getWithClient(client, 'SELECT * FROM estoque_insumos WHERE tenant_id=? AND nome_normalizado=? AND unidade=?', [req.tenantId, normalized, pending.unidade]);
      const loteResult = await execWithClient(client, `
        INSERT INTO estoque_lotes (tenant_id,insumo_id,pendencia_recebimento_id,fornecedor_nome,nota_fiscal,lote,local_armazenamento,observacoes,recebido_em,recebido_por)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `, [req.tenantId, insumo.id, pending.id, body.fornecedor_nome || null, body.nota_fiscal || null, body.lote || null, body.local_armazenamento || 'Estoque central', body.observacoes || null, body.recebido_em || new Date().toISOString(), req.usuario.id]);
      const lote = await getWithClient(client, 'SELECT * FROM estoque_lotes WHERE id=?', [loteResult.lastID]);
      await execWithClient(client, `
        INSERT INTO estoque_saldos (tenant_id,lote_id,local_chave,tipo_local,projeto_id,quantidade)
        VALUES (?,?,?,?,?,?)
      `, [req.tenantId, lote.id, localDestino.chave, localDestino.tipo, localDestino.projetoId, quantidade]);
      await execWithClient(client, `
        INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,tipo,quantidade,destino_chave,observacoes,usuario_id)
        VALUES (?,?,?,'ENTRADA_COMPRA',?,?,?,?)
      `, [req.tenantId, lote.id, insumo.id, quantidade, localDestino.chave, body.observacoes || null, req.usuario.id]);
      const received = Number(pending.quantidade_recebida) + quantidade;
      const status = received + 0.000001 >= Number(pending.quantidade_comprada) ? 'RECEBIDO_TOTAL' : 'RECEBIMENTO_PARCIAL';
      await execWithClient(client, 'UPDATE estoque_pendencias_recebimento SET quantidade_recebida=?, status=?, atualizado_em=NOW() WHERE id=?', [received, status, pending.id]);
      return { lote, local: localDestino, status, quantidade_pendente: Math.max(0, Number(pending.quantidade_comprada) - received) };
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('[estoque] receber:', error);
    fail(res, 409, error.message || 'Erro ao registrar recebimento.');
  }
});

router.post('/lotes/:id/anexos', upload.single('arquivo'), async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    if (!req.file) return fail(res, 400, 'Selecione um arquivo.');
    const lote = await getQuery('SELECT id FROM estoque_lotes WHERE id=? AND tenant_id=?', [Number(req.params.id), req.tenantId]);
    if (!lote) return fail(res, 404, 'Lote nao encontrado.');
    const stored = path.relative(path.join(__dirname, '..', 'uploads'), req.file.path).replace(/\\/g, '/');
    const result = await withClient((client) => execWithClient(client, 'INSERT INTO estoque_lote_anexos (lote_id,caminho_arquivo,nome_arquivo,tipo_arquivo,criado_por) VALUES (?,?,?,?,?)', [lote.id, stored, req.file.originalname, req.file.mimetype, req.usuario.id]));
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('[estoque] anexo:', error);
    fail(res, 500, 'Erro ao anexar documento do lote.');
  }
});

router.get('/transferencias', async (req, res) => {
  try {
    if (!ensureView(req, res)) return;
    const visibility = isGlobal(req) ? '' : ` AND EXISTS (
      SELECT 1 FROM projeto_usuarios pu
      WHERE pu.usuario_id=? AND pu.projeto_id IN (t.origem_projeto_id, t.destino_projeto_id)
    )`;
    const params = isGlobal(req) ? [req.tenantId] : [req.tenantId, req.usuario.id];
    const rows = await allQuery(`
      SELECT t.*, po.nome AS origem_obra_nome, pd.nome AS destino_obra_nome, u.nome AS solicitante_nome,
        COUNT(ti.id) AS total_itens,
        COALESCE(json_agg(json_build_object(
          'lote_id', ti.lote_id,
          'descricao', ti.descricao_snapshot,
          'unidade', ti.unidade_snapshot,
          'quantidade', ti.quantidade,
          'lote', l.lote,
          'nota_fiscal', l.nota_fiscal,
          'fornecedor_nome', l.fornecedor_nome,
          'dados_compra', pe.dados_compra
        ) ORDER BY ti.id) FILTER (WHERE ti.id IS NOT NULL), '[]') AS itens
      FROM estoque_transferencias t
      LEFT JOIN projetos po ON po.id=t.origem_projeto_id
      LEFT JOIN projetos pd ON pd.id=t.destino_projeto_id
      LEFT JOIN usuarios u ON u.id=t.solicitada_por
      LEFT JOIN estoque_transferencia_itens ti ON ti.transferencia_id=t.id
      LEFT JOIN estoque_lotes l ON l.id=ti.lote_id
      LEFT JOIN estoque_pendencias_recebimento pe ON pe.id=l.pendencia_recebimento_id
      WHERE t.tenant_id=?${visibility}
      GROUP BY t.id, po.nome, pd.nome, u.nome
      ORDER BY t.criada_em DESC
    `, params);
    res.json(rows);
  } catch (error) {
    console.error('[estoque] transferencias:', error);
    fail(res, 500, 'Erro ao listar transferencias.');
  }
});

router.get('/transferencias/:id', async (req, res) => {
  try {
    if (!ensureView(req, res)) return;
    const transfer = await hydrateTransfer(req.params.id, req.tenantId);
    if (!transfer) return fail(res, 404, 'Transferencia nao encontrada.');
    const allowed = (await canAccessLocation(req, local(transfer.origem_projeto_id))) || (await canAccessLocation(req, local(transfer.destino_projeto_id)));
    if (!allowed) return fail(res, 403, 'Sem acesso a esta transferencia.');
    res.json(transfer);
  } catch (error) {
    console.error('[estoque] transferencia detalhe:', error);
    fail(res, 500, 'Erro ao detalhar transferencia.');
  }
});

router.post('/transferencias', async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    const body = req.body || {};
    const origem = local(body.origem_projeto_id ? Number(body.origem_projeto_id) : null);
    const destino = local(body.destino_projeto_id ? Number(body.destino_projeto_id) : null);
    if (origem.chave === destino.chave) return fail(res, 400, 'Origem e destino devem ser diferentes.');
    if (![PERFIS.ADM, PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA].includes(perfil(req))) return fail(res, 403, 'Somente gestor local ou gestor geral pode solicitar transferencia.');
    if (isLocalManager(req) && (!destino.projetoId || !(await canAccessProject(req, destino.projetoId)))) return fail(res, 403, 'Gestor local so pode solicitar para uma obra vinculada a ele.');
    if (!isLocalManager(req) && !(await canAccessLocation(req, origem))) return fail(res, 403, 'Sem acesso ao estoque de origem.');
    if (destino.projetoId && !(await getProject(destino.projetoId, req.tenantId))) return fail(res, 400, 'Obra de destino invalida.');
    if (!Array.isArray(body.itens) || !body.itens.length) return fail(res, 400, 'Informe ao menos um lote para transferir.');
    const transferId = await withClient(async (client) => {
      const created = await execWithClient(client, `
        INSERT INTO estoque_transferencias (tenant_id,origem_chave,origem_projeto_id,destino_chave,destino_projeto_id,justificativa,solicitada_por)
        VALUES (?,?,?,?,?,?,?)
      `, [req.tenantId, origem.chave, origem.projetoId, destino.chave, destino.projetoId, body.justificativa || null, req.usuario.id]);
      for (const item of body.itens) {
        const qty = Number(item.quantidade);
        if (!(qty > 0)) throw new Error('Quantidade de transferencia invalida.');
        const lote = await getWithClient(client, `
          SELECT l.id, i.nome, i.unidade FROM estoque_lotes l
          JOIN estoque_insumos i ON i.id=l.insumo_id
          JOIN estoque_saldos s ON s.lote_id=l.id
          WHERE l.id=? AND l.tenant_id=? AND s.local_chave=?
        `, [Number(item.lote_id), req.tenantId, origem.chave]);
        if (!lote) throw new Error('Lote de origem indisponivel.');
        await execWithClient(client, 'INSERT INTO estoque_transferencia_itens (transferencia_id,lote_id,quantidade,descricao_snapshot,unidade_snapshot) VALUES (?,?,?,?,?)', [created.lastID, lote.id, qty, lote.nome, lote.unidade]);
      }
      return created.lastID;
    });
    const transfer = await hydrateTransfer(transferId, req.tenantId);
    await notificarTransferencia(transfer, {
      tipo: 'estoque_transferencia_solicitada',
      titulo: 'Transferência solicitada',
      mensagem: 'Uma transferência de insumos aguarda aprovação.',
      destinatarios: { gestoresGlobais: true, almoxarifes: true }
    }, req.usuario.id);
    res.status(201).json(transfer);
  } catch (error) {
    console.error('[estoque] criar transferencia:', error);
    fail(res, 409, error.message || 'Erro ao criar transferencia.');
  }
});

router.post('/transferencias/:id/aprovar', async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    if (!isBusinessApprover(req)) return fail(res, 403, 'Apenas ADM ou Gestor Geral pode aprovar uma transferencia.');
    await withClient(async (client) => {
      const transfer = await getWithClient(client, 'SELECT * FROM estoque_transferencias WHERE id=? AND tenant_id=? FOR UPDATE', [Number(req.params.id), req.tenantId]);
      if (!transfer || transfer.status !== 'SOLICITADA') throw new Error('Transferencia nao aguarda aprovacao.');
      const items = await allWithClient(client, 'SELECT ti.*, l.insumo_id FROM estoque_transferencia_itens ti JOIN estoque_lotes l ON l.id=ti.lote_id WHERE ti.transferencia_id=? FOR UPDATE', [transfer.id]);
      for (const item of items) {
        const balance = await getWithClient(client, 'SELECT * FROM estoque_saldos WHERE tenant_id=? AND lote_id=? AND local_chave=? FOR UPDATE', [req.tenantId, item.lote_id, transfer.origem_chave]);
        if (!balance || Number(balance.quantidade) - Number(balance.quantidade_reservada) + 0.000001 < Number(item.quantidade)) throw new Error(`Saldo insuficiente para ${item.descricao_snapshot}.`);
        await execWithClient(client, 'UPDATE estoque_saldos SET quantidade_reservada=quantidade_reservada+?, atualizado_em=NOW() WHERE id=?', [item.quantidade, balance.id]);
        await execWithClient(client, 'INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,transferencia_id,tipo,quantidade,origem_chave,destino_chave,projeto_origem_id,projeto_destino_id,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [req.tenantId, item.lote_id, item.insumo_id, transfer.id, 'RESERVA_TRANSFERENCIA', item.quantidade, transfer.origem_chave, transfer.destino_chave, transfer.origem_projeto_id, transfer.destino_projeto_id, req.usuario.id]);
      }
      await execWithClient(client, "UPDATE estoque_transferencias SET status='APROVADA_RESERVADA', aprovada_origem_por=?, aprovada_origem_em=NOW() WHERE id=?", [req.usuario.id, transfer.id]);
    });
    const transfer = await hydrateTransfer(req.params.id, req.tenantId);
    await notificarTransferencia(transfer, {
      tipo: 'estoque_transferencia_aprovada',
      titulo: 'Transferência aprovada e reservada',
      mensagem: 'A transferência foi aprovada e o saldo foi reservado para separação.',
      destinatarios: { solicitante: true, almoxarifes: true }
    }, req.usuario.id);
    res.json(transfer);
  } catch (error) {
    console.error('[estoque] aprovar transferencia:', error);
    fail(res, 409, error.message || 'Erro ao aprovar transferencia.');
  }
});

const releaseTransferReservation = async (client, transfer, userId, type) => {
  const items = await allWithClient(client, 'SELECT ti.*, l.insumo_id FROM estoque_transferencia_itens ti JOIN estoque_lotes l ON l.id=ti.lote_id WHERE ti.transferencia_id=? FOR UPDATE', [transfer.id]);
  if (['APROVADA_RESERVADA', 'EM_SEPARACAO'].includes(transfer.status)) {
    for (const item of items) {
      const balance = await getWithClient(client, 'SELECT * FROM estoque_saldos WHERE tenant_id=? AND lote_id=? AND local_chave=? FOR UPDATE', [transfer.tenant_id, item.lote_id, transfer.origem_chave]);
      if (!balance || Number(balance.quantidade_reservada) + 0.000001 < Number(item.quantidade)) throw new Error('Reserva de transferencia indisponivel.');
      await execWithClient(client, 'UPDATE estoque_saldos SET quantidade_reservada=quantidade_reservada-?, atualizado_em=NOW() WHERE id=?', [item.quantidade, balance.id]);
      await execWithClient(client, 'INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,transferencia_id,tipo,quantidade,origem_chave,destino_chave,projeto_origem_id,projeto_destino_id,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [transfer.tenant_id, item.lote_id, item.insumo_id, transfer.id, type, item.quantidade, transfer.origem_chave, transfer.destino_chave, transfer.origem_projeto_id, transfer.destino_projeto_id, userId]);
    }
  }
};

router.post('/transferencias/:id/separar', async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    if (!isWarehouseOperator(req)) return fail(res, 403, 'Apenas Almoxarife, ADM ou Gestor Geral pode separar o material.');
    await withClient(async (client) => {
      const transfer = await getWithClient(client, 'SELECT * FROM estoque_transferencias WHERE id=? AND tenant_id=? FOR UPDATE', [Number(req.params.id), req.tenantId]);
      if (!transfer || transfer.status !== 'APROVADA_RESERVADA') throw new Error('Transferencia nao aguarda separacao.');
      if (!(await canAccessLocation(req, local(transfer.origem_projeto_id)))) throw new Error('Sem acesso ao estoque de origem.');
      await execWithClient(client, "UPDATE estoque_transferencias SET status='EM_SEPARACAO', separada_por=?, separada_em=NOW() WHERE id=?", [req.usuario.id, transfer.id]);
    });
    const transfer = await hydrateTransfer(req.params.id, req.tenantId);
    await notificarTransferencia(transfer, {
      tipo: 'estoque_transferencia_em_separacao',
      titulo: 'Material em separação',
      mensagem: 'O almoxarifado iniciou a separação da transferência.',
      destinatarios: { solicitante: true, gestoresGlobais: true, gestoresDestino: true }
    }, req.usuario.id);
    res.json(transfer);
  } catch (error) {
    console.error('[estoque] separar transferencia:', error);
    fail(res, 409, error.message || 'Erro ao separar transferencia.');
  }
});

router.post('/transferencias/:id/despachar', async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    if (!isWarehouseOperator(req)) return fail(res, 403, 'Apenas Almoxarife, ADM ou Gestor Geral pode registrar a saida fisica.');
    await withClient(async (client) => {
      const transfer = await getWithClient(client, 'SELECT * FROM estoque_transferencias WHERE id=? AND tenant_id=? FOR UPDATE', [Number(req.params.id), req.tenantId]);
      if (!transfer || transfer.status !== 'EM_SEPARACAO') throw new Error('Transferencia nao esta em separacao.');
      if (!(await canAccessLocation(req, local(transfer.origem_projeto_id)))) throw new Error('Sem acesso ao estoque de origem.');
      const items = await allWithClient(client, 'SELECT ti.*, l.insumo_id FROM estoque_transferencia_itens ti JOIN estoque_lotes l ON l.id=ti.lote_id WHERE ti.transferencia_id=? FOR UPDATE', [transfer.id]);
      for (const item of items) {
        const source = await getWithClient(client, 'SELECT * FROM estoque_saldos WHERE tenant_id=? AND lote_id=? AND local_chave=? FOR UPDATE', [req.tenantId, item.lote_id, transfer.origem_chave]);
        if (!source || Number(source.quantidade_reservada) + 0.000001 < Number(item.quantidade)) throw new Error('Reserva de origem indisponivel.');
        await execWithClient(client, 'UPDATE estoque_saldos SET quantidade=quantidade-?, quantidade_reservada=quantidade_reservada-?, atualizado_em=NOW() WHERE id=?', [item.quantidade, item.quantidade, source.id]);
        await execWithClient(client, 'INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,transferencia_id,tipo,quantidade,origem_chave,destino_chave,projeto_origem_id,projeto_destino_id,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [req.tenantId, item.lote_id, item.insumo_id, transfer.id, 'TRANSFERENCIA_SAIDA', item.quantidade, transfer.origem_chave, transfer.destino_chave, transfer.origem_projeto_id, transfer.destino_projeto_id, req.usuario.id]);
      }
      await execWithClient(client, "UPDATE estoque_transferencias SET status='AGUARDANDO_RECEBIMENTO', despachada_por=?, despachada_em=NOW() WHERE id=?", [req.usuario.id, transfer.id]);
    });
    const transfer = await hydrateTransfer(req.params.id, req.tenantId);
    await notificarTransferencia(transfer, {
      tipo: 'estoque_transferencia_em_transito',
      titulo: 'Transferência em trânsito',
      mensagem: 'A saída física foi registrada. Confirme o recebimento no destino.',
      destinatarios: { solicitante: true, gestoresDestino: true }
    }, req.usuario.id);
    res.json(transfer);
  } catch (error) {
    console.error('[estoque] despachar transferencia:', error);
    fail(res, 409, error.message || 'Erro ao registrar saida da transferencia.');
  }
});

router.post('/transferencias/:id/confirmar-recebimento', async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    await withClient(async (client) => {
      const transfer = await getWithClient(client, 'SELECT * FROM estoque_transferencias WHERE id=? AND tenant_id=? FOR UPDATE', [Number(req.params.id), req.tenantId]);
      if (!transfer || transfer.status !== 'AGUARDANDO_RECEBIMENTO') throw new Error('Transferencia nao aguarda recebimento.');
      if (!(await canAccessLocation(req, local(transfer.destino_projeto_id)))) throw new Error('Sem acesso ao estoque de destino.');
      const items = await allWithClient(client, 'SELECT ti.*, l.insumo_id FROM estoque_transferencia_itens ti JOIN estoque_lotes l ON l.id=ti.lote_id WHERE ti.transferencia_id=? FOR UPDATE', [transfer.id]);
      for (const item of items) {
        await execWithClient(client, `
          INSERT INTO estoque_saldos (tenant_id,lote_id,local_chave,tipo_local,projeto_id,quantidade)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT (tenant_id,lote_id,local_chave) DO UPDATE SET quantidade=estoque_saldos.quantidade+EXCLUDED.quantidade, atualizado_em=NOW()
        `, [req.tenantId, item.lote_id, transfer.destino_chave, transfer.destino_projeto_id ? 'OBRA' : 'CENTRAL', transfer.destino_projeto_id || null, item.quantidade]);
        await execWithClient(client, 'INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,transferencia_id,tipo,quantidade,origem_chave,destino_chave,projeto_origem_id,projeto_destino_id,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [req.tenantId, item.lote_id, item.insumo_id, transfer.id, 'TRANSFERENCIA_ENTRADA', item.quantidade, transfer.origem_chave, transfer.destino_chave, transfer.origem_projeto_id, transfer.destino_projeto_id, req.usuario.id]);
      }
      await execWithClient(client, "UPDATE estoque_transferencias SET status='CONCLUIDA', recebida_destino_por=?, recebida_destino_em=NOW(), concluida_em=NOW() WHERE id=?", [req.usuario.id, transfer.id]);
    });
    const transfer = await hydrateTransfer(req.params.id, req.tenantId);
    await notificarTransferencia(transfer, {
      tipo: 'estoque_transferencia_recebida',
      titulo: 'Recebimento confirmado',
      mensagem: 'O destino confirmou o recebimento da transferência.',
      destinatarios: { solicitante: true, gestoresGlobais: true, almoxarifes: true }
    }, req.usuario.id);
    res.json(transfer);
  } catch (error) {
    console.error('[estoque] confirmar recebimento:', error);
    fail(res, 409, error.message || 'Erro ao confirmar recebimento.');
  }
});

router.post('/transferencias/:id/:acao(rejeitar|cancelar)', async (req, res) => {
  try {
    if (!ensureOperation(req, res)) return;
    const statusFinal = req.params.acao === 'rejeitar' ? 'REJEITADA' : 'CANCELADA';
    await withClient(async (client) => {
      const transfer = await getWithClient(client, 'SELECT * FROM estoque_transferencias WHERE id=? AND tenant_id=? FOR UPDATE', [Number(req.params.id), req.tenantId]);
      if (!transfer || !['SOLICITADA', 'APROVADA_RESERVADA', 'EM_SEPARACAO'].includes(transfer.status)) throw new Error('Transferencia nao pode mais ser alterada apos a saida fisica.');
      if (req.params.acao === 'rejeitar' && !isBusinessApprover(req)) throw new Error('Apenas ADM ou Gestor Geral pode reprovar uma transferencia.');
      const allowed = isBusinessApprover(req) || (await canAccessLocation(req, local(transfer.destino_projeto_id)));
      if (!allowed) throw new Error('Sem acesso a esta transferencia.');
      await releaseTransferReservation(client, transfer, req.usuario.id, 'CANCELAMENTO_TRANSFERENCIA');
      await execWithClient(client, 'UPDATE estoque_transferencias SET status=?, justificativa=COALESCE(?, justificativa) WHERE id=?', [statusFinal, req.body?.justificativa || null, transfer.id]);
    });
    const transfer = await hydrateTransfer(req.params.id, req.tenantId);
    const reprovada = statusFinal === 'REJEITADA';
    await notificarTransferencia(transfer, {
      tipo: reprovada ? 'estoque_transferencia_reprovada' : 'estoque_transferencia_cancelada',
      titulo: reprovada ? 'Transferência reprovada' : 'Transferência cancelada para correção',
      mensagem: reprovada ? 'A transferência foi reprovada.' : 'A transferência foi cancelada e a reserva foi liberada.',
      destinatarios: { solicitante: true, gestoresGlobais: true, almoxarifes: true, gestoresDestino: true }
    }, req.usuario.id);
    res.json(transfer);
  } catch (error) {
    console.error('[estoque] cancelar/rejeitar:', error);
    fail(res, 409, error.message || 'Erro ao alterar transferencia.');
  }
});

router.get('/movimentacoes', async (req, res) => {
  try {
    if (!ensureView(req, res)) return;
    const rows = await allQuery(`
      SELECT m.*, i.nome, i.unidade, l.nota_fiscal, l.lote, u.nome AS usuario_nome
      FROM estoque_movimentacoes m
      JOIN estoque_insumos i ON i.id=m.insumo_id
      JOIN estoque_lotes l ON l.id=m.lote_id
      LEFT JOIN usuarios u ON u.id=m.usuario_id
      WHERE m.tenant_id=? AND (?::BIGINT IS NULL OR m.insumo_id=?::BIGINT)
      ORDER BY m.criado_em DESC, m.id DESC LIMIT 300
    `, [req.tenantId, req.query.insumo_id ? Number(req.query.insumo_id) : null, req.query.insumo_id ? Number(req.query.insumo_id) : null]);
    res.json(rows);
  } catch (error) {
    console.error('[estoque] movimentacoes:', error);
    fail(res, 500, 'Erro ao consultar extrato de estoque.');
  }
});

module.exports = router;

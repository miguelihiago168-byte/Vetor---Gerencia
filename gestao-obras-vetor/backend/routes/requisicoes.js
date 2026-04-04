/**
 * Rotas: Módulo de Compras — Requisições Multi-itens
 *
 * Perfis permitidos:
 *  - Solicitante (cria):        ADM | Gestor Geral | Gestor da Obra | Almoxarife
 *  - Analisa item:              Gestor da Obra
 *  - Cadastra cotação:          ADM
 *  - Seleciona fornecedor:      Gestor Geral
 *  - Marca item comprado:       ADM
 *  - Cancela item:              ADM | Gestor Geral
 */
const express = require('express');
const router = express.Router();
const { allQuery, getQuery, runQuery } = require('../config/database');
const { carregarPerfilUsuario, assertProjectAccess } = require('../middleware/rbac');
const { inferirPerfil } = require('../constants/access');
const { auth } = require('../middleware/auth');

router.use(auth);

// ─── Constantes de domínio ─────────────────────────────────────────────────
const TIPOS_MATERIAL = [
  'Materiais Elétricos',
  'Materiais Civis',
  'Materiais Eletrônicos',
  'Ferramentas',
  'EPIs',
  'Serviços',
  'Outros',
];

const URGENCIAS = ['Normal', 'Urgente', 'Emergencial'];

const STATUS_REQ = {
  EM_ANALISE:              'Em análise',
  EM_COTACAO:              'Em cotação',
  COT_RECEBIDAS:           'Cotações recebidas',
  AG_DECISAO:              'Aguardando decisão gestor geral',
  AUTORIZADA:              'Compra autorizada',
  FINALIZADA:              'Finalizada',
  ENCERRADA_SEM_COMPRA:    'Encerrada sem compra',
};

const STATUS_ITEM = {
  AG_ANALISE:      'Aguardando análise',
  REPROVADO:       'Reprovado',
  EM_COTACAO:      'Em cotação',
  COT_FINALIZADA:  'Cotação finalizada',
  APROVADO:        'Aprovado para compra',
  COMPRADO:        'Comprado',
  CANCELADO:       'Cancelado',
};

// ─── Helper: gerar número de requisição ───────────────────────────────────
const gerarNumeroRequisicao = async () => {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const d = String(hoje.getDate()).padStart(2, '0');
  const prefixo = `REQ-${y}${m}${d}-`;

  const ultima = await getQuery(
    `SELECT numero_requisicao FROM requisicoes
     WHERE numero_requisicao LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefixo}%`]
  );

  let seq = 1;
  if (ultima) {
    const partes = ultima.numero_requisicao.split('-');
    const ultimo = parseInt(partes[partes.length - 1], 10);
    if (!isNaN(ultimo)) seq = ultimo + 1;
  }

  return `${prefixo}${String(seq).padStart(4, '0')}`;
};

// ─── Helper: registrar histórico ───────────────────────────────────────────
const registrarHistorico = async (requisicaoId, itemId, usuarioId, tipoEvento, statusAnterior, statusNovo, detalhes) => {
  // Usa o fuso do sistema operacional em vez de CURRENT_TIMESTAMP (UTC do SQLite)
  const agora = new Date();
  const localIso = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    .toISOString().replace('T', ' ').slice(0, 19);
  await runQuery(
    `INSERT INTO requisicao_historico
       (requisicao_id, item_id, usuario_id, tipo_evento, status_anterior, status_novo, detalhes, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      requisicaoId,
      itemId || null,
      usuarioId,
      tipoEvento,
      statusAnterior || null,
      statusNovo || null,
      detalhes ? JSON.stringify(detalhes) : null,
      localIso,
    ]
  );
};

// ─── Helper: atualizar status da requisição conforme itens ─────────────────
const atualizarStatusRequisicao = async (requisicaoId, usuarioId) => {
  const itens = await allQuery(
    'SELECT status_item FROM requisicao_itens WHERE requisicao_id = ?',
    [requisicaoId]
  );

  const req = await getQuery('SELECT status_requisicao FROM requisicoes WHERE id = ?', [requisicaoId]);
  if (!req) return;

  const statusAnterior = req.status_requisicao;
  const statuses = itens.map((i) => i.status_item);

  const todos = (s) => statuses.every((si) => si === s);
  const algum = (s) => statuses.some((si) => si === s);
  const todosEmTerminal = () =>
    statuses.every((s) =>
      [STATUS_ITEM.REPROVADO, STATUS_ITEM.CANCELADO, STATUS_ITEM.COMPRADO].includes(s)
    );

  let novoStatus = statusAnterior;

  if (statuses.length === 0) {
    novoStatus = STATUS_REQ.EM_ANALISE;
  } else if (statuses.every((s) => [STATUS_ITEM.REPROVADO, STATUS_ITEM.CANCELADO].includes(s))) {
    novoStatus = STATUS_REQ.ENCERRADA_SEM_COMPRA;
  } else if (todosEmTerminal() && algum(STATUS_ITEM.COMPRADO)) {
    novoStatus = STATUS_REQ.FINALIZADA;
  } else if (algum(STATUS_ITEM.APROVADO) || algum(STATUS_ITEM.COMPRADO)) {
    // Após seleção do fornecedor, o item fica "Aprovado para compra" e
    // a requisição deve avançar para a etapa de fechamento (ADM).
    novoStatus = STATUS_REQ.AUTORIZADA;
  } else if (algum(STATUS_ITEM.COT_FINALIZADA)) {
    novoStatus = STATUS_REQ.COT_RECEBIDAS;
  } else if (algum(STATUS_ITEM.EM_COTACAO)) {
    novoStatus = STATUS_REQ.EM_COTACAO;
  } else if (todos(STATUS_ITEM.AG_ANALISE)) {
    novoStatus = STATUS_REQ.EM_ANALISE;
  }

  if (novoStatus !== statusAnterior) {
    await runQuery(
      `UPDATE requisicoes
         SET status_requisicao = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [novoStatus, requisicaoId]
    );
    await registrarHistorico(
      requisicaoId, null, usuarioId,
      'STATUS_REQUISICAO_ALTERADO', statusAnterior, novoStatus, null
    );

    // Notificar solicitante da requisição sobre mudança de status
    try {
      const reqInfo = await getQuery(
        `SELECT r.solicitante_id, r.numero_requisicao FROM requisicoes r WHERE r.id = ?`,
        [requisicaoId]
      );
      if (reqInfo && reqInfo.solicitante_id && reqInfo.solicitante_id !== usuarioId) {
        await runQuery(
          `INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            reqInfo.solicitante_id,
            'requisicao_status',
            `Requisição ${reqInfo.numero_requisicao || '#' + requisicaoId} agora está: ${novoStatus}`,
            'requisicao',
            requisicaoId
          ]
        );
      }
    } catch (e) {
      console.warn('Falha ao notificar solicitante sobre status da requisição:', e?.message || e);
    }
  }
};

// ─── Helper: buscar requisição completa ───────────────────────────────────
const buscarRequisicaoCompleta = async (id) => {
  const requisicao = await getQuery(
    `SELECT r.*,
            u.nome AS solicitante_nome,
            p.nome AS projeto_nome
     FROM requisicoes r
     LEFT JOIN usuarios u ON u.id = r.solicitante_id
     LEFT JOIN projetos p ON p.id = r.projeto_id
     WHERE r.id = ?`,
    [id]
  );
  if (!requisicao) return null;

  const itens = await allQuery(
    `SELECT i.*
     FROM requisicao_itens i
     WHERE i.requisicao_id = ?
     ORDER BY i.id ASC`,
    [id]
  );

  for (const item of itens) {
    item.cotacoes = await allQuery(
      `SELECT c.*,
              COALESCE(c.fornecedor_nome, f.razao_social) AS fornecedor_nome,
              COALESCE(c.cnpj, f.cnpj)                    AS fornecedor_cnpj
       FROM requisicao_cotacoes c
       LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
       WHERE c.item_id = ?
       ORDER BY c.criado_em ASC`,
      [item.id]
    );
  }

  requisicao.itens = itens;

  requisicao.historico = await allQuery(
    `SELECT h.*, u.nome AS usuario_nome
     FROM requisicao_historico h
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.requisicao_id = ?
     ORDER BY h.criado_em DESC`,
    [id]
  );

  return requisicao;
};

// ══════════════════════════════════════════════════════════════════════════════
// ROTAS
// ══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/requisicoes ─────────────────────────────────────────────────
// Criar requisição + itens (máx 10)
router.post('/', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    const PODE_CRIAR = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_CRIAR.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para criar requisição.' });
    }

    const {
      projeto_id, centro_custo, tipo_material, urgencia,
      observacao_geral, itens = []
    } = req.body;

    // Validações
    if (!projeto_id) return res.status(400).json({ erro: 'projeto_id obrigatório.' });
    if (!tipo_material || !TIPOS_MATERIAL.includes(tipo_material)) {
      return res.status(400).json({ erro: `tipo_material inválido. Opções: ${TIPOS_MATERIAL.join(', ')}` });
    }
    if (!urgencia || !URGENCIAS.includes(urgencia)) {
      return res.status(400).json({ erro: `urgencia inválida. Opções: ${URGENCIAS.join(', ')}` });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: 'A requisição precisa de pelo menos 1 item.' });
    }
    if (itens.length > 10) {
      return res.status(400).json({ erro: 'Máximo de 10 itens por requisição.' });
    }

    // Verifica acesso à obra
    const ok = await assertProjectAccess(req, res, Number(projeto_id));
    if (!ok) return;

    // Valida itens
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      if (!item.descricao || !String(item.descricao).trim()) {
        return res.status(400).json({ erro: `Item ${i + 1}: descrição obrigatória.` });
      }
      if (!item.quantidade || isNaN(Number(item.quantidade)) || Number(item.quantidade) <= 0) {
        return res.status(400).json({ erro: `Item ${i + 1}: quantidade inválida.` });
      }
    }

    const numero = await gerarNumeroRequisicao();

    const result = await runQuery(
      `INSERT INTO requisicoes
         (numero_requisicao, projeto_id, solicitante_id, centro_custo, tipo_material, urgencia, observacao_geral)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [numero, projeto_id, usuario.id, centro_custo || null, tipo_material, urgencia, observacao_geral || null]
    );
    const requisicaoId = result.lastID;

    // Inserir itens
    for (const item of itens) {
      await runQuery(
        `INSERT INTO requisicao_itens
           (requisicao_id, descricao, quantidade, unidade, especificacao_tecnica,
            justificativa, foto_url, impacto_cronograma, impacto_seguranca, impacto_qualidade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          requisicaoId,
          item.descricao.trim(),
          Number(item.quantidade),
          item.unidade || null,
          item.especificacao_tecnica || null,
          item.justificativa || null,
          item.foto_url || null,
          item.impacto_cronograma ? 1 : 0,
          item.impacto_seguranca ? 1 : 0,
          item.impacto_qualidade ? 1 : 0,
        ]
      );
    }

    await registrarHistorico(requisicaoId, null, usuario.id, 'REQUISICAO_CRIADA', null, STATUS_REQ.EM_ANALISE, { numero });

    const completa = await buscarRequisicaoCompleta(requisicaoId);
    res.status(201).json(completa);
  } catch (err) {
    console.error('[requisicoes] Erro ao criar:', err);
    res.status(500).json({ erro: 'Erro ao criar requisição.' });
  }
});

// ─── GET /api/requisicoes/finalizadas ─────────────────────────────────────
// Itens comprados com detalhes do fornecedor escolhido  — DEVE VIR ANTES DE /:id
router.get('/finalizadas', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);
    const { projeto_id } = req.query;

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    let sql = `
      SELECT
        i.id AS item_id,
        i.descricao AS item_descricao,
        i.quantidade,
        i.unidade,
        r.numero_requisicao,
        r.projeto_id,
        p.nome AS projeto_nome,
        r.tipo_material,
        c.valor_unitario,
        (i.quantidade * c.valor_unitario) AS valor_total,
        f.razao_social AS fornecedor_nome,
        f.cnpj AS fornecedor_cnpj,
        c.prazo_entrega,
        c.condicao_pagamento,
        u.nome AS responsavel_nome,
        i.atualizado_em AS data_compra,
        -- Economia: (media_cotacoes - valor_selecionado) / media_cotacoes * 100
        ROUND(
          (
            (SELECT AVG(cx.valor_unitario) FROM requisicao_cotacoes cx WHERE cx.item_id = i.id) - c.valor_unitario
          ) / NULLIF((SELECT AVG(cx.valor_unitario) FROM requisicao_cotacoes cx WHERE cx.item_id = i.id), 0) * 100,
          2
        ) AS economia_pct,
        (SELECT COUNT(*) FROM requisicao_cotacoes cx WHERE cx.item_id = i.id) AS total_cotacoes
      FROM requisicao_itens i
      JOIN requisicoes r ON r.id = i.requisicao_id
      JOIN projetos p ON p.id = r.projeto_id
      LEFT JOIN requisicao_cotacoes c ON c.item_id = i.id AND c.selecionada = 1
      LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
      LEFT JOIN requisicao_historico h
        ON h.item_id = i.id AND h.tipo_evento = 'ITEM_COMPRADO'
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE i.status_item = 'Comprado'
    `;
    const params = [];

    if (projeto_id) {
      sql += ' AND r.projeto_id = ?';
      params.push(Number(projeto_id));
    } else if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      // se não é global, filtra por projetos do usuário
      const projetosUsuario = await allQuery(
        'SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?',
        [usuario.id]
      );
      if (projetosUsuario.length === 0) return res.json([]);
      const ids = projetosUsuario.map((p) => p.projeto_id).join(',');
      sql += ` AND r.projeto_id IN (${ids})`;
    }

    sql += ' ORDER BY i.atualizado_em DESC';

    const rows = await allQuery(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[requisicoes] Erro /finalizadas:', err);
    res.status(500).json({ erro: 'Erro ao buscar cotações finalizadas.' });
  }
});

// ─── GET /api/requisicoes/encerradas ──────────────────────────────────────
// Requisições com status Finalizada ou Encerrada sem compra — DEVE VIR ANTES DE /:id
router.get('/encerradas', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil  = inferirPerfil(usuario);
    const { projeto_id } = req.query;

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    let sql = `
      SELECT r.*, u.nome AS solicitante_nome, p.nome AS projeto_nome
      FROM requisicoes r
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN projetos p ON p.id = r.projeto_id
      WHERE r.status_requisicao IN ('Finalizada', 'Encerrada sem compra', 'Entregue')
    `;
    const params = [];

    if (projeto_id) {
      sql += ' AND r.projeto_id = ?';
      params.push(Number(projeto_id));
    } else if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      const projetosUsuario = await allQuery(
        'SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?',
        [usuario.id]
      );
      if (projetosUsuario.length === 0) return res.json([]);
      const ids = projetosUsuario.map((p) => p.projeto_id).join(',');
      sql += ` AND r.projeto_id IN (${ids})`;
    }

    sql += ' ORDER BY r.atualizado_em DESC';
    const rows = await allQuery(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[requisicoes] Erro /encerradas:', err);
    res.status(500).json({ erro: 'Erro ao buscar requisições encerradas.' });
  }
});

// ─── GET /api/requisicoes/negadas ─────────────────────────────────────────
// Itens reprovados e cancelados — DEVE VIR ANTES DE /:id
router.get('/negadas', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);
    const { projeto_id } = req.query;

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    let sql = `
      SELECT
        i.id AS item_id,
        i.descricao AS item_descricao,
        i.quantidade,
        i.unidade,
        i.status_item,
        i.motivo_reprovacao,
        i.atualizado_em AS data_evento,
        r.numero_requisicao,
        r.projeto_id,
        p.nome AS projeto_nome,
        r.tipo_material,
        r.urgencia,
        u.nome AS responsavel_nome
      FROM requisicao_itens i
      JOIN requisicoes r ON r.id = i.requisicao_id
      JOIN projetos p ON p.id = r.projeto_id
      LEFT JOIN (
        SELECT h2.item_id, h2.usuario_id
        FROM requisicao_historico h2
        WHERE h2.tipo_evento IN ('ITEM_REPROVADO', 'ITEM_CANCELADO')
        GROUP BY h2.item_id
      ) hult ON hult.item_id = i.id
      LEFT JOIN usuarios u ON u.id = hult.usuario_id
      WHERE i.status_item IN ('Reprovado', 'Cancelado')
    `;
    const params = [];

    if (projeto_id) {
      sql += ' AND r.projeto_id = ?';
      params.push(Number(projeto_id));
    } else if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      const projetosUsuario = await allQuery(
        'SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?',
        [usuario.id]
      );
      if (projetosUsuario.length === 0) return res.json([]);
      const ids = projetosUsuario.map((p) => p.projeto_id).join(',');
      sql += ` AND r.projeto_id IN (${ids})`;
    }

    sql += ' ORDER BY i.atualizado_em DESC';

    const rows = await allQuery(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[requisicoes] Erro /negadas:', err);
    res.status(500).json({ erro: 'Erro ao buscar cotações negadas.' });
  }
});

// ─── Helper: montar kanban de requisições ────────────────────────────────
const montarKanbanRequisicoes = async (where, params) => {
  const COLUNAS = [
    { id: 'solicitado',    label: 'Solicitado',             status: STATUS_REQ.EM_ANALISE },
    { id: 'em_cotacao',    label: 'Em cotação',             status: STATUS_REQ.EM_COTACAO },
    { id: 'cot_recebidas', label: 'Cotações recebidas',     status: STATUS_REQ.COT_RECEBIDAS },
    { id: 'ag_aprovacao',  label: 'Aguardando aprovação',   status: STATUS_REQ.AG_DECISAO },
    { id: 'liberado',      label: 'Liberado para compra',   status: STATUS_REQ.AUTORIZADA },
    { id: 'comprado',      label: 'Comprado',               status: STATUS_REQ.FINALIZADA },
  ];

  const reqs = await allQuery(`
    SELECT
      r.id,
      r.numero_requisicao,
      r.tipo_material,
      r.urgencia,
      r.status_requisicao,
      r.projeto_id,
      r.criado_em,
      r.atualizado_em,
      p.nome AS projeto_nome,
      u.nome AS solicitante_nome,
      COUNT(DISTINCT i.id) AS total_itens,
      COUNT(DISTINCT cx.id) AS total_cotacoes,
      COALESCE(SUM(CASE WHEN cx.selecionada = 1 THEN i.quantidade * cx.valor_unitario ELSE 0 END), 0) AS valor_total,
      MAX(CASE WHEN cx.selecionada = 1 THEN COALESCE(cx.fornecedor_nome, f.razao_social) ELSE NULL END) AS fornecedor_selecionado,
      (SELECT GROUP_CONCAT(sub_i.descricao, ' • ') FROM requisicao_itens sub_i WHERE sub_i.requisicao_id = r.id ORDER BY sub_i.id) AS descricao_itens
    FROM requisicoes r
    LEFT JOIN projetos p ON p.id = r.projeto_id
    LEFT JOIN usuarios u ON u.id = r.solicitante_id
    LEFT JOIN requisicao_itens i ON i.requisicao_id = r.id
    LEFT JOIN requisicao_cotacoes cx ON cx.item_id = i.id
    LEFT JOIN fornecedores f ON f.id = cx.fornecedor_id
    ${where}
    GROUP BY r.id
    ORDER BY
      CASE r.urgencia WHEN 'Emergencial' THEN 0 WHEN 'Urgente' THEN 1 ELSE 2 END,
      r.criado_em ASC
  `, params);

  const kanban = COLUNAS.map((col) => {
    const cards = reqs.filter((r) => r.status_requisicao === col.status);
    const valorTotal = cards.reduce((sum, r) => sum + Number(r.valor_total || 0), 0);
    return { id: col.id, label: col.label, count: cards.length, valor_total: valorTotal, requisicoes: cards };
  });

  return kanban;
};

// ─── GET /api/requisicoes/kanban — Painel global ──────────────────────────
router.get('/kanban', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    const { projeto_id, tipo_material, urgencia, fornecedor, responsavel, data_inicio, data_fim, valor_max } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      const projetosUsuario = await allQuery(
        'SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?',
        [usuario.id]
      );
      if (projetosUsuario.length === 0) {
        return res.json([
          { id: 'solicitado',    label: 'Solicitado',           count: 0, valor_total: 0, requisicoes: [] },
          { id: 'em_cotacao',    label: 'Em cotação',           count: 0, valor_total: 0, requisicoes: [] },
          { id: 'cot_recebidas', label: 'Cotações recebidas',   count: 0, valor_total: 0, requisicoes: [] },
          { id: 'ag_aprovacao',  label: 'Aguardando aprovação', count: 0, valor_total: 0, requisicoes: [] },
          { id: 'liberado',      label: 'Liberado para compra', count: 0, valor_total: 0, requisicoes: [] },
          { id: 'comprado',      label: 'Comprado',             count: 0, valor_total: 0, requisicoes: [] },
        ]);
      }
      const ids = projetosUsuario.map((p) => p.projeto_id).join(',');
      where += ` AND r.projeto_id IN (${ids})`;
    }

    if (projeto_id)    { where += ' AND r.projeto_id = ?';       params.push(Number(projeto_id)); }
    if (tipo_material) { where += ' AND r.tipo_material = ?';    params.push(tipo_material); }
    if (urgencia)      { where += ' AND r.urgencia = ?';         params.push(urgencia); }
    if (data_inicio)   { where += ' AND r.criado_em >= ?';       params.push(data_inicio); }
    if (data_fim)      { where += ' AND r.criado_em <= ?';       params.push(data_fim + ' 23:59:59'); }

    let kanban = await montarKanbanRequisicoes(where, params);

    if (valor_max) {
      const max = Number(valor_max);
      kanban = kanban.map((col) => ({
        ...col,
        requisicoes: col.requisicoes.filter((r) => !r.valor_total || Number(r.valor_total) <= max),
      }));
      kanban = kanban.map((col) => ({ ...col, count: col.requisicoes.length }));
    }

    if (fornecedor) {
      const f = fornecedor.toLowerCase();
      kanban = kanban.map((col) => ({
        ...col,
        requisicoes: col.requisicoes.filter((r) => r.fornecedor_selecionado?.toLowerCase().includes(f)),
      }));
      kanban = kanban.map((col) => ({ ...col, count: col.requisicoes.length }));
    }

    if (responsavel) {
      const resp = responsavel.toLowerCase();
      kanban = kanban.map((col) => ({
        ...col,
        requisicoes: col.requisicoes.filter((r) => r.solicitante_nome?.toLowerCase().includes(resp)),
      }));
      kanban = kanban.map((col) => ({ ...col, count: col.requisicoes.length }));
    }

    res.json(kanban);
  } catch (err) {
    console.error('[requisicoes] Erro /kanban global:', err);
    res.status(500).json({ erro: 'Erro ao buscar dados do kanban.' });
  }
});

// ─── GET /api/requisicoes/kanban/projeto/:projetoId ───────────────────────
router.get('/kanban/projeto/:projetoId', async (req, res) => {
  try {
    const { projetoId } = req.params;
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    const ok = await assertProjectAccess(req, res, Number(projetoId));
    if (!ok) return;

    const { tipo_material, urgencia, fornecedor, responsavel, data_inicio, data_fim, valor_max } = req.query;

    let where = 'WHERE r.projeto_id = ?';
    const params = [Number(projetoId)];

    if (tipo_material) { where += ' AND r.tipo_material = ?'; params.push(tipo_material); }
    if (urgencia)      { where += ' AND r.urgencia = ?';      params.push(urgencia); }
    if (data_inicio)   { where += ' AND r.criado_em >= ?';    params.push(data_inicio); }
    if (data_fim)      { where += ' AND r.criado_em <= ?';    params.push(data_fim + ' 23:59:59'); }

    let kanban = await montarKanbanRequisicoes(where, params);

    if (valor_max) {
      const max = Number(valor_max);
      kanban = kanban.map((col) => ({
        ...col,
        requisicoes: col.requisicoes.filter((r) => !r.valor_total || Number(r.valor_total) <= max),
      }));
      kanban = kanban.map((col) => ({ ...col, count: col.requisicoes.length }));
    }

    if (fornecedor) {
      const f = fornecedor.toLowerCase();
      kanban = kanban.map((col) => ({
        ...col,
        requisicoes: col.requisicoes.filter((r) => r.fornecedor_selecionado?.toLowerCase().includes(f)),
      }));
      kanban = kanban.map((col) => ({ ...col, count: col.requisicoes.length }));
    }

    if (responsavel) {
      const resp = responsavel.toLowerCase();
      kanban = kanban.map((col) => ({
        ...col,
        requisicoes: col.requisicoes.filter((r) => r.solicitante_nome?.toLowerCase().includes(resp)),
      }));
      kanban = kanban.map((col) => ({ ...col, count: col.requisicoes.length }));
    }

    res.json(kanban);
  } catch (err) {
    console.error('[requisicoes] Erro /kanban:', err);
    res.status(500).json({ erro: 'Erro ao buscar dados do kanban.' });
  }
});

// ─── GET /api/requisicoes/badges ───────────────────────────────────────────
// Contagem por status_requisicao para badges do menu lateral (leve)
router.get('/badges', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife', 'Gestor Local'];
    if (!PODE_VER.includes(perfil)) return res.json([]);

    const { projeto_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      const proj = await allQuery(
        'SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?',
        [usuario.id]
      );
      if (proj.length === 0) return res.json([]);
      where += ` AND r.projeto_id IN (${proj.map(p => p.projeto_id).join(',')})`;
    }

    if (projeto_id) {
      where += ' AND r.projeto_id = ?';
      params.push(Number(projeto_id));
    }

    const rows = await allQuery(
      `SELECT r.status_requisicao AS status, COUNT(*) AS count
       FROM requisicoes r
       ${where}
       GROUP BY r.status_requisicao`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('[requisicoes] Erro /badges:', err);
    res.status(500).json({ erro: 'Erro ao buscar contagens.' });
  }
});

// ─── GET /api/requisicoes — Painel global (todas as obras) ───────────────────
router.get('/', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    const { projeto_id, tipo_material, urgencia, status_requisicao, data_inicio, data_fim } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    // Filtro de acesso: ADM/Gestor Geral veem tudo; demais veem só projetos vinculados
    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      const projetosUsuario = await allQuery(
        'SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?',
        [usuario.id]
      );
      if (projetosUsuario.length === 0) return res.json({ requisicoes: [], resumo: { total: 0, ag_analise: 0, em_cotacao: 0, ag_decisao: 0, prontos: 0 } });
      const ids = projetosUsuario.map((p) => p.projeto_id).join(',');
      where += ` AND r.projeto_id IN (${ids})`;
    }

    if (projeto_id)         { where += ' AND r.projeto_id = ?';          params.push(Number(projeto_id)); }
    if (tipo_material)      { where += ' AND r.tipo_material = ?';        params.push(tipo_material); }
    if (urgencia)           { where += ' AND r.urgencia = ?';             params.push(urgencia); }
    if (status_requisicao)  { where += ' AND r.status_requisicao = ?';    params.push(status_requisicao); }
    if (data_inicio)        { where += ' AND r.criado_em >= ?';           params.push(data_inicio); }
    if (data_fim)           { where += ' AND r.criado_em <= ?';           params.push(data_fim + ' 23:59:59'); }

    const rows = await allQuery(`
      SELECT
        r.*,
        p.nome AS projeto_nome,
        u.nome AS solicitante_nome,
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id) AS total_itens,
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id AND i.status_item = 'Comprado') AS itens_comprados,
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id AND i.status_item = 'Reprovado') AS itens_reprovados,
        (SELECT GROUP_CONCAT(i.descricao, ' • ') FROM requisicao_itens i WHERE i.requisicao_id = r.id ORDER BY i.id) AS descricao_itens
      FROM requisicoes r
      JOIN projetos p ON p.id = r.projeto_id
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      ${where}
      ORDER BY r.criado_em DESC
    `, params);

    // Resumo para cards de painel
    const resumo = {
      total: rows.length,
      ag_analise: rows.filter(r => r.status_requisicao === 'Em análise').length,
      em_cotacao: rows.filter(r => r.status_requisicao === 'Em cotação').length,
      ag_decisao: rows.filter(r => r.status_requisicao === 'Aguardando decisão gestor geral').length,
      prontos:    rows.filter(r => r.status_requisicao === 'Compra autorizada').length,
    };

    res.json({ requisicoes: rows, resumo });
  } catch (err) {
    console.error('[requisicoes] Erro /global:', err);
    res.status(500).json({ erro: 'Erro ao buscar requisições.' });
  }
});

// ─── GET /api/requisicoes/projeto/:projetoId ────────────────────────────────
router.get('/projeto/:projetoId', async (req, res) => {
  try {
    const { projetoId } = req.params;
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    const ok = await assertProjectAccess(req, res, Number(projetoId));
    if (!ok) return;

    const { tipo_material, urgencia, status_requisicao, data_inicio, data_fim } = req.query;

    let where = 'WHERE r.projeto_id = ?';
    const params = [Number(projetoId)];

    if (tipo_material)      { where += ' AND r.tipo_material = ?';      params.push(tipo_material); }
    if (urgencia)           { where += ' AND r.urgencia = ?';           params.push(urgencia); }
    if (status_requisicao)  { where += ' AND r.status_requisicao = ?';  params.push(status_requisicao); }
    if (data_inicio)        { where += ' AND r.criado_em >= ?';         params.push(data_inicio); }
    if (data_fim)           { where += ' AND r.criado_em <= ?';         params.push(data_fim + ' 23:59:59'); }

    const rows = await allQuery(`
      SELECT
        r.*,
        u.nome AS solicitante_nome,
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id) AS total_itens,
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id AND i.status_item = 'Comprado') AS itens_comprados,
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id AND i.status_item = 'Reprovado') AS itens_reprovados,
        (SELECT GROUP_CONCAT(i.descricao, ' • ') FROM requisicao_itens i WHERE i.requisicao_id = r.id ORDER BY i.id) AS descricao_itens
      FROM requisicoes r
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      ${where}
      ORDER BY r.criado_em DESC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[requisicoes] Erro ao listar por projeto:', err);
    res.status(500).json({ erro: 'Erro ao listar requisições.' });
  }
});

// ─── PATCH /api/requisicoes/:id/concluir ─────────────────────────────────
router.patch('/:id/concluir', async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Apenas ADM ou Gestor Geral pode concluir uma requisição.' });
    }

    const requisicao = await getQuery('SELECT * FROM requisicoes WHERE id = ?', [Number(id)]);
    if (!requisicao) return res.status(404).json({ erro: 'Requisição não encontrada.' });

    if (requisicao.status_requisicao !== STATUS_REQ.FINALIZADA) {
      return res.status(400).json({ erro: 'Somente requisições com status "Finalizada" podem ser concluídas.' });
    }

    await runQuery(
      `UPDATE requisicoes SET status_requisicao = 'Entregue', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      [Number(id)]
    );

    await registrarHistorico(
      Number(id), null, req.usuario.id,
      'REQUISICAO_ENTREGUE', STATUS_REQ.FINALIZADA, 'Entregue', null
    );

    // Notificar solicitante
    try {
      if (requisicao.solicitante_id && requisicao.solicitante_id !== req.usuario.id) {
        await runQuery(
          `INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            requisicao.solicitante_id,
            'requisicao_entregue',
            `Pedido ${requisicao.numero_requisicao || '#' + id} foi entregue e concluído.`,
            'requisicao',
            Number(id)
          ]
        );
      }
    } catch (e) {
      console.warn('Falha ao notificar solicitante sobre entrega:', e?.message || e);
    }

    const atualizada = await getQuery('SELECT * FROM requisicoes WHERE id = ?', [Number(id)]);
    res.json({ requisicao: atualizada });
  } catch (err) {
    console.error('[requisicoes] Erro ao concluir requisição:', err);
    res.status(500).json({ erro: 'Erro ao concluir requisição.' });
  }
});

// ─── GET /api/requisicoes/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    const PODE_VER = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'];
    if (!PODE_VER.includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    const requisicao = await buscarRequisicaoCompleta(req.params.id);
    if (!requisicao) return res.status(404).json({ erro: 'Requisição não encontrada.' });

    const ok = await assertProjectAccess(req, res, Number(requisicao.projeto_id));
    if (!ok) return;

    res.json(requisicao);
  } catch (err) {
    console.error('[requisicoes] Erro ao detalhar:', err);
    res.status(500).json({ erro: 'Erro ao buscar requisição.' });
  }
});

// ─── PATCH /api/requisicoes/:id/editar ───────────────────────────────────
// Gestor Geral edita dados gerais da requisição (header)
router.patch('/:id/editar', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (perfil !== 'Gestor Geral') {
      return res.status(403).json({ erro: 'Sem permissão para editar a requisição.' });
    }

    const requisicao = await getQuery('SELECT * FROM requisicoes WHERE id = ?', [req.params.id]);
    if (!requisicao) return res.status(404).json({ erro: 'Requisição não encontrada.' });

    const STATUS_BLOQUEADOS = [STATUS_REQ.FINALIZADA, STATUS_REQ.ENCERRADA_SEM_COMPRA];
    if (STATUS_BLOQUEADOS.includes(requisicao.status_requisicao)) {
      return res.status(409).json({ erro: `Não é possível editar uma requisição com status "${requisicao.status_requisicao}".` });
    }

    const ok = await assertProjectAccess(req, res, Number(requisicao.projeto_id));
    if (!ok) return;

    const { urgencia, tipo_material, centro_custo, observacao_geral } = req.body;

    if (urgencia && !URGENCIAS.includes(urgencia)) {
      return res.status(400).json({ erro: `urgencia inválida. Opções: ${URGENCIAS.join(', ')}` });
    }
    if (tipo_material && !TIPOS_MATERIAL.includes(tipo_material)) {
      return res.status(400).json({ erro: `tipo_material inválido. Opções: ${TIPOS_MATERIAL.join(', ')}` });
    }

    // Detecta quais campos mudaram para auditoria
    const alteracoes = [];
    if (urgencia && urgencia !== requisicao.urgencia) alteracoes.push({ campo: 'urgencia', anterior: requisicao.urgencia, novo: urgencia });
    if (tipo_material && tipo_material !== requisicao.tipo_material) alteracoes.push({ campo: 'tipo_material', anterior: requisicao.tipo_material, novo: tipo_material });
    const novoCentroCusto = centro_custo !== undefined ? (centro_custo?.trim() || null) : requisicao.centro_custo;
    if (novoCentroCusto !== requisicao.centro_custo) alteracoes.push({ campo: 'centro_custo', anterior: requisicao.centro_custo, novo: novoCentroCusto });
    const novaObs = observacao_geral !== undefined ? (observacao_geral?.trim() || null) : requisicao.observacao_geral;
    if (novaObs !== requisicao.observacao_geral) alteracoes.push({ campo: 'observacao_geral', anterior: requisicao.observacao_geral, novo: novaObs });

    if (alteracoes.length === 0) {
      return res.status(400).json({ erro: 'Nenhuma alteração detectada.' });
    }

    await runQuery(
      `UPDATE requisicoes
         SET urgencia = COALESCE(?, urgencia),
             tipo_material = COALESCE(?, tipo_material),
             centro_custo = ?,
             observacao_geral = ?,
             atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        urgencia || null,
        tipo_material || null,
        novoCentroCusto,
        novaObs,
        requisicao.id,
      ]
    );

    await registrarHistorico(
      Number(req.params.id), null, usuario.id,
      'REQUISICAO_EDITADA', null, null,
      { alteracoes, editado_por: usuario.nome }
    );

    const atualizada = await buscarRequisicaoCompleta(req.params.id);
    res.json(atualizada);
  } catch (err) {
    console.error('[requisicoes] Erro ao editar requisição:', err);
    res.status(500).json({ erro: 'Erro ao editar requisição.' });
  }
});

// ─── PATCH /api/requisicoes/:id/itens/:itemId/analisar ───────────────────
// Gestor da Obra aprova ou reprova item
router.patch('/:id/itens/:itemId/analisar', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor Geral pode analisar itens.' });
    }

    const { aprovado, motivo_reprovacao } = req.body;

    if (aprovado === undefined || aprovado === null) {
      return res.status(400).json({ erro: 'Campo "aprovado" obrigatório (true/false).' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado nesta requisição.' });

    if (item.status_item !== STATUS_ITEM.AG_ANALISE) {
      return res.status(409).json({ erro: `Item já foi analisado. Status atual: ${item.status_item}` });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    const aprov = Boolean(aprovado) === true || aprovado === 'true' || aprovado === 1;
    const novoStatus = aprov ? STATUS_ITEM.EM_COTACAO : STATUS_ITEM.REPROVADO;
    const motivo = aprov ? null : (motivo_reprovacao?.trim() || null);

    if (!aprov && !motivo) {
      return res.status(400).json({ erro: 'motivo_reprovacao obrigatório ao reprovar item.' });
    }

    await runQuery(
      `UPDATE requisicao_itens
         SET aprovado_para_cotacao = ?, motivo_reprovacao = ?,
             status_item = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [aprov ? 1 : 0, motivo, novoStatus, item.id]
    );

    const tipoEvento = aprov ? 'ITEM_APROVADO_COTACAO' : 'ITEM_REPROVADO';
    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      tipoEvento, item.status_item, novoStatus,
      aprov ? null : { motivo_reprovacao: motivo }
    );

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao analisar item:', err);
    res.status(500).json({ erro: 'Erro ao analisar item.' });
  }
});

// ─── PATCH /api/requisicoes/:id/aprovar-todos ────────────────────────────
// Aprova em lote todos os itens "Aguardando análise" da requisição
router.patch('/:id/aprovar-todos', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para aprovar itens em lote.' });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    if (!req2) return res.status(404).json({ erro: 'Requisição não encontrada.' });

    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    const itens = await allQuery(
      `SELECT * FROM requisicao_itens WHERE requisicao_id = ? AND status_item = ?`,
      [req.params.id, STATUS_ITEM.AG_ANALISE]
    );

    if (itens.length === 0) {
      return res.status(409).json({ erro: 'Nenhum item aguardando análise.' });
    }

    for (const item of itens) {
      await runQuery(
        `UPDATE requisicao_itens
           SET aprovado_para_cotacao = 1, status_item = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [STATUS_ITEM.EM_COTACAO, item.id]
      );
      await registrarHistorico(
        Number(req.params.id), item.id, usuario.id,
        'ITEM_APROVADO_COTACAO', item.status_item, STATUS_ITEM.EM_COTACAO, { lote: true }
      );
    }

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);
    res.json({ aprovados: itens.length });
  } catch (err) {
    console.error('[requisicoes] Erro ao aprovar em lote:', err);
    res.status(500).json({ erro: 'Erro ao aprovar itens em lote.' });
  }
});

// ─── POST /api/requisicoes/:id/itens/:itemId/cotacoes ────────────────────
// ADM cadastra cotação (máx 3 por item)
router.post('/:id/itens/:itemId/cotacoes', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Apenas ADM ou Gestor Geral podem cadastrar cotações.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado nesta requisição.' });

    if (![STATUS_ITEM.EM_COTACAO, STATUS_ITEM.COT_FINALIZADA].includes(item.status_item)) {
      return res.status(409).json({
        erro: `Item não está em cotação. Status atual: ${item.status_item}`
      });
    }

    // Conta cotações existentes
    const { count } = await getQuery(
      'SELECT COUNT(*) AS count FROM requisicao_cotacoes WHERE item_id = ?',
      [item.id]
    );
    if (count >= 3) {
      return res.status(409).json({ erro: 'Máximo de 3 cotações por item já atingido.' });
    }

    const {
      fornecedor_id, fornecedor_nome, cnpj, telefone, email,
      valor_unitario, frete, prazo_entrega, condicao_pagamento, observacao
    } = req.body;

    if (!valor_unitario || isNaN(Number(valor_unitario)) || Number(valor_unitario) <= 0) {
      return res.status(400).json({ erro: 'valor_unitario inválido.' });
    }

    // Fornecedor por ID (registro) ou por nome livre — ao menos um obrigatório
    if (!fornecedor_id && !String(fornecedor_nome || '').trim()) {
      return res.status(400).json({ erro: 'Informe o fornecedor (nome ou fornecedor_id).' });
    }

    // Valida fornecedor cadastrado quando id fornecido
    if (fornecedor_id) {
      const fornecedor = await getQuery('SELECT id FROM fornecedores WHERE id = ? AND ativo = 1', [fornecedor_id]);
      if (!fornecedor) return res.status(404).json({ erro: 'Fornecedor não encontrado ou inativo.' });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    const result = await runQuery(
      `INSERT INTO requisicao_cotacoes
         (item_id, fornecedor_id, fornecedor_nome, cnpj, telefone, email,
          valor_unitario, frete, prazo_entrega, condicao_pagamento, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        fornecedor_id || null,
        String(fornecedor_nome || '').trim() || null,
        cnpj || null,
        telefone || null,
        email || null,
        Number(valor_unitario),
        frete ? Number(frete) : 0,
        prazo_entrega || null,
        condicao_pagamento || null,
        observacao || null,
      ]
    );

    // Se atingiu 3 cotações → muda status do item para "Cotação finalizada"
    const totalNovo = count + 1;
    if (totalNovo >= 3) {
      await runQuery(
        `UPDATE requisicao_itens
           SET status_item = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [STATUS_ITEM.COT_FINALIZADA, item.id]
      );
      await registrarHistorico(
        Number(req.params.id), item.id, usuario.id,
        'COTACAO_FINALIZADA', item.status_item, STATUS_ITEM.COT_FINALIZADA,
        { total_cotacoes: totalNovo }
      );
      await atualizarStatusRequisicao(Number(req.params.id), usuario.id);
    }

    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      'COTACAO_INSERIDA', null, null,
      { fornecedor_nome: String(fornecedor_nome || '').trim() || fornecedor_id, valor_unitario: Number(valor_unitario), cotacao_numero: totalNovo }
    );

    const nova = await getQuery(
      `SELECT c.*,
              COALESCE(c.fornecedor_nome, f.razao_social) AS fornecedor_nome
       FROM requisicao_cotacoes c
       LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
       WHERE c.id = ?`,
      [result.lastID]
    );
    res.status(201).json(nova);
  } catch (err) {
    console.error('[requisicoes] Erro ao inserir cotação:', err);
    res.status(500).json({ erro: 'Erro ao inserir cotação.' });
  }
});

// ─── PATCH /:id/itens/:itemId/cotacoes/:cotacaoId ───────────────────────
// Editar campos de uma cotação existente
router.patch('/:id/itens/:itemId/cotacoes/:cotacaoId', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para editar cotação.' });
    }

    const cotacao = await getQuery(
      'SELECT * FROM requisicao_cotacoes WHERE id = ? AND item_id = ?',
      [req.params.cotacaoId, req.params.itemId]
    );
    if (!cotacao) return res.status(404).json({ erro: 'Cotação não encontrada.' });
    if (cotacao.selecionada) return res.status(409).json({ erro: 'Não é possível editar uma cotação já selecionada.' });

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    const {
      fornecedor_nome, cnpj, telefone, email,
      valor_unitario, frete, prazo_entrega, condicao_pagamento, observacao
    } = req.body;

    if (valor_unitario !== undefined && (isNaN(Number(valor_unitario)) || Number(valor_unitario) <= 0)) {
      return res.status(400).json({ erro: 'valor_unitario inválido.' });
    }

    // Monta diffs antes de atualizar
    const alteracoes = [];
    // isNumeric=true: null e 0 são equivalentes (evita falso diff quando DB guarda NULL)
    const comparar = (campo, anterior, novo, isNumeric = false) => {
      if (novo === undefined) return;
      const a = isNumeric ? Number(anterior ?? 0) : (anterior ?? null);
      const n = isNumeric ? Number(novo ?? 0) : (novo ?? null);
      if (String(a) !== String(n)) alteracoes.push({ campo, anterior: anterior ?? null, novo: n });
    };
    comparar('fornecedor_nome', cotacao.fornecedor_nome, fornecedor_nome !== undefined ? String(fornecedor_nome).trim() || null : undefined);
    comparar('cnpj',            cotacao.cnpj,            cnpj !== undefined ? cnpj || null : undefined);
    comparar('telefone',        cotacao.telefone,         telefone !== undefined ? telefone || null : undefined);
    comparar('email',           cotacao.email,            email !== undefined ? email || null : undefined);
    comparar('valor_unitario',  cotacao.valor_unitario,   valor_unitario !== undefined ? Number(valor_unitario) : undefined, true);
    comparar('frete',           cotacao.frete,            frete !== undefined ? Number(frete) : undefined, true);
    comparar('prazo_entrega',   cotacao.prazo_entrega,    prazo_entrega !== undefined ? prazo_entrega || null : undefined);

    await runQuery(
      `UPDATE requisicao_cotacoes SET
         fornecedor_nome    = COALESCE(?, fornecedor_nome),
         cnpj               = COALESCE(?, cnpj),
         telefone           = COALESCE(?, telefone),
         email              = COALESCE(?, email),
         valor_unitario     = COALESCE(?, valor_unitario),
         frete              = COALESCE(?, frete),
         prazo_entrega      = COALESCE(?, prazo_entrega),
         condicao_pagamento = COALESCE(?, condicao_pagamento),
         observacao         = COALESCE(?, observacao)
       WHERE id = ?`,
      [
        fornecedor_nome !== undefined ? String(fornecedor_nome).trim() || null : null,
        cnpj !== undefined ? cnpj || null : null,
        telefone !== undefined ? telefone || null : null,
        email !== undefined ? email || null : null,
        valor_unitario !== undefined ? Number(valor_unitario) : null,
        frete !== undefined ? Number(frete) : null,
        prazo_entrega !== undefined ? prazo_entrega || null : null,
        condicao_pagamento !== undefined ? condicao_pagamento || null : null,
        observacao !== undefined ? observacao || null : null,
        cotacao.id,
      ]
    );

    if (alteracoes.length > 0) {
      await registrarHistorico(
        Number(req.params.id), Number(req.params.itemId), usuario.id,
        'COTACAO_EDITADA', null, null, { alteracoes, fornecedor_nome: cotacao.fornecedor_nome }
      );
    }

    const atualizada = await getQuery(
      `SELECT c.*, COALESCE(c.fornecedor_nome, f.razao_social) AS fornecedor_nome
       FROM requisicao_cotacoes c
       LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
       WHERE c.id = ?`,
      [cotacao.id]
    );
    res.json(atualizada);
  } catch (err) {
    console.error('[requisicoes] Erro ao editar cotação:', err);
    res.status(500).json({ erro: 'Erro ao editar cotação.' });
  }
});

// ─── PATCH /:id/itens/:itemId/finalizar-cotacao ──────────────────────────
// ADM finaliza cotação após inserir/editar → item fica "Cotação finalizada" p/ gestor analisar
router.patch('/:id/itens/:itemId/finalizar-cotacao', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para finalizar cotação.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    if (![STATUS_ITEM.EM_COTACAO, STATUS_ITEM.COT_FINALIZADA].includes(item.status_item)) {
      return res.status(409).json({ erro: `Item não está em cotação. Status: ${item.status_item}` });
    }

    const { count } = await getQuery(
      'SELECT COUNT(*) AS count FROM requisicao_cotacoes WHERE item_id = ?',
      [item.id]
    );
    if (count < 3) {
      return res.status(400).json({ erro: `Preencha as 3 cotações antes de finalizar. Atual: ${count}/3` });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    if (item.status_item !== STATUS_ITEM.COT_FINALIZADA) {
      await runQuery(
        `UPDATE requisicao_itens SET status_item = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
        [STATUS_ITEM.COT_FINALIZADA, item.id]
      );
      await registrarHistorico(
        Number(req.params.id), item.id, usuario.id,
        'COTACAO_FINALIZADA', item.status_item, STATUS_ITEM.COT_FINALIZADA, null
      );
      await atualizarStatusRequisicao(Number(req.params.id), usuario.id);
    }

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao finalizar cotação:', err);
    res.status(500).json({ erro: 'Erro ao finalizar cotação.' });
  }
});

// ─── PATCH /:id/itens/:itemId/cotacoes/:cotacaoId/selecionar ────────────
// Gestor Geral seleciona fornecedor vencedor
router.patch('/:id/itens/:itemId/cotacoes/:cotacaoId/selecionar', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (perfil !== 'Gestor Geral' && perfil !== 'ADM') {
      return res.status(403).json({ erro: 'Apenas Gestor Geral pode selecionar o fornecedor.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    if (![STATUS_ITEM.COT_FINALIZADA, STATUS_ITEM.APROVADO].includes(item.status_item)) {
      return res.status(409).json({
        erro: `Status do item deve ser "Cotação finalizada". Atual: ${item.status_item}`
      });
    }

    const cotacao = await getQuery(
      'SELECT * FROM requisicao_cotacoes WHERE id = ? AND item_id = ?',
      [req.params.cotacaoId, item.id]
    );
    if (!cotacao) return res.status(404).json({ erro: 'Cotação não encontrada para este item.' });

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    // Desmarca todas as cotações do item
    await runQuery(
      'UPDATE requisicao_cotacoes SET selecionada = 0 WHERE item_id = ?',
      [item.id]
    );
    // Seleciona a cotação escolhida
    await runQuery(
      'UPDATE requisicao_cotacoes SET selecionada = 1 WHERE id = ?',
      [cotacao.id]
    );
    // Avança status do item
    await runQuery(
      `UPDATE requisicao_itens
         SET status_item = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [STATUS_ITEM.APROVADO, item.id]
    );

    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      'FORNECEDOR_SELECIONADO', item.status_item, STATUS_ITEM.APROVADO,
      { cotacao_id: cotacao.id, fornecedor_id: cotacao.fornecedor_id, valor_unitario: cotacao.valor_unitario }
    );

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao selecionar cotação:', err);
    res.status(500).json({ erro: 'Erro ao selecionar fornecedor.' });
  }
});

// ─── PATCH /:id/itens/:itemId/comprado ────────────────────────────────────
// ADM marca item como Comprado
router.patch('/:id/itens/:itemId/comprado', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Apenas ADM pode marcar item como comprado.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    if (item.status_item !== STATUS_ITEM.APROVADO) {
      return res.status(409).json({
        erro: `Item precisa estar "Aprovado para compra". Atual: ${item.status_item}`
      });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    await runQuery(
      `UPDATE requisicao_itens
         SET status_item = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [STATUS_ITEM.COMPRADO, item.id]
    );

    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      'ITEM_COMPRADO', item.status_item, STATUS_ITEM.COMPRADO, null
    );

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao marcar comprado:', err);
    res.status(500).json({ erro: 'Erro ao marcar item como comprado.' });
  }
});

// ─── PATCH /:id/itens/:itemId/editar ─────────────────────────────────────
// Gestor Geral edita todos os campos de um item
router.patch('/:id/itens/:itemId/editar', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (perfil !== 'Gestor Geral') {
      return res.status(403).json({ erro: 'Sem permissão para editar item.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    if ([STATUS_ITEM.COMPRADO, STATUS_ITEM.CANCELADO].includes(item.status_item)) {
      return res.status(409).json({ erro: `Não é possível editar um item com status "${item.status_item}".` });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    const {
      descricao, quantidade, unidade, especificacao_tecnica,
      justificativa, impacto_cronograma, impacto_seguranca, impacto_qualidade,
    } = req.body;

    if (descricao !== undefined && !String(descricao).trim()) {
      return res.status(400).json({ erro: 'Descrição não pode ser vazia.' });
    }
    if (quantidade !== undefined && (isNaN(Number(quantidade)) || Number(quantidade) <= 0)) {
      return res.status(400).json({ erro: 'Quantidade inválida.' });
    }

    // Detecta alterações para auditoria
    const alteracoes = [];
    if (descricao !== undefined && descricao.trim() !== item.descricao) alteracoes.push({ campo: 'descricao', anterior: item.descricao, novo: descricao.trim() });
    const novaQtd = quantidade !== undefined ? Number(quantidade) : item.quantidade;
    if (novaQtd !== item.quantidade) alteracoes.push({ campo: 'quantidade', anterior: item.quantidade, novo: novaQtd });
    if (unidade !== undefined && (unidade || '') !== (item.unidade || '')) alteracoes.push({ campo: 'unidade', anterior: item.unidade, novo: unidade });
    const novaEspec = especificacao_tecnica !== undefined ? (especificacao_tecnica?.trim() || null) : item.especificacao_tecnica;
    if (novaEspec !== item.especificacao_tecnica) alteracoes.push({ campo: 'especificacao_tecnica', anterior: item.especificacao_tecnica, novo: novaEspec });
    const novaJust = justificativa !== undefined ? (justificativa?.trim() || null) : item.justificativa;
    if (novaJust !== item.justificativa) alteracoes.push({ campo: 'justificativa', anterior: item.justificativa, novo: novaJust });
    const novoCrono = impacto_cronograma !== undefined ? (impacto_cronograma ? 1 : 0) : item.impacto_cronograma;
    if (novoCrono !== item.impacto_cronograma) alteracoes.push({ campo: 'impacto_cronograma', anterior: item.impacto_cronograma, novo: novoCrono });
    const novoSeg = impacto_seguranca !== undefined ? (impacto_seguranca ? 1 : 0) : item.impacto_seguranca;
    if (novoSeg !== item.impacto_seguranca) alteracoes.push({ campo: 'impacto_seguranca', anterior: item.impacto_seguranca, novo: novoSeg });
    const novoQual = impacto_qualidade !== undefined ? (impacto_qualidade ? 1 : 0) : item.impacto_qualidade;
    if (novoQual !== item.impacto_qualidade) alteracoes.push({ campo: 'impacto_qualidade', anterior: item.impacto_qualidade, novo: novoQual });

    if (alteracoes.length === 0) return res.status(400).json({ erro: 'Nenhuma alteração detectada.' });

    // Mantém auditoria de quantidade se ela mudou
    const quantidadeOriginal = novaQtd !== item.quantidade
      ? (item.quantidade_original != null ? item.quantidade_original : item.quantidade)
      : item.quantidade_original;
    const alteradoEm     = novaQtd !== item.quantidade ? 'CURRENT_TIMESTAMP' : null;
    const alteradoPorNome = novaQtd !== item.quantidade ? usuario.nome : item.alterado_por_nome;

    await runQuery(
      `UPDATE requisicao_itens
         SET descricao = ?,
             quantidade = ?,
             unidade = ?,
             especificacao_tecnica = ?,
             justificativa = ?,
             impacto_cronograma = ?,
             impacto_seguranca = ?,
             impacto_qualidade = ?,
             quantidade_original = ?,
             alterado_por_nome = ?,
             alterado_em = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE alterado_em END,
             atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        descricao !== undefined ? descricao.trim() : item.descricao,
        novaQtd,
        unidade !== undefined ? (unidade || null) : item.unidade,
        novaEspec,
        novaJust,
        novoCrono,
        novoSeg,
        novoQual,
        quantidadeOriginal,
        alteradoPorNome,
        novaQtd !== item.quantidade ? 1 : 0,
        item.id,
      ]
    );

    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      'ITEM_EDITADO', null, null,
      { alteracoes, editado_por: usuario.nome }
    );

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao editar item:', err);
    res.status(500).json({ erro: 'Erro ao editar item.' });
  }
});

// ─── PATCH /:id/itens/:itemId/alterar-quantidade ──────────────────────────
// Gestor Geral altera a quantidade solicitada de um item, registrando auditoria
router.patch('/:id/itens/:itemId/alterar-quantidade', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (perfil !== 'Gestor Geral') {
      return res.status(403).json({ erro: 'Sem permissão para alterar quantidade.' });
    }

    const quantidade = Number(req.body.quantidade);
    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({ erro: 'Quantidade inválida. Informe um valor maior que zero.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    if ([STATUS_ITEM.COMPRADO, STATUS_ITEM.CANCELADO].includes(item.status_item)) {
      return res.status(409).json({ erro: `Não é possível alterar um item com status "${item.status_item}".` });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    // Preserva a quantidade original somente na primeira alteração
    const quantidadeOriginal = item.quantidade_original != null ? item.quantidade_original : item.quantidade;
    const quantidadeAnterior = item.quantidade;

    await runQuery(
      `UPDATE requisicao_itens
         SET quantidade = ?,
             quantidade_original = ?,
             alterado_em = CURRENT_TIMESTAMP,
             alterado_por_nome = ?,
             atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [quantidade, quantidadeOriginal, usuario.nome, item.id]
    );

    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      'QUANTIDADE_ALTERADA', String(quantidadeAnterior), String(quantidade),
      { quantidade_anterior: quantidadeAnterior, quantidade_nova: quantidade }
    );

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao alterar quantidade:', err);
    res.status(500).json({ erro: 'Erro ao alterar quantidade do item.' });
  }
});

// ─── PATCH /:id/itens/:itemId/cancelar ────────────────────────────────────
// ADM ou Gestor Geral cancela item individual
router.patch('/:id/itens/:itemId/cancelar', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para cancelar item.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    if ([STATUS_ITEM.COMPRADO, STATUS_ITEM.CANCELADO].includes(item.status_item)) {
      return res.status(409).json({ erro: `Não é possível cancelar um item com status "${item.status_item}".` });
    }

    const { motivo } = req.body;
    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    await runQuery(
      `UPDATE requisicao_itens
         SET status_item = ?, motivo_reprovacao = COALESCE(?, motivo_reprovacao),
             atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [STATUS_ITEM.CANCELADO, motivo?.trim() || null, item.id]
    );

    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      'ITEM_CANCELADO', item.status_item, STATUS_ITEM.CANCELADO,
      { motivo: motivo?.trim() || null }
    );

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao cancelar item:', err);
    res.status(500).json({ erro: 'Erro ao cancelar item.' });
  }
});

// ─── PATCH /api/requisicoes/:id/analisar-todos ────────────────────────────
// Move todos os itens "Aguardando análise" para "Em cotação" (ação do DnD Solicitado→Em cotação)

// ─── PATCH /api/requisicoes/:id/itens/:itemId/devolver-cotacao ───────────
// Gestor Geral devolve item de "Em cotação" ou "Cotação finalizada" → "Aguardando análise" com motivo
router.patch('/:id/itens/:itemId/devolver-cotacao', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor Geral pode devolver item para cotação.' });
    }

    const { motivo } = req.body;
    if (!motivo || !String(motivo).trim()) {
      return res.status(400).json({ erro: 'Informe o motivo da devolução.' });
    }

    const item = await getQuery(
      'SELECT * FROM requisicao_itens WHERE id = ? AND requisicao_id = ?',
      [req.params.itemId, req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado nesta requisição.' });

    if (!['Em cotação', 'Cotação finalizada'].includes(item.status_item)) {
      return res.status(409).json({ erro: `Só é possível devolver itens em "Em cotação" ou "Cotação finalizada". Status atual: ${item.status_item}` });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    // Mantém cotações existentes — ADM corrige com base no motivo informado
    await runQuery(
      `UPDATE requisicao_itens
         SET aprovado_para_cotacao = 1, status_item = 'Em cotação',
             atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [item.id]
    );

    await registrarHistorico(
      Number(req.params.id), item.id, usuario.id,
      'COTACAO_DEVOLVIDA', item.status_item, 'Em cotação',
      { motivo: String(motivo).trim(), devolvido_por: usuario.nome }
    );

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);

    const itemAtualizado = await getQuery('SELECT * FROM requisicao_itens WHERE id = ?', [item.id]);
    res.json(itemAtualizado);
  } catch (err) {
    console.error('[requisicoes] Erro ao devolver cotação:', err);
    res.status(500).json({ erro: 'Erro ao devolver cotação.' });
  }
});

router.patch('/:id/analisar-todos', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para iniciar cotação em lote.' });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    if (!req2) return res.status(404).json({ erro: 'Requisição não encontrada.' });

    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    const itens = await allQuery(
      `SELECT * FROM requisicao_itens WHERE requisicao_id = ? AND status_item = ?`,
      [req.params.id, STATUS_ITEM.AG_ANALISE]
    );

    if (itens.length === 0) {
      return res.status(409).json({ erro: 'Nenhum item aguardando análise para iniciar cotação.' });
    }

    for (const item of itens) {
      await runQuery(
        `UPDATE requisicao_itens
           SET aprovado_para_cotacao = 1, status_item = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [STATUS_ITEM.EM_COTACAO, item.id]
      );
      await registrarHistorico(
        Number(req.params.id), item.id, usuario.id,
        'ITEM_APROVADO_COTACAO', item.status_item, STATUS_ITEM.EM_COTACAO,
        { lote: true, origem: 'kanban_dnd' }
      );
    }

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);
    res.json({ atualizados: itens.length });
  } catch (err) {
    console.error('[requisicoes] Erro ao analisar-todos:', err);
    res.status(500).json({ erro: 'Erro ao iniciar cotação em lote.' });
  }
});

// ─── PATCH /api/requisicoes/:id/comprar-todos ─────────────────────────────
// Marca todos os itens "Aprovado para compra" como "Comprado" (ação do DnD Liberado→Comprado)
router.patch('/:id/comprar-todos', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Apenas ADM ou Gestor Geral podem confirmar compra em lote.' });
    }

    const req2 = await getQuery('SELECT projeto_id FROM requisicoes WHERE id = ?', [req.params.id]);
    if (!req2) return res.status(404).json({ erro: 'Requisição não encontrada.' });

    const ok = await assertProjectAccess(req, res, Number(req2.projeto_id));
    if (!ok) return;

    const itens = await allQuery(
      `SELECT * FROM requisicao_itens WHERE requisicao_id = ? AND status_item = ?`,
      [req.params.id, STATUS_ITEM.APROVADO]
    );

    if (itens.length === 0) {
      return res.status(409).json({ erro: 'Nenhum item liberado para confirmar compra.' });
    }

    for (const item of itens) {
      await runQuery(
        `UPDATE requisicao_itens
           SET status_item = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [STATUS_ITEM.COMPRADO, item.id]
      );
      await registrarHistorico(
        Number(req.params.id), item.id, usuario.id,
        'ITEM_COMPRADO', item.status_item, STATUS_ITEM.COMPRADO,
        { lote: true, origem: 'kanban_dnd' }
      );
    }

    await atualizarStatusRequisicao(Number(req.params.id), usuario.id);
    res.json({ comprados: itens.length });
  } catch (err) {
    console.error('[requisicoes] Erro ao comprar-todos:', err);
    res.status(500).json({ erro: 'Erro ao confirmar compra em lote.' });
  }
});

module.exports = router;

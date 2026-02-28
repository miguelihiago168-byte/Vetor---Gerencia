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
  await runQuery(
    `INSERT INTO requisicao_historico
       (requisicao_id, item_id, usuario_id, tipo_evento, status_anterior, status_novo, detalhes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      requisicaoId,
      itemId || null,
      usuarioId,
      tipoEvento,
      statusAnterior || null,
      statusNovo || null,
      detalhes ? JSON.stringify(detalhes) : null,
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
  } else if (algum(STATUS_ITEM.COMPRADO)) {
    novoStatus = STATUS_REQ.AUTORIZADA;
  } else if (algum(STATUS_ITEM.APROVADO) || algum(STATUS_ITEM.COT_FINALIZADA)) {
    novoStatus = STATUS_REQ.AG_DECISAO;
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

    const { tipo_material, urgencia, data_inicio, data_fim, valor_max } = req.query;

    let where = 'WHERE r.projeto_id = ?';
    const params = [Number(projetoId)];

    if (tipo_material) { where += ' AND r.tipo_material = ?'; params.push(tipo_material); }
    if (urgencia)      { where += ' AND r.urgencia = ?';      params.push(urgencia); }
    if (data_inicio)   { where += ' AND r.criado_em >= ?';    params.push(data_inicio); }
    if (data_fim)      { where += ' AND r.criado_em <= ?';    params.push(data_fim + ' 23:59:59'); }

    const itens = await allQuery(`
      SELECT
        i.*,
        r.numero_requisicao,
        r.tipo_material,
        r.urgencia,
        r.projeto_id,
        u.nome AS solicitante_nome,
        (SELECT COUNT(*) FROM requisicao_cotacoes cx WHERE cx.item_id = i.id) AS total_cotacoes,
        (SELECT MIN(cx.valor_unitario) FROM requisicao_cotacoes cx WHERE cx.item_id = i.id) AS menor_cotacao
      FROM requisicao_itens i
      JOIN requisicoes r ON r.id = i.requisicao_id
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      ${where}
      AND i.status_item IN ('Em cotação','Cotação finalizada','Aprovado para compra','Comprado')
      ORDER BY r.urgencia DESC, r.criado_em ASC
    `, params);

    // Filtro por valor estimado
    const itensFiltrados = valor_max
      ? itens.filter((i) => !i.menor_cotacao || i.menor_cotacao <= Number(valor_max))
      : itens;

    // Agrupar por status → coluna kanban
    const COLUNAS = [
      { id: 'em_cotacao',    label: 'Em cotação',               status: STATUS_ITEM.EM_COTACAO },
      { id: 'cot_recebida',  label: 'Cotação recebida',         status: STATUS_ITEM.COT_FINALIZADA },
      { id: 'ag_decisao',    label: 'Aguardando decisão gestor', status: STATUS_ITEM.COT_FINALIZADA, extra: true },
      { id: 'liberado',      label: 'Liberado para compra',     status: STATUS_ITEM.APROVADO },
      { id: 'comprado',      label: 'Comprado',                 status: STATUS_ITEM.COMPRADO },
    ];

    const kanban = COLUNAS.map((col) => ({
      id: col.id,
      label: col.label,
      itens: itensFiltrados.filter((i) => i.status_item === col.status),
    }));

    res.json(kanban);
  } catch (err) {
    console.error('[requisicoes] Erro /kanban:', err);
    res.status(500).json({ erro: 'Erro ao buscar dados do kanban.' });
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
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id AND i.status_item = 'Reprovado') AS itens_reprovados
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
        (SELECT COUNT(*) FROM requisicao_itens i WHERE i.requisicao_id = r.id AND i.status_item = 'Reprovado') AS itens_reprovados
      FROM requisicoes r
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      ${where}
      ORDER BY
        CASE r.urgencia WHEN 'Emergencial' THEN 1 WHEN 'Urgente' THEN 2 ELSE 3 END ASC,
        r.criado_em DESC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[requisicoes] Erro ao listar por projeto:', err);
    res.status(500).json({ erro: 'Erro ao listar requisições.' });
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

// ─── PATCH /api/requisicoes/:id/itens/:itemId/analisar ───────────────────
// Gestor da Obra aprova ou reprova item
router.patch('/:id/itens/:itemId/analisar', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);

    if (!['Gestor da Obra', 'Gestor Geral', 'ADM'].includes(perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor da Obra, Gestor Geral ou ADM podem analisar itens.' });
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

    if (!['Gestor da Obra', 'Gestor Geral', 'ADM'].includes(perfil)) {
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

    await registrarHistorico(
      Number(req.params.id), Number(req.params.itemId), usuario.id,
      'COTACAO_EDITADA', null, null, null
    );

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

module.exports = router;

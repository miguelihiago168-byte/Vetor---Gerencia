const express = require('express');
const { auth } = require('../middleware/auth');
const { PERMISSIONS, hasPermission, assertProjectAccess, listarIdsProjetosUsuario } = require('../middleware/rbac');
const { PERFIS, inferirPerfil } = require('../constants/access');
const {
  ensureFinanceiroSchema,
  toDateOnly,
  toNumber,
  setSaldoInicial,
  listarReceitas,
  listarDespesas,
  criarReceita,
  criarDespesa,
  receberReceita,
  pagarDespesa,
  estornarLancamento,
  calcularDashboardProjeto,
  gerarFluxo
} = require('../services/financeiro');

const router = express.Router();

const canViewConsolidado = (usuario) => {
  const perfil = inferirPerfil(usuario);
  return [PERFIS.ADM, PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA].includes(perfil);
};

router.use(async (req, res, next) => {
  try {
    await ensureFinanceiroSchema();
    next();
  } catch (error) {
    console.error('Erro ao preparar schema financeiro:', error);
    res.status(500).json({ erro: 'Erro interno ao preparar módulo financeiro.' });
  }
});

router.get('/projeto/:projetoId/dashboard', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_VIEW)) {
      return res.status(403).json({ erro: 'Acesso negado para visualizar financeiro.' });
    }
    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const filtros = {
      inicio: toDateOnly(req.query.inicio),
      fim: toDateOnly(req.query.fim)
    };

    const dashboard = await calcularDashboardProjeto(projetoId, filtros);
    res.json(dashboard);
  } catch (error) {
    console.error('Erro ao carregar dashboard financeiro:', error);
    res.status(500).json({ erro: 'Erro ao carregar dashboard financeiro.' });
  }
});

router.patch('/projeto/:projetoId/saldo-inicial', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_FINANCE)) {
      return res.status(403).json({ erro: 'Acesso negado para editar saldo inicial.' });
    }
    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const saldoInicial = toNumber(req.body.saldo_inicial);
    const config = await setSaldoInicial(projetoId, saldoInicial, req.usuario.id);
    res.json(config);
  } catch (error) {
    console.error('Erro ao atualizar saldo inicial:', error);
    res.status(500).json({ erro: 'Erro ao atualizar saldo inicial.' });
  }
});

router.get('/projeto/:projetoId/receitas', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_VIEW)) {
      return res.status(403).json({ erro: 'Acesso negado para visualizar receitas.' });
    }
    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const receitas = await listarReceitas(projetoId, {
      inicio: toDateOnly(req.query.inicio),
      fim: toDateOnly(req.query.fim),
      cliente: req.query.cliente,
      status: req.query.status
    });

    res.json(receitas);
  } catch (error) {
    console.error('Erro ao listar receitas:', error);
    res.status(500).json({ erro: 'Erro ao listar receitas.' });
  }
});

router.post('/projeto/:projetoId/receitas', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_FINANCE)) {
      return res.status(403).json({ erro: 'Acesso negado para criar receitas.' });
    }
    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const valorPrevisto = toNumber(req.body.valor_previsto);
    const dataPrevista = toDateOnly(req.body.data_prevista);

    if (!valorPrevisto || !dataPrevista) {
      return res.status(400).json({ erro: 'valor_previsto e data_prevista são obrigatórios.' });
    }

    const receita = await criarReceita({
      projeto_id: projetoId,
      numero_contrato: req.body.numero_contrato,
      cliente: req.body.cliente,
      descricao: req.body.descricao,
      valor_previsto: valorPrevisto,
      valor_recebido: 0,
      data_prevista: dataPrevista,
      nf_numero: req.body.nf_numero,
      status: 'PREVISTO'
    }, req.usuario.id);

    res.status(201).json(receita);
  } catch (error) {
    console.error('Erro ao criar receita:', error);
    res.status(500).json({ erro: 'Erro ao criar receita.' });
  }
});

router.patch('/receitas/:id/receber', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_FINANCE)) {
      return res.status(403).json({ erro: 'Acesso negado para receber receita.' });
    }

    const valorRecebido = toNumber(req.body.valor_recebido);
    const dataRecebida = toDateOnly(req.body.data_recebida) || new Date().toISOString().slice(0, 10);
    if (!valorRecebido) {
      return res.status(400).json({ erro: 'valor_recebido é obrigatório.' });
    }

    const atualizada = await receberReceita(id, {
      valor_recebido: valorRecebido,
      data_recebida: dataRecebida
    }, req.usuario.id);

    if (!atualizada) return res.status(404).json({ erro: 'Receita não encontrada.' });

    const allowed = await assertProjectAccess(req, res, atualizada.projeto_id);
    if (!allowed) return;

    res.json(atualizada);
  } catch (error) {
    console.error('Erro ao receber receita:', error);
    res.status(500).json({ erro: 'Erro ao receber receita.' });
  }
});

router.get('/projeto/:projetoId/despesas', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_VIEW)) {
      return res.status(403).json({ erro: 'Acesso negado para visualizar despesas.' });
    }
    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const despesas = await listarDespesas(projetoId, {
      inicio: toDateOnly(req.query.inicio),
      fim: toDateOnly(req.query.fim),
      fornecedor: req.query.fornecedor,
      status: req.query.status,
      tipo: req.query.tipo
    });

    res.json(despesas);
  } catch (error) {
    console.error('Erro ao listar despesas:', error);
    res.status(500).json({ erro: 'Erro ao listar despesas.' });
  }
});

router.post('/projeto/:projetoId/despesas', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_FINANCE)) {
      return res.status(403).json({ erro: 'Acesso negado para criar despesas.' });
    }
    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const valorPrevisto = toNumber(req.body.valor_previsto);
    const dataPrevista = toDateOnly(req.body.data_prevista);

    if (!req.body.tipo || !valorPrevisto || !dataPrevista) {
      return res.status(400).json({ erro: 'tipo, valor_previsto e data_prevista são obrigatórios.' });
    }

    const despesa = await criarDespesa({
      projeto_id: projetoId,
      tipo: req.body.tipo,
      fornecedor: req.body.fornecedor,
      descricao: req.body.descricao,
      categoria: req.body.categoria,
      valor_previsto: valorPrevisto,
      data_prevista: dataPrevista,
      forma_pagamento: req.body.forma_pagamento,
      status: 'PREVISTO'
    }, req.usuario.id);

    res.status(201).json(despesa);
  } catch (error) {
    console.error('Erro ao criar despesa:', error);
    res.status(500).json({ erro: 'Erro ao criar despesa.' });
  }
});

router.patch('/despesas/:id/pagar', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_FINANCE)) {
      return res.status(403).json({ erro: 'Acesso negado para pagar despesa.' });
    }

    const valorPago = toNumber(req.body.valor_pago);
    const dataPaga = toDateOnly(req.body.data_paga) || new Date().toISOString().slice(0, 10);

    if (!valorPago) {
      return res.status(400).json({ erro: 'valor_pago é obrigatório.' });
    }

    const atualizada = await pagarDespesa(id, {
      valor_pago: valorPago,
      data_paga: dataPaga,
      forma_pagamento: req.body.forma_pagamento
    }, req.usuario.id);

    if (!atualizada) return res.status(404).json({ erro: 'Despesa não encontrada.' });

    const allowed = await assertProjectAccess(req, res, atualizada.projeto_id);
    if (!allowed) return;

    res.json(atualizada);
  } catch (error) {
    console.error('Erro ao pagar despesa:', error);
    res.status(500).json({ erro: 'Erro ao pagar despesa.' });
  }
});

router.post('/receitas/:id/estornar', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_FINANCE)) {
      return res.status(403).json({ erro: 'Acesso negado para estornar receita.' });
    }

    const motivo = String(req.body.motivo || '').trim();
    const valor = toNumber(req.body.valor_estornado);
    if (!motivo || !valor) {
      return res.status(400).json({ erro: 'motivo e valor_estornado são obrigatórios.' });
    }

    const receita = await estornarLancamento({
      entidadeTipo: 'RECEITA',
      entidadeId: id,
      valorEstornado: valor,
      motivo,
      usuarioId: req.usuario.id
    });

    if (!receita) return res.status(404).json({ erro: 'Receita não encontrada.' });
    const allowed = await assertProjectAccess(req, res, receita.projeto_id);
    if (!allowed) return;

    res.json(receita);
  } catch (error) {
    console.error('Erro ao estornar receita:', error);
    res.status(500).json({ erro: 'Erro ao estornar receita.' });
  }
});

router.post('/despesas/:id/estornar', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_FINANCE)) {
      return res.status(403).json({ erro: 'Acesso negado para estornar despesa.' });
    }

    const motivo = String(req.body.motivo || '').trim();
    const valor = toNumber(req.body.valor_estornado);
    if (!motivo || !valor) {
      return res.status(400).json({ erro: 'motivo e valor_estornado são obrigatórios.' });
    }

    const despesa = await estornarLancamento({
      entidadeTipo: 'DESPESA',
      entidadeId: id,
      valorEstornado: valor,
      motivo,
      usuarioId: req.usuario.id
    });

    if (!despesa) return res.status(404).json({ erro: 'Despesa não encontrada.' });
    const allowed = await assertProjectAccess(req, res, despesa.projeto_id);
    if (!allowed) return;

    res.json(despesa);
  } catch (error) {
    console.error('Erro ao estornar despesa:', error);
    res.status(500).json({ erro: 'Erro ao estornar despesa.' });
  }
});

router.get('/projeto/:projetoId/fluxo', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_VIEW)) {
      return res.status(403).json({ erro: 'Acesso negado para visualizar fluxo de caixa.' });
    }
    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const agrupamento = ['diario', 'semanal', 'mensal'].includes(req.query.agrupamento)
      ? req.query.agrupamento
      : 'mensal';

    const serie = await gerarFluxo(projetoId, {
      inicio: toDateOnly(req.query.inicio),
      fim: toDateOnly(req.query.fim)
    }, agrupamento);

    res.json(serie);
  } catch (error) {
    console.error('Erro ao gerar fluxo de caixa:', error);
    res.status(500).json({ erro: 'Erro ao gerar fluxo de caixa.' });
  }
});

router.get('/consolidado', auth, async (req, res) => {
  try {
    if (!canViewConsolidado(req.usuario)) {
      return res.status(403).json({ erro: 'Acesso negado para consolidado financeiro.' });
    }

    const perfil = inferirPerfil(req.usuario);
    const projetoRows = await (async () => {
      if ([PERFIS.ADM, PERFIS.GESTOR_GERAL].includes(perfil)) {
        const { allQuery } = require('../config/database');
        return allQuery('SELECT id, nome FROM projetos WHERE ativo = 1 AND arquivado = 0 ORDER BY nome');
      }
      const ids = await listarIdsProjetosUsuario(req.usuario.id);
      if (!ids.length) return [];
      const placeholders = ids.map(() => '?').join(',');
      const { allQuery } = require('../config/database');
      return allQuery(`SELECT id, nome FROM projetos WHERE id IN (${placeholders}) ORDER BY nome`, ids);
    })();

    const filtros = {
      inicio: toDateOnly(req.query.inicio),
      fim: toDateOnly(req.query.fim)
    };

    const porObra = [];
    for (const projeto of projetoRows) {
      const dashboard = await calcularDashboardProjeto(projeto.id, filtros);
      porObra.push({ projeto_id: projeto.id, projeto_nome: projeto.nome, ...dashboard });
    }

    const total = porObra.reduce((acc, item) => {
      acc.saldo_inicial += item.saldo_inicial;
      acc.receitas_previstas += item.receitas_previstas;
      acc.receitas_recebidas += item.receitas_recebidas;
      acc.despesas_previstas += item.despesas_previstas;
      acc.despesas_pagas += item.despesas_pagas;
      acc.saldo_projetado += item.saldo_projetado;
      acc.saldo_real += item.saldo_real;
      return acc;
    }, {
      saldo_inicial: 0,
      receitas_previstas: 0,
      receitas_recebidas: 0,
      despesas_previstas: 0,
      despesas_pagas: 0,
      saldo_projetado: 0,
      saldo_real: 0
    });

    total.diferenca = total.saldo_projetado - total.saldo_real;

    res.json({ total, obras: porObra });
  } catch (error) {
    console.error('Erro ao gerar consolidado financeiro:', error);
    res.status(500).json({ erro: 'Erro ao gerar consolidado financeiro.' });
  }
});

module.exports = router;

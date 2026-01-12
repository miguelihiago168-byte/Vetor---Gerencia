const express = require('express');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Dashboard - Avanço físico do projeto
router.get('/projeto/:projetoId/avanco', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;

    // Calcular avanço físico geral
    const resultado = await getQuery(`
      SELECT 
        AVG(percentual_executado) as avanco_medio,
        SUM(CASE WHEN status = 'Concluída' THEN 1 ELSE 0 END) as concluidas,
        SUM(CASE WHEN status = 'Em andamento' THEN 1 ELSE 0 END) as em_andamento,
        -- Não contabilizar atividades 'mãe' como "não iniciadas"
        SUM(CASE WHEN status = 'Não iniciada' AND pai_id IS NOT NULL THEN 1 ELSE 0 END) as nao_iniciadas,
        COUNT(*) as total_atividades
      FROM atividades_eap
      WHERE projeto_id = ?
    `, [projetoId]);

    // Avanço por atividade principal (pai_id IS NULL) - agregar a partir das filhas quando aplicável
    const atividadesRaw = await allQuery(`
      SELECT * FROM atividades_eap WHERE projeto_id = ? ORDER BY ordem, codigo_eap
    `, [projetoId]);

    // montar map por id
    const byId = {};
    atividadesRaw.forEach(a => { byId[a.id] = { ...a, previsto_agregado: a.quantidade_total || 0, executado_agregado: (a.percentual_executado || 0) * ((a.quantidade_total||0)/100) }; });

    // agregar das filhas para os pais
    atividadesRaw.forEach(a => {
      if (a.pai_id) {
        const pai = byId[a.pai_id];
        if (pai) {
          pai.previsto_agregado = (pai.previsto_agregado || 0) + (a.quantidade_total || 0);
          const exec = (a.quantidade_total || 0) * ((a.percentual_executado || 0) / 100);
          pai.executado_agregado = (pai.executado_agregado || 0) + exec;
        }
      }
    });

    const atividadesPrincipais = atividadesRaw.filter(a => !a.pai_id).map(a => {
      const copy = { ...a };
      const agg = byId[a.id] || {};
      const previsto = agg.previsto_agregado || (a.quantidade_total || 0);
      const executado = agg.executado_agregado || ((a.percentual_executado || 0) / 100) * (a.quantidade_total || 0);
      let percentual_agregado = 0;
      if (previsto && previsto > 0) {
        percentual_agregado = Math.min(Math.round((executado / previsto) * 10000) / 100, 100);
      } else {
        percentual_agregado = a.percentual_executado || 0;
      }
      // expor como percentual_executado para compatibilidade com frontend
      copy.percentual_executado = percentual_agregado;
      copy.percentual_previsto = a.percentual_previsto || 0;
      return copy;
    });

    // Evolução diária
    const evolucaoDiaria = await allQuery(`
      SELECT 
        r.data_relatorio,
        COUNT(DISTINCT ra.atividade_eap_id) as atividades_trabalhadas,
        SUM(ra.percentual_executado) as percentual_dia
      FROM rdos r
      LEFT JOIN rdo_atividades ra ON r.id = ra.rdo_id
      WHERE r.projeto_id = ? AND r.status = 'Aprovado'
      GROUP BY r.data_relatorio
      ORDER BY r.data_relatorio DESC
      LIMIT 30
    `, [projetoId]);

    res.json({
      avanco_geral: resultado,
      atividades_principais: atividadesPrincipais,
      evolucao_diaria: evolucaoDiaria
    });

  } catch (error) {
    console.error('Erro ao obter dashboard:', error);
    res.status(500).json({ erro: 'Erro ao obter dados do dashboard.' });
  }
});

// Estatísticas de RDOs
router.get('/projeto/:projetoId/rdos-stats', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;

    const stats = await getQuery(`
      SELECT 
        COUNT(*) as total_rdos,
        SUM(CASE WHEN status = 'Aprovado' THEN 1 ELSE 0 END) as aprovados,
        SUM(CASE WHEN status = 'Em análise' THEN 1 ELSE 0 END) as em_analise,
        SUM(CASE WHEN status = 'Em preenchimento' THEN 1 ELSE 0 END) as em_preenchimento,
        SUM(CASE WHEN status = 'Reprovado' THEN 1 ELSE 0 END) as reprovados,
        SUM(mao_obra_direta + mao_obra_indireta + mao_obra_terceiros) as total_mao_obra
      FROM rdos
      WHERE projeto_id = ?
    `, [projetoId]);

    res.json(stats);

  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ erro: 'Erro ao obter estatísticas.' });
  }
});

module.exports = router;

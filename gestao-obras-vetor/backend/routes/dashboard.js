const express = require('express');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

const toDateOnly = (value) => {
  if (!value) return null;
  const asString = String(value);
  const match = asString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addDays = (dateOnly, days) => {
  const base = new Date(`${dateOnly}T00:00:00`);
  base.setDate(base.getDate() + days);
  return toDateOnly(base);
};

const diffDays = (fromDateOnly, toDateOnlyValue) => {
  const from = new Date(`${fromDateOnly}T00:00:00`);
  const to = new Date(`${toDateOnlyValue}T00:00:00`);
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
};

// Dashboard - Avanço físico do projeto
router.get('/projeto/:projetoId/avanco', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });
    // Verifica se o projeto pertence ao tenant
    const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projetoId, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }
    // Calcular avanço físico geral
    const resultado = await getQuery(`
      SELECT 
        AVG(percentual_executado) as avanco_medio,
        SUM(CASE WHEN status = 'Concluída' THEN 1 ELSE 0 END) as concluidas,
        SUM(CASE WHEN status = 'Em andamento' THEN 1 ELSE 0 END) as em_andamento,
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
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });
    // Verifica se o projeto pertence ao tenant
    const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projetoId, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }
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

router.get('/projeto/:projetoId/curva-s', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });
    // Verifica se o projeto pertence ao tenant
    const projeto = await getQuery(`
      SELECT p.id, p.nome, COALESCE(u.nome, 'Sem responsável') AS responsavel
      FROM projetos p
      LEFT JOIN usuarios u ON p.criado_por = u.id
      WHERE p.id = ? AND p.tenant_id = ?
    `, [projetoId, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }
    const atividades = await allQuery(`
      SELECT a.id,
             COALESCE(a.id_atividade, ('ATV-' || a.id)) AS id_atividade,
             COALESCE(a.nome, a.descricao) AS nome,
             a.data_inicio_planejada,
             a.data_fim_planejada,
             COALESCE(a.peso_percentual_projeto, a.percentual_previsto, 0) AS peso_percentual_projeto,
             COALESCE(a.percentual_executado, 0) AS percentual_executado,
             a.data_conclusao_real
      FROM atividades_eap a
      WHERE a.projeto_id = ?
        AND NOT EXISTS (SELECT 1 FROM atividades_eap c WHERE c.pai_id = a.id)
      ORDER BY a.ordem, a.codigo_eap
    `, [projetoId]);
    if (!atividades.length) {
      return res.json({
        projeto,
        indicadores: {
          avanco_planejado: 0,
          avanco_real: 0,
          desvio: 0,
          spi: 1,
          spi_status: 'amarelo'
        },
        serie: [],
        atrasos: [],
        data_atual: toDateOnly(new Date())
      });
    }

    const faltantes = atividades.filter(a => !a.id_atividade || !a.nome || !a.data_inicio_planejada || !a.data_fim_planejada);
    if (faltantes.length > 0) {
      return res.status(400).json({
        erro: 'Estrutura da EAP incompleta para Curva S. Preencha id_atividade, nome e datas planejadas em todas as atividades.',
        atividades_invalidas: faltantes.map(a => ({ id: a.id, id_atividade: a.id_atividade, nome: a.nome }))
      });
    }

    const totalPesos = atividades.reduce((acc, atividade) => acc + Number(atividade.peso_percentual_projeto || 0), 0);
    if (totalPesos <= 0.0001) {
      return res.status(400).json({
        erro: 'Não há pesos válidos para cálculo da Curva S.',
        total_pesos: Math.round(totalPesos * 100) / 100
      });
    }

    const fatorNormalizacao = 100 / totalPesos;

    const hoje = toDateOnly(new Date());
    const inicioProjeto = atividades.map(a => a.data_inicio_planejada).sort()[0];
    const fimPlanejado = atividades.map(a => a.data_fim_planejada).sort().reverse()[0];
    const dataFimSerie = hoje < fimPlanejado ? hoje : fimPlanejado;

    const pesosPorAtividade = {};
    atividades.forEach(a => {
      pesosPorAtividade[a.id] = Number(a.peso_percentual_projeto || 0) * fatorNormalizacao;
    });

    const planejadoPorDia = {};
    for (const atividade of atividades) {
      const inicio = atividade.data_inicio_planejada;
      const fim = atividade.data_fim_planejada;
      const duracao = Math.max(1, diffDays(inicio, fim) + 1);
      const avancoPlanejadoDia = (Number(atividade.peso_percentual_projeto || 0) * fatorNormalizacao) / duracao;

      for (let i = 0; i < duracao; i += 1) {
        const data = addDays(inicio, i);
        if (data > dataFimSerie) break;
        planejadoPorDia[data] = (planejadoPorDia[data] || 0) + avancoPlanejadoDia;
      }
    }

    const realRaw = await allQuery(`
      SELECT
        r.data_relatorio,
        ra.atividade_eap_id,
        CASE
          WHEN COALESCE(a.quantidade_total, 0) > 0 THEN
            (COALESCE(SUM(COALESCE(ra.quantidade_executada, 0)), 0) / a.quantidade_total) * 100
          ELSE
            COALESCE(SUM(ra.percentual_executado), 0)
        END AS percentual_dia
      FROM rdo_atividades ra
      INNER JOIN rdos r ON r.id = ra.rdo_id
      INNER JOIN atividades_eap a ON a.id = ra.atividade_eap_id
      WHERE r.projeto_id = ?
        AND r.status = 'Aprovado'
      GROUP BY r.data_relatorio, ra.atividade_eap_id, a.quantidade_total
      ORDER BY r.data_relatorio ASC
    `, [projetoId]);

    const realPorDiaAtividade = {};
    realRaw.forEach(row => {
      const data = toDateOnly(row.data_relatorio);
      if (!data || data > dataFimSerie) return;
      if (!realPorDiaAtividade[data]) realPorDiaAtividade[data] = [];
      realPorDiaAtividade[data].push({
        atividadeId: row.atividade_eap_id,
        percentualDia: Number(row.percentual_dia || 0)
      });
    });

    // Se houver execução real antes do início planejado, iniciar a série nessa data
    // para refletir avanço adiantado na Curva S.
    const primeiraDataReal = realRaw
      .map(row => toDateOnly(row.data_relatorio))
      .filter(Boolean)
      .sort()[0] || null;
    const inicioSerie = (primeiraDataReal && primeiraDataReal < inicioProjeto)
      ? primeiraDataReal
      : inicioProjeto;

    const acumuladoRealAtividade = {};
    atividades.forEach(a => {
      acumuladoRealAtividade[a.id] = 0;
    });

    const serie = [];
    let acumuladoPlanejado = 0;
    let acumuladoReal = 0;

    const totalDias = Math.max(0, diffDays(inicioSerie, dataFimSerie));
    for (let i = 0; i <= totalDias; i += 1) {
      const data = addDays(inicioSerie, i);

      acumuladoPlanejado = Math.min(100, acumuladoPlanejado + Number(planejadoPorDia[data] || 0));

      const registrosData = realPorDiaAtividade[data] || [];
      let incrementoRealDia = 0;
      for (const registro of registrosData) {
        const peso = Number(pesosPorAtividade[registro.atividadeId] || 0);
        if (!peso) continue;
        const percAnterior = Number(acumuladoRealAtividade[registro.atividadeId] || 0);
        const percNovo = Math.min(100, percAnterior + Number(registro.percentualDia || 0));
        const deltaPerc = Math.max(0, percNovo - percAnterior);
        acumuladoRealAtividade[registro.atividadeId] = percNovo;
        incrementoRealDia += (peso * deltaPerc) / 100;
      }

      acumuladoReal = Math.min(100, acumuladoReal + incrementoRealDia);

      serie.push({
        data,
        planejado: Math.round(acumuladoPlanejado * 100) / 100,
        real: Math.round(acumuladoReal * 100) / 100
      });
    }

    const pontoAtual = serie.length ? serie[serie.length - 1] : { planejado: 0, real: 0 };
    const avancoPlanejado = Number(pontoAtual.planejado || 0);
    const avancoReal = Number(pontoAtual.real || 0);
    const desvio = Math.round((avancoReal - avancoPlanejado) * 100) / 100;
    const spi = avancoPlanejado > 0 ? Math.round((avancoReal / avancoPlanejado) * 1000) / 1000 : 1;

    let spiStatus = 'amarelo';
    if (spi < 1) spiStatus = 'vermelho';
    if (spi > 1) spiStatus = 'verde';

    const atrasos = atividades
      .map(atividade => {
        const inicio = atividade.data_inicio_planejada;
        const fim = atividade.data_fim_planejada;
        const executado = Number(atividade.percentual_executado || 0);

        let statusAtraso = null;
        let diasAtraso = 0;

        if (hoje > fim && executado < 100) {
          statusAtraso = 'Atraso Crítico';
          diasAtraso = diffDays(fim, hoje);
        } else if (hoje > inicio && executado === 0) {
          statusAtraso = 'Atrasada';
          diasAtraso = diffDays(inicio, hoje);
        }

        if (!statusAtraso) return null;
        return {
          id_atividade: atividade.id_atividade,
          nome: atividade.nome,
          status: statusAtraso,
          dias_atraso: Math.max(0, diasAtraso),
          responsavel: projeto.responsavel,
          percentual_executado: Math.round(executado * 100) / 100
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.dias_atraso - a.dias_atraso);

    res.json({
      projeto,
      indicadores: {
        avanco_planejado: avancoPlanejado,
        avanco_real: avancoReal,
        desvio,
        spi,
        spi_status: spiStatus
      },
      serie,
      atrasos,
      data_atual: hoje
    });
  } catch (error) {
    console.error('Erro ao calcular Curva S:', error);
    res.status(500).json({ erro: 'Erro ao calcular Curva S do projeto.' });
  }
});

module.exports = router;

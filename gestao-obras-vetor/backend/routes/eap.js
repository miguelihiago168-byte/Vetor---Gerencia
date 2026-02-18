const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

// Listar atividades EAP de um projeto
router.get('/projeto/:projetoId', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;

    const atividades = await allQuery(`
      SELECT * FROM atividades_eap
      WHERE projeto_id = ?
      ORDER BY ordem, codigo_eap
    `, [projetoId]);

    // Agregar métricas para atividades-mãe
    const byId = {};
    atividades.forEach(a => { byId[a.id] = { ...a, previsto_agregado: a.quantidade_total || 0, executado_agregado: (a.percentual_executado || 0) * ((a.quantidade_total||0)/100) } });

    // calcular a partir das filhas
    atividades.forEach(a => {
      if (a.pai_id) {
        const pai = byId[a.pai_id];
        if (pai) {
          pai.previsto_agregado = (pai.previsto_agregado || 0) + (a.quantidade_total || 0);
          const exec = (a.quantidade_total || 0) * ((a.percentual_executado || 0) / 100);
          pai.executado_agregado = (pai.executado_agregado || 0) + exec;
        }
      }
    });

    // construir lista com campos agregados para pais
    const atividadesOut = atividades.map(a => {
      const copy = { ...a };
      if (!a.pai_id) {
        const agg = byId[a.id] || {};
        const previsto = agg.previsto_agregado || (a.quantidade_total || 0);
        const executado = agg.executado_agregado || ((a.percentual_executado || 0) / 100) * (a.quantidade_total || 0);
        let percentual_agregado = 0;
        if (previsto && previsto > 0) {
          percentual_agregado = Math.min(Math.round((executado / previsto) * 10000) / 100, 100);
        } else {
          percentual_agregado = a.percentual_executado || 0;
        }
        copy.previsto_agregado = previsto;
        copy.executado_agregado = Math.round((executado + 0.000001) * 100) / 100; // duas casas
        copy.percentual_agregado = percentual_agregado;
      }
      return copy;
    });

    res.json(atividadesOut);
  } catch (error) {
    console.error('Erro ao listar atividades:', error);
    res.status(500).json({ erro: 'Erro ao listar atividades.' });
  }
});

// Copiar EAP de um projeto para outro
router.post('/copiar', [auth, isGestor], async (req, res) => {
  try {
    const { sourceProjetoId, targetProjetoId } = req.body;
    if (!sourceProjetoId || !targetProjetoId) return res.status(400).json({ erro: 'É necessário sourceProjetoId e targetProjetoId.' });

    const atividades = await allQuery('SELECT * FROM atividades_eap WHERE projeto_id = ? ORDER BY id', [sourceProjetoId]);
    const mapOldToNew = {};

    // Inserir atividades na mesma ordem, mantendo pai mapping
    for (const a of atividades) {
      const result = await runQuery(`
        INSERT INTO atividades_eap (projeto_id, codigo_eap, descricao, percentual_previsto, pai_id, ordem, unidade_medida, quantidade_total, criado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [targetProjetoId, a.codigo_eap, a.descricao + ` (copiado de projeto ${sourceProjetoId})`, a.percentual_previsto, null, a.ordem, a.unidade_medida, a.quantidade_total, req.usuario.id]);
      mapOldToNew[a.id] = result.lastID;
    }

    // atualizar pai_id das atividades copiadas
    for (const a of atividades) {
      if (a.pai_id) {
        const newId = mapOldToNew[a.id];
        const newPai = mapOldToNew[a.pai_id] || null;
        await runQuery('UPDATE atividades_eap SET pai_id = ? WHERE id = ?', [newPai, newId]);
      }
    }

    await registrarAuditoria('atividades_eap', null, 'COPY', { from: sourceProjetoId, to: targetProjetoId }, null, req.usuario.id);

    res.json({ mensagem: 'EAP copiada com sucesso.' });
  } catch (error) {
    console.error('Erro ao copiar EAP:', error);
    res.status(500).json({ erro: 'Erro ao copiar EAP.' });
  }
});

// Criar atividade EAP
router.post('/', auth, [
  body('projeto_id').isInt(),
  body('codigo_eap').trim().notEmpty(),
  body('descricao').trim().notEmpty(),
  body('percentual_previsto').optional().isFloat({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
    }

    const { projeto_id, codigo_eap, descricao, percentual_previsto, pai_id, ordem, unidade_medida, quantidade_total } = req.body;

    const result = await runQuery(`
      INSERT INTO atividades_eap 
      (projeto_id, codigo_eap, descricao, percentual_previsto, pai_id, ordem, unidade_medida, quantidade_total, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projeto_id,
      codigo_eap,
      descricao,
      percentual_previsto || 100,
      pai_id || null,
      ordem || 0,
      unidade_medida || null,
      quantidade_total || 0,
      req.usuario.id
    ]);

    await registrarAuditoria('atividades_eap', result.lastID, 'CREATE', null, req.body, req.usuario.id);

    res.status(201).json({
      mensagem: 'Atividade criada com sucesso.',
      atividade: { id: result.lastID, codigo_eap, descricao }
    });

  } catch (error) {
    console.error('Erro ao criar atividade:', error);
    res.status(500).json({ erro: 'Erro ao criar atividade.' });
  }
});

// Atualizar atividade EAP
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo_eap, descricao, percentual_previsto, ordem, unidade_medida, quantidade_total } = req.body;

    const atividadeAnterior = await getQuery('SELECT * FROM atividades_eap WHERE id = ?', [id]);

    await runQuery(`
      UPDATE atividades_eap 
      SET codigo_eap = ?, descricao = ?, percentual_previsto = ?, ordem = ?, unidade_medida = ?, quantidade_total = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [codigo_eap, descricao, percentual_previsto, ordem, unidade_medida || null, quantidade_total || 0, id]);

    await registrarAuditoria('atividades_eap', id, 'UPDATE', atividadeAnterior, req.body, req.usuario.id);

    // Recalcular avanço da atividade com base nos RDOs existentes
    try {
      // Percentual executado agregado por quantidade (se houver)
      const infoQt = await getQuery('SELECT quantidade_total, projeto_id FROM atividades_eap WHERE id = ?', [id]);
      const quantidadeTotal = infoQt ? (infoQt.quantidade_total || 0) : 0;

      let novoPerc = 0;
      if (quantidadeTotal && quantidadeTotal > 0) {
        const somaQt = await getQuery(`
          SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada,0)),0) as total_executado_qt
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ?
        `, [id]);
        const totalExec = somaQt ? (somaQt.total_executado_qt || 0) : 0;
        novoPerc = Math.min(Math.round(((totalExec / quantidadeTotal) * 10000)) / 100, 100);
      } else {
        const somaPerc = await getQuery(`
          SELECT COALESCE(SUM(ra.percentual_executado),0) as total_exec_perc
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ?
        `, [id]);
        novoPerc = Math.min((somaPerc?.total_exec_perc || 0), 100);
      }

      await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [novoPerc, id]);
      await atualizarStatusAtividade(id);

      // Atualizar o último RDO (mais recente por data_relatorio) com novo percentual da atividade
      const lastRa = await getQuery(`
        SELECT ra.id as rdo_atividade_id, ra.quantidade_executada, r.id as rdo_id, r.data_relatorio
        FROM rdo_atividades ra
        INNER JOIN rdos r ON ra.rdo_id = r.id
        WHERE ra.atividade_eap_id = ?
        ORDER BY r.data_relatorio DESC, r.id DESC
        LIMIT 1
      `, [id]);

      if (lastRa) {
        let novoPercRdo = 0;
        if (quantidadeTotal && quantidadeTotal > 0 && lastRa.quantidade_executada) {
          novoPercRdo = Math.min(Math.round(((parseFloat(lastRa.quantidade_executada) / quantidadeTotal) * 10000)) / 100, 100);
        } else {
          // fallback para o agregado calculado
          novoPercRdo = novoPerc;
        }
        await runQuery('UPDATE rdo_atividades SET percentual_executado = ? WHERE id = ?', [novoPercRdo, lastRa.rdo_atividade_id]);

        // Registrar histórico de ajuste
        try {
          await runQuery(`
            INSERT INTO historico_atividades 
            (atividade_eap_id, rdo_id, percentual_anterior, percentual_executado, percentual_novo, usuario_id, data_execucao)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [id, lastRa.rdo_id, atividadeAnterior?.percentual_executado || 0, novoPercRdo, novoPerc, req.usuario.id, new Date().toISOString()]);
        } catch (e) { /* ignore */ }
      }

    } catch (err) {
      console.warn('Falha ao recalcular após atualização de EAP:', err);
    }

    res.json({ mensagem: 'Atividade atualizada com sucesso.' });

  } catch (error) {
    console.error('Erro ao atualizar atividade:', error);
    res.status(500).json({ erro: 'Erro ao atualizar atividade.' });
  }
});

// Atualizar status da atividade
const atualizarStatusAtividade = async (atividadeId) => {
  const atividade = await getQuery(
    'SELECT percentual_executado FROM atividades_eap WHERE id = ?',
    [atividadeId]
  );

  let novoStatus;
  if (atividade.percentual_executado === 0) {
    novoStatus = 'Não iniciada';
  } else if (atividade.percentual_executado >= 100) {
    novoStatus = 'Concluída';
  } else {
    novoStatus = 'Em andamento';
  }

  await runQuery(
    'UPDATE atividades_eap SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
    [novoStatus, atividadeId]
  );
};

// Recalcular percentual do pai com base nos filhos (média ponderada por quantidade_total)
const recalcularPercentualPaiLocal = async (atividadeId) => {
  try {
    const paiRow = await getQuery('SELECT pai_id FROM atividades_eap WHERE id = ?', [atividadeId]);
    if (!paiRow || !paiRow.pai_id) return;

    const paiId = paiRow.pai_id;

    // Buscar filhos do pai
    const filhos = await allQuery('SELECT id, percentual_executado, quantidade_total FROM atividades_eap WHERE pai_id = ?', [paiId]);
    if (!filhos || filhos.length === 0) return;

    let somaPesada = 0;
    let somaPeso = 0;
    let somaSimples = 0;
    for (const f of filhos) {
      const perc = parseFloat(f.percentual_executado || 0);
      const peso = parseFloat(f.quantidade_total || 0);
      somaSimples += perc;
      if (peso && peso > 0) {
        somaPesada += perc * peso;
        somaPeso += peso;
      }
    }

    let novoPerc = 0;
    if (somaPeso > 0) {
      novoPerc = Math.min(Math.round((somaPesada / somaPeso) * 100) / 100, 100);
    } else {
      novoPerc = Math.min(Math.round((somaSimples / filhos.length) * 100) / 100, 100);
    }

    await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [novoPerc, paiId]);
    await atualizarStatusAtividade(paiId);

    // Recalcular ancestral recursivamente
    await recalcularPercentualPaiLocal(paiId);
  } catch (err) {
    console.warn('Erro ao recalcular percentual do pai (local):', err);
  }
};

// Recalcular avanço físico de uma atividade
router.post('/:id/recalcular', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Somar percentuais executados nos RDOs aprovados
    const resultado = await getQuery(`
      SELECT COALESCE(SUM(ra.percentual_executado), 0) as total_executado
      FROM rdo_atividades ra
      INNER JOIN rdos r ON ra.rdo_id = r.id
      WHERE ra.atividade_eap_id = ? AND r.status IN ('Aprovado', 'Em análise', 'Em preenchimento')
    `, [id]);

    const percentualExecutado = Math.min(resultado.total_executado, 100);

    await runQuery(
      'UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [percentualExecutado, id]
    );

    await atualizarStatusAtividade(id);

    await registrarAuditoria('atividades_eap', id, 'RECALCULAR', null, { percentual_executado: percentualExecutado }, req.usuario.id);

    res.json({ 
      mensagem: 'Avanço físico recalculado com sucesso.',
      percentual_executado: percentualExecutado
    });

  } catch (error) {
    console.error('Erro ao recalcular avanço:', error);
    res.status(500).json({ erro: 'Erro ao recalcular avanço físico.' });
  }
});

// Obter histórico de uma atividade
router.get('/:id/historico', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const historico = await allQuery(`
      SELECT h.*, u.nome as usuario_nome, r.data_relatorio
      FROM historico_atividades h
      INNER JOIN usuarios u ON h.usuario_id = u.id
      INNER JOIN rdos r ON h.rdo_id = r.id
      WHERE h.atividade_eap_id = ?
      ORDER BY h.data_execucao DESC
    `, [id]);

    res.json(historico);

  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    res.status(500).json({ erro: 'Erro ao obter histórico.' });
  }
});

// Deletar atividade
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    await runQuery('DELETE FROM atividades_eap WHERE id = ?', [id]);
    await registrarAuditoria('atividades_eap', id, 'DELETE', null, null, req.usuario.id);

    res.json({ mensagem: 'Atividade deletada com sucesso.' });

  } catch (error) {
    console.error('Erro ao deletar atividade:', error);
    res.status(500).json({ erro: 'Erro ao deletar atividade.' });
  }
});

// Recalcular avanço de TODAS as atividades do projeto (apenas gestor)
router.post('/projeto/:projetoId/recalcular-tudo', [auth, isGestor], async (req, res) => {
  try {
    const { projetoId } = req.params;

    const atividades = await allQuery('SELECT id, quantidade_total FROM atividades_eap WHERE projeto_id = ?', [projetoId]);
    for (const a of atividades) {
      const quantidadeTotal = a.quantidade_total || 0;
      let novoPerc = 0;
      if (quantidadeTotal && quantidadeTotal > 0) {
        const r = await getQuery(`
          SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada,0)),0) as total_executado_qt
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ?
        `, [a.id]);
        novoPerc = Math.min(Math.round(((parseFloat(r?.total_executado_qt || 0) / quantidadeTotal) * 10000)) / 100, 100);
      } else {
        const r = await getQuery(`
          SELECT COALESCE(SUM(ra.percentual_executado),0) as total_exec_perc
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ?
        `, [a.id]);
        novoPerc = Math.min(parseFloat(r?.total_exec_perc || 0), 100);
      }

      await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [novoPerc, a.id]);
      await atualizarStatusAtividade(a.id);

      // Após atualizar folha/filha, propagar cálculo para os pais
      await recalcularPercentualPaiLocal(a.id);
    }

    await registrarAuditoria('atividades_eap', null, 'RECALCULAR_TODAS', { projeto_id: projetoId }, null, req.usuario.id);
    res.json({ mensagem: 'EAP recalculada para todas as atividades do projeto.' });
  } catch (error) {
    console.error('Erro ao recalcular EAP do projeto:', error);
    res.status(500).json({ erro: 'Erro ao recalcular EAP do projeto.' });
  }
});

module.exports = router;

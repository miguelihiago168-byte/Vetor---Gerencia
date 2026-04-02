const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

const parseDateOnly = (value) => {
  if (!value) return null;
  const asString = String(value);
  const match = asString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const ensureFaixaPercentual = (valor) => {
  const parsed = parseFloat(valor);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
};

const getSomaPesosFolhas = async (projetoId) => {
  const row = await getQuery(`
    SELECT COALESCE(SUM(COALESCE(a.peso_percentual_projeto, a.percentual_previsto, 0)), 0) AS total
    FROM atividades_eap a
    WHERE a.projeto_id = ?
      AND NOT EXISTS (SELECT 1 FROM atividades_eap c WHERE c.pai_id = a.id)
  `, [projetoId]);
  return Number(row?.total || 0);
};

const getSomaPesosIrmaos = async (projetoId, paiId, excluirId = null) => {
  const whereExtra = excluirId ? 'AND id <> ?' : '';
  const params = excluirId ? [projetoId, paiId, excluirId] : [projetoId, paiId];
  const row = await getQuery(`
    SELECT COALESCE(SUM(COALESCE(peso_percentual_projeto, percentual_previsto, 0)), 0) AS total
    FROM atividades_eap
    WHERE projeto_id = ?
      AND pai_id = ?
      ${whereExtra}
  `, params);
  return Number(row?.total || 0);
};

// Listar atividades EAP de um projeto (tenant-aware)
router.get('/projeto/:projetoId', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ erro: 'Tenant não definido.' });
    }
    // Verifica se o projeto pertence ao tenant
    const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projetoId, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }

    const atividades = await allQuery(`
      SELECT *,
             COALESCE(id_atividade, ('ATV-' || id)) AS id_atividade,
             COALESCE(nome, descricao) AS nome,
             COALESCE(peso_percentual_projeto, percentual_previsto, 0) AS peso_percentual_projeto
      FROM atividades_eap
      WHERE projeto_id = ?
      ORDER BY ordem, codigo_eap
    `, [projetoId]);

    // ...existing code...
    const byId = {};
    atividades.forEach(a => { byId[a.id] = { ...a, previsto_agregado: a.quantidade_total || 0, executado_agregado: (a.percentual_executado || 0) * ((a.quantidade_total||0)/100) } });

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
        copy.executado_agregado = Math.round((executado + 0.000001) * 100) / 100;
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

// Copiar EAP de um projeto para outro (tenant-aware)
router.post('/copiar', [auth, isGestor], async (req, res) => {
  try {
    const { sourceProjetoId, targetProjetoId } = req.body;
    const tenantId = req.tenantId;
    if (!sourceProjetoId || !targetProjetoId) return res.status(400).json({ erro: 'É necessário sourceProjetoId e targetProjetoId.' });
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });
    // Verifica se ambos os projetos pertencem ao tenant
    const sourceProjeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [sourceProjetoId, tenantId]);
    const targetProjeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [targetProjetoId, tenantId]);
    if (!sourceProjeto || !targetProjeto) {
      return res.status(404).json({ erro: 'Projetos de origem ou destino não pertencem ao seu tenant.' });
    }

    const atividades = await allQuery('SELECT * FROM atividades_eap WHERE projeto_id = ? ORDER BY id', [sourceProjetoId]);
    const mapOldToNew = {};

    for (const a of atividades) {
      const result = await runQuery(`
        INSERT INTO atividades_eap (tenant_id, projeto_id, codigo_eap, descricao, percentual_previsto, pai_id, ordem, unidade_medida, quantidade_total, criado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [tenantId, targetProjetoId, a.codigo_eap, a.descricao + ` (copiado de projeto ${sourceProjetoId})`, a.percentual_previsto, null, a.ordem, a.unidade_medida, a.quantidade_total, req.usuario.id]);
      mapOldToNew[a.id] = result.lastID;
    }

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

// Criar atividade EAP (tenant-aware)
router.post('/', auth, [
  body('projeto_id').isInt(),
  body('codigo_eap').trim().notEmpty(),
  body('percentual_previsto').optional().isFloat({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
    }

    const {
      projeto_id,
      codigo_eap,
      descricao,
      percentual_previsto,
      pai_id,
      ordem,
      unidade_medida,
      quantidade_total,
      id_atividade,
      nome,
      data_inicio_planejada,
      data_fim_planejada,
      peso_percentual_projeto
    } = req.body;
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ erro: 'Tenant não definido.' });
    }
    // Verifica se o projeto pertence ao tenant
    const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projeto_id, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }

    const ehFilha = !!pai_id;
    const descricaoNormalizada = (typeof descricao === 'string')
      ? descricao.trim()
      : '';

    const dataInicio = parseDateOnly(data_inicio_planejada);
    const dataFim = parseDateOnly(data_fim_planejada);
    if (ehFilha && (!dataInicio || !dataFim)) {
      return res.status(400).json({ erro: 'Informe data_inicio_planejada e data_fim_planejada válidas (YYYY-MM-DD).' });
    }
    if (dataInicio && dataFim && dataInicio > dataFim) {
      return res.status(400).json({ erro: 'data_fim_planejada deve ser maior ou igual a data_inicio_planejada.' });
    }

    const pesoInformado = peso_percentual_projeto ?? percentual_previsto;
    const peso = (ehFilha || pesoInformado !== undefined)
      ? ensureFaixaPercentual(pesoInformado)
      : 0;
    if (ehFilha && peso === null) {
      return res.status(400).json({ erro: 'peso_percentual_projeto deve estar entre 0 e 100.' });
    }
    if (!ehFilha && peso === null) {
      return res.status(400).json({ erro: 'peso_percentual_projeto deve estar entre 0 e 100 quando informado.' });
    }

    if (ehFilha) {
      const somaIrmaos = await getSomaPesosIrmaos(projeto_id, pai_id);
      const totalFilhosProjetado = somaIrmaos + Number(peso || 0);
      if (totalFilhosProjetado > 100.0001) {
        return res.status(400).json({ erro: `A soma dos pesos das atividades filhas deste pai não pode ultrapassar 100%. Total projetado: ${totalFilhosProjetado.toFixed(2)}%.` });
      }

      const paiRow = await getQuery(`
        SELECT id, pai_id, COALESCE(peso_percentual_projeto, percentual_previsto, 0) AS peso,
               EXISTS(SELECT 1 FROM atividades_eap c WHERE c.pai_id = atividades_eap.id) AS tem_filhos
        FROM atividades_eap
        WHERE id = ? AND projeto_id = ?
      `, [pai_id, projeto_id]);
      if (!paiRow) {
        return res.status(400).json({ erro: 'Atividade pai inválida para este projeto.' });
      }
      if (paiRow.pai_id) {
        return res.status(400).json({ erro: 'Somente atividades pai (raiz) podem receber atividades filhas.' });
      }
    }

    const identificador = (id_atividade && String(id_atividade).trim()) || `ATV-${projeto_id}-${codigo_eap}`;
    const nomeAtividade = (nome && String(nome).trim()) || descricaoNormalizada || `Atividade ${codigo_eap}`;

    const result = await runQuery(`
      INSERT INTO atividades_eap 
      (tenant_id, projeto_id, codigo_eap, descricao, percentual_previsto, pai_id, ordem, unidade_medida, quantidade_total, criado_por, id_atividade, nome, data_inicio_planejada, data_fim_planejada, peso_percentual_projeto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tenantId,
      projeto_id,
      codigo_eap,
      descricaoNormalizada,
      peso,
      pai_id || null,
      ordem || 0,
      unidade_medida || null,
      quantidade_total || 0,
      req.usuario.id,
      identificador,
      nomeAtividade,
      dataInicio || null,
      dataFim || null,
      peso
    ]);

    await registrarAuditoria('atividades_eap', result.lastID, 'CREATE', null, req.body, req.usuario.id);

    res.status(201).json({
      mensagem: 'Atividade criada com sucesso.',
      atividade: { id: result.lastID, codigo_eap, descricao: descricaoNormalizada }
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
    const { codigo_eap, descricao, percentual_previsto, ordem, unidade_medida, quantidade_total, pai_id, id_atividade, nome, data_inicio_planejada, data_fim_planejada, peso_percentual_projeto, percentual_executado } = req.body;

    if (typeof percentual_executado !== 'undefined') {
      return res.status(400).json({ erro: 'percentual_executado só pode ser atualizado via RDO aprovado.' });
    }

    const atividadeAnterior = await getQuery('SELECT * FROM atividades_eap WHERE id = ?', [id]);
    if (!atividadeAnterior) {
      return res.status(404).json({ erro: 'Atividade não encontrada.' });
    }

    const novoPaiId = (typeof pai_id !== 'undefined') ? (pai_id || null) : atividadeAnterior.pai_id;
    const ehFilha = !!novoPaiId;

    if (ehFilha) {
      if (Number(novoPaiId) === Number(id)) {
        return res.status(400).json({ erro: 'Uma atividade não pode ser pai dela mesma.' });
      }

      const novoPai = await getQuery(
        'SELECT id, pai_id FROM atividades_eap WHERE id = ? AND projeto_id = ?',
        [novoPaiId, atividadeAnterior.projeto_id]
      );
      if (!novoPai) {
        return res.status(400).json({ erro: 'Atividade pai inválida para este projeto.' });
      }
      if (novoPai.pai_id) {
        return res.status(400).json({ erro: 'Somente atividades pai (raiz) podem receber atividades filhas.' });
      }
    }

    const dataInicioRaw = (typeof data_inicio_planejada !== 'undefined') ? data_inicio_planejada : atividadeAnterior.data_inicio_planejada;
    const dataFimRaw = (typeof data_fim_planejada !== 'undefined') ? data_fim_planejada : atividadeAnterior.data_fim_planejada;
    const dataInicio = parseDateOnly(dataInicioRaw);
    const dataFim = parseDateOnly(dataFimRaw);
    if (ehFilha && (!dataInicio || !dataFim)) {
      return res.status(400).json({ erro: 'Informe data_inicio_planejada e data_fim_planejada válidas (YYYY-MM-DD).' });
    }
    if (dataInicio && dataFim && dataInicio > dataFim) {
      return res.status(400).json({ erro: 'data_fim_planejada deve ser maior ou igual a data_inicio_planejada.' });
    }

    const pesoInformado = (typeof peso_percentual_projeto !== 'undefined')
      ? peso_percentual_projeto
      : ((typeof percentual_previsto !== 'undefined') ? percentual_previsto : atividadeAnterior.peso_percentual_projeto);
    const peso = (ehFilha || typeof pesoInformado !== 'undefined')
      ? ensureFaixaPercentual(pesoInformado)
      : 0;
    if (ehFilha && peso === null) {
      return res.status(400).json({ erro: 'peso_percentual_projeto deve estar entre 0 e 100.' });
    }
    if (!ehFilha && peso === null) {
      return res.status(400).json({ erro: 'peso_percentual_projeto deve estar entre 0 e 100 quando informado.' });
    }

    const filhos = await getQuery('SELECT COUNT(*) AS total FROM atividades_eap WHERE pai_id = ?', [id]);
    const ehFolha = Number(filhos?.total || 0) === 0;
    if (ehFolha) {
      if (ehFilha) {
        const somaIrmaos = await getSomaPesosIrmaos(atividadeAnterior.projeto_id, novoPaiId, id);
        const totalFilhosProjetado = somaIrmaos + Number(peso || 0);
        if (totalFilhosProjetado > 100.0001) {
          return res.status(400).json({ erro: `A soma dos pesos das atividades filhas deste pai não pode ultrapassar 100%. Total projetado: ${totalFilhosProjetado.toFixed(2)}%.` });
        }
      }
    }

    const novaDescricao = (typeof descricao === 'string')
      ? descricao.trim()
      : (atividadeAnterior.descricao || '');

    const novoIdentificador = (id_atividade && String(id_atividade).trim()) || atividadeAnterior.id_atividade || `ATV-${atividadeAnterior.projeto_id}-${codigo_eap || atividadeAnterior.codigo_eap}`;
    const novoNome = (nome && String(nome).trim()) || novaDescricao || atividadeAnterior.descricao;

    await runQuery(`
      UPDATE atividades_eap 
      SET codigo_eap = ?, descricao = ?, percentual_previsto = ?, ordem = ?, unidade_medida = ?, quantidade_total = ?, pai_id = ?, id_atividade = ?, nome = ?, data_inicio_planejada = ?, data_fim_planejada = ?, peso_percentual_projeto = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [codigo_eap, novaDescricao, peso, ordem, unidade_medida || null, quantidade_total || 0, novoPaiId, novoIdentificador, novoNome, dataInicio || null, dataFim || null, peso, id]);

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
          WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
        `, [id]);
        const totalExec = somaQt ? (somaQt.total_executado_qt || 0) : 0;
        novoPerc = Math.min(Math.round(((totalExec / quantidadeTotal) * 10000)) / 100, 100);
      } else {
        const somaPerc = await getQuery(`
          SELECT COALESCE(SUM(ra.percentual_executado),0) as total_exec_perc
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
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

// Recalcular percentual do pai com base nos filhos (contribuição por peso percentual)
const recalcularPercentualPaiLocal = async (atividadeId) => {
  try {
    const paiRow = await getQuery('SELECT pai_id FROM atividades_eap WHERE id = ?', [atividadeId]);
    if (!paiRow || !paiRow.pai_id) return;

    const paiId = paiRow.pai_id;

    // Buscar filhos do pai
    const filhos = await allQuery(`
      SELECT
        id,
        percentual_executado,
        COALESCE(peso_percentual_projeto, percentual_previsto, 0) AS peso_percentual
      FROM atividades_eap
      WHERE pai_id = ?
    `, [paiId]);
    if (!filhos || filhos.length === 0) return;

    let somaContribuicao = 0;
    let somaPeso = 0;
    let somaSimples = 0;
    for (const f of filhos) {
      const perc = parseFloat(f.percentual_executado || 0);
      const peso = parseFloat(f.peso_percentual || 0);
      somaSimples += perc;
      if (peso && peso > 0) {
        somaContribuicao += (perc * peso) / 100;
        somaPeso += peso;
      }
    }

    let novoPerc = 0;
    if (somaPeso > 0) {
      novoPerc = Math.min(Math.round(somaContribuicao * 100) / 100, 100);
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
      WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
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
          WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
        `, [a.id]);
        novoPerc = Math.min(Math.round(((parseFloat(r?.total_executado_qt || 0) / quantidadeTotal) * 10000)) / 100, 100);
      } else {
        const r = await getQuery(`
          SELECT COALESCE(SUM(ra.percentual_executado),0) as total_exec_perc
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
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

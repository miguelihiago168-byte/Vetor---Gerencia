const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

// Gerar número único para RDO (formato: RDO-YYYYMMDD-XXXXXX)
const gerarNumeroRDO = async (projetoId) => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  const data = `${ano}${mes}${dia}`;
  
  // Contar RDOs do dia
  const resultado = await getQuery(
    'SELECT COUNT(*) as contador FROM rdos WHERE projeto_id = ? AND DATE(data_relatorio) = DATE(?)',
    [projetoId, new Date().toISOString().split('T')[0]]
  );
  
  const contador = (resultado?.contador || 0) + 1;
  const sequencia = String(contador).padStart(6, '0');
  
  return `RDO-${data}-${sequencia}`;
};

// Atualizar status da atividade EAP
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

// Recalcula percentual da atividade pai de forma ponderada (recursiva)
const recalcularPercentualPai = async (atividadeId) => {
  try {
    const paiRow = await getQuery('SELECT pai_id FROM atividades_eap WHERE id = ?', [atividadeId]);
    if (!paiRow || !paiRow.pai_id) return;

    const paiId = paiRow.pai_id;

    // Buscar filhos
    const filhos = await allQuery('SELECT id, percentual_executado, quantidade_total FROM atividades_eap WHERE pai_id = ?', [paiId]);
    if (!filhos || filhos.length === 0) return;

    // Calcular média ponderada por quantidade_total se disponível
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

    // Recurse up
    await recalcularPercentualPai(paiId);
  } catch (err) {
    console.warn('Erro ao recalcular percentual do pai:', err);
  }
};

// Listar RDOs de um projeto
router.get('/projeto/:projetoId', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;

    const rdos = await allQuery(`
      SELECT r.*, u.nome as criado_por_nome, g.nome as aprovado_por_nome
      FROM rdos r
      LEFT JOIN usuarios u ON r.criado_por = u.id
      LEFT JOIN usuarios g ON r.aprovado_por = g.id
      WHERE r.projeto_id = ?
      ORDER BY r.data_relatorio DESC
    `, [projetoId]);

    res.json(rdos);
  } catch (error) {
    console.error('Erro ao listar RDOs:', error);
    res.status(500).json({ erro: 'Erro ao listar RDOs.' });
  }
});

// Obter detalhes de um RDO
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const rdo = await getQuery(`
      SELECT r.*, u.nome as criado_por_nome, g.nome as aprovado_por_nome,
             p.nome as projeto_nome, p.empresa_responsavel, p.empresa_executante, p.cidade
      FROM rdos r
      LEFT JOIN usuarios u ON r.criado_por = u.id
      LEFT JOIN usuarios g ON r.aprovado_por = g.id
      LEFT JOIN projetos p ON r.projeto_id = p.id
      WHERE r.id = ?
    `, [id]);

    if (!rdo) {
      return res.status(404).json({ erro: 'RDO não encontrado.' });
    }

    // Buscar atividades executadas
    const atividades = await allQuery(`
      SELECT ra.*, ae.codigo_eap, ae.descricao
      FROM rdo_atividades ra
      INNER JOIN atividades_eap ae ON ra.atividade_eap_id = ae.id
      WHERE ra.rdo_id = ?
    `, [id]);

    // Buscar anexos
    const anexos = await allQuery(`
      SELECT * FROM anexos WHERE rdo_id = ?
    `, [id]);

    // Buscar mão de obra vinculada ao RDO
    const maoObra = await allQuery(`
      SELECT rmo.*, mo.nome as nome_colaborador, mo.funcao as funcao_colaborador
      FROM rdo_mao_obra rmo
      LEFT JOIN mao_obra mo ON rmo.mao_obra_id = mo.id
      WHERE rmo.rdo_id = ?
      ORDER BY rmo.id
    `, [id]);

    // Buscar fotos vinculadas às atividades do RDO
    const fotos = await allQuery(`
      SELECT rf.*, ae.descricao as atividade_descricao
      FROM rdo_fotos rf
      LEFT JOIN rdo_atividades ra ON rf.rdo_atividade_id = ra.id
      LEFT JOIN atividades_eap ae ON ra.atividade_eap_id = ae.id
      WHERE rf.rdo_id = ?
      ORDER BY rf.criado_em DESC
    `, [id]);

    // Buscar comentários
    const comentarios = await allQuery(`
      SELECT rc.*, u.nome as autor_nome
      FROM rdo_comentarios rc
      LEFT JOIN usuarios u ON rc.usuario_id = u.id
      WHERE rc.rdo_id = ?
      ORDER BY rc.criado_em ASC
    `, [id]);

    // Materiais recebidos
    const materiais = await allQuery(`
      SELECT * FROM rdo_materiais WHERE rdo_id = ? ORDER BY criado_em DESC
    `, [id]);

    // Ocorrências
    const ocorrencias = await allQuery(`
      SELECT ro.*, u.nome as autor_nome
      FROM rdo_ocorrencias ro
      LEFT JOIN usuarios u ON ro.criado_por = u.id
      WHERE ro.rdo_id = ?
      ORDER BY ro.criado_em DESC
    `, [id]);

    // Assinaturas
    const assinaturas = await allQuery(`
      SELECT ra.*, u.nome as usuario_nome
      FROM rdo_assinaturas ra
      LEFT JOIN usuarios u ON ra.usuario_id = u.id
      WHERE ra.rdo_id = ?
      ORDER BY ra.assinado_em ASC
    `, [id]);

    // Clima por periodo
    const clima = await allQuery(`
      SELECT * FROM rdo_clima WHERE rdo_id = ? ORDER BY id
    `, [id]);

    rdo.atividades = atividades;
    rdo.anexos = anexos;
    rdo.mao_obra_vinculada = maoObra;
    rdo.fotos = fotos;
    rdo.comentarios = comentarios;
    rdo.materiais = materiais;
    rdo.ocorrencias = ocorrencias;
    rdo.assinaturas = assinaturas;
    rdo.clima = clima;
    // Parse mao_obra_detalhada JSON if presente
    try {
      rdo.mao_obra_detalhada = rdo.mao_obra_detalhada ? JSON.parse(rdo.mao_obra_detalhada) : [];
    } catch (e) {
      rdo.mao_obra_detalhada = [];
    }

    // Buscar colaboradores vinculados à obra (se existir tabela projeto_usuarios)
    try {
      const colaboradores = await allQuery(`
        SELECT u.id, u.nome, pu.funcao, pu.classificacao, pu.entrada_hora as entrada, pu.saida_hora as saida, pu.intervalo_inicio, pu.intervalo_fim
        FROM projeto_usuarios pu
        INNER JOIN usuarios u ON pu.usuario_id = u.id
        WHERE pu.projeto_id = ?
      `, [rdo.projeto_id]);

      rdo.colaboradores = colaboradores;
    } catch (err) {
      rdo.colaboradores = [];
    }

    res.json(rdo);

  } catch (error) {
    console.error('Erro ao obter RDO:', error);
    res.status(500).json({ erro: 'Erro ao obter RDO.' });
  }
});

// Criar RDO
router.post('/', auth, [
  body('projeto_id').isInt(),
  body('data_relatorio').isDate()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
    }

    const {
      projeto_id,
      data_relatorio,
      entrada_saida_inicio,
      entrada_saida_fim,
      intervalo_almoco_inicio,
      intervalo_almoco_fim,
      horas_trabalhadas,
      clima_manha,
      tempo_manha,
      praticabilidade_manha,
      clima_tarde,
      tempo_tarde,
      praticabilidade_tarde,
      mao_obra_direta,
      mao_obra_indireta,
      mao_obra_terceiros,
      equipamentos,
      ocorrencias,
      comentarios,
      atividades
    } = req.body;

    // Verificar se já existe RDO para esta data
    const rdoExistente = await getQuery(
      'SELECT id FROM rdos WHERE projeto_id = ? AND data_relatorio = ?',
      [projeto_id, data_relatorio]
    );

    if (rdoExistente) {
      return res.status(400).json({ erro: 'Já existe um RDO para esta data.' });
    }

    // Gerar número único para RDO
    const numero_rdo = await gerarNumeroRDO(projeto_id);

    // Calcular dia da semana em pt-BR
    const dias = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const dia_semana_calc = (() => {
      try {
        const d = new Date(data_relatorio);
        if (isNaN(d.getTime())) return '';
        return dias[d.getDay()];
      } catch (e) { return ''; }
    })();

    // Calcular horas trabalhadas a partir de horários (HH:MM)
    const toMinutes = (t) => {
      if (!t) return null;
      const m = t.match(/(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1],10) * 60 + parseInt(m[2],10);
    };

    const calcHoras = () => {
      const inicio = toMinutes(entrada_saida_inicio || '07:00');
      const fim = toMinutes(entrada_saida_fim || '17:00');
      const intInicio = toMinutes(intervalo_almoco_inicio || '12:00');
      const intFim = toMinutes(intervalo_almoco_fim || '13:00');
      if (inicio == null || fim == null) return 0;
      let total = Math.max(0, fim - inicio);
      if (intInicio != null && intFim != null && intFim > intInicio) {
        total = Math.max(0, total - (intFim - intInicio));
      }
      return Math.round((total / 60) * 100) / 100; // horas com 2 casas
    };

    const horas_calc = (horas_trabalhadas || calcHoras());

    // Aceitar mao_obra_detalhada (array) se enviado
    const mao_obra_detalhada_json = req.body.mao_obra_detalhada ? JSON.stringify(req.body.mao_obra_detalhada) : null;

    const initialStatus = req.body.status && ['Em preenchimento','Em análise','Aprovado','Reprovado'].includes(req.body.status) ? req.body.status : 'Em preenchimento';

    const historicoInicial = [{ status: initialStatus, por: req.usuario.id, em: new Date().toISOString() }];

    const result = await runQuery(`
      INSERT INTO rdos (
        numero_rdo, projeto_id, data_relatorio, dia_semana, 
        entrada_saida_inicio, entrada_saida_fim, intervalo_almoco_inicio, intervalo_almoco_fim, horas_trabalhadas,
        clima_manha, tempo_manha, praticabilidade_manha,
        clima_tarde, tempo_tarde, praticabilidade_tarde,
        mao_obra_direta, mao_obra_indireta, mao_obra_terceiros,
        mao_obra_detalhada, equipamentos, ocorrencias, comentarios, criado_por, historico_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      numero_rdo, projeto_id, data_relatorio, dia_semana_calc,
      entrada_saida_inicio || '07:00', entrada_saida_fim || '17:00', 
      intervalo_almoco_inicio || '12:00', intervalo_almoco_fim || '13:00', horas_calc,
      clima_manha || 'Claro', tempo_manha || '★', praticabilidade_manha || 'Praticável',
      clima_tarde || 'Claro', tempo_tarde || '★', praticabilidade_tarde || 'Praticável',
      mao_obra_direta || 0, mao_obra_indireta || 0, mao_obra_terceiros || 0,
      mao_obra_detalhada_json,
      equipamentos, ocorrencias, comentarios, req.usuario.id, JSON.stringify(historicoInicial), initialStatus
    ]);

    const rdoId = result.lastID;

    // Inserir atividades executadas
    if (atividades && atividades.length > 0) {
      for (const atividade of atividades) {
        // Se o frontend enviou quantidade_executada, calcular percentual automaticamente
        let percentual = atividade.percentual_executado;
        let quantidadeExec = (atividade.quantidade_executada !== undefined && atividade.quantidade_executada !== null && atividade.quantidade_executada !== '') ? atividade.quantidade_executada : null;

        try {
          const infoAtividade = await getQuery('SELECT quantidade_total, percentual_executado FROM atividades_eap WHERE id = ?', [atividade.atividade_eap_id]);
          const quantidadeTotal = infoAtividade ? (infoAtividade.quantidade_total || 0) : 0;
          if ((quantidadeExec !== null) && quantidadeTotal && (!percentual || percentual === '' || percentual === 0)) {
            const parsedQ = parseFloat(quantidadeExec);
            if (!isNaN(parsedQ) && parsedQ > 0) {
              percentual = Math.min(Math.round((parsedQ / quantidadeTotal) * 10000) / 100, 100);
            }
          }

          // Garantir número
          percentual = percentual !== undefined && percentual !== null && percentual !== '' ? parseFloat(percentual) : 0;
        } catch (err) {
          percentual = percentual !== undefined && percentual !== null && percentual !== '' ? parseFloat(percentual) : 0;
        }

        await runQuery(`
          INSERT INTO rdo_atividades (rdo_id, atividade_eap_id, percentual_executado, quantidade_executada, observacao)
          VALUES (?, ?, ?, ?, ?)
        `, [rdoId, atividade.atividade_eap_id, percentual, quantidadeExec || null, atividade.observacao || null]);

        // Registrar no histórico (mesmo que não aprovado ainda)
        try {
          const atividadeEap = await getQuery('SELECT percentual_executado FROM atividades_eap WHERE id = ?', [atividade.atividade_eap_id]);
          await runQuery(`
            INSERT INTO historico_atividades 
            (atividade_eap_id, rdo_id, percentual_anterior, percentual_executado, percentual_novo, usuario_id, data_execucao)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            atividade.atividade_eap_id,
            rdoId,
            atividadeEap ? atividadeEap.percentual_executado : 0,
            percentual,
            atividadeEap ? atividadeEap.percentual_executado : 0,
            req.usuario.id,
            data_relatorio
          ]);
        } catch (err) {
          // se histórico falhar, continuar
        }
      }
    }

    await registrarAuditoria('rdos', rdoId, 'CREATE', null, req.body, req.usuario.id);

    res.status(201).json({
      mensagem: 'RDO criado com sucesso.',
      rdo: { id: rdoId, data_relatorio }
    });

  } catch (error) {
    console.error('Erro ao criar RDO:', error);
    res.status(500).json({ erro: 'Erro ao criar RDO.' });
  }
});

// Atualizar RDO
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const rdoAtual = await getQuery('SELECT * FROM rdos WHERE id = ?', [id]);

    if (!rdoAtual) {
      return res.status(404).json({ erro: 'RDO não encontrado.' });
    }

    // Apenas criador ou gestor pode editar
    if (rdoAtual.criado_por !== req.usuario.id && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Você não tem permissão para editar este RDO.' });
    }

    // Se RDO aprovado: criar snapshot/version antes de permitir edição (apenas gestor)
    if (rdoAtual.status === 'Aprovado') {
      if (!req.usuario.is_gestor) {
        return res.status(403).json({ erro: 'Apenas gestores podem editar um RDO aprovado.' });
      }

      try {
        // buscar snapshot das atividades e anexos
        const atividadesSnapshot = await allQuery('SELECT * FROM rdo_atividades WHERE rdo_id = ?', [id]);
        const anexosSnapshot = await allQuery('SELECT * FROM anexos WHERE rdo_id = ?', [id]);
        const snapshot = { rdo: rdoAtual, atividades: atividadesSnapshot, anexos: anexosSnapshot };

        // salvar snapshot na tabela rdos_versions (migração deve garantir existência)
        await runQuery('INSERT INTO rdos_versions (rdo_id, snapshot_json, criado_por) VALUES (?, ?, ?)', [id, JSON.stringify(snapshot), req.usuario.id]);

        // marcar RDO como em preenchimento para editar (mantendo histórico da versão anterior)
        await runQuery("UPDATE rdos SET status = 'Em preenchimento', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", [id]);
      } catch (err) {
        console.warn('Falha ao criar versão/backup do RDO aprovado:', err);
      }
    }

    const {
      dia_semana,
      entrada_saida_inicio,
      entrada_saida_fim,
      intervalo_almoco_inicio,
      intervalo_almoco_fim,
      horas_trabalhadas,
      clima_manha,
      tempo_manha,
      praticabilidade_manha,
      clima_tarde,
      tempo_tarde,
      praticabilidade_tarde,
      mao_obra_direta,
      mao_obra_indireta,
      mao_obra_terceiros,
      equipamentos,
      ocorrencias,
      comentarios,
      atividades
    } = req.body;

    await runQuery(`
      UPDATE rdos SET
        dia_semana = ?,
        entrada_saida_inicio = ?, entrada_saida_fim = ?,
        intervalo_almoco_inicio = ?, intervalo_almoco_fim = ?, horas_trabalhadas = ?,
        clima_manha = ?, tempo_manha = ?, praticabilidade_manha = ?,
        clima_tarde = ?, tempo_tarde = ?, praticabilidade_tarde = ?,
        mao_obra_direta = ?, mao_obra_indireta = ?, mao_obra_terceiros = ?, mao_obra_detalhada = ?,
        equipamentos = ?, ocorrencias = ?, comentarios = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      dia_semana,
      entrada_saida_inicio || '07:00', entrada_saida_fim || '17:00',
      intervalo_almoco_inicio || '12:00', intervalo_almoco_fim || '13:00', horas_trabalhadas || 0,
      clima_manha || 'Claro', tempo_manha || '★', praticabilidade_manha || 'Praticável',
      clima_tarde || 'Claro', tempo_tarde || '★', praticabilidade_tarde || 'Praticável',
      mao_obra_direta, mao_obra_indireta, mao_obra_terceiros, JSON.stringify(req.body.mao_obra_detalhada || []),
      equipamentos, ocorrencias, comentarios, id
    ]);

    // Atualizar atividades
    if (atividades) {
      // Remover atividades antigas
      await runQuery('DELETE FROM rdo_atividades WHERE rdo_id = ?', [id]);

      // Inserir novas atividades
      for (const atividade of atividades) {
        await runQuery(`
          INSERT INTO rdo_atividades (rdo_id, atividade_eap_id, percentual_executado, quantidade_executada, observacao)
          VALUES (?, ?, ?, ?, ?)
        `, [id, atividade.atividade_eap_id, atividade.percentual_executado, atividade.quantidade_executada || null, atividade.observacao || null]);
      }
    }

    await registrarAuditoria('rdos', id, 'UPDATE', rdoAtual, req.body, req.usuario.id);

    res.json({ mensagem: 'RDO atualizado com sucesso.' });

  } catch (error) {
    console.error('Erro ao atualizar RDO:', error);
    res.status(500).json({ erro: 'Erro ao atualizar RDO.' });
  }
});

// Alterar status do RDO
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const statusValidos = ['Em preenchimento', 'Em análise', 'Aprovado', 'Reprovado'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    const rdoAtual = await getQuery('SELECT * FROM rdos WHERE id = ?', [id]);

    // Apenas criador pode colocar em análise
    if (status === 'Em análise' && rdoAtual.criado_por !== req.usuario.id) {
      return res.status(403).json({ erro: 'Apenas o criador pode enviar para análise.' });
    }

    // Apenas gestor pode aprovar/reprovar
    if ((status === 'Aprovado' || status === 'Reprovado') && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Apenas gestores podem aprovar ou reprovar RDOs.' });
    }

    // Se RDO já estava aprovado, somente gestor pode revertê-lo
    if (rdoAtual.status === 'Aprovado' && status !== 'Aprovado' && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Apenas gestores podem reverter um RDO aprovado.' });
    }

    const aprovadoPor = (status === 'Aprovado' || status === 'Reprovado') ? req.usuario.id : null;
    const aprovadoEm = (status === 'Aprovado' || status === 'Reprovado') ? new Date().toISOString() : null;

      // Atualizar historico_status: anexar novo registro
      try {
        const rdoRow = await getQuery('SELECT historico_status FROM rdos WHERE id = ?', [id]);
        let hist = [];
        if (rdoRow && rdoRow.historico_status) {
          try { hist = JSON.parse(rdoRow.historico_status); } catch (e) { hist = []; }
        }
        hist.push({ status, por: req.usuario.id, em: new Date().toISOString() });

        await runQuery(`
          UPDATE rdos SET status = ?, aprovado_por = ?, aprovado_em = ?, historico_status = ?, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [status, aprovadoPor, aprovadoEm, JSON.stringify(hist), id]);
      } catch (err) {
        // fallback: apenas atualizar status
        await runQuery(`
          UPDATE rdos SET status = ?, aprovado_por = ?, aprovado_em = ?, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [status, aprovadoPor, aprovadoEm, id]);
      }

    // Se aprovado, atualizar percentuais executados nas atividades EAP
    if (status === 'Aprovado') {
      const atividades = await allQuery(
        'SELECT atividade_eap_id FROM rdo_atividades WHERE rdo_id = ?',
        [id]
      );

      for (const row of atividades) {
        const atividadeId = row.atividade_eap_id;
        try {
          // Buscar quantidade_total da atividade
          const infoAtividade = await getQuery('SELECT quantidade_total FROM atividades_eap WHERE id = ?', [atividadeId]);
          const quantidadeTotal = infoAtividade ? (infoAtividade.quantidade_total || 0) : 0;

          // Somar quantidades executadas em RDOs aprovados
          const resultadoQt = await getQuery(`
            SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada,0)), 0) as total_executado_qt
            FROM rdo_atividades ra
            INNER JOIN rdos r ON ra.rdo_id = r.id
            WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
          `, [atividadeId]);

          let percentualExecutado = 0;
          if (quantidadeTotal && resultadoQt && resultadoQt.total_executado_qt) {
            percentualExecutado = Math.min(Math.round((resultadoQt.total_executado_qt / quantidadeTotal) * 10000) / 100, 100);
          } else {
            // fallback: somar percentuais armazenados
            const resultado = await getQuery(`
              SELECT COALESCE(SUM(ra.percentual_executado), 0) as total_executado
              FROM rdo_atividades ra
              INNER JOIN rdos r ON ra.rdo_id = r.id
              WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
            `, [atividadeId]);
            percentualExecutado = Math.min(resultado.total_executado || 0, 100);
          }

          await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [percentualExecutado, atividadeId]);

          await atualizarStatusAtividade(atividadeId);
          await recalcularPercentualPai(atividadeId);

          // Atualizar histórico para este RDO/atividade
          await runQuery(`
            UPDATE historico_atividades 
            SET percentual_novo = ?
            WHERE rdo_id = ? AND atividade_eap_id = ?
          `, [percentualExecutado, id, atividadeId]);
        } catch (err) {
          console.warn('Falha ao recalcular avanço para atividade', atividadeId, err);
        }
      }
    }

    // Se um RDO aprovado foi revertido, recalcular as atividades desse RDO (exclui efeito deste RDO)
    if (rdoAtual.status === 'Aprovado' && status !== 'Aprovado') {
      const atividades = await allQuery('SELECT atividade_eap_id FROM rdo_atividades WHERE rdo_id = ?', [id]);
      for (const row of atividades) {
        const atividadeId = row.atividade_eap_id;
        try {
          const infoAtividade = await getQuery('SELECT quantidade_total FROM atividades_eap WHERE id = ?', [atividadeId]);
          const quantidadeTotal = infoAtividade ? (infoAtividade.quantidade_total || 0) : 0;

          const resultadoQt = await getQuery(`
            SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada,0)),0) as total_executado_qt
            FROM rdo_atividades ra
            INNER JOIN rdos r ON ra.rdo_id = r.id
            WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
          `, [atividadeId]);

          let percentualExecutado = 0;
          if (quantidadeTotal && resultadoQt && resultadoQt.total_executado_qt) {
            percentualExecutado = Math.min(Math.round((resultadoQt.total_executado_qt / quantidadeTotal) * 10000) / 100, 100);
          } else {
            const resultado = await getQuery(`
              SELECT COALESCE(SUM(ra.percentual_executado), 0) as total_executado
              FROM rdo_atividades ra
              INNER JOIN rdos r ON ra.rdo_id = r.id
              WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
            `, [atividadeId]);
            percentualExecutado = Math.min(resultado.total_executado || 0, 100);
          }

          await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [percentualExecutado, atividadeId]);
          await atualizarStatusAtividade(atividadeId);

          await recalcularPercentualPai(atividadeId);

          // Atualizar historico para os registros correspondentes
          await runQuery(`
            UPDATE historico_atividades 
            SET percentual_novo = ?
            WHERE atividade_eap_id = ?
          `, [percentualExecutado, atividadeId]);
        } catch (err) {
          console.warn('Falha ao recalcular avanço (reversão) para atividade', atividadeId, err);
        }
      }
    }

    await registrarAuditoria('rdos', id, 'STATUS_CHANGE', rdoAtual, { status, aprovado_por: aprovadoPor }, req.usuario.id);

    res.json({ mensagem: `RDO ${status.toLowerCase()} com sucesso.` });

  } catch (error) {
    console.error('Erro ao alterar status do RDO:', error);
    res.status(500).json({ erro: 'Erro ao alterar status do RDO.' });
  }
});

// Deletar RDO
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const rdo = await getQuery('SELECT * FROM rdos WHERE id = ?', [id]);

    if (!rdo) {
      return res.status(404).json({ erro: 'RDO não encontrado.' });
    }

    // Apenas criador ou gestor pode deletar
    if (rdo.criado_por !== req.usuario.id && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Você não tem permissão para deletar este RDO.' });
    }

    // RDO aprovado não pode ser deletado
    if (rdo.status === 'Aprovado') {
      return res.status(400).json({ erro: 'RDO aprovado não pode ser deletado.' });
    }

    await runQuery('DELETE FROM rdos WHERE id = ?', [id]);
    await registrarAuditoria('rdos', id, 'DELETE', rdo, null, req.usuario.id);

    res.json({ mensagem: 'RDO deletado com sucesso.' });

  } catch (error) {
    console.error('Erro ao deletar RDO:', error);
    res.status(500).json({ erro: 'Erro ao deletar RDO.' });
  }
});

module.exports = router;

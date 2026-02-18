const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

// Gerar número sequencial e único no formato RDO-XXX, baseado em TODOS os RDOs existentes
const gerarNumeroRDO = async () => {
  // 1) Buscar todos os IDs já existentes
  const existentes = await allQuery('SELECT numero_rdo FROM rdos WHERE numero_rdo IS NOT NULL', []);

  // 2) Extrair parte numérica, converter para inteiro e encontrar o maior
  let maior = 0;
  if (Array.isArray(existentes)) {
    for (const row of existentes) {
      const idStr = String(row.numero_rdo || '');
      const m = idStr.match(/(\d{1,})$/);
      const n = m ? parseInt(m[1], 10) : NaN;
      if (!isNaN(n) && n > maior) maior = n;
    }
  }

  // 3) Próximo = maior + 1 (ou 1 se não existir nenhum)
  let nextNum = maior > 0 ? (maior + 1) : 1;

  // 4) Garantir unicidade: validar se já existe; se existir, incrementar novamente
  while (true) {
    const candidate = `RDO-${String(nextNum).padStart(3, '0')}`;
    const exists = await getQuery('SELECT id FROM rdos WHERE numero_rdo = ?', [candidate]);
    if (!exists) return candidate;
    nextNum++;
  }
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
      ORDER BY r.criado_em DESC, r.id DESC
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
  body('data_relatorio').optional().isDate(),
  body('dia_semana').optional().isString()
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

    // Data efetiva do RDO baseada na data real de criação do sistema
    // Data do relatório deve respeitar o valor escolhido no formulário.
    // Mantemos uma política de fim de semana apenas como "fallback" caso não venha data.
    const polSat = (process.env.WEEKEND_POLICY_SAT || process.env.WEEKEND_POLICY || 'keep').toLowerCase();
    const polSun = (process.env.WEEKEND_POLICY_SUN || process.env.WEEKEND_POLICY || 'keep').toLowerCase();
    const now = new Date();
    const createdDay = now.getDay(); // 0=Domingo .. 6=Sábado
    const effectiveDateObj = (() => {
      if (createdDay === 6) { // Sábado
        if (polSat === 'shift') {
          const d = new Date(now); d.setDate(d.getDate() + 2); return d; // próxima segunda
        }
        return now;
      }
      if (createdDay === 0) { // Domingo
        if (polSun === 'shift') {
          const d = new Date(now); d.setDate(d.getDate() + 1); return d; // próxima segunda
        }
        return now;
      }
      return now;
    })();
    const effectiveDateStr = `${effectiveDateObj.getFullYear()}-${String(effectiveDateObj.getMonth()+1).padStart(2,'0')}-${String(effectiveDateObj.getDate()).padStart(2,'0')}`;

    const normalizeInputDate = (val) => {
      if (!val) return null;
      const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const dataRelatorioStr = normalizeInputDate(data_relatorio) || effectiveDateStr;

    // Verificar se já existe RDO para a data informada (ou fallback)
    const rdoExistente = await getQuery(
      'SELECT id FROM rdos WHERE projeto_id = ? AND data_relatorio = ?',
      [projeto_id, dataRelatorioStr]
    );

    if (rdoExistente) {
      return res.status(400).json({ erro: 'Já existe um RDO para esta data.' });
    }

    // Gerar número único para RDO
    const numero_rdo = await gerarNumeroRDO();

    // Calcular dia da semana em pt-BR a partir da data escolhida
    const dias = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const dataRelObj = new Date(`${dataRelatorioStr}T00:00:00`);
    const dia_semana_calc = dias[dataRelObj.getDay()];

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

    // Número RDO sequencial e único (RDO-XXX)
    const numeroRdoFinal = numero_rdo;

    const initialStatus = req.body.status && ['Em preenchimento','Em análise','Aprovado','Reprovado'].includes(req.body.status) ? req.body.status : 'Em preenchimento';

    const result = await runQuery(`
      INSERT INTO rdos (
        numero_rdo, projeto_id, data_relatorio, dia_semana,
        entrada_saida_inicio, entrada_saida_fim, intervalo_almoco_inicio, intervalo_almoco_fim, horas_trabalhadas,
        clima_manha, tempo_manha, praticabilidade_manha,
        clima_tarde, tempo_tarde, praticabilidade_tarde,
        mao_obra_direta, mao_obra_indireta, mao_obra_terceiros,
        equipamentos, ocorrencias, comentarios, mao_obra_detalhada, criado_por, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      numeroRdoFinal, projeto_id, dataRelatorioStr, dia_semana_calc,
      entrada_saida_inicio || '07:00', entrada_saida_fim || '17:00',
      intervalo_almoco_inicio || '12:00', intervalo_almoco_fim || '13:00', horas_calc,
      clima_manha || 'Claro', tempo_manha || '★', praticabilidade_manha || 'Praticável',
      clima_tarde || 'Claro', tempo_tarde || '★', praticabilidade_tarde || 'Praticável',
      mao_obra_direta || 0, mao_obra_indireta || 0, mao_obra_terceiros || 0,
      equipamentos, ocorrencias, comentarios, (req.body.mao_obra_detalhada ? JSON.stringify(req.body.mao_obra_detalhada) : null), req.usuario.id, initialStatus
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
      rdo: { id: rdoId, data_relatorio: dataRelatorioStr }
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
        mao_obra_direta = ?, mao_obra_indireta = ?, mao_obra_terceiros = ?,
        equipamentos = ?, ocorrencias = ?, comentarios = ?,
        mao_obra_detalhada = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      dia_semana,
      entrada_saida_inicio || '07:00', entrada_saida_fim || '17:00',
      intervalo_almoco_inicio || '12:00', intervalo_almoco_fim || '13:00', horas_trabalhadas || 0,
      clima_manha || 'Claro', tempo_manha || '★', praticabilidade_manha || 'Praticável',
      clima_tarde || 'Claro', tempo_tarde || '★', praticabilidade_tarde || 'Praticável',
      mao_obra_direta, mao_obra_indireta, mao_obra_terceiros,
      equipamentos, ocorrencias, comentarios,
      (typeof req.body.mao_obra_detalhada !== 'undefined'
        ? (req.body.mao_obra_detalhada ? JSON.stringify(req.body.mao_obra_detalhada) : null)
        : rdoAtual.mao_obra_detalhada // se não veio no payload, preserva o valor atual
      ),
      id
    ]);

    // Atualizar atividades preservando IDs (para manter fotos vinculadas)
    if (atividades) {
      const existentes = await allQuery('SELECT id, atividade_eap_id FROM rdo_atividades WHERE rdo_id = ?', [id]);
      const mapExist = new Map();
      existentes.forEach(row => mapExist.set(row.atividade_eap_id, row.id));

      const enviadosIds = new Set();
      for (const atividade of atividades) {
        enviadosIds.add(atividade.atividade_eap_id);
        const existenteId = mapExist.get(atividade.atividade_eap_id);
        if (existenteId) {
          await runQuery(`
            UPDATE rdo_atividades SET percentual_executado = ?, quantidade_executada = ?, observacao = ? WHERE id = ?
          `, [atividade.percentual_executado, atividade.quantidade_executada || null, atividade.observacao || null, existenteId]);
        } else {
          await runQuery(`
            INSERT INTO rdo_atividades (rdo_id, atividade_eap_id, percentual_executado, quantidade_executada, observacao)
            VALUES (?, ?, ?, ?, ?)
          `, [id, atividade.atividade_eap_id, atividade.percentual_executado, atividade.quantidade_executada || null, atividade.observacao || null]);
        }
      }

      // Remover atividades que não estão mais presentes (pode remover fotos vinculadas por FK)
      const toDelete = existentes.filter(row => !enviadosIds.has(row.atividade_eap_id));
      for (const row of toDelete) {
        await runQuery('DELETE FROM rdo_atividades WHERE id = ?', [row.id]);
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
            WHERE ra.atividade_eap_id = ? AND r.status IN ('Aprovado', 'Em análise', 'Em preenchimento')
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
              WHERE ra.atividade_eap_id = ? AND r.status IN ('Aprovado', 'Em análise', 'Em preenchimento')
            `, [atividadeId]);
            percentualExecutado = Math.min(resultado.total_executado || 0, 100);
          }

          await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [percentualExecutado, atividadeId]);

          await atualizarStatusAtividade(atividadeId);
          // Não recalcular árvore da EAP em avanço de atividade; só quando métricas mudarem

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
            WHERE ra.atividade_eap_id = ? AND r.status IN ('Aprovado', 'Em análise', 'Em preenchimento')
          `, [atividadeId]);

          let percentualExecutado = 0;
          if (quantidadeTotal && resultadoQt && resultadoQt.total_executado_qt) {
            percentualExecutado = Math.min(Math.round((resultadoQt.total_executado_qt / quantidadeTotal) * 10000) / 100, 100);
          } else {
            const resultado = await getQuery(`
              SELECT COALESCE(SUM(ra.percentual_executado), 0) as total_executado
              FROM rdo_atividades ra
              INNER JOIN rdos r ON ra.rdo_id = r.id
              WHERE ra.atividade_eap_id = ? AND r.status IN ('Aprovado', 'Em análise', 'Em preenchimento')
            `, [atividadeId]);
            percentualExecutado = Math.min(resultado.total_executado || 0, 100);
          }

          await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [percentualExecutado, atividadeId]);
          await atualizarStatusAtividade(atividadeId);
          // Não recalcular árvore da EAP aqui (reversão). Recalcular apenas quando métricas mudarem.

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

    // Remover dependências e o RDO, mesmo se aprovado
    await runQuery('DELETE FROM rdo_atividades WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdo_mao_obra WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdo_clima WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdo_ocorrencias WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdo_comentarios WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdo_assinaturas WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdo_fotos WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdos_versions WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdo_materiais WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM anexos WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM historico_atividades WHERE rdo_id = ?', [id]);
    await runQuery('DELETE FROM rdos WHERE id = ?', [id]);
    await registrarAuditoria('rdos', id, 'DELETE', rdo, null, req.usuario.id);

    // Recalcular avanço das atividades impactadas
    try {
      const atividades = await allQuery('SELECT DISTINCT atividade_eap_id FROM rdo_atividades WHERE rdo_id = ?', [id]);
      for (const row of atividades) {
        const atividadeId = row.atividade_eap_id;
        const infoAtividade = await getQuery('SELECT quantidade_total FROM atividades_eap WHERE id = ?', [atividadeId]);
        const quantidadeTotal = infoAtividade ? (infoAtividade.quantidade_total || 0) : 0;
        const resultadoQt = await getQuery(`
          SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada,0)),0) as total_executado_qt
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ?
        `, [atividadeId]);
        let percentualExecutado = 0;
        if (quantidadeTotal && resultadoQt && resultadoQt.total_executado_qt) {
          percentualExecutado = Math.min(Math.round((resultadoQt.total_executado_qt / quantidadeTotal) * 10000) / 100, 100);
        } else {
          const resultado = await getQuery(`
            SELECT COALESCE(SUM(ra.percentual_executado), 0) as total_executado
            FROM rdo_atividades ra
            INNER JOIN rdos r ON ra.rdo_id = r.id
            WHERE ra.atividade_eap_id = ?
          `, [atividadeId]);
          percentualExecutado = Math.min(resultado.total_executado || 0, 100);
        }
        await runQuery('UPDATE atividades_eap SET percentual_executado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [percentualExecutado, atividadeId]);
        await atualizarStatusAtividade(atividadeId);
        // Evitar recálculo da árvore da EAP ao excluir RDO; recalcular somente em alteração de métricas
      }
    } catch (err) {
      console.warn('Falha ao recalcular avanço após deleção do RDO:', err);
    }

    res.json({ mensagem: 'RDO deletado com sucesso.' });

  } catch (error) {
    console.error('Erro ao deletar RDO:', error);
    res.status(500).json({ erro: 'Erro ao deletar RDO.' });
  }
});

// Gerar PDF do RDO
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar RDO com detalhes
    const rdo = await getQuery(`
      SELECT r.*, p.nome AS projeto_nome, u.nome AS criado_por_nome
      FROM rdos r
      JOIN projetos p ON r.projeto_id = p.id
      LEFT JOIN usuarios u ON r.criado_por = u.id
      WHERE r.id = ?
    `, [id]);

    if (!rdo) {
      return res.status(404).json({ erro: 'RDO não encontrado.' });
    }

    // Totais de mão de obra a partir do próprio RDO
    const maoObraTotais = {
      direta: rdo.mao_obra_direta || 0,
      indireta: rdo.mao_obra_indireta || 0,
      terceiros: rdo.mao_obra_terceiros || 0
    };

    // Equipamentos: o campo rdo.equipamentos pode ser JSON; tentar parsear
    let equipamentos = [];
    try {
      equipamentos = rdo.equipamentos && rdo.equipamentos.startsWith('[') ? JSON.parse(rdo.equipamentos) : [];
    } catch {
      equipamentos = [];
    }

    // Buscar atividades EAP
    const atividades = await allQuery(`
      SELECT a.*, e.descricao AS atividade_descricao, e.codigo_eap, e.unidade_medida, e.quantidade_total, e.percentual_executado AS percentual_eap
      FROM rdo_atividades a
      JOIN atividades_eap e ON a.atividade_eap_id = e.id
      WHERE a.rdo_id = ?
      ORDER BY e.codigo_eap
    `, [id]);

    // Gerar PDF com estilo semelhante à UI
    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 32 });
    const uploadsDir = path.join(__dirname, '..', 'uploads');

    // Configurar headers para download
    res.setHeader('Content-Type', 'application/pdf');
    const normalizeNumero = () => {
      const raw = String(rdo.numero_rdo || '');
      const m = raw.match(/(\d{1,})$/);
      const seq = m ? parseInt(m[1], 10) : (rdo.id ? Number(rdo.id) : 1);
      return `RDO-${String(seq).padStart(3, '0')}`;
    };
    const displayId = normalizeNumero();
    res.setHeader('Content-Disposition', `attachment; filename="${displayId}.pdf"`);

    doc.pipe(res);

    // Cabeçalho estilizado (cores e elementos alinhados à UI)
    const logoPath = path.join(uploadsDir, 'logo.png');
    const headerY = 40;
    const headerH = 90;
    doc.save();
    doc.roundedRect(32, headerY, doc.page.width - 64, headerH, 12).fill('#F5F7FB');
    doc.restore();
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 48, headerY + 20, { width: 56 });
    }
    // Nome do sistema
    doc.fontSize(12).fillColor('#334155').text('Gestão de Obras - Vetor', fs.existsSync(logoPath) ? 120 : 48, headerY + 4);
    doc.fontSize(18).fillColor('#0F172A').text(displayId, fs.existsSync(logoPath) ? 120 : 48, headerY + 20);
    const statusLabel = (s) => {
      if (s === 'Em análise') return 'Em aprovação';
      if (s === 'Em preenchimento') return 'Aguardando aprovação';
      return s || 'N/A';
    };
    const statusColor = (s) => {
      if (s === 'Aprovado') return '#2E7D32';
      if (s === 'Em análise') return '#F9A825';
      if (s === 'Em preenchimento') return '#2962FF';
      if (s === 'Reprovado') return '#C62828';
      return '#6B7280';
    };
    doc.fontSize(11).fillColor('#475569').text(`Data: ${new Date(rdo.data_relatorio).toLocaleDateString('pt-BR')}`,
      fs.existsSync(logoPath) ? 120 : 48, headerY + 48);
    // Status chip
    const chipX = doc.page.width - 180;
    const chipY = headerY + 28;
    const chipW = 120;
    const chipH = 24;
    doc.save();
    doc.roundedRect(chipX, chipY, chipW, chipH, 12).fill(statusColor(rdo.status));
    doc.fillColor('#FFFFFF').fontSize(11).text(statusLabel(rdo.status), chipX, chipY + 6, { width: chipW, align: 'center' });
    doc.restore();
    doc.moveDown(2);
    doc.fontSize(12).fillColor('#1F2937').text(`Projeto: ${rdo.projeto_nome}`);
    doc.fillColor('#6B7280').text(`Criado por: ${rdo.criado_por_nome || 'N/A'}`);
    doc.moveDown();

    // Condições climáticas
    if (rdo.condicoes_climaticas) {
      doc.fontSize(12).text('Condições Climáticas:', { underline: true });
      doc.text(rdo.condicoes_climaticas);
      doc.moveDown();
    }

    // Observações
    if (rdo.observacoes) {
      doc.text('Observações:', { underline: true });
      doc.text(rdo.observacoes);
      doc.moveDown();
    }

    // Mão de obra (totais)
    doc.fontSize(13).fillColor('#0F172A').text('Mão de Obra (totais)');
    doc.moveTo(32, doc.y + 2).lineTo(doc.page.width - 32, doc.y + 2).stroke('#E5E7EB');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#1F2937').text(`Direta: ${maoObraTotais.direta} pessoa(s)`);
    doc.fontSize(11).fillColor('#1F2937').text(`Indireta: ${maoObraTotais.indireta} pessoa(s)`);
    doc.fontSize(11).fillColor('#1F2937').text(`Terceiros: ${maoObraTotais.terceiros} pessoa(s)`);
    doc.moveDown();

    // Equipamentos
    if (equipamentos.length > 0) {
      doc.fontSize(13).fillColor('#0F172A').text('Equipamentos');
      doc.moveTo(32, doc.y + 2).lineTo(doc.page.width - 32, doc.y + 2).stroke('#E5E7EB');
      doc.moveDown(0.5);
      equipamentos.forEach(eq => {
        const nome = eq.nome || eq.equipamento || 'Equipamento';
        const qtd = eq.quantidade || 0;
        doc.fontSize(11).fillColor('#1F2937').text(`${nome} — ${qtd} unidade(s)`);
      });
      doc.moveDown();
    }

    // Atividades (tabela com mesma semântica da UI)
    if (atividades.length > 0) {
      // Cabeçalho da seção
      doc.fontSize(13).fillColor('#0F172A').text('Atividades Executadas');
      doc.moveTo(32, doc.y + 2).lineTo(doc.page.width - 32, doc.y + 2).stroke('#E5E7EB');
      doc.moveDown(0.5);

      // Cabeçalho da tabela
      const startX = 32; const col1 = 220; const col2 = 120; const col3 = 90; const col4 = 110; const col5 = 110; const col6 = 90;
      doc.fontSize(10).fillColor('#64748B');
      doc.text('Atividade', startX, doc.y, { width: col1 });
      doc.text('Qtd. Executada', startX + col1, doc.y, { width: col2, align: 'right' });
      doc.text('Unidade', startX + col1 + col2 + 8, doc.y, { width: col3 });
      doc.text('% Exec. (auto)', startX + col1 + col2 + col3 + 16, doc.y, { width: col4, align: 'right' });
      doc.text('% Acumulado', startX + col1 + col2 + col3 + col4 + 24, doc.y, { width: col5, align: 'right' });
      doc.text('Status', startX + col1 + col2 + col3 + col4 + col5 + 32, doc.y, { width: col6 });
      doc.moveDown(0.5);
      doc.moveTo(32, doc.y).lineTo(doc.page.width - 32, doc.y).stroke('#E5E7EB');

      atividades.forEach(at => {
        const unidade = at.unidade_medida || '';
        const qtExec = (at.quantidade_executada != null) ? at.quantidade_executada : 0;
        const total = (at.quantidade_total != null) ? at.quantidade_total : 0;
        const percAuto = (total && qtExec) ? Math.min(Math.round((qtExec / total) * 10000) / 100, 100) : (at.percentual_executado || 0);
        const acum = (at.percentual_eap != null) ? at.percentual_eap : (at.percentual_executado || 0);
        const acumVirt = Math.min(acum + percAuto, 100);
        const status = acumVirt >= 100 ? 'Concluída' : (acumVirt > 0 ? 'Em andamento' : 'Não iniciada');
        doc.fontSize(11).fillColor('#1F2937');
        doc.text(`${at.codigo_eap} — ${at.atividade_descricao}`, startX, doc.y, { width: col1 });
        doc.text(String(qtExec), startX + col1, doc.y, { width: col2, align: 'right' });
        doc.text(unidade, startX + col1 + col2 + 8, doc.y, { width: col3 });
        doc.text(String(percAuto), startX + col1 + col2 + col3 + 16, doc.y, { width: col4, align: 'right' });
        doc.text(String(acum), startX + col1 + col2 + col3 + col4 + 24, doc.y, { width: col5, align: 'right' });
        // status chip
        const chipW = 70; const chipH = 18; const chipX = startX + col1 + col2 + col3 + col4 + col5 + 32; const chipY = doc.y - 2;
        doc.save();
        doc.roundedRect(chipX, chipY, chipW, chipH, 9).fill(statusColor(status === 'Concluída' ? 'Aprovado' : (status === 'Em andamento' ? 'Em análise' : 'Em preenchimento')));
        doc.fillColor('#FFFFFF').fontSize(9).text(status, chipX, chipY + 4, { width: chipW, align: 'center' });
        doc.restore();
        doc.moveDown(0.8);
        // Observação
        if (at.observacao) {
          doc.fontSize(10).fillColor('#6B7280').text(`Observação: ${at.observacao}`, startX, doc.y);
          doc.moveDown(0.3);
        }
        doc.moveTo(32, doc.y).lineTo(doc.page.width - 32, doc.y).stroke('#F1F5F9');
      });
      doc.moveDown();
    }

    // Se houver fotos, adicionar seção específica
    const fotos = await allQuery('SELECT nome_arquivo, caminho_arquivo, descricao FROM rdo_fotos WHERE rdo_id = ? ORDER BY criado_em ASC', [id]);
    if (fotos.length > 0) {
      doc.addPage();
      doc.fontSize(16).fillColor('#0F172A').text('Fotos do Dia');
      doc.moveTo(32, doc.y + 2).lineTo(doc.page.width - 32, doc.y + 2).stroke('#E5E7EB');
      doc.moveDown(0.5);
      fotos.forEach(f => {
        const filePath = path.join(uploadsDir, f.caminho_arquivo);
        if (fs.existsSync(filePath)) {
          doc.image(filePath, { fit: [500, 300], align: 'center' });
          if (f.descricao) doc.fontSize(10).fillColor('#6B7280').text(f.descricao, { align: 'center' });
          else doc.fontSize(10).fillColor('#6B7280').text(f.nome_arquivo, { align: 'center' });
          doc.moveDown();
        }
      });
    }

    // Rodapé
    doc.fontSize(10).fillColor('#6B7280').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ erro: 'Erro ao gerar PDF.' });
  }
});

// Exportar RDOs para Excel
router.get('/projeto/:projetoId/excel', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;

    // Buscar RDOs com detalhes
    const rdos = await allQuery(`
      SELECT r.*, u.nome AS criado_por_nome, p.nome AS projeto_nome
      FROM rdos r
      JOIN projetos p ON r.projeto_id = p.id
      LEFT JOIN usuarios u ON r.criado_por = u.id
      WHERE r.projeto_id = ?
      ORDER BY r.data_relatorio DESC
    `, [projetoId]);

    if (rdos.length === 0) {
      return res.status(404).json({ erro: 'Nenhum RDO encontrado para este projeto.' });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('RDOs');

    // Cabeçalhos
    worksheet.columns = [
      { header: 'Número RDO', key: 'numero_rdo', width: 15 },
      { header: 'Data', key: 'data_relatorio', width: 12 },
      { header: 'Dia da Semana', key: 'dia_semana', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Mão de Obra Direta', key: 'mao_obra_direta', width: 18 },
      { header: 'Mão de Obra Indireta', key: 'mao_obra_indireta', width: 20 },
      { header: 'Mão de Obra Terceiros', key: 'mao_obra_terceiros', width: 20 },
      { header: 'Condições Climáticas', key: 'condicoes_climaticas', width: 25 },
      { header: 'Observações', key: 'observacoes', width: 30 },
      { header: 'Criado por', key: 'criado_por_nome', width: 15 },
      { header: 'Data Criação', key: 'criado_em', width: 15 }
    ];

    // Estilo dos cabeçalhos
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    // Adicionar dados
    rdos.forEach(rdo => {
      worksheet.addRow({
        numero_rdo: rdo.numero_rdo || `RDO-${rdo.id}`,
        data_relatorio: new Date(rdo.data_relatorio).toLocaleDateString('pt-BR'),
        dia_semana: rdo.dia_semana,
        status: rdo.status,
        mao_obra_direta: rdo.mao_obra_direta || 0,
        mao_obra_indireta: rdo.mao_obra_indireta || 0,
        mao_obra_terceiros: rdo.mao_obra_terceiros || 0,
        condicoes_climaticas: rdo.condicoes_climaticas || '',
        observacoes: rdo.observacoes || '',
        criado_por_nome: rdo.criado_por_nome || '',
        criado_em: new Date(rdo.criado_em).toLocaleDateString('pt-BR')
      });
    });

    // Configurar headers para download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="RDOs-${rdos[0].projeto_nome}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Erro ao gerar Excel:', error);
    res.status(500).json({ erro: 'Erro ao gerar Excel.' });
  }
});

// Excluir TODOS os RDOs de um projeto (apenas gestor) e reverter avanço
router.delete('/projeto/:projetoId/todos', [auth, isGestor], async (req, res) => {
  try {
    const { projetoId } = req.params;

    // Coletar IDs dos RDOs do projeto
    const rdosProjeto = await allQuery('SELECT id FROM rdos WHERE projeto_id = ?', [projetoId]);
    const ids = rdosProjeto.map(r => r.id);

    if (ids.length === 0) {
      return res.json({ mensagem: 'Nenhum RDO para excluir neste projeto.', removidos: 0 });
    }

    const idPlaceholders = ids.map(() => '?').join(',');

    // Remover dependências
    await runQuery(`DELETE FROM rdo_atividades WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdo_mao_obra WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdo_clima WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdo_ocorrencias WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdo_comentarios WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdo_assinaturas WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdo_fotos WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdos_versions WHERE rdo_id IN (${idPlaceholders})`, ids);
    await runQuery(`DELETE FROM rdo_materiais WHERE rdo_id IN (${idPlaceholders})`, ids);
    // anexos vinculados aos RDOs
    await runQuery(`DELETE FROM anexos WHERE rdo_id IN (${idPlaceholders})`, ids);
    // histórico vinculado aos RDOs
    await runQuery(`DELETE FROM historico_atividades WHERE rdo_id IN (${idPlaceholders})`, ids);

    // Finalmente remover os RDOs
    await runQuery(`DELETE FROM rdos WHERE id IN (${idPlaceholders})`, ids);

    // Reverter avanço das atividades do projeto
    await runQuery(`
      UPDATE atividades_eap
      SET percentual_executado = 0, status = 'Não iniciada', atualizado_em = CURRENT_TIMESTAMP
      WHERE projeto_id = ?
    `, [projetoId]);

    // Opcional: recalcular pais (todos ficarão 0, mas garantir consistência)
    try {
      const atividades = await allQuery('SELECT id FROM atividades_eap WHERE projeto_id = ?', [projetoId]);
      for (const a of atividades) {
        await atualizarStatusAtividade(a.id);
        await recalcularPercentualPai(a.id);
      }
    } catch (err) {
      console.warn('Falha ao recalcular pais após exclusão total:', err);
    }

    await registrarAuditoria('rdos', null, 'BULK_DELETE', { projeto_id: projetoId }, { removidos: ids.length }, req.usuario.id);

    res.json({ mensagem: 'Todos os RDOs do projeto foram excluídos e o avanço revertido.', removidos: ids.length });
  } catch (error) {
    console.error('Erro ao excluir todos os RDOs do projeto:', error);
    res.status(500).json({ erro: 'Erro ao excluir todos os RDOs do projeto.' });
  }
});

module.exports = router;

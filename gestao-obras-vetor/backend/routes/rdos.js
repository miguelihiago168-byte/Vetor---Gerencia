const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');
const { PERFIS, inferirPerfil } = require('../constants/access');

const router = express.Router();

const getPublicBaseUrl = (req) => {
  const envBase = process.env.PUBLIC_FILE_BASE_URL || process.env.APP_BASE_URL;
  if (envBase) return String(envBase).replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
};

// Auto-migration: adicionar coluna atividades_avulsas se não existir
runQuery("ALTER TABLE rdos ADD COLUMN atividades_avulsas TEXT").catch(e => {
  if (!String(e.message || '').includes('duplicate column')) console.warn('[migrate] atividades_avulsas:', e.message);
});
runQuery('ALTER TABLE rdo_fotos ADD COLUMN ordem INTEGER DEFAULT 0').catch(e => {
  if (!String(e.message || '').includes('duplicate column')) console.warn('[migrate] rdo_fotos.ordem:', e.message);
});
runQuery('ALTER TABLE rdo_materiais ADD COLUMN numero_nf TEXT').catch(e => {
  if (!String(e.message || '').includes('duplicate column')) console.warn('[migrate] rdo_materiais.numero_nf:', e.message);
});

const ensureRdoOptionalColumns = async () => {
  try { await runQuery('ALTER TABLE rdo_fotos ADD COLUMN ordem INTEGER DEFAULT 0'); } catch (_) {}
  try { await runQuery('ALTER TABLE rdo_materiais ADD COLUMN numero_nf TEXT'); } catch (_) {}
};

const getRdoFotosOrderBy = async () => {
  try {
    const cols = await allQuery('PRAGMA table_info(rdo_fotos)');
    const hasOrdem = Array.isArray(cols) && cols.some((c) => String(c?.name) === 'ordem');
    if (hasOrdem) return 'COALESCE(rf.ordem, 0) ASC, rf.criado_em ASC';
  } catch (_) {}
  return 'rf.criado_em ASC';
};

// Gerar número sequencial e único no formato RDO-XXX por tenant/projeto
const gerarNumeroRDO = async (tenantId, projetoId) => {
  // 1) Buscar todos os IDs já existentes
  const existentes = await allQuery(
    'SELECT numero_rdo FROM rdos WHERE numero_rdo IS NOT NULL AND tenant_id = ? AND projeto_id = ?',
    [tenantId, projetoId]
  );

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
    const exists = await getQuery(
      'SELECT id FROM rdos WHERE numero_rdo = ? AND tenant_id = ? AND projeto_id = ?',
      [candidate, tenantId, projetoId]
    );
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

// Recalcula EAP para uma lista de atividadeIds com base apenas em RDOs aprovados.
// Chamado ao salvar (criar/atualizar) e mudar status de RDO para refletir aprovações.
const recalcularEapAtividades = async (atividadeIds) => {
  const ids = [...new Set(atividadeIds.filter(Boolean))];
  for (const atividadeId of ids) {
    try {
      const infoAtividade = await getQuery('SELECT quantidade_total FROM atividades_eap WHERE id = ?', [atividadeId]);
      if (!infoAtividade) continue;
      const quantidadeTotal = Number(infoAtividade.quantidade_total || 0);

      const resultadoQt = await getQuery(`
        SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada, 0)), 0) AS total_executado_qt
        FROM rdo_atividades ra
        INNER JOIN rdos r ON ra.rdo_id = r.id
        WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
      `, [atividadeId]);

      let percentualExecutado = 0;
      if (quantidadeTotal > 0 && resultadoQt && resultadoQt.total_executado_qt) {
        percentualExecutado = Math.min(Math.round((resultadoQt.total_executado_qt / quantidadeTotal) * 10000) / 100, 100);
      } else {
        const resultado = await getQuery(`
          SELECT COALESCE(SUM(ra.percentual_executado), 0) AS total_executado
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
        `, [atividadeId]);
        percentualExecutado = Math.min(resultado?.total_executado || 0, 100);
      }

      let dataConclusaoReal = null;
      if (percentualExecutado >= 100) {
        const ultima = await getQuery(`
          SELECT MAX(r.data_relatorio) AS data_conclusao
          FROM rdo_atividades ra
          INNER JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
        `, [atividadeId]);
        dataConclusaoReal = ultima?.data_conclusao || null;
      }

      await runQuery(
        'UPDATE atividades_eap SET percentual_executado = ?, data_conclusao_real = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [percentualExecutado, dataConclusaoReal, atividadeId]
      );
      await atualizarStatusAtividade(atividadeId);
      await recalcularPercentualPai(atividadeId);
    } catch (err) {
      console.warn('Erro ao recalcular EAP para atividade', atividadeId, err);
    }
  }
};

// Recalcula percentual da atividade pai por contribuição de peso dos filhos (recursiva)
const recalcularPercentualPai = async (atividadeId) => {
  try {
    const paiRow = await getQuery('SELECT pai_id FROM atividades_eap WHERE id = ?', [atividadeId]);
    if (!paiRow || !paiRow.pai_id) return;

    const paiId = paiRow.pai_id;

    // Buscar filhos
    const filhos = await allQuery(`
      SELECT
        id,
        percentual_executado,
        COALESCE(peso_percentual_projeto, percentual_previsto, 0) AS peso_percentual
      FROM atividades_eap
      WHERE pai_id = ?
    `, [paiId]);
    if (!filhos || filhos.length === 0) return;

    // O pai avança pela contribuição de cada filho no intervalo [0..100].
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
    await ensureRdoOptionalColumns();
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
      SELECT ra.*, ae.codigo_eap, COALESCE(ae.nome, ae.descricao) AS descricao
      FROM rdo_atividades ra
      INNER JOIN atividades_eap ae ON ra.atividade_eap_id = ae.id
      WHERE ra.rdo_id = ?
    `, [id]);

    // Buscar anexos
    const anexos = await allQuery(`
      SELECT *
      FROM anexos
      WHERE rdo_id = ?
        AND (
          LOWER(COALESCE(tipo, '')) LIKE '%pdf%'
          OR LOWER(COALESCE(nome_arquivo, '')) LIKE '%.pdf'
        )
      ORDER BY criado_em DESC
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
    const fotosOrderBy = await getRdoFotosOrderBy();
    const fotos = await allQuery(`
      SELECT rf.*, ra.atividade_eap_id AS atividade_eap_id,
             ae.codigo_eap AS atividade_codigo,
             COALESCE(ae.nome, ae.descricao) AS atividade_descricao,
             rf.atividade_avulsa_descricao
      FROM rdo_fotos rf
      LEFT JOIN rdo_atividades ra ON rf.rdo_atividade_id = ra.id
      LEFT JOIN atividades_eap ae ON ra.atividade_eap_id = ae.id
      WHERE rf.rdo_id = ?
      ORDER BY ${fotosOrderBy}
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

    // Equipamentos da nova tabela rdo_equipamentos
    try {
      const equipamentosTabela = await allQuery(
        'SELECT * FROM rdo_equipamentos WHERE rdo_id = ? ORDER BY id',
        [id]
      );
      rdo.equipamentos_lista = equipamentosTabela || [];
    } catch (e) {
      rdo.equipamentos_lista = [];
    }

    // Parse mao_obra_detalhada JSON if presente
    try {
      rdo.mao_obra_detalhada = rdo.mao_obra_detalhada ? JSON.parse(rdo.mao_obra_detalhada) : [];
    } catch (e) {
      rdo.mao_obra_detalhada = [];
    }

    // Parse atividades_avulsas JSON
    try {
      rdo.atividades_avulsas = rdo.atividades_avulsas ? JSON.parse(rdo.atividades_avulsas) : [];
    } catch (e) {
      rdo.atividades_avulsas = [];
    }

    // Buscar colaboradores vinculados à obra (se existir tabela projeto_usuarios)
    try {
      const colaboradores = await allQuery(`
        SELECT u.id, u.nome, pu.criado_em
        FROM projeto_usuarios pu
        INNER JOIN usuarios u ON pu.usuario_id = u.id
        WHERE pu.projeto_id = ?
      `, [rdo.projeto_id]);

      rdo.colaboradores = colaboradores;
    } catch (err) {
      rdo.colaboradores = [];
    }

    res.json(rdo);

    // Registrar log de visualização (com deduplicação em janela curta)
    try {
      const viewRecente = await getQuery(
        `SELECT id
         FROM rdo_logs
         WHERE rdo_id = ?
           AND usuario_id = ?
           AND acao = 'VIEW'
           AND criado_em >= datetime('now', '-10 seconds')
         ORDER BY id DESC
         LIMIT 1`,
        [id, req.usuario.id]
      );

      if (!viewRecente) {
        await runQuery(
          'INSERT INTO rdo_logs (rdo_id, usuario_id, acao, criado_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [id, req.usuario.id, 'VIEW']
        );
      }
    } catch (logError) {
      console.error('Erro ao registrar log de visualização:', logError);
    }

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

    if (!req.tenantId) {
      return res.status(403).json({ erro: 'Tenant inválido para operação de RDO.' });
    }

    const projetoTenant = await getQuery('SELECT tenant_id FROM projetos WHERE id = ?', [projeto_id]);
    if (!projetoTenant || Number(projetoTenant.tenant_id) !== Number(req.tenantId)) {
      return res.status(403).json({ erro: 'Projeto fora do tenant ativo.' });
    }

    // Integridade: projeto precisa ter EAP e criação deve trazer ao menos uma atividade
    const eapCountRow = await getQuery('SELECT COUNT(*) AS c FROM atividades_eap WHERE projeto_id = ? AND tenant_id = ?', [projeto_id, req.tenantId]);
    if (!eapCountRow || eapCountRow.c === 0) {
      return res.status(400).json({ erro: 'Projeto sem EAP: crie a EAP antes do RDO.' });
    }
    const atividadesEapBody = Array.isArray(atividades) ? atividades : [];
    const atividades_avulsas = Array.isArray(req.body.atividades_avulsas) ? req.body.atividades_avulsas : [];
    if (atividadesEapBody.length === 0 && atividades_avulsas.length === 0) {
      return res.status(400).json({ erro: 'RDO deve conter ao menos uma atividade (EAP ou avulsa).' });
    }

    for (const avulsa of atividades_avulsas) {
      const descricao = String(avulsa?.descricao || '').trim();
      if (!descricao) {
        return res.status(400).json({ erro: 'Atividade avulsa sem descrição.' });
      }
      const qtdPrevista = (avulsa?.quantidade_prevista !== undefined && avulsa?.quantidade_prevista !== null && avulsa?.quantidade_prevista !== '')
        ? Number(avulsa.quantidade_prevista)
        : null;
      const qtdExecutada = (avulsa?.quantidade_executada !== undefined && avulsa?.quantidade_executada !== null && avulsa?.quantidade_executada !== '')
        ? Number(avulsa.quantidade_executada)
        : null;

      if (qtdPrevista === null || !Number.isFinite(qtdPrevista) || qtdPrevista <= 0) {
        return res.status(400).json({ erro: `Atividade avulsa ${descricao}: quantidade prevista deve ser maior que zero.` });
      }
      if (qtdExecutada === null || !Number.isFinite(qtdExecutada) || qtdExecutada < 0) {
        return res.status(400).json({ erro: `Atividade avulsa ${descricao}: quantidade executada inválida.` });
      }
      if (qtdExecutada > qtdPrevista) {
        return res.status(400).json({ erro: `Atividade avulsa ${descricao}: executado não pode ser maior que previsto.` });
      }
    }

    // Validar que todas as atividades pertencem ao mesmo projeto
    for (const atividade of atividadesEapBody) {
      const rowProj = await getQuery('SELECT projeto_id, tenant_id, quantidade_total FROM atividades_eap WHERE id = ?', [atividade.atividade_eap_id]);
      if (!rowProj) {
        return res.status(400).json({ erro: 'Atividade EAP inexistente no banco.' });
      }
      if (rowProj.projeto_id !== projeto_id) {
        return res.status(400).json({ erro: 'Atividade EAP pertence a outro projeto.' });
      }
      if (Number(rowProj.tenant_id || 0) !== Number(req.tenantId)) {
        return res.status(400).json({ erro: 'Atividade EAP pertence a outro tenant.' });
      }
      const quantidadeExec = (atividade.quantidade_executada !== undefined && atividade.quantidade_executada !== null && atividade.quantidade_executada !== '')
        ? Number(atividade.quantidade_executada)
        : null;
      if (quantidadeExec !== null) {
        if (!Number.isFinite(quantidadeExec) || quantidadeExec < 0) {
          return res.status(400).json({ erro: 'Quantidade executada inválida na atividade lançada.' });
        }
        const quantidadeTotal = Number(rowProj.quantidade_total || 0);
        if (quantidadeTotal > 0 && quantidadeExec > quantidadeTotal) {
          return res.status(400).json({ erro: `Quantidade executada não pode ultrapassar o previsto da atividade (máx: ${quantidadeTotal}).` });
        }
      }
    }

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
      'SELECT id FROM rdos WHERE tenant_id = ? AND projeto_id = ? AND data_relatorio = ?',
      [req.tenantId, projeto_id, dataRelatorioStr]
    );

    if (rdoExistente) {
      return res.status(400).json({ erro: 'Já existe um RDO para esta data.' });
    }

    // Gerar número único para RDO
    const numero_rdo = await gerarNumeroRDO(req.tenantId, projeto_id);

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
        tenant_id, numero_rdo, projeto_id, data_relatorio, dia_semana,
        entrada_saida_inicio, entrada_saida_fim, intervalo_almoco_inicio, intervalo_almoco_fim, horas_trabalhadas,
        clima_manha, tempo_manha, praticabilidade_manha,
        clima_tarde, tempo_tarde, praticabilidade_tarde,
        mao_obra_direta, mao_obra_indireta, mao_obra_terceiros,
        equipamentos, ocorrencias, comentarios, mao_obra_detalhada, atividades_avulsas, criado_por, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.tenantId, numeroRdoFinal, projeto_id, dataRelatorioStr, dia_semana_calc,
      entrada_saida_inicio || '07:00', entrada_saida_fim || '17:00',
      intervalo_almoco_inicio || '12:00', intervalo_almoco_fim || '13:00', horas_calc,
      clima_manha || 'Claro', tempo_manha || '★', praticabilidade_manha || 'Praticável',
      clima_tarde || 'Claro', tempo_tarde || '★', praticabilidade_tarde || 'Praticável',
      mao_obra_direta || 0, mao_obra_indireta || 0, mao_obra_terceiros || 0,
      equipamentos, ocorrencias, comentarios, (req.body.mao_obra_detalhada ? JSON.stringify(req.body.mao_obra_detalhada) : null), (atividades_avulsas.length > 0 ? JSON.stringify(atividades_avulsas) : null), req.usuario.id, initialStatus
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

    // Recalcular avanço EAP imediatamente após criar o RDO
    if (atividades && atividades.length > 0) {
      try {
        await recalcularEapAtividades(atividades.map(a => a.atividade_eap_id));
      } catch (err) {
        console.warn('Erro ao recalcular EAP após criar RDO:', err);
      }
    }

    // Notificar gestores do projeto sobre novo RDO
    try {
      const criadorNome = req.usuario.nome || `Usuário #${req.usuario.id}`;
      const gestoresProjeto = await allQuery(
        `SELECT u.id FROM usuarios u
         JOIN projeto_usuarios pu ON pu.usuario_id = u.id
         WHERE pu.projeto_id = ?
           AND u.id != ?
           AND u.ativo = 1
           AND (u.perfil IN ('Gestor Geral', 'Gestor da Obra') OR u.is_gestor = 1)`,
        [projeto_id, req.usuario.id]
      );
      for (const g of gestoresProjeto) {
        await runQuery(
          `INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id)
           VALUES (?, ?, ?, ?, ?)`,
          [g.id, 'rdo_criado', `Novo RDO criado por ${criadorNome}: ${numeroRdoFinal}`, 'rdo', rdoId]
        );
      }
    } catch (e) {
      console.warn('Falha ao notificar gestores sobre novo RDO:', e?.message || e);
    }

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

    // Se RDO aprovado: não permitir edição via PUT. É necessário reverter status via PATCH (gestor).
    if (rdoAtual.status === 'Aprovado') {
      return res.status(403).json({ erro: 'RDO aprovado. Solicite ao gestor para voltar à edição.' });
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

    if (Array.isArray(atividades)) {
      for (const atividade of atividades) {
        const atividadeDb = await getQuery('SELECT projeto_id, quantidade_total FROM atividades_eap WHERE id = ?', [atividade.atividade_eap_id]);
        if (!atividadeDb) {
          return res.status(400).json({ erro: 'Atividade EAP inexistente no banco.' });
        }
        if (Number(atividadeDb.projeto_id) !== Number(rdoAtual.projeto_id)) {
          return res.status(400).json({ erro: 'Atividade EAP pertence a outro projeto.' });
        }
        const quantidadeExec = (atividade.quantidade_executada !== undefined && atividade.quantidade_executada !== null && atividade.quantidade_executada !== '')
          ? Number(atividade.quantidade_executada)
          : null;
        if (quantidadeExec !== null) {
          if (!Number.isFinite(quantidadeExec) || quantidadeExec < 0) {
            return res.status(400).json({ erro: 'Quantidade executada inválida na atividade lançada.' });
          }
          const quantidadeTotal = Number(atividadeDb.quantidade_total || 0);
          if (quantidadeTotal > 0 && quantidadeExec > quantidadeTotal) {
            return res.status(400).json({ erro: `Quantidade executada não pode ultrapassar o previsto da atividade (máx: ${quantidadeTotal}).` });
          }
        }
      }
    }

    const atividadesAvulsasBody = Array.isArray(req.body.atividades_avulsas) ? req.body.atividades_avulsas : [];
    for (const avulsa of atividadesAvulsasBody) {
      const descricao = String(avulsa?.descricao || '').trim();
      if (!descricao) {
        return res.status(400).json({ erro: 'Atividade avulsa sem descrição.' });
      }
      const qtdPrevista = (avulsa?.quantidade_prevista !== undefined && avulsa?.quantidade_prevista !== null && avulsa?.quantidade_prevista !== '')
        ? Number(avulsa.quantidade_prevista)
        : null;
      const qtdExecutada = (avulsa?.quantidade_executada !== undefined && avulsa?.quantidade_executada !== null && avulsa?.quantidade_executada !== '')
        ? Number(avulsa.quantidade_executada)
        : null;

      if (qtdPrevista === null || !Number.isFinite(qtdPrevista) || qtdPrevista <= 0) {
        return res.status(400).json({ erro: `Atividade avulsa ${descricao}: quantidade prevista deve ser maior que zero.` });
      }
      if (qtdExecutada === null || !Number.isFinite(qtdExecutada) || qtdExecutada < 0) {
        return res.status(400).json({ erro: `Atividade avulsa ${descricao}: quantidade executada inválida.` });
      }
      if (qtdExecutada > qtdPrevista) {
        return res.status(400).json({ erro: `Atividade avulsa ${descricao}: executado não pode ser maior que previsto.` });
      }
    }

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
        atividades_avulsas = ?,
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
      (typeof req.body.atividades_avulsas !== 'undefined'
        ? (Array.isArray(req.body.atividades_avulsas) && req.body.atividades_avulsas.length > 0 ? JSON.stringify(req.body.atividades_avulsas) : null)
        : rdoAtual.atividades_avulsas
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

    // Registrar log de atualização
    try {
      await runQuery(
        'INSERT INTO rdo_logs (rdo_id, usuario_id, acao, criado_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [id, req.usuario.id, 'UPDATE']
      );
    } catch (logError) {
      console.error('Erro ao registrar log de atualização:', logError);
    }

    // Recalcular avanço EAP imediatamente após salvar o RDO
    if (atividades) {
      try {
        const todasAtividades = await allQuery('SELECT DISTINCT atividade_eap_id FROM rdo_atividades WHERE rdo_id = ?', [id]);
        await recalcularEapAtividades(todasAtividades.map(r => r.atividade_eap_id));
      } catch (err) {
        console.warn('Erro ao recalcular EAP após atualizar RDO:', err);
      }
    }

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

    // Verificar permissões por ação
    const perfilAtual = inferirPerfil(req.usuario);
    const podeAprovar = [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA].includes(perfilAtual);
    const podeReprovar = [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.FISCAL].includes(perfilAtual);
    const podeReverter = podeAprovar; // apenas gestores

    if (status === 'Aprovado' && !podeAprovar) {
      return res.status(403).json({ erro: 'Apenas Gestores Geral ou de Obra podem aprovar RDOs.' });
    }
    if (status === 'Reprovado' && !podeReprovar) {
      return res.status(403).json({ erro: 'Apenas Gestores ou Fiscal podem reprovar RDOs.' });
    }
    // Se RDO já estava aprovado, somente gestores podem revertê-lo
    if (rdoAtual.status === 'Aprovado' && status !== 'Aprovado' && !podeReverter) {
      return res.status(403).json({ erro: 'Apenas gestores podem reverter um RDO aprovado.' });
    }

    // Integridade: não permitir mudar status sem atividades vinculadas
    if (status !== 'Em preenchimento') {
      const cnt = await getQuery('SELECT COUNT(*) AS c FROM rdo_atividades WHERE rdo_id = ?', [id]);
      if (!cnt || cnt.c === 0) {
        return res.status(400).json({ erro: 'RDO sem atividades: não é permitido alterar status.' });
      }
    }

    if (status === 'Aprovado') {
      const atividadesNoRdo = await allQuery(
        'SELECT atividade_eap_id, COALESCE(quantidade_executada, 0) AS quantidade_executada FROM rdo_atividades WHERE rdo_id = ?',
        [id]
      );

      for (const atividade of atividadesNoRdo) {
        const atividadeEap = await getQuery('SELECT codigo_eap, descricao, quantidade_total FROM atividades_eap WHERE id = ?', [atividade.atividade_eap_id]);
        if (!atividadeEap) continue;

        const quantidadeTotal = Number(atividadeEap.quantidade_total || 0);
        const quantidadeNoRdo = Number(atividade.quantidade_executada || 0);
        if (!(quantidadeTotal > 0)) continue;

        const somaAprovadaOutros = await getQuery(`
          SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada, 0)), 0) AS total
          FROM rdo_atividades ra
          INNER JOIN rdos r ON r.id = ra.rdo_id
          WHERE ra.atividade_eap_id = ?
            AND r.status = 'Aprovado'
            AND r.id <> ?
        `, [atividade.atividade_eap_id, id]);

        const totalComAprovacao = Number(somaAprovadaOutros?.total || 0) + quantidadeNoRdo;
        if (totalComAprovacao > quantidadeTotal) {
          return res.status(400).json({
            erro: `Atividade ${atividadeEap.codigo_eap || atividade.atividade_eap_id} - ${atividadeEap.descricao || ''}: quantidade aprovada (${totalComAprovacao}) ultrapassa o previsto (${quantidadeTotal}).`
          });
        }
      }
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
        hist.push({ status, por: req.usuario.id, nome: req.usuario.nome || null, em: new Date().toISOString() });

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

    // Recalcular EAP sempre que o status mudar (aprovado, reprovado ou reversão)
    try {
      const atividadesDoRdo = await allQuery('SELECT DISTINCT atividade_eap_id FROM rdo_atividades WHERE rdo_id = ?', [id]);
      await recalcularEapAtividades(atividadesDoRdo.map(r => r.atividade_eap_id));
    } catch (err) {
      console.warn('Erro ao recalcular EAP após mudança de status:', err);
    }

    // Notificar criador em caso de reprovação (sem ressalvas)
    if (status === 'Reprovado') {
      try {
        const criadorId = rdoAtual.criado_por;
        if (criadorId) {
          await runQuery(
            'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
            [criadorId, 'rdo_reprovado', `Seu RDO #${id} foi reprovado.`, 'rdo', id]
          );
        }
      } catch (e) {
        console.warn('Falha ao notificar reprovação de RDO:', e?.message || e);
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
  // Exclusão desativada por política do sistema
  return res.status(403).json({ erro: 'Exclusão de RDO desativada.' });
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

// Gerar PDF do RDO (puppeteer — HTML → PDF com layout rico)
router.get('/:id/pdf', auth, async (req, res) => {
  const puppeteer = require('puppeteer');
  const path = require('path');
  const fs = require('fs');
  const uploadsDir = path.join(__dirname, '..', 'uploads');

  let browser;
  try {
    await ensureRdoOptionalColumns();
    const { id } = req.params;

    // ── Buscar dados do RDO ──────────────────────────────────────────────
    const rdo = await getQuery(`
      SELECT r.*,
             p.nome AS projeto_nome,
             p.cidade AS projeto_cidade,
             p.empresa_responsavel AS projeto_contratante,
             p.empresa_executante AS projeto_executante,
             p.prazo_termino AS projeto_prazo_termino,
             p.criado_em AS projeto_criado_em,
             u.nome AS criado_por_nome
      FROM rdos r
      JOIN projetos p ON r.projeto_id = p.id
      LEFT JOIN usuarios u ON r.criado_por = u.id
      WHERE r.id = ?
    `, [id]);

    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado.' });

    // Responsável: gestor local da obra primeiro, depois gestor geral do sistema
    let responsavelNome = rdo.criado_por_nome || '—';
    try {
      const gestorLocal = await getQuery(`
        SELECT u.nome FROM usuarios u
        JOIN projeto_usuarios pu ON u.id = pu.usuario_id
        WHERE pu.projeto_id = ? AND u.perfil = 'Gestor da Obra' AND u.ativo = 1
        ORDER BY u.id LIMIT 1
      `, [rdo.projeto_id]);
      if (gestorLocal?.nome) {
        responsavelNome = gestorLocal.nome;
      } else {
        const gestorGeral = await getQuery(`
          SELECT u.nome FROM usuarios u
          WHERE u.perfil = 'Gestor Geral' AND u.ativo = 1
          ORDER BY u.id LIMIT 1
        `, []);
        if (gestorGeral?.nome) responsavelNome = gestorGeral.nome;
      }
    } catch {}

    const atividades = await allQuery(`
      SELECT ra.*, COALESCE(ae.nome, ae.descricao) AS atividade_descricao, ae.codigo_eap,
             ae.unidade_medida, ae.quantidade_total, ae.percentual_executado AS percentual_eap
      FROM rdo_atividades ra
      JOIN atividades_eap ae ON ra.atividade_eap_id = ae.id
      WHERE ra.rdo_id = ? ORDER BY ae.codigo_eap
    `, [id]);

    let atividadesAvulsas = [];
    try {
      atividadesAvulsas = rdo.atividades_avulsas ? JSON.parse(rdo.atividades_avulsas) : [];
      if (!Array.isArray(atividadesAvulsas)) atividadesAvulsas = [];
    } catch {
      atividadesAvulsas = [];
    }

    const maoObraLista = await allQuery(`
      SELECT rmo.*, mo.nome AS nome_colaborador, mo.funcao AS funcao_colaborador
      FROM rdo_mao_obra rmo
      LEFT JOIN mao_obra mo ON rmo.mao_obra_id = mo.id
      WHERE rmo.rdo_id = ? ORDER BY rmo.id
    `, [id]);

    // mao_obra_detalhada JSON
    let maoObraDetalhada = [];
    try { maoObraDetalhada = rdo.mao_obra_detalhada ? JSON.parse(rdo.mao_obra_detalhada) : []; } catch {}

    const maoObraFinal = maoObraDetalhada.length > 0 ? maoObraDetalhada : maoObraLista.map(m => ({
      nome: m.nome_colaborador || m.nome || '—',
      funcao: m.funcao_colaborador || m.funcao || '—',
      tipo: 'Direta',
      entrada: m.horario_entrada || '—',
      saida_almoco: m.horario_saida_almoco || '—',
      retorno_almoco: m.horario_retorno_almoco || '—',
      saida_final: m.horario_saida_final || '—'
    }));

    const fotosOrderBy = await getRdoFotosOrderBy();
    const fotos = await allQuery(`
      SELECT rf.*, ra.atividade_eap_id AS atividade_eap_id,
             ae.codigo_eap AS atividade_codigo,
             COALESCE(ae.nome, ae.descricao) AS atividade_descricao,
             rf.atividade_avulsa_descricao
      FROM rdo_fotos rf
      LEFT JOIN rdo_atividades ra ON rf.rdo_atividade_id = ra.id
      LEFT JOIN atividades_eap ae ON ra.atividade_eap_id = ae.id
      WHERE rf.rdo_id = ? ORDER BY ${fotosOrderBy}
    `, [id]);

    const ocorrencias = await allQuery(
      'SELECT * FROM rdo_ocorrencias WHERE rdo_id = ? ORDER BY criado_em ASC', [id]
    );
    const comentarios = await allQuery(`
      SELECT rc.*, u.nome as autor_nome
      FROM rdo_comentarios rc
      LEFT JOIN usuarios u ON rc.usuario_id = u.id
      WHERE rc.rdo_id = ?
      ORDER BY rc.criado_em ASC
    `, [id]);
    const materiais = await allQuery(
      'SELECT * FROM rdo_materiais WHERE rdo_id = ? ORDER BY criado_em ASC', [id]
    );
    const clima = await allQuery(
      'SELECT * FROM rdo_clima WHERE rdo_id = ? ORDER BY id', [id]
    );
    const anexos = await allQuery(
      `SELECT * FROM anexos WHERE rdo_id = ?
       AND tipo NOT LIKE 'image%'
       ORDER BY criado_em ASC`, [id]
    );
    const publicBaseUrl = getPublicBaseUrl(req);

    let equipamentosLista = [];
    try {
      equipamentosLista = await allQuery(
        'SELECT * FROM rdo_equipamentos WHERE rdo_id = ? ORDER BY id', [id]
      );
    } catch {
      try {
        equipamentosLista = rdo.equipamentos ? JSON.parse(rdo.equipamentos) : [];
      } catch { equipamentosLista = []; }
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    const displayId = (() => {
      const raw = String(rdo.numero_rdo || '');
      const m = raw.match(/(\d+)$/);
      const seq = m ? parseInt(m[1], 10) : (rdo.id || 1);
      return `RDO-${String(seq).padStart(3, '0')}`;
    })();

    const fmtDate = (d) => {
      if (!d) return '—';
      const dt = new Date(String(d).includes('T') ? d : d + 'T00:00:00');
      return dt.toLocaleDateString('pt-BR');
    };

    const msDia = 86400000;
    // Datas normalizadas para 00:00:00 local (contagem por dia-calendário)
    const toMdn = (val) => { const str = String(val).trim(); const norm = /^\d{4}-\d{2}-\d{2}$/.test(str) ? str + 'T00:00:00' : str.replace(' ', 'T'); const d = new Date(norm); d.setHours(0, 0, 0, 0); return d; };
    const criadoEm = rdo.projeto_criado_em ? toMdn(rdo.projeto_criado_em) : null;
    const termino  = rdo.projeto_prazo_termino ? toMdn(rdo.projeto_prazo_termino) : null;
    const dataRel  = rdo.data_relatorio ? new Date(rdo.data_relatorio + 'T00:00:00') : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
    const prazoTotal   = (criadoEm && termino) ? Math.max(0, Math.round((termino - criadoEm) / msDia)) : null;
    const diasDecorridos = (criadoEm) ? Math.max(0, Math.round((dataRel - criadoEm) / msDia)) : null;
    const diasRestantes  = (prazoTotal != null && diasDecorridos != null) ? (prazoTotal - diasDecorridos) : null;

    const gravBadge = (g) => {
      const map = { baixa: '#10b981', média: '#f59e0b', alta: '#f97316', crítica: '#ef4444' };
      return map[(g || '').toLowerCase()] || '#6b7280';
    };

    const statusBadge = (s) => {
      const map = { 'Aprovado': '#10b981', 'Em análise': '#f59e0b', 'Em preenchimento': '#0ea5e9', 'Reprovado': '#ef4444' };
      return map[s] || '#6b7280';
    };

    const calcHorasColab = (c) => {
      const tm = (t) => { if (!t || t === '—') return null; const m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? parseInt(m[1])*60+parseInt(m[2]) : null; };
      const i = tm(c.entrada), f = tm(c.saida_final), a1 = tm(c.saida_almoco), a2 = tm(c.retorno_almoco);
      if (i == null || f == null) return '—';
      let tot = Math.max(0, f - i);
      if (a1 != null && a2 != null && a2 > a1) tot = Math.max(0, tot - (a2 - a1));
      return (Math.round((tot / 60) * 100) / 100) + ' h';
    };

    // URL pública das fotos (Puppeteer acessa o próprio servidor)
    const fotoUrl = (filename) =>
      `http://127.0.0.1:${process.env.PORT || 3001}/uploads/${encodeURIComponent(filename)}`;

    // ── HTML template ─────────────────────────────────────────────────────
    const rows = (items, fn) => items.map(fn).join('');

    const atividadesPdf = [
      ...atividades.map((atividade) => ({
        tipo: 'eap',
        codigo_eap: atividade.codigo_eap,
        descricao: atividade.atividade_descricao,
        observacao: atividade.observacao,
        unidade_medida: atividade.unidade_medida,
        quantidade_prevista: Number(atividade.quantidade_total || 0),
        quantidade_executada: Number(atividade.quantidade_executada || 0),
        percentual_item: (() => {
          const total = Number(atividade.quantidade_total || 0);
          const executado = Number(atividade.quantidade_executada || 0);
          return (total && executado)
            ? Math.min(Math.round((executado / total) * 10000) / 100, 100)
            : Number(atividade.percentual_executado || 0);
        })(),
        percentual_acumulado: Number(atividade.percentual_eap || 0)
      })),
      ...atividadesAvulsas.map((atividadeAvulsa) => {
        const previsto = Number(atividadeAvulsa.quantidade_prevista || 0);
        const executado = Number(atividadeAvulsa.quantidade_executada || 0);
        const percentual = previsto > 0
          ? Math.min(Math.round((executado / previsto) * 10000) / 100, 100)
          : 0;
        return {
          tipo: 'avulsa',
          codigo_eap: null,
          descricao: atividadeAvulsa.descricao || 'Atividade avulsa',
          observacao: atividadeAvulsa.observacao,
          unidade_medida: atividadeAvulsa.unidade_medida || '—',
          quantidade_prevista: previsto,
          quantidade_executada: executado,
          percentual_item: percentual,
          percentual_acumulado: percentual
        };
      })
    ];

    const formatNumber = (value) => {
      if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
      return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    };

    const climaSection = clima.length > 0 ? `
      <section>
        <h2>Condições Climáticas</h2>
        <table>
          <thead><tr><th>Período</th><th>Clima</th><th>Praticabilidade</th><th>Pluviometria (mm)</th></tr></thead>
          <tbody>${rows(clima, c => `<tr>
            <td><strong>${c.periodo || '—'}</strong></td>
            <td>${c.condicao_tempo || '—'}</td>
            <td>${c.condicao_trabalho || '—'}</td>
            <td>${c.pluviometria_mm ?? 0} mm</td>
          </tr>`)}</tbody>
        </table>
      </section>` : '';

    const maoObraSection = maoObraFinal.length > 0 ? `
      <section>
        <h2>Mão de Obra (${maoObraFinal.length} pessoa${maoObraFinal.length > 1 ? 's' : ''})</h2>
        <table>
          <thead><tr><th>Nome</th><th>Função</th><th>Categoria</th><th>Entrada</th><th>Saída Almoço</th><th>Retorno</th><th>Saída Final</th><th>Horas</th></tr></thead>
          <tbody>${rows(maoObraFinal, c => `<tr>
            <td><strong>${c.nome || '—'}</strong></td>
            <td>${c.funcao || '—'}</td>
            <td>${c.tipo || '—'}</td>
            <td>${c.entrada || '—'}</td>
            <td>${c.saida_almoco || '—'}</td>
            <td>${c.retorno_almoco || '—'}</td>
            <td>${c.saida_final || '—'}</td>
            <td>${calcHorasColab(c)}</td>
          </tr>`)}</tbody>
        </table>
      </section>` : '';

    const equipSection = equipamentosLista.length > 0 ? `
      <section>
        <h2>Equipamentos</h2>
        <table>
          <thead><tr><th>Equipamento</th><th>Quantidade</th></tr></thead>
          <tbody>${rows(equipamentosLista, e => `<tr>
            <td>${e.nome || e.descricao || '—'}</td>
            <td>${e.quantidade ?? 1}</td>
          </tr>`)}</tbody>
        </table>
      </section>` : '';

    const atividadesSection = atividadesPdf.length > 0 ? `
      <section>
        <h2>Atividades Executadas</h2>
        <table>
          <thead><tr><th>Atividade</th><th>Prev.</th><th>Exec.</th><th>Unidade</th><th>% Exec.</th><th>% Acum.</th><th>Status</th></tr></thead>
          <tbody>${rows(atividadesPdf, a => {
            const acum = Number(a.percentual_acumulado || 0);
            const acumVirt = Math.min(acum, 100);
            const st = acumVirt >= 100 ? 'Concluída' : (acumVirt > 0 ? 'Em andamento' : 'Não iniciada');
            const stColor = acumVirt >= 100 ? '#10b981' : (acumVirt > 0 ? '#f59e0b' : '#6b7280');
            return `<tr>
              <td>${a.codigo_eap ? `<strong>${a.codigo_eap}</strong> — ` : '<strong>Avulsa</strong> — '}${a.descricao || '—'}${a.observacao ? `<br><small style="color:#6b7280">${a.observacao}</small>` : ''}</td>
              <td style="text-align:right">${formatNumber(a.quantidade_prevista)}</td>
              <td style="text-align:right">${formatNumber(a.quantidade_executada)}</td>
              <td>${a.unidade_medida || '—'}</td>
              <td style="text-align:right">${formatNumber(a.percentual_item)}%</td>
              <td style="text-align:right">${formatNumber(acum)}%</td>
              <td><span class="badge" style="background:${stColor}">${st}</span></td>
            </tr>`;
          })}</tbody>
        </table>
      </section>` : '';

    const fotosSection = fotos.length > 0 ? `
      <section>
        <h2>Fotos do RDO (${fotos.length})</h2>
        <div class="foto-grid">
          ${rows(fotos, f => {
            const src = fotoUrl(f.caminho_arquivo);
            return `<div class="foto-item">
              <img src="${src}" alt="${f.nome_arquivo || 'foto'}" />
              <p class="foto-desc">${f.atividade_descricao ? `<strong>${f.atividade_codigo ? f.atividade_codigo + ' — ' : ''}${f.atividade_descricao}</strong><br>` : (f.atividade_avulsa_descricao ? `<strong>Avulsa — ${f.atividade_avulsa_descricao}</strong><br>` : '')}${f.descricao || f.nome_arquivo || ''}</p>
            </div>`;
          })}
        </div>
      </section>` : '';

    const materiaisSection = materiais.length > 0 ? `
      <section>
        <h2>Materiais Recebidos</h2>
        <table>
          <thead><tr><th>Material</th><th>Quantidade</th><th>Unidade</th><th>Nº NF</th></tr></thead>
          <tbody>${rows(materiais, m => `<tr>
            <td>${m.nome_material || '—'}</td>
            <td style="text-align:right">${m.quantidade ?? '—'}</td>
            <td>${m.unidade || '—'}</td>
            <td>${m.numero_nf || '—'}</td>
          </tr>`)}</tbody>
        </table>
      </section>` : '';

    const ocorrenciasSection = ocorrencias.length > 0 ? `
      <section>
        <h2>Ocorrências</h2>
        ${rows(ocorrencias, o => `
          <div class="ocorrencia">
            <div class="ocorrencia-header">
              <strong>${o.titulo || 'Ocorrência'}</strong>
              <span class="badge" style="background:${gravBadge(o.gravidade)}">${o.gravidade || '—'}</span>
            </div>
            <p>${o.descricao || '—'}</p>
          </div>`)}
      </section>` : '';

    const comentariosSection = (comentarios.length > 0 || rdo.comentarios) ? `
      <section>
        <h2>Comentários</h2>
        ${rdo.comentarios ? `
          <div class="ocorrencia">
            <div class="ocorrencia-header">
              <strong>Comentário geral do RDO</strong>
            </div>
            <p>${String(rdo.comentarios).replace(/\n/g, '<br>')}</p>
          </div>` : ''}
        ${rows(comentarios, c => `
          <div class="ocorrencia">
            <div class="ocorrencia-header">
              <strong>${c.autor_nome || 'Usuário'}</strong>
              <span style="color:#64748b; font-size:10px;">${fmtDate(c.criado_em)}</span>
            </div>
            <p>${c.comentario ? String(c.comentario).replace(/\n/g, '<br>') : '—'}</p>
          </div>`)}
      </section>` : '';

    const anexosSection = anexos.length > 0 ? `
      <section>
        <h2>Anexos</h2>
        <ol class="anexo-list">
          ${rows(anexos, (a) => {
            const href = `${publicBaseUrl}/uploads/${encodeURIComponent(a.caminho_arquivo || '')}`;
            return `<li><a href="${href}" target="_blank" rel="noopener noreferrer"><strong>${a.nome_arquivo}</strong></a> — ${a.tipo || '—'}${a.tamanho ? ` (${Math.round(a.tamanho / 1024)} KB)` : ''}</li>`;
          })}
        </ol>
      </section>` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #1e293b; background: #fff; }

  /* CAPA */
  .capa { page-break-after: always; padding: 38px 32px; }
  .capa-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0ea5e9; padding-bottom: 14px; margin-bottom: 18px; }
  .capa-title { font-size: 28px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .capa-subtitle { font-size: 14px; color: #64748b; }
  .capa-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .info-card h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 12px; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; }
  .info-row .label { color: #64748b; }
  .info-row .value { font-weight: 600; color: #0f172a; text-align: right; max-width: 60%; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; text-align: center; }
  .kpi .kpi-val { font-size: 20px; font-weight: 700; color: #0f172a; }
  .kpi .kpi-label { font-size: 10px; color: #64748b; margin-top: 4px; }
  .status-pill { display: inline-block; padding: 4px 12px; border-radius: 20px; color: #fff; font-size: 11px; font-weight: 600; }
  .resumo-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .resumo-chip { background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 500; }

  /* SEÇÕES */
  section { padding: 14px 32px; page-break-inside: auto; }
  section + section { border-top: 1px solid #f1f5f9; }
  h2 { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 4px; border-bottom: 2px solid #0ea5e9; }

  /* TABELAS */
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 2px; }
  thead tr { background: #f1f5f9; }
  th { padding: 5px 8px; text-align: left; font-weight: 600; color: #475569; font-size: 8.8px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #e2e8f0; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; color: #334155; }
  tr:nth-child(even) td { background: #fafafa; }
  code { font-family: monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 9px; }

  /* BADGES */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; color: #fff; font-size: 9px; font-weight: 600; }

  /* FOTOS */
  .foto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .foto-item {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .foto-item img {
    width: 100%;
    height: auto;
    max-height: 240px;
    object-fit: contain;
    object-position: center;
    display: block;
    background: #f8fafc;
  }
  .foto-desc { padding: 6px 8px; font-size: 9px; color: #475569; background: #f8fafc; }

  /* OCORRÊNCIAS */
  .ocorrencia { background: #fafafa; border: 1px solid #f1f5f9; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
  .ocorrencia-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }

  /* ANEXOS */
  .anexo-list { padding-left: 20px; }
  .anexo-list li { margin-bottom: 6px; font-size: 11px; color: #334155; }

  /* RODAPÉ */
  @page { size: A4; }
</style>
</head>
<body>

<!-- CAPA -->
<div class="capa">
  <div class="capa-header">
    <div>
      <div class="capa-title">Relatório Diário de Obra</div>
      <div class="capa-subtitle">RDO ${displayId} &nbsp;·&nbsp; ${fmtDate(rdo.data_relatorio)} &nbsp;·&nbsp; ${rdo.dia_semana || ''}</div>
    </div>
    <div>
      <span class="status-pill" style="background:${statusBadge(rdo.status)}">${rdo.status || 'Em preenchimento'}</span>
    </div>
  </div>

  <div class="capa-info-grid">
    <div class="info-card">
      <h3>Dados da Obra</h3>
      <div class="info-row"><span class="label">Projeto</span><span class="value">${rdo.projeto_nome || '—'}</span></div>
      <div class="info-row"><span class="label">Local</span><span class="value">${rdo.projeto_cidade || '—'}</span></div>
      <div class="info-row"><span class="label">Contratante</span><span class="value">${rdo.projeto_contratante || '—'}</span></div>
      <div class="info-row"><span class="label">Executante</span><span class="value">${rdo.projeto_executante || '—'}</span></div>
      <div class="info-row"><span class="label">Responsável</span><span class="value">${responsavelNome}</span></div>
    </div>
    <div class="info-card">
      <h3>Prazos</h3>
      <div class="info-row"><span class="label">Prazo Total</span><span class="value">${prazoTotal != null ? prazoTotal + ' dias' : '—'}</span></div>
      <div class="info-row"><span class="label">Dias Decorridos</span><span class="value">${diasDecorridos != null ? diasDecorridos + ' dias' : '—'}</span></div>
      <div class="info-row"><span class="label">Dias Restantes</span><span class="value">${diasRestantes != null ? diasRestantes + ' dias' : '—'}</span></div>
      <div class="info-row"><span class="label">Previsão Término</span><span class="value">${termino ? fmtDate(termino.toISOString()) : '—'}</span></div>
      <div class="info-row"><span class="label">Nº RDO</span><span class="value">${displayId}</span></div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${rdo.mao_obra_direta + rdo.mao_obra_indireta + rdo.mao_obra_terceiros}</div><div class="kpi-label">Pessoas no Dia</div></div>
    <div class="kpi"><div class="kpi-val">${equipamentosLista.length}</div><div class="kpi-label">Equipamentos</div></div>
    <div class="kpi"><div class="kpi-val">${atividadesPdf.length}</div><div class="kpi-label">Atividades</div></div>
    <div class="kpi"><div class="kpi-val">${ocorrencias.length}</div><div class="kpi-label">Ocorrências</div></div>
    <div class="kpi"><div class="kpi-val">${fotos.length}</div><div class="kpi-label">Fotos</div></div>
    <div class="kpi"><div class="kpi-val">${rdo.horas_trabalhadas || 0} h</div><div class="kpi-label">Horas Trabalhadas</div></div>
  </div>

  ${rdo.observacoes || rdo.obs_geral ? `
  <div class="info-card">
    <h3>Observação Geral</h3>
    <p style="line-height:1.6; color:#334155">${(rdo.observacoes || rdo.obs_geral || '').replace(/\n/g, '<br>')}</p>
  </div>` : ''}
</div>

<!-- SEÇÕES -->
${climaSection}
${maoObraSection}
${equipSection}
${atividadesSection}
${fotosSection}
${materiaisSection}
${ocorrenciasSection}
${comentariosSection}
${anexosSection}

</body>
</html>`;

    // ── Lançar puppeteer com Edge do sistema ─────────────────────────────
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    browser = await puppeteer.launch({
      headless: true,
      executablePath: fs.existsSync(edgePath) ? edgePath : undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const safeNomeProjeto = String(rdo.projeto_nome || 'Projeto').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:8px;color:#94a3b8;padding:0 40px;width:100%;box-sizing:border-box;display:flex;justify-content:space-between;font-family:'Segoe UI',sans-serif;align-items:center"><span>${safeNomeProjeto} &nbsp;&middot;&nbsp; ${displayId}</span><span>Pág. <span class="pageNumber"></span>&nbsp;/&nbsp;<span class="totalPages"></span> &nbsp;&mdash;&nbsp; Gerado em ${new Date().toLocaleString('pt-BR')}</span></div>`,
      margin: { top: '8mm', bottom: '10mm', left: '0', right: '0' }
    });

    await browser.close();
    browser = null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${displayId}.pdf"`);
    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    if (browser) { try { await browser.close(); } catch {} }
    console.error('Erro ao gerar PDF (puppeteer):', error);
    res.status(500).json({ erro: 'Erro ao gerar PDF: ' + (error.message || 'erro desconhecido') });
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
      const condicoesClima = `Manhã: ${rdo.clima_manha || ''} ${rdo.tempo_manha || ''} (${rdo.praticabilidade_manha || ''}) | Tarde: ${rdo.clima_tarde || ''} ${rdo.tempo_tarde || ''} (${rdo.praticabilidade_tarde || ''})`;
      const observacoes = rdo.comentarios || '';
      worksheet.addRow({
        numero_rdo: rdo.numero_rdo || `RDO-${rdo.id}`,
        data_relatorio: new Date(rdo.data_relatorio).toLocaleDateString('pt-BR'),
        dia_semana: rdo.dia_semana,
        status: rdo.status,
        mao_obra_direta: rdo.mao_obra_direta || 0,
        mao_obra_indireta: rdo.mao_obra_indireta || 0,
        mao_obra_terceiros: rdo.mao_obra_terceiros || 0,
        condicoes_climaticas: condicoesClima,
        observacoes: observacoes,
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
  // Exclusão desativada por política do sistema
  return res.status(403).json({ erro: 'Exclusão de RDOs do projeto desativada.' });
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

// Endpoint para consultar logs de visualização e edição de um RDO
router.get('/:id/logs', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await allQuery(`
      SELECT rl.*, u.nome as usuario_nome
      FROM rdo_logs rl
      LEFT JOIN usuarios u ON rl.usuario_id = u.id
      WHERE rl.rdo_id = ?
      ORDER BY rl.criado_em DESC, rl.id DESC
    `, [id]);
    res.json({ logs });
  } catch (error) {
    console.error('Erro ao buscar logs do RDO:', error);
    res.status(500).json({ erro: 'Erro ao buscar logs do RDO.' });
  }
});

module.exports = router;

const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');
const ganttService = require('../services/ganttService');

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

const ensureEapOptionalColumns = async () => {
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN tenant_id INTEGER'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN unidade_medida TEXT'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN quantidade_total REAL DEFAULT 0'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN id_atividade TEXT'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN nome TEXT'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN data_inicio_planejada DATE'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN data_fim_planejada DATE'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN peso_percentual_projeto REAL DEFAULT 0'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN data_conclusao_real DATE'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN status TEXT'); } catch (_) {}

  // Backfill de tenant para registros legados
  try {
    await runQuery(`
      UPDATE atividades_eap
      SET tenant_id = (
        SELECT p.tenant_id FROM projetos p WHERE p.id = atividades_eap.projeto_id
      )
      WHERE tenant_id IS NULL OR tenant_id = 0
    `);
  } catch (_) {}
};

const ensureDependenciasSchema = async () => {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS atividades_dependencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projeto_id INTEGER NOT NULL,
      tenant_id INTEGER,
      atividade_origem_id INTEGER NOT NULL,
      atividade_destino_id INTEGER NOT NULL,
      tipo_vinculo TEXT DEFAULT 'FS',
      sugerida_por_sistema INTEGER DEFAULT 1,
      confirmada_usuario INTEGER DEFAULT 0,
      score_sugestao REAL,
      motivo_sugestao TEXT,
      criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmada_em DATETIME,
      confirmada_por INTEGER,
      UNIQUE(atividade_origem_id, atividade_destino_id)
    )
  `);

  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN tenant_id INTEGER'); } catch (_) {}
  try { await runQuery("ALTER TABLE atividades_dependencias ADD COLUMN tipo_vinculo TEXT DEFAULT 'FS'"); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN sugerida_por_sistema INTEGER DEFAULT 1'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN confirmada_usuario INTEGER DEFAULT 0'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN score_sugestao REAL'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN motivo_sugestao TEXT'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN criada_em DATETIME DEFAULT CURRENT_TIMESTAMP'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN confirmada_em DATETIME'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_dependencias ADD COLUMN confirmada_por INTEGER'); } catch (_) {}

  await runQuery('CREATE INDEX IF NOT EXISTS idx_dependencias_projeto ON atividades_dependencias(projeto_id, confirmada_usuario)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_dependencias_origem ON atividades_dependencias(atividade_origem_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_dependencias_destino ON atividades_dependencias(atividade_destino_id)');
};

const syncPredecessoraAtividade = async ({
  projetoId,
  tenantId,
  atividadeId,
  predecessoraId,
  tipoVinculo = 'FS',
  usuarioId
}) => {
  await ensureDependenciasSchema();

  await runQuery(
    'DELETE FROM atividades_dependencias WHERE projeto_id = ? AND atividade_destino_id = ? AND sugerida_por_sistema = 0',
    [projetoId, atividadeId]
  );

  if (!predecessoraId) {
    return;
  }

  if (Number(predecessoraId) === Number(atividadeId)) {
    throw new Error('Uma atividade não pode depender dela mesma.');
  }

  await runQuery(
    `INSERT INTO atividades_dependencias (
      projeto_id, tenant_id, atividade_origem_id, atividade_destino_id,
      tipo_vinculo, sugerida_por_sistema, confirmada_usuario,
      criada_em, atualizado_em, confirmada_em, confirmada_por
    ) VALUES (?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
    [projetoId, tenantId, predecessoraId, atividadeId, tipoVinculo || 'FS', usuarioId]
  );
};

const aplicarCronogramaProjeto = async (projetoId) => {
  const isDataIsoValida = (valor) => {
    if (!valor) return false;
    const d = new Date(valor);
    return !Number.isNaN(d.getTime());
  };

  const atividades = await allQuery(`
    SELECT 
      id, nome, codigo_eap,
      data_inicio_planejada, data_fim_planejada,
      percentual_executado
    FROM atividades_eap
    WHERE projeto_id = ?
  `, [projetoId]);

  const atividadesValidas = atividades.filter(
    (at) => isDataIsoValida(at.data_inicio_planejada) && isDataIsoValida(at.data_fim_planejada)
  );

  if (atividadesValidas.length === 0) {
    return { totalAtualizadas: 0, alteracoes: [] };
  }

  const atividadesComDuracao = atividadesValidas.map(at => ({
    ...at,
    duracao: ganttService.calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada)
  }));

  const atividadesIds = new Set(atividadesComDuracao.map((at) => at.id));
  const dependenciasConfirmadas = await allQuery(
    'SELECT * FROM atividades_dependencias WHERE projeto_id = ? AND confirmada_usuario = 1',
    [projetoId]
  );
  const dependenciasValidas = dependenciasConfirmadas.filter(
    (dep) => atividadesIds.has(dep.atividade_origem_id) && atividadesIds.has(dep.atividade_destino_id)
  );

  const { alteracoes } = ganttService.recalcularCronograma(
    atividadesComDuracao,
    dependenciasValidas
  );

  let totalAtualizadas = 0;
  for (const alteracao of alteracoes) {
    if (!isDataIsoValida(alteracao.data_inicio_nova) || !isDataIsoValida(alteracao.data_fim_nova)) {
      continue;
    }
    await runQuery(
      'UPDATE atividades_eap SET data_inicio_planejada = ?, data_fim_planejada = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [alteracao.data_inicio_nova, alteracao.data_fim_nova, alteracao.atividade_id]
    );
    totalAtualizadas++;
  }

  return { totalAtualizadas, alteracoes };
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
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
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

    const dependenciasManuais = await allQuery(`
      SELECT atividade_origem_id, atividade_destino_id, tipo_vinculo
      FROM atividades_dependencias
      WHERE projeto_id = ? AND confirmada_usuario = 1 AND sugerida_por_sistema = 0
    `, [projetoId]);

    const predecessorasPorDestino = dependenciasManuais.reduce((acc, dep) => {
      if (!acc[dep.atividade_destino_id]) {
        acc[dep.atividade_destino_id] = [];
      }
      acc[dep.atividade_destino_id].push({
        predecessora_id: dep.atividade_origem_id,
        tipo_vinculo_dependencia: dep.tipo_vinculo || 'FS'
      });
      return acc;
    }, {});

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
      const dependenciaManual = predecessorasPorDestino[a.id] || [];
      const copy = {
        ...a,
        predecessora_id: dependenciaManual[0]?.predecessora_id || null,
        predecessoras_ids: dependenciaManual.map((dep) => dep.predecessora_id),
        tipo_vinculo_dependencia: dependenciaManual[0]?.tipo_vinculo_dependencia || 'FS'
      };
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
    await ensureEapOptionalColumns();
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
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
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
      peso_percentual_projeto,
      predecessora_id,
      tipo_vinculo_dependencia
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

    if (predecessora_id) {
      const predecessora = await getQuery(
        'SELECT id FROM atividades_eap WHERE id = ? AND projeto_id = ?',
        [predecessora_id, projeto_id]
      );
      if (!predecessora) {
        return res.status(400).json({ erro: 'Predecessora inválida para este projeto.' });
      }

      await syncPredecessoraAtividade({
        projetoId: projeto_id,
        tenantId,
        atividadeId: result.lastID,
        predecessoraId: predecessora_id,
        tipoVinculo: tipo_vinculo_dependencia || 'FS',
        usuarioId: req.usuario.id
      });

      await aplicarCronogramaProjeto(projeto_id);
    }

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
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    const { id } = req.params;
    const { codigo_eap, descricao, percentual_previsto, ordem, unidade_medida, quantidade_total, pai_id, id_atividade, nome, data_inicio_planejada, data_fim_planejada, peso_percentual_projeto, percentual_executado, predecessora_id, tipo_vinculo_dependencia } = req.body;

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

    if (typeof predecessora_id !== 'undefined') {
      if (predecessora_id) {
        const predecessora = await getQuery(
          'SELECT id FROM atividades_eap WHERE id = ? AND projeto_id = ?',
          [predecessora_id, atividadeAnterior.projeto_id]
        );
        if (!predecessora) {
          return res.status(400).json({ erro: 'Predecessora inválida para este projeto.' });
        }
      }

      await syncPredecessoraAtividade({
        projetoId: atividadeAnterior.projeto_id,
        tenantId: req.tenantId,
        atividadeId: id,
        predecessoraId: predecessora_id || null,
        tipoVinculo: tipo_vinculo_dependencia || 'FS',
        usuarioId: req.usuario.id
      });

      if (predecessora_id) {
        await aplicarCronogramaProjeto(atividadeAnterior.projeto_id);
      }
    }

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

// ===== NOVAS ROTAS: SISTEMA DE GANTT E DEPENDÊNCIAS =====

/**
 * @route   POST /eap/projeto/:projetoId/sugerir-dependencias
 * @access  Private (auth, isGestor)
 * @desc    Sugere dependências automáticas entre atividades com base em heurísticas
 */
router.post('/projeto/:projetoId/sugerir-dependencias', [auth, isGestor], async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    const { projetoId } = req.params;
    const { modoParalelizacao } = req.body;
    const tenantId = req.tenantId;

    // Validar permissões
    const projeto = await getQuery(
      'SELECT id FROM projetos WHERE id = ? AND tenant_id = ?',
      [projetoId, tenantId]
    );
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado.' });
    }

    // Buscar todas as atividades do projeto
    const atividades = await allQuery(`
      SELECT 
        id, nome, codigo_eap, descricao, pai_id,
        data_inicio_planejada, data_fim_planejada,
        percentual_executado, peso_percentual_projeto
      FROM atividades_eap
      WHERE projeto_id = ?
      ORDER BY codigo_eap
    `, [projetoId]);

    // Enriquecer com duração
    const atividadesComDuracao = atividades.map(at => ({
      ...at,
      duracao: ganttService.calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada)
    }));

    // Buscar dependências já existentes
    const dependenciasExistentes = await allQuery(`
      SELECT * FROM atividades_dependencias
      WHERE projeto_id = ?
    `, [projetoId]);

    // Gerar sugestões
    const resultado = ganttService.sugerirDependenciasLote(
      atividadesComDuracao,
      dependenciasExistentes,
      modoParalelizacao !== false
    );

    // Salvar sugestões no banco WITHOUT confirmação
    for (const sugestao of resultado.sugestoes) {
      try {
        await runQuery(`
          INSERT INTO atividades_dependencias (
            projeto_id, tenant_id, atividade_origem_id, atividade_destino_id,
            tipo_vinculo, sugerida_por_sistema, confirmada_usuario,
            score_sugestao, motivo_sugestao, criada_em
          ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, CURRENT_TIMESTAMP)
        `, [
          projetoId, tenantId, sugestao.id_origem, sugestao.id_destino,
          sugestao.tipo_vinculo_recomendado, sugestao.score, sugestao.motivos
        ]);
      } catch (err) {
        // Ignorar violações de UNIQUE (já existe)
        if (!err.message.includes('UNIQUE')) {
          console.error('Erro ao inserir sugestão:', err);
        }
      }
    }

    // Registrar auditoria
    await registrarAuditoria(
      'atividades_dependencias',
      projetoId,
      'SUGERIR_DEPENDENCIAS',
      null,
      { total_sugestoes: resultado.sugestoes.length },
      req.usuario.id
    );

    res.json({
      sugestoes: resultado.sugestoes,
      totalSugestoes: resultado.totalSugestoes,
      caminoCritico: resultado.caminoCritico
    });

  } catch (error) {
    console.error('Erro ao sugerir dependências:', error);
    res.status(500).json({ erro: 'Erro ao sugerir dependências.' });
  }
});

/**
 * @route   POST /eap/dependencia/:id/confirmar
 * @access  Private (auth, isGestor)
 * @desc    Confirma uma dependência sugerida e calcula preview do cronograma
 */
router.post('/dependencia/:id/confirmar', [auth, isGestor], async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    const { id } = req.params;
    const { aceitar } = req.body;
    const tenantId = req.tenantId;

    // Buscar dependência
    const dependencia = await getQuery(
      'SELECT * FROM atividades_dependencias WHERE id = ?',
      [id]
    );

    if (!dependencia) {
      return res.status(404).json({ erro: 'Dependência não encontrada.' });
    }

    // Validar tenant
    if (dependencia.tenant_id !== tenantId) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }

    if (!aceitar) {
      // Rejeitar: deletar sugestão
      await runQuery('DELETE FROM atividades_dependencias WHERE id = ?', [id]);
      return res.json({ mensagem: 'Sugestão rejeitada.' });
    }

    // Aceitar: validar ciclos
    const dependenciasExistentes = await allQuery(
      'SELECT * FROM atividades_dependencias WHERE projeto_id = ? AND confirmada_usuario = 1',
      [dependencia.projeto_id]
    );

    const { temCiclo, caminhoCiclo } = ganttService.detectarCiclos(
      dependencia.atividade_origem_id,
      dependencia.atividade_destino_id,
      dependenciasExistentes
    );

    if (temCiclo) {
      return res.status(400).json({
        erro: 'Ciclo detectado! Esta dependência criaria uma estrutura cíclica.',
        caminhoCiclo
      });
    }

    // Marcar como confirmada
    await runQuery(
      'UPDATE atividades_dependencias SET confirmada_usuario = 1, confirmada_em = CURRENT_TIMESTAMP, confirmada_por = ? WHERE id = ?',
      [req.usuario.id, id]
    );

    // Buscar todas as atividades do projeto
    const atividades = await allQuery(`
      SELECT 
        id, nome, codigo_eap, pai_id,
        data_inicio_planejada, data_fim_planejada,
        percentual_executado
      FROM atividades_eap
      WHERE projeto_id = ?
    `, [dependencia.projeto_id]);

    // Enriquecer com duração
    const atividadesComDuracao = atividades.map(at => ({
      ...at,
      duracao: ganttService.calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada)
    }));

    // Buscar novas dependências confirmadas (incluindo a que foi confirmada agora)
    const dependenciasAtualizadas = await allQuery(
      'SELECT * FROM atividades_dependencias WHERE projeto_id = ? AND confirmada_usuario = 1',
      [dependencia.projeto_id]
    );

    // Calcular cronograma (preview, sem salvar)
    const { novasAtividades, alteracoes } = ganttService.recalcularCronograma(
      atividadesComDuracao,
      dependenciasAtualizadas
    );

    // Calcular caminho crítico
    const caminoCritico = ganttService.calcularCaminoCritico(
      novasAtividades,
      dependenciasAtualizadas
    );

    // Registrar auditoria
    await registrarAuditoria(
      'atividades_dependencias',
      id,
      'CONFIRMAR_DEPENDENCIA',
      null,
      { alteracoes: alteracoes.length },
      req.usuario.id
    );

    res.json({
      mensagem: 'Dependência confirmada com sucesso.',
      dependencia: {
        origem: dependencia.atividade_origem_id,
        destino: dependencia.atividade_destino_id,
        tipo_vinculo: dependencia.tipo_vinculo
      },
      preview: {
        alteracoes,
        caminoCritico: caminoCritico.caminhoCritico,
        dataConclusao: caminoCritico.dataConclusao,
        totalAtividadesAfetadas: alteracoes.length
      }
    });

  } catch (error) {
    console.error('Erro ao confirmar dependência:', error);
    res.status(500).json({ erro: 'Erro ao confirmar dependência.' });
  }
});

/**
 * @route   GET /eap/projeto/:projetoId/dependencias-sugeridas
 * @access  Private (auth, isGestor)
 * @desc    Lista todas as dependências sugeridas (não confirmadas) do projeto
 */
router.get('/projeto/:projetoId/dependencias-sugeridas', [auth, isGestor], async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    const { projetoId } = req.params;
    const tenantId = req.tenantId;

    // Validar permissões
    const projeto = await getQuery(
      'SELECT id FROM projetos WHERE id = ? AND tenant_id = ?',
      [projetoId, tenantId]
    );
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado.' });
    }

    // Buscar sugestões não confirmadas
    const sugestoes = await allQuery(`
      SELECT 
        ad.id,
        ad.atividade_origem_id,
        ad.atividade_destino_id,
        ad.tipo_vinculo,
        ad.score_sugestao,
        ad.motivo_sugestao,
        a1.nome AS nome_origem,
        a1.codigo_eap AS codigo_origem,
        a2.nome AS nome_destino,
        a2.codigo_eap AS codigo_destino
      FROM atividades_dependencias ad
      LEFT JOIN atividades_eap a1 ON ad.atividade_origem_id = a1.id
      LEFT JOIN atividades_eap a2 ON ad.atividade_destino_id = a2.id
      WHERE ad.projeto_id = ? AND ad.confirmada_usuario = 0
      ORDER BY ad.score_sugestao DESC
    `, [projetoId]);

    res.json({
      total: sugestoes.length,
      sugestoes
    });

  } catch (error) {
    console.error('Erro ao listar sugestões:', error);
    res.status(500).json({ erro: 'Erro ao listar dependências sugeridas.' });
  }
});

/**
 * @route   POST /eap/dependencias/aplicar-cronograma
 * @access  Private (auth, isGestor)
 * @desc    Aplica o recalcular do cronograma baseado em dependências confirmadas
 */
router.post('/dependencias/aplicar-cronograma', [auth, isGestor], async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    const { projetoId } = req.body;
    const tenantId = req.tenantId;
    const isDataIsoValida = (valor) => {
      if (!valor) return false;
      const d = new Date(valor);
      return !Number.isNaN(d.getTime());
    };

    if (!projetoId) {
      return res.status(400).json({ erro: 'projeto_id é obrigatório.' });
    }

    // Validar permissões
    const projeto = await getQuery(
      'SELECT id FROM projetos WHERE id = ? AND tenant_id = ?',
      [projetoId, tenantId]
    );
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado.' });
    }

    // Buscar todas as atividades
    const atividades = await allQuery(`
      SELECT 
        id, nome, codigo_eap,
        data_inicio_planejada, data_fim_planejada,
        percentual_executado
      FROM atividades_eap
      WHERE projeto_id = ?
    `, [projetoId]);

    const atividadesValidas = atividades.filter(
      (at) => isDataIsoValida(at.data_inicio_planejada) && isDataIsoValida(at.data_fim_planejada)
    );

    if (atividadesValidas.length === 0) {
      return res.status(400).json({
        erro: 'Nenhuma atividade com datas planejadas válidas foi encontrada para aplicar o cronograma.'
      });
    }

    // Enriquecer com duração
    const atividadesComDuracao = atividadesValidas.map(at => ({
      ...at,
      duracao: ganttService.calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada)
    }));

    const atividadesIds = new Set(atividadesComDuracao.map((at) => at.id));

    // Buscar dependências confirmadas
    const dependenciasConfirmadas = await allQuery(`
      SELECT * FROM atividades_dependencias
      WHERE projeto_id = ? AND confirmada_usuario = 1
    `, [projetoId]);

    const dependenciasValidas = dependenciasConfirmadas.filter(
      (dep) => atividadesIds.has(dep.atividade_origem_id) && atividadesIds.has(dep.atividade_destino_id)
    );

    // Recalcular cronograma
    const { novasAtividades, alteracoes } = ganttService.recalcularCronograma(
      atividadesComDuracao,
      dependenciasValidas
    );

    // Aplicar alterações no banco de dados
    let totalAtualizadas = 0;
    for (const alteracao of alteracoes) {
      if (!isDataIsoValida(alteracao.data_inicio_nova) || !isDataIsoValida(alteracao.data_fim_nova)) {
        continue;
      }
      await runQuery(
        'UPDATE atividades_eap SET data_inicio_planejada = ?, data_fim_planejada = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [alteracao.data_inicio_nova, alteracao.data_fim_nova, alteracao.atividade_id]
      );
      totalAtualizadas++;
    }

    // Registrar auditoria
    await registrarAuditoria(
      'atividades_dependencias',
      projetoId,
      'APLICAR_CRONOGRAMA',
      null,
      { total_atividades_atualizadas: totalAtualizadas, total_alteracoes: alteracoes.length },
      req.usuario.id
    );

    res.json({
      mensagem: 'Cronograma atualizado com sucesso.',
      totalAtualizadas,
      alteracoes
    });

  } catch (error) {
    console.error('Erro ao aplicar cronograma:', error);
    res.status(500).json({ erro: 'Erro ao aplicar cronograma.' });
  }
});

/**
 * @route   GET /eap/projeto/:projetoId/gantt-data
 * @access  Private (auth)
 * @desc    Retorna dados estruturados para renderizar Gantt chart
 */
router.get('/projeto/:projetoId/gantt-data', auth, async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    const { projetoId } = req.params;
    const { incluirNaoConfirmadas, mostrarCaminoCritico } = req.query;
    const tenantId = req.tenantId;

    // Validar permissões
    const projeto = await getQuery(
      'SELECT id FROM projetos WHERE id = ? AND tenant_id = ?',
      [projetoId, tenantId]
    );
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado.' });
    }

    // Buscar todas as atividades
    const atividades = await allQuery(`
      SELECT 
        id, nome, codigo_eap, pai_id,
        data_inicio_planejada, data_fim_planejada,
        percentual_executado, peso_percentual_projeto,
        status
      FROM atividades_eap
      WHERE projeto_id = ?
      ORDER BY codigo_eap
    `, [projetoId]);

    // Buscar dependências
    const dependenciasQuery = incluirNaoConfirmadas === 'true'
      ? `SELECT * FROM atividades_dependencias WHERE projeto_id = ?`
      : `SELECT * FROM atividades_dependencias WHERE projeto_id = ? AND confirmada_usuario = 1`;

    const dependencias = await allQuery(dependenciasQuery, [projetoId]);

    // Calcular caminho crítico se solicitado
    let caminoCritico = null;
    let dependenciasConfirmadas = [];
    if (mostrarCaminoCritico === 'true') {
      dependenciasConfirmadas = await allQuery(
        'SELECT * FROM atividades_dependencias WHERE projeto_id = ? AND confirmada_usuario = 1',
        [projetoId]
      );
      caminoCritico = ganttService.calcularCaminoCritico(atividades, dependenciasConfirmadas);
    }

    // Detectar atividades atrasadas considerando impacto real no prazo
    const atividadesAtrasadas = ganttService.detectarAtividadesAtrasadas(atividades, {
      folgas: caminoCritico?.folgas || {},
      caminhoCritico: caminoCritico?.caminhoCritico || [],
      dependencias: dependenciasConfirmadas,
      exigirImpactoNoPrazo: true,
      apenasCaminhoCritico: false
    });

    // Estruturar dados para Gantt
    const dadosGantt = atividades.map(at => ({
      id: at.id,
      nome: at.nome || at.codigo_eap,
      codigo_eap: at.codigo_eap,
      data_inicio: at.data_inicio_planejada,
      data_fim: at.data_fim_planejada,
      duracao: ganttService.calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada),
      percentual_executado: at.percentual_executado || 0,
      status: at.status,
      no_caminho_critico: caminoCritico ? caminoCritico.caminhoCritico.includes(at.id) : false,
      atrasado: atividadesAtrasadas.includes(at.id),
      dependencias: dependencias
        .filter(dep => dep.atividade_destino_id === at.id && (incluirNaoConfirmadas === 'true' || dep.confirmada_usuario === 1))
        .map(dep => ({
          id: dep.id,
          origem_id: dep.atividade_origem_id,
          tipo_vinculo: dep.tipo_vinculo,
          confirmada: dep.confirmada_usuario === 1
        }))
    }));

    res.json({
      atividades: dadosGantt,
      dependencias,
      caminhoCritico: caminoCritico,
      folgas: caminoCritico ? caminoCritico.folgas : {}
    });

  } catch (error) {
    console.error('Erro ao obter dados do Gantt:', error);
    res.status(500).json({ erro: 'Erro ao obter dados do Gantt.' });
  }
});

module.exports = router;

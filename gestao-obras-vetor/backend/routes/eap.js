const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');
const ganttService = require('../services/ganttService');
const { ensureSchemaReady } = require('../utils/schemaGuard');
const {
  ORIGINS,
  markRdosAffectedByEapEdit,
  getActivityHistory
} = require('../services/eapActivityEventService');

const router = express.Router();

const getEapStatusByPercentual = (percentual) => {
  const valor = Number(percentual || 0);
  if (valor >= 100) return 'Concluída';
  if (valor > 0) return 'Em andamento';
  return 'Não iniciada';
};

const isEapConcluida = (atividade) => {
  const percentual = Number(atividade?.percentual_executado || 0);
  const status = String(atividade?.status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return percentual >= 100 || status.includes('conclu');
};

const parseCodigoEapPartes = (codigo) => String(codigo || '')
  .split('.')
  .map((parte) => {
    const numero = Number(parte);
    return Number.isFinite(numero) ? numero : parte.toLowerCase();
  });

const compararCodigoEap = (a, b) => {
  const partesA = parseCodigoEapPartes(a?.codigo_eap);
  const partesB = parseCodigoEapPartes(b?.codigo_eap);
  const tamanho = Math.max(partesA.length, partesB.length);

  for (let i = 0; i < tamanho; i += 1) {
    const valorA = partesA[i];
    const valorB = partesB[i];
    if (valorA === undefined) return -1;
    if (valorB === undefined) return 1;
    if (valorA === valorB) continue;

    if (typeof valorA === 'number' && typeof valorB === 'number') {
      return valorA - valorB;
    }

    return String(valorA).localeCompare(String(valorB), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  return 0;
};

const aplicarPercentualEfetivoEap = (atividades = []) => {
  const porId = new Map();
  const filhosPorPai = new Map();

  atividades.forEach((atividade) => {
    const copia = { ...atividade };
    porId.set(Number(copia.id), copia);
    if (copia.pai_id) {
      const paiId = Number(copia.pai_id);
      if (!filhosPorPai.has(paiId)) filhosPorPai.set(paiId, []);
      filhosPorPai.get(paiId).push(copia);
    }
  });

  const calcularPercentual = (atividade) => {
    const filhos = filhosPorPai.get(Number(atividade.id)) || [];
    if (!filhos.length) {
      return Math.min(100, Math.max(0, Number(atividade.percentual_executado || 0)));
    }

    const percentuaisFilhos = filhos.map(calcularPercentual);
    if (percentuaisFilhos.length && percentuaisFilhos.every((percentual) => percentual >= 100)) {
      return 100;
    }

    let somaContribuicao = 0;
    let somaPeso = 0;
    let somaSimples = 0;

    filhos.forEach((filho, index) => {
      const percentual = Number(percentuaisFilhos[index] || 0);
      const peso = Number(filho.peso_percentual_projeto || filho.percentual_previsto || 0);
      somaSimples += percentual;
      if (peso > 0) {
        somaContribuicao += (percentual * peso) / 100;
        somaPeso += peso;
      }
    });

    const percentual = somaPeso > 0
      ? somaContribuicao
      : somaSimples / filhos.length;

    return Math.min(Math.round(percentual * 100) / 100, 100);
  };

  atividades.forEach((atividade) => {
    const copia = porId.get(Number(atividade.id));
    if (!copia) return;
    const percentual = calcularPercentual(copia);
    copia.percentual_executado = percentual;
    copia.status = getEapStatusByPercentual(percentual);
  });

  return atividades.map((atividade) => porId.get(Number(atividade.id)) || atividade);
};
const uploadExcelEap = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return cb(null, true);
    return cb(new Error('Envie um arquivo Excel .xlsx ou .xls.'));
  }
});

const EAP_EXCEL_HEADERS = [
  'Codigo EAP',
  'Nome da Atividade',
  'Atividade Pai',
  'Nivel',
  'Quantidade',
  'Unidade',
  'Data Inicio',
  'Data Fim',
  'Peso (%)',
  'Predecessora'
];

const EAP_EXCEL_HEADERS_DISPLAY = [
  'Código EAP',
  'Nome da Atividade',
  'Atividade Pai',
  'Nível',
  'Quantidade',
  'Unidade',
  'Data Início',
  'Data Fim',
  'Peso (%)',
  'Predecessora'
];

const EAP_UNIDADES_PADRAO = ['un', 'm', 'm²', 'm³', 'kg', 't', 'km', 'ha', 'h', 'dia', 'mês', 'vb'];

const normalizeHeader = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const normalizeText = (value) => String(value ?? '').trim();

const parseDecimalBr = (value) => {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseExcelDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  return parseDateOnly(text);
};

const parseDateOnly = (value) => {
  if (!value) return null;
  const asString = String(value);
  const match = asString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const parseDateAtNoon = (value) => {
  const dateOnly = parseDateOnly(value);
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const toDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const countDiasUteis = (inicio, fim) => {
  const start = parseDateAtNoon(inicio);
  const end = parseDateAtNoon(fim);
  if (!start || !end || end < start) return 0;

  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
};

const diffDiasCalendario = (inicio, fim) => {
  const start = parseDateAtNoon(inicio);
  const end = parseDateAtNoon(fim);
  if (!start || !end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
};

const ensureFaixaPercentual = (valor) => {
  const parsed = parseFloat(valor);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
};

const ensureEapOptionalColumns = async () => {
  await ensureSchemaReady({ getQuery, allQuery }, {
    columns: {
      atividades_eap: [
        'tenant_id',
        'unidade_medida',
        'quantidade_total',
        'id_atividade',
        'nome',
        'data_inicio_planejada',
        'data_fim_planejada',
        'peso_percentual_projeto',
        'data_conclusao_real',
        'status',
        'nivel'
      ]
    }
  });
};

const ensureDependenciasSchema = async () => {
  await ensureSchemaReady({ getQuery, allQuery }, {
    tables: ['atividades_dependencias'],
    columns: {
      atividades_dependencias: [
        'projeto_id',
        'tenant_id',
        'atividade_origem_id',
        'atividade_destino_id',
        'tipo_vinculo',
        'sugerida_por_sistema',
        'confirmada_usuario',
        'score_sugestao',
        'motivo_sugestao',
        'criada_em',
        'atualizado_em',
        'confirmada_em',
        'confirmada_por'
      ]
    }
  });
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

const assertProjetoTenant = async (projetoId, tenantId) => {
  const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projetoId, tenantId]);
  if (!projeto) {
    const err = new Error('Projeto nao encontrado ou nao pertence ao seu tenant.');
    err.status = 404;
    throw err;
  }
  return projeto;
};

const normalizarLinhaEapImport = (raw, linha) => {
  const quantidade = parseDecimalBr(raw.quantidade);
  const peso = parseDecimalBr(raw.peso);
  const nivel = parseInt(raw.nivel, 10);
  return {
    linha,
    codigo_eap: normalizeText(raw.codigo_eap),
    nome: normalizeText(raw.nome),
    pai_codigo: normalizeText(raw.pai_codigo),
    nivel: Number.isInteger(nivel) ? nivel : null,
    quantidade_total: quantidade,
    unidade_medida: normalizeText(raw.unidade_medida),
    data_inicio_planejada: parseExcelDateOnly(raw.data_inicio_planejada),
    data_fim_planejada: parseExcelDateOnly(raw.data_fim_planejada),
    peso_percentual_projeto: peso,
    predecessora_codigo: normalizeText(raw.predecessora_codigo)
  };
};

const validarLinhasEapImport = (linhas) => {
  const erros = [];
  const codigos = new Map();

  linhas.forEach((linha) => {
    if (!linha.codigo_eap) erros.push({ linha: linha.linha, campo: 'Codigo EAP', mensagem: 'Codigo EAP e obrigatorio.' });
    if (!linha.nome) erros.push({ linha: linha.linha, campo: 'Nome da Atividade', mensagem: 'Nome da atividade e obrigatorio.' });
    if (!Number.isInteger(linha.nivel) || linha.nivel <= 0) erros.push({ linha: linha.linha, campo: 'Nivel', mensagem: 'Nivel deve ser um inteiro positivo.' });
    if (linha.quantidade_total === null || linha.quantidade_total < 0) erros.push({ linha: linha.linha, campo: 'Quantidade', mensagem: 'Quantidade deve ser numerica e maior ou igual a zero.' });
    if (!linha.unidade_medida || !EAP_UNIDADES_PADRAO.includes(linha.unidade_medida)) erros.push({ linha: linha.linha, campo: 'Unidade', mensagem: `Unidade deve ser uma das opcoes padrao: ${EAP_UNIDADES_PADRAO.join(', ')}.` });
    if (linha.peso_percentual_projeto === null || linha.peso_percentual_projeto <= 0) erros.push({ linha: linha.linha, campo: 'Peso (%)', mensagem: 'Peso deve ser numerico e positivo.' });
    if (!linha.data_inicio_planejada) erros.push({ linha: linha.linha, campo: 'Data Inicio', mensagem: 'Data Inicio e obrigatoria.' });
    if (!linha.data_fim_planejada) erros.push({ linha: linha.linha, campo: 'Data Fim', mensagem: 'Data Fim e obrigatoria.' });
    if (linha.data_inicio_planejada && linha.data_fim_planejada && linha.data_inicio_planejada > linha.data_fim_planejada) {
      erros.push({ linha: linha.linha, campo: 'Data Fim', mensagem: 'Data Fim deve ser maior ou igual a Data Inicio.' });
    }

    if (linha.codigo_eap) {
      if (codigos.has(linha.codigo_eap)) {
        erros.push({ linha: linha.linha, campo: 'Codigo EAP', mensagem: `Codigo duplicado. Ja usado na linha ${codigos.get(linha.codigo_eap)}.` });
      } else {
        codigos.set(linha.codigo_eap, linha.linha);
      }
    }
  });

  const codigosSet = new Set(linhas.map((linha) => linha.codigo_eap).filter(Boolean));
  linhas.forEach((linha) => {
    if (linha.pai_codigo && !codigosSet.has(linha.pai_codigo)) {
      erros.push({ linha: linha.linha, campo: 'Atividade Pai', mensagem: 'Atividade Pai deve existir na planilha.' });
    }
    if (linha.predecessora_codigo && !codigosSet.has(linha.predecessora_codigo)) {
      erros.push({ linha: linha.linha, campo: 'Predecessora', mensagem: 'Predecessora deve existir na planilha.' });
    }
    if (linha.predecessora_codigo && linha.predecessora_codigo === linha.codigo_eap) {
      erros.push({ linha: linha.linha, campo: 'Predecessora', mensagem: 'Uma atividade nao pode ser predecessora dela mesma.' });
    }
    if (linha.pai_codigo && linha.pai_codigo === linha.codigo_eap) {
      erros.push({ linha: linha.linha, campo: 'Atividade Pai', mensagem: 'Uma atividade nao pode ser pai dela mesma.' });
    }
  });

  const paiPorCodigo = new Map(linhas.map((linha) => [linha.codigo_eap, linha.pai_codigo || null]));
  linhas.forEach((linha) => {
    const visitados = new Set();
    let atual = linha.codigo_eap;
    while (paiPorCodigo.get(atual)) {
      atual = paiPorCodigo.get(atual);
      if (visitados.has(atual)) {
        erros.push({ linha: linha.linha, campo: 'Atividade Pai', mensagem: 'Hierarquia possui ciclo de atividade pai.' });
        break;
      }
      visitados.add(atual);
    }
  });

  return erros;
};

const lerPlanilhaEap = async (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!worksheet) {
    return { linhas: [], erros: [{ linha: 1, campo: 'Arquivo', mensagem: 'Planilha vazia.' }] };
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
  const headerRow = rows[0] || [];
  const headers = EAP_EXCEL_HEADERS.map((_, index) => normalizeHeader(headerRow[index]));
  const expected = EAP_EXCEL_HEADERS.map(normalizeHeader);
  const erros = [];
  expected.forEach((header, index) => {
    if (headers[index] !== header) {
      erros.push({
        linha: 1,
        campo: EAP_EXCEL_HEADERS_DISPLAY[index],
        mensagem: `Cabecalho esperado: ${EAP_EXCEL_HEADERS_DISPLAY[index]}.`
      });
    }
  });
  if (erros.length > 0) return { linhas: [], erros };

  const linhas = [];
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const valores = Array.from({ length: EAP_EXCEL_HEADERS.length }, (_, colIndex) => row[colIndex]);
    const allEmpty = valores.every((value) => normalizeText(value) === '');
    if (allEmpty) return;
    linhas.push(normalizarLinhaEapImport({
      codigo_eap: valores[0],
      nome: valores[1],
      pai_codigo: valores[2],
      nivel: valores[3],
      quantidade: valores[4],
      unidade_medida: valores[5],
      data_inicio_planejada: valores[6],
      data_fim_planejada: valores[7],
      peso: valores[8],
      predecessora_codigo: valores[9]
    }, rowNumber));
  });

  if (linhas.length === 0) {
    erros.push({ linha: 2, campo: 'Arquivo', mensagem: 'Nenhuma atividade encontrada na planilha.' });
  }

  return { linhas, erros: [...erros, ...validarLinhasEapImport(linhas)] };
};

const getImportResumo = (linhas, erros = []) => ({
  total_linhas: linhas.length,
  atividades_raiz: linhas.filter((linha) => !linha.pai_codigo).length,
  atividades_filhas: linhas.filter((linha) => !!linha.pai_codigo).length,
  predecessoras: linhas.filter((linha) => !!linha.predecessora_codigo).length,
  erros: erros.length
});

const hasEapComRdo = async (projetoId) => {
  const row = await getQuery(`
    SELECT COUNT(*) AS total
    FROM rdo_atividades ra
    INNER JOIN atividades_eap ae ON ae.id = ra.atividade_eap_id
    WHERE ae.projeto_id = ?
  `, [projetoId]);
  return Number(row?.total || 0) > 0;
};

const wouldCreateParentCycle = async (atividadeId, novoPaiId) => {
  if (!novoPaiId) return false;
  let atual = Number(novoPaiId);
  const visitados = new Set();
  while (atual) {
    if (Number(atual) === Number(atividadeId)) return true;
    if (visitados.has(atual)) return true;
    visitados.add(atual);
    const row = await getQuery('SELECT pai_id FROM atividades_eap WHERE id = ?', [atual]);
    atual = row?.pai_id ? Number(row.pai_id) : null;
  }
  return false;
};

router.get('/unidades', auth, async (_req, res) => {
  res.json({ unidades: EAP_UNIDADES_PADRAO });
});

router.get('/modelo-excel', auth, async (_req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('EAP');
    worksheet.addRow(EAP_EXCEL_HEADERS_DISPLAY);
    worksheet.addRow(['1.0', 'Mobilizacao', '', 1, 1, 'vb', '15/06/2026', '26/06/2026', 100, '']);
    worksheet.addRow(['1.1', 'Mobilizacao da equipe', '1.0', 2, 1, 'un', '15/06/2026', '16/06/2026', 20, '']);
    worksheet.addRow(['1.2', 'Instalacao do canteiro', '1.0', 2, 250, 'm²', '17/06/2026', '19/06/2026', 25, '1.1']);
    worksheet.addRow(['2.0', 'Fundacoes', '', 1, 1, 'vb', '20/06/2026', '25/06/2026', 100, '1.2']);
    worksheet.addRow(['2.1', 'Escavacao', '2.0', 2, 180, 'm³', '20/06/2026', '25/06/2026', 15, '1.2']);
    worksheet.columns.forEach((column) => { column.width = 22; });
    worksheet.getRow(1).font = { bold: true };
    worksheet.dataValidations.add('F2:F1000', {
      type: 'list',
      allowBlank: false,
      formulae: [`"${EAP_UNIDADES_PADRAO.join(',')}"`]
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-eap-vetor.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erro ao gerar modelo EAP:', error);
    res.status(500).json({ erro: 'Erro ao gerar modelo Excel da EAP.' });
  }
});

router.post('/projeto/:projetoId/importar/preview', [auth, isGestor], uploadExcelEap.single('arquivo'), async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo Excel.' });
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant nao definido.' });
    await assertProjetoTenant(req.params.projetoId, tenantId);

    const { linhas, erros } = await lerPlanilhaEap(req.file.buffer);
    res.json({
      valido: erros.length === 0,
      resumo: getImportResumo(linhas, erros),
      linhas,
      erros
    });
  } catch (error) {
    console.error('Erro ao validar importacao EAP:', error);
    res.status(error.status || 500).json({ erro: error.message || 'Erro ao validar planilha da EAP.' });
  }
});

router.post('/projeto/:projetoId/importar/confirmar', [auth, isGestor], async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();
    const projetoId = Number(req.params.projetoId);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant nao definido.' });
    await assertProjetoTenant(projetoId, tenantId);

    const linhas = Array.isArray(req.body?.linhas)
      ? req.body.linhas.map((linha, index) => normalizarLinhaEapImport({
        codigo_eap: linha.codigo_eap,
        nome: linha.nome,
        pai_codigo: linha.pai_codigo,
        nivel: linha.nivel,
        quantidade: linha.quantidade_total,
        unidade_medida: linha.unidade_medida,
        data_inicio_planejada: linha.data_inicio_planejada,
        data_fim_planejada: linha.data_fim_planejada,
        peso: linha.peso_percentual_projeto,
        predecessora_codigo: linha.predecessora_codigo
      }, linha.linha || index + 2))
      : [];
    const erros = validarLinhasEapImport(linhas);
    if (linhas.length === 0) erros.push({ linha: 2, campo: 'Arquivo', mensagem: 'Nenhuma atividade encontrada para importar.' });
    if (erros.length > 0) {
      return res.status(400).json({ erro: 'A importacao possui erros de validacao.', erros, resumo: getImportResumo(linhas, erros) });
    }

    if (await hasEapComRdo(projetoId)) {
      return res.status(409).json({ erro: 'Este projeto ja possui RDO vinculado a EAP atual. A importacao foi bloqueada para preservar o historico.' });
    }

    const atividadesAtuais = await allQuery('SELECT id FROM atividades_eap WHERE projeto_id = ?', [projetoId]);
    const idsAtuais = atividadesAtuais.map((row) => row.id);
    const codigoParaId = new Map();

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery('DELETE FROM atividades_dependencias WHERE projeto_id = ?', [projetoId]);
      if (idsAtuais.length > 0) {
        const placeholders = idsAtuais.map(() => '?').join(',');
        await runQuery(`DELETE FROM historico_atividades WHERE atividade_eap_id IN (${placeholders})`, idsAtuais).catch(() => {});
      }
      await runQuery('DELETE FROM atividades_eap WHERE projeto_id = ?', [projetoId]);

      const ordenadas = [...linhas].sort((a, b) => a.nivel - b.nivel || String(a.codigo_eap).localeCompare(String(b.codigo_eap), 'pt-BR', { numeric: true }));
      for (const linha of ordenadas) {
        const paiId = linha.pai_codigo ? codigoParaId.get(linha.pai_codigo) : null;
        if (linha.pai_codigo && !paiId) {
          throw new Error(`Atividade pai ${linha.pai_codigo} precisa aparecer antes da filha ${linha.codigo_eap}.`);
        }
        const result = await runQuery(`
          INSERT INTO atividades_eap (
            tenant_id, projeto_id, codigo_eap, descricao, percentual_previsto,
            pai_id, ordem, unidade_medida, quantidade_total, criado_por,
            id_atividade, nome, data_inicio_planejada, data_fim_planejada,
            peso_percentual_projeto, nivel, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          tenantId,
          projetoId,
          linha.codigo_eap,
          linha.nome,
          linha.peso_percentual_projeto,
          paiId || null,
          linha.linha,
          linha.unidade_medida,
          linha.quantidade_total,
          req.usuario.id,
          `ATV-${projetoId}-${linha.codigo_eap}`,
          linha.nome,
          linha.data_inicio_planejada,
          linha.data_fim_planejada,
          linha.peso_percentual_projeto,
          linha.nivel,
          'Nao iniciada'
        ]);
        codigoParaId.set(linha.codigo_eap, result.lastID);
      }

      for (const linha of linhas) {
        if (!linha.predecessora_codigo) continue;
        await syncPredecessoraAtividade({
          projetoId,
          tenantId,
          atividadeId: codigoParaId.get(linha.codigo_eap),
          predecessoraId: codigoParaId.get(linha.predecessora_codigo),
          tipoVinculo: 'FS',
          usuarioId: req.usuario.id
        });
      }

      await registrarAuditoria('atividades_eap', null, 'IMPORT_EXCEL', null, { projeto_id: projetoId, total: linhas.length }, req.usuario.id);
      await runQuery('COMMIT');
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }

    res.json({
      mensagem: 'EAP importada com sucesso.',
      resumo: getImportResumo(linhas, [])
    });
  } catch (error) {
    console.error('Erro ao confirmar importacao EAP:', error);
    res.status(error.status || 500).json({ erro: error.message || 'Erro ao confirmar importacao da EAP.' });
  }
});

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
        copy.percentual_executado = percentual_agregado;
      }
      copy.status = getEapStatusByPercentual(copy.percentual_executado);
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
    }

    if (unidade_medida && !EAP_UNIDADES_PADRAO.includes(String(unidade_medida).trim())) {
      return res.status(400).json({ erro: `Unidade de medida invalida. Use uma das opcoes: ${EAP_UNIDADES_PADRAO.join(', ')}.` });
    }

    const paiNivel = ehFilha
      ? await getQuery('SELECT nivel FROM atividades_eap WHERE id = ? AND projeto_id = ?', [pai_id, projeto_id])
      : null;
    const nivel = ehFilha ? Number(paiNivel?.nivel || 1) + 1 : 1;

    const identificador = (id_atividade && String(id_atividade).trim()) || `ATV-${projeto_id}-${codigo_eap}`;
    const nomeAtividade = (nome && String(nome).trim()) || descricaoNormalizada || `Atividade ${codigo_eap}`;

    const result = await runQuery(`
      INSERT INTO atividades_eap 
      (tenant_id, projeto_id, codigo_eap, descricao, percentual_previsto, pai_id, ordem, unidade_medida, quantidade_total, criado_por, id_atividade, nome, data_inicio_planejada, data_fim_planejada, peso_percentual_projeto, nivel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      peso,
      nivel
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
    let novoPai = null;

    if (ehFilha) {
      if (Number(novoPaiId) === Number(id)) {
        return res.status(400).json({ erro: 'Uma atividade não pode ser pai dela mesma.' });
      }

      if (await wouldCreateParentCycle(id, novoPaiId)) {
        return res.status(400).json({ erro: 'Atividade pai invalida: a hierarquia ficaria circular.' });
      }

      novoPai = await getQuery(
        'SELECT id, pai_id, nivel FROM atividades_eap WHERE id = ? AND projeto_id = ?',
        [novoPaiId, atividadeAnterior.projeto_id]
      );
      if (!novoPai) {
        return res.status(400).json({ erro: 'Atividade pai inválida para este projeto.' });
      }
    }

    if (unidade_medida && !EAP_UNIDADES_PADRAO.includes(String(unidade_medida).trim())) {
      return res.status(400).json({ erro: `Unidade de medida invalida. Use uma das opcoes: ${EAP_UNIDADES_PADRAO.join(', ')}.` });
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
    const novoNivel = ehFilha ? Number(novoPai?.nivel || 1) + 1 : 1;

    await runQuery(`
      UPDATE atividades_eap 
      SET codigo_eap = ?, descricao = ?, percentual_previsto = ?, ordem = ?, unidade_medida = ?, quantidade_total = ?, pai_id = ?, id_atividade = ?, nome = ?, data_inicio_planejada = ?, data_fim_planejada = ?, peso_percentual_projeto = ?, nivel = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [codigo_eap, novaDescricao, peso, ordem, unidade_medida || null, quantidade_total || 0, novoPaiId, novoIdentificador, novoNome, dataInicio || null, dataFim || null, peso, novoNivel, id]);

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

    let correctionResult = { affectedRDOs: 0, rdos: [] };

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

      await runQuery(
        'UPDATE atividades_eap SET percentual_executado = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [novoPerc, getEapStatusByPercentual(novoPerc), id]
      );

      // Atualizar o último RDO (mais recente por data_relatorio) com novo percentual da atividade
      const lastRa = await getQuery(`
        SELECT ra.id as rdo_atividade_id, ra.quantidade_executada, ra.percentual_executado, r.id as rdo_id, r.data_relatorio
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
        const mudouRdoAtividade = Math.abs(Number(lastRa.percentual_executado || 0) - Number(novoPercRdo || 0)) > 0.0001;
        await runQuery('UPDATE rdo_atividades SET percentual_executado = ? WHERE id = ?', [novoPercRdo, lastRa.rdo_atividade_id]);

        // Registrar histórico de ajuste
        try {
          await runQuery(`
            INSERT INTO historico_atividades 
            (atividade_eap_id, rdo_id, percentual_anterior, percentual_executado, percentual_novo, usuario_id, data_execucao)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [id, lastRa.rdo_id, atividadeAnterior?.percentual_executado || 0, novoPercRdo, novoPerc, req.usuario.id, new Date().toISOString()]);
        } catch (e) { /* ignore */ }

        if (mudouRdoAtividade) {
          correctionResult = await markRdosAffectedByEapEdit({
            atividadeIds: [id],
            usuarioId: req.usuario.id,
            origem: ORIGINS.EAP_EDITADA
          });
        }
      }

    } catch (err) {
      console.warn('Falha ao recalcular após atualização de EAP:', err);
    }

    if (!Number(correctionResult.affectedRDOs || 0)) {
      correctionResult = await markRdosAffectedByEapEdit({
        atividadeIds: [id],
        usuarioId: req.usuario.id,
        origem: ORIGINS.EAP_EDITADA
      });
    }

    res.json({ mensagem: 'Atividade atualizada com sucesso.', success: true, ...correctionResult });

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

  const novoStatus = getEapStatusByPercentual(atividade.percentual_executado);

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

    await runQuery(
      'UPDATE atividades_eap SET percentual_executado = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [novoPerc, getEapStatusByPercentual(novoPerc), paiId]
    );

    // Recalcular ancestral recursivamente
    await recalcularPercentualPaiLocal(paiId);
  } catch (err) {
    console.warn('Erro ao recalcular percentual do pai (local):', err);
  }
};

// Recalcular avanço físico de uma atividade
const calcularPreviewRecalculoProjeto = async (projetoId) => {
  const atividades = await allQuery(`
    SELECT id, id_atividade, codigo_eap, nome, descricao, pai_id,
           quantidade_total, percentual_executado, peso_percentual_projeto, percentual_previsto
    FROM atividades_eap
    WHERE projeto_id = ?
    ORDER BY nivel DESC, ordem ASC, codigo_eap ASC
  `, [projetoId]);

  const execucoes = await allQuery(`
    SELECT
      ra.atividade_eap_id,
      COALESCE(SUM(COALESCE(ra.quantidade_executada, 0)), 0) AS total_executado_qt,
      COALESCE(SUM(COALESCE(ra.percentual_executado, 0)), 0) AS total_exec_perc
    FROM rdo_atividades ra
    INNER JOIN rdos r ON ra.rdo_id = r.id
    WHERE r.projeto_id = ? AND r.status = 'Aprovado'
    GROUP BY ra.atividade_eap_id
  `, [projetoId]);

  const execucaoPorAtividade = new Map(execucoes.map((row) => [Number(row.atividade_eap_id), row]));
  const calculadas = new Map();
  const filhosPorPai = new Map();

  atividades.forEach((atividade) => {
    if (atividade.pai_id) {
      const paiId = Number(atividade.pai_id);
      if (!filhosPorPai.has(paiId)) filhosPorPai.set(paiId, []);
      filhosPorPai.get(paiId).push(Number(atividade.id));
    }

    const quantidadeTotal = Number(atividade.quantidade_total || 0);
    const execucao = execucaoPorAtividade.get(Number(atividade.id)) || {};
    const novoPerc = quantidadeTotal > 0
      ? Math.min(Math.round(((Number(execucao.total_executado_qt || 0) / quantidadeTotal) * 10000)) / 100, 100)
      : Math.min(Number(execucao.total_exec_perc || 0), 100);

    calculadas.set(Number(atividade.id), {
      ...atividade,
      percentual_recalculado: Number.isFinite(novoPerc) ? novoPerc : 0
    });
  });

  const calcularPai = (paiId) => {
    const pai = calculadas.get(Number(paiId));
    if (!pai) return 0;

    const filhosIds = filhosPorPai.get(Number(paiId)) || [];
    if (!filhosIds.length) return Number(pai.percentual_recalculado || 0);

    let somaContribuicao = 0;
    let somaPeso = 0;
    let somaSimples = 0;

    filhosIds.forEach((filhoId) => {
      const filho = calculadas.get(Number(filhoId));
      if (!filho) return;
      const perc = filhosPorPai.has(Number(filhoId))
        ? calcularPai(filhoId)
        : Number(filho.percentual_recalculado || 0);
      const peso = Number(filho.peso_percentual_projeto || filho.percentual_previsto || 0);

      somaSimples += perc;
      if (peso > 0) {
        somaContribuicao += (perc * peso) / 100;
        somaPeso += peso;
      }
    });

    const novoPerc = somaPeso > 0
      ? Math.min(Math.round(somaContribuicao * 100) / 100, 100)
      : Math.min(Math.round((somaSimples / filhosIds.length) * 100) / 100, 100);

    pai.percentual_recalculado = novoPerc;
    return novoPerc;
  };

  Array.from(filhosPorPai.keys()).forEach(calcularPai);

  const atividadesAfetadas = atividades
    .map((atividade) => {
      const calculada = calculadas.get(Number(atividade.id));
      const atual = Number(atividade.percentual_executado || 0);
      const novo = Number(calculada?.percentual_recalculado || 0);
      const diferenca = Math.round((novo - atual) * 100) / 100;
      if (diferenca >= -0.0001) return null;
      return {
        id: atividade.id,
        id_atividade: atividade.id_atividade,
        codigo_eap: atividade.codigo_eap,
        nome: atividade.nome || atividade.descricao || atividade.codigo_eap,
        percentual_atual: Math.round(atual * 100) / 100,
        percentual_recalculado: Math.round(novo * 100) / 100,
        diferenca
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.codigo_eap || '').localeCompare(String(b.codigo_eap || ''), 'pt-BR', { numeric: true, sensitivity: 'base' }));

  return {
    total_atividades: atividades.length,
    total_atividades_afetadas: atividadesAfetadas.length,
    atividades: atividadesAfetadas
  };
};

router.post('/:id/recalcular', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const atividadeAtual = await getQuery('SELECT percentual_executado FROM atividades_eap WHERE id = ?', [id]);

    // Somar percentuais executados nos RDOs aprovados
    const resultado = await getQuery(`
      SELECT COALESCE(SUM(ra.percentual_executado), 0) as total_executado
      FROM rdo_atividades ra
      INNER JOIN rdos r ON ra.rdo_id = r.id
      WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
    `, [id]);

    const percentualExecutado = Math.min(resultado.total_executado, 100);

    await runQuery(
      'UPDATE atividades_eap SET percentual_executado = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [percentualExecutado, getEapStatusByPercentual(percentualExecutado), id]
    );

    await registrarAuditoria('atividades_eap', id, 'RECALCULAR', null, { percentual_executado: percentualExecutado }, req.usuario.id);
    const mudouPercentual = Math.abs(Number(atividadeAtual?.percentual_executado || 0) - Number(percentualExecutado || 0)) > 0.0001;
    const correctionResult = mudouPercentual
      ? await markRdosAffectedByEapEdit({
          atividadeIds: [id],
          usuarioId: req.usuario.id,
          origem: ORIGINS.RECALCULO_MANUAL
        })
      : { affectedRDOs: 0, rdos: [] };

    res.json({ 
      success: true,
      mensagem: 'Avanço físico recalculado com sucesso.',
      percentual_executado: percentualExecutado,
      ...correctionResult
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

    const eventos = await getActivityHistory(id);
    const historicoLegado = await allQuery(`
      SELECT h.*, u.nome as usuario_nome, r.data_relatorio
      FROM historico_atividades h
      INNER JOIN usuarios u ON h.usuario_id = u.id
      INNER JOIN rdos r ON h.rdo_id = r.id
      WHERE h.atividade_eap_id = ?
      ORDER BY h.data_execucao DESC
    `, [id]);

    const legadoNormalizado = (historicoLegado || []).map((row) => ({
      ...row,
      fonte: 'historico_atividades',
      tipo: Number(row.percentual_novo || 0) > Number(row.percentual_anterior || 0)
        ? 'avanco'
        : Number(row.percentual_novo || 0) < Number(row.percentual_anterior || 0)
          ? 'regressao'
          : 'ajuste',
      origem: 'historico_legado',
      percentual_novo: row.percentual_novo,
      quantidade_anterior: null,
      quantidade_nova: null,
      criado_em: row.criado_em || row.data_execucao,
      mensagem: 'Registro legado de avanço da atividade.'
    }));

    const eventosNormalizados = (eventos || []).map((row) => ({
      ...row,
      fonte: 'atividade_eap_eventos',
      rdo_label: row.numero_rdo ? `RDO-${String(row.numero_rdo).padStart(3, '0')}` : (row.rdo_id ? `RDO-${String(row.rdo_id).padStart(3, '0')}` : null)
    }));

    res.json([...eventosNormalizados, ...legadoNormalizado].sort((a, b) => {
      const da = new Date(a.criado_em || a.data_execucao || 0).getTime();
      const db = new Date(b.criado_em || b.data_execucao || 0).getTime();
      return db - da;
    }));

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
router.get('/projeto/:projetoId/recalcular-preview', [auth, isGestor], async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    const { projetoId } = req.params;
    const tenantId = req.tenantId;
    const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projetoId, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto nao encontrado.' });
    }

    const preview = await calcularPreviewRecalculoProjeto(projetoId);
    res.json(preview);
  } catch (error) {
    console.error('Erro ao preparar preview do recalculo da EAP:', error);
    res.status(500).json({ erro: 'Erro ao preparar preview do recalculo da EAP.' });
  }
});

router.post('/projeto/:projetoId/recalcular-tudo', [auth, isGestor], async (req, res) => {
  try {
    const { projetoId } = req.params;

    const atividades = await allQuery('SELECT id, quantidade_total, percentual_executado FROM atividades_eap WHERE projeto_id = ?', [projetoId]);
    const atividadesImpactadas = [];
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

      if (Number(novoPerc || 0) < Number(a.percentual_executado || 0) - 0.0001) {
        atividadesImpactadas.push(a.id);
      }

      await runQuery(
        'UPDATE atividades_eap SET percentual_executado = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [novoPerc, getEapStatusByPercentual(novoPerc), a.id]
      );

      // Após atualizar folha/filha, propagar cálculo para os pais
      await recalcularPercentualPaiLocal(a.id);
    }

    await registrarAuditoria('atividades_eap', null, 'RECALCULAR_TODAS', { projeto_id: projetoId }, null, req.usuario.id);
    const correctionResult = await markRdosAffectedByEapEdit({
      atividadeIds: atividadesImpactadas,
      usuarioId: req.usuario.id,
      origem: ORIGINS.RECALCULO_MANUAL
    });

    res.json({ success: true, mensagem: 'EAP recalculada para todas as atividades do projeto.', ...correctionResult });
  } catch (error) {
    console.error('Erro ao recalcular EAP do projeto:', error);
    res.status(500).json({ erro: 'Erro ao recalcular EAP do projeto.' });
  }
});

/**
 * @route   GET /eap/projeto/:projetoId/analise-cronograma
 * @access  Private (auth, isGestor)
 * @desc    Analisa atrasos, impacto, recuperacao e sugestoes do cronograma sem alterar dados
 */
router.get('/projeto/:projetoId/analise-cronograma', [auth, isGestor], async (req, res) => {
  try {
    await ensureEapOptionalColumns();
    await ensureDependenciasSchema();

    const { projetoId } = req.params;
    const tenantId = req.tenantId;

    const projeto = await getQuery(
      'SELECT id, nome FROM projetos WHERE id = ? AND tenant_id = ?',
      [projetoId, tenantId]
    );
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado.' });
    }

    const atividadesRaw = await allQuery(`
      SELECT
        id, nome, codigo_eap, descricao, pai_id,
        data_inicio_planejada, data_fim_planejada,
        percentual_executado, peso_percentual_projeto,
        quantidade_total, unidade_medida, status
      FROM atividades_eap
      WHERE projeto_id = ?
      ORDER BY codigo_eap
    `, [projetoId]);
    const atividades = aplicarPercentualEfetivoEap(atividadesRaw).sort(compararCodigoEap);

    const atividadesComDuracao = atividades.map((at) => ({
      ...at,
      duracao: ganttService.calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada)
    }));

    const dependencias = await allQuery(`
      SELECT *
      FROM atividades_dependencias
      WHERE projeto_id = ?
    `, [projetoId]);

    const dependenciasConfirmadas = dependencias.filter((dep) => Number(dep.confirmada_usuario) === 1);
    const atividadesPorId = new Map(atividadesComDuracao.map((at) => [Number(at.id), at]));

    const caminhoCriticoInfoRaw = ganttService.calcularCaminoCritico(atividadesComDuracao, dependenciasConfirmadas);
    const caminhoCriticoOperacional = (caminhoCriticoInfoRaw.caminhoCritico || [])
      .map(Number)
      .filter((id) => !isEapConcluida(atividadesPorId.get(id)));
    const caminhoCriticoInfo = {
      ...caminhoCriticoInfoRaw,
      caminhoCritico: caminhoCriticoOperacional
    };
    const caminhoCriticoSet = new Set(caminhoCriticoOperacional);
    const atrasadasIds = ganttService.detectarAtividadesAtrasadas(atividadesComDuracao, {
      folgas: caminhoCriticoInfo.folgas || {},
      caminhoCritico: caminhoCriticoInfo.caminhoCritico || [],
      dependencias: dependenciasConfirmadas,
      exigirImpactoNoPrazo: false,
      apenasCaminhoCritico: false
    }).map(Number);

    const hoje = toDateOnly(new Date());
    const fimProjeto = atividadesComDuracao
      .map((at) => parseDateOnly(at.data_fim_planejada))
      .filter(Boolean)
      .sort()
      .reverse()[0] || hoje;

    const sucessorasDiretasPorOrigem = new Map();
    const predecessorasPorDestino = new Map();
    for (const dep of dependenciasConfirmadas) {
      const origem = Number(dep.atividade_origem_id);
      const destino = Number(dep.atividade_destino_id);
      if (!sucessorasDiretasPorOrigem.has(origem)) sucessorasDiretasPorOrigem.set(origem, []);
      sucessorasDiretasPorOrigem.get(origem).push({ ...dep, atividade: atividadesPorId.get(destino) || null });

      if (!predecessorasPorDestino.has(destino)) predecessorasPorDestino.set(destino, []);
      predecessorasPorDestino.get(destino).push({ ...dep, atividade: atividadesPorId.get(origem) || null });
    }

    const coletarSucessorasImpactadas = (atividadeId) => {
      const visitadas = new Set();
      const fila = sucessorasDiretasPorOrigem.get(Number(atividadeId)) || [];
      const resultado = [];

      while (fila.length) {
        const item = fila.shift();
        const sucessora = item.atividade;
        if (!sucessora || visitadas.has(Number(sucessora.id))) continue;
        visitadas.add(Number(sucessora.id));
        resultado.push({
          id: sucessora.id,
          codigo_eap: sucessora.codigo_eap,
          nome: sucessora.nome || sucessora.codigo_eap,
          data_inicio_planejada: parseDateOnly(sucessora.data_inicio_planejada),
          data_fim_planejada: parseDateOnly(sucessora.data_fim_planejada),
          percentual_executado: Number(sucessora.percentual_executado || 0),
          tipo_vinculo: item.tipo_vinculo || 'FS',
          no_caminho_critico: caminhoCriticoSet.has(Number(sucessora.id))
        });

        const proximas = sucessorasDiretasPorOrigem.get(Number(sucessora.id)) || [];
        fila.push(...proximas);
      }

      return resultado;
    };

    const predecessorasPendentes = atividadesComDuracao
      .map((atividade) => {
        const pendentes = (predecessorasPorDestino.get(Number(atividade.id)) || [])
          .map((dep) => dep.atividade)
          .filter((pred) => pred && Number(pred.percentual_executado || 0) < 100)
          .map((pred) => ({
            id: pred.id,
            codigo_eap: pred.codigo_eap,
            nome: pred.nome || pred.codigo_eap,
            percentual_executado: Number(pred.percentual_executado || 0),
            data_fim_planejada: parseDateOnly(pred.data_fim_planejada)
          }));

        if (!pendentes.length) return null;
        return {
          atividade: {
            id: atividade.id,
            codigo_eap: atividade.codigo_eap,
            nome: atividade.nome || atividade.codigo_eap,
            data_inicio_planejada: parseDateOnly(atividade.data_inicio_planejada),
            percentual_executado: Number(atividade.percentual_executado || 0)
          },
          pendentes
        };
      })
      .filter(Boolean);

    const atividadesAtrasadas = atrasadasIds
      .map((id) => atividadesPorId.get(id))
      .filter(Boolean)
      .map((atividade) => {
        const percentualExecutado = Math.min(100, Math.max(0, Number(atividade.percentual_executado || 0)));
        const quantidadeTotal = Number(atividade.quantidade_total || 0);
        const quantidadeExecutadaEstimada = quantidadeTotal > 0
          ? Math.round(((quantidadeTotal * percentualExecutado) / 100) * 100) / 100
          : null;
        const quantidadeRestante = quantidadeTotal > 0
          ? Math.max(0, Math.round((quantidadeTotal - quantidadeExecutadaEstimada) * 100) / 100)
          : null;

        const sucessorasImpactadas = coletarSucessorasImpactadas(atividade.id);
        const datasAlvo = sucessorasImpactadas.map((s) => s.data_fim_planejada).filter(Boolean);
        const dataAlvo = (datasAlvo.length ? datasAlvo.sort().reverse()[0] : fimProjeto) || fimProjeto;
        const diasUteisRestantes = countDiasUteis(hoje, dataAlvo);
        const percentualRestante = Math.max(0, Math.round((100 - percentualExecutado) * 100) / 100);
        const producaoDiariaNecessaria = quantidadeRestante != null && diasUteisRestantes > 0
          ? Math.round((quantidadeRestante / diasUteisRestantes) * 100) / 100
          : null;
        const avancoDiarioNecessario = diasUteisRestantes > 0
          ? Math.round((percentualRestante / diasUteisRestantes) * 100) / 100
          : null;
        const noCaminhoCritico = caminhoCriticoSet.has(Number(atividade.id));
        const diasAtraso = Math.max(0, diffDiasCalendario(atividade.data_fim_planejada, hoje));
        const severidade = noCaminhoCritico && sucessorasImpactadas.length > 0
          ? 'critico'
          : (noCaminhoCritico || sucessorasImpactadas.length > 0 || diasAtraso >= 7 ? 'alto' : 'medio');

        return {
          id: atividade.id,
          codigo_eap: atividade.codigo_eap,
          nome: atividade.nome || atividade.codigo_eap,
          data_inicio_planejada: parseDateOnly(atividade.data_inicio_planejada),
          data_fim_planejada: parseDateOnly(atividade.data_fim_planejada),
          percentual_executado: percentualExecutado,
          percentual_restante: percentualRestante,
          quantidade_total: quantidadeTotal || null,
          unidade_medida: atividade.unidade_medida || null,
          quantidade_executada_estimada: quantidadeExecutadaEstimada,
          quantidade_restante: quantidadeRestante,
          peso_percentual_projeto: Number(atividade.peso_percentual_projeto || 0),
          status: atividade.status,
          no_caminho_critico: noCaminhoCritico,
          dias_atraso: diasAtraso,
          severidade,
          sucessoras_impactadas: sucessorasImpactadas,
          plano_recuperacao: {
            data_alvo: dataAlvo,
            dias_uteis_restantes: diasUteisRestantes,
            producao_diaria_necessaria: producaoDiariaNecessaria,
            unidade_medida: atividade.unidade_medida || null,
            avanco_diario_necessario: avancoDiarioNecessario,
            viavel_no_prazo: diasUteisRestantes > 0
          }
        };
      });

    const sugestoesResultado = ganttService.sugerirDependenciasLote(
      atividadesComDuracao,
      dependencias,
      true
    );

    const criticasAtrasadas = atividadesAtrasadas.filter((at) => at.severidade === 'critico');

    res.json({
      projeto,
      gerado_em: new Date().toISOString(),
      data_referencia: hoje,
      resumo: {
        total_atividades: atividadesComDuracao.length,
        total_atrasadas: atividadesAtrasadas.length,
        total_criticas_atrasadas: criticasAtrasadas.length,
        total_dependencias_confirmadas: dependenciasConfirmadas.length,
        total_sugestoes_dependencias: sugestoesResultado.totalSugestoes || 0,
        data_fim_planejada_projeto: fimProjeto
      },
      atividades_atrasadas: atividadesAtrasadas,
      atividades_criticas: criticasAtrasadas,
      predecessoras_pendentes: predecessorasPendentes,
      sugestoes_dependencias: sugestoesResultado.sugestoes || [],
      caminho_critico: {
        atividades_ids: caminhoCriticoInfo.caminhoCritico || [],
        data_conclusao: caminhoCriticoInfo.dataConclusao || null,
        folgas: caminhoCriticoInfo.folgas || {}
      }
    });
  } catch (error) {
    console.error('Erro ao analisar cronograma:', error);
    res.status(500).json({ erro: 'Erro ao analisar cronograma.' });
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
    const atividadesRaw = await allQuery(`
      SELECT 
        id, nome, codigo_eap, pai_id,
        data_inicio_planejada, data_fim_planejada,
        percentual_executado, peso_percentual_projeto,
        status
      FROM atividades_eap
      WHERE projeto_id = ?
      ORDER BY codigo_eap
    `, [projetoId]);
    const atividades = aplicarPercentualEfetivoEap(atividadesRaw).sort(compararCodigoEap);

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
      const caminoCriticoRaw = ganttService.calcularCaminoCritico(atividades, dependenciasConfirmadas);
      const atividadesPorId = new Map(atividades.map((at) => [Number(at.id), at]));
      caminoCritico = {
        ...caminoCriticoRaw,
        caminhoCritico: (caminoCriticoRaw.caminhoCritico || [])
          .filter((id) => !isEapConcluida(atividadesPorId.get(Number(id))))
      };
    }

    // Detectar atividades vencidas no prazo planejado. O impacto no cronograma
    // continua sendo calculado separadamente por severidade e sucessoras.
    const atividadesAtrasadas = ganttService.detectarAtividadesAtrasadas(atividades, {
      folgas: caminoCritico?.folgas || {},
      caminhoCritico: caminoCritico?.caminhoCritico || [],
      dependencias: dependenciasConfirmadas,
      exigirImpactoNoPrazo: false,
      apenasCaminhoCritico: false
    });

    // Estruturar dados para Gantt
    const dadosGantt = atividades.map(at => ({
      id: at.id,
      pai_id: at.pai_id || null,
      nome: at.nome || at.codigo_eap,
      codigo_eap: at.codigo_eap,
      data_inicio: at.data_inicio_planejada,
      data_fim: at.data_fim_planejada,
      duracao: ganttService.calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada),
      percentual_executado: at.percentual_executado || 0,
      status: at.status,
      no_caminho_critico: caminoCritico ? caminoCritico.caminhoCritico.map(Number).includes(Number(at.id)) : false,
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

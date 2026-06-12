const fs = require('fs');
const path = require('path');
const { allQuery, getQuery } = require('../config/database');
const backendPackage = require('../package.json');

const uploadsDir = path.join(__dirname, '..', 'uploads');
const logoPathCandidates = [
  path.join(__dirname, '..', '..', 'frontend', 'public', 'logo_vetor.png'),
  path.join(__dirname, '..', '..', 'frontend', 'public', 'logo_externo_vetor.png'),
  path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.svg')
];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const nl2br = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');

const fmtDate = (value) => {
  if (!value) return '-';
  const raw = String(value);
  const dt = new Date(raw.includes('T') ?raw : `${raw.slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ?escapeHtml(raw) : dt.toLocaleDateString('pt-BR');
};

const fmtDateTime = (value) => {
  if (!value) return '-';
  const dt = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(dt.getTime()) ?escapeHtml(value) : dt.toLocaleString('pt-BR');
};

const fmtNumber = (value, digits = 2) => {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '-';
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits });
};

const fmtSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '-';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
};

const isImageAttachment = (item) => {
  const tipo = String(item?.tipo || '').toLowerCase();
  const nome = String(item?.nome_arquivo || '').toLowerCase();
  return tipo.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(nome);
};

const displayRdoNumber = (rdo) => {
  const raw = String(rdo?.numero_rdo || '');
  const match = raw.match(/(\d+)$/);
  const seq = match ?Number(match[1]) : Number(rdo?.id || 1);
  return `RDO-${String(seq).padStart(3, '0')}`;
};

const safeFilenamePart = (value) => String(value || 'arquivo')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90) || 'arquivo';

const getAppBaseUrl = () => {
  const envBase = process.env.APP_BASE_URL || process.env.PUBLIC_FILE_BASE_URL || process.env.FRONTEND_URL;
  if (envBase) return String(envBase).replace(/\/$/, '');
  return `http://localhost:${process.env.PORT || 3001}`;
};

const toDataUri = (filePath, fallbackMime = 'image/jpeg') => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.svg'
      ?'image/svg+xml'
      : ext === '.png'
        ?'image/png'
        : ext === '.webp'
          ?'image/webp'
          : fallbackMime;
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch {
    return null;
  }
};

const getLogoDataUri = () => {
  const logoPath = logoPathCandidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
  return toDataUri(logoPath, 'image/png');
};

const safeAll = async (sql, params = []) => {
  try {
    return await allQuery(sql, params);
  } catch (error) {
    if (/no such table|no such column/i.test(String(error?.message || ''))) return [];
    throw error;
  }
};

const safeJsonArray = (value) => {
  try {
    const parsed = value ?JSON.parse(value) : [];
    return Array.isArray(parsed) ?parsed : [];
  } catch {
    return [];
  }
};

const getPdfVersionLabel = () => {
  const appVersion = process.env.APP_VERSION || process.env.RELEASE_VERSION || backendPackage.version || 'desconhecida';
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'local';
  return `Versão ${appVersion} (${appEnv})`;
};

const normalizeStatus = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getStatusTheme = (status) => {
  const normalized = normalizeStatus(status);
  if (normalized.includes('aprovado')) return { bg: '#dcfce7', border: '#16a34a', color: '#166534' };
  if (normalized.includes('reprovado')) return { bg: '#fee2e2', border: '#dc2626', color: '#991b1b' };
  if (normalized.includes('correcao')) return { bg: '#ffedd5', border: '#f97316', color: '#9a3412' };
  if (normalized.includes('analise')) return { bg: '#fef3c7', border: '#d97706', color: '#92400e' };
  if (normalized.includes('preenchimento')) return { bg: '#dbeafe', border: '#2563eb', color: '#1e40af' };
  return { bg: '#e0f2fe', border: '#0b5f86', color: '#0b5f86' };
};

const statusInlineStyle = (status) => {
  const theme = getStatusTheme(status);
  return `background:${theme.bg};border-color:${theme.border};color:${theme.color};`;
};

const calcularHorasColaborador = (colaborador) => {
  const toMinutes = (time) => {
    if (!time || time === '-') return null;
    const match = String(time).match(/(\d{1,2}):(\d{2})/);
    return match ?Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const entrada = toMinutes(colaborador.entrada || colaborador.horario_entrada);
  const saida = toMinutes(colaborador.saida_final || colaborador.horario_saida_final);
  const almocoInicio = toMinutes(colaborador.saida_almoco || colaborador.horario_saida_almoco);
  const almocoFim = toMinutes(colaborador.retorno_almoco || colaborador.horario_retorno_almoco);
  if (entrada == null || saida == null || saida <= entrada) return '-';
  let total = saida - entrada;
  if (almocoInicio != null && almocoFim != null && almocoFim > almocoInicio) total -= almocoFim - almocoInicio;
  return `${fmtNumber(Math.max(total, 0) / 60)} h`;
};

const tableRows = (items, renderer, emptyText, colspan) => {
  if (!items.length) return `<tr><td colspan="${colspan}" class="empty-cell">${escapeHtml(emptyText)}</td></tr>`;
  return items.map(renderer).join('');
};

async function loadRdoPdfData(id) {
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

  if (!rdo) return null;

  let responsavelNome = rdo.criado_por_nome || '-';
  try {
    const gestor = await getQuery(`
      SELECT u.nome
      FROM usuarios u
      JOIN projeto_usuarios pu ON u.id = pu.usuario_id
      WHERE pu.projeto_id = ?AND u.perfil IN ('Gestor da Obra', 'Gestor Local', 'Gestor Geral') AND COALESCE(u.ativo, 1) = 1
      ORDER BY CASE u.perfil WHEN 'Gestor da Obra' THEN 1 WHEN 'Gestor Local' THEN 2 ELSE 3 END, u.id
      LIMIT 1
    `, [rdo.projeto_id]);
    if (gestor?.nome) responsavelNome = gestor.nome;
  } catch {}

  const atividades = await safeAll(`
    SELECT ra.*, COALESCE(ae.nome, ae.descricao) AS atividade_descricao, ae.codigo_eap,
           ae.unidade_medida, ae.quantidade_total, ae.percentual_executado AS percentual_eap
    FROM rdo_atividades ra
    LEFT JOIN atividades_eap ae ON ra.atividade_eap_id = ae.id
    WHERE ra.rdo_id = ?
    ORDER BY ae.codigo_eap, ra.id
  `, [id]);

  const maoObraTabela = await safeAll(`
    SELECT rmo.*, mo.nome AS nome_colaborador, mo.funcao AS funcao_colaborador
    FROM rdo_mao_obra rmo
    LEFT JOIN mao_obra mo ON rmo.mao_obra_id = mo.id
    WHERE rmo.rdo_id = ?
    ORDER BY rmo.id
  `, [id]);

  const maoObraDetalhada = safeJsonArray(rdo.mao_obra_detalhada);
  const maoObra = maoObraDetalhada.length ?maoObraDetalhada : maoObraTabela.map((item) => ({
    nome: item.nome_colaborador || item.nome || '-',
    funcao: item.funcao_colaborador || item.funcao || '-',
    tipo: item.tipo || 'Direta',
    entrada: item.horario_entrada || '-',
    saida_almoco: item.horario_saida_almoco || '-',
    retorno_almoco: item.horario_retorno_almoco || '-',
    saida_final: item.horario_saida_final || '-'
  }));

  const fotos = await safeAll(`
    SELECT rf.*, u.nome AS autor_nome,
           ae.codigo_eap AS atividade_codigo,
           COALESCE(ae.nome, ae.descricao) AS atividade_descricao
    FROM rdo_fotos rf
    LEFT JOIN usuarios u ON u.id = rf.criado_por
    LEFT JOIN rdo_atividades ra ON ra.id = rf.rdo_atividade_id
    LEFT JOIN atividades_eap ae ON ae.id = ra.atividade_eap_id
    WHERE rf.rdo_id = ?
    ORDER BY COALESCE(rf.ordem, 0), rf.criado_em, rf.id
  `, [id]);

  const anexos = await safeAll(`
    SELECT a.*, u.nome AS usuario_nome
    FROM anexos a
    LEFT JOIN usuarios u ON u.id = a.criado_por
    WHERE a.rdo_id = ?
    ORDER BY a.criado_em ASC, a.id ASC
  `, [id]);
  const anexosDocumentais = anexos.filter((item) => !isImageAttachment(item));

  const materiais = await safeAll('SELECT * FROM rdo_materiais WHERE rdo_id = ?ORDER BY criado_em ASC, id ASC', [id]);
  const equipamentos = await safeAll('SELECT * FROM rdo_equipamentos WHERE rdo_id = ?ORDER BY id ASC', [id]);
  const clima = await safeAll('SELECT * FROM rdo_clima WHERE rdo_id = ?ORDER BY id ASC', [id]);
  const ocorrencias = await safeAll('SELECT * FROM rdo_ocorrencias WHERE rdo_id = ?ORDER BY criado_em ASC, id ASC', [id]);
  const comentarios = await safeAll(`
    SELECT rc.*, u.nome AS autor_nome
    FROM rdo_comentarios rc
    LEFT JOIN usuarios u ON u.id = rc.usuario_id
    WHERE rc.rdo_id = ?
    ORDER BY rc.criado_em ASC, rc.id ASC
  `, [id]);

  const atividadesAvulsas = safeJsonArray(rdo.atividades_avulsas);
  const atividadesPdf = [
    ...atividades.map((atividade) => {
      const total = Number(atividade.quantidade_total || 0);
      const executado = Number(atividade.quantidade_executada || 0);
      const percentualDia = total > 0
        ?Math.min(Math.round((executado / total) * 10000) / 100, 100)
        : Number(atividade.percentual_executado || 0);
      return {
        codigo: atividade.codigo_eap || '-',
        atividade: atividade.atividade_descricao || 'Atividade',
        descricao: atividade.observacao || '-',
        prevista: total,
        executada: executado,
        unidade: atividade.unidade_medida || '-',
        percentualDia,
        percentualAcumulado: Number(atividade.percentual_eap || 0)
      };
    }),
    ...atividadesAvulsas.map((atividade) => {
      const prevista = Number(atividade.quantidade_prevista || 0);
      const executada = Number(atividade.quantidade_executada || 0);
      const percentualDia = prevista > 0 ?Math.min(Math.round((executada / prevista) * 10000) / 100, 100) : 0;
      return {
        codigo: 'Avulsa',
        atividade: atividade.descricao || 'Atividade avulsa',
        descricao: atividade.observacao || '-',
        prevista,
        executada,
        unidade: atividade.unidade_medida || '-',
        percentualDia,
        percentualAcumulado: percentualDia
      };
    })
  ];

  return {
    rdo,
    responsavelNome,
    atividadesPdf,
    maoObra,
    fotos,
    anexos: anexosDocumentais,
    materiaisRecebidos: materiais.filter((item) => String(item.tipo_movimento || 'recebido') !== 'utilizado'),
    equipamentos,
    clima,
    ocorrencias,
    comentarios
  };
}

function renderHtml(data) {
  const { rdo, responsavelNome, atividadesPdf, maoObra, fotos, anexos, materiaisRecebidos, equipamentos, clima, ocorrencias, comentarios } = data;
  const displayId = displayRdoNumber(rdo);
  const logo = getLogoDataUri();
  const dataRelatorio = fmtDate(rdo.data_relatorio);
  const statusStyle = statusInlineStyle(rdo.status || 'Em preenchimento');
  const totalEquipe = Number(rdo.mao_obra_direta || 0) + Number(rdo.mao_obra_indireta || 0) + Number(rdo.mao_obra_terceiros || 0);
  const prazoFim = rdo.projeto_prazo_termino ?new Date(`${String(rdo.projeto_prazo_termino).slice(0, 10)}T00:00:00`) : null;
  const dataRdo = rdo.data_relatorio ?new Date(`${String(rdo.data_relatorio).slice(0, 10)}T00:00:00`) : new Date();
  const diasRestantes = prazoFim && !Number.isNaN(prazoFim.getTime())
    ?Math.ceil((prazoFim - dataRdo) / 86400000)
    : null;
  const horasTrabalhadas = rdo.horas_trabalhadas || maoObra.reduce((total, item) => {
    const horas = Number(String(calcularHorasColaborador(item)).replace(',', '.').replace(' h', ''));
    return Number.isFinite(horas) ?total + horas : total;
  }, 0);

  const fotoCards = fotos.map((foto) => {
    const filePath = path.join(uploadsDir, foto.caminho_arquivo || '');
    const src = toDataUri(filePath, foto.tipo || 'image/jpeg');
    const atividade = foto.atividade_descricao
      ?`${foto.atividade_codigo ?`${foto.atividade_codigo} - ` : ''}${foto.atividade_descricao}`
      : (foto.atividade_avulsa_descricao || '-');
    return `
      <article class="photo-card avoid-break">
        ${src ?`<img src="${src}" alt="${escapeHtml(foto.nome_arquivo || 'Foto do RDO')}">` : '<div class="photo-missing">Imagem não encontrada</div>'}
        <div class="photo-caption">
          <strong>${escapeHtml(foto.descricao || foto.nome_arquivo || 'Foto do RDO')}</strong>
          <span>Atividade: ${escapeHtml(atividade)}</span>
          <span>Data/Hora: ${fmtDateTime(foto.criado_em)}</span>
          <span>Autor: ${escapeHtml(foto.autor_nome || '-')}</span>
          <span>Local: -</span>
        </div>
      </article>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Segoe UI", sans-serif; color: #111827; font-size: 9pt; line-height: 1.35; }
    .page { padding: 0; }
    .brand-line { height: 4px; background: #0b5f86; margin-bottom: 10px; }
    .doc-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .doc-title img { max-height: 42px; max-width: 128px; object-fit: contain; }
    .doc-title h1 { margin: 0; font-size: 15pt; letter-spacing: .03em; color: #06263a; text-transform: uppercase; }
    .status { border: 1px solid #0b5f86; color: #0b5f86; padding: 4px 8px; border-radius: 4px; font-weight: 700; }
    .section { margin-bottom: 9px; break-inside: avoid; page-break-inside: avoid; }
    .section-title { background: #0b5f86; color: white; padding: 5px 8px; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .box { border: 1px solid #cbd5e1; border-top: 0; padding: 8px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .kpi { border: 1px solid #cbd5e1; padding: 7px; min-height: 44px; }
    .kpi strong { display: block; font-size: 14pt; color: #0b5f86; line-height: 1; margin-bottom: 4px; }
    .kpi span { color: #475569; font-size: 8pt; text-transform: uppercase; }
    .info-row { display: grid; grid-template-columns: 120px 1fr; border-bottom: 1px solid #e5e7eb; padding: 4px 0; }
    .info-row:last-child { border-bottom: 0; }
    .label { color: #475569; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; break-inside: auto; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th { background: #e2edf3; color: #0f172a; font-size: 8pt; text-transform: uppercase; text-align: left; padding: 5px; border: 1px solid #cbd5e1; }
    td { padding: 5px; border: 1px solid #d7dee8; vertical-align: top; font-size: 8.3pt; }
    .empty-cell { color: #64748b; text-align: center; padding: 10px; }
    .text-right { text-align: right; }
    .status-cell { font-weight: 700; color: #0b5f86; }
    .materials-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .summary div { border: 1px solid #cbd5e1; padding: 7px; text-align: center; }
    .summary strong { display: block; font-size: 13pt; color: #0b5f86; }
    .photo-section { break-before: auto; page-break-before: auto; }
    .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
    .photo-card { border: 1px solid #cbd5e1; display: flex; flex-direction: column; align-self: start; }
    .photo-card img { width: 100%; height: 180px; object-fit: cover; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
    .photo-missing { height: 180px; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #991b1b; border-bottom: 1px solid #e5e7eb; }
    .photo-caption { padding: 6px 7px; display: flex; flex-direction: column; gap: 1px; font-size: 7.6pt; color: #334155; }
    .comments-section { margin-top: 10px; }
    .comment-card { border: 1px solid #cbd5e1; border-left: 4px solid #0b5f86; padding: 8px 10px; margin-bottom: 7px; background: #f8fafc; break-inside: avoid; page-break-inside: avoid; }
    .comment-meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; color: #475569; font-size: 7.8pt; font-weight: 700; }
    .comment-text { color: #111827; white-space: normal; word-break: break-word; }
    .attachment-link { color: #0b5f86; text-decoration: underline; font-weight: 700; }
    .attachments-section { break-before: auto; page-break-before: auto; }
    .signature-section { display: flex; flex-direction: column; justify-content: flex-end; margin-bottom: 0; break-inside: avoid; page-break-inside: avoid; }
    .signature-footer { padding-top: 8mm; break-inside: avoid; page-break-inside: avoid; }
    .signatures { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
    .signature-line { border-top: 1px solid #111827; padding-top: 6px; text-align: center; color: #334155; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    @page { size: A4 portrait; margin: 12mm 10mm 14mm 10mm; }
  </style>
</head>
<body>
  <main class="page">
    <div class="brand-line"></div>
    <div class="doc-title avoid-break">
      <div>${logo ?`<img src="${logo}" alt="Vetor">` : '<strong>VETOR</strong>'}</div>
      <h1>Relatório Diário de Obra (RDO)</h1>
      <div class="status" style="${statusStyle}">${escapeHtml(rdo.status || 'Em preenchimento')}</div>
    </div>

    <section class="section">
      <div class="section-title">Identificação</div>
      <div class="box grid-2">
        <div>
          <div class="info-row"><span class="label">Projeto</span><span>${escapeHtml(rdo.projeto_nome || '-')}</span></div>
          <div class="info-row"><span class="label">Local</span><span>${escapeHtml(rdo.projeto_cidade || '-')}</span></div>
          <div class="info-row"><span class="label">Contratante</span><span>${escapeHtml(rdo.projeto_contratante || '-')}</span></div>
          <div class="info-row"><span class="label">Executante</span><span>${escapeHtml(rdo.projeto_executante || '-')}</span></div>
        </div>
        <div>
          <div class="info-row"><span class="label">Nº RDO</span><span>${displayId}</span></div>
          <div class="info-row"><span class="label">Data</span><span>${dataRelatorio}</span></div>
          <div class="info-row"><span class="label">Dia</span><span>${escapeHtml(rdo.dia_semana || '-')}</span></div>
          <div class="info-row"><span class="label">Responsável</span><span>${escapeHtml(responsavelNome)}</span></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">Prazos, Jornada e Indicadores</div>
      <div class="box grid-4">
        <div class="kpi"><strong>${diasRestantes == null ?'-' : diasRestantes}</strong><span>Dias restantes</span></div>
        <div class="kpi"><strong>${fmtNumber(horasTrabalhadas)}</strong><span>Horas-homem</span></div>
        <div class="kpi"><strong>${totalEquipe || maoObra.length}</strong><span>Total equipe</span></div>
        <div class="kpi"><strong>${atividadesPdf.length}</strong><span>Atividades</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">Condições Climáticas</div>
      <table>
        <thead><tr><th>Período</th><th>Clima</th><th>Praticabilidade</th><th>Pluviometria</th></tr></thead>
        <tbody>${tableRows(clima, (item) => `
          <tr><td>${escapeHtml(item.periodo || '-')}</td><td>${escapeHtml(item.condicao_tempo || '-')}</td><td>${escapeHtml(item.condicao_trabalho || '-')}</td><td>${fmtNumber(item.pluviometria_mm)} mm</td></tr>
        `, 'Nenhum registro climático informado.', 4)}</tbody>
      </table>
    </section>

    <section class="section">
      <div class="section-title">Mão de Obra (${maoObra.length})</div>
      <table>
        <thead><tr><th>Nome</th><th>Função</th><th>Categoria</th><th>Entrada</th><th>Saída Almoço</th><th>Retorno</th><th>Saída Final</th><th>Horas</th></tr></thead>
        <tbody>${tableRows(maoObra, (item) => `
          <tr>
            <td>${escapeHtml(item.nome || '-')}</td>
            <td>${escapeHtml(item.funcao || '-')}</td>
            <td>${escapeHtml(item.tipo || '-')}</td>
            <td>${escapeHtml(item.entrada || '-')}</td>
            <td>${escapeHtml(item.saida_almoco || '-')}</td>
            <td>${escapeHtml(item.retorno_almoco || '-')}</td>
            <td>${escapeHtml(item.saida_final || '-')}</td>
            <td>${calcularHorasColaborador(item)}</td>
          </tr>
        `, 'Nenhuma mão de obra informada.', 8)}</tbody>
      </table>
    </section>

    <section class="section">
      <div class="section-title">Equipamentos (${equipamentos.length})</div>
      <table>
        <thead><tr><th>Equipamento</th><th>Qtd.</th><th>Horário</th><th>Horas utilizadas</th><th>Observação</th></tr></thead>
        <tbody>${tableRows(equipamentos, (item) => `
          <tr>
            <td>${escapeHtml(item.nome || item.descricao || '-')}</td>
            <td class="text-right">${fmtNumber(item.quantidade)}</td>
            <td>${escapeHtml(item.horario_utilizacao || '-')}</td>
            <td>${fmtNumber(item.horas_utilizadas)}</td>
            <td>${escapeHtml(item.observacao || '-')}</td>
          </tr>
        `, 'Nenhum equipamento informado.', 5)}</tbody>
      </table>
    </section>

    <section class="section">
      <div class="section-title">Atividades Executadas (${atividadesPdf.length})</div>
      <table>
        <thead><tr><th>Código</th><th>Atividade</th><th>Descrição executada</th><th>Prev.</th><th>Exec.</th><th>Un.</th><th>% dia</th><th>% acum.</th><th>Status</th></tr></thead>
        <tbody>${tableRows(atividadesPdf, (item) => {
          const acumulado = Number(item.percentualAcumulado || 0);
          const status = acumulado >= 100 ?'Concluída' : acumulado > 0 ?'Em andamento' : 'Não iniciada';
          return `
            <tr>
              <td>${escapeHtml(item.codigo)}</td>
              <td>${escapeHtml(item.atividade)}</td>
              <td>${escapeHtml(item.descricao)}</td>
              <td class="text-right">${fmtNumber(item.prevista)}</td>
              <td class="text-right">${fmtNumber(item.executada)}</td>
              <td>${escapeHtml(item.unidade)}</td>
              <td class="text-right">${fmtNumber(item.percentualDia)}%</td>
              <td class="text-right">${fmtNumber(item.percentualAcumulado)}%</td>
              <td class="status-cell">${status}</td>
            </tr>
          `;
        }, 'Nenhuma atividade informada.', 9)}</tbody>
      </table>
    </section>

    <section class="section">
      <div class="section-title">Materiais Recebidos</div>
      <table>
        <thead><tr><th>Material</th><th>Qtd.</th><th>Un.</th><th>NF</th></tr></thead>
        <tbody>${tableRows(materiaisRecebidos, (item) => `<tr><td>${escapeHtml(item.nome_material || '-')}</td><td class="text-right">${fmtNumber(item.quantidade)}</td><td>${escapeHtml(item.unidade || '-')}</td><td>${escapeHtml(item.numero_nf || '-')}</td></tr>`, 'Nenhum material recebido.', 4)}</tbody>
      </table>
    </section>

    <section class="section">
      <div class="section-title">Ocorrências</div>
      <table>
        <thead><tr><th>Título</th><th>Gravidade</th><th>Descrição</th></tr></thead>
        <tbody>${tableRows(ocorrencias, (item) => `<tr><td>${escapeHtml(item.titulo || 'Ocorrência')}</td><td>${escapeHtml(item.gravidade || '-')}</td><td>${nl2br(item.descricao || '-')}</td></tr>`, 'Nenhuma ocorrência informada.', 3)}</tbody>
      </table>
    </section>

    <section class="section">
      <div class="section-title">Resumo de Evidências e Anexos</div>
      <div class="box summary">
        <div><strong>${fotos.length}</strong><span>Fotos</span></div>
        <div><strong>${anexos.length}</strong><span>Anexos</span></div>
        <div><strong>${equipamentos.length}</strong><span>Equipamentos</span></div>
        <div><strong>${atividadesPdf.length}</strong><span>Atividades</span></div>
      </div>
    </section>

    <section class="section photo-section">
      <div class="section-title">Relatório Fotográfico (${fotos.length})</div>
      ${fotos.length ?`<div class="photo-grid">${fotoCards}</div>` : '<div class="box empty-cell">Nenhuma foto persistida para este RDO.</div>'}
    </section>

    ${(rdo.observacoes || rdo.obs_geral || rdo.comentarios || comentarios.length) ?`
      <section class="section comments-section">
        <div class="section-title">Comentários</div>
        ${rdo.observacoes || rdo.obs_geral || rdo.comentarios ?`
          <div class="comment-card">
            <div class="comment-meta"><span>Comentário geral do RDO</span><span>${dataRelatorio}</span></div>
            <div class="comment-text">${nl2br(rdo.observacoes || rdo.obs_geral || rdo.comentarios)}</div>
          </div>
        ` : ''}
        ${comentarios.map((item) => `
          <div class="comment-card">
            <div class="comment-meta"><span>${escapeHtml(item.autor_nome || 'Usuário')}</span><span>${fmtDateTime(item.criado_em)}</span></div>
            <div class="comment-text">${nl2br(item.comentario || '')}</div>
          </div>
        `).join('')}
      </section>
    ` : ''}

    <section class="section attachments-section">
      <div class="section-title">Anexos (${anexos.length})</div>
      <table>
        <thead><tr><th>Nome do arquivo</th><th>Tipo</th><th>Tamanho</th><th>Data de envio</th><th>Usuário</th><th>Descrição</th></tr></thead>
        <tbody>${tableRows(anexos, (item) => `
          <tr>
            <td><a class="attachment-link" href="${getAppBaseUrl()}/api/anexos/download/${encodeURIComponent(item.id)}">${escapeHtml(item.nome_arquivo || 'Arquivo')}</a></td>
            <td>${escapeHtml(item.tipo || path.extname(item.nome_arquivo || '').replace('.', '').toUpperCase() || '-')}</td>
            <td>${fmtSize(item.tamanho)}</td>
            <td>${fmtDateTime(item.criado_em)}</td>
            <td>${escapeHtml(item.usuario_nome || '-')}</td>
            <td>${escapeHtml(item.descricao || '-')}</td>
          </tr>
        `, 'Nenhum anexo persistido para este RDO.', 6)}</tbody>
      </table>
    </section>

    <section class="section signature-section avoid-break">
      <div class="signature-footer">
        <div class="signatures">
          <div class="signature-line">Responsável pelo preenchimento</div>
          <div class="signature-line">Aprovação / Fiscalização</div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function renderWithPuppeteer(html, rdo, displayId) {
  const puppeteer = require('puppeteer');
  const browserCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.BROWSER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);
  const executablePath = browserCandidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: executablePath || undefined,
      timeout: 60000,
      protocolTimeout: 120000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch {}
      }
      const images = Array.from(document.images || []);
      await Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 5000);
        });
      }));
    });
    await page.evaluate(() => {
      const signatureSection = document.querySelector('.signature-section');
      if (!signatureSection) return;

      signatureSection.style.paddingTop = '0';

      const pxPerMm = 96 / 25.4;
      const printablePageHeight = (297 - 12 - 14) * pxPerMm;
      const bottomGap = 5 * pxPerMm;
      const maxPadding = 42 * pxPerMm;
      const rect = signatureSection.getBoundingClientRect();
      const sectionBottom = window.scrollY + rect.top + rect.height;
      const usedOnPage = sectionBottom % printablePageHeight;
      const remainingOnPage = printablePageHeight - usedOnPage;

      if (remainingOnPage > bottomGap && remainingOnPage < printablePageHeight - bottomGap) {
        signatureSection.style.paddingTop = `${Math.min(remainingOnPage - bottomGap, maxPadding)}px`;
      }
    });

    const headerStatusStyle = statusInlineStyle(rdo.status || '-');
    const headerTemplate = `
      <div style="font-size:7px;color:#334155;width:100%;padding:0 38px;font-family:Arial,sans-serif;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d7dee8;height:22px;">
        <span><strong>VETOR</strong> | ${escapeHtml(rdo.projeto_nome || '-')}</span>
        <span>${displayId} | ${fmtDate(rdo.data_relatorio)} | <span style="display:inline-block;border:1px solid #0b5f86;border-radius:3px;padding:1px 4px;font-weight:700;${headerStatusStyle}">${escapeHtml(rdo.status || '-')}</span></span>
      </div>
    `;
    const footerTemplate = `
      <div style="font-size:7px;color:#64748b;width:100%;padding:0 38px;font-family:Arial,sans-serif;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #d7dee8;height:22px;">
        <span>${escapeHtml(rdo.projeto_nome || '-')} | ${displayId} | Gerado em ${new Date().toLocaleString('pt-BR')} | ${escapeHtml(getPdfVersionLabel())}</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    `;

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: '12mm', right: '10mm', bottom: '14mm', left: '10mm' }
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

async function renderFallbackPdf(data, reason) {
  const PDFDocument = require('pdfkit');
  const displayId = displayRdoNumber(data.rdo);
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.font('Helvetica-Bold').fontSize(16).text('Relatório Diário de Obra');
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(9).fillColor('#991b1b').text(`Modo compatibilidade: ${String(reason || '').slice(0, 180)}`);
  doc.fillColor('#111827').moveDown();
  doc.font('Helvetica-Bold').fontSize(11).text(`${displayId} - ${data.rdo.projeto_nome || '-'}`);
  doc.font('Helvetica').fontSize(10).text(`Data: ${fmtDate(data.rdo.data_relatorio)}`);
  doc.text(`Status: ${data.rdo.status || '-'}`);
  doc.text(`Responsável: ${data.responsavelNome || '-'}`);
  doc.moveDown();
  doc.font('Helvetica-Bold').fontSize(11).text(`Atividades (${data.atividadesPdf.length})`);
  doc.font('Helvetica').fontSize(9);
  data.atividadesPdf.forEach((atividade) => {
    if (doc.y > 760) doc.addPage();
    doc.text(`${atividade.codigo} - ${atividade.atividade}: ${fmtNumber(atividade.executada)} ${atividade.unidade} (${fmtNumber(atividade.percentualDia)}%)`);
  });
  doc.moveDown();
  doc.font('Helvetica-Bold').fontSize(11).text(`Fotos persistidas: ${data.fotos.length}`);
  doc.text(`Anexos persistidos: ${data.anexos.length}`);
  doc.end();
  return done;
}

async function generateRdoPdfBuffer(rdoId) {
  const data = await loadRdoPdfData(rdoId);
  if (!data) {
    const error = new Error('RDO não encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const displayId = displayRdoNumber(data.rdo);
  const filename = `${safeFilenamePart(displayId)} ${safeFilenamePart(data.rdo.projeto_nome || 'obra')}.pdf`;
  const html = renderHtml(data);
  try {
    return {
      buffer: await renderWithPuppeteer(html, data.rdo, displayId),
      filename,
      engine: 'puppeteer'
    };
  } catch (error) {
    return {
      buffer: await renderFallbackPdf(data, error.message),
      filename,
      engine: 'pdfkit-fallback',
      fallbackReason: String(error.message || 'erro_desconhecido').slice(0, 240)
    };
  }
}

module.exports = {
  generateRdoPdfBuffer
};

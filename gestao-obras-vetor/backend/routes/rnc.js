const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

const normalizeUploadPath = (rawPath) => {
  if (rawPath == null) return '';
  const text = String(rawPath).trim();
  if (!text) return '';
  return text
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^uploads\//i, '');
};

const safeEncodePath = (rawPath) => {
  try {
    return encodeURI(normalizeUploadPath(rawPath));
  } catch (_) {
    return '';
  }
};

const safeText = (value, fallback = '—') => {
  if (value == null) return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return fallback;
  return text;
};

const PDF_TIME_ZONE = process.env.PDF_TIME_ZONE || process.env.APP_TIME_ZONE || 'America/Sao_Paulo';

const formatDateTimeBr = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: PDF_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
};

const formatDateBr = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: PDF_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

const isImageByNameOrMime = (item) => {
  const mime = String(item?.tipo || '').toLowerCase();
  const name = String(item?.nome_arquivo || '').toLowerCase();
  return mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(name);
};

const canEmbedInPdf = (item) => {
  const mime = String(item?.tipo || '').toLowerCase();
  const name = String(item?.nome_arquivo || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg') || mime.includes('png')) return true;
  return /\.(jpg|jpeg|png)$/.test(name);
};

const extractLegacyRegistroFotos = (rawValue) => {
  if (!rawValue) return [];

  const collectPath = (entry) => {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
      return entry.caminho_arquivo || entry.path || entry.url || entry.src || entry.nome_arquivo || '';
    }
    return '';
  };

  let items = [];
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed && typeof parsed === 'object') {
        items = [parsed];
      }
    } catch (_) {
      items = trimmed.split(/[\n,;]+/g);
    }
  } else if (Array.isArray(rawValue)) {
    items = rawValue;
  }

  const result = [];
  for (const item of items) {
    const candidate = collectPath(item);
    if (!candidate) continue;
    const normalized = normalizeUploadPath(candidate);
    if (!normalized) continue;
    if (!/\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(normalized)) continue;

    result.push({
      tipo: 'image/legacy',
      nome_arquivo: path.basename(normalized),
      caminho_arquivo: normalized,
      categoria: 'registro'
    });
  }

  return result;
};

const ensureRncAnexosSchema = async () => {
  // Compatibilidade com bancos legados/tenant que ainda não possuem colunas de RNC.
  try {
    await runQuery('ALTER TABLE anexos ADD COLUMN rnc_id INTEGER');
  } catch (_) { /* coluna já existe */ }
  try {
    await runQuery("ALTER TABLE anexos ADD COLUMN categoria TEXT DEFAULT 'registro'");
  } catch (_) { /* coluna já existe */ }
};
// Gerar PDF da RNC (puppeteer — HTML → PDF com layout rico)
router.get('/:id/pdf', auth, async (req, res) => {
  const puppeteer = require('puppeteer');
  let browser;
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });

    await ensureRncAnexosSchema();

    const rnc = await getQuery(`
      SELECT r.*, p.nome AS projeto_nome, u.nome AS criado_por_nome, g.nome AS responsavel_nome, rd.data_relatorio AS rdo_data
      FROM rnc r
      LEFT JOIN projetos p ON r.projeto_id = p.id
      LEFT JOIN usuarios u ON r.criado_por = u.id
      LEFT JOIN usuarios g ON r.responsavel_id = g.id
      LEFT JOIN rdos rd ON r.rdo_id = rd.id
      WHERE r.id = ?
    `, [id]);
    if (!rnc) return res.status(404).json({ erro: 'RNC não encontrada.' });

    const port = process.env.PORT || 3001;
    const fotoUrl = (caminho) => {
      const norm = normalizeUploadPath(caminho);
      return norm ? `http://127.0.0.1:${port}/uploads/${encodeURIComponent(norm)}` : '';
    };

    const anexos = await allQuery('SELECT * FROM anexos WHERE rnc_id = ? ORDER BY criado_em ASC', [id]);
    const legacyFotos = extractLegacyRegistroFotos(rnc.registros_fotograficos);
    const merged = [...anexos];
    for (const lf of legacyFotos) {
      if (!merged.some(a => normalizeUploadPath(a.caminho_arquivo) === normalizeUploadPath(lf.caminho_arquivo))) merged.push(lf);
    }
    const fotos = merged.filter(a => a.categoria !== 'correcao' && isImageByNameOrMime(a));
    const fotosCorrecao = merged.filter(a => a.categoria === 'correcao' && isImageByNameOrMime(a));
    const anexosNaoImagem = merged.filter((a) => !isImageByNameOrMime(a));

    const statusMap = {
      'Aberta': { label: 'Aberta', cls: 'aberta' },
      'Em andamento': { label: 'Aberta', cls: 'aberta' },
      'Em análise': { label: 'Em aprovação', cls: 'analise' },
      'Encerrada': { label: 'Encerrada', cls: 'encerrada' },
      'Reprovada': { label: 'Reprovada', cls: 'reprovada' },
    };
    const sm = statusMap[rnc.status] || { label: rnc.status, cls: 'aberta' };

    const gravCls = (() => {
      const g = (rnc.gravidade || '').toLowerCase();
      if (g.includes('cr')) return 'critica';
      if (g === 'alta') return 'alta';
      if (g.includes('m')) return 'media';
      return 'baixa';
    })();

    const activeStep = (() => {
      if (rnc.status === 'Em análise') return 2;
      if (rnc.status === 'Encerrada') return 3;
      return 1;
    })();
    const rdoLabel = rnc.rdo_id ? `RDO #${rnc.rdo_id}${rnc.rdo_data ? ` - ${formatDateBr(rnc.rdo_data)}` : ''}` : 'Não vinculado';

    const stepHtml = (idx, label) => {
      const state = idx < activeStep ? 'done' : idx === activeStep ? 'active' : 'pending';
      const circle = state === 'done' ? '✓' : state === 'active' ? '●' : '○';
      return `<div class="prog-step">
        <div class="prog-circle prog-${state}">${circle}</div>
        <span class="prog-label ${state === 'active' ? 'prog-label-active' : ''}">${label}</span>
      </div>`;
    };
    const lineHtml = (idx) => `<div class="prog-line ${idx < activeStep ? 'prog-line-done' : ''}"></div>`;

    const escape = (v) => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const nl2br = (v) => escape(v).replace(/\n/g, '<br>');

    const photoGridHtml = (photos) => photos.length === 0 ? '' : `
      <div class="photo-grid">
        ${photos.map(f => `<div class="photo-item">
          <img src="${fotoUrl(f.caminho_arquivo)}" alt="${escape(f.nome_arquivo)}" onerror="this.style.display='none'" />
          <div class="photo-name">${escape(f.nome_arquivo)}</div>
        </div>`).join('')}
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }

  .header { background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); color: #fff; padding: 22px 32px; }
  .header-crumb { font-size: 10px; color: rgba(255,255,255,.65); margin-bottom: 6px; }
  .header-title { font-size: 20px; font-weight: 700; margin-bottom: 10px; }
  .header-badges { display: flex; gap: 8px; flex-wrap: wrap; }
  .header-meta { margin-top: 12px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .header-meta-item { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22); border-radius: 8px; padding: 8px 10px; }
  .header-meta-label { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: rgba(255,255,255,.74); margin-bottom: 3px; }
  .header-meta-value { font-size: 11px; font-weight: 600; color: #fff; word-break: break-word; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 600; }
  .s-aberta    { background: #2563eb; color: #fff; }
  .s-analise   { background: #d97706; color: #fff; }
  .s-encerrada { background: #16a34a; color: #fff; }
  .s-reprovada { background: #dc2626; color: #fff; }
  .g-critica { background: #dc2626; color: #fff; }
  .g-alta    { background: #f97316; color: #fff; }
  .g-media   { background: #f59e0b; color: #fff; }
  .g-baixa   { background: #22c55e; color: #fff; }
  .b-origem  { background: rgba(255,255,255,.2); color: #fff; }

  .progress { display: flex; align-items: center; padding: 14px 32px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .prog-step { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 0 0 auto; }
  .prog-circle { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
  .prog-done    { background: #16a34a; color: #fff; }
  .prog-active  { background: #2563eb; color: #fff; }
  .prog-pending { background: #e2e8f0; color: #94a3b8; }
  .prog-label { font-size: 9px; color: #64748b; }
  .prog-label-active { color: #2563eb; font-weight: 700; }
  .prog-line { flex: 1; height: 2px; background: #e2e8f0; margin: 0 4px 14px; }
  .prog-line-done { background: #16a34a; }

  .body { display: block; padding: 18px 32px; }
  .main { display: flex; flex-direction: column; gap: 12px; }

  .card { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
  .card-head { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f1f5f9; background: #fafafa; }
  .card-icon { width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .i-red   { background: #fee2e2; }
  .i-blue  { background: #dbeafe; }
  .i-green { background: #dcfce7; }
  .i-teal  { background: #ccfbf1; }
  .i-amber { background: #fef3c7; }
  .card-head h3 { font-size: 12px; font-weight: 700; color: #0f172a; flex: 1; }
  .card-body { padding: 12px 14px; }
  .card-blue  { border-color: #bfdbfe; }
  .card-blue  .card-head { background: #dbeafe; border-bottom-color: #bfdbfe; }
  .card-green { border-color: #bbf7d0; }
  .card-green .card-head { background: #dcfce7; border-bottom-color: #bbf7d0; }

  .desc { font-size: 11px; line-height: 1.65; color: #374151; }
  .label-small { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #64748b; margin: 0 0 4px; }
  .inline-info { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #64748b; margin-top: 7px; }
  .inline-info strong { color: #374151; }

  .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
  .summary-item { padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }
  .summary-label { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; margin-bottom: 4px; }
  .summary-value { font-size: 11px; font-weight: 600; color: #0f172a; word-break: break-word; }

  .photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
  .photo-item { border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid; }
  .photo-item img { width: 100%; height: 145px; object-fit: cover; display: block; background: #f8fafc; }
  .photo-name { padding: 4px 6px; font-size: 9px; color: #64748b; background: #f8fafc; }

  .tl-item { display: flex; gap: 8px; margin-bottom: 10px; }
  .tl-track { display: flex; flex-direction: column; align-items: center; }
  .tl-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
  .tl-line { width: 1px; flex: 1; background: #e2e8f0; margin-top: 3px; }
  .tl-content { flex: 1; }
  .tl-label { font-size: 10px; font-weight: 600; color: #0f172a; }
  .tl-date  { font-size: 9px; color: #94a3b8; }
  .tl-detail { font-size: 9px; color: #64748b; margin-top: 2px; }

  .attachments-list { margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
  .attachments-list li { font-size: 10px; color: #475569; margin-bottom: 4px; }
  .footer { margin: 12px 32px 8px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 9px; color: #94a3b8; }
  @page { size: A4; margin: 10mm 8mm 12mm 8mm; }
</style>
</head>
<body>

<div class="header">
  <div class="header-crumb">RNC #${id} &nbsp;·&nbsp; ${escape(rnc.projeto_nome)}</div>
  <div class="header-title">${escape(rnc.titulo)}</div>
  <div class="header-badges">
    <span class="badge s-${sm.cls}">${sm.label}</span>
    ${rnc.gravidade ? `<span class="badge g-${gravCls}">${escape(rnc.gravidade)}</span>` : ''}
    ${rnc.origem ? `<span class="badge b-origem">${escape(rnc.origem)}</span>` : ''}
  </div>
  <div class="header-meta">
    <div class="header-meta-item"><div class="header-meta-label">Responsável</div><div class="header-meta-value">${escape(rnc.responsavel_nome || 'Não definido')}</div></div>
    <div class="header-meta-item"><div class="header-meta-label">RDO vinculado</div><div class="header-meta-value">${escape(rdoLabel)}</div></div>
    <div class="header-meta-item"><div class="header-meta-label">Área afetada</div><div class="header-meta-value">${escape(rnc.area_afetada || 'Não informado')}</div></div>
    <div class="header-meta-item"><div class="header-meta-label">Prazo</div><div class="header-meta-value">${escape(rnc.data_prevista_encerramento ? formatDateBr(rnc.data_prevista_encerramento) : 'Não definido')}</div></div>
    <div class="header-meta-item"><div class="header-meta-label">Aberta em</div><div class="header-meta-value">${escape(formatDateBr(rnc.criado_em))}</div></div>
    <div class="header-meta-item"><div class="header-meta-label">Encerrada em</div><div class="header-meta-value">${escape(rnc.resolvido_em ? formatDateBr(rnc.resolvido_em) : '—')}</div></div>
    <div class="header-meta-item"><div class="header-meta-label">Aberta por</div><div class="header-meta-value">${escape(rnc.criado_por_nome || 'Não informado')}</div></div>
    <div class="header-meta-item"><div class="header-meta-label">Norma/Ref.</div><div class="header-meta-value">${escape(rnc.norma_referencia || 'N/A')}</div></div>
  </div>
</div>

<div class="progress">
  ${stepHtml(0, 'Registro')}
  ${lineHtml(0)}
  ${stepHtml(1, 'Correção')}
  ${lineHtml(1)}
  ${stepHtml(2, 'Aprovação')}
  ${lineHtml(2)}
  ${stepHtml(3, 'Encerrada')}
</div>

<div class="body">
  <div class="main">

    <div class="card">
      <div class="card-head"><div class="card-icon i-amber">📌</div><h3>Resumo da ocorrência</h3></div>
      <div class="card-body">
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-label">Projeto</div><div class="summary-value">${escape(rnc.projeto_nome)}</div></div>
          <div class="summary-item"><div class="summary-label">RDO vinculado</div><div class="summary-value">${escape(rdoLabel)}</div></div>
          <div class="summary-item"><div class="summary-label">Responsável</div><div class="summary-value">${escape(rnc.responsavel_nome || 'Não definido')}</div></div>
          <div class="summary-item"><div class="summary-label">Prazo de correção</div><div class="summary-value">${escape(rnc.data_prevista_encerramento ? formatDateBr(rnc.data_prevista_encerramento) : 'Não definido')}</div></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-icon i-red">⚠</div><h3>Não Conformidade</h3></div>
      <div class="card-body">
        <p class="desc">${nl2br(rnc.descricao)}</p>
        ${rnc.norma_referencia ? `<div class="inline-info">ℹ <span>Norma/Referência: <strong>${escape(rnc.norma_referencia)}</strong></span></div>` : ''}
      </div>
    </div>

    ${rnc.acao_corretiva ? `<div class="card card-blue">
      <div class="card-head"><div class="card-icon i-blue">🔧</div><h3>O que deve ser corrigido</h3></div>
      <div class="card-body">
        <p class="desc">${nl2br(rnc.acao_corretiva)}</p>
        ${rnc.responsavel_nome ? `<div class="inline-info">👤 <span>Responsável: <strong>${escape(rnc.responsavel_nome)}</strong></span></div>` : ''}
        ${rnc.data_prevista_encerramento ? `<div class="inline-info">📅 <span>Prazo: <strong>${formatDateBr(rnc.data_prevista_encerramento)}</strong></span></div>` : ''}
      </div>
    </div>` : ''}

    ${fotos.length > 0 ? `<div class="card">
      <div class="card-head"><div class="card-icon i-teal">📷</div><h3>Evidências fotográficas (${fotos.length})</h3></div>
      <div class="card-body">${photoGridHtml(fotos)}</div>
    </div>` : ''}

    ${rnc.descricao_correcao ? `<div class="card card-green">
      <div class="card-head"><div class="card-icon i-green">✓</div><h3>Correção realizada</h3></div>
      <div class="card-body">
        <p class="label-small">Resposta:</p>
        <p class="desc">${nl2br(rnc.descricao_correcao)}</p>
        ${fotosCorrecao.length > 0 ? `<p class="label-small" style="margin-top:10px">Galeria da correção:</p>${photoGridHtml(fotosCorrecao)}` : ''}
      </div>
    </div>` : ''}

    ${anexosNaoImagem.length > 0 ? `<div class="card">
      <div class="card-head"><div class="card-icon i-teal">📎</div><h3>Anexos complementares (${anexosNaoImagem.length})</h3></div>
      <div class="card-body">
        <ul class="attachments-list">
          ${anexosNaoImagem.map((a) => `<li>${escape(a.nome_arquivo || 'arquivo')} ${a.tamanho ? `(${Math.max(1, Math.round(Number(a.tamanho || 0) / 1024))} KB)` : ''}</li>`).join('')}
        </ul>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-head"><div class="card-icon i-blue">🕓</div><h3>Histórico</h3></div>
      <div class="card-body">
        <div class="tl-item">
          <div class="tl-track"><div class="tl-dot" style="background:#2563eb"></div><div class="tl-line"></div></div>
          <div class="tl-content">
            <div class="tl-label">RNC registrada</div>
            <div class="tl-date">${formatDateTimeBr(rnc.criado_em)}</div>
            <div class="tl-detail">${escape(rnc.titulo)}</div>
          </div>
        </div>
        ${rnc.descricao_correcao ? `<div class="tl-item">
          <div class="tl-track"><div class="tl-dot" style="background:#16a34a"></div><div class="tl-line"></div></div>
          <div class="tl-content">
            <div class="tl-label">Correção registrada</div>
            <div class="tl-date">${formatDateTimeBr(rnc.atualizado_em)}</div>
            <div class="tl-detail">${escape(String(rnc.descricao_correcao || '').slice(0, 60))}${String(rnc.descricao_correcao || '').length > 60 ? '…' : ''}</div>
          </div>
        </div>` : ''}
        ${rnc.status === 'Em análise' ? `<div class="tl-item">
          <div class="tl-track"><div class="tl-dot" style="background:#d97706"></div></div>
          <div class="tl-content">
            <div class="tl-label">Enviada para aprovação</div>
            <div class="tl-date">${formatDateTimeBr(rnc.atualizado_em)}</div>
          </div>
        </div>` : ''}
        ${rnc.status === 'Encerrada' ? `<div class="tl-item">
          <div class="tl-track"><div class="tl-dot" style="background:#16a34a"></div></div>
          <div class="tl-content">
            <div class="tl-label">RNC encerrada</div>
            <div class="tl-date">${formatDateTimeBr(rnc.atualizado_em)}</div>
          </div>
        </div>` : ''}
        ${rnc.status === 'Reprovada' ? `<div class="tl-item">
          <div class="tl-track"><div class="tl-dot" style="background:#dc2626"></div></div>
          <div class="tl-content">
            <div class="tl-label">Correção reprovada</div>
            <div class="tl-date">${formatDateTimeBr(rnc.atualizado_em)}</div>
          </div>
        </div>` : ''}
      </div>
    </div>

  </div>
</div>

<div class="footer">
  Gerado em: ${formatDateTimeBr(new Date())} &nbsp;·&nbsp; RNC #${id} &nbsp;·&nbsp; ${escape(rnc.projeto_nome || '')}
</div>

</body>
</html>`;

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
    const executablePath = browserCandidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

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
      const imgs = Array.from(document.images || []);
      await Promise.all(imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 5000);
        });
      }));
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:8px;color:#94a3b8;padding:0 40px;width:100%;box-sizing:border-box;display:flex;justify-content:space-between;font-family:'Segoe UI',Arial,sans-serif;align-items:center"><span>RNC #${id} &nbsp;·&nbsp; ${safeText(rnc.projeto_nome, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span><span>Pág. <span class="pageNumber"></span>&nbsp;/&nbsp;<span class="totalPages"></span></span></div>`,
      margin: { top: '8mm', bottom: '10mm', left: '0', right: '0' }
    });

    await browser.close();
    browser = null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="RNC-${id}.pdf"`);
    res.setHeader('X-PDF-Engine', 'puppeteer');
    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    console.error('Erro ao gerar PDF da RNC:', error);
    if (!res.headersSent) {
      return res.status(500).json({ erro: 'Erro ao gerar PDF da RNC: ' + (error?.message || 'erro desconhecido') });
    }
  }
});

// Listar RNC por projeto (tenant-aware)
router.get('/projeto/:projetoId', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });
    // Verifica se o projeto pertence ao tenant
    const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projetoId, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }
    const lista = await allQuery(`
      SELECT r.*, u.nome AS criado_por_nome, g.nome AS responsavel_nome, rd.data_relatorio AS rdo_data
      FROM rnc r
      LEFT JOIN usuarios u ON r.criado_por = u.id
      LEFT JOIN usuarios g ON r.responsavel_id = g.id
      LEFT JOIN rdos rd ON r.rdo_id = rd.id
      WHERE r.projeto_id = ?
      ORDER BY r.criado_em DESC
    `, [projetoId]);
    res.json(lista);
  } catch (error) {
    console.error('Erro ao listar RNC:', error);
    res.status(500).json({ erro: 'Erro ao listar RNC.' });
  }
});

// Criar RNC (tenant-aware)
router.post('/', auth, [
  body('projeto_id').isInt(),
  body('titulo').trim().notEmpty(),
  body('descricao').trim().notEmpty(),
  body('gravidade').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const campos = errors.array().map(e => e.path || e.param).join(', ');
      return res.status(400).json({ erro: `Dados inválidos: campos obrigatórios não preenchidos (${campos}).` });
    }

    const {
      projeto_id,
      rdo_id,
      titulo,
      descricao,
      gravidade,
      acao_corretiva,
      responsavel_id,
      data_prevista_encerramento,
      origem,
      area_afetada,
      norma_referencia,
      registros_fotograficos
    } = req.body;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });
    // Verifica se o projeto pertence ao tenant
    const projeto = await getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projeto_id, tenantId]);
    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }

    const result = await runQuery(`
      INSERT INTO rnc (
        projeto_id, rdo_id, titulo, descricao, gravidade, status, acao_corretiva, responsavel_id,
        data_prevista_encerramento, origem, area_afetada, norma_referencia, registros_fotograficos, criado_por
      )
      VALUES (?, ?, ?, ?, ?, 'Aberta', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projeto_id,
      rdo_id || null,
      titulo,
      descricao,
      gravidade,
      acao_corretiva || null,
      responsavel_id || null,
      data_prevista_encerramento || null,
      origem || null,
      area_afetada || null,
      norma_referencia || null,
      registros_fotograficos || null,
      req.usuario.id
    ]);

    await registrarAuditoria('rnc', result.lastID, 'CREATE', null, req.body, req.usuario.id);

    // Notificar responsável, se definido
    if (responsavel_id) {
      try {
        await runQuery(
          'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
          [responsavel_id, 'rnc_atribuida', `Você foi atribuído como responsável da RNC #${result.lastID}.`, 'rnc', result.lastID]
        );
      } catch (e) {
        console.warn('Falha ao registrar notificação de responsável RNC:', e?.message || e);
      }
    }

    res.status(201).json({ mensagem: 'RNC criada com sucesso.', id: result.lastID });
  } catch (error) {
    console.error('Erro ao criar RNC:', error);
    res.status(500).json({ erro: 'Erro ao criar RNC.' });
  }
});

// Atualizar RNC
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);

    if (!rncAtual) {
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }

    // Impedir edição se RNC está encerrada
    if (rncAtual.status === 'Encerrada') {
      return res.status(403).json({ erro: 'Não é possível editar uma RNC encerrada.' });
    }

    const uid = String(req.usuario?.id ?? '');
    if (uid !== String(rncAtual.criado_por ?? '') && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Sem permissão para editar esta RNC.' });
    }

    const {
      titulo,
      descricao,
      gravidade,
      status,
      acao_corretiva,
      descricao_correcao,
      responsavel_id,
      rdo_id,
      data_prevista_encerramento,
      origem,
      area_afetada,
      norma_referencia,
      registros_fotograficos
    } = req.body;

    // Detectar mudança de responsável para notificar
    const novoResponsavel = responsavel_id ?? rncAtual.responsavel_id;

    await runQuery(`
      UPDATE rnc SET
        titulo = ?,
        descricao = ?,
        gravidade = ?,
        status = ?,
        acao_corretiva = ?,
        descricao_correcao = ?,
        responsavel_id = ?,
        rdo_id = ?,
        data_prevista_encerramento = ?,
        origem = ?,
        area_afetada = ?,
        norma_referencia = ?,
        registros_fotograficos = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      titulo,
      descricao,
      gravidade,
      status,
      acao_corretiva || null,
      descricao_correcao || rncAtual.descricao_correcao || null,
      responsavel_id || null,
      rdo_id || null,
      data_prevista_encerramento || null,
      origem || null,
      area_afetada || null,
      norma_referencia || null,
      registros_fotograficos || null,
      id
    ]);

    const novo = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    await registrarAuditoria('rnc', id, 'UPDATE', rncAtual, novo, req.usuario.id);

    // Se responsável mudou, notificar novo responsável
    if (rncAtual.responsavel_id !== novo.responsavel_id && novo.responsavel_id) {
      try {
        await runQuery(
          'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
          [novo.responsavel_id, 'rnc_atribuida', `Você foi atribuído como responsável da RNC #${id}.`, 'rnc', id]
        );
      } catch (e) {
        console.warn('Falha ao registrar notificação de mudança de responsável:', e?.message || e);
      }
    }

    res.json({ mensagem: 'RNC atualizada.' });
  } catch (error) {
    console.error('Erro ao atualizar RNC:', error);
    res.status(500).json({ erro: 'Erro ao atualizar RNC.' });
  }
});

// Alterar status
// Alterar status (somente gestor)
router.patch('/:id/status', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validos = ['Aberta', 'Em andamento', 'Encerrada', 'Reprovada', 'Em análise'];

    if (!validos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    if (!rncAtual) {
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }

    const resolvidoEm = status === 'Encerrada' ? new Date().toISOString() : null;

    await runQuery(
      'UPDATE rnc SET status = ?, resolvido_em = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [status, resolvidoEm, id]
    );

    await registrarAuditoria('rnc', id, 'STATUS_CHANGE', rncAtual, { status }, req.usuario.id);

    res.json({ mensagem: 'Status atualizado.' });
  } catch (error) {
    console.error('Erro ao alterar status da RNC:', error);
    res.status(500).json({ erro: 'Erro ao alterar status.' });
  }
});

// Enviar RNC para aprovação (criador ou responsável)
router.post('/:id/enviar-aprovacao', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    if (!rncAtual) return res.status(404).json({ erro: 'RNC não encontrada.' });

    // somente criador ou responsável podem enviar para aprovação
    const uid = String(req.usuario?.id ?? '');
    const podeEnviar = uid === String(rncAtual.criado_por ?? '') || uid === String(rncAtual.responsavel_id ?? '') || Boolean(req.usuario?.is_gestor);
    if (!podeEnviar) {
      return res.status(403).json({ erro: 'Sem permissão para enviar para aprovação.' });
    }

    await runQuery('UPDATE rnc SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', ['Em análise', id]);
    await registrarAuditoria('rnc', id, 'ENVIADO_APROVACAO', rncAtual, { por: req.usuario.id }, req.usuario.id);

    // Notificar gestor(es) que há RNC para aprovação (opcional simples: todos gestores)
    try {
      const gestores = await allQuery('SELECT id FROM usuarios WHERE is_gestor = 1');
      for (const g of gestores) {
        await runQuery(
          'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
          [g.id, 'rnc_para_aprovacao', `RNC #${id} foi enviada para aprovação.`, 'rnc', id]
        );
      }
    } catch (e) {
      console.warn('Falha ao notificar gestores sobre aprovação de RNC:', e?.message || e);
    }

    res.json({ mensagem: 'RNC enviada para aprovação.' });
  } catch (error) {
    console.error('Erro ao enviar RNC para aprovação:', error);
    res.status(500).json({ erro: 'Erro ao enviar para aprovação.' });
  }
});

// Deletar RNC (somente gestor)
router.delete('/:id', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);

    if (!rncAtual) {
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }

    // Impedir deleção se RNC está encerrada
    if (rncAtual.status === 'Encerrada') {
      return res.status(403).json({ erro: 'Não é possível deletar uma RNC encerrada. Use a visualização para consultar.' });
    }

    await runQuery('DELETE FROM rnc WHERE id = ?', [id]);
    await registrarAuditoria('rnc', id, 'DELETE', rncAtual, null, req.usuario.id);

    res.json({ mensagem: 'RNC removida.' });
  } catch (error) {
    console.error('Erro ao deletar RNC:', error);
    res.status(500).json({ erro: 'Erro ao deletar RNC.' });
  }
});

// Submeter correção (responsável ou criador) — envia correção e altera status para 'Em andamento'
router.post('/:id/corrigir', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { descricao_correcao } = req.body;

    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    if (!rncAtual) return res.status(404).json({ erro: 'RNC não encontrada.' });

    // somente criador, responsável ou gestor podem submeter correção
    const uid = String(req.usuario?.id ?? '');
    const podeCorrigir = uid === String(rncAtual.criado_por ?? '') || uid === String(rncAtual.responsavel_id ?? '') || Boolean(req.usuario?.is_gestor);
    if (!podeCorrigir) {
      return res.status(403).json({ erro: 'Sem permissão para submeter correção.' });
    }

    await runQuery(
      'UPDATE rnc SET descricao_correcao = ?, descricao_correcao_em = CURRENT_TIMESTAMP, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [descricao_correcao || null, 'Em andamento', id]
    );

    await registrarAuditoria('rnc', id, 'CORRECAO_SUBMETIDA', rncAtual, { descricao_correcao }, req.usuario.id);

    res.json({ mensagem: 'Correção registrada e RNC marcada como Em andamento.' });
  } catch (error) {
    console.error('Erro ao submeter correção da RNC:', error);
    res.status(500).json({ erro: 'Erro ao submeter correção.' });
  }
});

module.exports = router;

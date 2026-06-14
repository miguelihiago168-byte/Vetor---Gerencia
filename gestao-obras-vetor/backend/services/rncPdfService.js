const fs = require('fs');
const path = require('path');
const { allQuery, getQuery } = require('../config/database');

const uploadsRoot = path.join(__dirname, '..', 'uploads');
const PDF_TIME_ZONE = process.env.PDF_TIME_ZONE || process.env.APP_TIME_ZONE || 'America/Sao_Paulo';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const nl2br = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');

const safeText = (value, fallback = '-') => {
  if (value == null) return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return fallback;
  return text;
};

const fmtDate = (value) => {
  if (!value) return '-';
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return escapeHtml(raw);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: PDF_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

const fmtDateTime = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: PDF_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

const fmtSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '-';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
};

const normalizeUploadPath = (rawPath) => {
  if (rawPath == null) return '';
  let normalized = String(rawPath).trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const uploadsIndex = normalized.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIndex >= 0) normalized = normalized.slice(uploadsIndex + '/uploads/'.length);
  return normalized
    .replace(/^api\/uploads\//i, '')
    .replace(/^uploads\//i, '')
    .split('?')[0];
};

const uploadFilePath = (rawPath) => {
  const normalized = normalizeUploadPath(rawPath);
  if (!normalized) return null;
  const fullPath = path.resolve(uploadsRoot, normalized);
  const root = path.resolve(uploadsRoot);
  if (!fullPath.startsWith(root + path.sep) || !fs.existsSync(fullPath)) return null;
  return fullPath;
};

const isImageAttachment = (item) => {
  const mime = String(item?.tipo || '').toLowerCase();
  const name = String(item?.nome_arquivo || '').toLowerCase();
  return mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
};

const canEmbedImage = (item) => {
  const mime = String(item?.tipo || '').toLowerCase();
  const name = String(item?.nome_arquivo || '').toLowerCase();
  return /image\/(jpeg|jpg|png|webp|gif)/i.test(mime) || /\.(jpe?g|png|webp|gif)$/i.test(name);
};

const imageDataUri = (item) => {
  if (!canEmbedImage(item)) return null;
  const filePath = uploadFilePath(item.caminho_arquivo);
  if (!filePath) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png'
    ? 'image/png'
    : ext === '.webp'
      ? 'image/webp'
      : ext === '.gif'
        ? 'image/gif'
        : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
};

const extractLegacyRegistroFotos = (rawValue) => {
  if (!rawValue) return [];
  let items = [];
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      items = trimmed.split(/[\n,;]+/g);
    }
  } else if (Array.isArray(rawValue)) {
    items = rawValue;
  }

  return items.map((item) => {
    const candidate = typeof item === 'string'
      ? item
      : item?.caminho_arquivo || item?.path || item?.url || item?.src || item?.nome_arquivo || '';
    const normalized = normalizeUploadPath(candidate);
    if (!normalized || !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(normalized)) return null;
    return {
      id: `legacy-${normalized}`,
      tipo: 'image/legacy',
      nome_arquivo: path.basename(normalized),
      caminho_arquivo: normalized,
      categoria: 'registro'
    };
  }).filter(Boolean);
};

const statusMeta = (status) => {
  const normalized = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('analise')) return { label: 'Em aprovação', cls: 'review' };
  if (normalized.includes('encerrada')) return { label: 'Encerrada', cls: 'done' };
  if (normalized.includes('reprovada')) return { label: 'Reprovada', cls: 'rejected' };
  return { label: status || 'Aberta', cls: 'open' };
};

const gravityClass = (gravidade) => {
  const normalized = String(gravidade || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('critica')) return 'critical';
  if (normalized.includes('alta')) return 'high';
  if (normalized.includes('media')) return 'medium';
  return 'low';
};

const loadRncPdfData = async (id) => {
  const rnc = await getQuery(`
    SELECT r.*,
           p.nome AS projeto_nome,
           p.cidade AS projeto_cidade,
           u.nome AS criado_por_nome,
           g.nome AS responsavel_nome,
           rd.data_relatorio AS rdo_data,
           rd.numero_rdo AS rdo_numero
    FROM rnc r
    LEFT JOIN projetos p ON r.projeto_id = p.id
    LEFT JOIN usuarios u ON r.criado_por = u.id
    LEFT JOIN usuarios g ON r.responsavel_id = g.id
    LEFT JOIN rdos rd ON r.rdo_id = rd.id
    WHERE r.id = ?
  `, [id]);

  if (!rnc) return null;

  let anexos = [];
  try {
    anexos = await allQuery('SELECT * FROM anexos WHERE rnc_id = ? ORDER BY criado_em ASC, id ASC', [id]);
  } catch (error) {
    if (!/no such table|no such column/i.test(String(error?.message || ''))) throw error;
  }

  const merged = [...anexos];
  for (const legacy of extractLegacyRegistroFotos(rnc.registros_fotograficos)) {
    const legacyPath = normalizeUploadPath(legacy.caminho_arquivo);
    if (!merged.some((item) => normalizeUploadPath(item.caminho_arquivo) === legacyPath)) merged.push(legacy);
  }

  const registro = merged.filter((item) => !item.categoria || item.categoria === 'registro');
  const correcao = merged.filter((item) => item.categoria === 'correcao');
  const imagensRegistro = registro.filter(isImageAttachment);
  const imagensCorrecao = correcao.filter(isImageAttachment);
  const anexosComplementares = merged.filter((item) => !isImageAttachment(item) || !canEmbedImage(item));

  return {
    rnc,
    imagensRegistro,
    imagensCorrecao,
    anexosComplementares
  };
};

const metaItem = (label, value) => `
  <div class="meta-item">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(safeText(value))}</strong>
  </div>`;

const photoGrid = (title, photos, emptyText) => {
  const embeddable = photos
    .map((photo) => ({ photo, src: imageDataUri(photo) }))
    .filter((item) => item.src);

  if (!embeddable.length) {
    return `
      <section class="section">
        <div class="section-head">
          <span class="section-icon teal">IMG</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p class="empty">${escapeHtml(emptyText)}</p>
      </section>`;
  }

  return `
    <section class="section">
      <div class="section-head">
        <span class="section-icon teal">IMG</span>
        <h2>${escapeHtml(title)} (${embeddable.length})</h2>
      </div>
      <div class="photo-grid">
        ${embeddable.map(({ photo, src }) => `
          <figure class="photo">
            <img src="${src}" alt="${escapeHtml(photo.nome_arquivo || 'Evidência')}" />
            <figcaption>${escapeHtml(photo.nome_arquivo || 'Evidência')}</figcaption>
          </figure>`).join('')}
      </div>
    </section>`;
};

const attachmentsSection = (items) => {
  if (!items.length) return '';
  return `
    <section class="section">
      <div class="section-head">
        <span class="section-icon neutral">DOC</span>
        <h2>Anexos complementares (${items.length})</h2>
      </div>
      <div class="attachment-list">
        ${items.map((item) => `
          <div class="attachment">
            <strong>${escapeHtml(item.nome_arquivo || 'Arquivo')}</strong>
            <span>${escapeHtml(item.tipo || 'arquivo')} · ${escapeHtml(fmtSize(item.tamanho))}</span>
          </div>`).join('')}
      </div>
    </section>`;
};

const historySection = (rnc, status) => {
  const rows = [
    { label: 'RNC registrada', date: fmtDateTime(rnc.criado_em), text: rnc.criado_por_nome || 'Registro inicial' }
  ];
  if (rnc.descricao_correcao) rows.push({ label: 'Correção registrada', date: fmtDateTime(rnc.descricao_correcao_em || rnc.atualizado_em), text: 'Resposta enviada pelo responsável' });
  if (status.cls === 'review') rows.push({ label: 'Enviada para aprovação', date: fmtDateTime(rnc.atualizado_em), text: 'Aguardando revisão' });
  if (status.cls === 'done') rows.push({ label: 'Encerrada', date: fmtDateTime(rnc.resolvido_em || rnc.atualizado_em), text: 'Correção aprovada' });
  if (status.cls === 'rejected') rows.push({ label: 'Reprovada', date: fmtDateTime(rnc.atualizado_em), text: 'Nova correção necessária' });

  return `
    <section class="section">
      <div class="section-head">
        <span class="section-icon blue">LOG</span>
        <h2>Histórico</h2>
      </div>
      <div class="timeline">
        ${rows.map((row) => `
          <div class="timeline-row">
            <span class="dot"></span>
            <div>
              <strong>${escapeHtml(row.label)}</strong>
              <small>${escapeHtml(row.date)}</small>
              <p>${escapeHtml(row.text)}</p>
            </div>
          </div>`).join('')}
      </div>
    </section>`;
};

const buildHtml = ({ rnc, imagensRegistro, imagensCorrecao, anexosComplementares }) => {
  const status = statusMeta(rnc.status);
  const gravidadeClass = gravityClass(rnc.gravidade);
  const rdoLabel = rnc.rdo_id
    ? `RDO #${rnc.rdo_numero || rnc.rdo_id}${rnc.rdo_data ? ` - ${fmtDate(rnc.rdo_data)}` : ''}`
    : 'Não vinculado';
  const local = rnc.projeto_cidade || '-';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #0f172a; font-family: "Inter", "Segoe UI", Arial, sans-serif; background: #ffffff; font-size: 12px; }
  .page { padding: 28px 34px 22px; }
  .hero { position: relative; border: 1px solid #dbe4ef; border-radius: 14px; overflow: hidden; background: linear-gradient(135deg, #f8fbff 0%, #eef6ff 58%, #fff7ed 100%); page-break-inside: avoid; }
  .hero-top { padding: 24px 190px 20px; text-align: center; }
  .eyebrow { color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  h1 { margin: 5px 0 6px; font-size: 25px; line-height: 1.05; letter-spacing: 0; }
  .subtitle {
    display: block;
    margin: 6px auto 0;
    color: #0f172a;
    font-size: 15px;
    line-height: 1.25;
    font-weight: 900;
    max-width: 420px;
  }
  .badges { position: absolute; top: 22px; right: 26px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; border: 1px solid transparent; }
  .badge-label { opacity: .72; font-size: 8px; letter-spacing: .06em; text-transform: uppercase; }
  .badge-value { font-size: 10px; }
  .status-open { color: #1e40af; background: #dbeafe; border-color: #bfdbfe; }
  .status-review { color: #92400e; background: #fef3c7; border-color: #fde68a; }
  .status-done { color: #166534; background: #dcfce7; border-color: #86efac; }
  .status-rejected { color: #991b1b; background: #fee2e2; border-color: #fecaca; }
  .gravity-low { color: #166534; background: #ecfdf5; border-color: #bbf7d0; }
  .gravity-medium { color: #92400e; background: #fef3c7; border-color: #fde68a; }
  .gravity-high { color: #9a3412; background: #ffedd5; border-color: #fed7aa; }
  .gravity-critical { color: #991b1b; background: #fee2e2; border-color: #fecaca; }
  .origin { color: #475569; background: #f8fafc; border-color: #dbe4ef; }
  .meta-grid { padding: 0 26px 22px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
  .meta-item { min-height: 58px; padding: 10px 11px; border-radius: 9px; border: 1px solid rgba(148, 163, 184, .32); background: rgba(255, 255, 255, .78); }
  .meta-item span { display: block; color: #64748b; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
  .meta-item strong { display: block; font-size: 11px; line-height: 1.25; word-break: break-word; }
  .section { margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; page-break-inside: avoid; }
  .section-head { display: flex; align-items: center; gap: 10px; padding: 10px 13px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .section-head h2 { margin: 0; font-size: 13px; }
  .section-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 24px; border-radius: 999px; font-size: 8px; font-weight: 900; }
  .section-icon.red { color: #991b1b; background: #fee2e2; }
  .section-icon.blue { color: #1e40af; background: #dbeafe; }
  .section-icon.green { color: #166534; background: #dcfce7; }
  .section-icon.teal { color: #115e59; background: #ccfbf1; }
  .section-icon.neutral { color: #475569; background: #e2e8f0; }
  .content { padding: 13px 15px; }
  .text { margin: 0; color: #334155; font-size: 12px; line-height: 1.65; }
  .empty { margin: 0; padding: 13px 15px; color: #94a3b8; font-weight: 700; }
  .photo-grid { padding: 13px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .photo { margin: 0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; page-break-inside: avoid; }
  .photo img { display: block; width: 100%; height: 170px; object-fit: cover; background: #f8fafc; }
  .photo figcaption { padding: 6px 8px; font-size: 9px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .attachment-list { padding: 13px; display: grid; gap: 7px; }
  .attachment { padding: 9px 10px; border-radius: 9px; background: #f8fafc; border: 1px solid #e2e8f0; }
  .attachment strong { display: block; font-size: 11px; margin-bottom: 2px; }
  .attachment span { color: #64748b; font-size: 10px; }
  .timeline { padding: 13px 15px; display: grid; gap: 9px; }
  .timeline-row { display: grid; grid-template-columns: 12px minmax(0, 1fr); gap: 8px; }
  .dot { width: 9px; height: 9px; margin-top: 3px; border-radius: 50%; background: #2563eb; }
  .timeline-row strong { display: block; font-size: 11px; }
  .timeline-row small { display: block; color: #94a3b8; margin-top: 1px; }
  .timeline-row p { margin: 2px 0 0; color: #64748b; font-size: 10px; }
  .footer { margin-top: 16px; color: #94a3b8; font-size: 9px; text-align: center; }
  @page { size: A4; margin: 9mm 8mm 12mm; }
</style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Relatório de Não Conformidade</div>
          <h1>RNC ${String(rnc.id).padStart(3, '0')}</h1>
          <div class="subtitle">${escapeHtml(safeText(rnc.titulo, `RNC #${rnc.id}`))}</div>
        </div>
        <div class="badges">
          <span class="badge status-${status.cls}"><span class="badge-label">Status</span><span class="badge-value">${escapeHtml(status.label)}</span></span>
          ${rnc.gravidade ? `<span class="badge gravity-${gravidadeClass}"><span class="badge-label">Gravidade</span><span class="badge-value">${escapeHtml(rnc.gravidade)}</span></span>` : ''}
          ${rnc.origem ? `<span class="badge origin"><span class="badge-label">Origem</span><span class="badge-value">${escapeHtml(rnc.origem)}</span></span>` : ''}
        </div>
      </div>
      <div class="meta-grid">
        ${metaItem('Projeto', rnc.projeto_nome)}
        ${metaItem('Local', local)}
        ${metaItem('Responsável', rnc.responsavel_nome || 'Não definido')}
        ${metaItem('Prazo', rnc.data_prevista_encerramento ? fmtDate(rnc.data_prevista_encerramento) : 'Não definido')}
        ${metaItem('Área afetada', rnc.area_afetada || 'Não informado')}
        ${metaItem('RDO vinculado', rdoLabel)}
        ${metaItem('Aberta por', rnc.criado_por_nome || 'Não informado')}
        ${metaItem('Aberta em', fmtDate(rnc.criado_em))}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <span class="section-icon red">RNC</span>
        <h2>Não conformidade</h2>
      </div>
      <div class="content">
        <p class="text">${nl2br(rnc.descricao || 'Sem descrição.')}</p>
        ${rnc.norma_referencia ? `<p class="text" style="margin-top:10px"><strong>Norma/Referência:</strong> ${escapeHtml(rnc.norma_referencia)}</p>` : ''}
      </div>
    </section>

    ${rnc.acao_corretiva ? `
      <section class="section">
        <div class="section-head">
          <span class="section-icon blue">ACT</span>
          <h2>Ação corretiva esperada</h2>
        </div>
        <div class="content">
          <p class="text">${nl2br(rnc.acao_corretiva)}</p>
        </div>
      </section>` : ''}

    ${photoGrid('Evidências da não conformidade', imagensRegistro, 'Nenhuma evidência fotográfica anexada.')}

    ${rnc.descricao_correcao ? `
      <section class="section">
        <div class="section-head">
          <span class="section-icon green">OK</span>
          <h2>Correção realizada</h2>
        </div>
        <div class="content">
          <p class="text">${nl2br(rnc.descricao_correcao)}</p>
        </div>
      </section>
      ${photoGrid('Evidências da correção', imagensCorrecao, 'Nenhuma evidência fotográfica anexada para a correção.')}` : ''}

    ${attachmentsSection(anexosComplementares)}
    ${historySection(rnc, status)}

    <div class="footer">
      Gerado em ${escapeHtml(fmtDateTime(new Date()))} · RNC ${String(rnc.id).padStart(3, '0')} · ${escapeHtml(safeText(rnc.projeto_nome))}
    </div>
  </main>
</body>
</html>`;
};

const getBrowserExecutablePath = () => {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.BROWSER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch (_) { return false; }
  });
};

const renderWithPuppeteer = async (html, footerLabel) => {
  const puppeteer = require('puppeteer');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: getBrowserExecutablePath() || undefined,
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
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:8px;color:#94a3b8;padding:0 36px;width:100%;box-sizing:border-box;display:flex;justify-content:space-between;font-family:'Segoe UI',Arial,sans-serif"><span>${escapeHtml(footerLabel)}</span><span>Pág. <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
      margin: { top: '8mm', bottom: '11mm', left: '0', right: '0' }
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

const renderFallbackPdf = ({ rnc, imagensRegistro, imagensCorrecao, anexosComplementares }, reason) => new Promise((resolve, reject) => {
  try {
    const PDFDocument = require('pdfkit');
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(`RNC ${String(rnc.id).padStart(3, '0')}`);
    doc.font('Helvetica').fontSize(10).fillColor('#64748b').text(safeText(rnc.projeto_nome));
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(safeText(rnc.titulo), { width: 500 });
    doc.moveDown(0.35);
    doc.font('Helvetica').fontSize(10).fillColor('#334155').text(`Status: ${statusMeta(rnc.status).label}`);
    doc.text(`Gravidade: ${safeText(rnc.gravidade)}`);
    doc.text(`Responsavel: ${safeText(rnc.responsavel_nome, 'Nao definido')}`);
    doc.text(`Prazo: ${rnc.data_prevista_encerramento ? fmtDate(rnc.data_prevista_encerramento) : 'Nao definido'}`);
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Nao conformidade');
    doc.font('Helvetica').fontSize(10).fillColor('#334155').text(safeText(rnc.descricao, 'Sem descricao.'), { width: 500 });
    if (rnc.acao_corretiva) {
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Acao corretiva esperada');
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(rnc.acao_corretiva, { width: 500 });
    }
    if (rnc.descricao_correcao) {
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Correcao realizada');
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(rnc.descricao_correcao, { width: 500 });
    }
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Evidencias e anexos');
    doc.font('Helvetica').fontSize(10).fillColor('#334155').text(`Fotos iniciais: ${imagensRegistro.length}`);
    doc.text(`Fotos da correcao: ${imagensCorrecao.length}`);
    doc.text(`Anexos complementares: ${anexosComplementares.length}`);
    if (reason) {
      doc.moveDown();
      doc.fontSize(8).fillColor('#991b1b').text(`PDF simplificado por falha no renderizador principal: ${String(reason).slice(0, 180)}`);
    }
    doc.end();
  } catch (error) {
    reject(error);
  }
});

const safeFilenamePart = (value) => String(value || 'arquivo')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'arquivo';

const generateRncPdfBuffer = async (id) => {
  const data = await loadRncPdfData(id);
  if (!data) return null;

  const html = buildHtml(data);
  const footerLabel = `RNC ${String(data.rnc.id).padStart(3, '0')} · ${safeText(data.rnc.projeto_nome)}`;
  const filename = `RNC-${String(data.rnc.id).padStart(3, '0')}-${safeFilenamePart(data.rnc.projeto_nome || 'projeto')}.pdf`;

  try {
    const buffer = await renderWithPuppeteer(html, footerLabel);
    return { buffer, filename, engine: 'puppeteer' };
  } catch (error) {
    const fallbackReason = String(error?.message || 'erro desconhecido').replace(/[\r\n]+/g, ' ').slice(0, 240);
    const buffer = await renderFallbackPdf(data, fallbackReason);
    return { buffer, filename, engine: 'pdfkit-fallback', fallbackReason };
  }
};

module.exports = {
  generateRncPdfBuffer
};

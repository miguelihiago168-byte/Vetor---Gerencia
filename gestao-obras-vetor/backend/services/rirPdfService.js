const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// The layout follows the quality verification sheets: branded header, teal
// section bars, pale information cards and a numbered footer on every page.
const LEFT = 38;
const WIDTH = 519;
const BOTTOM = 766;
const logo = path.join(__dirname, '..', 'assets', 'logo-vetor-cropped.png');
const text = value => value === null || value === undefined || value === '' ? '-' : String(value);
const quantity = value => value === null || value === undefined || value === '' ? '-' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).split('-').reverse().join('/') : text(value);
const inspection = value => ({ NAO_APLICAVEL: 'Não exige inspeção', AGUARDANDO_INSPECAO: 'Aguardando inspeção', APROVADO: 'Aprovado', APROVADO_COM_RESSALVA: 'Aprovado com ressalva', BLOQUEADO: 'Bloqueado', REPROVADO: 'Reprovado' }[value] || text(value));

function miniHeader(doc, report) {
  doc.save().rect(0, 0, 595, 42).fill('#f7fbff').rect(0, 40, 595, 2).fill('#123b7a').restore();
  doc.fillColor('#123b7a').font('Helvetica-Bold').fontSize(10).text('VETOR | RIR', LEFT, 14);
  doc.fillColor('#55758a').font('Helvetica').fontSize(8).text(`RIR #${report.id}`, 350, 16, { width: 207, align: 'right' });
  doc.y = 60;
}
function ensureSpace(doc, amount, report) {
  if (doc.y + amount > BOTTOM) { doc.addPage(); miniHeader(doc, report); }
}
function section(doc, title, report, reserve = 95) {
  ensureSpace(doc, reserve, report);
  const y = doc.y + 5;
  doc.save().roundedRect(LEFT, y, WIDTH, 30, 7).fill('#eef8f7').roundedRect(LEFT, y, 5, 30, 2).fill('#10a88b').restore();
  doc.fillColor('#075d62').font('Helvetica-Bold').fontSize(11).text(title, LEFT + 16, y + 9, { width: WIDTH - 32, lineBreak: false });
  doc.y = y + 42;
}
// Keep long, user-entered text visible without letting a single card exceed a page.
function chunks(value) {
  const source = text(value); const parts = [];
  let remaining = source;
  while (remaining.length > 180) {
    let end = remaining.lastIndexOf(' ', 180);
    if (end < 60) end = 180;
    parts.push(remaining.slice(0, end)); remaining = remaining.slice(end).replace(/^ +/, '');
  }
  parts.push(remaining); return parts;
}
function cards(doc, entries, report, columns = 2) {
  const gap = 9; const width = (WIDTH - gap * (columns - 1)) / columns;
  const expanded = entries.flatMap(([label, value]) => chunks(value).map((part, i) => [i ? `${label} (continuação)` : label, part]));
  for (let index = 0; index < expanded.length; index += columns) {
    const row = expanded.slice(index, index + columns);
    const heights = row.map(([, value]) => doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(value, { width: width - 20 }));
    const height = Math.max(48, ...heights.map(h => h + 29));
    ensureSpace(doc, height + gap, report);
    const y = doc.y;
    row.forEach(([label, value], col) => {
      const x = LEFT + col * (width + gap);
      doc.save().roundedRect(x, y, width, height, 7).fill('#f0f8f7').restore();
      doc.fillColor('#55758a').font('Helvetica').fontSize(7.5).text(label, x + 10, y + 8, { width: width - 20, lineBreak: false });
      doc.fillColor('#10264a').font('Helvetica-Bold').fontSize(9.5).text(value, x + 10, y + 21, { width: width - 20 });
    });
    doc.y = y + height + gap;
  }
  doc.y += 4;
}

async function generateRirPdfBuffer(report, photos) {
  const doc = new PDFDocument({ size: 'A4', margin: LEFT, bufferPages: true });
  const output = []; doc.on('data', chunk => output.push(chunk));
  const finished = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(output))); doc.on('error', reject); });
  const d = report.dados || {};
  doc.save().rect(0, 0, 595, 116).fill('#f7fbff').rect(0, 0, 595, 6).fill('#123b7a').rect(0, 110, 595, 6).fill('#dceff1').restore();
  if (fs.existsSync(logo)) doc.image(logo, 40, 16, { fit: [68, 68], align: 'center', valign: 'center' });
  doc.fillColor('#123b7a').font('Helvetica-Bold').fontSize(9).text('VETOR', LEFT, 89);
  doc.font('Helvetica').fontSize(6.5).text('GESTÃO DE OBRAS', LEFT, 101);
  doc.fillColor('#10264a').font('Helvetica-Bold').fontSize(17).text('RIR - Relatório de Inspeção\ne Recebimento', 132, 20, { width: 310, lineGap: 2 });
  doc.font('Helvetica').fontSize(9.5).text(`RIR #${report.id}`, 132, 65, { width: 270 });
  doc.fillColor('#55758a').fontSize(8).text(`Obra: ${text(report.projeto_nome)}`, 132, 83, { width: 420, ellipsis: true });
  doc.y = 132;

  section(doc, '1. Identificação do recebimento', report);
  cards(doc, [['Obra', report.projeto_nome], ['Fornecedor', d.fornecedor], ['Data', date(d.data)], ['Pedido de compra', d.pedido_compra], ['Nota fiscal', d.nota_fiscal], ['Romaneio', d.romaneio]], report);
  section(doc, '2. Conferência da carga', report);
  cards(doc, [['Veículo', d.veiculo], ['Placa do veículo', d.placa_veiculo], ['Placa da carreta', d.placa_carreta], ['Motorista', d.motorista], ['Transportadora', d.transportadora], ['Situação da carga', d.situacao_carga], ['Condições de descarga', d.condicoes_descarga], ['Equipamentos utilizados', d.equipamentos]], report);
  section(doc, '3. Itens verificados', report, 140);
  if (!report.itens.length) cards(doc, [['Itens', 'Nenhum item registrado.']], report, 1);
  report.itens.forEach((item, index) => {
    ensureSpace(doc, 90, report);
    doc.fillColor('#123b7a').font('Helvetica-Bold').fontSize(10).text(`Item ${index + 1}`, LEFT, doc.y, { width: WIDTH });
    doc.y += 6;
    const total = item.quantidade_total == null ? null : Number(item.quantidade_total);
    const received = item.quantidade_recebida == null ? null : Number(item.quantidade_recebida);
    const available = Number.isFinite(total) && total > 0 && Number.isFinite(received) && received >= 0;
    const saldo = available ? Number((total - received).toFixed(4)) : null;
    const status = !available ? '-' : saldo < 0 ? 'Recebido acima do total' : saldo === 0 ? 'Recebimento completo' : received === 0 ? 'Aguardando recebimento' : 'Recebimento parcial';
    const entries = [['Código', item.codigo], ['Descrição do material', item.descricao], ['Quantidade', quantity(item.quantidade)], ['Quantidade recebida', quantity(item.quantidade_recebida)], ['Quantidade total', quantity(item.quantidade_total)], ['Unidade', item.unidade], ['Saldo (total - recebido)', available ? `${quantity(saldo)} ${text(item.unidade, '')}` : '-'], ['Percentual recebido', available ? `${quantity(received / total * 100)}%` : '-'], ['Status', status]];
    if (item.lote) entries.push(['Lote vinculado anteriormente', item.lote]);
    if (item.status_qualidade) entries.push(['Inspeção do lote', inspection(item.status_qualidade)]);
    if (item.resultado) entries.push(['Resultado da conferência', item.resultado]);
    if (item.observacoes) entries.push(['Observações do item', item.observacoes]);
    cards(doc, entries, report);
  });
  section(doc, '4. Conclusão', report);
  cards(doc, [['Conformidade', d.conformidade], ['Conclusão', d.conclusao], ['Observações', d.observacoes]], report, 1);
  const documents = (report.anexos || []).filter(a => a.tipo === 'application/pdf');
  section(doc, '5. Documentos anexados', report);
  cards(doc, documents.length ? documents.map(a => ['Documento', `${a.nome}${a.legenda ? ` - ${a.legenda}` : ''}`]) : [['Documentos', 'Nenhum documento anexado.']], report, 1);
  section(doc, '6. Relatório fotográfico', report, photos.length ? 315 : 95);
  if (!photos.length) cards(doc, [['Fotos', 'Nenhuma foto anexada.']], report, 1);
  const photoRoot = path.resolve(__dirname, '..', 'uploads', 'rir', String(report.tenant_id));
  photos.forEach((photo, index) => {
    ensureSpace(doc, 270, report);
    const y = doc.y;
    doc.save().roundedRect(LEFT, y, WIDTH, 250, 7).fill('#f8fafc').stroke('#dce5e7').restore();
    doc.fillColor('#075d62').font('Helvetica-Bold').fontSize(9).text(`Imagem ${String(index + 1).padStart(2, '0')}`, LEFT + 12, y + 10);
    const file = path.resolve(String(photo.caminho || ''));
    try {
      if (!file.startsWith(photoRoot + path.sep)) throw new Error('Caminho inválido');
      doc.image(file, LEFT + 10, y + 28, { fit: [WIDTH - 20, 205], align: 'center', valign: 'center' });
    } catch (_) { doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Imagem indisponível.', LEFT + 12, y + 45); }
    doc.y = y + 259;
    cards(doc, [['Legenda', photo.legenda || photo.nome]], report, 1);
  });

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page);
    doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(`RIR #${report.id} - VETOR - Página ${page + 1} de ${range.count}`, LEFT, 790, { width: WIDTH, align: 'center', lineBreak: false });
  }
  doc.end();
  return finished;
}
module.exports = { generateRirPdfBuffer };

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LEFT = 42;
const WIDTH = 511;
const BOTTOM = 765;
const C = { navy:'#0b2852', ink:'#152c45', muted:'#5d7187', line:'#d9e4ee', pale:'#f5f9fc', cyan:'#00a5d9', cyanPale:'#e7f5fb', green:'#16784e', amber:'#a65a0a', red:'#a53d37' };
const logo = path.join(__dirname, '..', 'assets', 'logo-vetor-cropped.png');
const text = value => value === null || value === undefined || value === '' ? 'Não informado' : String(value);
const quantity = value => value === null || value === undefined || value === '' ? 'Não informado' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits:4 });
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).split('-').reverse().join('/') : text(value);
const inspection = value => ({ NAO_APLICAVEL:'Sem classificação registrada', AGUARDANDO_INSPECAO:'Aguardando inspeção', APROVADO:'Aprovado', APROVADO_COM_RESSALVA:'Aprovado com ressalva', BLOQUEADO:'Bloqueado', REPROVADO:'Rejeitado' }[value] || text(value));

function miniHeader(doc, report) {
  doc.save().rect(0, 0, 595, 42).fill(C.navy).rect(0, 40, 595, 2).fill(C.cyan).restore();
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('VETOR  /  INSPEÇÃO E RECEBIMENTO', LEFT, 15, { width:350, lineBreak:false });
  doc.font('Helvetica').fontSize(8).text(`RIR #${report.id}`, 432, 15, { width:121, align:'right', lineBreak:false });
  doc.y = 58;
}
function ensureSpace(doc, height, report) {
  if (doc.y + height > BOTTOM) { doc.addPage(); miniHeader(doc, report); }
}
function section(doc, number, title, report, reserve = 80) {
  ensureSpace(doc, reserve, report);
  const y = doc.y;
  doc.save().roundedRect(LEFT, y, 27, 27, 7).fill(C.cyanPale).restore();
  doc.fillColor('#08799d').font('Helvetica-Bold').fontSize(9).text(String(number).padStart(2,'0'), LEFT, y + 9, { width:27, align:'center', lineBreak:false });
  doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(11).text(title, LEFT + 38, y + 7, { width:WIDTH - 38, lineBreak:false });
  doc.save().moveTo(LEFT, y + 35).lineTo(LEFT + WIDTH, y + 35).strokeColor(C.line).lineWidth(.7).stroke().restore();
  doc.y = y + 46;
}
function chunks(value) {
  let remaining = text(value); const out = [];
  while (remaining.length > 160) { let end = remaining.lastIndexOf(' ', 160); if (end < 55) end = 160; out.push(remaining.slice(0, end)); remaining = remaining.slice(end).replace(/^ +/, ''); }
  out.push(remaining); return out;
}
function fields(doc, entries, report, columns = 2) {
  const gap = 9; const width = (WIDTH - gap * (columns - 1)) / columns;
  const expanded = entries.flatMap(([label, value]) => chunks(value).map((part, index) => [index ? `${label} (continuação)` : label, part]));
  for (let index = 0; index < expanded.length; index += columns) {
    const row = expanded.slice(index, index + columns);
    const heights = row.map(([, value]) => doc.font('Helvetica').fontSize(9.5).heightOfString(value, { width:width - 22 }));
    const height = Math.max(43, ...heights.map(h => h + 25));
    ensureSpace(doc, height + gap, report);
    const y = doc.y;
    row.forEach(([label, value], col) => {
      const x = LEFT + col * (width + gap);
      doc.save().roundedRect(x, y, width, height, 6).fill(C.pale).restore();
      doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7).text(label.toLocaleUpperCase('pt-BR'), x + 11, y + 8, { width:width - 22, lineBreak:false });
      doc.fillColor(C.ink).font('Helvetica').fontSize(9.5).text(value, x + 11, y + 21, { width:width - 22 });
    });
    doc.y = y + height + gap;
  }
  doc.y += 3;
}
function itemHeader(doc, item, index, report) {
  const title = text(item.descricao);
  const heading = `ITEM ${String(index + 1).padStart(2,'0')}${item.codigo ? `  /  ${item.codigo}` : ''}`;
  const titleParts = chunks(title);
  for (let i = 0; i < titleParts.length; i++) {
    const height = Math.max(54, doc.font('Helvetica-Bold').fontSize(11).heightOfString(titleParts[i], { width:WIDTH - 30 }) + 31);
    ensureSpace(doc, height + (i === titleParts.length - 1 ? 62 : 8), report);
    const y = doc.y;
    doc.save().roundedRect(LEFT, y, WIDTH, height, 7).fill(C.cyanPale).restore();
    doc.fillColor('#08799d').font('Helvetica-Bold').fontSize(7.5).text(i ? `${heading} (continuação)` : heading, LEFT + 13, y + 9, { width:WIDTH - 26, lineBreak:false });
    doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(11).text(titleParts[i], LEFT + 13, y + 24, { width:WIDTH - 26 });
    doc.y = y + height + 8;
  }
}

async function generateRirPdfBuffer(report, photos) {
  const doc = new PDFDocument({ size:'A4', margin:LEFT, bufferPages:true });
  const output = []; doc.on('data', chunk => output.push(chunk));
  const finished = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(output))); doc.on('error', reject); });
  const d = report.dados || {}; const items = report.itens || [];
  doc.save().rect(0, 0, 595, 119).fill('#f3f9fc').rect(0, 115, 595, 4).fill(C.cyan).restore();
  doc.fillColor('#08799d').font('Helvetica-Bold').fontSize(8).text('QUALIDADE  /  RECEBIMENTO', LEFT, 25, { width:340, lineBreak:false });
  doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(19).text('Relatório de Inspeção\ne Recebimento', LEFT, 43, { width:340, lineGap:2 });
  doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(`RIR #${report.id}`, LEFT, 94, { width:300, lineBreak:false });
  if (fs.existsSync(logo)) doc.image(logo, 450, 29, { fit:[94,52], align:'center', valign:'center' });
  doc.y = 135;

  section(doc, 1, 'Identificação da entrega', report);
  fields(doc, [['Obra', report.projeto_nome], ['Data do recebimento', date(d.data)], ['Fornecedor', d.fornecedor], ['Pedido de compra', d.pedido_compra], ['Nota fiscal', d.nota_fiscal], ['Romaneio', d.romaneio]], report);
  section(doc, 2, `Materiais da entrega  /  ${items.length} ${items.length === 1 ? 'item' : 'itens'}`, report, 150);
  if (!items.length) fields(doc, [['Materiais','Nenhum item registrado.']], report, 1);
  items.forEach((item, index) => {
    itemHeader(doc, item, index, report);
    const unit = item.unidade ? ` ${item.unidade}` : '';
    const entries = [['Recebido nesta entrega', `${quantity(item.quantidade_recebida)}${unit}`], ['Quantidade total informada', `${quantity(item.quantidade_total)}${unit}`], ['Quantidade prevista informada', `${quantity(item.quantidade)}${unit}`], ['Situação da inspeção', item.status_qualidade ? inspection(item.status_qualidade) : 'Sem classificação registrada']];
    if (item.inspecao_aprovada != null) entries.push(['Aprovado', `${quantity(item.inspecao_aprovada)}${unit}`], ['Bloqueado', `${quantity(item.inspecao_bloqueada)}${unit}`], ['Rejeitado', `${quantity(item.inspecao_reprovada)}${unit}`], ['Motivo da divergência', item.inspecao_motivo]);
    if (item.lote) entries.push(['Lote', item.lote]);
    if (item.resultado) entries.push(['Resultado da conferência', item.resultado]);
    if (item.observacoes) entries.push(['Observações do item', item.observacoes]);
    fields(doc, entries, report);
  });
  section(doc, 3, 'Transporte e condições da carga', report);
  fields(doc, [['Transportadora',d.transportadora], ['Motorista',d.motorista], ['Veículo',d.veiculo], ['Placa do veículo',d.placa_veiculo], ['Placa da carreta',d.placa_carreta], ['Situação da carga',d.situacao_carga], ['Condições de descarga',d.condicoes_descarga], ['Equipamentos utilizados',d.equipamentos]], report);
  section(doc, 4, 'Conclusão e observações', report);
  fields(doc, [['Conformidade',d.conformidade], ['Conclusão',d.conclusao], ['Observações',d.observacoes]], report, 1);
  const documents = (report.anexos || []).filter(a => a.tipo === 'application/pdf');
  section(doc, 5, 'Documentos anexados', report);
  fields(doc, documents.length ? documents.map(a => ['Documento', `${a.nome}${a.legenda ? ` - ${a.legenda}` : ''}`]) : [['Documentos','Nenhum documento anexado.']], report, 1);
  section(doc, 6, 'Registro fotográfico', report, photos.length ? 365 : 85);
  if (!photos.length) fields(doc, [['Fotos','Nenhuma foto anexada.']], report, 1);
  const photoRoot = path.resolve(__dirname, '..', 'uploads', 'rir', String(report.tenant_id));
  photos.forEach((photo, index) => {
    ensureSpace(doc, 315, report);
    const y = doc.y;
    doc.save().roundedRect(LEFT, y, WIDTH, 242, 7).fill(C.pale).restore();
    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(8).text(`FOTO ${String(index + 1).padStart(2,'0')}`, LEFT + 12, y + 10, { width:WIDTH - 24, lineBreak:false });
    const file = path.resolve(String(photo.caminho || ''));
    try { if (!file.startsWith(photoRoot + path.sep)) throw new Error('Caminho inválido'); doc.image(file, LEFT + 10, y + 28, { fit:[WIDTH - 20, 200], align:'center', valign:'center' }); }
    catch (_) { doc.fillColor(C.muted).font('Helvetica').fontSize(9).text('Imagem indisponível.', LEFT + 12, y + 48); }
    doc.y = y + 252;
    fields(doc, [['Legenda',photo.legenda || photo.nome]], report, 1);
  });
  section(doc, 7, 'Aprovação e assinaturas', report, 165);
  fields(doc, [['Situação do relatório', report.status || 'Em preenchimento']], report, 1);
  const signerData = report.assinaturas || {};
  const signed = report.status === 'Aprovado';
  const slots = [{ label:'Responsável pelo registro', user:signerData.criador, at:null },
    { label:'Aprovação do gestor', user:signed ? signerData.gestor : null, at:signed ? report.gestor_aprovado_em : null },
    ...(report.exige_aprovacao_fiscal ? [{ label:'Aprovação da fiscalização', user:signed ? signerData.fiscal : null, at:signed ? report.fiscal_aprovado_em : null }] : [])];
  ensureSpace(doc, 116, report);
  const sy = doc.y; const gap = 9; const sw = (WIDTH - gap * (slots.length - 1)) / slots.length;
  const uploads = path.resolve(__dirname, '..', 'uploads');
  slots.forEach((slot, index) => {
    const x = LEFT + index * (sw + gap);
    doc.save().roundedRect(x, sy, sw, 106, 6).fill(C.pale).restore();
    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7).text(slot.label.toLocaleUpperCase('pt-BR'), x + 10, sy + 8, { width:sw - 20, lineBreak:false, ellipsis:true });
    let imageDrawn = false;
    if (slot.user?.assinatura_png) {
      const file = path.resolve(uploads, String(slot.user.assinatura_png).replace(/\\/g, '/'));
      try { if (!file.startsWith(uploads + path.sep)) throw new Error('Caminho inválido'); doc.image(file, x + 10, sy + 22, { fit:[sw - 20, 36], align:'center', valign:'center' }); imageDrawn = true; } catch (_) { /* O nome ainda identifica o responsável, como no RDO. */ }
    }
    if (slot.user && !imageDrawn) doc.fillColor(C.muted).font('Helvetica').fontSize(7).text('Assinatura não cadastrada', x + 10, sy + 39, { width:sw - 20, align:'center', lineBreak:false });
    doc.save().moveTo(x + 10, sy + 63).lineTo(x + sw - 10, sy + 63).strokeColor(C.line).lineWidth(.7).stroke().restore();
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8).text(slot.user?.nome || 'Aguardando aprovação', x + 10, sy + 68, { width:sw - 20, height:18, ellipsis:true });
    if (slot.at) doc.fillColor(C.muted).font('Helvetica').fontSize(7).text(new Date(slot.at).toLocaleString('pt-BR'), x + 10, sy + 91, { width:sw - 20, lineBreak:false });
  });
  doc.y = sy + 116;
  const range = doc.bufferedPageRange();
  for (let page = 0; page < range.count; page++) {
    doc.switchToPage(range.start + page);
    doc.save().moveTo(LEFT, 778).lineTo(LEFT + WIDTH, 778).strokeColor(C.line).lineWidth(.6).stroke().restore();
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(`VETOR  /  RIR #${report.id}`, LEFT, 785, { width:250, lineBreak:false });
    doc.text(`Página ${page + 1} de ${range.count}`, LEFT + 300, 785, { width:211, align:'right', lineBreak:false });
  }
  doc.end(); return finished;
}
module.exports = { generateRirPdfBuffer };

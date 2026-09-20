const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getQuery, allQuery } = require('../config/database');

const value = (input, fallback = '-') => input === null || input === undefined || input === '' ? fallback : String(input);
const json = (input, fallback = {}) => { if (!input) return fallback; if (typeof input === 'object') return input; try { return JSON.parse(input); } catch { return fallback; } };
const snapshotName = (input) => { const parsed = json(input, null); return parsed && typeof parsed === 'object' ? (parsed.nome || parsed.name || '-') : value(input); };
const number = (input, fallback = '-') => { const parsed = Number(input); return Number.isFinite(parsed) ? parsed.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : fallback; };
const resultLabel = (input) => ({ BLOQUEADO: 'Não conforme', NAO_CONFORME: 'Não conforme', CONFORME: 'Conforme', PENDENTE: 'Pendente', NAO_APLICAVEL: 'Não aplicável', CONFORME_COM_RESSALVAS: 'Conforme com ressalvas' }[input] || value(input));
const statusLabel = (input) => ({ RASCUNHO: 'Rascunho', EM_ANALISE: 'Em análise', REPROVADA_BLOQUEADA: 'Não conforme', EM_CORRECAO: 'Em correção', EM_REINSPECAO: 'Em reinspeção', APROVADA: 'Aprovada' }[input] || value(input));
const pointStatusLabel = (input, required) => (!input || (required && input === 'NAO_APLICAVEL') ? 'Pendente' : resultLabel(input));
const dateTime = (input) => input ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: process.env.PDF_TIME_ZONE || process.env.APP_TIME_ZONE || 'America/Sao_Paulo' }).format(new Date(input)) : '-';
const signatureLabel = (type) => ({ EXECUTANTE: 'Executante', INSPETOR: 'Inspetor', APROVADOR: 'Aprovador' }[type] || type || 'Responsável');
const signatureFile = (snapshot, tenantId) => {
  if (!snapshot) return null;
  const filename = path.basename(String(snapshot));
  const candidates = [path.join(__dirname, '..', 'uploads', `tenant_${tenantId}`, filename), path.join(__dirname, '..', 'uploads', filename)];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};
const logoFile = path.join(__dirname, '..', 'assets', 'logo-vetor-cropped.png');

const pageBottom = 766;
const drawMiniHeader = (doc, folha) => {
  doc.save().rect(0, 0, 595, 42).fill('#f7fbff').restore();
  doc.save().rect(0, 40, 595, 2).fill('#123b7a').restore();
  doc.fillColor('#123b7a').font('Helvetica-Bold').fontSize(10).text('VETOR | FOLHA DE VERIFICAÇÃO', 38, 14);
  doc.font('Helvetica').fontSize(8).text(`${folha.numero} - Rev. ${folha.revisao} - ${statusLabel(folha.status)}`, 350, 16, { width: 207, align: 'right' });
};
const newPage = (doc, folha) => { doc.addPage(); drawMiniHeader(doc, folha); doc.y = 60; doc.fillColor('#1f2937').font('Helvetica').fontSize(9); };
const ensureSpace = (doc, amount, folha) => { if (doc.y + amount > pageBottom) newPage(doc, folha); };
const sectionTitle = (doc, title, folha, reserve = 42) => {
  ensureSpace(doc, reserve, folha);
  const y = doc.y + 5;
  doc.save().roundedRect(38, y, 519, 30, 7).fill('#eef8f7').restore();
  doc.save().roundedRect(38, y, 5, 30, 2).fill('#10a88b').restore();
  doc.fillColor('#075d62').font('Helvetica-Bold').fontSize(11).text(title, 54, y + 9, { width: 490 });
  doc.y = y + 42;
};
const drawCard = (doc, x, y, width, height, label, content) => {
  const cursorY = doc.y;
  doc.save().roundedRect(x, y, width, height, 7).fill('#f0f8f7').restore();
  doc.fillColor('#55758a').font('Helvetica').fontSize(7.5).text(label, x + 10, y + 8, { width: width - 20 });
  doc.fillColor('#10264a').font('Helvetica-Bold').fontSize(9.5).text(value(content), x + 10, y + 21, { width: width - 20, height: height - 24, ellipsis: true });
  doc.y = cursorY;
};
const drawGrid = (doc, items, columns, folha) => {
  const gap = 9; const width = (519 - gap * (columns - 1)) / columns; const height = 48; const rows = Math.ceil(items.length / columns);
  ensureSpace(doc, rows * (height + gap) + 2, folha);
  items.forEach((item, index) => { const row = Math.floor(index / columns); const column = index % columns; drawCard(doc, 38 + column * (width + gap), doc.y + row * (height + gap), width, height, item[0], item[1]); });
  doc.y += rows * (height + gap) + 4;
};
const drawSummaryCards = (doc, items, folha) => {
  ensureSpace(doc, 72, folha); const gap = 9; const width = (519 - gap * 4) / 5; const y = doc.y;
  items.forEach((item, index) => drawCard(doc, 38 + index * (width + gap), y, width, 56, item[0], item[1]));
  doc.y = y + 68;
};
const drawStatusPill = (doc, x, y, text, color, width = 76) => { doc.save().roundedRect(x, y, width, 16, 8).fill(color).restore(); doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7).text(text, x, y + 5, { width, align: 'center' }); };

async function loadData(folhaId) {
  const folha = await getQuery(`SELECT f.*,p.nome projeto_nome,p.empresa_responsavel,p.empresa_executante,u.nome criador_nome
    FROM folhas_verificacao f JOIN projetos p ON p.id=f.projeto_id LEFT JOIN usuarios u ON u.id=f.criado_por WHERE f.id=?`, [folhaId]);
  if (!folha) return null;
  const [torque, points, measurements, answers, evidences, signatures, links, rnc, activity, rdo] = await Promise.all([
    getQuery('SELECT * FROM folhas_verificacao_torque_config WHERE folha_id=?', [folhaId]),
    allQuery('SELECT * FROM folhas_verificacao_pontos WHERE folha_id=? ORDER BY identificacao', [folhaId]),
    allQuery('SELECT * FROM folhas_verificacao_medicoes WHERE folha_id=? ORDER BY numero_ponto,id', [folhaId]),
    allQuery('SELECT * FROM folhas_verificacao_respostas WHERE folha_id=? ORDER BY id', [folhaId]),
    allQuery('SELECT * FROM folhas_verificacao_evidencias WHERE folha_id=? ORDER BY criado_em', [folhaId]),
    allQuery('SELECT * FROM folhas_verificacao_assinaturas WHERE folha_id=? ORDER BY assinado_em', [folhaId]),
    allQuery('SELECT f.numero,f.status,f.resultado_lote,v.tipo_vinculo,v.obrigatorio FROM folhas_verificacao_vinculos v JOIN folhas_verificacao f ON f.id=v.folha_destino_id WHERE v.folha_origem_id=?', [folhaId]),
    getQuery('SELECT r.* FROM folhas_verificacao_rncs fr JOIN rnc r ON r.id=fr.rnc_id WHERE fr.folha_id=?', [folhaId]),
    folha.atividade_eap_id ? getQuery('SELECT codigo_eap,descricao FROM atividades_eap WHERE id=?', [folha.atividade_eap_id]) : Promise.resolve(null),
    folha.rdo_id ? getQuery('SELECT numero_rdo,data_relatorio FROM rdos WHERE id=?', [folha.rdo_id]) : Promise.resolve(null)
  ]);
  if (folha.aprovado_por && !signatures.some((signature) => signature.tipo === 'APROVADOR')) {
    const approver = await getQuery('SELECT nome,perfil,assinatura_png FROM usuarios WHERE id=?', [folha.aprovado_por]);
    if (approver?.assinatura_png) signatures.push({ tipo: 'APROVADOR', tenant_id: folha.tenant_id, nome_snapshot: approver.nome, perfil_snapshot: approver.perfil, assinatura_snapshot: approver.assinatura_png, assinado_em: folha.aprovado_em, versao_folha: folha.versao });
  }
  return { folha, torque, points, measurements, answers, evidences, signatures, links, rnc, activity, rdo };
}

async function generateFolhaVerificacaoPdfBuffer(folhaId) {
  const data = await loadData(folhaId);
  if (!data) { const error = new Error('Folha não encontrada.'); error.statusCode = 404; throw error; }
  const { folha, torque, points, measurements, answers, evidences, signatures, links, rnc, activity, rdo } = data;
  const doc = new PDFDocument({ size: 'A4', margin: 38, bufferPages: true });
  const chunks = []; doc.on('data', (chunk) => chunks.push(chunk)); const complete = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const identification = json(folha.identificacao); const summary = json(folha.resumo); const instrument = json(torque?.instrumento_snapshot);

  doc.save().rect(0, 0, 595, 116).fill('#f7fbff').restore();
  doc.save().rect(0, 0, 595, 6).fill('#123b7a').restore();
  doc.save().rect(0, 110, 595, 6).fill('#dceff1').restore();
  if (fs.existsSync(logoFile)) doc.image(logoFile, 40, 16, { fit: [68, 68], align: 'center', valign: 'center' });
  doc.fillColor('#123b7a').font('Helvetica-Bold').fontSize(9).text('VETOR', 38, 89); doc.font('Helvetica').fontSize(6.5).text('GESTÃO DE OBRAS', 38, 101);
  doc.fillColor('#10264a').font('Helvetica-Bold').fontSize(19).text('Folha de Verificação', 132, 18);
  doc.font('Helvetica').fontSize(9.5).text(`${folha.tipo_folha === 'TORQUE' ? 'Controle de torque' : 'Controle de qualidade'} - ${folha.numero}`, 132, 47, { width: 270 });
  doc.fillColor('#55758a').fontSize(7.5).text(`Obra: ${value(folha.projeto_nome)}`, 132, 65, { width: 270, ellipsis: true });
  doc.text(`Contratante: ${snapshotName(folha.empresa_responsavel_snapshot || folha.empresa_responsavel)}`, 132, 79, { width: 270, ellipsis: true });
  doc.text(`Executante: ${snapshotName(folha.empresa_executante_snapshot || folha.empresa_executante)}`, 132, 93, { width: 270, ellipsis: true });
  drawStatusPill(doc, 427, 21, statusLabel(folha.status), folha.status === 'APROVADA' ? '#10a88b' : folha.status === 'REPROVADA_BLOQUEADA' ? '#dc3545' : '#e6a817', 130);
  doc.fillColor('#55758a').fontSize(8).text(`Rev. ${String(folha.revisao).padStart(2, '0')} | ${dateTime(folha.criado_em)}`, 427, 51, { width: 130, align: 'center' });
  doc.fillColor('#1f2937').font('Helvetica').fontSize(9); doc.y = 132;

  sectionTitle(doc, '1. Identificação e rastreabilidade', folha, 42 + 3 * 57 + 8);
  drawGrid(doc, [
    ['Status', statusLabel(folha.status)], ['Obra', folha.projeto_nome], ['Código do lote', identification.codigo_lote], ['Descrição do lote', identification.descricao_lote],
    ['Área / setor / trecho', identification.area || identification.area_setor_trecho], ['População total', `${value(folha.populacao_total, '0')} ${value(folha.unidade_populacao, '')}`], ['Amostra prevista', folha.amostra_prevista],
    ['Critério de aceitação', folha.criterio_aceitacao === 'CEM_PORCENTO' ? 'Inspeção 100%' : folha.criterio_aceitacao === 'MAX_NC' ? `Máximo de ${value(folha.maximo_nc, '0')} NC` : 'C=0'],
    ['Atividade EAP', activity ? `${value(activity.codigo_eap)} - ${value(activity.descricao)}` : 'Não vinculada'], ['RDO relacionado', rdo ? `${value(rdo.numero_rdo)} - ${value(rdo.data_relatorio)}` : 'Não vinculado'],
    ['Empresa responsável', snapshotName(folha.empresa_responsavel_snapshot || folha.empresa_responsavel)], ['Empresa executante', snapshotName(folha.empresa_executante_snapshot || folha.empresa_executante)]
  ], 4, folha);

  if (torque) {
    sectionTitle(doc, '2. Requisito de torque e instrumento', folha, 42 + 3 * 57 + 8);
    drawGrid(doc, [
      ['Aplicação', torque.tipo_ligacao], ['Componente', torque.componente], ['Fixador', torque.fixador], ['Classe / material', torque.classe_material],
      ['Condição de montagem', torque.condicao_montagem], ['Nominal', `${number(torque.torque_esperado)} ${value(torque.unidade, '')}`], ['Limites', `${number(torque.limite_inferior)} - ${number(torque.limite_superior)} ${value(torque.unidade, '')}`], ['Método de verificação', torque.metodo_verificacao],
      ['Fonte do requisito', torque.fonte_requisito], ['Documento / revisão', [torque.documento_referencia, torque.revisao_documento].filter(Boolean).join(' - ')], ['Torquímetro / ativo', [instrument.codigo, instrument.nome, instrument.patrimonio_serie].filter(Boolean).join(' - ')], ['Faixa / calibração', `${value(instrument.rangeMin)} a ${value(instrument.rangeMax)} - ${value(instrument.calibrationValidUntil)}`]
    ], 4, folha);
  }

  const sampleTarget = Number(summary.sampleSize || folha.amostra_prevista || 0);
  const measuredCount = Number(summary.measured || measurements.length || 0);
  const remainingCount = Math.max(0, sampleTarget - measuredCount);
  const progress = sampleTarget ? Math.min(100, Math.round((measuredCount / sampleTarget) * 100)) : 100;
  sectionTitle(doc, 'Resumo da inspeção', folha);
  drawSummaryCards(doc, [['Meta da amostra', sampleTarget], ['Parafusos verificados', measuredCount], ['Faltam verificar', remainingCount], ['Não conformes', summary.nonConforming || 0], ['Resultado', resultLabel(folha.resultado_lote)]], folha);
  const progressY = doc.y; const progressBarX = 300; const progressBarWidth = 190;
  doc.save().roundedRect(38, progressY, 519, 42, 8).fill('#f8fafc').stroke('#dce5e7').restore();
  doc.fillColor('#10264a').font('Helvetica-Bold').fontSize(8.5).text(`${measuredCount} de ${sampleTarget || 0} parafusos verificados`, 50, progressY + 9, { width: 220 });
  doc.fillColor('#55758a').font('Helvetica').fontSize(7.5).text(remainingCount ? `Faltam ${remainingCount} para concluir a amostra` : 'Amostra completa', 50, progressY + 24, { width: 220 });
  doc.save().roundedRect(progressBarX, progressY + 15, progressBarWidth, 10, 5).fill('#dbe5e7').restore();
  if (progress > 0) doc.save().roundedRect(progressBarX, progressY + 15, Math.max(10, progressBarWidth * progress / 100), 10, 5).fill('#10a88b').restore();
  doc.fillColor('#08705f').font('Helvetica-Bold').fontSize(9).text(`${progress}%`, 504, progressY + 12, { width: 40, align: 'right' }); doc.y = progressY + 54;

  if (points.length) {
    sectionTitle(doc, '3. Controle visual por estrutura', folha);
    points.forEach((point) => { const resolvedResult = point.resultado && point.resultado !== 'PENDENTE' ? point.resultado : null; const mountingStatus = point.status_montagem === 'PENDENTE' && resolvedResult ? resolvedResult : point.status_montagem; const torqueStatus = torque && ['NAO_APLICAVEL', 'PENDENTE'].includes(point.status_torque) && resolvedResult ? resolvedResult : point.status_torque; ensureSpace(doc, 42, folha); const y = doc.y; doc.save().roundedRect(38, y, 519, 34, 6).fill('#f8fafc').stroke('#dce5e7').restore(); doc.fillColor('#10264a').font('Helvetica-Bold').fontSize(9).text(value(point.identificacao), 50, y + 8, { width: 145 }); doc.font('Helvetica').fillColor('#334e68').text(value(point.localizacao), 205, y + 8, { width: 125 }); doc.text(`Montagem: ${pointStatusLabel(mountingStatus, false)}`, 338, y + 8, { width: 95 }); doc.text(`Torque: ${pointStatusLabel(torqueStatus, Boolean(torque))}`, 438, y + 8, { width: 102 }); doc.y = y + 41; });
  }
  if (answers.length) {
    sectionTitle(doc, '4. Verificações preliminares', folha);
    answers.forEach((answer) => { const item = json(answer.item_snapshot); ensureSpace(doc, 33, folha); const y = doc.y; doc.save().roundedRect(38, y, 519, 25, 5).fill('#f8fafc').stroke('#dce5e7').restore(); doc.fillColor('#10264a').font('Helvetica').fontSize(8.5).text(value(item.rotulo || item.label, 'Item'), 50, y + 8, { width: 375 }); drawStatusPill(doc, 445, y + 5, resultLabel(answer.resultado), answer.resultado === 'CONFORME' ? '#10a88b' : answer.resultado === 'NAO_CONFORME' ? '#dc3545' : '#778899', 100); doc.y = y + 32; });
  }
  if (measurements.length) {
    sectionTitle(doc, '5. Medições registradas', folha);
    const headers = ['Ponto', 'Local / elemento', 'Qtd.', 'Esperado', 'Aplicado', 'Data / hora', 'Resultado']; const widths = [39, 125, 32, 57, 65, 94, 107];
    const drawMeasurementHeader = () => { const y = doc.y; doc.save().rect(38, y, 519, 22).fill('#123b7a').restore(); let x = 44; headers.forEach((header, index) => { doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7).text(header, x, y + 7, { width: widths[index] - 5 }); x += widths[index]; }); doc.y = y + 27; };
    ensureSpace(doc, 55, folha); drawMeasurementHeader();
    measurements.forEach((measurement, index) => { if (doc.y + 27 > pageBottom) { newPage(doc, folha); sectionTitle(doc, '5. Medições registradas - continuação', folha); drawMeasurementHeader(); } const extras = json(measurement.dados_extras); const y = doc.y; if (index % 2 === 1) doc.save().rect(38, y, 519, 23).fill('#f1f8f8').restore(); let x = 44; const cells = [value(measurement.numero_ponto, measurement.id), value(measurement.localizacao || measurement.elemento), value(extras.quantidade_verificada, '1'), number(measurement.requisito_nominal), `${number(measurement.valor_medido)} ${value(measurement.unidade, '')}`, dateTime(measurement.medido_em), resultLabel(measurement.resultado)]; cells.forEach((cell, cellIndex) => { doc.fillColor(cellIndex === 6 ? (measurement.resultado === 'CONFORME' ? '#08705f' : '#c53030') : '#10264a').font(cellIndex === 6 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(cell, x, y + 7, { width: widths[cellIndex] - 5, ellipsis: true }); x += widths[cellIndex]; }); doc.y = y + 23; });
  }
  if (links.length) { sectionTitle(doc, '6. Folhas vinculadas', folha, 42 + Math.ceil(links.length / 2) * 57 + 8); drawGrid(doc, links.map((link) => [link.numero, `${value(link.tipo_vinculo)} - ${statusLabel(link.status)} - ${resultLabel(link.resultado_lote)}`]), 2, folha); }
  if (rnc) { sectionTitle(doc, '7. RNC e tratamento', folha, 42 + 3 * 57 + 8); drawGrid(doc, [['RNC', `#${rnc.id}`], ['Status', value(rnc.status)], ['Gravidade', value(rnc.gravidade)], ['Título', rnc.titulo], ['Descrição', rnc.descricao], ['Ação corretiva', rnc.acao_corretiva]], 2, folha); }
  sectionTitle(doc, '8. Evidências anexadas', folha, 42 + Math.max(1, Math.ceil(evidences.length / 2)) * 57 + 8);
  if (evidences.length) drawGrid(doc, evidences.map((evidence) => [evidence.categoria || 'Documento', `${value(evidence.nome_arquivo)}${evidence.descricao ? ` - ${evidence.descricao}` : ''}`]), 2, folha); else { ensureSpace(doc, 32, folha); doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Nenhuma evidência anexada.'); doc.y += 26; }

  sectionTitle(doc, '9. Assinaturas e aprovação', folha);
  const signaturesByType = new Map(signatures.map((signature) => [signature.tipo, signature])); const signatureTypes = ['EXECUTANTE', 'INSPETOR', 'APROVADOR']; const signatureGap = 10; const cardWidth = (519 - signatureGap * 2) / 3; const cardHeight = 120;
  ensureSpace(doc, cardHeight + 8, folha); const signatureY = doc.y;
  signatureTypes.forEach((type, index) => { const x = 38 + index * (cardWidth + signatureGap); const signature = signaturesByType.get(type); doc.save().roundedRect(x, signatureY, cardWidth, cardHeight, 8).fillAndStroke(signature ? '#ecfbf5' : '#f8fafc', signature ? '#34d399' : '#cbd5e1').restore(); doc.fillColor(signature ? '#08705f' : '#64748b').font('Helvetica-Bold').fontSize(8).text(signature ? 'ASSINADO' : 'PENDENTE', x + 11, signatureY + 11); doc.fillColor('#075d62').font('Helvetica-Bold').fontSize(9).text(signatureLabel(type), x + 11, signatureY + 30); if (signature) { const imagePath = signatureFile(signature.assinatura_snapshot, signature.tenant_id || folha.tenant_id); if (imagePath) { try { doc.image(imagePath, x + 11, signatureY + 43, { fit: [cardWidth - 22, 38], align: 'left', valign: 'center' }); } catch { doc.fillColor('#64748b').font('Helvetica').fontSize(8).text('Assinatura registrada', x + 11, signatureY + 56); } } else doc.fillColor('#64748b').font('Helvetica').fontSize(8).text('Assinatura registrada', x + 11, signatureY + 56); doc.fillColor('#10264a').font('Helvetica-Bold').fontSize(8.5).text(value(signature.nome_snapshot), x + 11, signatureY + 84, { width: cardWidth - 22, ellipsis: true }); doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(`${value(signature.perfil_snapshot, 'Responsável')} - ${dateTime(signature.assinado_em)}`, x + 11, signatureY + 99, { width: cardWidth - 22, ellipsis: true }); } else { doc.fillColor('#64748b').font('Helvetica').fontSize(8).text('Aguardando a etapa correspondente.', x + 11, signatureY + 58, { width: cardWidth - 22 }); } }); doc.y = signatureY + cardHeight + 18;
  doc.fillColor('#55758a').font('Helvetica').fontSize(8).text('Documento emitido pelo sistema VETOR. As assinaturas e aprovações são registradas no fluxo eletrônico.', 38, doc.y, { width: 519, align: 'center' });

  const range = doc.bufferedPageRange(); for (let i = range.start; i < range.start + range.count; i += 1) { doc.switchToPage(i); doc.fontSize(7).fillColor('#64748b').text(`${folha.numero} - VETOR - Página ${i + 1} de ${range.count}`, 38, 790, { width: 519, align: 'center', lineBreak: false }); }
  doc.end(); return { buffer: await complete, filename: `${folha.numero}-rev-${folha.revisao}.pdf` };
}

module.exports = { generateFolhaVerificacaoPdfBuffer };

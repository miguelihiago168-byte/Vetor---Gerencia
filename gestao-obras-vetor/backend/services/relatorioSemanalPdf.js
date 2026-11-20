const { groupSelectedPhotos, warnPhoto } = require('./relatorioSemanalFotos');
const PDFDocument = require('pdfkit');
const { selectedActivities } = require('./relatorioSemanalService');
const number = value => value.toLocaleString('pt-BR', {maximumFractionDigits:2});
const percentage = value => value == null ? 'Indisp.' : number(value) + '%';
const change = value => value == null ? 'Indisp.' : (value > 0 ? '+' : '') + number(value) + ' p.p.';
const path=require('path');
const brandLogo=path.resolve(__dirname,'../assets/logo_vetor.png');
const BR = value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
const COLORS={text:'#203b50',muted:'#617786',blue:'#125479',green:'#008c98',red:'#ae4848',gold:'#63758b',border:'#d9e5e9',soft:'#f0f6f6',navy:'#102d42'};
function createWeeklyReportPdf(report) {
  const doc=new PDFDocument({size:'A4',margins:{top:42,left:42,right:42,bottom:48},bufferPages:true,info:{Title:`Relatório semanal - ${report.projeto}`}});
  const left=42, width=doc.page.width-84, bottom=doc.page.height-52;
  let cursor=42;
  const font=(size=9,bold=false,color=COLORS.text)=>doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(color);
  const measure=(text,w,size=9,bold=false)=>{font(size,bold);return doc.heightOfString(String(text||'—'),{width:w,lineGap:2});};
  const text=(value,x,y,w,size=9,bold=false,color=COLORS.text,extra={})=>{font(size,bold,color);doc.text(String(value??'—'),x,y,{width:w,lineGap:2,...extra});};
  function drawLogos(compact=false){
    const top=compact?16:23, size=compact?22:40;
    doc.image(brandLogo,left,top,{fit:[size,size]});
    if(!compact){text('VETOR',left+50,25,170,18,true,COLORS.text);text('GESTÃO DE OBRAS',left+51,49,170,7.5,true,COLORS.muted);}
    const slot=compact?71:104, cardWidth=slot-8;
    (report.logos_empresas||[]).slice(0,2).forEach((logo,i)=>{
      if(!logo.imagem)return;
      const x=left+width-2*slot+i*slot;
      if(!compact)doc.roundedRect(x,17,cardWidth,65,5).lineWidth(.6).fillAndStroke('#ffffff',COLORS.border);
      try{doc.image(Buffer.from(logo.imagem,'base64'),x+5,top,{fit:[cardWidth-10,compact?22:34],align:'center',valign:'center'});}
      catch{text(logo.nome||logo.papel,x+5,top,cardWidth-10,7,true,COLORS.muted,{height:25,ellipsis:true});}
      if(!compact)text(logo.papel,x+3,64,cardWidth-6,6.5,true,COLORS.muted,{align:'center',lineBreak:false});
    });
  }
  function newPage(){doc.addPage();drawLogos(true);text('RELATÓRIO SEMANAL',left+31,17,width-195,8,true,COLORS.navy);text(`${BR(report.inicio)} a ${BR(report.fim)}`,left+31,30,width-195,7,false,COLORS.muted);doc.moveTo(left,46).lineTo(left+width,46).lineWidth(.6).strokeColor(COLORS.border).stroke();cursor=60;}
  function ensure(height){if(cursor+height>bottom)newPage();}
  let sectionNumber=0;
  function section(title,subtitle='',reserve=35){const h=40+(subtitle?16:0);ensure(h+reserve);cursor+=14;sectionNumber++;text(String(sectionNumber).padStart(2,'0'),left,cursor+2,27,9,true,COLORS.green);text(title,left+34,cursor,width-34,13,true,COLORS.navy);cursor+=22;if(subtitle){text(subtitle,left+34,cursor,width-34,8.5,false,COLORS.muted);cursor+=16;}doc.moveTo(left+34,cursor).lineTo(left+width,cursor).lineWidth(.7).strokeColor(COLORS.border).stroke();cursor+=10;}
  function paragraph(value){const words=String(value||'—').split(/\s+/);let block='';for(const word of words){const next=block?`${block} ${word}`:word;if(measure(next,width)>180&&block){const h=measure(block,width);ensure(h+8);text(block,left,cursor,width);cursor+=h+8;block=word;}else block=next;}if(block){const h=measure(block,width);ensure(h+8);text(block,left,cursor,width);cursor+=h+8;}}
  function table(headers,rows,fractions,numeric=[]){const widths=fractions.map(n=>n*width);function heading(){doc.roundedRect(left,cursor,width,27,3).fill(COLORS.soft);let x=left;headers.forEach((h,i)=>{text(h,x+8,cursor+9,widths[i]-16,8,true,COLORS.blue,{align:numeric.includes(i)?'right':'left'});x+=widths[i];});cursor+=27;}
    ensure(62);heading();rows.forEach((row,index)=>{const height=Math.max(31,...row.map((s,i)=>measure(s,widths[i]-16,9,i===0)+18));if(height>bottom-85){paragraph(row.join('  |  '));return;}if(cursor+height>bottom){newPage();heading();}let x=left;row.forEach((s,i)=>{text(s,x+8,cursor+9,widths[i]-16,9,i===0,i===0?COLORS.blue:COLORS.text,{align:numeric.includes(i)?'right':'left'});x+=widths[i];});cursor+=height;doc.moveTo(left,cursor).lineTo(left+width,cursor).lineWidth(.4).strokeColor(COLORS.border).stroke();});cursor+=10;}
  drawLogos();
  const contentWidth=width*.63-34;
  const projectHeight=measure(report.projeto,contentWidth,13,true);
  const bandTop=94, bandHeight=Math.max(158,122+projectHeight);
  const divider=left+width*.64;
  doc.roundedRect(left,bandTop,width,bandHeight,5).fill(COLORS.navy);
  doc.rect(left,bandTop,5,bandHeight).fill('#13b6bd');
  text('ACOMPANHAMENTO DE OBRA',left+23,bandTop+21,contentWidth,8,true,'#86d8da',{characterSpacing:1});
  text('Relatório\nsemanal',left+23,bandTop+42,contentWidth,25,true,'#ffffff',{lineGap:-1});
  text(report.projeto,left+23,bandTop+105,contentWidth,13,true,'#d9eef0');
  doc.moveTo(divider,bandTop+20).lineTo(divider,bandTop+bandHeight-20).lineWidth(.6).strokeColor('#426474').stroke();
  const detailsX=divider+19, detailsWidth=left+width-detailsX-14;
  text('PERÍODO',detailsX,bandTop+23,detailsWidth,7.5,true,'#8ab8c1',{characterSpacing:.5});
  text(BR(report.inicio),detailsX,bandTop+40,detailsWidth,13,true,'#ffffff');
  text('a '+BR(report.fim),detailsX,bandTop+59,detailsWidth,13,true,'#ffffff');
  text('RDOs APROVADOS',detailsX,bandTop+100,detailsWidth,7.5,true,'#8ab8c1',{characterSpacing:.3});
  text(String(report.rdo_count||0),detailsX,bandTop+116,detailsWidth,14,true,'#ffffff');
  cursor=bandTop+bandHeight+19;
  const {executed:activities, next, summary} = selectedActivities(report);
  const photos = (report.fotos || []).filter(f => f.selecionada);
  const metrics=[[activities.length,'ATIVIDADES','executadas'],[next.length,'ATIVIDADES','programadas'],[percentage(report.comparativo_mao_obra?.atendimento_global),'MÃO DE OBRA','atendimento'],[report.clima_consolidado?.resumo?.dias_com_impacto ?? 'Indisp.','CLIMA','dias com impacto']];
  text('PANORAMA DA SEMANA',left,cursor,width,9,true,COLORS.navy,{characterSpacing:.6});cursor+=18;
  doc.roundedRect(left,cursor,width,70,4).fill(COLORS.soft);
  metrics.forEach(([n,label,detail],i)=>{const x=left+i*width/4;if(i)doc.moveTo(x,cursor+13).lineTo(x,cursor+57).lineWidth(.6).strokeColor(COLORS.border).stroke();text(label,x+12,cursor+10,width/4-24,7,true,COLORS.muted);text(n,x+12,cursor+23,width/4-24,19,true,COLORS.navy);text(detail,x+12,cursor+51,width/4-24,8,false,COLORS.muted);});cursor+=83;
  section('Atividades executadas na semana', 'Avanço físico acumulado na abertura e no encerramento do período', 65);
  if (activities.length) table(['Código','Atividade','Anterior','Atual','Evolução','Situação'], activities.map(a => [
    a.codigo, a.descricao + (a.data_conclusao ? '\nConclusão em ' + BR(a.data_conclusao) : ''),
    percentage(a.fisico.anterior), percentage(a.fisico.atual), change(a.fisico.evolucao), a.situacao === 'Indisponível' && !a.manual && a.status ? 'Indisp.\nRDO: '+a.status : a.situacao
  ]), [.10,.32,.12,.12,.13,.21],[2,3,4]);
  else paragraph('Nenhuma atividade selecionada no período.');
  section('Atividades programadas para a próxima semana', '', 65);
  if (next.length) table(['Código','Atividade','No corte','Situação','Prazo / previsão'],next.map(a => [
    a.codigo,a.descricao,percentage(a.fisico.atual),a.situacao,
    a.previsao ? 'Previsão: '+BR(a.previsao) : [a.inicio,a.fim].filter(Boolean).map(BR).join(' a ') || '—'
  ]),[.10,.32,.13,.19,.26],[2]);
  else paragraph('Nenhuma atividade selecionada.');
  section('Resumo do avanço físico', 'Atividades selecionadas • Indisp. = histórico indisponível', 65);
  if (summary.length) table(['Código','Atividade','Avanço no corte'],summary.map(a => [
    a.codigo,a.descricao,percentage(a.fisico.atual)
  ]),[.12,.65,.23],[2]);
  else paragraph('Nenhuma atividade selecionada.');
  section('Problemas e soluções');
  if(!(report.problemas||[]).length)paragraph('Nenhum apontamento registrado.');
  for(const p of report.problemas||[]){const col=(width-26)/2;const h=Math.max(measure(p.problema,col),measure(p.solucao,col));if(h>500){paragraph(`Problema: ${p.problema}`);paragraph(`Solução: ${p.solucao}`);}else{ensure(h+58);doc.roundedRect(left,cursor,width,h+48,5).fill(COLORS.soft);text('PROBLEMA',left+9,cursor+9,col,7.5,true,COLORS.red);text('SOLUÇÃO',left+col+17,cursor+9,col,7.5,true,COLORS.blue);text(p.problema,left+9,cursor+24,col);text(p.solucao,left+col+17,cursor+24,col);cursor+=h+36;}ensure(20);text(`Regularização prevista: ${BR(p.data)}`,left+9,cursor,width-18,8,true,COLORS.muted);cursor+=24;}
  const series=(report.curva_s_historica_indisponivel ? [] : report.curva_s?.serie||[]).filter(p=>p.data && p.data<=report.fim).slice().sort((a,b)=>a.data.localeCompare(b.data));
  section('Curva S',`Avanço acumulado até ${BR(report.fim)} • planejado e realizado`,series.length?260:30);
  if(!series.length)paragraph('Curva S histórica não disponível neste relatório.');else{
    const x=left+37,y=cursor+10,w=width-53,h=175;const maxValue=Math.max(...series.flatMap(p=>[Number(p.real)||0,Number(p.planejado)||0]));const ceiling=Math.min(100,Math.max(10,Math.ceil(maxValue/10)*10));
    for(let i=0;i<=4;i++){const value=ceiling*i/4,yy=y+h-h*i/4;doc.moveTo(x,yy).lineTo(x+w,yy).lineWidth(.5).strokeColor(COLORS.border).stroke();text(`${Math.round(value)}%`,left,yy-4,29,8,false,COLORS.muted,{align:'right'});}
    const first=Date.parse(series[0].data),last=Date.parse(series.at(-1).data);const px=p=>x+(last===first ? 0.5 :(Date.parse(p.data)-first)/(last-first))*w;
    for(const [key,color,dashed] of [['planejado',COLORS.blue,true],['real',COLORS.green,false]]){doc.save().lineWidth(2.2).strokeColor(color);if(dashed)doc.dash(5,{space:3});series.forEach((p,i)=>{const py=y+h-(Number(p[key])||0)/ceiling*h;if(i===0)doc.moveTo(px(p),py);else doc.lineTo(px(p),py);});doc.stroke().restore();const p=series.at(-1);doc.circle(px(p),y+h-(Number(p[key])||0)/ceiling*h,3).fill(color);}
    const ticks=[...new Set([0,Math.floor((series.length-1)/3),Math.floor((series.length-1)*2/3),series.length-1])];ticks.forEach(i=>text(BR(series[i].data),Math.max(left,Math.min(left+width-68,px(series[i])-34)),y+h+8,68,7.5,false,COLORS.muted,{align:'center'}));
    const latest=series.at(-1);text(`Planejado: ${Number(latest.planejado).toFixed(2).replace('.',',')}%`,x,y+h+30,w/2,9,true,COLORS.blue);text(`Realizado: ${Number(latest.real).toFixed(2).replace('.',',')}%`,x+w/2,y+h+30,w/2,9,true,COLORS.green);cursor=y+h+55;
  }
  section('Acompanhamento de suprimentos');
  if(report.suprimentos == null)paragraph('Informações de suprimentos indisponíveis para este relatório ou perfil.');
  else if(!report.suprimentos.length)paragraph('Nenhum suprimento disponível neste relatório.');
  for(const s of report.suprimentos||[]){const color=s.cor==='verde'?COLORS.green:s.cor==='vermelho'?COLORS.red:COLORS.gold;const h=measure(s.descricao,width-20,10,true);ensure(h+75);doc.rect(left,cursor,3,h+65).fill(color);text(s.situacao,left+12,cursor,width-20,8,true,color);text(s.descricao,left+12,cursor+15,width-24,10,true);cursor+=h+22;text(`Necessário: ${s.quantidade} ${s.unidade}  |  Recebido: ${s.recebida??'a conferir'}  |  Falta: ${s.restante??'a conferir'}`,left+12,cursor,width-24,8);cursor+=17;text(`Necessidade: ${BR(s.necessidade)}  •  Entrega prevista: ${BR(s.previsao)}`,left+12,cursor,width-24,8,false,COLORS.muted);cursor+=29;}
  const comparison = report.comparativo_mao_obra;
  section('Histograma de Mão de Obra — Previsto × Realizado','Médias diárias dos dias comparáveis no intervalo', 60);
  if (!comparison) paragraph('Comparativo indisponível para este relatório histórico.');
  else {
    if (comparison.incompleto) paragraph('Dados incompletos. As médias consideram somente dias com calendário, previsão e presença disponíveis em RDO aprovado.');
    const rows = comparison.funcoes || [];
    if (!rows.length) paragraph('Nenhuma função disponível no intervalo.');
    const chartRows = rows.filter(row => row.previsto != null || row.real != null);
    if (rows.length && !chartRows.length) {
      paragraph('As médias comparáveis estão indisponíveis. A tabela apresenta os valores registrados nos dias com RDO aprovado.');
      const daily = (comparison.dias || []).filter(day => day.rdo === 'completo' && (day.previsto != null || day.real != null));
      if (daily.length) table(['Data','Função','Previsto','Presença no RDO'], daily.map(day => [BR(day.data),day.funcao,day.previsto == null ? 'Indisp.' : String(day.previsto),day.real == null ? 'Indisp.' : String(day.real)]), [.20,.40,.20,.20],[2,3]);
    }
    for (let offset=0; offset<chartRows.length; offset+=5) {
      const group=chartRows.slice(offset,offset+5); ensure(170);
      const chartX=left+24, chartY=cursor+8, chartWidth=width-30, height=95;
      const max=Math.max(1,...group.flatMap(row=>[Number(row.previsto)||0,Number(row.real)||0]));
      doc.moveTo(chartX,chartY+height).lineTo(chartX+chartWidth,chartY+height).lineWidth(.5).strokeColor(COLORS.border).stroke();
      const slot=chartWidth/group.length;
      group.forEach((row,i)=>{
        const x=chartX+i*slot+slot/2;
        [[row.previsto,COLORS.blue,-19],[row.real,COLORS.green,1]].forEach(([value,color,dx])=>{
          if (value == null) return;
          const h=Number(value)/max*height;
          doc.rect(x+dx,chartY+height-h,18,Math.max(h,1)).fill(color);
        });
        text(row.funcao,chartX+i*slot+2,chartY+height+6,slot-4,7,false,COLORS.text,{align:'center',height:27,ellipsis:true});
      });
      cursor=chartY+height+39;
      text('Azul: previsto médio   •   Ciano: real médio',left,cursor,width,8,false,COLORS.muted); cursor+=18;
    }
    if (rows.length) table(['Função','Previsto','Real','Diferença','Atendimento','Dias'], rows.map(row=>[
      row.funcao,row.previsto==null?'—':number(row.previsto),row.real==null?'—':number(row.real),row.diferenca==null?'—':number(row.diferenca),percentage(row.atendimento),`${row.dias_comparaveis}/${row.dias_considerados}`
    ]),[.25,.14,.13,.15,.19,.14],[1,2,3,4,5]);
    paragraph(`Atendimento global: ${percentage(comparison.atendimento_global)}.`);
  }
  if (!comparison) {
  const workforce=report.efetivo||[];
  section('Presença por função','Quantidades informadas nos RDOs aprovados por dia', 65);
  if(workforce.length) table(['Data','Função','Presença'],workforce.map(row=>[BR(row.data),row.funcao,number(Number(row.quantidade))]),[.24,.51,.25],[2]);
  else paragraph('Sem presença registrada.');
  }
  section('Condições climáticas', `Período analisado: ${BR(report.inicio)} a ${BR(report.fim)}`, 130);
  const climate = report.clima_consolidado;
  if (climate) {
    const s = climate.resumo;
    paragraph(`Operação prevista: ${s.dias_operacao_prevista ?? 'Indisp.'} dias  •  Dias com clima: ${s.dias_com_clima}  •  Dias com impacto: ${s.dias_com_impacto}  •  Sem informação: ${s.dias_sem_informacao}  •  Paralisação registrada: ${s.horas_paralisacao == null ? 'Indisponível' : number(s.horas_paralisacao)+' h'+(s.horas_incompletas?' (parcial)':'')}`);
    table(['Dia / data','Condições por período','Situação','Paralisação'], climate.dias.map(d => [
      `${d.dia_semana || ''}\n${BR(d.data)}`, d.periodos.length ? d.periodos.map(p => `${p.periodo || 'Período não informado'}: ${p.condicao_tempo || 'clima não informado'}${p.condicao_trabalho ? ' / '+p.condicao_trabalho : ''}`).join('\n') : d.presenca === 'sem_operacao' ? 'Sem operação prevista.' : d.presenca === 'sem_rdo' ? 'Sem RDO no período.' : d.presenca === 'sem_rdo_aprovado' ? 'Sem RDO aprovado no período.' : 'Clima não informado.',
      d.situacao, d.horas_paralisacao == null ? 'Indisp.' : number(d.horas_paralisacao)+' h'+(d.horas_incompletas?' (parcial)':'')
    ]), [.18,.40,.25,.17]);
  } else if(report.clima?.length) { paragraph('Relatório histórico: consolidação diária e lacunas indisponíveis.'); table(['Data / período','Condição','Chuva'],report.clima.map(c=>[`${BR(c.data)} • ${c.periodo}`,`${c.condicao_tempo||'—'}${c.condicao_trabalho?' / '+c.condicao_trabalho:''}`,c.pluviometria_mm == null ? 'Indisp.' : `${number(Number(c.pluviometria_mm))} mm`]),[.32,.53,.15]); }
  else paragraph('Relatório histórico: informações climáticas indisponíveis.');
  const groups = groupSelectedPhotos(photos);
  section('Registro fotográfico', '', groups.length ? 235 : 25);
  if (!groups.length) paragraph('Nenhuma foto selecionada.');

  // Split exceptionally long captions across pages without truncating their content.
  function fitCaption(value, w, available) {
    if (!value || measure(value,w,9) <= available) return [value, ''];
    let low = 0, high = value.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (measure(value.slice(0,mid),w,9) <= available) low = mid;
      else high = mid - 1;
    }
    const word = value.lastIndexOf(' ',low);
    const end = word > 0 ? word : Math.max(low,1);
    return [value.slice(0,end),value.slice(end).trimStart()];
  }
  for (const group of groups) {
    const gap = 14;
    for (let offset = 0; offset < group.photos.length; offset += 2) {
      const row = group.photos.slice(offset,offset+2);
      const cell = (width-gap)/2;
      const imageHeight = 153;
      let captions = row.map(photo => [
        [photo.rdo_id && 'RDO #' + photo.rdo_id, BR(photo.data), photo.id && 'Foto #' + photo.id].filter(Boolean).join(' · '),
        photo.atividade_eap_id == null && photo.atividade !== group.title ? photo.atividade : '',
        photo.descricao
      ].filter(Boolean).join('\n'));
      const captionHeight = Math.max(...captions.map(c => measure(c,cell,9)));
      const titleHeight = measure(group.title,width,11,true);
      ensure(Math.min(titleHeight,80)+imageHeight+Math.min(captionHeight,110)+38);
      if (titleHeight > 80) paragraph(group.title);
      else { text(group.title,left,cursor,width,11,true,COLORS.blue); cursor+=titleHeight+7; }
      ensure(imageHeight+36);
      for (const [index,photo] of row.entries()) {
        const x = left+index*(cell+gap);
        doc.roundedRect(x,cursor,cell,imageHeight,4).fill(COLORS.soft);
        if (photo.imagem && !photo.aviso) {
          try {
            doc.image(Buffer.from(photo.imagem,'base64'),x+3,cursor+3,
              {fit:[cell-6,imageHeight-6],align:'center',valign:'center'});
          } catch(error) { warnPhoto(photo,error); }
        }
        if (photo.aviso || !photo.imagem) text('Imagem indisponível',x,cursor+imageHeight/2-6,cell,10,false,COLORS.muted,{align:'center'});
      }
      cursor += imageHeight+7;
      while (captions.some(Boolean)) {
        const chunks = captions.map(value => fitCaption(value,cell,bottom-cursor-5));
        chunks.forEach(([chunk],index) => { if (chunk) text(chunk,left+index*(cell+gap),cursor,cell,9); });
        cursor += Math.max(...chunks.map(([chunk]) => chunk ? measure(chunk,cell,9) : 0))+5;
        captions = chunks.map(([,rest]) => rest);
        if (captions.some(Boolean)) { newPage(); paragraph(group.title+' · continuação'); }
      }
      cursor += 12;
    }
  }
  // Footer text must never participate in PDFKit's automatic page flow.
  const pages=doc.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){doc.switchToPage(i);const old=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.moveTo(left,doc.page.height-38).lineTo(left+width,doc.page.height-38).lineWidth(.5).strokeColor(COLORS.border).stroke();text(`${BR(report.inicio)} a ${BR(report.fim)} • VETOR`,left,doc.page.height-28,width-65,7.5,false,COLORS.muted,{lineBreak:false});text(`${i+1} / ${pages.count}`,left+width-60,doc.page.height-28,60,7.5,false,COLORS.muted,{align:'right',lineBreak:false});doc.page.margins.bottom=old;}
  return doc;
}
module.exports={createWeeklyReportPdf};

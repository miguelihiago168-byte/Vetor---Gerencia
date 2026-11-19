const { groupSelectedPhotos, warnPhoto } = require('./relatorioSemanalFotos');
const PDFDocument = require('pdfkit');
const { selectedActivities } = require('./relatorioSemanalService');
const number = value => value.toLocaleString('pt-BR', {maximumFractionDigits:2});
const percentage = value => value == null ? 'Indisp.' : number(value) + '%';
const change = value => value == null ? 'Indisp.' : (value > 0 ? '+' : '') + number(value) + ' p.p.';
const path=require('path');
const brandLogo=path.resolve(__dirname,'../assets/logo_vetor.png');
const BR = value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
const COLORS={text:'#193049',muted:'#63758b',blue:'#245fa9',green:'#168168',red:'#bc4141',gold:'#a57319',border:'#dfe7f0',soft:'#f3f6fa'};
const palette=['#2864af','#168b77','#d09b32','#855bc0','#d66c55','#458ea7','#777f40','#bb5791'];
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
  function newPage(){doc.addPage();drawLogos(true);text('RELATÓRIO SEMANAL',left+31,17,width-195,8,true,COLORS.blue);text(`${BR(report.inicio)} a ${BR(report.fim)}`,left+31,30,width-195,7,false,COLORS.muted);doc.moveTo(left,46).lineTo(left+width,46).lineWidth(.6).strokeColor(COLORS.border).stroke();cursor=57;}
  function ensure(height){if(cursor+height>bottom)newPage();}
  function section(title,subtitle='',reserve=35){const h=30+(subtitle?18:0);ensure(h+reserve);cursor+=10;text(title,left,cursor,width,13,true);cursor+=21;if(subtitle){text(subtitle,left,cursor,width,8,false,COLORS.muted);cursor+=18;}doc.moveTo(left,cursor).lineTo(left+width,cursor).lineWidth(.6).strokeColor(COLORS.border).stroke();cursor+=10;}
  function paragraph(value){const words=String(value||'—').split(/\s+/);let block='';for(const word of words){const next=block?`${block} ${word}`:word;if(measure(next,width)>180&&block){const h=measure(block,width);ensure(h+8);text(block,left,cursor,width);cursor+=h+8;block=word;}else block=next;}if(block){const h=measure(block,width);ensure(h+8);text(block,left,cursor,width);cursor+=h+8;}}
  function table(headers,rows,fractions,numeric=[]){const widths=fractions.map(n=>n*width);function heading(){doc.rect(left,cursor,width,23).fill(COLORS.soft);let x=left;headers.forEach((h,i)=>{text(h,x+7,cursor+7,widths[i]-14,7.5,true,COLORS.muted,{align:numeric.includes(i)?'right':'left'});x+=widths[i];});cursor+=23;}
    ensure(55);heading();rows.forEach((row,index)=>{const height=Math.max(26,...row.map((s,i)=>measure(s,widths[i]-14,8.5,i===0)+14));if(height>bottom-85){paragraph(row.join('  |  '));return;}if(cursor+height>bottom){newPage();heading();}if(index%2===1)doc.rect(left,cursor,width,height).fill('#fafbfd');let x=left;row.forEach((s,i)=>{text(s,x+7,cursor+7,widths[i]-14,8.5,i===0,COLORS.text,{align:numeric.includes(i)?'right':'left'});x+=widths[i];});cursor+=height;doc.moveTo(left,cursor).lineTo(left+width,cursor).lineWidth(.4).strokeColor(COLORS.border).stroke();});cursor+=8;}
  drawLogos();
  const projectHeight=measure(report.projeto,width-30,12,true);
  const bandTop=94, bandHeight=83+projectHeight;
  doc.rect(0,bandTop,doc.page.width,bandHeight).fill('#142d4b');
  doc.rect(left,bandTop+19,27,3).fill('#38bdc8');
  text('PLANEJAMENTO  /  ACOMPANHAMENTO DA OBRA',left+37,bandTop+17,width-37,7.5,true,'#9edce5');
  text('Relatório semanal',left,bandTop+36,width,25,true,'#ffffff');
  text(report.projeto,left,bandTop+70,width-30,12,true,'#e2edf8');
  cursor=bandTop+bandHeight+12;
  const metaWidths=[width*.49,width*.29,width*.22];let metaX=left;
  [['PERÍODO DO RELATÓRIO',`${BR(report.inicio)} a ${BR(report.fim)}`],['DATA DE CORTE',BR(report.fim)],['RDOs APROVADOS',String(report.rdo_count||0)]].forEach(([label,value],i)=>{
    doc.roundedRect(metaX,cursor,metaWidths[i]-6,44,5).fill(COLORS.soft);
    text(label,metaX+10,cursor+8,metaWidths[i]-24,6.5,true,COLORS.muted);
    text(value,metaX+10,cursor+23,metaWidths[i]-24,10,true,COLORS.text);
    metaX+=metaWidths[i];
  });cursor+=57;
  const {executed:activities, next, summary} = selectedActivities(report);
  const photos = (report.fotos || []).filter(f => f.selecionada);
  const metrics=[[activities.filter(a=>(a.status || a.situacao)==='Concluída').length,'CONCLUÍDAS'],[activities.filter(a=>(a.status || a.situacao)==='Em andamento').length,'EM ANDAMENTO'],[next.length,'PROGRAMADAS'],[photos.length,'FOTOS']];
  metrics.forEach(([n,label],i)=>{const x=left+i*width/4;doc.roundedRect(x,cursor,width/4-6,53,5).fill(COLORS.soft);text(n,x+11,cursor+8,width/4-20,18,true,COLORS.blue);text(label,x+11,cursor+34,width/4-20,7,true,COLORS.muted);});cursor+=64;
  section('Problemas e soluções');
  if(!(report.problemas||[]).length)paragraph('Nenhum apontamento registrado.');
  for(const p of report.problemas||[]){const col=(width-26)/2;const h=Math.max(measure(p.problema,col),measure(p.solucao,col));if(h>500){paragraph(`Problema: ${p.problema}`);paragraph(`Solução: ${p.solucao}`);}else{ensure(h+58);doc.roundedRect(left,cursor,width,h+48,5).fill(COLORS.soft);text('PROBLEMA',left+9,cursor+9,col,7.5,true,COLORS.red);text('SOLUÇÃO',left+col+17,cursor+9,col,7.5,true,COLORS.blue);text(p.problema,left+9,cursor+24,col);text(p.solucao,left+col+17,cursor+24,col);cursor+=h+36;}ensure(20);text(`Regularização prevista: ${BR(p.data)}`,left+9,cursor,width-18,8,true,COLORS.muted);cursor+=24;}
  const series=(report.curva_s?.serie||[]).filter(p=>p.data && p.data<=report.fim).slice().sort((a,b)=>a.data.localeCompare(b.data));
  section('Curva S',`Avanço acumulado até ${BR(report.fim)} • planejado e realizado`,series.length?260:30);
  if(!series.length)paragraph('Curva S não disponível neste relatório.');else{
    const x=left+37,y=cursor+10,w=width-53,h=175;const maxValue=Math.max(...series.flatMap(p=>[Number(p.real)||0,Number(p.planejado)||0]));const ceiling=Math.min(100,Math.max(10,Math.ceil(maxValue/10)*10));
    for(let i=0;i<=4;i++){const value=ceiling*i/4,yy=y+h-h*i/4;doc.moveTo(x,yy).lineTo(x+w,yy).lineWidth(.5).strokeColor(COLORS.border).stroke();text(`${Math.round(value)}%`,left,yy-4,29,8,false,COLORS.muted,{align:'right'});}
    const first=Date.parse(series[0].data),last=Date.parse(series.at(-1).data);const px=p=>x+(last===first ? 0.5 :(Date.parse(p.data)-first)/(last-first))*w;
    for(const [key,color,dashed] of [['planejado',COLORS.blue,true],['real',COLORS.green,false]]){doc.save().lineWidth(2.2).strokeColor(color);if(dashed)doc.dash(5,{space:3});series.forEach((p,i)=>{const py=y+h-(Number(p[key])||0)/ceiling*h;if(i===0)doc.moveTo(px(p),py);else doc.lineTo(px(p),py);});doc.stroke().restore();const p=series.at(-1);doc.circle(px(p),y+h-(Number(p[key])||0)/ceiling*h,3).fill(color);}
    const ticks=[...new Set([0,Math.floor((series.length-1)/3),Math.floor((series.length-1)*2/3),series.length-1])];ticks.forEach(i=>text(BR(series[i].data),Math.max(left,Math.min(left+width-68,px(series[i])-34)),y+h+8,68,7.5,false,COLORS.muted,{align:'center'}));
    const latest=series.at(-1);text(`Planejado: ${Number(latest.planejado).toFixed(2).replace('.',',')}%`,x,y+h+30,w/2,9,true,COLORS.blue);text(`Realizado: ${Number(latest.real).toFixed(2).replace('.',',')}%`,x+w/2,y+h+30,w/2,9,true,COLORS.green);cursor=y+h+55;
  }
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
  section('Acompanhamento de suprimentos');
  text('VERDE: recebido   •   AMARELO: pendente / conferir   •   VERMELHO: atraso',left,cursor,width,7.5,true,COLORS.muted);cursor+=22;
  if(!report.suprimentos?.length)paragraph('Nenhum suprimento disponível neste relatório.');
  for(const s of report.suprimentos||[]){const color=s.cor==='verde'?COLORS.green:s.cor==='vermelho'?COLORS.red:COLORS.gold;const h=measure(s.descricao,width-20,10,true);ensure(h+75);doc.rect(left,cursor,3,h+65).fill(color);text(s.situacao,left+12,cursor,width-20,8,true,color);text(s.descricao,left+12,cursor+15,width-24,10,true);cursor+=h+22;text(`Necessário: ${s.quantidade} ${s.unidade}  |  Recebido: ${s.recebida??'a conferir'}  |  Falta: ${s.restante??'a conferir'}`,left+12,cursor,width-24,8);cursor+=17;text(`Necessidade: ${BR(s.necessidade)}  •  Entrega prevista: ${BR(s.previsao)}`,left+12,cursor,width-24,8,false,COLORS.muted);cursor+=29;}
  const workforce=report.efetivo||[], dates=[...new Set(workforce.map(r=>r.data))].sort();
  section('Presença por função','Quantidade de pessoas por função e dia',workforce.length?215:25);
  if(!workforce.length)paragraph('Sem presença registrada.');
  for(const date of dates){const rows=workforce.filter(r=>r.data===date);for(let offset=0;offset<rows.length;offset+=7){const group=rows.slice(offset,offset+7);if(cursor+210>bottom){newPage();text('Presença por função • continuação',left,cursor,width,10,true);cursor+=22;}text(BR(date),left,cursor,width,9,true);cursor+=24;const x=left+26,y=cursor,h=105,w=width-36,max=Math.max(1,...group.map(r=>Number(r.quantidade)||0));const ceiling=Math.max(1,Math.ceil(max*1.15));const tickStep=Math.max(1,Math.ceil(ceiling/4));for(let value=0;value<=ceiling;value+=tickStep){const yy=y+h-h*value/ceiling;doc.moveTo(x,yy).lineTo(x+w,yy).lineWidth(.5).strokeColor(COLORS.border).stroke();text(value,left,yy-4,18,7,false,COLORS.muted,{align:'right'});}const slot=w/group.length;group.forEach((r,i)=>{const n=Number(r.quantidade)||0,bh=n/ceiling*h,bw=Math.min(43,slot*.48),bx=x+i*slot+(slot-bw)/2;doc.rect(bx,y+h-bh,bw,Math.max(1,bh)).fill(palette[i%palette.length]);text(n,bx-8,y+h-bh-17,bw+16,9,true,COLORS.text,{align:'center'});text(r.funcao,x+i*slot+3,y+h+8,slot-6,7.5,true,COLORS.text,{align:'center',height:32,ellipsis:true});text(`${n} pessoa(s)`,x+i*slot+3,y+h+43,slot-6,7,false,COLORS.muted,{align:'center'});});cursor=y+h+67;}}
  section('Condições climáticas');if(report.clima?.length)table(['Data / período','Condição','Chuva'],report.clima.map(c=>[`${BR(c.data)} • ${c.periodo}`,`${c.condicao_tempo||'—'}${c.condicao_trabalho?' / '+c.condicao_trabalho:''}`,`${Number(c.pluviometria_mm||0)} mm`]),[.32,.53,.15]);else paragraph('Sem condições climáticas registradas.');
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
      const cell = (width-gap*(row.length-1))/row.length;
      const imageHeight = row.length === 2 ? 153 : 180;
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

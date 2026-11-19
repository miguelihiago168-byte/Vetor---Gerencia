const assert=require('assert/strict');
const {createWeeklyReportPdf}=require('../services/relatorioSemanalPdf');
const base={projeto:'Obra de teste',inicio:'2026-10-05',fim:'2026-10-11',rdo_count:0,atividades:[],proximas:[],problemas:[],eap:[],suprimentos:[],efetivo:[],clima:[],fotos:[]};
async function selectedCatalogPdf() {
  const fs=require('node:fs'),path=require('node:path');
  const names=['Fundação das estruturas','Montagem de trackers','Lançamento de cabos CC','Montagem dos módulos','Inspeção de aterramento'];
  const values=[[40,65],[15,45],[60,55],[0,0],[null,null]];
  const eap=Array.from({length:200},(_,i)=>{
    const [anterior,atual]=values[i] || [0,0];
    return {id:i+1,codigo:'5.'+(i+1),nome:names[i] || 'Fora da seleção '+(i+1),
      fisico:{anterior,atual,evolucao:anterior==null?null:atual-anterior,
        situacao:atual==null?null:atual===0?'Não iniciada':'Em andamento'}};
  });
  const report={...base,projeto:'Obra demonstrativa · Usina solar',rdo_count:3,eap,
    atividades:eap.slice(0,3).map(a=>({key:'eap:'+a.id,executada:true,incluir:a.id===2,previsao:a.id===2?'2026-10-15':null})),
    proximas:eap.slice(3).map(a=>({key:'eap:'+a.id,incluir:a.id<=5,inicio:'2026-10-12',fim:'2026-10-16'})),
    suprimentos:[{descricao:'Módulos solares',situacao:'Recebido',cor:'verde',quantidade:20,unidade:'un',recebida:20,restante:0}],
    efetivo:[{data:'2026-10-08',funcao:'Eletricista',quantidade:4}],
    clima:[{data:'2026-10-08',periodo:'Manhã',condicao_tempo:'Claro',pluviometria_mm:0}],
    fotos:[{selecionada:true,data:'2026-10-08',atividade:'Área da usina',descricao:'Imagem ilustrativa para homologação.',
      imagem:fs.readFileSync(path.join(__dirname,'../../frontend/public/auth-solar-plant.png')).toString('base64')}]};
  const pages=await generate(report,4,process.env.WEEKLY_PDF_SAMPLE);
  assert.equal(pages,await generate({...report,eap:eap.slice(0,5)},4));
  const many=eap.slice(0,24).map(a=>({...a,nome:'Instalação e verificação de cabos em diferentes frentes de serviço. '.repeat(3)}));
  const continued=await generate({...base,eap:many,atividades:many.map(a=>({key:'eap:'+a.id,executada:true}))},10);
  assert.ok(continued>2,'descrições extensas exercitam a continuação das tabelas');
  console.log('PDF com cinco atividades selecionadas de 200: '+pages+' páginas, igual ao catálogo de cinco.');
}
async function generate(report,maxPages,output){const doc=createWeeklyReportPdf(report);const pageCount=doc.bufferedPageRange().count;assert.ok(pageCount<=maxPages,`Paginação excessiva: ${pageCount} > ${maxPages}`);const chunks=[];const done=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',resolve);doc.on('error',reject);});doc.end();await done;const raw=Buffer.concat(chunks).toString('latin1');if(output) require('node:fs').writeFileSync(output,Buffer.concat(chunks));const finalCount=(raw.match(/\/Type\s*\/Page\b/g)||[]).length;assert.equal(finalCount,pageCount,'A finalização/rodapé não pode criar páginas extras');return pageCount;}
(async()=>{await generate(base,2);await generate({...base,curva_s:{serie:[{data:'2026-10-05',planejado:2,real:1}]},efetivo:[{data:'2026-10-05',funcao:'Eletricista',quantidade:0}]},3);const eap=Array.from({length:85},(_,i)=>({codigo:`1.${i+1}`,nome:'Instalação e acompanhamento das frentes de trabalho com documentação e registro da execução',status:'Em andamento',percentual:35}));await generate({...base,eap},8);await generate({...base,problemas:[{problema:'Problema longo. '.repeat(180),solucao:'Solução prevista. '.repeat(180),data:'2026-10-15'}]},6);await selectedCatalogPdf();console.log('PDF: paginação, rodapés e casos de gráficos validados.');})().catch(error=>{console.error(error);process.exitCode=1;});

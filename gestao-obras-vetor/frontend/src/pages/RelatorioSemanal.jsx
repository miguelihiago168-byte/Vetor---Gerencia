import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, LabelList, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Sun, CloudRain, Cloud, CloudSun, Wind, Search, CalendarDays, CheckCircle2, ListTodo, Camera, UsersRound, FileDown, RefreshCw, Save, ImageOff, Eye, X } from 'lucide-react';
import api from '../services/api';
import './RelatorioSemanal.css';
const fmt = d => d ? String(d).slice(0,10).split('-').reverse().join('/') : '—';
const shift = (s,n) => { const d=new Date(`${s}T12:00:00`); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const today = () => {const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const numeric = value => value.toLocaleString('pt-BR', {maximumFractionDigits:2});
const percentage = value => value == null ? 'Indisponível' : numeric(value) + '%';
const change = value => value == null ? 'Indisponível' : (value > 0 ? '+' : '') + numeric(value) + ' p.p.';

// Send editable choices only. The server owns the catalog and period evidence.
function choices(data) {
 return {inicio:data.inicio, fim:data.fim, problemas:data.problemas,revisao_atividades:data.revisao_atividades,
  atividades:data.atividades.map(({key,status,executada,incluir,previsao}) => ({key,status,executada,incluir,previsao})),
  proximas:data.proximas.filter(a => a.incluir).map(({key}) => ({key,incluir:true})),
  fotos:data.fotos.map(({id,selecionada,descricao}) => ({id,selecionada,descricao}))};
}
function Photo({photo,reportId,base}) {
 const [src,setSrc]=useState(''); const [failed,setFailed]=useState(false);
 useEffect(()=>{let live=true,url=''; setSrc('');setFailed(false); const current=()=>api.get(`${base}/fotos/${photo.id}`,{responseType:'blob'}); (reportId && photo.selecionada ? api.get(`${base}/${reportId}/foto/${photo.id}`,{responseType:'blob'}).catch(current) : current()).then(r=>{url=URL.createObjectURL(r.data);if(live)setSrc(url);else URL.revokeObjectURL(url);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;if(url)URL.revokeObjectURL(url);};},[photo.id,photo.selecionada,reportId,base]);
 return src?<img src={src} alt={photo.descricao || 'Foto do RDO'} onError={()=>{setSrc('');setFailed(true);}}/>:<div className="rs-photo-empty">{failed?<><ImageOff size={22}/><span>Arquivo indisponível</span></>:<span>Carregando foto...</span>}</div>;
}
function Icon({condition}) {const c=String(condition||'').toLowerCase(); if(c.includes('chuv'))return <CloudRain/>;if(c.includes('nublado'))return <Cloud/>;if(c.includes('parcial'))return <CloudSun/>;if(c.includes('vento'))return <Wind/>;if(c.includes('claro')||c.includes('sol'))return <Sun/>;return <Cloud/>;}
export default function RelatorioSemanal() {
 const {projetoId}=useParams(); const base=`/relatorios-semanais/projeto/${projetoId}`;
 const [inicio,setInicio]=useState(shift(today(),-6)),[fim,setFim]=useState(today()),[history,setHistory]=useState([]),[data,setData]=useState(null),[id,setId]=useState(null),[updated,setUpdated]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('sugeridas'),[showAll,setShowAll]=useState(false),[eapSearch,setEapSearch]=useState(''),[eapAll,setEapAll]=useState(false);
 const [executionSearch,setExecutionSearch]=useState('');
 const [stage,setStage]=useState('visao'),[previewUrl,setPreviewUrl]=useState(''),[curveRefresh,setCurveRefresh]=useState(false);
 const historyLoad=()=>api.get(base).then(r=>setHistory(r.data)); useEffect(()=>{historyLoad().catch(()=>setError('Não foi possível carregar o histórico.'));},[base]);
 const work=async fn=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e.response?.data?.erro||e.message||'Não foi possível concluir a operação.');}finally{setBusy(false);}};
 const loadCurve=async()=>{const r=await api.get(`${base}/curva-s`,{params:{corte:data?.fim || fim}});return r.data;};
 const prepare=()=>work(async()=>{const diff=(Date.parse(`${fim}T00:00:00Z`)-Date.parse(`${inicio}T00:00:00Z`))/86400000;if(!inicio||!fim||!Number.isFinite(diff)||diff<0||diff>6)throw Error('Selecione um período válido de até sete dias.');const r=await api.get(`${base}/fontes`,{params:{inicio,fim}});setData(r.data);setId(null);setUpdated(false);setCurveRefresh(false);setStage('visao');});
 const open=x=>work(async()=>{const r=await api.get(`${base}/${x}`);setData(r.data.conteudo);setId(r.data.id);setInicio(r.data.inicio);setFim(r.data.fim);setUpdated(false);setCurveRefresh(false);});
 const update=(field,key,changes)=>setData(d=>({...d,[field]:d[field].map(x=>x.key===key?{...x,...changes}:x)}));
 const photoUpdate=(key,changes)=>setData(d=>({...d,fotos:d.fotos.map(x=>x.id===key?{...x,...changes}:x)}));
 const save=()=>work(async()=>{const r=id?await api.put(`${base}/${id}`,{...choices(data),atualizar_fontes:updated,atualizar_curva:curveRefresh}):await api.post(base,choices(data));setData(r.data.conteudo);setId(r.data.id);setUpdated(false);setCurveRefresh(false);setNotice('Relatório salvo.');await historyLoad();});
 const refresh=()=>work(async()=>{
   const r=await api.post(`${base}/${id}/atualizar`,choices(data));
   setData(r.data);setUpdated(true);setNotice('Fontes atualizadas para revisão. Salve para registrar as alterações.');
 });
 const updateCurve=()=>work(async()=>{const curve=await loadCurve();setData(d=>({...d,curva_s:curve}));setCurveRefresh(true);setNotice('Curva S atualizada para este relatório.');});
 const preview=()=>work(async()=>{let r;try{r=await api.post(`${base}/preview`,{...choices(data),relatorio_id:id,atualizar_fontes:updated,atualizar_curva:curveRefresh},{responseType:'blob'});}catch(e){if(e.response?.data instanceof Blob){try{const body=JSON.parse(await e.response.data.text());throw new Error(body.erro || 'Não foi possível gerar a prévia.');}catch(parsed){if(parsed instanceof SyntaxError)throw new Error('Não foi possível gerar a prévia.');throw parsed;}}throw e;}const url=URL.createObjectURL(r.data);setPreviewUrl(old=>{if(old)URL.revokeObjectURL(old);return url;});});
 const closePreview=()=>setPreviewUrl(old=>{if(old)URL.revokeObjectURL(old);return '';});
 useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);},[previewUrl]);
 const selected=data?.fotos.filter(f=>f.selecionada).length||0; const roles=[...new Set((data?.efetivo||[]).map(x=>x.funcao))];const dates=[...new Set((data?.efetivo||[]).map(x=>x.data))];const chart=dates.map(date=>{const row={data:fmt(date)};(data?.efetivo||[]).filter(x=>x.data===date).forEach(x=>{row[x.funcao]=(row[x.funcao]||0)+x.quantidade;});return row;});
 const catalog = new Map((data?.eap || []).map(a => ['eap:'+a.id,a]));
 const weekly = data?.atividades || [];
 const executed = weekly.filter(a => a.executada !== false);
 const situation = a => catalog.get(a.key)?.fisico?.situacao || (a.key.startsWith('avulsa:') && a.status) || 'Indisponível';
 const isCompleted = a => {
   const item=catalog.get(a.key);
   const complete=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='concluida';
   return complete(item?.status) || complete(item?.fisico?.situacao) || complete(a.status) ||
     Number(item?.percentual) >= 100 || Number(item?.fisico?.atual) >= 100;
 };
 const completed = executed.filter(a => a.status==='Concluída').length;
 const pending = executed.filter(a => a.status==='Em andamento');
 const continuations = weekly.filter(a => a.incluir && !isCompleted(a));
 const continuationKeys = new Set(continuations.map(a=>a.key));
 const scheduled = [...(data?.proximas || []).filter(a=>a.incluir && !isCompleted(a)),...continuations];
 const planned = new Set(scheduled.map(a => a.key)).size;
 const summary = [...new Map([...executed,...scheduled].map(a => [a.key,a])).values()];
 const weeklyKeys = new Set(weekly.map(a => a.key));
 const hierarchy = [];
 const children = new Map();
 for (const activity of data?.eap || []) {
   if (activity.fonte_ausente) continue;
   const parent = activity.pai_id == null ? '' : String(activity.pai_id);
   if (!children.has(parent)) children.set(parent, []);
   children.get(parent).push(activity);
 }
 const visited = new Set();
 const appendActivities = (items, depth) => {
   for (const activity of items) {
     const key = String(activity.id);
     if (visited.has(key)) continue;
     visited.add(key);
     hierarchy.push({activity, depth, parent:children.has(key)});
     appendActivities(children.get(key) || [], depth + 1);
   }
 };
 appendActivities(children.get('') || [], 0);
 appendActivities((data?.eap || []).filter(a => !a.fonte_ausente && !visited.has(String(a.id))), 0);
 const executionQuery = executionSearch.trim().toLocaleLowerCase('pt-BR');
 const executionOptions = hierarchy.filter(({activity}) =>
   `${activity.codigo || ''} ${activity.nome}`.toLocaleLowerCase('pt-BR').includes(executionQuery));
 const addExecution = key => {
   const item=catalog.get(key);
   if (!item || weeklyKeys.has(key)) return;
   setData(d => ({...d,atividades:[...d.atividades,{key,nome:[item.codigo,item.nome].filter(Boolean).join(' — '),
     status:item.fisico?.situacao || 'Indisponível',manual:true,executada:true,incluir:false,previsao:''}]}));
 };
 const endNext=data ? shift(data.fim,7) : '';
 const upcoming=(data?.proximas||[]).filter(a=>{if(isCompleted(a)||continuationKeys.has(a.key))return false;const q=search.trim().toLocaleLowerCase('pt-BR');if(q&&!a.nome.toLocaleLowerCase('pt-BR').includes(q))return false;if(filter==='selecionadas')return a.incluir;if(filter==='sugeridas')return a.incluir || (a.inicio && a.inicio<=endNext && (!a.fim||a.fim>data.fim));return true;}).sort((a,b)=>Number(b.incluir)-Number(a.incluir)||String(a.inicio||'9999').localeCompare(String(b.inicio||'9999')));
 const eap=(data?.eap||[]).filter(a=>`${a.codigo||''} ${a.nome}`.toLocaleLowerCase('pt-BR').includes(eapSearch.trim().toLocaleLowerCase('pt-BR')));
 const problems=data?.problemas||[];
 const editProblem=(index,key,value)=>setData(d=>({...d,problemas:(d.problemas||[]).map((p,i)=>i===index?{...p,[key]:value}:p)}));
 return <div className={`rs-page rs-stage-${stage}`}><header><span>PLANEJAMENTO</span><h1>Relatório semanal</h1><p>Prepare as informações da obra e revise o documento antes de exportar.</p></header>
 {error&&<div role="alert" className="rs-alert">{error}</div>}{notice&&<div role="status" className="rs-notice">{notice}</div>}
 <section className="rs-card"><h2>Selecionar período</h2><div className="rs-actions"><label>Início<input type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/></label><label>Fim<input type="date" value={fim} onChange={e=>setFim(e.target.value)}/></label><button disabled={busy} onClick={prepare}>Preparar relatório</button></div><p>Selecione até sete dias consecutivos. Somente RDOs aprovados são considerados.</p></section>
 <section className="rs-card"><h2>Histórico</h2>{!history.length?<p>Nenhum relatório salvo.</p>:<div className="rs-actions">{history.map(h=><button className="rs-secondary" key={h.id} onClick={()=>open(h.id)}>{fmt(h.inicio)} a {fmt(h.fim)} · #{h.id}</button>)}</div>}</section>
 {data&&<><div className="rs-report-head"><div><span className="rs-kicker">RELATÓRIO EM PREPARAÇÃO</span><h2>{data.projeto}</h2><p><CalendarDays size={15}/> {fmt(data.inicio)} a {fmt(data.fim)} · {data.rdo_count} RDO(s) aprovado(s)</p></div><div className="rs-actions">{id&&<button className="rs-secondary" disabled={busy} onClick={refresh}><RefreshCw size={15}/> Atualizar fontes</button>}<button className="rs-secondary rs-preview-button" disabled={busy} onClick={preview}><Eye size={16}/> Pré-visualizar PDF</button><button disabled={busy} onClick={save}><Save size={15}/> Salvar relatório</button></div></div>
 {!data.rdo_count&&<div className="rs-alert">Não há RDOs aprovados neste período. As atividades da EAP ainda podem ser selecionadas.</div>}
 <div className="rs-workflow" role="group" aria-label="Etapas de preenchimento">{[['visao','01','Visão da obra','Problemas, Curva S e suprimentos'],['atividades','02','Atividades','Execução e programação'],['campo','03','Campo','Fotos, equipe e clima']].map(([key,n,title,description])=><button key={key} type="button" className={stage===key?'active':''} onClick={()=>setStage(key)}><b>{n}</b><span><strong>{title}</strong><small>{description}</small></span></button>)}</div>
 <section className="rs-card rs-issues" id="rs-problemas"><div className="rs-section-heading"><div><span className="rs-kicker">PONTOS DE ATENÇÃO</span><h2>Problemas e soluções</h2><p>Registre os pontos da obra, a ação definida e a data prevista para regularização.</p></div><span className="rs-count">{problems.length} apontamentos</span></div>{problems.map((p,i)=><div className="rs-issue-row" key={i}><label>Problema<textarea maxLength={2000} value={p.problema} placeholder="Descreva o problema" onChange={e=>editProblem(i,'problema',e.target.value)}/></label><label>Solução<textarea maxLength={2000} value={p.solucao} placeholder="Descreva a solução" onChange={e=>editProblem(i,'solucao',e.target.value)}/></label><label>Regularização prevista<input type="date" value={p.data} onChange={e=>editProblem(i,'data',e.target.value)}/></label><button type="button" className="rs-secondary rs-remove" aria-label={`Remover apontamento ${i+1}`} onClick={()=>setData(d=>({...d,problemas:(d.problemas||[]).filter((_,j)=>i!==j)}))}>Remover</button></div>)}<button type="button" className="rs-secondary" onClick={()=>setData(d=>({...d,problemas:[...(d.problemas||[]),{problema:'',solucao:'',data:''}]}))}>+ Adicionar apontamento</button></section>
 <div className="rs-summary"><a href="#rs-atividades" onClick={()=>setStage('atividades')}><CheckCircle2/><span><strong>{completed}</strong><small>Concluídas na semana</small></span></a><a href="#rs-atividades" onClick={()=>setStage('atividades')}><ListTodo/><span><strong>{pending.length}</strong><small>Em andamento</small></span></a><a href="#rs-proximas" onClick={()=>setStage('atividades')}><CalendarDays/><span><strong>{planned}</strong><small>Programadas</small></span></a><a href="#rs-fotos" onClick={()=>setStage('campo')}><Camera/><span><strong>{selected}/2</strong><small>Fotos selecionadas</small></span></a></div>
 <section className="rs-card" id="rs-curva"><div className="rs-section-heading"><div><span className="rs-kicker">EVOLUÇÃO FÍSICA</span><h2>Curva S</h2><p>Comparativo acumulado até o corte de {fmt(data.fim)}.</p></div><button type="button" className="rs-secondary" disabled={busy} onClick={updateCurve}><RefreshCw size={15}/> Atualizar curva</button></div>{data.curva_s?.serie?.length?<><div className="rs-chart"><ResponsiveContainer width="100%" height={260}><LineChart data={data.curva_s.serie}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="data" tickFormatter={fmt} minTickGap={35}/><YAxis domain={[0,100]} tickFormatter={v=>`${v}%`}/><Tooltip labelFormatter={fmt} formatter={(v,n)=>[`${Number(v).toFixed(2)}%`,n==='real'?'Realizado':'Planejado']}/><Legend formatter={v=>v==='real'?'Realizado':'Planejado'}/><Line type="monotone" dataKey="planejado" stroke="#2563b3" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="real" stroke="#1c9a80" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div><p className="rs-curve-note">A imagem é incluída na prévia e no PDF. O planejado e o realizado consideram somente o período até {fmt(data.fim)}.</p></>:<div className="rs-empty">Não há dados suficientes para mostrar a Curva S. Confira o planejamento ou tente atualizar.</div>}</section>
 <section className="rs-card" id="rs-eap">
   <h2>Resumo do avanço físico</h2><p>Avanço acumulado em {fmt(data.fim)} para as atividades selecionadas.</p>
   {summary.length===0 && <p>Nenhuma atividade selecionada.</p>}
   {summary.map(a=><div className="rs-row" key={a.key}><strong>{a.nome}</strong><span>{percentage(catalog.get(a.key)?.fisico?.atual)}</span></div>)}
   <details><summary>Consultar catálogo da EAP ({catalog.size})</summary><div className="rs-search"><Search size={17}/><input aria-label="Buscar na EAP" placeholder="Buscar por código ou atividade" value={eapSearch} onChange={e=>{setEapSearch(e.target.value);setEapAll(false);}}/></div>
   {eap.slice(0,eapAll?undefined:20).map(a=><div className="rs-row" key={a.id}><strong>{a.codigo} {a.nome}</strong><span>Na preparação: {percentage(a.percentual)} · {a.status || 'Indisponível'}</span></div>)}
   {eap.length>20 && <button type="button" onClick={()=>setEapAll(!eapAll)}>{eapAll?'Mostrar menos':'Mostrar todas'}</button>}</details>
 </section>
 <section className="rs-card" id="rs-suprimentos"><div className="rs-section-heading"><div><span className="rs-kicker">MATERIAIS E EQUIPAMENTOS</span><h2>Acompanhamento de suprimentos</h2><p>Necessidades, previsão e recebimentos consultados no Mapa de Suprimentos na atualização do relatório.</p></div><span className="rs-count">{Array.isArray(data.suprimentos)?`${data.suprimentos.length} itens`:'Não disponível'}</span></div><div className="rs-supply-legend"><span><i className="verde"/> Verde: recebido</span><span><i className="amarelo"/> Amarelo: aguardando ou a conferir</span><span><i className="vermelho"/> Vermelho: prazo vencido ou previsão após necessidade</span></div>{!Array.isArray(data.suprimentos)?<div className="rs-empty">Dados indisponíveis para este perfil ou relatório anterior. Atualize as fontes se tiver acesso ao mapa e às requisições.</div>:!data.suprimentos.length?<div className="rs-empty">Nenhuma necessidade cadastrada no mapa.</div>:<div className="rs-supplies">{data.suprimentos.map(s=><article key={s.id} className={`rs-supply ${s.cor}`}><div className="rs-supply-name"><strong>{s.descricao}</strong><span className={`rs-supply-badge ${s.cor}`}>{s.situacao}</span></div><div className="rs-supply-facts"><span>Necessário <strong>{s.quantidade} {s.unidade}</strong></span><span>Recebido <strong>{s.recebida==null?'A conferir':`${s.recebida} ${s.unidade}`}</strong></span><span>Falta receber <strong>{s.restante==null?'A conferir':`${s.restante} ${s.unidade}`}</strong></span><span>Necessidade <strong>{fmt(s.necessidade)}</strong></span><span>Entrega prevista <strong>{fmt(s.previsao)}</strong></span></div></article>)}</div>}</section>
 <section className="rs-card" id="rs-atividades">
   <div className="rs-section-heading"><div><span className="rs-kicker">EXECUÇÃO</span><h2>Atividades da semana</h2><p>Revise as execuções dos RDOs aprovados. Os percentuais seguem a data de atualização oficial da EAP.</p></div><span className="rs-count">{executed.length} selecionadas</span></div>
   <details className="rs-execution-picker">
     <summary>Acrescentar atividade da EAP</summary>
     <div className="rs-execution-picker-content">
       <label>Buscar atividade<input type="search" value={executionSearch} placeholder="Código ou nome da atividade" onChange={e=>setExecutionSearch(e.target.value)}/></label>
       <div className="rs-execution-options" aria-label="Atividades da EAP">
         {executionOptions.map(({activity,depth,parent})=>{
           const key='eap:'+activity.id;
           const selected=weeklyKeys.has(key);
           const progress=activity.fisico?.atual;
           const status=activity.fisico?.situacao;
           const progressLabel=status && !['Não iniciada','Em andamento','Concluída'].includes(status)
             ? `${status}${progress == null ? '' : ' · '+percentage(progress)}`
             : progress == null ? 'Avanço indisponível'
             : progress >= 100 ? 'Concluída'
             : progress > 0 ? `Em andamento · ${percentage(progress)}`
             : 'Não iniciada';
           return <button type="button" key={key} className={`rs-execution-option ${parent?'is-parent':'is-child'}`}
             style={{'--activity-depth':Math.min(depth,5)}} disabled={selected} onClick={()=>addExecution(key)}>
             <span className="rs-execution-option-text"><span className="rs-execution-code">{activity.codigo || '—'}</span><span>{activity.nome}<small className="rs-execution-progress">{progressLabel}</small></span></span>
             <span className="rs-execution-kind">{selected?'Adicionada':parent?'Atividade pai':'Atividade filha'}</span>
           </button>;
         })}
         {!executionOptions.length && <p>Nenhuma atividade encontrada.</p>}
       </div>
     </div>
   </details>
   {weekly.map(a=>{
     const item=catalog.get(a.key);
     const physical=item?.fisico;
     const status=situation(a);
     return <div key={a.key} className={`rs-row rs-weekly-row ${a.executada===false?'is-unselected':''}`}><div className="rs-weekly-content">
       <div className="rs-weekly-heading"><label className="rs-check"><input type="checkbox" checked={a.executada!==false} onChange={e=>update('atividades',a.key,{executada:e.target.checked})}/><span><strong>{a.nome}</strong>{a.key.startsWith('avulsa:') && <small>Avulsa</small>}</span></label>
       <span className={`rs-status ${status==='Concluída'?'done':status==='Em andamento'?'pending':'rs-status-neutral'}`}>{status}</span></div>
       {situation(a)==='Indisponível' && !a.manual && a.status && <p>Situação no RDO: {a.status}</p>}
       <div className="rs-weekly-metrics" aria-label="Avanço físico no período">
         <div><span>Anterior</span><strong>{percentage(physical?.anterior)}</strong></div>
         <div><span>Atual</span><strong>{percentage(physical?.atual)}</strong></div>
         <div><span>Evolução</span><strong>{change(physical?.evolucao)}</strong></div>
       </div>
       {a.data_conclusao && <p className="rs-weekly-date">Concluída em {fmt(a.data_conclusao)}</p>}
       {(a.fonte_ausente || item?.fonte_ausente) && <p>Seleção preservada da última gravação. A origem desta linha mudou.</p>}
     </div>{!isCompleted(a) && !a.manual && <div className="rs-actions rs-weekly-actions"><label>Programar para a próxima semana?<select value={a.incluir==null?'':String(a.incluir)} onChange={e=>update('atividades',a.key,{incluir:e.target.value===''?null:e.target.value==='true',previsao:''})}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select></label>
       {a.incluir===true && <label>Previsão de conclusão<input type="date" min={shift(data.fim,1)} value={a.previsao} onChange={e=>update('atividades',a.key,{previsao:e.target.value})}/></label>}</div>}</div>;
   })}
 </section>
 <section className="rs-card" id="rs-proximas"><div className="rs-section-heading"><div><span className="rs-kicker">OLHANDO ADIANTE</span><h2>Próximas atividades</h2><p>Escolha o que entra na programação. As datas são apenas uma referência da EAP.</p></div><span className="rs-count">{planned} selecionadas</span></div>{continuations.map(a=><div className="rs-row" key={a.key}><strong>{a.nome}</strong><span>{percentage(catalog.get(a.key)?.fisico?.atual)} · {situation(a)} · Previsão {fmt(a.previsao)}</span></div>)}<div className="rs-toolbar"><div className="rs-search"><Search size={17}/><input aria-label="Buscar atividade" placeholder="Buscar por nome ou código" value={search} onChange={e=>{setSearch(e.target.value);setShowAll(false);}}/></div><div className="rs-filters" role="group" aria-label="Filtrar atividades">{[['sugeridas','Próxima semana'],['todas','Todas'],['selecionadas','Selecionadas']].map(([key,label])=><button key={key} type="button" className={filter===key?'active':''} onClick={()=>{setFilter(key);setShowAll(false);}}>{label}</button>)}</div></div><p className="rs-results">{upcoming.length} atividade(s) {filter==='sugeridas'?'com datas próximas ou selecionadas':''}</p>{!upcoming.length&&!continuations.length&&<div className="rs-empty">Nenhuma atividade encontrada neste filtro. Selecione “Todas” para consultar a EAP completa.</div>}<div className="rs-upcoming">{upcoming.slice(0,showAll?undefined:12).map(a=><label key={a.key} className={`rs-check rs-upcoming-row ${a.incluir?'selected':''}`}><input type="checkbox" checked={!!a.incluir} onChange={e=>update('proximas',a.key,{incluir:e.target.checked})}/><span><strong>{a.nome}</strong><small>No corte: {percentage(catalog.get(a.key)?.fisico?.atual)} · {situation(a)}</small>{(a.fonte_ausente || catalog.get(a.key)?.fonte_ausente) && <small>Ausente nas fontes atualizadas.</small>}<small>Planejada: {fmt(a.inicio)} a {fmt(a.fim)}</small></span></label>)}</div>{upcoming.length>12&&<button type="button" className="rs-show-more" onClick={()=>setShowAll(!showAll)}>{showAll?'Mostrar menos':`Mostrar mais ${upcoming.length-12} atividades`}</button>}</section>
 <section className="rs-card" id="rs-fotos"><div className="rs-section-heading"><div><span className="rs-kicker">REGISTRO VISUAL</span><h2>Fotos da semana</h2><p>Escolha até duas imagens e ajuste as legendas para este relatório.</p></div><span className="rs-count">{selected} de 2 selecionadas</span></div>{!data.fotos.length&&<p>Nenhuma foto nos RDOs aprovados do período.</p>}<div className="rs-photos">{data.fotos.map(f=><div key={f.id} className={`rs-photo ${f.selecionada?'selected':''}`}><Photo photo={f} reportId={id} base={base}/><div className="rs-photo-activity">{f.atividade || 'Atividade n\u00e3o informada'}</div><label className="rs-check"><input type="checkbox" checked={!!f.selecionada} disabled={!f.selecionada&&selected>=2} onChange={e=>photoUpdate(f.id,{selecionada:e.target.checked})}/><span><strong>{f.selecionada?'Selecionada':'Selecionar foto'}</strong><small>RDO de {fmt(f.data)}</small></span></label>{f.selecionada&&<label>Descrição para o relatório<textarea value={f.descricao} onChange={e=>photoUpdate(f.id,{descricao:e.target.value})}/></label>}</div>)}</div></section>
 <section className="rs-card" id="rs-efetivo"><div className="rs-section-heading"><div><span className="rs-kicker">EQUIPE EM CAMPO</span><h2>Presença por função</h2><p>Pessoas registradas em cada dia da semana.</p></div><UsersRound size={22}/></div>{!chart.length?<p>Não há presença registrada.</p>:<><div className="rs-chart"><ResponsiveContainer width="100%" height={320}><BarChart data={chart} margin={{top:18}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="data"/><YAxis allowDecimals={false}/><Tooltip/><Legend/>{roles.map((f,i)=><Bar key={f} dataKey={f} fill={['#2563b3','#1c9a80','#d99c34','#895dcc','#e26b56','#4797bb'][i%6]}><LabelList dataKey={f} position="top" fontSize={11}/></Bar>)}</BarChart></ResponsiveContainer></div><div className="rs-workforce-table"><table><thead><tr><th>Data</th>{roles.map(role=><th key={role}>{role}</th>)}</tr></thead><tbody>{chart.map(row=><tr key={row.data}><th>{row.data}</th>{roles.map(role=><td key={role}>{row[role]||0}</td>)}</tr>)}</tbody></table></div></>}</section>
 <section className="rs-card" id="rs-clima"><span className="rs-kicker">CONDIÇÕES DE CAMPO</span><h2>Condições climáticas</h2>{!data.clima.length&&<p>Não há clima registrado.</p>}<div className="rs-weather">{data.clima.map((c,i)=><div key={i}><Icon condition={c.condicao_tempo}/><span><strong>{fmt(c.data)} · {c.periodo}</strong><small>{c.condicao_tempo||'Não informado'} · {Number(c.pluviometria_mm||0)} mm{c.condicao_trabalho?` · ${c.condicao_trabalho}`:''}</small></span></div>)}</div></section>
 <div className="rs-final-actions"><div><strong>Pronto para revisar?</strong><p>Confira o documento completo antes de baixar o PDF.</p></div><div className="rs-actions"><button className="rs-secondary" disabled={busy} onClick={preview}><Eye size={16}/> Pré-visualizar PDF</button><button disabled={busy} onClick={save}><Save size={15}/> Salvar relatório</button></div></div></>}
 {previewUrl&&<div className="rs-preview-backdrop" role="presentation"><div className="rs-preview-modal" role="dialog" aria-modal="true" aria-labelledby="rs-preview-title"><header><div><span className="rs-kicker">REVISÃO DO DOCUMENTO</span><h2 id="rs-preview-title">Prévia do relatório</h2><p>Confira a versão atual. A prévia inclui as alterações ainda não salvas.</p></div><div className="rs-actions"><a href={previewUrl} download={`relatorio-semanal-${data?.inicio||'obra'}.pdf`} className="rs-download"><FileDown size={16}/> Baixar PDF</a><button className="rs-secondary" onClick={closePreview} aria-label="Fechar prévia"><X size={18}/></button></div></header><iframe title="Prévia do relatório semanal em PDF" src={previewUrl}/></div></div>}
 </div>;
}

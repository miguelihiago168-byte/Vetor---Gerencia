import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import HSEGradeMensal from './HSEGradeMensal.jsx';

const initial = {funcao:'',quantidade:'',inicio:'',fim:'',empresa:'',fase:'',referencia:'',observacoes:'',revisao:''};
const weekdays = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const dateLabel = value => String(value || '').slice(0,10).split('-').reverse().join('/');

export default function HSEPlanejamento({ roles }) {
  const {projetoId} = useParams();
  const [projects,setProjects] = useState([]);
  const [project,setProject] = useState(projetoId || '');
  const [calendar,setCalendar] = useState({dias:[1,2,3,4,5],excecoes:{}});
  const [configured,setConfigured] = useState(false);
  const [plans,setPlans] = useState([]);
  const [obra,setObra] = useState(null);
  const [form,setForm] = useState(initial);
  const [previous,setPrevious] = useState(null);
  const [exceptionDate,setExceptionDate] = useState('');
  const [exceptionWorking,setExceptionWorking] = useState('false');
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const base = `/hse/projetos/${project}`;

  useEffect(() => { if (projetoId) setProject(projetoId); },[projetoId]);
  useEffect(() => { if (!projetoId) api.get('/projetos').then(r => setProjects(Array.isArray(r.data) ? r.data : [])).catch(() => setError('Não foi possível carregar as obras.')); },[projetoId]);
  const load = async () => {
    const r = await api.get(`${base}/planejamento`);
    setCalendar(r.data.calendario || {dias:[1,2,3,4,5],excecoes:{}});
    setConfigured(!!r.data.calendario);
    setPlans(r.data.previsoes);
    setObra(r.data.obra || null);
  };
  useEffect(() => {
    setPlans([]); setObra(null); setPrevious(null); setForm(initial); setError(''); setMessage('');
    if (project) load().catch(e => setError(e.response?.data?.erro || 'Não foi possível carregar o planejamento.'));
  },[project]);
  const work = async action => {
    setBusy(true); setMessage(''); setError('');
    try { const text = await action(); await load(); setMessage(text); }
    catch(e) { setError(e.response?.data?.erro || 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };
  const saveCalendar = () => work(async () => { await api.put(`${base}/calendario`,calendar); return 'Calendário salvo.'; });
  const savePlan = event => {
    event.preventDefault();
    work(async () => { await api.post(`${base}/previsoes`,{...form,anterior_id:previous}); setForm(initial); setPrevious(null); return 'Previsão salva.'; });
  };
  const edit = item => { setPrevious(item.id); setForm(Object.fromEntries(Object.keys(initial).map(field => [field,item[field] ?? '']))); };

  return <div className="hse-planning">
    {!projetoId && <label className="hse-project-select">Obra<select value={project} onChange={e=>setProject(e.target.value)}><option value="">Selecione uma obra</option>{projects.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>}
    {error && <div className="hse-message hse-message-error" role="alert">{error}</div>}{message && <div className="hse-message hse-message-success" role="status">{message}</div>}
    {project && <>
      <section className="hse-card hse-form-card"><div className="hse-card-heading"><div><h2>Calendário de trabalho</h2><p>{configured ? 'Dias habituais e exceções desta obra.' : 'Configure e salve os dias de trabalho desta obra.'}</p></div></div>
        <div className="hse-weekdays">{weekdays.map((name,index)=><label key={name}><input type="checkbox" checked={calendar.dias.includes(index)} onChange={e=>setCalendar({...calendar,dias:e.target.checked ? [...calendar.dias,index] : calendar.dias.filter(d=>d!==index)})}/>{name}</label>)}</div>
        <div className="hse-exception"><label>Data de exceção<input type="date" value={exceptionDate} onChange={e=>setExceptionDate(e.target.value)}/></label><label>Operação<select value={exceptionWorking} onChange={e=>setExceptionWorking(e.target.value)}><option value="false">Sem operação</option><option value="true">Dia de trabalho</option></select></label><button type="button" className="hse-button hse-button-secondary" onClick={()=>{if(exceptionDate){setCalendar({...calendar,excecoes:{...calendar.excecoes,[exceptionDate]:exceptionWorking==='true'}});setExceptionDate('');}}}>Adicionar exceção</button></div>
        {Object.entries(calendar.excecoes).sort().map(([date,working])=><div className="hse-exception-row" key={date}>{dateLabel(date)} · {working ? 'Dia de trabalho' : 'Sem operação'} <button type="button" className="hse-action" onClick={()=>{const exceptions={...calendar.excecoes};delete exceptions[date];setCalendar({...calendar,excecoes:exceptions});}}>Remover</button></div>)}
        <div className="hse-form-actions"><button type="button" className="hse-button hse-button-primary" disabled={busy} onClick={saveCalendar}>Salvar calendário</button></div>
      </section>
      <HSEGradeMensal project={project} obra={obra} calendar={configured ? calendar : null} plans={plans} roles={roles} onSaved={load} />
      <details className="hse-form-card" open={previous ? true : undefined}><summary className="hse-period-summary">Ajustar previsão por período</summary><section className="hse-card"><div className="hse-card-heading"><div><h2>{previous ? 'Revisar previsão' : 'Planejamento por período'}</h2><p>Cadastre o efetivo exigido por função e período.</p></div></div>
        <form onSubmit={savePlan}><div className="hse-form-grid">
          <label>Função<input list="hse-planejamento-funcoes" value={form.funcao} onChange={e=>setForm({...form,funcao:e.target.value})} maxLength={150} required/></label><datalist id="hse-planejamento-funcoes">{roles.map(role=><option key={role} value={role}/>)}</datalist>
          <label>Quantidade prevista<input type="number" min="0" max="1000000" step="1" value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})} required/></label>
          <label>Início<input type="date" value={form.inicio} onChange={e=>setForm({...form,inicio:e.target.value})} required/></label>
          <label>Fim<input type="date" min={form.inicio} value={form.fim} onChange={e=>setForm({...form,fim:e.target.value})} required/></label>
          {[['empresa','Empresa responsável'],['fase','Etapa ou fase'],['referencia','Referência contratual'],['revisao','Revisão'],['observacoes','Observações']].map(([field,label])=><label key={field}>{label}<input value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})} maxLength={field==='observacoes'?2000:150}/></label>)}
        </div><div className="hse-form-actions"><button className="hse-button hse-button-primary" disabled={busy}>Salvar previsão</button>{previous && <button type="button" className="hse-button hse-button-secondary" onClick={()=>{setForm(initial);setPrevious(null);}}>Cancelar revisão</button>}</div></form>
      </section></details>
      <section className="hse-card"><h2>Previsões e revisões</h2><div className="hse-table-wrap"><table className="hse-table"><thead><tr><th>Função</th><th>Período</th><th>Previsto</th><th>Empresa / fase</th><th>Revisão</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{plans.map(item=><tr key={item.id}><td>{item.funcao}</td><td>{dateLabel(item.inicio)} a {dateLabel(item.fim)}</td><td>{item.quantidade}</td><td>{[item.empresa,item.fase].filter(Boolean).join(' / ') || '—'}</td><td>{item.revisao || '—'}</td><td>{item.ativa ? 'Vigente' : 'Revisada'}</td><td>{item.ativa && <button type="button" className="hse-action" onClick={()=>edit(item)}>Revisar</button>}</td></tr>)}{!plans.length && <tr><td colSpan="7" className="hse-empty">Nenhuma previsão cadastrada.</td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}

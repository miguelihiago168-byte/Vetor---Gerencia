import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';
import { monthBounds, monthRange, monthlyCell, monthlyCurve, scopeKey } from './hseMensalUtils';

const label = month => { const [year,number]=month.split('-'); return `${number}/${year}`; };
const emptyRow = {funcao:'',empresa:'',fase:''};
const currentMonth = () => new Date().toISOString().slice(0,7);

export default function HSEGradeMensal({project,obra,calendar,plans,roles,onSaved}) {
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [draft,setDraft]=useState({});
  const [newRows,setNewRows]=useState([]);
  const [rowForm,setRowForm]=useState(emptyRow);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(() => {
    setStart(obra?.data_inicio?.slice(0,7) || currentMonth());
    setEnd(obra?.prazo_termino?.slice(0,7) || obra?.data_inicio?.slice(0,7) || currentMonth());
    setDraft({}); setNewRows([]); setMessage(''); setError('');
  },[project,obra?.data_inicio,obra?.prazo_termino]);
  const active=useMemo(()=>plans.filter(plan=>plan.ativa),[plans]);
  const rows=useMemo(()=>{
    const map=new Map();
    for (const row of [...active,...newRows]) if (!map.has(scopeKey(row))) map.set(scopeKey(row),{funcao:row.funcao,empresa:row.empresa || '',fase:row.fase || ''});
    return [...map.values()].sort((a,b)=>a.funcao.localeCompare(b.funcao,'pt-BR') || a.empresa.localeCompare(b.empresa,'pt-BR') || a.fase.localeCompare(b.fase,'pt-BR'));
  },[active,newRows]);
  const months=monthRange(start,end);
  const curve=useMemo(()=>monthlyCurve(months,rows,active,calendar,obra),[start,end,rows,active,calendar,obra]);
  const addRow = event => {
    event.preventDefault();
    const row={funcao:rowForm.funcao.trim(),empresa:rowForm.empresa.trim(),fase:rowForm.fase.trim()};
    if (!row.funcao) return;
    if (rows.some(item=>scopeKey(item)===scopeKey(row))) {setError('Esta função, empresa e fase já estão na grade.');return;}
    setNewRows([...newRows,row]); setRowForm(emptyRow); setError('');
  };
  const save=async()=>{
    const changes=Object.values(draft);
    if (!changes.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.put(`/hse/projetos/${project}/grade-mensal`,{alteracoes:changes,versao:active.map(row=>row.id)});
      await onSaved(); setDraft({}); setNewRows([]); setMessage('Planejamento mensal salvo.');
    } catch(e) { setError(e.response?.data?.erro || 'Não foi possível salvar o planejamento mensal.'); }
    finally {setBusy(false);}
  };
  const roleNames=[...new Set(curve.flatMap(item=>item.roles.map(role=>role.funcao)))];
  const chart=curve.map(item=>({mes:label(item.month),roles:item.roles,incompleto:item.total===null}));
  return <section className="hse-card hse-form-card hse-monthly">
    <div className="hse-card-heading"><div><h2>Planejamento mensal</h2><p>Informe o total necessário em cada mês. Campos vazios indicam previsão não cadastrada. Alterar uma célula variável substitui as previsões daquele mês.</p></div></div>
    {error && <div className="hse-message hse-message-error" role="alert">{error}</div>}{message && <div className="hse-message hse-message-success" role="status">{message}</div>}
    <div className="hse-month-controls"><label>De<input type="month" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input type="month" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    {!months.length && <p className="hse-hint">Selecione um intervalo válido de até 120 meses.</p>}
    <form className="hse-month-add" onSubmit={addRow}><label>Função<input list="hse-grade-funcoes" value={rowForm.funcao} onChange={e=>setRowForm({...rowForm,funcao:e.target.value})} maxLength={150} required/></label><datalist id="hse-grade-funcoes">{roles.map(role=><option key={role} value={role}/>)}</datalist><label>Empresa<input value={rowForm.empresa} onChange={e=>setRowForm({...rowForm,empresa:e.target.value})} maxLength={150}/></label><label>Fase<input value={rowForm.fase} onChange={e=>setRowForm({...rowForm,fase:e.target.value})} maxLength={150}/></label><button className="hse-button hse-button-secondary" type="submit">Adicionar linha</button></form>
    {months.length>0 && <div className="hse-table-wrap"><table className="hse-table hse-month-table"><thead><tr><th>Função / empresa / fase</th>{months.map(month=><th key={month}>{label(month)}</th>)}</tr></thead><tbody>
      {rows.map(row=><tr key={scopeKey(row)}><th scope="row"><strong>{row.funcao}</strong><small>{[row.empresa,row.fase].filter(Boolean).join(' · ') || 'Sem empresa ou fase'}</small></th>{months.map(month=>{
        const key=JSON.stringify([scopeKey(row),month]);
        const original=monthlyCell(active,scopeKey(row),monthBounds(month,obra));
        const changed=Object.hasOwn(draft,key);
        return <td key={month}><input type="number" min="0" max="1000000" step="1" aria-label={`${row.funcao}, ${row.empresa || 'sem empresa'}, ${row.fase || 'sem fase'}, ${label(month)}`} placeholder={original.mixed && !changed ? 'Variável' : '—'} value={changed ? (draft[key].quantidade ?? '') : original.value} onChange={e=>{const value=e.target.value;setDraft({...draft,[key]:{...row,...monthBounds(month,obra),quantidade:value===''?null:Number(value)}});}} />{original.mixed && !changed && <small>Por período</small>}</td>;
      })}</tr>)}
      {!rows.length && <tr><td colSpan={months.length+1} className="hse-empty">Adicione uma função para iniciar o planejamento.</td></tr>}
    </tbody></table></div>}
    <div className="hse-form-actions"><button className="hse-button hse-button-primary" type="button" disabled={busy || !Object.keys(draft).length || !months.length} onClick={save}>Salvar grade</button><span className="hse-hint">{Object.keys(draft).length} alteração(ões) pendente(s), incluindo meses fora da visualização. Para ajustar parte de um mês, use a edição por período abaixo.</span></div>
    <div className="hse-month-curve"><h3>Curva de efetivo previsto</h3><p className="hse-hint">Média por dia de trabalho, por função. A curva usa os valores salvos.</p>
      {!calendar ? <p className="hse-hint">Salve o calendário de trabalho para calcular a curva.</p> : !rows.length ? <p className="hse-hint">Cadastre previsões para exibir a curva.</p> : <><div style={{width:'100%',height:280}}><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="mes"/><YAxis/><Tooltip/><Legend/>{roleNames.map((role,i)=><Bar key={role} name={role} dataKey={item=>item.incompleto ? null : item.roles.find(entry=>entry.funcao===role)?.valor} stackId="total" fill={['#2563b3','#0c9676','#d19a31','#815bbb','#d16b56','#418daf'][i%6]}/>)}</BarChart></ResponsiveContainer></div><div className="hse-table-wrap"><table className="hse-table"><thead><tr><th>Mês</th><th>Total médio previsto</th></tr></thead><tbody>{curve.map(item=><tr key={item.month}><td>{label(item.month)}</td><td>{item.total===null?'Dados incompletos':item.total.toLocaleString('pt-BR',{maximumFractionDigits:2})}</td></tr>)}</tbody></table></div></>}
    </div>
  </section>;
}

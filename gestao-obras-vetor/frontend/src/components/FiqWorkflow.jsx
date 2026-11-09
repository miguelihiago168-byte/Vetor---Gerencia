import React from 'react';
import { abrirReinspecaoFiq, retificarFiq, cancelarFolhaCivil, addFolhaResposta, gerarRncItemFolha } from '../services/api';

const snapshot = (value) => {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return {}; }
};

export default function FiqWorkflow({ sheet, editable, id, projetoId, navigate, setError, action, load }) {
  if (!sheet.fiq_numero) return null;
  const openRevision = async (handler, question) => {
    const reason = window.prompt(question);
    if (!reason?.trim()) return;
    try {
      const result = await handler(id, reason);
      navigate(`/projeto/${projetoId}/qualidade/folhas/${result.data.id}`);
    } catch (error) { setError(error.response?.data?.erro || 'Não foi possível abrir a revisão.'); }
  };
  const openOccurrence = async (item, reason = '') => {
    try {
      const result = await gerarRncItemFolha(id, { [item.field]:item.id, justificativa_nova_ocorrencia:reason });
      await load();
      navigate(`/projeto/${projetoId}/rnc/${result.data.id}`);
    } catch (error) { setError(error.response?.data?.erro || 'Não foi possível criar a RNC.'); }
  };
  const items = [
    ...(sheet.respostas || []).filter(x=>x.resultado==='NAO_CONFORME').map(x=>({field:'resposta_id',id:x.id,label:snapshot(x.item_snapshot).rotulo || 'Critério'})),
    ...(sheet.medicoes || []).filter(x=>x.resultado==='NAO_CONFORME').map(x=>({field:'medicao_id',id:x.id,label:[x.elemento,x.localizacao].filter(Boolean).join(' · ') || 'Medição'})),
    ...(sheet.eletrica?.ensaios || []).filter(x=>x.resultado==='NAO_CONFORME').map(x=>({field:'ensaio_eletrico_id',id:x.id,label:`Ensaio: ${x.tipo || x.criterio || x.id}`})),
    ...(sheet.eletrica?.torques || []).filter(x=>x.resultado==='NAO_CONFORME').map(x=>({field:'torque_eletrico_id',id:x.id,label:`Torque: ${x.ponto_conexao || x.componente || x.id}`})),
    ...(sheet.civil?.nao_conformidades || []).filter(x=>x.status!=='RESOLVIDO').map(x=>({field:'nao_conformidade_id',id:x.id,label:x.descricao}))
  ];
  return <section className="folha-form"><section>
    <h2>FIQ e reinspeção</h2><p>{sheet.fiq_numero} · Folha {sheet.numero}</p>
    {sheet.status==='REPROVADA_BLOQUEADA' && <button type="button" onClick={()=>openRevision(abrirReinspecaoFiq,'Informe o motivo e as ações para a reinspeção:')}>Abrir reinspeção</button>}
    {sheet.status==='APROVADA' && <button type="button" onClick={()=>openRevision(retificarFiq,'Informe o motivo da retificação:')}>Retificar FIQ</button>}
    {['RASCUNHO','EM_ANALISE'].includes(sheet.status) && <button type="button" onClick={()=>{const reason=window.prompt('Informe o motivo do cancelamento:');if(reason?.trim()) action(()=>cancelarFolhaCivil(id,reason));}}>Cancelar FIQ</button>}
    {editable && sheet.folha_origem_id && <div className="point-list">{(sheet.respostas || []).filter(x=>x.resultado==='PENDENTE').map(x=>{
      const item=snapshot(x.item_snapshot);
      return <div key={x.id}><b>{item.rotulo}</b><button type="button" onClick={()=>action(()=>addFolhaResposta(id,{item,resultado:'CONFORME'}))}>Conforme</button><button type="button" onClick={()=>action(()=>addFolhaResposta(id,{item,resultado:'NAO_CONFORME'}))}>Não conforme</button><button type="button" onClick={()=>{const justificativa=window.prompt('Justificativa para não aplicável:');if(justificativa?.trim()) action(()=>addFolhaResposta(id,{item,resultado:'NAO_APLICAVEL',justificativa}));}}>N/A</button></div>;
    })}</div>}
    <h2>Não conformidades e RNCs</h2><div className="point-list">{items.map(item=>{
      const linked=(sheet.rncs || []).find(r=>Number(r[item.field])===Number(item.id));
      return <div key={`${item.field}-${item.id}`}><b>{item.label}</b>{linked ? <button type="button" onClick={()=>navigate(`/projeto/${projetoId}/rnc/${linked.rnc_id}`)}>RNC #{linked.rnc_id} · {linked.status}</button> : <button type="button" onClick={()=>openOccurrence(item)}>Abrir RNC</button>}</div>;
    })}</div>
    {(sheet.rncs || []).map(r=>{
      const field=['resposta_id','medicao_id','ensaio_eletrico_id','torque_eletrico_id','nao_conformidade_id'].find(key=>r[key]);
      return <div key={r.id}><button type="button" onClick={()=>navigate(`/projeto/${projetoId}/rnc/${r.rnc_id}`)}>RNC #{r.rnc_id} · {r.status}</button>{field && <button type="button" onClick={()=>{const reason=window.prompt('Explique por que esta é uma ocorrência distinta:');if(reason?.trim()) openOccurrence({field,id:r[field]},reason);}}>Nova ocorrência distinta</button>}</div>;
    })}
  </section></section>;
}

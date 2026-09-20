import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, FilePlus2, Filter, Wrench } from 'lucide-react';
import Navbar from '../components/Navbar';
import { getFolhasIndicadores, getFolhasVerificacao } from '../services/api';
import './FolhasVerificacao.css';

const label = (value) => ({ RASCUNHO:'Rascunho', EM_ANALISE:'Em análise', REPROVADA_BLOQUEADA:'Reprovada / bloqueada', EM_CORRECAO:'Em correção', EM_REINSPECAO:'Em reinspeção', APROVADA:'Aprovada', CONFORME:'Conforme', NAO_CONFORME:'Não conforme', PENDENTE:'Pendente', BLOQUEADO:'Não conforme', CONFORME_COM_RESSALVAS:'Conforme com ressalvas' }[value] || value || '-');

const displayStatus = (item, siblings = []) => {
  const siblingRevision = Math.max(0, ...siblings.filter((candidate) => candidate.numero === item.numero).map((candidate) => Number(candidate.revisao) || 0));
  const openedRevision = Math.max(Number(item.ultima_revisao_aberta || 0), siblingRevision);
  const currentRevision = Number(item.revisao || 1);
  if (openedRevision <= currentRevision) return label(item.status);
  const approvedRevision = siblings.find((candidate) => candidate.numero === item.numero && Number(candidate.revisao) === openedRevision);
  const approved = approvedRevision && (approvedRevision.status === 'APROVADA' || approvedRevision.resultado_lote === 'CONFORME');
  return `Rev. ${String(openedRevision).padStart(2, '0')} ${approved ? 'aprovada' : 'aberta'}`;
};

export default function FolhasVerificacao() {
  const { projetoId } = useParams(); const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]); const [indicators, setIndicators] = useState([]); const [loading, setLoading] = useState(true);
  const type = params.get('tipo') || ''; const status = params.get('status') || '';
  const load = async () => { setLoading(true); try { const [list, stats] = await Promise.all([getFolhasVerificacao(projetoId, { tipo:type || undefined, status:status || undefined }), getFolhasIndicadores(projetoId)]); setItems(list.data?.data || []); setIndicators(stats.data || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [projetoId, type, status]);
  const totals = useMemo(() => ({ abertas: indicators.filter(x => x.status !== 'APROVADA').reduce((n,x) => n + x.total, 0), pendentes: indicators.filter(x => x.status === 'EM_ANALISE').reduce((n,x) => n + x.total, 0), aprovadas: indicators.filter(x => x.resultado_lote === 'CONFORME').reduce((n,x) => n + x.total, 0), reprovadas: indicators.filter(x => ['NAO_CONFORME','BLOQUEADO'].includes(x.resultado_lote)).reduce((n,x) => n + x.total, 0) }), [indicators]);
  const filter = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key,value) : next.delete(key); setParams(next); };
  return <><Navbar /><main className="container folhas-page">
    <header className="folhas-header"><div><p className="eyebrow">QUALIDADE / FOLHAS DE VERIFICAÇÃO</p><h1>Folhas de Verificação</h1><p>Montagem de estruturas, controle de torque e rastreabilidade do lote.</p></div><button className="btn-primary" onClick={() => navigate(`/projeto/${projetoId}/qualidade/folhas/nova`)}><FilePlus2 size={18}/> Nova folha</button></header>
    <section className="folhas-kpis"><article><span>Abertas</span><strong>{totals.abertas}</strong></article><article><span>Pendentes de aprovação</span><strong>{totals.pendentes}</strong></article><article><span>Lotes conformes</span><strong>{totals.aprovadas}</strong></article><article><span>Lotes reprovados</span><strong>{totals.reprovadas}</strong></article></section>
    <nav className="folhas-tabs"><button className={!type && !status ? 'active':''} onClick={() => setParams({})}>Todas</button><button className={type === 'MONTAGEM' ? 'active':''} onClick={() => filter('tipo','MONTAGEM')}>Montagem</button><button className={type === 'TORQUE' ? 'active':''} onClick={() => filter('tipo','TORQUE')}><Wrench size={15}/> Torque</button><button className={status === 'EM_ANALISE' ? 'active':''} onClick={() => filter('status','EM_ANALISE')}>Pendentes</button><button className={status === 'REPROVADA_BLOQUEADA' ? 'active':''} onClick={() => filter('status','REPROVADA_BLOQUEADA')}>Reprovadas</button></nav>
    <section className="folhas-list-card"><div className="folhas-list-head"><h2><ClipboardCheck size={18}/> Histórico</h2><label><Filter size={15}/><input placeholder="Filtrar lote" onKeyDown={(e) => { if(e.key==='Enter') filter('lote',e.currentTarget.value); }} /></label></div>{loading ? <p className="folhas-empty">Carregando folhas…</p> : items.length === 0 ? <p className="folhas-empty">Nenhuma folha encontrada para este filtro.</p> : <div className="folhas-table-wrap"><table><thead><tr><th>Número</th><th>Tipo</th><th>Lote</th><th>Data</th><th>Medições</th><th>Resultado</th><th>Status</th><th>RNC</th></tr></thead><tbody>{items.map(item => { const id = typeof item.identificacao === 'string' ? JSON.parse(item.identificacao || '{}') : item.identificacao || {}; const summary = typeof item.resumo === 'string' ? JSON.parse(item.resumo || '{}') : item.resumo || {}; return <tr key={item.id} tabIndex="0" onClick={() => navigate(`/projeto/${projetoId}/qualidade/folhas/${item.id}`)}><td><strong>{item.numero}</strong><small>{item.modelo_nome}</small><small>Rev. {String(item.revisao || 1).padStart(2, '0')}</small></td><td>{item.tipo_folha === 'TORQUE' ? 'Torque' : 'Montagem'}</td><td>{id.codigo_lote || '-'}</td><td>{item.criado_em ? new Date(item.criado_em).toLocaleDateString('pt-BR') : '-'}</td><td>{summary.measured || 0}</td><td><span className={`status status-${String(item.resultado_lote || '').toLowerCase()}`}>{label(item.resultado_lote)}</span></td><td>{displayStatus(item, items)}</td><td>{item.rnc_id ? `#${item.rnc_id}` : '—'}</td></tr>; })}</tbody></table></div>}</section>
  </main></>;
}

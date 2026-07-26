import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, ClipboardList, MapPin, PackageCheck, Plus, Search, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import Button from '../components/ui/Button';
import {
  getMaterialRecebimentos, getMaterialTraceIndicators
} from '../services/api';
import './RastreabilidadeMateriais.css';

const chipTone = (status = '') => {
  if (status.includes('Aprovado')) return 'success';
  if (/Bloqueado|Reprovado/.test(status)) return 'danger';
  return '';
};

export default function RastreabilidadeMateriais() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [query, setQuery] = useState('');
  const [inspectionStatus, setInspectionStatus] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [list, indicators] = await Promise.all([
      getMaterialRecebimentos(projetoId, { q: query, status_inspecao: inspectionStatus || undefined }),
      getMaterialTraceIndicators(projetoId)
    ]);
    setError('');
    setItems(list.data || []);
    setStats(indicators.data || {});
  };

  useEffect(() => {
    const timer = window.setTimeout(() => load().catch((error) => setError(error.response?.data?.erro || error.message)), 220);
    return () => window.clearTimeout(timer);
  }, [projetoId, query, inspectionStatus]);

  const waiting = stats.por_inspecao?.find((item) => item.status_inspecao === 'Aguardando inspeção')?.total || 0;

  return <>
    <Navbar />
    <main className="container quality-page">
      <div className="page-header">
        <div>
          <Button className="quality-back-button" variant="outline" startIcon={ArrowLeft} onClick={() => navigate(`/projeto/${projetoId}/qualidade`)}>Voltar para Qualidade</Button>
          <p className="eyebrow">QUALIDADE / RASTREABILIDADE</p>
          <h1>Rastreabilidade de materiais</h1>
          <p>Controle do recebimento à aplicação na obra.</p>
        </div>
        <Button startIcon={Plus} onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais/novo`)}>Novo recebimento</Button>
      </div>

      <nav className="material-module-tabs" aria-label="Seções da rastreabilidade"><button className="active"><ClipboardList size={16} /> Recebidos</button><button onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais/saidas`)}><Boxes size={16} /> Saídas de materiais</button></nav>

      {error && <div className="alert alert-error">{error}</div>}
      <div className="quality-kpis material-kpis">
        <div className="quality-kpi"><PackageCheck /><div><strong>{stats.total || 0}</strong><span>Recebimentos</span></div></div>
        <div className="quality-kpi"><Search /><div><strong>{waiting}</strong><span>Aguardando inspeção</span></div></div>
      </div>

      <div className="material-toolbar material-toolbar--filters">
        <label className="material-search-control"><span>Buscar recebimento</span><div><Search size={17} /><input placeholder="Material, fornecedor, lote, NF, série ou código" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca"><X size={16} /></button>}</div></label>
        <label className="material-status-control"><span>Status da inspeção</span><select value={inspectionStatus} onChange={(event) => setInspectionStatus(event.target.value)}><option value="">Todos os status</option><option value="Aguardando inspeção">Aguardando inspeção</option><option value="Em inspeção">Em inspeção</option><option value="Aprovado">Aprovado</option><option value="Aprovado com ressalva">Aprovado com ressalva</option><option value="Bloqueado">Bloqueado</option><option value="Reprovado">Reprovado</option></select></label>
        <div className="material-filter-summary"><strong>{items.length}</strong><span>{items.length === 1 ? 'recebimento encontrado' : 'recebimentos encontrados'}</span></div>
        {(query || inspectionStatus) && <Button variant="ghost" onClick={() => { setQuery(''); setInspectionStatus(''); }}>Limpar filtros</Button>}
      </div>
      <div className="material-grid">
        {items.map((item) => <article className="material-card" key={item.id} onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais/${item.id}`)}>
          <div className="material-card-top"><span className={`material-chip ${chipTone(item.status_inspecao)}`}>{item.status_inspecao}</span></div>
          <h3>{item.nome_material}</h3>
          <p className="material-card-code"><span>ID do material</span><strong>{item.codigo}</strong></p>
          <p>{item.quantidade_recebida} {item.unidade} · Lote: {item.lote || '—'}</p>
          <p>{item.fornecedor_exibicao || 'Fornecedor não informado'} · NF {item.nota_fiscal || '—'}</p>
          <div className="material-card-foot"><span><MapPin size={13} /> {item.local_armazenamento || 'Local não informado'}</span></div>
        </article>)}
      </div>
      {!items.length && <div className="quality-empty"><PackageCheck size={38} /><h3>Nenhum recebimento encontrado</h3><p>Registre o primeiro material para iniciar a rastreabilidade.</p></div>}
    </main>

  </>;
}

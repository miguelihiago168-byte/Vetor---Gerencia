import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, ClipboardList, PackageCheck, Search, UserRound } from 'lucide-react';
import Navbar from '../components/Navbar';
import Button from '../components/ui/Button';
import { addMaterialAplicacao, getMaterialRecebimento, getMaterialRecebimentos } from '../services/api';
import './RastreabilidadeMateriais.css';

const formatDate = (value) => {
  if (!value) return 'Não informado';
  const text = String(value);
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? 'Não informado' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
};

export default function RastreabilidadeSaidas() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [stockView, setStockView] = useState('estoque');
  const [outbound, setOutbound] = useState({ retirado_por_nome: '', quantidade: '', destino: '' });

  const loadItems = async () => {
    const response = await getMaterialRecebimentos(projetoId, { liberados: 1, q: query });
    setItems(response.data || []);
  };
  const selectReceipt = async (id) => {
    try { setError(''); setNotice(''); setSelected((await getMaterialRecebimento(id)).data); setOutbound({ retirado_por_nome: '', quantidade: '', destino: '' }); }
    catch (requestError) { setError(requestError.response?.data?.erro || requestError.message); }
  };
  useEffect(() => { loadItems().catch((requestError) => setError(requestError.response?.data?.erro || requestError.message)); }, [projetoId]);

  const registerOutbound = async () => {
    if (!selected || !outbound.retirado_por_nome.trim() || Number(outbound.quantidade) <= 0 || !outbound.destino.trim()) {
      setError('Selecione o material e informe quem retirou, a quantidade e o destino.');
      return;
    }
    try {
      setSaving(true); setError('');
      const response = await addMaterialAplicacao(selected.id, { ...outbound, quantidade: Number(outbound.quantidade), unidade: selected.unidade, aplicado_em: new Date().toISOString() });
      const updated = response.data;
      setOutbound({ retirado_por_nome: '', quantidade: '', destino: '' });
      if (Number(updated.saldo_disponivel) <= 0) {
        setSelected(null);
        setNotice(`A retirada zerou o estoque de ${updated.codigo}. O recebimento foi movido para Finalizados.`);
      } else {
        setSelected(updated);
        setNotice('Saída registrada. O saldo disponível foi atualizado.');
      }
      await loadItems();
    } catch (requestError) { setError(requestError.response?.data?.erro || requestError.message); }
    finally { setSaving(false); }
  };

  const availableItems = useMemo(() => items.filter((item) => Number(item.saldo_disponivel || 0) > 0), [items]);
  const finishedItems = useMemo(() => items.filter((item) => Number(item.saldo_disponivel || 0) <= 0), [items]);
  const visibleItems = stockView === 'estoque' ? availableItems : finishedItems;
  const stockTotal = useMemo(() => availableItems.reduce((sum, item) => sum + Number(item.saldo_disponivel || 0), 0), [availableItems]);

  return <>
    <Navbar />
    <main className="container quality-page material-outbound-page">
      <div className="page-header">
        <div>
          <Button className="quality-back-button" variant="outline" startIcon={ArrowLeft} onClick={() => navigate(`/projeto/${projetoId}/qualidade`)}>Voltar para Qualidade</Button>
          <p className="eyebrow">QUALIDADE / RASTREABILIDADE</p><h1>Saídas de materiais</h1><p>Registre as retiradas dos materiais já aprovados e acompanhe o estoque disponível.</p>
        </div>
      </div>
      <nav className="material-module-tabs" aria-label="Seções da rastreabilidade"><button onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais`)}><ClipboardList size={16} /> Recebidos</button><button className="active"><Boxes size={16} /> Saídas de materiais</button></nav>
      {error && <div className="alert alert-error">{error}</div>}{notice && <div className="material-success-notice">{notice}</div>}
      <div className="quality-kpis material-kpis material-kpis--three"><div className="quality-kpi"><PackageCheck /><div><strong>{availableItems.length}</strong><span>Materiais em estoque</span></div></div><div className="quality-kpi"><Boxes /><div><strong>{stockTotal.toLocaleString('pt-BR')}</strong><span>Quantidade total disponível</span></div></div><div className="quality-kpi"><ClipboardList /><div><strong>{finishedItems.length}</strong><span>Finalizados</span></div></div></div>

      <div className="material-outbound-layout">
        <section className="material-stock-panel">
          <div className="material-stock-tabs"><button className={stockView === 'estoque' ? 'active' : ''} onClick={() => { setStockView('estoque'); setSelected(null); }}>Em estoque <span>{availableItems.length}</span></button><button className={stockView === 'finalizados' ? 'active' : ''} onClick={() => { setStockView('finalizados'); setSelected(null); }}>Finalizados <span>{finishedItems.length}</span></button></div>
          <div className="material-toolbar"><div className="rnc-search-wrap"><Search size={15} /><input className="rnc-search" placeholder="Buscar material, lote ou código" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && loadItems()} /></div><Button variant="ghost" onClick={() => loadItems()}>Filtrar</Button></div>
          <div className="material-stock-list">{visibleItems.map((item) => <button key={item.id} className={`material-stock-item ${selected?.id === item.id ? 'selected' : ''} ${stockView === 'finalizados' ? 'finished' : ''}`} onClick={() => stockView === 'estoque' ? selectReceipt(item.id) : navigate(`/projeto/${projetoId}/rastreabilidade-materiais/${item.id}`)}><div><strong>{item.nome_material}</strong><span>ID do material: {item.codigo} · Lote {item.lote || '—'}</span></div><b>{item.saldo_disponivel} {item.unidade}<small>{stockView === 'estoque' ? 'em estoque' : 'estoque zerado'}</small></b></button>)}</div>
          {!visibleItems.length && <div className="quality-empty"><PackageCheck size={35} /><h3>{stockView === 'estoque' ? 'Nenhum material com saldo em estoque' : 'Nenhum material finalizado'}</h3><p>{stockView === 'estoque' ? 'Materiais aprovados com saldo disponível aparecerão aqui para retirada.' : 'Itens com estoque zerado serão movidos para esta sessão automaticamente.'}</p></div>}
        </section>

        <section className="material-outbound-register">
          {!selected ? <div className="material-outbound-placeholder"><Boxes size={34} /><h2>Selecione um material</h2><p>Escolha um item aprovado com saldo em estoque para registrar a saída.</p></div> : <><div className="material-detail-card-title"><UserRound size={20} /><div><h2>Registrar saída</h2><p>{selected.nome_material} · ID do material: {selected.codigo} · saldo atual: <strong>{selected.saldo_disponivel} {selected.unidade}</strong></p></div></div><div className="material-stock-summary"><div><span>Liberado</span><strong>{selected.quantidade_aprovada} {selected.unidade}</strong></div><div><span>Já retirado</span><strong>{Math.max(0, Number(selected.quantidade_aprovada) - Number(selected.saldo_disponivel))} {selected.unidade}</strong></div><div><span>Saldo atual</span><strong>{selected.saldo_disponivel} {selected.unidade}</strong></div></div><div className="material-outbound-form material-outbound-form--page"><label className="form-group"><span className="form-label">Quem retirou *</span><input className="form-input" value={outbound.retirado_por_nome} onChange={(event) => setOutbound((current) => ({ ...current, retirado_por_nome: event.target.value }))} placeholder="Nome do usuário ou colaborador" /></label><label className="form-group"><span className="form-label">Quantidade retirada *</span><input className="form-input" type="number" min="0" max={selected.saldo_disponivel} step="0.001" value={outbound.quantidade} onChange={(event) => setOutbound((current) => ({ ...current, quantidade: event.target.value }))} /></label><label className="form-group"><span className="form-label">Destino / frente de serviço *</span><input className="form-input" value={outbound.destino} onChange={(event) => setOutbound((current) => ({ ...current, destino: event.target.value }))} placeholder="Ex.: Torre A - elétrica" /></label><Button loading={saving} onClick={registerOutbound}>Confirmar saída</Button></div><div className="material-outbound-history"><h3>Histórico de retiradas · {selected.codigo}</h3>{selected.aplicacoes?.length ? selected.aplicacoes.map((item) => <div key={item.id}><UserRound size={16} /><div><strong>{item.retirado_por_nome || item.registrado_por_nome || 'Usuário não informado'} retirou {item.quantidade} {item.unidade}</strong><span>Recebimento {selected.codigo} · {item.destino} · {formatDate(item.aplicado_em)}</span></div></div>) : <p>Nenhuma retirada registrada para este material.</p>}</div></>}
        </section>
      </div>
    </main>
  </>;
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Package, RefreshCw, Search, Truck } from 'lucide-react';
import ComprasLayout from '../components/ComprasLayout';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { getEstoquePendencias } from '../services/api';
import { numeroRequisicaoExibicao } from '../utils/numeroRequisicao';
import './AreaPedidos.css';

const labels = { AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento', RECEBIMENTO_PARCIAL: 'Recebido parcialmente', RECEBIDO_TOTAL: 'Recebido fisicamente', CANCELADO: 'Cancelado' };
const formatQuantity = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(Number(value) || 0);

export default function AreaPedidos() {
  const { projetoId } = useParams();
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const canCreateRir = ['ADM', 'Gestor Geral', 'Gestor da Qualidade', 'Almoxarife'].includes(perfil);
  const canViewRir = canCreateRir || perfil === 'Gestor da Obra';
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await getEstoquePendencias({ todos: 1 }); setItems(response.data || []); }
    catch (err) { setError(err.response?.data?.erro || 'Não foi possível conectar ao serviço de pedidos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const projectItems = useMemo(() => projetoId ? items.filter((item) => String(item.projeto_solicitante_id) === projetoId) : items, [items, projetoId]);
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return projectItems.filter((item) => (!status || item.status === status) && (!term || [item.descricao, item.numero_requisicao, numeroRequisicaoExibicao(item.numero_requisicao, item.requisicao_id), item.referencia_id, item.fornecedor_nome, item.projeto_solicitante_nome].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term))));
  }, [projectItems, search, status]);
  const count = (value) => projectItems.filter((item) => item.status === value).length;
  const openRir = (item) => navigate(`/projeto/${item.projeto_solicitante_id}/rastreabilidade-materiais`, { state: canCreateRir && Number(item.quantidade_pendente) > 0 ? { pedidoRir: { id: item.id, descricao: item.descricao, unidade: item.unidade, quantidade: item.quantidade_comprada, pendente: item.quantidade_pendente, fornecedor: item.fornecedor_nome, pedido: numeroRequisicaoExibicao(item.numero_requisicao, item.requisicao_id) || String(item.referencia_id) } } : undefined });

  return <ComprasLayout title="Área de pedidos">
    <div className="pedidos-page">
      <div className="pedidos-intro"><div><p className="pedidos-eyebrow">SUPRIMENTOS / RECEBIMENTOS</p><p>Acompanhe os pedidos comprados e encaminhe a conferência para a RIR da obra.</p></div><div className="pedidos-info"><ClipboardCheck size={19} aria-hidden="true"/><span><strong>Recebimento e inspeção</strong>Receber fisicamente não significa aprovação. Consulte a conferência de cada pedido abaixo.</span></div></div>
      {loading ? <div className="pedidos-state" role="status"><RefreshCw size={26} className="pedidos-spinner"/><strong>Carregando pedidos</strong><span>Aguarde enquanto buscamos as informações.</span></div> : error ? <div className="pedidos-state pedidos-state-error" role="alert"><span className="pedidos-state-icon"><AlertCircle size={25}/></span><strong>Não foi possível carregar os pedidos</strong><span>{error}</span><Button onClick={load} startIcon={RefreshCw}>Tentar novamente</Button></div> : <>
        <section className="pedidos-metrics" aria-label="Resumo dos pedidos">
          <div className="pedidos-metric"><span className="pedidos-metric-icon"><Package size={20}/></span><div><span>Total de pedidos</span><strong>{projectItems.length}</strong><small>Itens de compra</small></div></div>
          <div className="pedidos-metric"><span className="pedidos-metric-icon is-waiting"><Truck size={20}/></span><div><span>Aguardando</span><strong>{count('AGUARDANDO_RECEBIMENTO')}</strong><small>Sem recebimento no estoque</small></div></div>
          <div className="pedidos-metric"><span className="pedidos-metric-icon is-partial"><ClipboardCheck size={20}/></span><div><span>Parciais</span><strong>{count('RECEBIMENTO_PARCIAL')}</strong><small>Com entrega pendente</small></div></div>
          <div className="pedidos-metric"><span className="pedidos-metric-icon is-done"><CheckCircle2 size={20}/></span><div><span>Recebidos</span><strong>{count('RECEBIDO_TOTAL')}</strong><small>Registrados no estoque</small></div></div>
        </section>
        <section className="pedidos-panel" aria-label="Lista de pedidos"><div className="pedidos-panel-header"><div><h2>Pedidos de compra</h2><p>Consulte o andamento do recebimento e acesse a conferência.</p></div><span className="pedidos-count">{visible.length} {visible.length === 1 ? 'item' : 'itens'}</span></div>
          <div className="pedidos-filters"><label className="pedidos-search"><span>Buscar pedido</span><div><Search size={18} aria-hidden="true"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Item, fornecedor ou número" /></div></label><label className="pedidos-select"><span>Situação do recebimento</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todas as situações</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
          {!visible.length ? <div className="pedidos-empty"><Package size={26}/><strong>{projectItems.length ? 'Nenhum pedido corresponde aos filtros' : 'Nenhum pedido encontrado'}</strong><span>{projectItems.length ? 'Altere a busca ou a situação para ver outros pedidos.' : 'Os itens comprados aparecerão aqui para acompanhamento.'}</span>{projectItems.length > 0 && <button type="button" onClick={() => { setSearch(''); setStatus(''); }}>Limpar filtros</button>}</div> : <div className="pedidos-table-wrap"><table className="pedidos-table"><thead><tr><th>Item / pedido</th><th>Obra</th><th>Recebimento no estoque</th><th>Situação</th><th><span className="pedidos-sr-only">Ação</span></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}>
            <td><strong>{item.descricao}</strong><span>{numeroRequisicaoExibicao(item.numero_requisicao, item.requisicao_id) || `Pedido ${item.referencia_id}`} · {item.fornecedor_nome || 'Fornecedor não informado'}</span></td><td>{item.projeto_solicitante_nome || 'Estoque central'}</td><td><strong>{formatQuantity(item.quantidade_recebida)} / {formatQuantity(item.quantidade_comprada)} {item.unidade}</strong><span>Recebido fisicamente / comprado</span><span>Aprovado: {formatQuantity(item.quantidade_aprovada)} · Bloqueado: {formatQuantity(item.quantidade_bloqueada)} · Rejeitado: {formatQuantity(item.quantidade_rejeitada)} {item.unidade}</span>{Number(item.quantidade_aguardando_inspecao) > 0 && <span>Aguardando inspeção: {formatQuantity(item.quantidade_aguardando_inspecao)} {item.unidade}</span>}{Number(item.quantidade_sem_classificacao) > 0 && <span>Sem classificação registrada: {formatQuantity(item.quantidade_sem_classificacao)} {item.unidade}</span>}</td><td><span className={`pedidos-badge status-${String(item.status).toLowerCase()}${Number(item.quantidade_bloqueada) + Number(item.quantidade_rejeitada) + Number(item.quantidade_aguardando_inspecao) + Number(item.quantidade_sem_classificacao) > 0 ? ' has-quality-pending' : ''}`}>{labels[item.status] || item.status}</span>{Number(item.quantidade_bloqueada) + Number(item.quantidade_rejeitada) > 0 && <span className="pedidos-divergencia">Com divergência na inspeção</span>}</td><td>{!item.projeto_solicitante_id ? <span>Sem obra vinculada</span> : canViewRir ? <Button size="sm" endIcon={ArrowRight} onClick={() => openRir(item)}>{canCreateRir ? 'Conferir na RIR' : 'Abrir RIR'}</Button> : <span>Acesso à RIR indisponível</span>}</td>
          </tr>)}</tbody></table></div>}
        </section>
      </>}
    </div>
  </ComprasLayout>;
}

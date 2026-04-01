import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import {
  kanbanRequisicoesV2,
  kanbanGlobal,
  getProjeto,
  analisarTodosItens,
  aprovarTodosItens,
  comprarTodosItens,
} from '../services/api';
import {
  AlertTriangle, Eye, ThumbsUp, Tag, Filter, X, ChevronDown,
  LayoutList, LayoutGrid,
} from 'lucide-react';

const TIPOS_MATERIAL = [
  'Materiais Elétricos', 'Materiais Civis', 'Materiais Eletrônicos',
  'Ferramentas', 'EPIs', 'Servicos', 'Outros',
];
const URGENCIAS = ['Normal', 'Urgente', 'Emergencial'];

const TRANSICOES = {
  'solicitado->em_cotacao':  { label: 'Iniciar cotação',     fn: (api, id) => api.analisarTodosItens(id) },
  'ag_aprovacao->liberado':  { label: 'Aprovar para compra', fn: (api, id) => api.aprovarTodosItens(id) },
  'liberado->comprado':      { label: 'Confirmar compra',    fn: (api, id) => api.comprarTodosItens(id) },
};

const COL_CONFIG = {
  solicitado:    { cor: '#64748b', bg: '#f1f5f9' },
  em_cotacao:    { cor: '#0ea5e9', bg: '#e0f2fe' },
  cot_recebidas: { cor: '#6366f1', bg: '#ede9fe' },
  ag_aprovacao:  { cor: '#f59e0b', bg: '#fef3c7' },
  liberado:      { cor: '#10b981', bg: '#d1fae5' },
  comprado:      { cor: '#22c55e', bg: '#dcfce7' },
};

const WIP = { em_cotacao: 15, cot_recebidas: 20, ag_aprovacao: 10, liberado: 8 };

const URG_STYLE = {
  Normal:      { color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  Urgente:     { color: '#d97706', bg: '#fef3c7', border: '#fbbf24' },
  Emergencial: { color: '#dc2626', bg: '#fee2e2', border: '#ef4444' },
};

const fmt = (v) =>
  v != null && v !== 0
    ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'R$ 0,00';

const diasDesde = (isoDate) => {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ha 1 dia';
  return `ha ${d} dias`;
};

function agruparCards(cards) {
  const hoje = new Date().toDateString();
  const emerg  = cards.filter(r => r.urgencia === 'Emergencial');
  const outros = cards.filter(r => r.urgencia !== 'Emergencial');
  const deHoje = outros.filter(r => {
    const d = r.atualizado_em || r.criado_em;
    return d && new Date(d).toDateString() === hoje;
  });
  const antigas = outros.filter(r => {
    const d = r.atualizado_em || r.criado_em;
    return !d || new Date(d).toDateString() !== hoje;
  });
  return [
    { key: 'emerg',   label: 'Emergenciais', cards: emerg,   dot: '#ef4444' },
    { key: 'hoje',    label: 'Hoje',         cards: deHoje,  dot: '#0ea5e9' },
    { key: 'antigas', label: 'Anteriores',   cards: antigas, dot: '#94a3b8' },
  ].filter(g => g.cards.length > 0);
}

function DroppableColumn({ id, children, isOver }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: '0 0 290px',
        minHeight: 120,
        borderRadius: 12,
        transition: 'background 0.18s',
        background: isOver ? 'rgba(99,102,241,0.06)' : 'transparent',
        outline: isOver ? '2px dashed #6366f1' : '2px dashed transparent',
      }}
    >
      {children}
    </div>
  );
}

function DraggableCard({ req, colId, projetoId, onAprovar, canDrag }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(req.id),
    data: { colId },
    disabled: !canDrag,
  });
  const navigate = useNavigate();
  const urg = URG_STYLE[req.urgencia] || URG_STYLE.Normal;

  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      style={{
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${urg.border}`,
        padding: '0.85rem',
        opacity: isDragging ? 0.45 : 1,
        cursor: canDrag ? 'grab' : 'default',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s, opacity 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', fontFamily: 'monospace' }}>
          {req.numero_requisicao}
        </span>
        <span style={{
          fontSize: '0.68rem', fontWeight: 600, borderRadius: 99,
          padding: '2px 8px', color: urg.color, background: urg.bg,
          flexShrink: 0, marginLeft: 6,
        }}>
          {req.urgencia}
        </span>
      </div>

      <div style={{ fontSize: '0.83rem', fontWeight: 600, color: '#334155', marginBottom: 2 }}>
        {req.tipo_material}
      </div>
      {req.descricao_itens && (
        <div style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: 4 }}>{req.descricao_itens}</div>
      )}

      {!projetoId && req.projeto_nome && (
        <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 6 }}>
          {'\u{1F3D7}'} {req.projeto_nome}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: '0.73rem', color: '#64748b', background: '#f8fafc', borderRadius: 6, padding: '2px 7px', border: '1px solid #e2e8f0' }}>
          Itens: <strong>{req.total_itens}</strong>
        </span>
        <span style={{ fontSize: '0.73rem', color: '#64748b', background: '#f8fafc', borderRadius: 6, padding: '2px 7px', border: '1px solid #e2e8f0' }}>
          {req.total_cotacoes} cotação(ões)
        </span>
      </div>

      {req.fornecedor_selecionado && (
        <div style={{ fontSize: '0.74rem', color: '#059669', background: '#d1fae5', borderRadius: 6, padding: '3px 8px', marginBottom: 6, fontWeight: 600 }}>
          {'\u2713'} {req.fornecedor_selecionado}
        </div>
      )}

      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
        {fmt(req.valor_total)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 7 }}>
        <span style={{ fontSize: '0.71rem', color: '#94a3b8' }}>{req.solicitante_nome || '—'}</span>
        <span style={{ fontSize: '0.71rem', color: '#94a3b8' }}>{diasDesde(req.atualizado_em || req.criado_em)}</span>
      </div>

      <div
        style={{ display: 'flex', gap: 5, marginTop: 8 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => navigate(projetoId ? `/projeto/${projetoId}/compras/${req.id}` : `/compras/${req.id}`)}
          style={btnStyle('#0ea5e9')}
        >
          <Eye size={11} /> Ver
        </button>
        {colId === 'ag_aprovacao' && (
          <button onClick={() => onAprovar(req.id)} style={btnStyle('#10b981')}>
            <ThumbsUp size={11} /> Aprovar
          </button>
        )}
        <button
          onClick={() => navigate(projetoId ? `/projeto/${projetoId}/compras/${req.id}` : `/compras/${req.id}`)}
          style={btnStyle('#6366f1')}
        >
          <Tag size={11} /> Cotacoes
        </button>
      </div>
    </div>
  );
}

function CompactRow({ req, colId, projetoId, onAprovar, canDrag }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(req.id), data: { colId }, disabled: !canDrag,
  });
  const navigate = useNavigate();
  const urg = URG_STYLE[req.urgencia] || URG_STYLE.Normal;
  const urgSig = req.urgencia === 'Emergencial' ? '!' : req.urgencia === 'Urgente' ? 'U' : 'N';
  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px', borderRadius: 7,
        background: '#fafafa', border: '1px solid #e2e8f0',
        borderLeft: `3px solid ${urg.border}`,
        opacity: isDragging ? 0.4 : 1,
        cursor: canDrag ? 'grab' : 'pointer',
        fontSize: '0.76rem', userSelect: 'none',
      }}
      onClick={() => navigate(projetoId ? `/projeto/${projetoId}/compras/${req.id}` : `/compras/${req.id}`)}
    >
      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155', flexShrink: 0 }}>{req.numero_requisicao}</span>
      <span style={{ color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.tipo_material}</span>
      <span style={{ fontWeight: 700, color: '#1e293b', flexShrink: 0 }}>{fmt(req.valor_total)}</span>
      <span style={{ color: '#94a3b8', flexShrink: 0 }}>{req.total_itens}i</span>
      <span style={{ fontSize: '0.66rem', fontWeight: 700, borderRadius: 99, padding: '1px 6px', color: urg.color, background: urg.bg, flexShrink: 0 }}>{urgSig}</span>
      {colId === 'ag_aprovacao' && (
        <button
          onClick={(e) => { e.stopPropagation(); onAprovar(req.id); }}
          style={{ flexShrink: 0, background: '#d1fae5', border: 'none', borderRadius: 5, padding: '2px 6px', fontSize: '0.65rem', color: '#059669', cursor: 'pointer', fontWeight: 700 }}
        >Aprov</button>
      )}
    </div>
  );
}

const btnStyle = (color) => ({
  display: 'flex', alignItems: 'center', gap: 3,
  fontSize: '0.71rem', fontWeight: 600,
  padding: '3px 8px', borderRadius: 6,
  border: `1px solid ${color}30`,
  background: `${color}12`,
  color,
  cursor: 'pointer',
  flex: 1, justifyContent: 'center',
});

function GhostCard({ req }) {
  return (
    <div style={{
      width: 260, background: '#fff', borderRadius: 10,
      border: '1px solid #6366f1', padding: '0.85rem',
      boxShadow: '0 8px 24px rgba(99,102,241,0.25)',
      opacity: 0.92,
    }}>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', fontFamily: 'monospace' }}>
        {req?.numero_requisicao}
      </div>
      <div style={{ fontSize: '0.83rem', color: '#334155', marginTop: 4 }}>{req?.tipo_material}</div>
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', marginTop: 6 }}>{fmt(req?.valor_total)}</div>
    </div>
  );
}

function ConfirmModal({ req, colFrom, colTo, onConfirm, onCancel, loading }) {
  if (!req) return null;
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: '1rem', color: '#1e293b' }}>Confirmar movimentação</h3>
        <p style={{ margin: 0, marginBottom: 6, fontSize: '0.88rem', color: '#475569' }}>
          Requisição: <strong>{req.numero_requisicao}</strong>
        </p>
        <p style={{ margin: 0, marginBottom: 16, fontSize: '0.88rem', color: '#475569' }}>
          <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{colFrom}</span>
          {' \u2192 '}
          <span style={{ background: '#d1fae5', padding: '2px 8px', borderRadius: 6, color: '#059669', fontWeight: 600 }}>{colTo}</span>
        </p>
        <p style={{ margin: 0, marginBottom: 20, fontSize: '0.82rem', color: '#64748b' }}>
          Essa acao atualizara o status dos itens no banco de dados.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.88rem' }}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: loading ? 'wait' : 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Aguarde...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PainelCard({ label, count, valor, cor }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '1rem', border: '1px solid #e2e8f0', borderLeft: `4px solid ${cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: '0.69rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1, marginBottom: 3 }}>{count}</div>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: cor }}>{fmt(valor)}</div>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalStyle = { background: '#fff', borderRadius: 14, padding: '1.5rem', width: 420, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
const labelStyle = { display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle = { padding: '0.4rem 0.65rem', fontSize: '0.82rem', width: '100%' };

export default function RequisicaoKanban() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const perfil = usuario?.perfil || '';
  const podeAprovar = ['Gestor Geral'].includes(perfil);
  const podeComprar = ['ADM', 'Gestor Geral'].includes(perfil);

  const [projeto, setProjeto] = useState(null);
  const [colunas, setColunas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');
  const [filtros, setFiltros] = useState({ tipo_material: '', urgencia: '', fornecedor: '', responsavel: '', data_inicio: '', data_fim: '', valor_max: '' });
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [activeReq, setActiveReq] = useState(null);
  const [activeColId, setActiveColId] = useState(null);
  const [overColId, setOverColId] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  const [viewMode, setViewMode] = useState('normal');
  const [confirmLoading, setConfirmLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const params = {};
      if (filtros.tipo_material) params.tipo_material = filtros.tipo_material;
      if (filtros.urgencia)      params.urgencia      = filtros.urgencia;
      if (filtros.fornecedor)    params.fornecedor    = filtros.fornecedor;
      if (filtros.responsavel)   params.responsavel   = filtros.responsavel;
      if (filtros.data_inicio)   params.data_inicio   = filtros.data_inicio;
      if (filtros.data_fim)      params.data_fim      = filtros.data_fim;
      if (filtros.valor_max)     params.valor_max     = filtros.valor_max;

      if (projetoId) {
        const [projRes, kanRes] = await Promise.all([getProjeto(projetoId), kanbanRequisicoesV2(projetoId, params)]);
        setProjeto(projRes.data);
        setColunas(kanRes.data || []);
      } else {
        const kanRes = await kanbanGlobal(params);
        setColunas(kanRes.data || []);
      }
    } catch {
      setErro('Erro ao carregar o kanban. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [projetoId, filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalReqs  = colunas.reduce((a, c) => a + (c.count || 0), 0);
  const totalValor = colunas.reduce((a, c) => a + Number(c.valor_total || 0), 0);
  const gc         = (id) => colunas.find((c) => c.id === id) || { count: 0, valor_total: 0 };
  const temFiltros = Object.values(filtros).some(Boolean);

  const getLabelId = (id) => colunas.find((c) => c.id === id)?.label || id;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3800);
  };

  const onDragStart = ({ active }) => {
    const { colId } = active.data.current;
    const col = colunas.find((c) => c.id === colId);
    const req = col?.requisicoes?.find((r) => r.id === Number(active.id));
    setActiveReq(req || null);
    setActiveColId(colId);
  };

  const onDragOver = ({ over }) => setOverColId(over?.id || null);

  const onDragEnd = ({ active, over }) => {
    setOverColId(null);
    const fromCol = activeColId;
    setActiveReq(null);
    setActiveColId(null);
    if (!over || over.id === fromCol) return;

    const chave = `${fromCol}->${over.id}`;
    if (!TRANSICOES[chave]) {
      showToast(`Movimentacao nao permitida de "${getLabelId(fromCol)}" para "${getLabelId(over.id)}".`);
      return;
    }

    const col = colunas.find((c) => c.id === fromCol);
    const req = col?.requisicoes?.find((r) => r.id === Number(active.id));
    if (!req) return;

    setConfirmacao({ req, deId: fromCol, paraId: over.id, deLabel: getLabelId(fromCol), paraLabel: getLabelId(over.id) });
  };

  const confirmarMove = async () => {
    if (!confirmacao) return;
    const { req, deId, paraId } = confirmacao;
    const chave = `${deId}->${paraId}`;
    const transicao = TRANSICOES[chave];
    if (!transicao) return;

    if ((paraId === 'em_cotacao') && !['Gestor Geral'].includes(perfil)) {
      showToast('Sem permissão para iniciar cotação.'); setConfirmacao(null); return;
    }
    if (paraId === 'liberado' && !podeAprovar) {
      showToast('Sem permissão para aprovar compra.'); setConfirmacao(null); return;
    }
    if (paraId === 'comprado' && !podeComprar) {
      showToast('Sem permissão para confirmar compra.'); setConfirmacao(null); return;
    }

    setConfirmLoading(true);
    try {
      await transicao.fn({ analisarTodosItens, aprovarTodosItens, comprarTodosItens }, req.id);
      showToast('Status atualizado com sucesso!');
      await carregar();
    } catch (e) {
      showToast(e?.response?.data?.erro || 'Erro ao mover requisição.');
    } finally {
      setConfirmLoading(false);
      setConfirmacao(null);
    }
  };

  const handleAprovarQuick = async (reqId) => {
    try {
      await aprovarTodosItens(reqId);
      showToast('Compra aprovada!');
      await carregar();
    } catch (e) {
      showToast(e?.response?.data?.erro || 'Erro ao aprovar compra.');
    }
  };

  const title = projetoId ? `Kanban — ${projeto?.nome || `Obra #${projetoId}`}` : 'Kanban Global de Compras';

  return (
    <ComprasLayout title={title}>
      <p style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem', color: '#64748b' }}>
        {projetoId ? (
          <>
            <Link to={`/projeto/${projetoId}/compras`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>Requisicoes</Link>
            {' / Kanban'}
          </>
        ) : (
          <>
            <Link to="/compras" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Compras</Link>
            {' / Kanban Global'}
          </>
        )}
        <span style={{ marginLeft: 8, color: '#94a3b8' }}>{totalReqs} {totalReqs === 1 ? 'requisição' : 'requisições'}</span>
      </p>

      {/* Painel financeiro de compras */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <PainelCard label="Total Solicitado"  count={totalReqs}              valor={totalValor}                      cor="#6366f1" />
        <PainelCard label="Em Cotação"        count={gc('em_cotacao').count}  valor={gc('em_cotacao').valor_total}   cor="#0ea5e9" />
        <PainelCard label="Aguard. Aprovação" count={gc('ag_aprovacao').count} valor={gc('ag_aprovacao').valor_total} cor="#f59e0b" />
        <PainelCard label="Comprado"          count={gc('comprado').count}     valor={gc('comprado').valor_total}     cor="#22c55e" />
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => setFiltrosAbertos((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#475569', padding: 0 }}>
            <Filter size={14} />
            Filtros
            {temFiltros && (
              <span style={{ background: '#6366f1', color: '#fff', fontSize: '0.68rem', borderRadius: 99, padding: '1px 7px', fontWeight: 700 }}>
                {Object.values(filtros).filter(Boolean).length}
              </span>
            )}
            <ChevronDown size={14} style={{ transform: filtrosAbertos ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {temFiltros && (
              <button onClick={() => setFiltros({ tipo_material: '', urgencia: '', fornecedor: '', responsavel: '', data_inicio: '', data_fim: '', valor_max: '' })} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <X size={13} /> Limpar
              </button>
            )}
            <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setViewMode('normal')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: viewMode === 'normal' ? '#6366f1' : '#fff', color: viewMode === 'normal' ? '#fff' : '#64748b', transition: '0.15s' }}>
                <LayoutGrid size={13} /> Cards
              </button>
              <button onClick={() => setViewMode('compacto')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: 'none', borderLeft: '1px solid #e2e8f0', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: viewMode === 'compacto' ? '#6366f1' : '#fff', color: viewMode === 'compacto' ? '#fff' : '#64748b', transition: '0.15s' }}>
                <LayoutList size={13} /> Compacto
              </button>
            </div>
          </div>
        </div>
        {filtrosAbertos && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.6rem', marginTop: '0.85rem' }}>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select className="form-input" style={inputStyle} value={filtros.tipo_material} onChange={(e) => setFiltros({ ...filtros, tipo_material: e.target.value })}>
                <option value="">Todos</option>
                {TIPOS_MATERIAL.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Urgencia</label>
              <select className="form-input" style={inputStyle} value={filtros.urgencia} onChange={(e) => setFiltros({ ...filtros, urgencia: e.target.value })}>
                <option value="">Todas</option>
                {URGENCIAS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fornecedor</label>
              <input className="form-input" style={inputStyle} placeholder="Buscar..." value={filtros.fornecedor} onChange={(e) => setFiltros({ ...filtros, fornecedor: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Responsavel</label>
              <input className="form-input" style={inputStyle} placeholder="Nome..." value={filtros.responsavel} onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Data inicio</label>
              <input type="date" className="form-input" style={inputStyle} value={filtros.data_inicio} onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Data fim</label>
              <input type="date" className="form-input" style={inputStyle} value={filtros.data_fim} onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Valor max (R$)</label>
              <input type="number" className="form-input" style={inputStyle} placeholder="5000" value={filtros.valor_max} onChange={(e) => setFiltros({ ...filtros, valor_max: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {erro && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.88rem' }}>{erro}</div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
          <p style={{ marginTop: 12, color: '#94a3b8', fontSize: '0.88rem' }}>Carregando kanban...</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: '0.9rem', overflowX: 'auto', paddingBottom: '2rem', alignItems: 'flex-start', minHeight: 400 }}>
            {colunas.map((col) => {
              const conf = COL_CONFIG[col.id] || { cor: '#64748b', bg: '#f1f5f9' };
              return (
                <DroppableColumn key={col.id} id={col.id} isOver={overColId === col.id}>
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    {(() => {
                      const wip = WIP[col.id];
                      const wipExcedido = wip && col.count > wip;
                      const wipPct = wip ? Math.min(100, (col.count / wip) * 100) : 0;
                      return (
                        <div style={{ padding: '0.75rem 0.9rem', borderTop: `4px solid ${conf.cor}`, background: conf.bg, borderBottom: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>{col.label}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {wip && wipExcedido && (
                                <span title={`WIP excedido (m\u00e1ximo ${wip})`} style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#d97706', border: '1px solid #fbbf24', borderRadius: 99, padding: '1px 5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <AlertTriangle size={9} /> {col.count}/{wip}
                                </span>
                              )}
                              <span style={{ minWidth: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 99, background: wipExcedido ? '#ef4444' : conf.cor, color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>
                                {col.count || 0}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: conf.cor }}>
                            {col.valor_total > 0 ? fmt(col.valor_total) : '\u2014'}
                          </div>
                          {wip && (
                            <div style={{ height: 3, background: '#e2e8f0', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${wipPct}%`, background: wipExcedido ? '#ef4444' : conf.cor, borderRadius: 99, transition: 'width 0.3s' }} />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {(() => {
                      const grupos = agruparCards(col.requisicoes || []);
                      return (
                        <div style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', minHeight: 80 }}>
                          {(!col.requisicoes || col.requisicoes.length === 0) ? (
                            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#cbd5e1', fontSize: '0.82rem' }}>Nenhuma requisi\u00e7\u00e3o</div>
                          ) : grupos.map((grupo) => (
                            <React.Fragment key={grupo.key}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px', marginTop: 2 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: grupo.dot, flexShrink: 0 }} />
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {grupo.label} ({grupo.cards.length})
                                </span>
                              </div>
                              {grupo.cards.map((req) => (
                                viewMode === 'compacto'
                                  ? <CompactRow   key={req.id} req={req} colId={col.id} projetoId={projetoId} onAprovar={handleAprovarQuick} canDrag={podeAprovar} />
                                  : <DraggableCard key={req.id} req={req} colId={col.id} projetoId={projetoId} onAprovar={handleAprovarQuick} canDrag={podeAprovar} />
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </DroppableColumn>
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeReq ? <GhostCard req={activeReq} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {confirmacao && (
        <ConfirmModal
          req={confirmacao.req}
          colFrom={confirmacao.deLabel}
          colTo={confirmacao.paraLabel}
          onConfirm={confirmarMove}
          onCancel={() => setConfirmacao(null)}
          loading={confirmLoading}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 2000, background: toast.toLowerCase().includes('erro') ? '#dc2626' : '#1e293b', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: 10, fontSize: '0.88rem', fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 360 }}>
          {toast}
        </div>
      )}
    </ComprasLayout>
  );
}

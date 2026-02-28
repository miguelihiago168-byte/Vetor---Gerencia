import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import {
  detalharRequisicao, analisarItemRequisicao, inserirCotacaoItem, editarCotacaoItem,
  selecionarCotacaoItem, marcarItemComprado, cancelarItemRequisicao, aprovarTodosItens,
} from '../services/api';

const URGENCIA_BADGE  = { Normal: 'badge badge-gray', Urgente: 'badge badge-yellow', Emergencial: 'badge badge-red' };
const STATUS_ITEM_BADGE = {
  'Aguardando análise':   'badge badge-blue',
  'Reprovado':            'badge badge-red',
  'Em cotação':           'badge badge-green',
  'Cotação finalizada':   'badge badge-blue',
  'Aprovado para compra': 'badge badge-green',
  'Comprado':             'badge badge-green',
  'Cancelado':            'badge badge-gray',
};
const STATUS_REQ_BADGE = {
  'Em análise': 'badge badge-blue', 'Em cotação': 'badge badge-blue',
  'Aguardando decisão gestor geral': 'badge badge-yellow',
  'Compra autorizada': 'badge badge-green', 'Finalizada': 'badge badge-green',
  'Encerrada sem compra': 'badge badge-red',
};
const URGENCIA_COLOR = { Normal: '#64748b', Urgente: '#d97706', Emergencial: '#dc2626' };

const fmt = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

const SLOT_VAZIO = { fornecedor_nome: '', cnpj: '', telefone: '', email: '', valor_unitario: '', frete: '0', prazo_entrega: '' };

export default function RequisicaoDetalhe() {
  const { projetoId, id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const perfil = usuario?.perfil || '';

  const [req, setReq]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]   = useState('');
  const [salvando, setSalvando] = useState(false);

  /* ── modais ── */
  const [modalAnalise,  setModalAnalise]  = useState(null);   // { itemId }
  const [modalCotacao,  setModalCotacao]  = useState(null);   // { itemId, editando: bool, cotacoesExistentes: [] }
  const [modalCancelar, setModalCancelar] = useState(null);   // { itemId }

  /* ── forms ── */
  const [formAnalise,    setFormAnalise]   = useState({ aprovado: null, motivo: '' });
  const [slots, setSlots]                 = useState([{ ...SLOT_VAZIO }, { ...SLOT_VAZIO }, { ...SLOT_VAZIO }]);
  const [motivoCancelar, setMotivoCancelar] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const r = await detalharRequisicao(id);
      setReq(r.data);
    } catch { setErro('Erro ao carregar requisição.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  /* ── helpers ── */
  const updateSlot = (idx, field, value) =>
    setSlots(slots.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  const totalSlot = (slot, qtd) => {
    const val = Number(slot.valor_unitario || 0);
    const frete = Number(slot.frete || 0);
    if (!val || !qtd) return null;
    return qtd * val + frete;
  };

  /* ── ações ── */
  const analisar = async () => {
    if (formAnalise.aprovado === null) { setErro('Selecione Aprovar ou Reprovar.'); return; }
    if (!formAnalise.aprovado && !formAnalise.motivo.trim()) { setErro('Motivo de reprovação obrigatório.'); return; }
    setSalvando(true); setErro('');
    try {
      await analisarItemRequisicao(id, modalAnalise.itemId, { aprovado: formAnalise.aprovado, motivo_reprovacao: formAnalise.aprovado ? undefined : formAnalise.motivo });
      setModalAnalise(null); carregar();
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao analisar.'); }
    finally { setSalvando(false); }
  };

  const aprovarTodos = async () => {
    if (!window.confirm('Aprovar todos os itens em aguardando análise?')) return;
    try { await aprovarTodosItens(id); carregar(); }
    catch (err) { alert(err.response?.data?.erro || 'Erro ao aprovar em lote.'); }
  };

  const abrirModalCotacao = (item) => {
    const editando = (item.cotacoes?.length || 0) > 0;
    const novoSlots = [0, 1, 2].map((i) => {
      const cot = item.cotacoes?.[i];
      if (!cot) return { ...SLOT_VAZIO };
      return {
        id: cot.id,
        fornecedor_nome: cot.fornecedor_nome || '',
        cnpj: cot.cnpj || cot.fornecedor_cnpj || '',
        telefone: cot.telefone || '',
        email: cot.email || '',
        valor_unitario: String(cot.valor_unitario || ''),
        frete: String(cot.frete ?? '0'),
        prazo_entrega: cot.prazo_entrega || '',
      };
    });
    setSlots(novoSlots);
    setErro('');
    setModalCotacao({ itemId: item.id, qtd: item.quantidade, editando, cotacoesExistentes: item.cotacoes || [] });
  };

  const salvarCotacoes = async (e) => {
    e.preventDefault(); setErro(''); setSalvando(true);
    // Validar: todos 3 slots precisam ter nome + valor
    for (let i = 0; i < 3; i++) {
      const s = slots[i];
      if (!s.fornecedor_nome.trim()) { setErro(`Cotação ${i + 1}: nome do fornecedor obrigatório.`); setSalvando(false); return; }
      if (!s.valor_unitario || Number(s.valor_unitario) <= 0) { setErro(`Cotação ${i + 1}: valor unitário inválido.`); setSalvando(false); return; }
    }
    try {
      const { itemId, editando, cotacoesExistentes } = modalCotacao;
      for (let i = 0; i < 3; i++) {
        const s = slots[i];
        const payload = {
          fornecedor_nome: s.fornecedor_nome.trim(),
          cnpj: s.cnpj || undefined,
          telefone: s.telefone || undefined,
          email: s.email || undefined,
          valor_unitario: Number(s.valor_unitario),
          frete: Number(s.frete || 0),
          prazo_entrega: s.prazo_entrega || undefined,
        };
        if (editando && cotacoesExistentes[i]) {
          await editarCotacaoItem(id, itemId, cotacoesExistentes[i].id, payload);
        } else {
          await inserirCotacaoItem(id, itemId, payload);
        }
      }
      setModalCotacao(null);
      carregar();
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar cotações.'); }
    finally { setSalvando(false); }
  };

  const selecionarFornecedor = async (reqId, itemId, cotacaoId) => {
    if (!window.confirm('Confirmar seleção desta cotação?')) return;
    try { await selecionarCotacaoItem(reqId, itemId, cotacaoId); carregar(); }
    catch (err) { alert(err.response?.data?.erro || 'Erro ao selecionar.'); }
  };

  const autorizarCompra = async (itemId) => {
    if (!window.confirm('Confirmar autorização de compra?')) return;
    try { await marcarItemComprado(id, itemId); carregar(); }
    catch (err) { alert(err.response?.data?.erro || 'Erro ao autorizar compra.'); }
  };

  const cancelarItem = async () => {
    setSalvando(true);
    try { await cancelarItemRequisicao(id, modalCancelar.itemId, { motivo: motivoCancelar }); setModalCancelar(null); carregar(); }
    catch (err) { setErro(err.response?.data?.erro || 'Erro ao cancelar.'); }
    finally { setSalvando(false); }
  };

  if (loading) return (
    <ComprasLayout title="Detalhes da Requisição">
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
    </ComprasLayout>
  );
  if (!req) return (
    <ComprasLayout title="Detalhes da Requisição">
      <div className="alert alert-error">{erro || 'Requisição não encontrada.'}</div>
    </ComprasLayout>
  );

  const { itens = [], historico = [] } = req;
  const itensAtivos  = itens.filter((i) => !['Reprovado', 'Cancelado'].includes(i.status_item));
  const itensNegados = itens.filter((i) =>  ['Reprovado', 'Cancelado'].includes(i.status_item));
  const temAgAnalise = itensAtivos.some((i) => i.status_item === 'Aguardando análise');
  const podeGestor   = ['Gestor da Obra', 'Gestor Geral', 'ADM'].includes(perfil);
  const podeADM      = ['ADM', 'Gestor Geral'].includes(perfil);
  const voltarLink   = projetoId ? `/projeto/${projetoId}/compras` : '/compras';

  return (
    <ComprasLayout title={req.numero_requisicao}>
      {/* Breadcrumb */}
      <p style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem', color: 'var(--gray-500)' }}>
        <Link to={voltarLink} style={{ color: 'var(--primary)', textDecoration: 'none' }}>Requisições</Link>
        {' / '}{req.numero_requisicao}
      </p>

      {/* Cabeçalho */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{req.tipo_material}</h2>
            <p style={{ margin: '0.3rem 0 0', color: 'var(--gray-500)', fontSize: '0.88rem' }}>
              {req.projeto_nome || `Obra #${req.projeto_id}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={URGENCIA_BADGE[req.urgencia] || 'badge badge-gray'} style={{ color: URGENCIA_COLOR[req.urgencia] || undefined }}>{req.urgencia}</span>
            <span className={STATUS_REQ_BADGE[req.status_requisicao] || 'badge badge-gray'}>{req.status_requisicao}</span>
            {podeGestor && temAgAnalise && (
              <button className="btn btn-success" style={{ padding: '5px 14px', fontSize: '0.83rem' }} onClick={aprovarTodos}>
                ✓ Aprovar Todos
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.75rem', color: 'var(--gray-500)', fontSize: '0.84rem' }}>
          <span>Solicitante: <strong>{req.solicitante_nome || '—'}</strong></span>
          {req.centro_custo && <span>CC: <strong>{req.centro_custo}</strong></span>}
          <span>{new Date(req.criado_em).toLocaleDateString('pt-BR')}</span>
        </div>
        {req.observacao_geral && (
          <p style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 8, fontSize: '0.88rem', color: 'var(--gray-600)', margin: '0.75rem 0 0' }}>
            {req.observacao_geral}
          </p>
        )}
      </div>

      {/* Itens Ativos */}
      <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Itens ({itensAtivos.length})</h3>

      {itensAtivos.map((item, idx) => (
        <ItemCard
          key={item.id}
          item={item}
          idx={idx}
          perfil={perfil}
          podeGestor={podeGestor}
          podeADM={podeADM}
          reqId={id}
          onAnalisar={() => { setFormAnalise({ aprovado: null, motivo: '' }); setModalAnalise({ itemId: item.id }); setErro(''); }}
          onCotacoes={() => abrirModalCotacao(item)}
          onSelecionar={selecionarFornecedor}
          onAutorizar={() => autorizarCompra(item.id)}
          onCancelar={() => { setMotivoCancelar(''); setModalCancelar({ itemId: item.id }); setErro(''); }}
        />
      ))}

      {/* Itens Negados */}
      {itensNegados.length > 0 && (
        <details style={{ marginTop: '1.5rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--danger)', fontSize: '0.9rem', fontWeight: 700, userSelect: 'none', marginBottom: '0.75rem' }}>
            Itens Negados / Cancelados ({itensNegados.length})
          </summary>
          {itensNegados.map((item, idx) => (
            <div key={item.id} className="card" style={{ padding: '1rem 1.25rem', marginBottom: '0.75rem', borderLeft: '4px solid #fca5a5', opacity: 0.85 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ color: 'var(--gray-400)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Item {itensAtivos.length + idx + 1}</span>
                  <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.95rem' }}>{item.descricao}</h4>
                  <span style={{ color: 'var(--gray-500)', fontSize: '0.84rem' }}>{item.quantidade} {item.unidade || ''}</span>
                </div>
                <span className={STATUS_ITEM_BADGE[item.status_item] || 'badge badge-gray'}>{item.status_item}</span>
              </div>
              {item.motivo_reprovacao && (
                <p style={{ marginTop: '0.5rem', color: 'var(--danger)', fontSize: '0.84rem' }}>
                  <strong>Motivo:</strong> {item.motivo_reprovacao}
                </p>
              )}
            </div>
          ))}
        </details>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <details style={{ marginTop: '1.5rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--gray-500)', fontSize: '0.9rem', fontWeight: 600, userSelect: 'none', marginBottom: '0.5rem' }}>
            Histórico de alterações ({historico.length})
          </summary>
          <div className="card" style={{ padding: '1rem', marginTop: '0.5rem' }}>
            {historico.map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.83rem', color: 'var(--gray-600)' }}>
                <span>
                  <strong>{h.tipo_evento.replace(/_/g, ' ')}</strong>
                  {h.status_anterior && <> · {h.status_anterior} → {h.status_novo}</>}
                  {h.usuario_nome && <> · {h.usuario_nome}</>}
                </span>
                <span style={{ color: 'var(--gray-400)' }}>{new Date(h.criado_em).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ═══ Modal Análise ═══ */}
      {modalAnalise && (
        <div className="modal-overlay" onClick={() => setModalAnalise(null)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Analisar Item</h2>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <button type="button" onClick={() => setFormAnalise({ ...formAnalise, aprovado: true })}
                className={formAnalise.aprovado === true ? 'btn btn-success' : 'btn btn-secondary'}
                style={{ flex: 1, padding: '0.9rem' }}>✓ Aprovar para Cotação</button>
              <button type="button" onClick={() => setFormAnalise({ ...formAnalise, aprovado: false })}
                className={formAnalise.aprovado === false ? 'btn btn-danger' : 'btn btn-secondary'}
                style={{ flex: 1, padding: '0.9rem' }}>✕ Reprovar Item</button>
            </div>
            {formAnalise.aprovado === false && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Motivo de Reprovação *</label>
                <textarea className="form-input" rows={3} style={{ resize: 'vertical' }} value={formAnalise.motivo} onChange={(e) => setFormAnalise({ ...formAnalise, motivo: e.target.value })} />
              </div>
            )}
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalAnalise(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={analisar} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Cotações (3 slots) ═══ */}
      {modalCotacao && (
        <div className="modal-overlay" onClick={() => setModalCotacao(null)}>
          <div className="modal-card" style={{ maxWidth: 1100, width: '96vw' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '0.25rem' }}>
              {modalCotacao.editando ? 'Editar Cotações' : 'Inserir Cotações'}
            </h2>
            <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Preencha as 3 cotações. Quantidade do item: <strong>{modalCotacao.qtd}</strong>
            </p>
            <form onSubmit={salvarCotacoes}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {slots.map((slot, idx) => {
                  const total = totalSlot(slot, modalCotacao.qtd);
                  return (
                    <div key={idx} style={{ border: '2px solid #e2e8f0', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.9rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                        Cotação {idx + 1}
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>Fornecedor *</label>
                        <input className="form-input" style={{ padding: '0.45rem 0.75rem', fontSize: '0.86rem' }} value={slot.fornecedor_nome} onChange={(e) => updateSlot(idx, 'fornecedor_nome', e.target.value)} placeholder="Nome do fornecedor" />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>CNPJ</label>
                        <input className="form-input" style={{ padding: '0.45rem 0.75rem', fontSize: '0.86rem' }} value={slot.cnpj} onChange={(e) => updateSlot(idx, 'cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>Telefone</label>
                          <input className="form-input" style={{ padding: '0.45rem 0.75rem', fontSize: '0.86rem' }} value={slot.telefone} onChange={(e) => updateSlot(idx, 'telefone', e.target.value)} placeholder="(00) 0000-0000" />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>E-mail</label>
                          <input className="form-input" type="email" style={{ padding: '0.45rem 0.75rem', fontSize: '0.86rem' }} value={slot.email} onChange={(e) => updateSlot(idx, 'email', e.target.value)} placeholder="contato@..." />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>Valor Unit. (R$) *</label>
                          <input className="form-input" style={{ padding: '0.45rem 0.75rem', fontSize: '0.86rem' }} type="number" min="0.01" step="any" value={slot.valor_unitario} onChange={(e) => updateSlot(idx, 'valor_unitario', e.target.value)} />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>Frete (R$)</label>
                          <input className="form-input" style={{ padding: '0.45rem 0.75rem', fontSize: '0.86rem' }} type="number" min="0" step="any" value={slot.frete} onChange={(e) => updateSlot(idx, 'frete', e.target.value)} />
                        </div>
                      </div>
                      {/* Total calculado */}
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>Total (qtd × unit + frete)</span>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#047857' }}>{total != null ? fmt(total) : '—'}</div>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>Prazo de Entrega</label>
                        <input className="form-input" style={{ padding: '0.45rem 0.75rem', fontSize: '0.86rem' }} value={slot.prazo_entrega} onChange={(e) => updateSlot(idx, 'prazo_entrega', e.target.value)} placeholder="Ex: 5 dias úteis" />
                      </div>
                    </div>
                  );
                })}
              </div>
              {erro && <p className="alert alert-error" style={{ marginTop: '1rem' }}>{erro}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalCotacao(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Enviar para Cotação'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Modal Cancelar ═══ */}
      {modalCancelar && (
        <div className="modal-overlay" onClick={() => setModalCancelar(null)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Cancelar Item</h2>
            <div style={{ marginBottom: '1rem' }}><label className="form-label">Motivo (opcional)</label><textarea className="form-input" rows={3} style={{ resize: 'vertical' }} value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} /></div>
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalCancelar(null)}>Voltar</button>
              <button className="btn btn-danger" onClick={cancelarItem} disabled={salvando}>{salvando ? 'Cancelando...' : 'Confirmar Cancelamento'}</button>
            </div>
          </div>
        </div>
      )}
    </ComprasLayout>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sub-componente: card de item ativo
──────────────────────────────────────────────────────────────────────────── */
function ItemCard({ item, idx, perfil, podeGestor, podeADM, reqId,
  onAnalisar, onCotacoes, onSelecionar, onAutorizar, onCancelar }) {

  const temCotacoes  = (item.cotacoes?.length || 0) > 0;
  const cotCompletas = (item.cotacoes?.length || 0) >= 3;

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <span style={{ color: 'var(--gray-400)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Item {idx + 1}</span>
          <h4 style={{ margin: '0.2rem 0 0', fontSize: '1rem' }}>{item.descricao}</h4>
          <span style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>{item.quantidade} {item.unidade || ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {item.impacto_cronograma && <span className="badge badge-yellow">⏱ Cronograma</span>}
          {item.impacto_seguranca  && <span className="badge badge-red">⚠ Segurança</span>}
          {item.impacto_qualidade  && <span className="badge badge-blue">★ Qualidade</span>}
          <span className={STATUS_ITEM_BADGE[item.status_item] || 'badge badge-gray'}>{item.status_item}</span>
        </div>
      </div>

      {item.especificacao_tecnica && <p style={{ color: 'var(--gray-600)', fontSize: '0.84rem', margin: '0 0 0.4rem' }}><strong>Especificação:</strong> {item.especificacao_tecnica}</p>}
      {item.justificativa         && <p style={{ color: 'var(--gray-600)', fontSize: '0.84rem', margin: '0 0 0.4rem' }}><strong>Justificativa:</strong> {item.justificativa}</p>}

      {/* Cotações */}
      {temCotacoes && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
          <p style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray-400)', margin: '0 0 0.5rem', letterSpacing: '0.05em' }}>
            Cotações ({item.cotacoes.length}/3)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
            {item.cotacoes.map((cot) => {
              const total = (item.quantidade * Number(cot.valor_unitario)) + Number(cot.frete || 0);
              return (
                <div key={cot.id} style={{ background: cot.selecionada ? '#ecfdf3' : '#f8fafc', border: cot.selecionada ? '1px solid #86efac' : '1px solid #e2e8f0', borderRadius: 8, padding: '0.7rem 1rem' }}>
                  <div style={{ fontWeight: 600, color: cot.selecionada ? '#047857' : 'var(--secondary)', fontSize: '0.9rem' }}>
                    {cot.fornecedor_nome || '—'}
                    {cot.selecionada && <span className="badge badge-green" style={{ marginLeft: 8, fontSize: '0.72rem' }}>✓ Selecionada</span>}
                  </div>
                  {cot.cnpj && <div style={{ color: 'var(--gray-400)', fontSize: '0.77rem' }}>{cot.cnpj}</div>}
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.82rem', marginTop: '0.3rem' }}>
                    <strong style={{ color: '#047857' }}>{fmt(cot.valor_unitario)}</strong>/un
                    {cot.frete > 0 && <span> · Frete: {fmt(cot.frete)}</span>}
                    <span style={{ display: 'block', fontSize: '0.78rem', color: '#047857', marginTop: '0.15rem' }}>Total: {fmt(total)}</span>
                    {cot.prazo_entrega && <span> · Entrega: {cot.prazo_entrega}</span>}
                  </div>
                  {['Gestor Geral', 'ADM'].includes(perfil) && item.status_item === 'Cotação finalizada' && !cot.selecionada && (
                    <button className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '5px 12px', fontSize: '0.8rem', width: '100%' }}
                      onClick={() => onSelecionar(reqId, item.id, cot.id)}>
                      Selecionar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {podeGestor && item.status_item === 'Aguardando análise' && (
          <button className="btn btn-success" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onAnalisar}>
            Analisar Item
          </button>
        )}
        {podeADM && ['Em cotação', 'Cotação finalizada'].includes(item.status_item) && (
          <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onCotacoes}>
            {cotCompletas ? '✎ Editar Cotações' : `+ Cotações (${item.cotacoes?.length || 0}/3)`}
          </button>
        )}
        {podeADM && item.status_item === 'Aprovado para compra' && (
          <button className="btn btn-success" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onAutorizar}>
            ✓ Autorizar Compra
          </button>
        )}
        {podeADM && !['Comprado', 'Cancelado'].includes(item.status_item) && (
          <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onCancelar}>
            Cancelar Item
          </button>
        )}
      </div>
    </div>
  );
}

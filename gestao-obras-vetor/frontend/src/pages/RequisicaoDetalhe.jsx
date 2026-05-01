import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import { fmtTs, fmtData } from '../utils/date';
import {
  detalharRequisicao, analisarItemRequisicao, inserirCotacaoItem, editarCotacaoItem,
  selecionarCotacaoItem, marcarItemComprado, cancelarItemRequisicao, devolverCotacaoItem,
  finalizarCotacaoItem, alterarQuantidadeItem, editarRequisicaoHeader, editarItemRequisicao,
  aprovarTodosItens,
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
  const [modalDevolver, setModalDevolver] = useState(null);   // { itemId }
  const [modalAlterar,  setModalAlterar]  = useState(null);   // { itemId, quantidadeAtual, unidade }
  const [novaQuantidade, setNovaQuantidade] = useState('');
  const [modalConfirm,  setModalConfirm]  = useState(null);   // { mensagem, onConfirm }
  const [modalEditarReq,  setModalEditarReq]  = useState(false);
  const [formEditarReq,   setFormEditarReq]   = useState({});
  const [modalEditarItem, setModalEditarItem] = useState(null); // item completo

  const confirmar = (mensagem, onConfirm) => setModalConfirm({ mensagem, onConfirm });

  /* ── forms ── */
  const [formAnalise,    setFormAnalise]   = useState({ aprovado: null, motivo: '' });
  const [slots, setSlots]                 = useState([{ ...SLOT_VAZIO }, { ...SLOT_VAZIO }, { ...SLOT_VAZIO }]);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [motivoDevolver, setMotivoDevolver] = useState('');
  const [toast, setToast] = useState(null); // { msg }

  const showToast = (msg) => {
    setToast({ msg });
    setTimeout(() => setToast(null), 4000);
  };

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

  const aprovarTodos = () => {
    confirmar('Aprovar todos os itens em aguardando análise?', async () => {
      try { await aprovarTodosItens(id); carregar(); }
      catch (err) { setErro(err.response?.data?.erro || 'Erro ao aprovar em lote.'); }
    });
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

      // Detecta se um slot realmente mudou em relação à cotação existente
      const slotMudou = (slot, cot) => {
        if (!cot) return true; // cotação nova (inserção)
        const norm = (v) => String(v ?? '').trim();
        const normNum = (v) => Number(v || 0);
        return (
          norm(slot.fornecedor_nome) !== norm(cot.fornecedor_nome) ||
          norm(slot.cnpj) !== norm(cot.cnpj || cot.fornecedor_cnpj) ||
          norm(slot.telefone) !== norm(cot.telefone) ||
          norm(slot.email) !== norm(cot.email) ||
          normNum(slot.valor_unitario) !== normNum(cot.valor_unitario) ||
          normNum(slot.frete) !== normNum(cot.frete) ||
          norm(slot.prazo_entrega) !== norm(cot.prazo_entrega)
        );
      };

      let algumaMudanca = false;
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
          if (slotMudou(s, cotacoesExistentes[i])) {
            await editarCotacaoItem(id, itemId, cotacoesExistentes[i].id, payload);
            algumaMudanca = true;
          }
        } else {
          await inserirCotacaoItem(id, itemId, payload);
          algumaMudanca = true;
        }
      }
      // Só finaliza (muda status para "Cotação finalizada") se houve alguma alteração real
      if (algumaMudanca) {
        await finalizarCotacaoItem(id, itemId);
      }
      setModalCotacao(null);
      carregar();
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar cotações.'); }
    finally { setSalvando(false); }
  };

  const selecionarFornecedor = (reqId, itemId, cotacaoId) => {
    confirmar('Confirmar seleção desta cotação?', async () => {
      try { await selecionarCotacaoItem(reqId, itemId, cotacaoId); carregar(); }
      catch (err) { setErro(err.response?.data?.erro || 'Erro ao selecionar.'); }
    });
  };

  const autorizarCompra = (itemId) => {
    confirmar('Confirmar autorização de compra?', async () => {
      try { await marcarItemComprado(id, itemId); carregar(); }
      catch (err) { setErro(err.response?.data?.erro || 'Erro ao autorizar compra.'); }
    });
  };

  const cancelarItem = async () => {
    setSalvando(true);
    try { await cancelarItemRequisicao(id, modalCancelar.itemId, { motivo: motivoCancelar }); setModalCancelar(null); carregar(); }
    catch (err) { setErro(err.response?.data?.erro || 'Erro ao cancelar.'); }
    finally { setSalvando(false); }
  };

  const devolverCotacao = async () => {
    if (!motivoDevolver.trim()) { setErro('Informe o motivo da devolução.'); return; }
    setSalvando(true); setErro('');
    try { await devolverCotacaoItem(id, modalDevolver.itemId, { motivo: motivoDevolver }); setModalDevolver(null); await carregar(); showToast('Cotação devolvida. Verifique o histórico.'); }
    catch (err) { setErro(err.response?.data?.erro || 'Erro ao devolver cotação.'); }
    finally { setSalvando(false); }
  };

  const salvarAlteracao = async () => {
    const qtd = Number(novaQuantidade);
    if (!novaQuantidade || qtd <= 0) { setErro('Informe uma quantidade maior que zero.'); return; }
    setSalvando(true); setErro('');
    try { await alterarQuantidadeItem(id, modalAlterar.itemId, qtd); setModalAlterar(null); setNovaQuantidade(''); carregar(); }
    catch (err) { setErro(err.response?.data?.erro || 'Erro ao alterar quantidade.'); }
    finally { setSalvando(false); }
  };

  const abrirEditarReq = () => {
    setFormEditarReq({
      urgencia: req.urgencia || 'Normal',
      tipo_material: req.tipo_material || '',
      centro_custo: req.centro_custo || '',
      observacao_geral: req.observacao_geral || '',
    });
    setErro('');
    setModalEditarReq(true);
  };

  const salvarEdicaoReq = async () => {
    setSalvando(true); setErro('');
    try {
      await editarRequisicaoHeader(id, formEditarReq);
      setModalEditarReq(false);
      carregar();
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar alterações.'); }
    finally { setSalvando(false); }
  };

  const abrirEditarItem = (item) => {
    setModalEditarItem({
      itemId: item.id,
      descricao: item.descricao || '',
      quantidade: String(item.quantidade),
      unidade: item.unidade || '',
      especificacao_tecnica: item.especificacao_tecnica || '',
      justificativa: item.justificativa || '',
      impacto_cronograma: !!item.impacto_cronograma,
      impacto_seguranca: !!item.impacto_seguranca,
      impacto_qualidade: !!item.impacto_qualidade,
    });
    setErro('');
  };

  const salvarEdicaoItem = async () => {
    if (!modalEditarItem.descricao.trim()) { setErro('Descrição obrigatória.'); return; }
    if (!modalEditarItem.quantidade || Number(modalEditarItem.quantidade) <= 0) { setErro('Quantidade inválida.'); return; }
    setSalvando(true); setErro('');
    try {
      await editarItemRequisicao(id, modalEditarItem.itemId, {
        descricao: modalEditarItem.descricao,
        quantidade: Number(modalEditarItem.quantidade),
        unidade: modalEditarItem.unidade,
        especificacao_tecnica: modalEditarItem.especificacao_tecnica,
        justificativa: modalEditarItem.justificativa,
        impacto_cronograma: modalEditarItem.impacto_cronograma,
        impacto_seguranca: modalEditarItem.impacto_seguranca,
        impacto_qualidade: modalEditarItem.impacto_qualidade,
      });
      setModalEditarItem(null);
      carregar();
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar item.'); }
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
  const podeGestor   = ['Gestor Geral'].includes(perfil);
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
              <button className="btn btn-soft-green" style={{ padding: '5px 14px', fontSize: '0.83rem' }} onClick={aprovarTodos}>
                ✓ Aprovar Todos
              </button>
            )}
            {podeGestor && !['Finalizada', 'Encerrada sem compra'].includes(req.status_requisicao) && (
              <button className="btn btn-soft-yellow" style={{ padding: '5px 14px', fontSize: '0.83rem' }} onClick={abrirEditarReq}>
                ✎ Editar Requisição
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.75rem', color: 'var(--gray-500)', fontSize: '0.84rem' }}>
          <span>Solicitante: <strong>{req.solicitante_nome || '—'}</strong></span>
          {req.centro_custo && <span>CC: <strong>{req.centro_custo}</strong></span>}
          <span>{fmtData(req.criado_em)}</span>
        </div>
        {req.observacao_geral && (
          <p style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--gray-50)', borderRadius: 8, fontSize: '0.88rem', color: 'var(--gray-600)', margin: '0.75rem 0 0', border: '1px solid var(--border-default)' }}>
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
          reqStatus={req.status_requisicao}
          onAnalisar={() => { setFormAnalise({ aprovado: null, motivo: '' }); setModalAnalise({ itemId: item.id }); setErro(''); }}
          onCotacoes={() => abrirModalCotacao(item)}
          onSelecionar={selecionarFornecedor}
          onAutorizar={() => autorizarCompra(item.id)}
          onCancelar={() => { setMotivoCancelar(''); setModalCancelar({ itemId: item.id }); setErro(''); }}
          onDevolver={() => { setMotivoDevolver(''); setModalDevolver({ itemId: item.id }); setErro(''); }}
          onAlterar={() => { setNovaQuantidade(String(item.quantidade)); setModalAlterar({ itemId: item.id, quantidadeAtual: item.quantidade, unidade: item.unidade || '' }); setErro(''); }}
          onEditar={() => { abrirEditarItem(item); }}
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
            {historico.map((h) => {
              let detalhes = null;
              try { detalhes = h.detalhes ? JSON.parse(h.detalhes) : null; } catch (_) {}
              const alteracoes = detalhes?.alteracoes || [];
              const motivo = detalhes?.motivo_reprovacao || detalhes?.motivo || null;
              const tipoEventoLabel = {
                REQUISICAO_CRIADA:       'Requisição criada',
                REQUISICAO_EDITADA:      'Requisição editada',
                STATUS_REQUISICAO_ALTERADO: 'Status da requisição alterado',
                ITEM_APROVADO_COTACAO:   'Item aprovado para cotação',
                ITEM_REPROVADO:          'Item reprovado',
                ITEM_CANCELADO:          'Item cancelado',
                ITEM_COMPRADO:           'Item comprado',
                ITEM_EDITADO:            'Item editado',
                COTACAO_INSERIDA:        'Cotação inserida',
                COTACAO_EDITADA:         'Cotação editada',
                COTACAO_FINALIZADA:      'Cotação finalizada',
                COTACAO_DEVOLVIDA:       'Cotação devolvida',
                QUANTIDADE_ALTERADA:     'Quantidade alterada',
              };
              const labelMap = {
                descricao: 'Descrição', quantidade: 'Quantidade', unidade: 'Unidade',
                unidade_medida: 'Unidade', aplicacao_local: 'Aplicação/Local',
                observacoes: 'Observações', observacao_geral: 'Observação geral',
                status: 'Status', nome: 'Nome', prioridade: 'Prioridade',
                data_necessidade: 'Data necessidade', urgencia: 'Urgência',
                tipo_material: 'Tipo de material', centro_custo: 'Centro de custo',
                especificacao_tecnica: 'Especificação técnica', justificativa: 'Justificativa',
                impacto_cronograma: 'Impacto no cronograma', impacto_seguranca: 'Impacto na segurança',
                impacto_qualidade: 'Impacto na qualidade',
                fornecedor_nome: 'Fornecedor', cnpj: 'CNPJ', telefone: 'Telefone', email: 'E-mail',
                valor_unitario: 'Valor unitário', frete: 'Frete', prazo_entrega: 'Prazo de entrega',
              };
              return (
                <div key={h.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--gray-100)', fontSize: '0.83rem', color: 'var(--gray-600)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span>
                      <strong>{tipoEventoLabel[h.tipo_evento] || h.tipo_evento.replace(/_/g, ' ')}</strong>
                      {h.status_anterior && <> · <span style={{ color: 'var(--gray-400)' }}>{h.status_anterior}</span> → <span style={{ color: 'var(--text-primary)' }}>{h.status_novo}</span></>}
                      {h.usuario_nome && <> · {h.usuario_nome}</>}
                    </span>
                    <span style={{ color: 'var(--gray-400)' }}>{fmtTs(h.criado_em)}</span>
                  </div>
                  {alteracoes.length > 0 && (
                    <ul style={{ margin: '0.4rem 0 0 0', padding: '0 0 0 1rem', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {alteracoes.map((alt, i) => (
                        <li key={i} style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--gray-600)' }}>{labelMap[alt.campo] || alt.campo}:</span>{' '}
                          <span style={{ textDecoration: 'line-through', color: 'var(--gray-400)' }}>{alt.anterior ?? '—'}</span>
                          {' → '}
                          <span style={{ color: 'var(--text-primary)' }}>{alt.novo ?? '—'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {motivo && (
                    <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.78rem', color: 'var(--alert-error-color)' }}>
                      Motivo: {motivo}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ═══ Modal Análise ═══ */}
      {modalAnalise && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalAnalise(null)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Analisar Item</h2>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <button type="button" onClick={() => setFormAnalise({ ...formAnalise, aprovado: true })}
                className="btn btn-soft-green"
                style={{ flex: 1, padding: '0.9rem', fontWeight: formAnalise.aprovado === true ? 700 : 500, opacity: formAnalise.aprovado === false ? 0.55 : 1 }}>
                ✓ Aprovar para Cotação</button>
              <button type="button" onClick={() => setFormAnalise({ ...formAnalise, aprovado: false })}
                className="btn btn-soft-red"
                style={{ flex: 1, padding: '0.9rem', fontWeight: formAnalise.aprovado === false ? 700 : 500, opacity: formAnalise.aprovado === true ? 0.55 : 1 }}>
                ✕ Reprovar Item</button>
            </div>
            {formAnalise.aprovado === false && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Motivo de Reprovação *</label>
                <textarea className="form-input" rows={3} style={{ resize: 'vertical' }} value={formAnalise.motivo} onChange={(e) => setFormAnalise({ ...formAnalise, motivo: e.target.value })} />
              </div>
            )}
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setModalAnalise(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={analisar} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Cotações (3 slots) ═══ */}
      {modalCotacao && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalCotacao(null)}>
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
                    <div key={idx} style={{ border: '2px solid var(--border-default)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'var(--card-bg)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.9rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--gray-100)' }}>
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
                      <div style={{ background: 'var(--badge-green-bg)', border: '1px solid var(--badge-green-color)', borderRadius: 8, padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>Total (qtd × unit + frete)</span>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--badge-green-color)' }}>{total != null ? fmt(total) : '—'}</div>
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
                <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Finalizar Cotação'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Modal Editar Requisição ═══ */}
      {modalEditarReq && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalEditarReq(false)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Editar Requisição</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label className="form-label">Urgência</label>
                <select className="form-input" value={formEditarReq.urgencia} onChange={(e) => setFormEditarReq({ ...formEditarReq, urgencia: e.target.value })}>
                  <option>Normal</option>
                  <option>Urgente</option>
                  <option>Emergencial</option>
                </select>
              </div>
              <div>
                <label className="form-label">Tipo de Material</label>
                <select className="form-input" value={formEditarReq.tipo_material} onChange={(e) => setFormEditarReq({ ...formEditarReq, tipo_material: e.target.value })}>
                  {['Materiais Elétricos','Materiais Civis','Materiais Eletrônicos','Ferramentas','EPIs','Serviços','Outros'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Centro de Custo</label>
              <input className="form-input" value={formEditarReq.centro_custo} onChange={(e) => setFormEditarReq({ ...formEditarReq, centro_custo: e.target.value })} placeholder="Opcional" />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Observação Geral</label>
              <textarea className="form-input" rows={3} style={{ resize: 'vertical' }} value={formEditarReq.observacao_geral} onChange={(e) => setFormEditarReq({ ...formEditarReq, observacao_geral: e.target.value })} placeholder="Opcional" />
            </div>
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalEditarReq(false)}>Voltar</button>
              <button className="btn btn-primary" onClick={salvarEdicaoReq} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar Edição'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Editar Item ═══ */}
      {modalEditarItem && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalEditarItem(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Editar Item</h2>
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={modalEditarItem.descricao} onChange={(e) => setModalEditarItem({ ...modalEditarItem, descricao: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label className="form-label">Quantidade *</label>
                <input className="form-input" type="number" min="0.01" step="any" value={modalEditarItem.quantidade} onChange={(e) => setModalEditarItem({ ...modalEditarItem, quantidade: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Unidade</label>
                <input className="form-input" value={modalEditarItem.unidade} onChange={(e) => setModalEditarItem({ ...modalEditarItem, unidade: e.target.value })} placeholder="m, kg, un…" />
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Especificação Técnica</label>
              <textarea className="form-input" rows={2} style={{ resize: 'vertical' }} value={modalEditarItem.especificacao_tecnica} onChange={(e) => setModalEditarItem({ ...modalEditarItem, especificacao_tecnica: e.target.value })} />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Justificativa</label>
              <textarea className="form-input" rows={2} style={{ resize: 'vertical' }} value={modalEditarItem.justificativa} onChange={(e) => setModalEditarItem({ ...modalEditarItem, justificativa: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {[['impacto_cronograma', '⏱ Impacto Cronograma'], ['impacto_seguranca', '⚠ Impacto Segurança'], ['impacto_qualidade', '★ Impacto Qualidade']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={!!modalEditarItem[key]} onChange={(e) => setModalEditarItem({ ...modalEditarItem, [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalEditarItem(null)}>Voltar</button>
              <button className="btn btn-primary" onClick={salvarEdicaoItem} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar Edição'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Alterar Quantidade ═══ */}
      {modalAlterar && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalAlterar(null)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Alterar Quantidade</h2>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Quantidade atual: <strong>{modalAlterar.quantidadeAtual} {modalAlterar.unidade}</strong>
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Nova Quantidade *</label>
              <input
                className="form-input"
                type="number"
                min="0.01"
                step="any"
                value={novaQuantidade}
                onChange={(e) => setNovaQuantidade(e.target.value)}
                autoFocus
              />
            </div>
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalAlterar(null)}>Voltar</button>
              <button className="btn btn-primary" onClick={salvarAlteracao} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar Alteração'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Cancelar ═══ */}
      {modalCancelar && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalCancelar(null)}>
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

      {/* ═══ Modal Devolver Cotação ═══ */}
      {modalDevolver && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalDevolver(null)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Devolver para Cotação</h2>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--gray-500)' }}>
              As cotações existentes serão mantidas. O ADM verá o motivo e poderá corrigir o que for necessário.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Motivo da Devolução *</label>
              <textarea className="form-input" rows={3} style={{ resize: 'vertical' }}
                value={motivoDevolver} onChange={(e) => setMotivoDevolver(e.target.value)}
                placeholder="Ex: Cotação incompleta, verificar fornecedor X..." />
            </div>
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalDevolver(null)}>Voltar</button>
              <button className="btn btn-danger" onClick={devolverCotacao} disabled={salvando}>{salvando ? 'Devolvendo...' : 'Confirmar Devolução'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação genérico */}
      {modalConfirm && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalConfirm(null)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1rem', fontSize: '1.05rem' }}>Confirmar ação</h2>
            <p style={{ color: 'var(--gray-600)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>{modalConfirm.mensagem}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalConfirm(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { modalConfirm.onConfirm(); setModalConfirm(null); }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast discreto */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
          background: 'var(--card-bg, #fff)', border: '1px solid var(--gray-200)',
          borderLeft: '4px solid var(--badge-blue-color, #3b82f6)',
          borderRadius: 8, padding: '0.75rem 1.1rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          fontSize: '0.88rem', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          animation: 'fadeIn 0.2s ease',
        }}>
          <span>ℹ️</span> {toast.msg}
        </div>
      )}
    </ComprasLayout>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sub-componente: card de item ativo
──────────────────────────────────────────────────────────────────────────── */
function ItemCard({ item, idx, perfil, podeGestor, podeADM, reqId, reqStatus,
  onAnalisar, onCotacoes, onSelecionar, onAutorizar, onCancelar, onDevolver, onAlterar, onEditar }) {

  const temCotacoes  = (item.cotacoes?.length || 0) > 0;
  const cotCompletas = (item.cotacoes?.length || 0) >= 3;
  const reqFinalizada = ['Finalizada', 'Encerrada sem compra'].includes(reqStatus);

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <span style={{ color: 'var(--gray-400)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Item {idx + 1}</span>
          <h4 style={{ margin: '0.2rem 0 0', fontSize: '1rem' }}>{item.descricao}</h4>
          <span style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>{item.quantidade} {item.unidade || ''}</span>
          {item.quantidade_original != null && (
            <p style={{ fontSize: '0.78rem', color: 'var(--badge-yellow-color)', margin: '0.25rem 0 0' }}>
              ⚠ Alterado de {item.quantidade_original} {item.unidade || ''} para {item.quantidade} {item.unidade || ''} em {fmtData(item.alterado_em)} por {item.alterado_por_nome}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {!!item.impacto_cronograma && <span className="badge badge-yellow">⏱ Cronograma</span>}
          {!!item.impacto_seguranca  && <span className="badge badge-red">⚠ Segurança</span>}
          {!!item.impacto_qualidade  && <span className="badge badge-blue">★ Qualidade</span>}
          <span className={STATUS_ITEM_BADGE[item.status_item] || 'badge badge-gray'}>{item.status_item}</span>
        </div>
      </div>

      {item.especificacao_tecnica && <p style={{ color: 'var(--gray-600)', fontSize: '0.84rem', margin: '0 0 0.4rem' }}><strong>Especificação:</strong> {item.especificacao_tecnica}</p>}
      {item.justificativa         && <p style={{ color: 'var(--gray-600)', fontSize: '0.84rem', margin: '0 0 0.4rem' }}><strong>Justificativa:</strong> {item.justificativa}</p>}

      {/* Cotações */}
      {temCotacoes && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--gray-100)', paddingTop: '0.75rem' }}>
          <p style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray-400)', margin: '0 0 0.5rem', letterSpacing: '0.05em' }}>
            Cotações ({item.cotacoes.length}/3)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
            {(() => {
              const totais = item.cotacoes.map(c => (item.quantidade * Number(c.valor_unitario)) + Number(c.frete || 0));
              const menorTotal = Math.min(...totais);
              return item.cotacoes.map((cot, cidx) => {
              const total = totais[cidx];
              const isMenor = !cot.selecionada && total === menorTotal;
              return (
                <div key={cot.id} style={{
                  background: cot.selecionada ? 'var(--badge-green-bg)' : (isMenor ? 'var(--badge-yellow-bg)' : 'var(--gray-50)'),
                  border: cot.selecionada ? '2px solid var(--badge-green-color)' : (isMenor ? '2px solid var(--badge-yellow-color)' : '1px solid var(--border-default)'),
                  borderRadius: 8, padding: '0.7rem 1rem',
                }}>
                  <div style={{ fontWeight: 600, color: cot.selecionada ? 'var(--badge-green-color)' : (isMenor ? 'var(--badge-yellow-color)' : 'var(--text-primary)'), fontSize: '0.9rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span>{cot.fornecedor_nome || '—'}</span>
                    {!!cot.selecionada && <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>✓ Selecionada</span>}
                    {isMenor && <span style={{ fontSize: '0.72rem', background: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-color)', border: '1px solid var(--badge-yellow-color)', borderRadius: 4, padding: '1px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>⭐ Menor preço</span>}
                  </div>
                  {cot.cnpj && <div style={{ color: 'var(--gray-400)', fontSize: '0.77rem' }}>{cot.cnpj}</div>}
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.82rem', marginTop: '0.3rem' }}>
                    <strong style={{ color: cot.selecionada ? 'var(--badge-green-color)' : (isMenor ? 'var(--badge-yellow-color)' : 'var(--badge-green-color)') }}>{fmt(cot.valor_unitario)}</strong>/un
                    {cot.frete > 0 && <span> · Frete: {fmt(cot.frete)}</span>}
                    <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: cot.selecionada ? 'var(--badge-green-color)' : (isMenor ? 'var(--badge-yellow-color)' : 'var(--text-primary)'), marginTop: '0.2rem' }}>
                      Total c/ frete: {fmt(total)}
                    </span>
                    {cot.prazo_entrega && <span> · Entrega: {cot.prazo_entrega}</span>}
                  </div>
                  {perfil === 'Gestor Geral' && item.status_item === 'Cotação finalizada' && !cot.selecionada && (
                    <button className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '5px 12px', fontSize: '0.8rem', width: '100%' }}
                      onClick={() => onSelecionar(reqId, item.id, cot.id)}>
                      Selecionar
                    </button>
                  )}
                </div>
              );
            });
            })()}
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {podeGestor && !reqFinalizada && item.status_item === 'Aguardando análise' && (
          <button className="btn btn-soft-green" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onAnalisar}>
            Analisar Item
          </button>
        )}
        {podeADM && !reqFinalizada && ['Em cotação', 'Cotação finalizada'].includes(item.status_item) && (
          <button className="btn btn-soft-blue" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onCotacoes}>
            {cotCompletas ? '✎ Editar Cotações' : `+ Cotações (${item.cotacoes?.length || 0}/3)`}
          </button>
        )}
        {podeADM && !reqFinalizada && item.status_item === 'Aprovado para compra' && (
          <button className="btn btn-soft-green" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onAutorizar}>
            ✓ Autorizar Compra
          </button>
        )}
        {podeADM && !reqFinalizada && !['Comprado', 'Cancelado'].includes(item.status_item) && perfil !== 'ADM' && (
          <button className="btn btn-soft-yellow" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onEditar}>
            ✎ Editar Item
          </button>
        )}
        {podeGestor && !reqFinalizada && item.status_item === 'Cotação finalizada' && (
          <button className="btn btn-soft-red" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={onDevolver}>
            ↩ Devolver Cotação
          </button>
        )}
      </div>
    </div>
  );
}

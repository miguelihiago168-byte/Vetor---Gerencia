import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { getCockpitReturnContext } from '../components/CockpitReturnButton';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { fmtTs, fmtData } from '../utils/date';
import {
  detalharRequisicao, analisarItemRequisicao, inserirCotacaoItem, editarCotacaoItem,
  selecionarCotacaoItem, marcarItemComprado, cancelarItemRequisicao, devolverCotacaoItem,
  solicitarCorrecaoItem,
  finalizarCotacaoItem, alterarQuantidadeItem, editarRequisicaoHeader, editarItemRequisicao,
  aprovarTodosItens,
} from '../services/api';
import { ArrowLeft, CheckCircle2, Pencil, Plus, RotateCcw, Save, ShoppingCart, X } from 'lucide-react';

const URGENCIA_BADGE  = { Normal: 'badge badge-gray', Urgente: 'badge badge-yellow', Emergencial: 'badge badge-red' };
const STATUS_ITEM_BADGE = {
  'Aguardando análise':   'badge badge-blue',
  'Correção solicitada':  'badge badge-yellow',
  'Reprovado':            'badge badge-red',
  'Em cotação':           'badge badge-green',
  'Cotação finalizada':   'badge badge-blue',
  'Aprovado para compra': 'badge badge-green',
  'Comprado':             'badge badge-green',
  'Cancelado':            'badge badge-gray',
};
const STATUS_REQ_BADGE = {
  'Em análise': 'badge badge-blue', 'Em cotação': 'badge badge-blue',
  'Cotações recebidas': 'badge badge-yellow',
  'Compra autorizada': 'badge badge-green', 'Finalizada': 'badge badge-green',
  'Encerrada sem compra': 'badge badge-red',
};
const URGENCIA_COLOR = { Normal: '#5b6472', Urgente: '#b76b08', Emergencial: '#c83a3a' };

const fmt = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

const SLOT_VAZIO = { fornecedor_nome: '', cnpj: '', telefone: '', email: '', valor_unitario: '', frete: '0', prazo_entrega: '' };

export default function RequisicaoDetalhe() {
  const { projetoId, id } = useParams();
  const location = useLocation();
  const cockpitReturn = getCockpitReturnContext(location);
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
  const [modalCorrecao, setModalCorrecao] = useState(null);   // { itemId }
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
  const [motivoCorrecao, setMotivoCorrecao] = useState('');
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

  const solicitarCorrecao = async () => {
    if (!motivoCorrecao.trim()) { setErro('Informe a correção necessária.'); return; }
    setSalvando(true); setErro('');
    try {
      await solicitarCorrecaoItem(id, modalCorrecao.itemId, { motivo: motivoCorrecao });
      setModalCorrecao(null);
      setMotivoCorrecao('');
      await carregar();
      showToast('Correção solicitada ao solicitante.');
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao solicitar correção.'); }
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
  const podeCotar    = ['ADM', 'Financeiro', 'Gestor Geral', 'Gestor Local'].includes(perfil);
  const podeComprar  = ['ADM', 'Financeiro', 'Gestor Geral'].includes(perfil);
  const isSolicitante = Number(req.solicitante_id) === Number(usuario?.id);
  const voltarLink   = cockpitReturn?.to || (projetoId ? `/projeto/${projetoId}/compras` : '/compras');
  const voltarLabel  = cockpitReturn ? 'Cockpit' : 'Requisições';

  return (
    <ComprasLayout title={req.numero_requisicao}>
      {/* Breadcrumb */}
      <p style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem', color: 'var(--gray-500)' }}>
        <Link to={voltarLink} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{voltarLabel}</Link>
        {' / '}{req.numero_requisicao}
      </p>

      {/* Cabeçalho */}
      <div className="card suprimentos-detail-card suprimentos-detail-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="suprimentos-detail-summary-main">
          <div>
            <p className="suprimentos-eyebrow">Solicitação de compra</p>
            <h2 className="suprimentos-detail-title">{req.tipo_material}</h2>
            <p className="suprimentos-muted-line">
              {req.projeto_nome || `Obra #${req.projeto_id}`}
            </p>
          </div>
          <div className="suprimentos-status-cluster">
            <span className={URGENCIA_BADGE[req.urgencia] || 'badge badge-gray'} style={{ color: URGENCIA_COLOR[req.urgencia] || undefined }}>{req.urgencia}</span>
            <span className={STATUS_REQ_BADGE[req.status_requisicao] || 'badge badge-gray'}>{req.status_requisicao}</span>
            {podeGestor && temAgAnalise && (
              <Button size="sm" tone="success" variant="soft" startIcon={CheckCircle2} onClick={aprovarTodos}>Aprovar Todos</Button>
            )}
            {podeGestor && !['Finalizada', 'Encerrada sem compra'].includes(req.status_requisicao) && (
              <Button size="sm" tone="warning" variant="soft" startIcon={Pencil} onClick={abrirEditarReq}>Editar Requisição</Button>
            )}
          </div>
        </div>
        <div className="suprimentos-meta-grid">
          <div className="suprimentos-meta-item">
            <small>Solicitante</small>
            <strong>{req.solicitante_nome || '—'}</strong>
          </div>
          {req.centro_custo && (
            <div className="suprimentos-meta-item">
              <small>Centro de custo</small>
              <strong>{req.centro_custo}</strong>
            </div>
          )}
          <div className="suprimentos-meta-item">
            <small>Data</small>
            <strong>{fmtData(req.criado_em)}</strong>
          </div>
          <div className="suprimentos-meta-item">
            <small>Itens ativos</small>
            <strong>{itensAtivos.length}</strong>
          </div>
        </div>
        {req.observacao_geral && (
          <p className="suprimentos-note">
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
          podeCotar={podeCotar}
          podeComprar={podeComprar}
          isSolicitante={isSolicitante}
          reqId={id}
          reqStatus={req.status_requisicao}
          onAnalisar={() => { setFormAnalise({ aprovado: null, motivo: '' }); setModalAnalise({ itemId: item.id }); setErro(''); }}
          onSolicitarCorrecao={() => { setMotivoCorrecao(''); setModalCorrecao({ itemId: item.id }); setErro(''); }}
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
            <div key={item.id} className="card suprimentos-detail-card suprimentos-item-card" style={{ marginBottom: '0.75rem', opacity: 0.85 }}>
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
          <div className="card suprimentos-history-card" style={{ marginTop: '0.5rem' }}>
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
                ITEM_CORRIGIDO_SOLICITANTE: 'Item corrigido pelo solicitante',
                CORRECAO_SOLICITADA:     'Correção solicitada',
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
              <Button tone="success" variant="soft" startIcon={CheckCircle2} onClick={() => setFormAnalise({ ...formAnalise, aprovado: true })}
                style={{ flex: 1, padding: '0.9rem', fontWeight: formAnalise.aprovado === true ? 700 : 500, opacity: formAnalise.aprovado === false ? 0.55 : 1 }}>
                Aprovar para Cotação</Button>
              <Button tone="danger" variant="soft" startIcon={X} onClick={() => setFormAnalise({ ...formAnalise, aprovado: false })}
                style={{ flex: 1, padding: '0.9rem', fontWeight: formAnalise.aprovado === false ? 700 : 500, opacity: formAnalise.aprovado === true ? 0.55 : 1 }}>
                Reprovar Item</Button>
            </div>
            {formAnalise.aprovado === false && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Motivo de Reprovação *</label>
                <textarea className="form-input" rows={3} style={{ resize: 'vertical' }} value={formAnalise.motivo} onChange={(e) => setFormAnalise({ ...formAnalise, motivo: e.target.value })} />
              </div>
            )}
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button startIcon={X} onClick={() => setModalAnalise(null)}>Cancelar</Button>
              <Button tone={formAnalise.aprovado === false ? 'danger' : 'success'} variant="solid" startIcon={CheckCircle2} onClick={analisar} loading={salvando}>Confirmar</Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Solicitar Correção ═══ */}
      {modalCorrecao && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => setModalCorrecao(null)}>
          <div className="modal-card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>Solicitar Alteração</h2>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--gray-500)' }}>
              Informe o que o solicitante precisa corrigir. O item voltará para análise após a correção.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Correção necessária *</label>
              <textarea
                className="form-input"
                rows={4}
                style={{ resize: 'vertical' }}
                value={motivoCorrecao}
                onChange={(e) => setMotivoCorrecao(e.target.value)}
                placeholder="Ex: detalhar especificação técnica, ajustar quantidade, informar local de aplicação..."
              />
            </div>
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button startIcon={ArrowLeft} onClick={() => setModalCorrecao(null)}>Voltar</Button>
              <Button tone="warning" variant="soft" startIcon={RotateCcw} onClick={solicitarCorrecao} loading={salvando}>Solicitar Alteração</Button>
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
                <Button startIcon={X} onClick={() => setModalCotacao(null)}>Cancelar</Button>
                <Button type="submit" tone="primary" variant="solid" startIcon={CheckCircle2} loading={salvando}>Finalizar Cotação</Button>
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
              <Button startIcon={ArrowLeft} onClick={() => setModalEditarReq(false)}>Voltar</Button>
              <Button tone="primary" variant="solid" startIcon={Save} onClick={salvarEdicaoReq} loading={salvando}>Confirmar Edição</Button>
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
              <Button startIcon={ArrowLeft} onClick={() => setModalEditarItem(null)}>Voltar</Button>
              <Button tone="primary" variant="solid" startIcon={Save} onClick={salvarEdicaoItem} loading={salvando}>Confirmar Edição</Button>
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
              <Button startIcon={ArrowLeft} onClick={() => setModalAlterar(null)}>Voltar</Button>
              <Button tone="primary" variant="solid" startIcon={Save} onClick={salvarAlteracao} loading={salvando}>Confirmar Alteração</Button>
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
              <Button startIcon={ArrowLeft} onClick={() => setModalCancelar(null)}>Voltar</Button>
              <Button tone="danger" variant="solid" startIcon={X} onClick={cancelarItem} loading={salvando}>Confirmar Cancelamento</Button>
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
              As cotações existentes serão mantidas. O ADM ou Financeiro verá o motivo e poderá corrigir o que for necessário.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Motivo da Devolução *</label>
              <textarea className="form-input" rows={3} style={{ resize: 'vertical' }}
                value={motivoDevolver} onChange={(e) => setMotivoDevolver(e.target.value)}
                placeholder="Ex: Cotação incompleta, verificar fornecedor X..." />
            </div>
            {erro && <p className="alert alert-error" style={{ marginBottom: '1rem' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button startIcon={ArrowLeft} onClick={() => setModalDevolver(null)}>Voltar</Button>
              <Button tone="warning" variant="soft" startIcon={RotateCcw} onClick={devolverCotacao} loading={salvando}>Confirmar Devolução</Button>
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
              <Button startIcon={X} onClick={() => setModalConfirm(null)}>Cancelar</Button>
              <Button tone="primary" variant="solid" startIcon={CheckCircle2} onClick={() => { modalConfirm.onConfirm(); setModalConfirm(null); }}>Confirmar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast discreto */}
      {toast && (
        <div className="suprimentos-toast">
          <span>Info</span> {toast.msg}
        </div>
      )}
    </ComprasLayout>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sub-componente: card de item ativo
──────────────────────────────────────────────────────────────────────────── */
function ItemCard({ item, idx, perfil, podeGestor, podeCotar, podeComprar, isSolicitante, reqId, reqStatus,
  onAnalisar, onSolicitarCorrecao, onCotacoes, onSelecionar, onAutorizar, onCancelar, onDevolver, onAlterar, onEditar }) {

  const temCotacoes  = (item.cotacoes?.length || 0) > 0;
  const cotCompletas = (item.cotacoes?.length || 0) >= 3;
  const reqFinalizada = ['Finalizada', 'Encerrada sem compra'].includes(reqStatus);
  const podeCorrigir = isSolicitante && item.status_item === 'Correção solicitada';

  return (
    <div className="card suprimentos-detail-card suprimentos-item-card" style={{ marginBottom: '1rem' }}>
      {/* Cabeçalho */}
      <div className="suprimentos-item-header">
        <div>
          <p className="suprimentos-eyebrow">Item {idx + 1}</p>
          <h4 className="suprimentos-item-title">{item.descricao}</h4>
          {item.quantidade_original != null && (
            <p className="suprimentos-muted-line" style={{ fontSize: '0.78rem' }}>
              Alterado de {item.quantidade_original} {item.unidade || ''} para {item.quantidade} {item.unidade || ''} em {fmtData(item.alterado_em)} por {item.alterado_por_nome}
            </p>
          )}
        </div>
        <div className="suprimentos-item-flags">
          {!!item.impacto_cronograma && <span className="badge badge-yellow">Cronograma</span>}
          {!!item.impacto_seguranca  && <span className="badge badge-red">Segurança</span>}
          {!!item.impacto_qualidade  && <span className="badge badge-blue">Qualidade</span>}
          <span className={STATUS_ITEM_BADGE[item.status_item] || 'badge badge-gray'}>{item.status_item}</span>
        </div>
      </div>

      <div className="suprimentos-item-meta-grid">
        <div className="suprimentos-meta-item">
          <small>Quantidade</small>
          <strong>{item.quantidade} {item.unidade || ''}</strong>
        </div>
        {item.especificacao_tecnica && (
          <div className="suprimentos-meta-item">
            <small>Especificação</small>
            <span>{item.especificacao_tecnica}</span>
          </div>
        )}
        {item.justificativa && (
          <div className="suprimentos-meta-item">
            <small>Justificativa</small>
            <span>{item.justificativa}</span>
          </div>
        )}
      </div>
      {item.status_item === 'Correção solicitada' && item.motivo_reprovacao && (
        <p className="suprimentos-alert-note">
          <strong>Correção solicitada:</strong> {item.motivo_reprovacao}
        </p>
      )}

      {/* Cotações */}
      {temCotacoes && (
        <div className="suprimentos-quote-section">
          <p className="suprimentos-section-title">
            Cotações ({item.cotacoes.length}/3)
          </p>
          <div className="suprimentos-quote-grid">
            {(() => {
              const totais = item.cotacoes.map(c => (item.quantidade * Number(c.valor_unitario)) + Number(c.frete || 0));
              const menorTotal = Math.min(...totais);
              return item.cotacoes.map((cot, cidx) => {
              const total = totais[cidx];
              const isMenor = !cot.selecionada && total === menorTotal;
              return (
                <div key={cot.id} className={`suprimentos-quote-card${cot.selecionada ? ' is-selected' : ''}${isMenor ? ' is-cheapest' : ''}`}>
                  <div className="suprimentos-quote-title">
                    <span>{cot.fornecedor_nome || '—'}</span>
                    {!!cot.selecionada && <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>Selecionada</span>}
                    {isMenor && <span className="badge badge-yellow" style={{ fontSize: '0.72rem' }}>Menor preço</span>}
                  </div>
                  {cot.cnpj && <div className="suprimentos-muted-line" style={{ fontSize: '0.77rem' }}>{cot.cnpj}</div>}
                  <div className="suprimentos-quote-meta">
                    <span className="suprimentos-money">{fmt(cot.valor_unitario)}</span>/un
                    {cot.frete > 0 && <span> · Frete: {fmt(cot.frete)}</span>}
                    <span style={{ display: 'block', marginTop: 2 }}>
                      Total c/ frete: {fmt(total)}
                    </span>
                    {cot.prazo_entrega && <span> · Entrega: {cot.prazo_entrega}</span>}
                  </div>
                  {perfil === 'Gestor Geral' && item.status_item === 'Cotação finalizada' && !cot.selecionada && (
                    <Button size="sm" fullWidth tone="primary" variant="solid" startIcon={CheckCircle2} style={{ marginTop: '0.5rem' }}
                      onClick={() => onSelecionar(reqId, item.id, cot.id)}>
                      Selecionar
                    </Button>
                  )}
                </div>
              );
            });
            })()}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="suprimentos-action-row" style={{ marginTop: '1rem' }}>
        {podeGestor && !reqFinalizada && item.status_item === 'Aguardando análise' && (
          <Button size="sm" tone="success" variant="soft" startIcon={CheckCircle2} onClick={onAnalisar}>
            Analisar Item
          </Button>
        )}
        {podeGestor && !reqFinalizada && item.status_item === 'Aguardando análise' && (
          <Button size="sm" tone="warning" variant="soft" startIcon={RotateCcw} onClick={onSolicitarCorrecao}>
            Solicitar Alteração
          </Button>
        )}
        {podeCorrigir && !reqFinalizada && (
          <Button size="sm" tone="warning" variant="soft" startIcon={Pencil} onClick={onEditar}>
            Corrigir Item
          </Button>
        )}
        {podeCotar && !reqFinalizada && ['Em cotação', 'Cotação finalizada'].includes(item.status_item) && (
          <Button size="sm" tone="primary" variant="soft" startIcon={cotCompletas ? Pencil : Plus} onClick={onCotacoes}>
            {cotCompletas ? 'Editar Cotações' : `Cotações (${item.cotacoes?.length || 0}/3)`}
          </Button>
        )}
        {podeComprar && !reqFinalizada && item.status_item === 'Aprovado para compra' && (
          <Button size="sm" tone="success" variant="solid" startIcon={ShoppingCart} onClick={onAutorizar}>Confirmar Compra</Button>
        )}
        {podeGestor && !reqFinalizada && !['Comprado', 'Cancelado'].includes(item.status_item) && (
          <Button size="sm" tone="warning" variant="soft" startIcon={Pencil} onClick={onEditar}>Editar Item</Button>
        )}
        {podeGestor && !reqFinalizada && item.status_item === 'Cotação finalizada' && (
          <Button size="sm" tone="warning" variant="soft" startIcon={RotateCcw} onClick={onDevolver}>Devolver Cotação</Button>
        )}
      </div>
    </div>
  );
}

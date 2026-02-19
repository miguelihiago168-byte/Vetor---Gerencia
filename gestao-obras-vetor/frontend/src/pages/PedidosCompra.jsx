import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { listarPedidosPorProjeto, criarPedidoCompra, aprovarInicialPedido, inserirCotacao, selecionarCotacao, marcarComprado, detalharPedido, reprovarPedido } from '../services/api';

const parseMoney = (valor) => Number(String(valor ?? 0).replace(',', '.')) || 0;
const formatBRL = (valor) => Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PedidosCompra() {
  const { projetoId } = useParams();
  const { perfil } = useAuth();
  const { actionNotify, info } = useNotification();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [search, setSearch] = useState('');
  const [comparativos, setComparativos] = useState({});

  const canCreatePurchase = ['Almoxarife', 'Gestor Geral', 'Gestor da Obra'].includes(perfil);
  const canApprovePurchase = ['Gestor Geral', 'Gestor da Obra', 'ADM'].includes(perfil);
  const canFinancePurchase = ['ADM', 'Gestor Geral'].includes(perfil);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await listarPedidosPorProjeto(projetoId);
        setPedidos(res.data);
      } catch (e) {
        setErro('Erro ao carregar pedidos.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projetoId]);

  const refresh = async () => {
    const res = await listarPedidosPorProjeto(projetoId);
    setPedidos(res.data);
  };

  const [showNovaModal, setShowNovaModal] = useState(false);
  const [novaForm, setNovaForm] = useState({ descricao: '', quantidade: '', unidade: '', aplicacao_local: '' });

  const salvarNova = async () => {
    setErro('');
    if (!novaForm.descricao || !novaForm.quantidade) {
      setErro('Preencha descrição e quantidade.');
      return;
    }
    try {
      await criarPedidoCompra({
        projeto_id: projetoId,
        descricao: novaForm.descricao,
        quantidade: Number(novaForm.quantidade),
        unidade: novaForm.unidade || null,
        aplicacao_local: novaForm.aplicacao_local || null,
      });
      setShowNovaModal(false);
      setNovaForm({ descricao: '', quantidade: '', unidade: '', aplicacao_local: '' });
      await refresh();
    } catch (e) {
      setErro('Erro ao criar pedido.');
    }
  };

  const aprovarInicial = async (id) => {
    try {
      await aprovarInicialPedido(id);
      await refresh();
    } catch (e) {
      setErro('Erro na aprovação inicial.');
    }
  };

  const [showCotacaoModal, setShowCotacaoModal] = useState(false);
  const [cotacoesForm, setCotacoesForm] = useState([
    { fornecedor: '', valor_unitario: '', marca: '', modelo: '', prazo_entrega: '', condicoes_pagamento: '', garantia: '', frete: '', observacoes: '' },
    { fornecedor: '', valor_unitario: '', marca: '', modelo: '', prazo_entrega: '', condicoes_pagamento: '', garantia: '', frete: '', observacoes: '' },
    { fornecedor: '', valor_unitario: '', marca: '', modelo: '', prazo_entrega: '', condicoes_pagamento: '', garantia: '', frete: '', observacoes: '' },
  ]);
  const [cotacoesPedidoId, setCotacoesPedidoId] = useState(null);
  const [cotacoesQtdPedido, setCotacoesQtdPedido] = useState(0);
  const [cotacoesPedidoInfo, setCotacoesPedidoInfo] = useState(null);
  // Modal de seleção de cotação (substitui window.prompt)
  const [showSelecionarModal, setShowSelecionarModal] = useState(false);
  const [selecionarPedidoId, setSelecionarPedidoId] = useState(null);
  const [selecionarLista, setSelecionarLista] = useState([]);
  const [selecionarEscolha, setSelecionarEscolha] = useState('');

  const abrirModalCotacoes = async (id) => {
    setCotacoesPedidoId(id);
    setCotacoesForm([
      { fornecedor: '', valor_unitario: '', marca: '', modelo: '', prazo_entrega: '', condicoes_pagamento: '', garantia: '', frete: '', observacoes: '' },
      { fornecedor: '', valor_unitario: '', marca: '', modelo: '', prazo_entrega: '', condicoes_pagamento: '', garantia: '', frete: '', observacoes: '' },
      { fornecedor: '', valor_unitario: '', marca: '', modelo: '', prazo_entrega: '', condicoes_pagamento: '', garantia: '', frete: '', observacoes: '' },
    ]);
    try {
      const detalhe = await detalharPedido(id);
      const pedido = detalhe?.data?.pedido;
      const qtd = Number(pedido?.quantidade) || 0;
      setCotacoesQtdPedido(qtd);
      setCotacoesPedidoInfo({
        descricao: pedido?.descricao || '',
        unidade: pedido?.unidade || '',
        aplicacao_local: pedido?.aplicacao_local || '',
        quantidade: qtd,
        id: pedido?.id || id,
      });
    } catch {
      setCotacoesQtdPedido(0);
      setCotacoesPedidoInfo(null);
    }
    setShowCotacaoModal(true);
  };

  const salvarCotacoes = async () => {
    setErro('');
    try {
      for (let i = 0; i < 3; i++) {
        const c = cotacoesForm[i];
        if (!c.fornecedor || !c.valor_unitario) {
          setErro('Preencha fornecedor e valor em todas as 3 cotações.');
          return;
        }
      }
      for (let i = 0; i < 3; i++) {
        const c = cotacoesForm[i];
        const valorUnit = parseFloat(String(c.valor_unitario).replace(',', '.'));
        if (!isFinite(valorUnit) || valorUnit <= 0) {
          setErro(`Valor unitário inválido na cotação ${i+1}. Use ponto para decimais (ex: 12.50).`);
          return;
        }
        await inserirCotacao(cotacoesPedidoId, {
          fornecedor: c.fornecedor,
          valor_unitario: valorUnit,
          marca: c.marca,
          modelo: c.modelo,
          prazo_entrega: c.prazo_entrega,
          condicoes_pagamento: c.condicoes_pagamento,
          garantia: c.garantia,
          frete: c.frete,
          observacoes: c.observacoes,
        });
      }
      setShowCotacaoModal(false);
      setCotacoesPedidoId(null);
      await refresh();
      // Notificação com ação para abrir comparativo na mesma UX
      const id = cotacoesPedidoId;
      actionNotify(
        `Comparativo pronto para o Pedido #${id}.`,
        'Abrir comparativo',
        async () => {
          // abrir comparativo para o pedido
          try {
            const detalhe = await detalharPedido(id);
            setComparativos(prev => ({ ...prev, [id]: detalhe.data.cotacoes || [] }));
            info('Comparativo exibido.', 3000);
          } catch {
            setErro('Erro ao carregar cotações para comparativo.');
          }
        },
        'info',
        8000
      );
    } catch (e) {
      const apiErro = e?.response?.data?.erro;
      setErro(apiErro || 'Erro ao inserir cotações.');
    }
  };

  const escolher = async (id) => {
    try {
      const detalhe = await detalharPedido(id);
      const cotas = detalhe.data.cotacoes || [];
      if (cotas.length !== 3) { setErro('Pedido não possui 3 cotações.'); return; }
      setSelecionarPedidoId(id);
      setSelecionarLista(cotas);
      setSelecionarEscolha('');
      setShowSelecionarModal(true);
    } catch (e) {
      setErro('Erro ao abrir seleção de cotação.');
    }
  };

  const confirmarSelecionarCotacao = async () => {
    if (!selecionarPedidoId || !selecionarEscolha) { setErro('Selecione uma cotação.'); return; }
    try {
      await selecionarCotacao(selecionarPedidoId, parseInt(selecionarEscolha, 10));
      setShowSelecionarModal(false);
      setSelecionarPedidoId(null);
      setSelecionarLista([]);
      setSelecionarEscolha('');
      await refresh();
      try {
        const det = await detalharPedido(selecionarPedidoId);
        const cot = (det.data.cotacoes || []).find(c => c.id === parseInt(selecionarEscolha, 10));
        const qtd = det.data?.pedido?.quantidade || 0;
        const totalProduto = Number(cot?.valor_unitario || 0) * Number(qtd || 0);
        const freteVal = parseMoney(cot?.frete || 0);
        const totalComFrete = totalProduto + freteVal;
        info(`Cotação #${cot?.id} selecionada. Total: R$ ${formatBRL(totalProduto)}${freteVal ? ` + frete R$ ${formatBRL(freteVal)} = R$ ${formatBRL(totalComFrete)}` : ''}.`, 7000);
      } catch {
        info('Cotação selecionada com sucesso.', 4000);
      }
    } catch (e) {
      setErro('Erro ao confirmar seleção de cotação.');
    }
  };

  const finalizarCompra = async (id) => {
    try {
      await marcarComprado(id);
      await refresh();
    } catch (e) {
      setErro('Erro ao finalizar compra.');
    }
  };
  const [showReprovarModal, setShowReprovarModal] = useState(false);
  const [reprovarForm, setReprovarForm] = useState({ id: null, motivo: '' });

  const abrirReprovar = (id) => {
    setReprovarForm({ id, motivo: '' });
    setShowReprovarModal(true);
  };

  const salvarReprovar = async () => {
    if (!reprovarForm.motivo || reprovarForm.motivo.trim().length === 0) {
      setErro('Informe o motivo da reprovação.');
      return;
    }
    try {
      await reprovarPedido(reprovarForm.id, reprovarForm.motivo.trim());
      setShowReprovarModal(false);
      setReprovarForm({ id: null, motivo: '' });
      await refresh();
    } catch (e) {
      setErro('Erro ao reprovar pedido.');
    }
  };

  const toggleComparativo = async (id) => {
    const current = comparativos[id];
    if (current) {
      const next = { ...comparativos }; delete next[id]; setComparativos(next);
    } else {
      try {
        const detalhe = await detalharPedido(id);
        setComparativos({ ...comparativos, [id]: detalhe.data.cotacoes || [] });
      } catch (e) {
        setErro('Erro ao carregar cotações.');
      }
    }
  };

  const menorValor = (cotas) => {
    if (!cotas || cotas.length === 0) return null;
    return cotas.reduce((min, c) => (min == null || c.valor_unitario < min ? c.valor_unitario : min), null);
  };

  const badgeClass = (status) => {
    switch (status) {
      case 'APROVADO_GESTOR_INICIAL':
      case 'APROVADO_PARA_COMPRA':
      case 'COMPRADO':
        return 'badge badge-green';
      case 'EM_COTACAO':
        return 'badge badge-yellow';
      case 'COTADO':
        return 'badge badge-blue';
      case 'REPROVADO':
        return 'badge badge-red';
      default:
        return 'badge badge-gray';
    }
  };

  const podeReprovar = (status) => {
    // Só permite reprovar antes da aprovação para compra
    return ['SOLICITADO', 'APROVADO_GESTOR_INICIAL', 'EM_COTACAO', 'COTADO'].includes(status);
  };

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="flex-between mb-2">
          <h1>Pedidos de Compra</h1>
          <div className="flex" style={{ gap: '8px', alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ minWidth: '280px' }}
              value={search}
              onChange={(e)=> setSearch(e.target.value)}
              placeholder="Buscar por #id, descrição ou aplicação"
            />
            {canCreatePurchase && (
              <button className="btn btn-primary" onClick={() => setShowNovaModal(true)}>Nova Solicitação</button>
            )}
          </div>
        </div>
        {erro && <div className="alert alert-error">{erro}</div>}
        {loading ? (
          <div className="loading"><div className="spinner"></div></div>
        ) : (
          <div className="grid grid-2">
            {pedidos
              .filter(p => {
                const s = (search || '').trim().toLowerCase();
                if (!s) return true;
                const byId = String(p.id).includes(s.replace('#',''));
                const byDesc = (p.descricao || '').toLowerCase().includes(s);
                const byApl = (p.aplicacao_local || '').toLowerCase().includes(s);
                return byId || byDesc || byApl;
              })
              .map(p => {
              const cotas = comparativos[p.id];
              const min = menorValor(cotas);
              const selectedCotacaoId = Number(p.cotacao_vencedora_id);
              return (
              <div key={p.id} className="card">
                <div className="flex-between mb-1">
                  <h3>#{p.id} - {p.descricao}</h3>
                  <span className={badgeClass(p.status)}>{p.status}</span>
                </div>
                <p>Qtd: {p.quantidade} {p.unidade || ''}</p>
                {p.aplicacao_local && (
                  <p style={{ color: 'var(--gray-600)' }}>Aplicação: {p.aplicacao_local}</p>
                )}
                {p.cotacao_vencedora_id && (
                  <div className="card" style={{ padding: '12px 14px', marginTop: '10px', background: 'var(--gray-50)', border: '1px solid var(--gray-100)' }}>
                    <p className="eyebrow" style={{ marginBottom: '6px' }}>Cotação escolhida</p>
                    <div className="flex-between" style={{ gap: '8px', alignItems: 'center' }}>
                      <p style={{ fontWeight: 700, color: 'var(--gray-700)' }}>#{p.cotacao_vencedora_id}</p>
                      <span className="badge badge-green">Selecionada</span>
                    </div>
                  </div>
                )}
                <div className="flex" style={{ gap: '8px', marginTop: '10px' }}>
                  {canApprovePurchase && p.status === 'SOLICITADO' && (
                    <button className="btn btn-secondary" onClick={() => aprovarInicial(p.id)}>Aprovar Inicial</button>
                  )}
                  {canFinancePurchase && (p.status === 'EM_COTACAO' || p.status === 'APROVADO_GESTOR_INICIAL') && (
                    <button className="btn btn-secondary" onClick={() => abrirModalCotacoes(p.id)}>Inserir 3 Cotações</button>
                  )}
                  {canApprovePurchase && p.status === 'COTADO' && (
                    <button className="btn btn-secondary" onClick={() => escolher(p.id)}>Escolher Cotação</button>
                  )}
                  {canFinancePurchase && p.status === 'APROVADO_PARA_COMPRA' && (
                    <button className="btn btn-success" onClick={() => finalizarCompra(p.id)}>Marcar como Comprado</button>
                  )}
                  {canApprovePurchase && p.status !== 'REPROVADO' && podeReprovar(p.status) && (
                    <button className="btn btn-danger" onClick={() => abrirReprovar(p.id)}>Reprovar</button>
                  )}
                  {(p.status === 'COTADO' || p.status === 'APROVADO_PARA_COMPRA' || p.status === 'COMPRADO') && (
                    <button className="btn btn-outline" onClick={() => toggleComparativo(p.id)}>
                      {cotas ? 'Ocultar Comparativo' : 'Ver Comparativo'}
                    </button>
                  )}
                </div>
                {p.status === 'REPROVADO' && p.reprovado_motivo && (
                  <p style={{ marginTop: '8px', color: 'var(--danger)' }}>Motivo: {p.reprovado_motivo}</p>
                )}
                {cotas && (
                  <div style={{ marginTop: '12px' }}>
                    <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      {cotas.map((c) => {
                        const isMenor = min != null && c.valor_unitario === min;
                        const isSelecionada = selectedCotacaoId > 0 && Number(c.id) === selectedCotacaoId;
                        return (
                        <div
                          key={c.id}
                          className="card"
                          style={{
                            marginBottom: 0,
                            padding: '18px',
                            background: isSelecionada ? 'var(--gray-25)' : (isMenor ? 'var(--gray-50)' : 'white'),
                            border: isSelecionada ? '2px solid var(--success)' : (isMenor ? '1px solid var(--gray-200)' : '1px solid var(--gray-100)')
                          }}
                        >
                          <div className="flex-between" style={{ gap: '8px', marginBottom: '6px' }}>
                            <p className="eyebrow" style={{ marginBottom: 0 }}>Cotação #{c.id}</p>
                            {isSelecionada && <span className="badge badge-green">Selecionada</span>}
                          </div>
                          <h4>{c.fornecedor}</h4>
                          <p>Valor: R$ {formatBRL(c.valor_unitario)}</p>
                          {p?.quantidade != null && (
                            <p>Total: R$ {formatBRL(Number(c.valor_unitario || 0) * Number(p.quantidade || 0))}</p>
                          )}
                          {c.marca && <p>Marca: {c.marca}</p>}
                          {c.modelo && <p>Modelo: {c.modelo}</p>}
                          {c.prazo_entrega && <p>Prazo: {c.prazo_entrega}</p>}
                          {c.condicoes_pagamento && <p>Pag.: {c.condicoes_pagamento}</p>}
                          {c.garantia && <p>Garantia: {c.garantia}</p>}
                          {c.frete && <p>Frete: {c.frete}</p>}
                          {c.observacoes && <p>Obs.: {c.observacoes}</p>}
                          {c.pdf_path && <a className="btn btn-outline" href={c.pdf_path} target="_blank" rel="noreferrer">Ver PDF</a>}
                        </div>
                      );})}
                    </div>
                    {selectedCotacaoId > 0 && (
                      <p style={{ marginTop: '8px', color: 'var(--success)', fontWeight: 600 }}>
                        Cotação selecionada #{selectedCotacaoId} destacada em verde.
                      </p>
                    )}
                    {selectedCotacaoId <= 0 && min != null && <p style={{ marginTop: '8px', color: 'var(--success)' }}>Menor preço destacado em verde.</p>}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
      </div>

      {showCotacaoModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, padding: 16, display: 'flex', flexDirection: 'column' }}>
            <div className="flex-between mb-2">
              <h2>Inserir 3 Cotações</h2>
              <button className="btn btn-secondary" onClick={() => { setShowCotacaoModal(false); setCotacoesPedidoId(null); }}>Fechar</button>
            </div>
            {cotacoesPedidoInfo && (
              <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--gray-50)' }}>
                <p className="eyebrow">Pedido #{cotacoesPedidoInfo.id}</p>
                <p><strong>Item:</strong> {cotacoesPedidoInfo.descricao}</p>
                <p><strong>Quantidade:</strong> {cotacoesPedidoInfo.quantidade} {cotacoesPedidoInfo.unidade || ''}</p>
                {cotacoesPedidoInfo.aplicacao_local && (
                  <p style={{ color: 'var(--gray-700)' }}><strong>Local da aplicação:</strong> {cotacoesPedidoInfo.aplicacao_local}</p>
                )}
              </div>
            )}
            <p className="eyebrow">Preencha fornecedor e valor em cada coluna.</p>
            {erro && <div className="alert alert-error">{erro}</div>}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', minHeight: 0 }}>
                {cotacoesForm.map((c, idx) => (
                  <div className="card" key={idx}>
                    <p className="eyebrow">Cotação {idx+1}</p>
                    {cotacoesQtdPedido > 0 && (
                      <p className="eyebrow">Qtd solicitada: {cotacoesQtdPedido}</p>
                    )}
                    <div className="form-group">
                      <label className="form-label">Fornecedor *</label>
                      <input className="form-input" value={c.fornecedor} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], fornecedor: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Valor Unitário (R$) *</label>
                      <input className="form-input" type="number" step="0.01" value={c.valor_unitario} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], valor_unitario: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Valor Total (R$)</label>
                      <input className="form-input" readOnly value={formatBRL(parseMoney(c.valor_unitario || 0) * Number(cotacoesQtdPedido || 0))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Marca</label>
                      <input className="form-input" value={c.marca} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], marca: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Modelo</label>
                      <input className="form-input" value={c.modelo} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], modelo: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Prazo de Entrega</label>
                      <input className="form-input" value={c.prazo_entrega} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], prazo_entrega: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Condições de Pagamento</label>
                      <input className="form-input" value={c.condicoes_pagamento} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], condicoes_pagamento: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Garantia</label>
                      <input className="form-input" value={c.garantia} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], garantia: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Frete</label>
                      <input className="form-input" value={c.frete} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], frete: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Observações</label>
                      <textarea className="form-input" rows={3} value={c.observacoes} onChange={(e)=>{
                        const next=[...cotacoesForm]; next[idx] = { ...next[idx], observacoes: e.target.value }; setCotacoesForm(next);
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-between mt-2">
              <button className="btn btn-secondary" onClick={() => { setShowCotacaoModal(false); setCotacoesPedidoId(null); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarCotacoes}>Salvar 3 Cotações</button>
            </div>
          </div>
        </div>
      )}

      {showSelecionarModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <div className="flex-between mb-2">
              <h2>Escolher Cotação</h2>
              <button className="btn btn-secondary" onClick={() => { setShowSelecionarModal(false); setSelecionarPedidoId(null); setSelecionarLista([]); setSelecionarEscolha(''); }}>Fechar</button>
            </div>
            {erro && <div className="alert alert-error">{erro}</div>}
            <div className="card" style={{ padding: '16px' }}>
              <div className="form-group">
                <label className="form-label">Selecione uma das cotações</label>
                <select className="form-select" value={selecionarEscolha} onChange={(e)=> setSelecionarEscolha(e.target.value)}>
                  <option value="">Selecione...</option>
                  {selecionarLista.map(c => (
                    <option key={c.id} value={c.id}>#{c.id} - {c.fornecedor} — R$ {formatBRL(c.valor_unitario || 0)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-between mt-2">
              <button className="btn btn-secondary" onClick={() => { setShowSelecionarModal(false); setSelecionarPedidoId(null); setSelecionarLista([]); setSelecionarEscolha(''); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarSelecionarCotacao}>Confirmar Seleção</button>
            </div>
          </div>
        </div>
      )}

      {showNovaModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <div className="flex-between mb-2">
              <h2>Nova Solicitação de Compra</h2>
              <button className="btn btn-secondary" onClick={() => { setShowNovaModal(false); }}>Fechar</button>
            </div>
            {erro && <div className="alert alert-error">{erro}</div>}
            <div className="card" style={{ padding: '16px' }}>
              <div className="form-group">
                <label className="form-label">Descrição do Item *</label>
                <input
                  className="form-input"
                  value={novaForm.descricao}
                  onChange={(e)=> setNovaForm({ ...novaForm, descricao: e.target.value })}
                  placeholder="Ex: Concreto usinado 25MPa"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Local da Aplicação</label>
                <input
                  className="form-input"
                  value={novaForm.aplicacao_local}
                  onChange={(e)=> setNovaForm({ ...novaForm, aplicacao_local: e.target.value })}
                  placeholder="Ex: Bloco A - Fundação, Pavimento térreo, etc."
                />
              </div>
              <div className="flex" style={{ gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Quantidade *</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    value={novaForm.quantidade}
                    onChange={(e)=> setNovaForm({ ...novaForm, quantidade: e.target.value })}
                    placeholder="Ex: 10"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Unidade</label>
                  <select
                    className="form-select"
                    value={novaForm.unidade}
                    onChange={(e)=> setNovaForm({ ...novaForm, unidade: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    <option value="m³">m³</option>
                    <option value="un">un</option>
                    <option value="kg">kg</option>
                    <option value="m²">m²</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex-between mt-2">
              <button className="btn btn-secondary" onClick={() => setShowNovaModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarNova}>Salvar Solicitação</button>
            </div>
          </div>
        </div>
      )}

      {showReprovarModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <div className="flex-between mb-2">
              <h2>Reprovar Pedido</h2>
              <button className="btn btn-secondary" onClick={() => { setShowReprovarModal(false); setReprovarForm({ id: null, motivo: '' }); }}>Fechar</button>
            </div>
            {erro && <div className="alert alert-error">{erro}</div>}
            <div className="card" style={{ padding: '16px' }}>
              <div className="form-group">
                <label className="form-label">Motivo da reprovação *</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={reprovarForm.motivo}
                  onChange={(e)=> setReprovarForm({ ...reprovarForm, motivo: e.target.value })}
                  placeholder="Descreva claramente o motivo"
                  required
                />
              </div>
            </div>
            <div className="flex-between mt-2">
              <button className="btn btn-secondary" onClick={() => { setShowReprovarModal(false); setReprovarForm({ id: null, motivo: '' }); }}>Cancelar</button>
              <button className="btn btn-danger" onClick={salvarReprovar}>Reprovar Pedido</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PedidosCompra;

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Button from '../components/ui/Button';
import { AssetsModal } from '../components/AlmoxarifadoUI';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import api, { getAtividadesEAP, getEstoqueSaldos } from '../services/api';
import { activityLabel, buildHierarchy, dateOnly, formatCurrency, formatDate, normalizeSearch } from '../components/eap/eapUtils';
import { numeroRequisicaoExibicao } from '../utils/numeroRequisicao';
import './MapaSuprimentos.css';
import '../components/Almoxarifado.css';

const empty = (activity) => ({ atividade_id: activity.id, tipo: 'material', insumo_id: '', descricao: '', unidade: '', quantidade: '', custo_unitario: '', data_necessidade: dateOnly(activity.data_inicio_planejada), data_necessidade_manual: false, prazo_dias: '', data_solicitacao: '', data_entrega_prevista: '', equipamento_inicio: '', equipamento_fim: '', equipamento_origem: '', observacoes: '' });
const money = (item) => item.custo_unitario == null || item.custo_unitario === '' || item.quantidade == null || item.quantidade === '' ? null : Number(item.quantidade) * Number(item.custo_unitario);
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const purchaseInfo = (item) => {
  if (!item.compras) return { label: 'Compras indisponível', restante: null };
  const live = item.compras.filter((link) => !['Cancelado', 'Reprovado'].includes(link.status_item));
  const uncertain = live.some((link) => !link.requisicao_item_id || Number(link.quantidade_item) !== Number(link.total_vinculado));
  const requested = live.reduce((sum, link) => sum + Number(link.quantidade), 0);
  const bought = uncertain ? null : live.filter((link) => link.status_item === 'Comprado').reduce((sum, link) => sum + Number(link.quantidade), 0);
  const canMeasureReceived = live.every((link) => Number(link.vinculos_item) === 1 && link.quantidade_recebida != null);
  const received = canMeasureReceived ? live.reduce((sum, link) => sum + Number(link.quantidade_recebida), 0) : null;
  const restante = Math.max(0, Math.round((Number(item.quantidade) - requested) * 10000) / 10000);
  let label = uncertain ? 'Requisição alterada — conferir' : requested === 0 ? 'Não encaminhado' : 'Encaminhado para Compras';
  if (!uncertain && received != null && received > 0) label = received >= Number(item.quantidade) ? 'Atendido' : 'Parcialmente atendido';
  return { label, restante: uncertain ? null : restante, requested, bought, received };
};
const deliveryLate = (item) => item.data_entrega_prevista && purchaseInfo(item).label !== 'Atendido' &&
  ((item.data_necessidade && dateOnly(item.data_entrega_prevista) > dateOnly(item.data_necessidade)) ||
   (purchaseInfo(item).requested > 0 && dateOnly(item.data_entrega_prevista) < today()));

export default function MapaSuprimentos() {
  const { projetoId } = useParams();
  const { isGestor } = useAuth();
  const { confirm } = useDialog();
  const [project, setProject] = useState(null);
  const [activities, setActivities] = useState([]);
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [stock, setStock] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const url = `/mapa-suprimentos/projeto/${projetoId}`;

  async function load() {
    setLoading(true); setError('');
    try {
      const [map, eap, insumos, saldo] = await Promise.all([api.get(url), getAtividadesEAP(projetoId), api.get(`${url}/insumos`), getEstoqueSaldos({ projeto_id: projetoId }).catch(() => null)]);
      setProject(map.data.projeto); setItems(map.data.necessidades.map((item) => ({ ...item, data_necessidade: item.data_necessidade_efetiva }))); setActivities(eap.data || []); setCatalog(insumos.data || []);
      setStock(saldo?.data || null);
    } catch (err) { setError(err.response?.data?.erro || 'Não foi possível carregar o mapa de suprimentos.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [projetoId]);
  const tree = useMemo(() => buildHierarchy(activities), [activities]);
  const grouped = useMemo(() => items.reduce((acc, item) => { (acc[String(item.atividade_id)] ||= []).push(item); return acc; }, {}), [items]);
  const totalsByActivity = useMemo(() => {
    const totals = new Map();
    const visit = (node) => {
      const own = grouped[String(node.id)] || [];
      const summary = own.reduce((sum, item) => ({ count: sum.count + 1, value: sum.value + (money(item) ?? 0), missing: sum.missing + (money(item) == null ? 1 : 0) }), { count: 0, value: 0, missing: 0 });
      node.children.forEach((child) => { const nested = visit(child); summary.count += nested.count; summary.value += nested.value; summary.missing += nested.missing; });
      totals.set(String(node.id), summary); return summary;
    };
    tree.forEach(visit); return totals;
  }, [tree, grouped]);
  const total = items.reduce((sum, item) => sum + (money(item) ?? 0), 0);
  const unpriced = items.filter((item) => money(item) === null).length;
  const selection = Object.entries(selected).filter(([, value]) => value !== '');
  const selectionInvalid = selection.some(([id, value]) => {
    const item = items.find((entry) => String(entry.id) === id);
    const remaining = item ? purchaseInfo(item).restante : null;
    return !item || remaining == null || !/^\d+(?:\.\d{1,4})?$/.test(String(value)) || Number(value) <= 0 || Number(value) > remaining;
  });
  const update = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const toggle = (id) => setExpanded((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });

  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (draft.id) await api.put(`${url}/${draft.id}`, draft);
      else await api.post(url, draft);
      setExpanded((previous) => new Set([...previous, String(draft.atividade_id)]));
      setDraft(null); await load();
    } catch (err) { setError(err.response?.data?.erro || 'Não foi possível salvar a necessidade.'); }
    finally { setSaving(false); }
  }
  async function remove(item) {
    if (!await confirm({ title: 'Remover necessidade?', message: `Remover ${item.descricao} do mapa?`, confirmText: 'Remover' })) return;
    try { await api.delete(`${url}/${item.id}`); await load(); }
    catch (err) { setError(err.response?.data?.erro || 'Não foi possível remover a necessidade.'); }
  }
  async function requisitar() {
    const entries = selection.map(([id, quantidade]) => ({ id: Number(id), quantidade }));
    if (!entries.length || selectionInvalid) return;
    if (!await confirm({ title: 'Encaminhar para Compras?', message: 'Será criada uma requisição para as quantidades selecionadas. Confira o estoque disponível antes de continuar; ele não será reservado automaticamente.', confirmText: 'Criar requisição' })) return;
    setSaving(true); setError('');
    try {
      const response = await api.post(`${url}/requisicoes`, { itens: entries });
      setSelected({}); await load();
      await confirm({ title: 'Requisição criada', message: `A requisição ${response.data.numero} foi encaminhada para o fluxo de Compras.`, confirmText: 'Entendi' });
    } catch (err) { setError(err.response?.data?.erro || 'Não foi possível criar a requisição.'); }
    finally { setSaving(false); }
  }
  async function sugerirData() {
    try {
      const result = await api.get(`${url}/sugestao-data`, { params: { necessidade: dateOnly(draft.data_necessidade), prazo: draft.prazo_dias } });
      update('data_solicitacao', result.data.data_solicitacao);
    } catch (err) { setError(err.response?.data?.erro || 'Informe uma data necessária e o prazo para calcular a sugestão.'); }
  }
  function renderNode(node, depth = 0) {
    const query = normalizeSearch(search);
    const nodeItems = grouped[String(node.id)] || [];
    const itemMatches = (n, item) => (!query || normalizeSearch(`${activityLabel(n)} ${item.descricao}`).includes(query)) && (!statusFilter || purchaseInfo(item).label === statusFilter);
    const matchesTree = (n) => (!statusFilter && (!query || normalizeSearch(activityLabel(n)).includes(query))) || (grouped[String(n.id)] || []).some((item) => itemMatches(n, item)) || n.children.some(matchesTree);
    if (!matchesTree(node)) return null;
    const shown = Boolean(query || statusFilter) || expanded.has(String(node.id));
    const activityTotal = totalsByActivity.get(String(node.id));
    const isGroup = node.children.length > 0;
    const hasDetails = isGroup || nodeItems.length > 0;
    const levelClass = isGroup ? (depth === 0 ? 'mapa-node--section' : 'mapa-node--group') : 'mapa-node--activity';
    return <div key={node.id} className={`mapa-node ${levelClass}`} style={{ '--depth': depth }}>
      <div className="mapa-activity">
        {hasDetails ? <button type="button" className="mapa-toggle" onClick={() => toggle(String(node.id))} aria-expanded={shown} aria-label={`${shown ? 'Recolher' : 'Expandir'} ${activityLabel(node)}`}>{shown ? '−' : '+'}</button> : <span className="mapa-leaf-marker" aria-hidden="true" />}
        <div className="mapa-activity-name"><span className="mapa-activity-kind">{isGroup ? (depth === 0 ? 'Grupo' : 'Etapa') : 'Atividade'}</span>{isGroup ? <strong>{activityLabel(node)}</strong> : <span>{activityLabel(node)}</span>}</div>
        {!isGroup && activityTotal?.count > 0 && <span className="mapa-activity-total">Previsto: {formatCurrency(activityTotal.value)}{activityTotal.missing ? ` · ${activityTotal.missing} sem custo` : ''}</span>}
        {isGestor && !isGroup && <Button size="sm" onClick={() => { setError(''); setDraft(empty(node)); }}>+ Adicionar insumo</Button>}
      </div>
      {shown && <>
        {isGroup && nodeItems.length > 0 && <p className="mapa-legacy-note">Insumos anteriormente registrados neste agrupamento</p>}
        {nodeItems.filter((item) => itemMatches(node, item)).map((item) => <div className="mapa-item" key={item.id}>
          <div><strong>{item.descricao}</strong><span>{item.quantidade} {item.unidade} · {formatCurrency(money(item))} · Necessário em {formatDate(item.data_necessidade)}</span>
            {item.insumo_id && stock && (() => { const saldo = stock.find((s) => String(s.insumo_id) === String(item.insumo_id)); return <span>Estoque na obra: {saldo?.quantidade_fisica ?? 0} físico · {saldo?.quantidade_reservada ?? 0} reservado · {saldo?.quantidade_quarentena ?? 0} em quarentena · {saldo?.quantidade_disponivel ?? 0} disponível (não reservado à atividade)</span>; })()}
            {item.data_entrega_prevista && item.data_necessidade && dateOnly(item.data_entrega_prevista) > dateOnly(item.data_necessidade) && <span className="mapa-warning">Entrega prevista após a necessidade</span>}
            {item.data_entrega_prevista && dateOnly(item.data_entrega_prevista) < today() && purchaseInfo(item).requested > 0 && purchaseInfo(item).label !== 'Atendido' && <span className="mapa-warning">Prazo de entrega ultrapassado; confira o recebimento</span>}
            <span>{purchaseInfo(item).label}{purchaseInfo(item).requested > 0 ? ` · Encaminhado: ${purchaseInfo(item).requested} ${item.unidade}` : ''}{purchaseInfo(item).bought > 0 ? ` · Comprado: ${purchaseInfo(item).bought} ${item.unidade}` : ''}{purchaseInfo(item).received != null && purchaseInfo(item).requested > 0 ? ` · Recebido: ${purchaseInfo(item).received} ${item.unidade}` : ''}</span>
            {item.data_solicitacao && dateOnly(item.data_solicitacao) < today() && purchaseInfo(item).restante > 0 && <span className="mapa-warning">Solicitação prevista em atraso</span>}
            <span>Consumo realizado: {item.quantidade_consumida == null ? 'indisponível' : `${item.quantidade_consumida} ${item.unidade} · Desvio: ${(Number(item.quantidade_consumida) - Number(item.quantidade)).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${item.unidade}`} · Custo realizado: indisponível</span>
            {item.compras?.map((link) => link.requisicao_id && <span key={`${link.requisicao_id}-${link.requisicao_item_id}`}><Link title={link.numero_requisicao} to={`/projeto/${projetoId}/compras/${link.requisicao_id}`}>{numeroRequisicaoExibicao(link.numero_requisicao, link.requisicao_id)}</Link> · {link.status_item}</span>)}
            {item.compras?.filter((link) => Number(link.vinculos_item) === 1 && link.ultima_entrega).map((link) => <span key={`entrega-${link.requisicao_item_id}`}>Última entrega registrada: {formatDate(link.ultima_entrega)}</span>)}
            {isGestor && purchaseInfo(item).restante > 0 && !(item.tipo === 'equipamento' && item.equipamento_origem === 'proprio') && <div className="mapa-request"><label>Quantidade para solicitar (máx. {purchaseInfo(item).restante})<input type="number" min="0.0001" max={purchaseInfo(item).restante} step="0.0001" value={selected[item.id] ?? ''} onChange={(e) => setSelected((old) => ({ ...old, [item.id]: e.target.value }))} placeholder="Informe a quantidade" /></label><Button type="button" size="sm" onClick={() => setSelected((old) => ({ ...old, [item.id]: old[item.id] ? '' : String(purchaseInfo(item).restante) }))}>{selected[item.id] ? 'Limpar seleção' : 'Selecionar quantidade restante'}</Button></div>}
          </div>
          {isGestor && <div className="mapa-actions"><Button size="sm" onClick={() => { setError(''); setDraft({ ...item }); }}>Editar</Button><Button size="sm" onClick={() => remove(item)}>Remover</Button></div>}
        </div>)}
        {node.children.map((child) => renderNode(child, depth + 1))}
      </>}
    </div>;
  }
  return <><Navbar /><main className="container mapa-page">
    <header><p className="mapa-kicker">PLANEJAMENTO · {project?.nome || 'PROJETO'}</p><h1>Mapa de Suprimentos</h1><p>Planeje materiais e equipamentos por atividade da EAP.</p></header>
    {error && <div className="mapa-error" role="alert">{error}</div>}
    {loading ? <p>Carregando mapa...</p> : <>
      <section className="mapa-summary"><div><span>Valor previsto conhecido</span><strong>{formatCurrency(total)}</strong><small>{unpriced ? `${unpriced} sem custo informado` : 'Todos os custos informados'}</small></div><div><span>Necessidades</span><strong>{items.length}</strong><small>{items.filter((item) => purchaseInfo(item).label === 'Atendido').length} atendidas · {items.filter((item) => purchaseInfo(item).label !== 'Atendido').length} pendentes ou sem confirmação</small></div><div><span>Entregas com alerta</span><strong>{items.filter(deliveryLate).length}</strong><small>Previsão após a necessidade ou prazo ultrapassado</small></div><div><span>Desvio financeiro</span><strong>Indisponível</strong><small>Não há custo de consumo rastreável</small></div></section>
      <label className="mapa-search">Buscar por item ou atividade<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou código da atividade" /></label>
      <label className="mapa-search">Situação<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todas as situações</option><option>Não encaminhado</option><option>Encaminhado para Compras</option><option>Parcialmente atendido</option><option>Atendido</option><option>Requisição alterada — conferir</option><option>Compras indisponível</option></select></label>
      {isGestor && <div className="mapa-toolbar"><Button tone="primary" variant="solid" loading={saving} disabled={!selection.length || selectionInvalid} onClick={requisitar}>Encaminhar selecionados para Compras</Button><span role="status" aria-live="polite">{selectionInvalid ? 'Confira as quantidades: devem ser maiores que zero e não exceder o restante.' : selection.length ? `${selection.length} ${selection.length === 1 ? 'item selecionado' : 'itens selecionados'} para Compras.` : 'Nenhum item selecionado. Informe a quantidade ou escolha “Selecionar quantidade restante” no item.'}</span></div>}
      <section className="mapa-tree" aria-label="Atividades da EAP">{!tree.length ? <p>Nenhuma atividade cadastrada na EAP deste projeto.</p> : tree.map((node) => renderNode(node)).filter(Boolean).length ? tree.map((node) => renderNode(node)) : <p>Nenhuma atividade ou necessidade encontrada para os filtros.</p>}</section>
      {items.some((item) => !item.atividade_id) && <p>Existem necessidades históricas cuja atividade foi excluída. Os registros permanecem preservados.</p>}
    </>}
    {draft && <AssetsModal title={draft.id ? 'Editar insumo ou equipamento' : 'Adicionar insumo ou equipamento'} description={activityLabel(activities.find((a) => String(a.id) === String(draft.atividade_id)) || {})} onClose={() => setDraft(null)} closeDisabled={saving} overlayClassName="mapa-modal-overlay">
      <form onSubmit={save} className="mapa-editor mapa-form">
        {error && <div className="mapa-error mapa-wide" role="alert">{error}</div>}
        <div className="mapa-form-heading mapa-wide"><strong>Identificação</strong><span>Escolha um item do estoque ou descreva o que será necessário.</span></div>
        <label>Tipo<select value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value, insumo_id: '' })}><option value="material">Material</option><option value="insumo">Insumo</option><option value="equipamento">Equipamento</option></select></label>
        {draft.tipo !== 'equipamento' && <label>Item do estoque (opcional)<select value={draft.insumo_id || ''} onChange={(e) => { const item = catalog.find((x) => String(x.id) === e.target.value); setDraft({ ...draft, insumo_id: e.target.value, ...(item ? { descricao: item.nome, unidade: item.unidade } : {}) }); }}><option value="">Descrição livre</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.unidade}</option>)}</select></label>}
        <label>Descrição<input required maxLength="500" value={draft.descricao || ''} onChange={(e) => update('descricao', e.target.value)} /></label>
        <label>Unidade<input required maxLength="40" value={draft.unidade || ''} readOnly={!!draft.insumo_id} onChange={(e) => update('unidade', e.target.value)} /></label>
        <div className="mapa-form-heading mapa-wide"><strong>Quantidade e custo</strong><span>O custo pode ser informado depois.</span></div>
        <label>Quantidade prevista<input required type="number" min="0.0001" step="0.0001" value={draft.quantidade ?? ''} onChange={(e) => update('quantidade', e.target.value)} /></label>
        <label>Custo unitário previsto<input type="number" min="0" step="0.0001" value={draft.custo_unitario ?? ''} onChange={(e) => update('custo_unitario', e.target.value)} /></label>
        <div><span>Custo total previsto</span><p>{formatCurrency(money(draft))}</p></div>
        <div className="mapa-form-heading mapa-wide"><strong>Planejamento</strong><span>Informe quando o item será necessário na obra.</span></div>
        <label>Data necessária<input type="date" value={dateOnly(draft.data_necessidade)} onChange={(e) => setDraft({ ...draft, data_necessidade: e.target.value, data_necessidade_manual: true })} /><small className="mapa-help">{draft.data_necessidade_manual ? 'Ajustada manualmente' : 'Acompanha o início da atividade'}</small></label>
        <label>Prazo de fornecimento (dias)<input type="number" min="0" max="99999" step="1" value={draft.prazo_dias ?? ''} onChange={(e) => update('prazo_dias', e.target.value)} /></label>
        <label>Data de solicitação<input type="date" value={dateOnly(draft.data_solicitacao)} onChange={(e) => update('data_solicitacao', e.target.value)} /></label>
        <div><Button type="button" size="sm" onClick={sugerirData}>{draft.data_solicitacao ? 'Substituir pela data sugerida' : 'Sugerir data de solicitação'}</Button><small className="mapa-help">Calculada em dias úteis, conforme o cronograma.</small></div>
        <label>Entrega prevista<input type="date" value={dateOnly(draft.data_entrega_prevista)} onChange={(e) => update('data_entrega_prevista', e.target.value)} /></label>
        {draft.tipo === 'equipamento' && <><label>Origem<select value={draft.equipamento_origem || ''} onChange={(e) => update('equipamento_origem', e.target.value)}><option value="">Não informada</option><option value="proprio">Próprio</option><option value="alugado">Alugado</option><option value="a_contratar">A contratar</option></select></label><label>Início de utilização<input type="date" value={dateOnly(draft.equipamento_inicio)} onChange={(e) => update('equipamento_inicio', e.target.value)} /></label><label>Fim de utilização<input type="date" value={dateOnly(draft.equipamento_fim)} onChange={(e) => update('equipamento_fim', e.target.value)} /></label></>}
        <label className="mapa-wide">Observações<textarea value={draft.observacoes || ''} onChange={(e) => update('observacoes', e.target.value)} /></label>
        <div className="mapa-form-actions mapa-wide"><Button type="button" disabled={saving} onClick={() => setDraft(null)}>Cancelar</Button><Button type="submit" tone="primary" variant="solid" loading={saving}>Salvar necessidade</Button></div>
      </form>
    </AssetsModal>}
  </main></>;
}

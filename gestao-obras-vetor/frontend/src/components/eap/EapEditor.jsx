import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Save, X, Plus, Layers3, Info } from 'lucide-react';
import Button, { IconButton } from '../ui/Button';
import { getHistoricoAtividade } from '../../services/api';
import { activityLabel, formatNumber, formatCurrency, normalizeSearch, sortActivities } from './eapUtils';

export const FIELD_LABELS = {
  codigo_eap: 'Código EAP', nome: 'Nome da atividade', data_inicio_planejada: 'Início planejado',
  data_fim_planejada: 'Fim planejado', unidade_medida: 'Unidade', quantidade_total: 'Quantidade prevista',
  peso_percentual_projeto: 'Peso (%)', descricao: 'Descrição', valor_total_medicao: 'Valor total de medição (R$)'
};

export function EapField({ editor, name, compact = false }) {
  const id = useId();
  const { draft, errors, update, saving, units } = editor;
  if (name === 'valor_total_medicao' && editor.session.isGroup) return <div className="eap-edit-field eap-group-measurement"><span>{compact ? '' : 'Valor previsto'}</span><strong>{formatCurrency(editor.session.original.medicao?.valor_previsto)}</strong><small>Soma das atividades filhas</small></div>;
  const required = ['codigo_eap', 'nome'].includes(name) || (Boolean(draft.pai_id) && ['data_inicio_planejada', 'data_fim_planejada', 'unidade_medida', 'peso_percentual_projeto'].includes(name));
  const props = {
    id, name, value: draft[name], disabled: saving, required,
    onChange: (event) => update(name, event.target.value),
    'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `${id}-error` : undefined,
    className: 'eap-cell-input'
  };
  const type = name.startsWith('data_') ? 'date' : ['quantidade_total', 'peso_percentual_projeto'].includes(name) ? 'number' : 'text';
  return <div className={`eap-edit-field${compact ? ' is-compact' : ''}`}>
    <label className={compact ? 'eap-sr-only' : ''} htmlFor={id}>{FIELD_LABELS[name]}{required && <span aria-hidden="true"> *</span>}</label>
    {compact && required && <span className="eap-required-marker" aria-hidden="true">*</span>}
    {name === 'unidade_medida' ? <select {...props}>
      <option value="">Selecione</option>
      {[...new Set([...(draft.unidade_medida ? [draft.unidade_medida] : []), ...units])].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
    </select> : name === 'descricao' ? <textarea {...props} rows={3} /> : <input {...props} type={type}
      {...(name === 'valor_total_medicao' ? { inputMode: 'decimal', maxLength: 20 } : {})}
      {...(type === 'number' ? { step: name === 'peso_percentual_projeto' ? '0.1' : '0.01' } : {})}
      {...(name === 'peso_percentual_projeto' ? { min: 0, max: 100 } : {})}
      placeholder={name === 'codigo_eap' ? 'Ex.: 1.1' : name === 'nome' ? 'Nome da atividade' : name === 'valor_total_medicao' ? 'Ex.: 10.000,00' : undefined} />}
    {errors[name] && <small id={`${id}-error`} className="eap-field-error">{errors[name]}</small>}
  </div>;
}

function ActivitySelect({ label, name, editor, activities, emptyLabel }) {
  const [search, setSearch] = useState('');
  const id = useId();
  const options = sortActivities(activities.filter((activity) => String(activity.id) !== String(editor.session.original?.id)));
  const filtered = options.filter((activity) => String(activity.id) === editor.draft[name] || normalizeSearch(activityLabel(activity)).includes(normalizeSearch(search)));
  return <div className="eap-edit-field eap-activity-select">
    <label htmlFor={id}>{label}</label>
    <input className="eap-cell-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código ou nome" aria-label={`Buscar ${label.toLowerCase()}`} disabled={editor.saving} />
    <select id={id} className="eap-cell-input" value={editor.draft[name]} disabled={editor.saving} onChange={(event) => editor.update(name, event.target.value)}>
      <option value="">{emptyLabel}</option>
      {filtered.map((activity) => <option key={activity.id} value={activity.id}>{activityLabel(activity)}</option>)}
    </select>
    {search && <small>{filtered.length} opção(ões) disponível(is), incluindo a seleção atual.</small>}
  </div>;
}

export function WeightHint({ editor, activities }) {
  const parentId = editor.draft?.pai_id;
  if (!parentId) return <span>Datas, unidade e peso são opcionais para a atividade raiz.</span>;
  const siblings = activities.filter((activity) => String(activity.pai_id) === parentId && String(activity.id) !== String(editor.session.original?.id));
  const sum = siblings.reduce((total, activity) => total + Number(activity.peso_percentual_projeto ?? activity.percentual_previsto ?? 0), 0) + Number(editor.draft.peso_percentual_projeto || 0);
  return <span>Peso das filhas deste pai, incluindo esta atividade: <strong>{formatNumber(sum)}%</strong>. Os pesos não são redistribuídos automaticamente.</span>;
}

export function EditorActions({ editor, onCancel, allowAnother = true }) {
  return <div className="eap-editor-actions">
    <Button size="sm" startIcon={X} onClick={onCancel} disabled={editor.saving}>Cancelar</Button>
    {allowAnother && !editor.session.original && <Button size="sm" startIcon={Plus} onClick={() => editor.save({ another: true })} disabled={editor.saving}>Salvar e adicionar outra</Button>}
    <Button size="sm" tone="primary" variant="solid" startIcon={Save} loading={editor.saving} disabled={Boolean(editor.session.original) && !editor.dirty} onClick={() => editor.save()}>Salvar</Button>
  </div>;
}

const historyOrigin = (origin) => ({ rdo_criado: 'RDO criado', rdo_editado: 'RDO editado', rdo_aprovado: 'RDO aprovado', rdo_revertido: 'RDO revertido', eap_editada: 'Atividade EAP editada', recalculo_manual: 'Recálculo manual', historico_legado: 'Histórico legado' }[origin] || origin || 'Ajuste');
const historyDate = (value) => {
  if (!value) return '—';
  let text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)) text = `${text.replace(' ', 'T')}Z`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export function EapHistory({ activityId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getHistoricoAtividade(activityId).then((response) => { if (active) setEvents(Array.isArray(response.data) ? response.data : []); })
      .catch(() => { if (active) setError('Não foi possível carregar o histórico.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activityId, retry]);
  if (loading) return <p role="status" className="eap-editor-note">Carregando histórico…</p>;
  if (error) return <div className="eap-editor-error" role="alert">{error} <Button size="sm" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button></div>;
  if (!events.length) return <p className="eap-editor-note">Nenhum evento registrado para esta atividade.</p>;
  return <ol className="eap-event-list">{events.map((event, index) => <li key={`${event.fonte}-${event.id}-${index}`}>
    <div className="eap-event-heading"><strong>{historyOrigin(event.origem)}</strong><time>{historyDate(event.criado_em || event.data_execucao)}</time></div>
    <p>{event.mensagem || 'Alteração registrada na atividade.'}</p>
    <div className="eap-event-meta">
      {(event.rdo_label || event.rdo_id) && <span>{event.rdo_label || `RDO-${String(event.rdo_id).padStart(3, '0')}`}</span>}
      {event.usuario_nome && <span>{event.usuario_nome}</span>}
      {(event.percentual_anterior != null || event.percentual_novo != null) && <span>{formatNumber(event.percentual_anterior)}% → {formatNumber(event.percentual_novo)}%</span>}
      {(event.quantidade_anterior != null || event.quantidade_nova != null) && <span>Qtd. {formatNumber(event.quantidade_anterior)} → {formatNumber(event.quantidade_nova)}</span>}
    </div>
  </li>)}</ol>;
}

export function EapEditorContent({ editor, activities, tab, setTab }) {
  const id = useId();
  const tabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'data' : event.key === 'End' ? 'history' : tab === 'data' ? 'history' : 'data';
    setTab(next);
    document.getElementById(`${id}-${next}-tab`)?.focus();
  };
  return <>
    {editor.session.original && <div className="eap-editor-tabs" role="tablist" aria-label="Informações da atividade" onKeyDown={tabKeyDown}>
      <button type="button" id={`${id}-data-tab`} role="tab" tabIndex={tab === 'data' ? 0 : -1} aria-selected={tab === 'data'} aria-controls={`${id}-data`} onClick={() => setTab('data')}><Layers3 size={16} /> Dados</button>
      <button type="button" id={`${id}-history-tab`} role="tab" tabIndex={tab === 'history' ? 0 : -1} aria-selected={tab === 'history'} aria-controls={`${id}-history`} onClick={() => setTab('history')}><History size={16} /> Histórico</button>
    </div>}
    {tab === 'history' && editor.session.original ? <div id={`${id}-history`} role="tabpanel" aria-labelledby={`${id}-history-tab`} tabIndex={0}><EapHistory activityId={editor.session.original.id} /></div> : <div id={`${id}-data`} role={editor.session.original ? 'tabpanel' : undefined} aria-labelledby={editor.session.original ? `${id}-data-tab` : undefined}>
      {editor.error && <div className="eap-editor-error" role="alert">{editor.error}</div>}
      <p className="eap-editor-note">{editor.draft.pai_id ? 'Atividade filha' : 'Atividade raiz'} · Campos com * são obrigatórios.</p>
      <section className="eap-editor-section"><h3>Identificação e estrutura</h3>
        <div className="eap-editor-grid"><EapField editor={editor} name="codigo_eap" /><EapField editor={editor} name="nome" /></div>
        <ActivitySelect label="Atividade pai" name="pai_id" editor={editor} activities={activities} emptyLabel="Nenhuma (atividade raiz)" />
        <EapField editor={editor} name="descricao" />
      </section>
      <section className="eap-editor-section"><h3>Planejamento e medição</h3>
        <div className="eap-editor-grid">{['data_inicio_planejada', 'data_fim_planejada', 'unidade_medida', 'quantidade_total', 'peso_percentual_projeto', 'valor_total_medicao'].map((name) => <EapField key={name} editor={editor} name={name} />)}</div>
        <p className="eap-editor-note">O valor é opcional. A medição considera a execução dos RDOs aprovados, inclusive anteriores ao cadastro do preço.</p>
        {editor.session.original?.medicao && <div className="eap-measurement-detail" aria-label="Medição salva da atividade">
          <div><span>Valor medido</span><strong>{formatCurrency(editor.session.original.medicao.valor_medido)}</strong></div>
          <div><span>Saldo a medir</span><strong>{formatCurrency(editor.session.original.medicao.saldo)}</strong></div>
          <small>{editor.session.original.medicao.atividades_sem_valor > 0 ? `${editor.session.original.medicao.atividades_sem_valor} atividade(s) sem preço. Totais parciais.` : 'Valores da última gravação. Alterações serão consideradas após salvar.'}</small>
        </div>}
        {editor.unitsError && <div role="alert" className="eap-editor-error">{editor.unitsError} <Button size="sm" onClick={editor.loadUnits}>Recarregar unidades</Button></div>}
        <div className="eap-weight-hint"><Info size={16} /><WeightHint editor={editor} activities={activities} /></div>
      </section>
      <section className="eap-editor-section"><h3>Sequência no cronograma</h3>
        <ActivitySelect label="Predecessora" name="predecessora_id" editor={editor} activities={activities} emptyLabel="Nenhuma predecessora" />
        <label className="eap-edit-field">Tipo de vínculo<select className="eap-cell-input" value={editor.draft.tipo_vinculo_dependencia} disabled={editor.saving || !editor.draft.predecessora_id} onChange={(event) => editor.update('tipo_vinculo_dependencia', event.target.value)}>
          <option value="FS">Fim para Início (FS)</option><option value="SS">Início para Início (SS)</option><option value="FF">Fim para Fim (FF)</option>
        </select></label>
      </section>
      <p className="eap-editor-note">O progresso é atualizado pelos RDOs aprovados. Peso e quantidade prevista são dados do planejamento.</p>
    </div>}
  </>;
}

export function EapDrawer({ editor, activities, tab, setTab, onClose, onCancel }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    ref.current?.querySelector('button')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      document.documentElement.style.overflow = rootOverflow;
      if (previous?.isConnected) previous.focus();
      else document.querySelector('.eap-edit-row input')?.focus();
    };
  }, []);
  const keyDown = (event) => {
    if (document.querySelector('.modal-overlay')) return;
    if (event.key === 'Escape') { event.stopPropagation(); if (!editor.saving) onCancel(); }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); editor.save(); }
    if (event.key !== 'Tab') return;
    const elements = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((element) => element.tabIndex >= 0);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="eap-drawer-backdrop">
    <section className="eap-drawer" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keyDown}>
      <header><div><span className="eap-eyebrow">Estrutura analítica do projeto</span><h2 id={titleId}>{editor.session.original ? 'Detalhes da atividade' : 'Nova atividade'}</h2><p>{editor.draft.codigo_eap} {editor.draft.nome}</p></div><IconButton icon={X} label="Voltar à tabela" onClick={onClose} disabled={editor.saving} /></header>
      <div className="eap-drawer-body"><EapEditorContent editor={editor} activities={activities} tab={tab} setTab={setTab} /></div>
      <footer><small>O painel e a linha compartilham as alterações.</small><EditorActions editor={editor} onCancel={onCancel} /></footer>
    </section>
  </div>, document.body);
}

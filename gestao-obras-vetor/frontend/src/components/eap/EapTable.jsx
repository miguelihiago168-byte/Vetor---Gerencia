import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, History, Pencil, Plus, Search, SlidersHorizontal, Trash2, X, Layers, Circle, Timer, CheckCircle2, ListTree, ShieldCheck } from 'lucide-react';
import Button, { IconButton } from '../ui/Button';
import { activityCounts, activityLabel, activityWeight, buildHierarchy, formatDate, formatNumber, STATUS_LABELS, visibleActivities } from './eapUtils';
import { EapDrawer, EapField, EditorActions, WeightHint } from './EapEditor';
import './EapWorkspace.css';

export default function EapTable({ activities, editor, onDelete, readOnly = false }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState('data');
  const ref = useRef(null);
  const tree = useMemo(() => buildHierarchy(activities), [activities]);
  const counts = useMemo(() => activityCounts(activities), [activities]);
  const rows = useMemo(() => visibleActivities(tree, expanded, search, status), [tree, expanded, search, status]);
  const filtering = Boolean(search.trim() || status);
  const locked = editor.dirty || editor.saving;
  const actionsDisabled = editor.saving || readOnly;
  const editingId = editor.session?.original?.id;

  useEffect(() => {
    if (!editor.session) { setDrawer(false); return; }
    if (window.matchMedia('(max-width: 900px)').matches) setDrawer(true);
    if (!editor.session.original && editor.draft.pai_id) {
      setExpanded((previous) => {
        const next = new Set(previous);
        let parent = activities.find((a) => String(a.id) === editor.draft.pai_id);
        const seen = new Set();
        while (parent && !seen.has(String(parent.id))) {
          seen.add(String(parent.id)); next.add(String(parent.id));
          parent = activities.find((a) => String(a.id) === String(parent.pai_id));
        }
        return next;
      });
    }
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector('.eap-drawer')) ref.current?.querySelector('.eap-edit-row input')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor.session?.initial]);

  useEffect(() => {
    if (!Object.values(editor.errors).some(Boolean)) return;
    setTab('data');
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector('.eap-drawer [aria-invalid="true"]') || ref.current?.querySelector('[aria-invalid="true"]');
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor.validationAttempt]);

  const start = async (activity, parentId = '', showDrawer = false, nextTab = 'data') => {
    if (activity && String(activity.id) === String(editingId)) { setTab(nextTab); setDrawer(showDrawer); return; }
    if (!await editor.cancel()) return;
    editor.begin(activity, parentId);
    setTab(nextTab); setDrawer(showDrawer || window.matchMedia('(max-width: 900px)').matches);
  };
  const toggle = (id) => setExpanded((previous) => {
    const next = new Set(previous);
    next.has(String(id)) ? next.delete(String(id)) : next.add(String(id));
    return next;
  });
  const onKeyDown = (event) => {
    if (!editor.session || document.querySelector('.modal-overlay')) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); editor.save(); }
    if (event.key === 'Escape') { event.preventDefault(); editor.cancel(); }
  };

  const renderEdit = (row = null) => {
    const draftParent = activities.find((a) => String(a.id) === editor.draft.pai_id);
    return <React.Fragment key={`edit-${row?.id || 'new'}`}>
      <tr className="eap-edit-row" data-activity-id={row?.id || 'new'}>
        {['codigo_eap', 'nome', 'data_inicio_planejada', 'data_fim_planejada', 'unidade_medida', 'quantidade_total', 'peso_percentual_projeto'].map((name, index) => <td key={name} className={index < 2 ? `eap-sticky-${index}` : ''}><EapField editor={editor} name={name} compact /></td>)}
        <td>{row ? <Progress row={row} /> : <span className="eap-muted">—</span>}</td>
        <td>{row ? <span className={`eap-table-status is-${row.tone}`}>{STATUS_LABELS[row.tone]}</span> : <span className="eap-table-status is-draft">Nova atividade</span>}</td>
        <td><Button size="sm" startIcon={SlidersHorizontal} onClick={() => { setTab('data'); setDrawer(true); }} disabled={editor.saving}>Detalhes</Button></td>
      </tr>
      <tr className="eap-edit-support"><td colSpan={10}>
        <div className="eap-edit-support-inner">
          <div><strong>{row ? 'Editando atividade' : 'Cadastrando atividade'}{draftParent ? ` · Filha de ${activityLabel(draftParent)}` : ' · Raiz do projeto'}</strong>
            <p><WeightHint editor={editor} activities={activities} /></p><small>* Campos obrigatórios · Tab para navegar · Ctrl+Enter para salvar · Esc para cancelar</small>
            {editor.error && <p className="eap-field-error" role="alert">{editor.error}</p>}
            {editor.unitsError && <p role="alert" className="eap-field-error">{editor.unitsError} <button type="button" onClick={editor.loadUnits}>Recarregar unidades</button></p>}
          </div>
          <EditorActions editor={editor} onCancel={editor.cancel} />
        </div>
      </td></tr>
    </React.Fragment>;
  };

  const renderRow = (row) => {
    if (editor.session && String(row.id) === String(editingId)) return renderEdit(row);
    const hasChildren = row.children.length > 0;
    const isExpanded = filtering || expanded.has(String(row.id));
    return <tr key={row.id} className={`${hasChildren ? 'eap-group-row' : 'eap-leaf-row'}${row.contextOnly ? ' is-context' : ''}`} data-activity-id={row.id}>
      <td className="eap-sticky-0"><span className="eap-code">{row.codigo_eap}</span></td>
      <td className="eap-sticky-1"><div className="eap-tree-name" style={{ '--depth': row.level }}>
        {hasChildren ? <button type="button" className="eap-tree-toggle" aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${row.codigo_eap}`} aria-expanded={isExpanded} disabled={locked || filtering} onClick={() => toggle(row.id)}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button> : <span className="eap-tree-dot" />}
        <button className="eap-name-button" type="button" onClick={() => start(row, '', true)} disabled={actionsDisabled} title={row.nome || row.descricao}><strong>{row.nome || row.descricao}</strong>{hasChildren && <small><Layers size={11} aria-hidden="true" />{row.children.length} subatividade{row.children.length !== 1 ? 's' : ''}</small>}</button>
      </div></td>
      <td>{formatDate(row.data_inicio_planejada)}</td><td>{formatDate(row.data_fim_planejada)}</td>
      <td>{hasChildren ? '—' : row.unidade_medida || '—'}</td><td className="eap-number">{hasChildren ? '—' : formatNumber(row.quantidade_total)}</td>
      <td className="eap-number"><span className="eap-weight-value">{formatNumber(activityWeight(row))}%</span></td><td><Progress row={row} /></td>
      <td><span className={`eap-table-status is-${row.tone}`}>{STATUS_LABELS[row.tone]}</span></td>
      <td><div className="eap-row-actions">
        <IconButton size="sm" variant="ghost" icon={Pencil} label={`Editar ${row.codigo_eap}`} onClick={() => start(row)} disabled={actionsDisabled} />
        <IconButton size="sm" variant="ghost" tone="primary" icon={Plus} label={`Adicionar subatividade em ${row.codigo_eap}`} onClick={() => start(null, String(row.id))} disabled={actionsDisabled} />
        <IconButton size="sm" variant="ghost" icon={History} label={`Histórico de ${row.codigo_eap}`} onClick={() => start(row, '', true, 'history')} disabled={actionsDisabled} />
        <IconButton size="sm" variant="ghost" tone="danger" icon={Trash2} label={`Excluir ${row.codigo_eap}`} onClick={async () => { if (await editor.cancel()) onDelete(row); }} disabled={actionsDisabled} />
      </div></td>
    </tr>;
  };

  let insertIndex = rows.length;
  if (editor.session && !editor.session.original && editor.draft.pai_id) {
    const parentIndex = rows.findIndex((row) => String(row.id) === editor.draft.pai_id);
    insertIndex = parentIndex < 0 ? 0 : parentIndex + 1;
    if (parentIndex >= 0) while (insertIndex < rows.length && rows[insertIndex].level > rows[parentIndex].level) insertIndex += 1;
  }
  const renderedRows = rows.map(renderRow);
  if (editor.session && !editor.session.original) renderedRows.splice(insertIndex, 0, renderEdit());

  return <div className="eap-workspace" ref={ref} onKeyDown={onKeyDown}>
    <div className="eap-overview" aria-label="Resumo das atividades executáveis">
      {[['total', 'Atividades', Layers, 'Atividades sem filhos'], ['idle', 'Não iniciadas', Circle, 'Aguardando execução'], ['active', 'Em andamento', Timer, 'Execução iniciada'], ['done', 'Concluídas', CheckCircle2, 'Execução em 100%']].map(([key, label, Icon, detail]) => <div key={key} className={`eap-overview-item is-${key}`}>
        <div className="eap-overview-heading"><span>{label}</span><span className="eap-overview-icon"><Icon size={19} aria-hidden="true" /></span></div>
        <strong>{counts[key]}</strong><small>{detail}</small>
      </div>)}
    </div>
    <section className="eap-structure" aria-labelledby="eap-structure-title">
    <div className="eap-structure-header">
      <div className="eap-structure-title"><span className="eap-structure-icon"><ListTree size={20} aria-hidden="true" /></span><div><h2 id="eap-structure-title">Estrutura de atividades</h2><p>Etapas, entregas e avanço da obra</p></div></div>
      <div className="eap-expand-tools"><Button size="sm" variant="ghost" startIcon={ChevronsUpDown} disabled={locked || filtering} onClick={() => setExpanded(new Set(activities.map((a) => String(a.id))))}>Expandir tudo</Button><Button size="sm" variant="ghost" startIcon={ChevronsDownUp} disabled={locked || filtering} onClick={() => setExpanded(new Set())}>Recolher tudo</Button></div>
    </div>
    <div className="eap-table-tools">
      <label className="eap-search"><Search size={17} /><span className="eap-sr-only">Buscar atividade</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar código ou atividade" disabled={locked} /></label>
      <label className="eap-status-filter"><SlidersHorizontal size={16} aria-hidden="true" /><span className="eap-sr-only">Situação</span><select value={status} onChange={(event) => setStatus(event.target.value)} disabled={locked}><option value="">Todas as situações</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <span className="eap-results-count" aria-live="polite"><strong>{rows.length}</strong> {rows.length === 1 ? 'linha visível' : 'linhas visíveis'}</span>
    </div>
    {locked && <div className="eap-edit-notice"><Pencil size={14} aria-hidden="true" /> Edição em andamento. Salve ou cancele para filtrar ou recolher.</div>}
    <div className="eap-table-scroll" tabIndex={0} role="region" aria-label="Tabela da EAP">
      <table className="eap-data-table"><caption className="eap-sr-only">Atividades, planejamento e progresso da EAP</caption>
        <colgroup>{[84, 290, 120, 120, 72, 108, 78, 128, 146, 144].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <thead><tr>{['Código', 'Atividade', 'Início planejado', 'Fim planejado', 'Unidade', 'Qtd. prevista', 'Peso (%)', 'Executado', 'Situação', 'Ações'].map((label, index) => <th scope="col" key={label} className={index < 2 ? `eap-sticky-${index}` : [5, 6].includes(index) ? 'eap-number' : ''}>{label}</th>)}</tr></thead>
        <tbody>{renderedRows}{!renderedRows.length && <tr><td colSpan={10}><div className="eap-empty"><Search size={28} /><strong>{activities.length ? 'Nenhuma atividade corresponde aos filtros' : 'Comece a estrutura do projeto'}</strong><p>{activities.length ? 'Altere a busca ou a situação para encontrar outras atividades.' : 'Adicione uma atividade raiz e depois detalhe suas subatividades.'}</p>{filtering && <Button size="sm" startIcon={X} onClick={() => { setSearch(''); setStatus(''); }}>Limpar filtros</Button>}</div></td></tr>}</tbody>
      </table>
    </div>
    <div className="eap-table-caption"><span><ShieldCheck size={14} aria-hidden="true" /> Progresso atualizado pelos RDOs aprovados</span><span>{filtering ? 'Ancestrais preservados nos resultados' : 'Contadores sobre as atividades sem filhos da EAP completa'}</span></div>
    </section>
    {drawer && editor.session && <EapDrawer editor={editor} activities={activities} tab={tab} setTab={setTab} onClose={() => setDrawer(false)} onCancel={editor.cancel} />}
  </div>;
}

function Progress({ row }) {
  return <div className="eap-table-progress"><strong>{formatNumber(row.progress)}%</strong><div role="progressbar" aria-label={`Progresso de ${row.codigo_eap}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, row.progress))} className={`is-${row.tone}`}><span style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }} /></div></div>;
}

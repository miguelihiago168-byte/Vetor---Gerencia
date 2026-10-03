import React from 'react';
import { AlertCircle, ArrowUpRight, Building2, CalendarDays, CheckCircle2, Clock3, Gauge, MapPin, RefreshCw } from 'lucide-react';
import Button from '../ui/Button';
import { formatDate } from './cockpitTransforms';

export function CockpitSkeleton() {
  return <div className="cockpit-skeleton" aria-label="Carregando Cockpit"><span /><span /><span /><span /></div>;
}

export function CockpitError({ message, onRetry }) {
  return <div className="cockpit-error"><AlertCircle size={20} /><span>{message}</span>{onRetry && <Button size="sm" tone="primary" startIcon={RefreshCw} onClick={onRetry}>Tentar novamente</Button>}</div>;
}

export function EmptyState({ children = 'Sem dados para exibir.' }) {
  return <div className="cockpit-empty">{children}</div>;
}

export function CockpitCard({ title, icon: Icon, action, children, className = '' }) {
  return <section className={`cockpit-card ${className}`}>
    <header className="cockpit-card-header">
      <span className="cockpit-card-icon">{Icon && <Icon size={18} />}</span>
      <h2>{title}</h2>
      {action && <div className="cockpit-card-action">{action}</div>}
    </header>
    <div className="cockpit-card-body">{children}</div>
  </section>;
}

const projectScheduleProgress = (project) => {
  const atMidday = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
  const start = atMidday(project?.planned_start);
  const end = atMidday(project?.prazo_termino);
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return Math.max(0, Math.min(100, ((Date.now() - start.getTime()) / (end.getTime() - start.getTime())) * 100));
};

export function CockpitHeader({ project, updatedAt, refreshing, onRefresh, deadline, indicators, onOpenProgress }) {
  const scheduleProgress = projectScheduleProgress(project);
  const archived = Number(project?.arquivado) === 1;
  const progress = indicators ? Number(indicators.avanco_real || 0) : null;

  return <section className="cockpit-header">
    <div className="cockpit-header-main">
      <div className="cockpit-project-content">
        <div className="cockpit-header-topline">
          <span className="cockpit-eyebrow"><Gauge size={14} /> Cockpit da obra</span>
          {archived && <span className="cockpit-archived-note">Projeto arquivado</span>}
        </div>
        <h1>{project?.nome || 'Projeto'}</h1>
        <div className="cockpit-meta">
          {project?.empresa_responsavel && <span><Building2 size={14} /> {project.empresa_responsavel}</span>}
          {project?.empresa_executante && <span><Building2 size={14} /> {project.empresa_executante}</span>}
          {project?.cidade && <span><MapPin size={14} /> {project.cidade}</span>}
        </div>
      </div>
      <div className="cockpit-schedule">
        <div className="cockpit-schedule-dates"><span><CalendarDays size={14} /> Início · {formatDate(project?.planned_start, 'Não informado')}</span><span>Entrega · {formatDate(project?.prazo_termino, 'Não informado')}</span></div>
        {scheduleProgress !== null && <div className="cockpit-schedule-track" aria-label={`${Math.round(scheduleProgress)}% do prazo contratual transcorrido`}><span style={{ width: `${scheduleProgress}%` }} /></div>}
        <small className="cockpit-schedule-caption">{scheduleProgress === null ? 'Período contratual não definido' : `${Math.round(scheduleProgress)}% do prazo contratual transcorrido`}</small>
      </div>
    </div>
    {onOpenProgress && <button type="button" className="cockpit-hero-progress" onClick={onOpenProgress}>
      <span className="cockpit-progress-ring" style={{ '--progress': `${Math.max(0, Math.min(100, progress ?? 0))}%` }}><span><strong>{progress === null ? '—' : progress.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}<small>{progress === null ? '' : '%'}</small></strong><small>executado</small></span></span>
      <span className="cockpit-progress-copy"><strong>Avanço físico <ArrowUpRight size={14} /></strong><small>{indicators ? `${Number(indicators.avanco_planejado || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% planejado` : 'Aguardando dados da Curva S'}</small></span>
    </button>}
    <div className="cockpit-header-side">
      <div className={`cockpit-deadline ${deadline?.completed ? 'is-complete' : deadline?.overdue ? 'is-critical' : ''}`}><small>Prazo contratual</small>{deadline?.completed ? <div><CheckCircle2 size={24} /><strong>Concluído</strong></div> : deadline?.days != null ? <div><strong>{Math.abs(deadline.days)}</strong><span>{deadline.overdue ? 'dias vencido' : 'dias restantes'}</span></div> : <div><span>Não informado</span></div>}</div>
      <small className="cockpit-updated"><Clock3 size={13} /> Atualizado em {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</small>
      <Button className="cockpit-refresh" variant="inverse" startIcon={RefreshCw} loading={refreshing} fullWidth onClick={onRefresh}>Atualizar</Button>
    </div>
  </section>;
}

export function CockpitTabs({ value, onChange, tabs }) {
  const handleKeyDown = (event, index) => {
    const offsets = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const next = (index + offsets[event.key] + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return <div className="cockpit-tabs" role="tablist" aria-label="Seções do Cockpit">
    {tabs.map((tab, index) => {
      const Icon = tab.icon;
      return <button key={tab.id} id={`cockpit-tab-${tab.id}`} type="button" role="tab" aria-controls="cockpit-panel" tabIndex={value === tab.id ? 0 : -1} aria-selected={value === tab.id} className={value === tab.id ? 'active' : ''} onKeyDown={(event) => handleKeyDown(event, index)} onClick={() => onChange(tab.id)}>{Icon && <Icon size={17} />}{tab.label}</button>;
    })}
  </div>;
}

export function DomainStatusStrip({ items }) {
  return <section className="cockpit-domain-strip" aria-label="Situação por domínio">
    {items.map((item) => <div key={item.name} className={`cockpit-domain domain-${item.state}`}><span>{item.name}</span><strong><i />{item.label}</strong></div>)}
  </section>;
}

export function KpiGrid({ items }) {
  return <section className="cockpit-kpi-grid">
    {items.filter((item) => item.visible !== false).map((item) => {
      const state = item.state || 'neutral';
      const Icon = item.icon;
      const stateLabels = { ok: 'Dentro do esperado', attention: 'Requer atenção', critical: 'Crítico', neutral: 'Acompanhar' };

      return <button type="button" key={item.label} className={`cockpit-kpi kpi-${state} ${item.onClick ? 'is-interactive' : ''}`} onClick={item.onClick} disabled={!item.onClick} title={item.tooltip || ''}>
        <div className="cockpit-kpi-heading">{Icon && <Icon size={18} />}<span>{item.label}</span></div>
        {item.onClick && <ArrowUpRight className="cockpit-kpi-arrow" size={15} />}
        <div className="cockpit-kpi-body"><strong>{item.value ?? '—'}{item.unit && <small>{item.unit}</small>}</strong><em>{item.reference || 'Sem referência'}</em></div>
        <small className="cockpit-kpi-state"><i />{stateLabels[state]}</small>
      </button>;
    })}
  </section>;
}

export function MetricGrid({ items }) {
  return <div className="cockpit-metric-grid">{items.map((item) => <div key={item.label} className={`cockpit-metric metric-${item.state || 'neutral'}`}><strong>{item.value ?? '—'}</strong><span>{item.label}</span></div>)}</div>;
}

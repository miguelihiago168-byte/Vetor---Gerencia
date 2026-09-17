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

export function CockpitHeader({ project, updatedAt, refreshing, onRefresh, deadline }) {
  const scheduleProgress = projectScheduleProgress(project);
  const archived = Number(project?.arquivado) === 1;

  return <section className="cockpit-header">
    <div className="cockpit-header-main">
      <div className="cockpit-project-content">
        <div className="cockpit-header-topline">
          <span className="cockpit-eyebrow"><Gauge size={14} /> Cockpit da Obra</span>
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
        <div className="cockpit-schedule-dates"><span><CalendarDays size={14} /> {formatDate(project?.planned_start, 'Não informado')}</span><span>{formatDate(project?.prazo_termino, 'Não informado')}</span></div>
        {scheduleProgress !== null && <div className="cockpit-schedule-track" aria-label={`${Math.round(scheduleProgress)}% do prazo contratual transcorrido`}><span style={{ width: `${scheduleProgress}%` }} /></div>}
      </div>
    </div>
    <div className="cockpit-header-side">
      {deadline?.days !== null && <div className={`cockpit-deadline ${deadline.completed ? 'is-complete' : deadline.overdue ? 'is-critical' : ''}`}><small>Prazo contratual</small>{deadline.completed ? <div><CheckCircle2 size={24} /><strong>Concluído</strong></div> : <div><strong>{Math.abs(deadline.days)}</strong><span>{deadline.overdue ? 'dias vencido' : 'dias restantes'}</span></div>}</div>}
      <small className="cockpit-updated"><Clock3 size={13} /> Atualizado em {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</small>
      <Button className="cockpit-refresh" variant="inverse" startIcon={RefreshCw} loading={refreshing} fullWidth onClick={onRefresh}>Atualizar</Button>
    </div>
  </section>;
}

export function CockpitTabs({ value, onChange, tabs }) {
  return <div className="cockpit-tabs" role="tablist" aria-label="Seções do Cockpit">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      return <button key={tab.id} type="button" role="tab" aria-selected={value === tab.id} className={value === tab.id ? 'active' : ''} onClick={() => onChange(tab.id)}>{Icon && <Icon size={15} />}{tab.label}</button>;
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
    {items.filter((item) => item.visible !== false).map((item, index) => {
      const state = item.state || 'neutral';
      const stateLabels = { ok: 'Dentro do esperado', attention: 'Requer atenção', critical: 'Crítico', neutral: 'Acompanhar' };
      const progress = item.unit === '%' && Number.isFinite(Number(item.value))
        ? Math.max(0, Math.min(100, Number(item.value)))
        : null;

      return <button type="button" key={item.label} className={`cockpit-kpi kpi-${state} ${index === 0 ? 'cockpit-kpi-primary' : ''} ${item.onClick ? 'is-interactive' : ''}`} onClick={item.onClick} disabled={!item.onClick} title={item.tooltip || ''}>
        <div className="cockpit-kpi-heading"><span>{item.label}</span><small className="cockpit-kpi-state"><i />{stateLabels[state]}</small></div>
        {item.onClick && <ArrowUpRight className="cockpit-kpi-arrow" size={15} />}
        <div className="cockpit-kpi-body"><strong>{item.value ?? '—'}{item.unit && <small>{item.unit}</small>}</strong><em>{item.reference || 'Sem referência'}</em></div>
        {progress !== null && <div className="cockpit-kpi-progress"><div><span style={{ width: `${progress}%` }} /></div><small>{progress.toFixed(1).replace('.', ',')}% executado</small></div>}
      </button>;
    })}
  </section>;
}

export function MetricGrid({ items }) {
  return <div className="cockpit-metric-grid">{items.map((item) => <div key={item.label} className={`cockpit-metric metric-${item.state || 'neutral'}`}><strong>{item.value ?? '—'}</strong><span>{item.label}</span></div>)}</div>;
}

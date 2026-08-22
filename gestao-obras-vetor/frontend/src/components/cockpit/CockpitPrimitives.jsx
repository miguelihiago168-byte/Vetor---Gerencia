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

export function CockpitHeader({ project, updatedAt, refreshing, onRefresh, deadline }) {
  return <section className="cockpit-header">
    <span className="cockpit-header-glow" aria-hidden="true" />
    <div className="cockpit-header-main">
      <div className="cockpit-header-topline">
        <span className="cockpit-eyebrow"><Gauge size={14} /> Cockpit da Obra</span>
        <span className="cockpit-live-status"><i /> Visão consolidada</span>
      </div>
      <h1>{project?.nome || 'Projeto'}</h1>
      <div className="cockpit-meta">
        {project?.empresa_responsavel && <span><Building2 size={14} /> Contratante: {project.empresa_responsavel}</span>}
        {project?.empresa_executante && <span><Building2 size={14} /> Executante: {project.empresa_executante}</span>}
        {project?.cidade && <span><MapPin size={14} /> {project.cidade}</span>}
        <span><CalendarDays size={14} /> Início planejado: {formatDate(project?.planned_start, 'Não informado')}</span>
        <span>Término contratual: {formatDate(project?.prazo_termino, 'Não informado')}</span>
      </div>
      {Number(project?.arquivado) === 1 && <span className="cockpit-archived">Projeto arquivado</span>}
    </div>
    <div className="cockpit-header-side">
      {deadline?.days !== null && <div className={`cockpit-deadline ${deadline.completed ? 'is-complete' : deadline.overdue ? 'is-critical' : ''}`}><small>Prazo contratual</small>{deadline.completed ? <div><CheckCircle2 size={24} /><strong>Concluído</strong></div> : <div><strong>{Math.abs(deadline.days)}</strong><span>{deadline.overdue ? 'dias vencido' : 'dias restantes'}</span></div>}</div>}
      <small className="cockpit-updated"><Clock3 size={13} /> Atualizado em {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</small>
      <Button className="cockpit-refresh" variant="inverse" startIcon={RefreshCw} loading={refreshing} fullWidth onClick={onRefresh}>Atualizar dados</Button>
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
    {items.filter((item) => item.visible !== false).map((item) => <button type="button" key={item.label} className={`cockpit-kpi kpi-${item.state || 'neutral'} ${item.onClick ? 'is-interactive' : ''}`} onClick={item.onClick} disabled={!item.onClick} title={item.tooltip || ''}>
      <span>{item.label}</span>{item.onClick && <ArrowUpRight className="cockpit-kpi-arrow" size={15} />}<strong>{item.value ?? '—'}{item.unit && <small>{item.unit}</small>}</strong><em>{item.reference || 'Sem referência'}</em>
    </button>)}
  </section>;
}

export function MetricGrid({ items }) {
  return <div className="cockpit-metric-grid">{items.map((item) => <div key={item.label} className={`cockpit-metric metric-${item.state || 'neutral'}`}><strong>{item.value ?? '—'}</strong><span>{item.label}</span></div>)}</div>;
}

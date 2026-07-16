import React from 'react';
import { AlertCircle, Building2, CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import { formatDate } from './cockpitTransforms';

export function CockpitSkeleton() {
  return <div className="cockpit-skeleton" aria-label="Carregando Cockpit"><span /><span /><span /><span /></div>;
}

export function CockpitError({ message, onRetry }) {
  return <div className="cockpit-error"><AlertCircle size={20} /><span>{message}</span>{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</div>;
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
    <div className="cockpit-header-main">
      <span className="cockpit-eyebrow">Cockpit da Obra</span>
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
      {deadline?.days !== null && <div className={`cockpit-deadline ${deadline.overdue ? 'is-critical' : ''}`}><strong>{Math.abs(deadline.days)}</strong><span>{deadline.overdue ? 'dias vencido' : 'dias restantes'}</span></div>}
      <small>Atualizado em {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR') : '—'}</small>
      <button type="button" className="cockpit-refresh" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Atualizar dados</button>
    </div>
  </section>;
}

export function CockpitTabs({ value, onChange, tabs }) {
  return <div className="cockpit-tabs" role="tablist" aria-label="Seções do Cockpit">
    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={value === tab.id} className={value === tab.id ? 'active' : ''} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
  </div>;
}

export function DomainStatusStrip({ items }) {
  return <section className="cockpit-domain-strip" aria-label="Situação por domínio">
    {items.map((item) => <div key={item.name} className={`cockpit-domain domain-${item.state}`}><span>{item.name}</span><strong><i />{item.label}</strong></div>)}
  </section>;
}

export function KpiGrid({ items }) {
  return <section className="cockpit-kpi-grid">
    {items.filter((item) => item.visible !== false).map((item) => <button type="button" key={item.label} className={`cockpit-kpi kpi-${item.state || 'neutral'}`} onClick={item.onClick} disabled={!item.onClick} title={item.tooltip || ''}>
      <span>{item.label}</span><strong>{item.value ?? '—'}{item.unit && <small>{item.unit}</small>}</strong><em>{item.reference || 'Sem referência'}</em>
    </button>)}
  </section>;
}

export function MetricGrid({ items }) {
  return <div className="cockpit-metric-grid">{items.map((item) => <div key={item.label} className={`cockpit-metric metric-${item.state || 'neutral'}`}><strong>{item.value ?? '—'}</strong><span>{item.label}</span></div>)}</div>;
}

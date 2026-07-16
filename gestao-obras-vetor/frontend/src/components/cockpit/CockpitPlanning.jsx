import React from 'react';
import { Activity, ArrowUpRight, CalendarClock, GitBranch, TrendingUp } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Button from '../ui/Button';
import { CockpitCard, EmptyState, MetricGrid } from './CockpitPrimitives';
import { formatDate } from './cockpitTransforms';

const ActivityList = ({ items, empty, onOpen }) => items.length ? <div className="cockpit-list">
  {items.map((item) => <button type="button" key={item.id} className="cockpit-list-row" onClick={() => onOpen?.(item)}>
    <div><strong>{item.codigo_eap || '—'} · {item.nome}</strong><span>{formatDate(item.data_inicio)} → {formatDate(item.data_fim)}</span></div>
    <div className="cockpit-row-end"><strong>{Math.round(Number(item.percentual_executado || 0))}%</strong><span>{item.status || 'Sem status'}</span></div>
  </button>)}
</div> : <EmptyState>{empty}</EmptyState>;

export function CurvaSCard({ data, onOpen }) {
  const indicators = data?.indicadores;
  const series = data?.serie || [];
  return <CockpitCard title="Curva S" icon={TrendingUp} className="cockpit-card-wide" action={<Button size="sm" tone="primary" variant="ghost" endIcon={ArrowUpRight} onClick={onOpen}>Abrir Curva S</Button>}>
    {!data ? <EmptyState>Curva S indisponível ou sem EAP configurada.</EmptyState> : <>
      <MetricGrid items={[
        { label: 'Planejado', value: `${Number(indicators?.avanco_planejado || 0).toFixed(2)}%`, state: 'info' },
        { label: 'Realizado', value: `${Number(indicators?.avanco_real || 0).toFixed(2)}%`, state: 'ok' },
        { label: 'Desvio', value: `${Number(indicators?.desvio || 0).toFixed(2)} p.p.`, state: Number(indicators?.desvio || 0) < 0 ? 'attention' : 'ok' },
        { label: 'SPI', value: Number(indicators?.spi || 0).toFixed(3), state: indicators?.spi_status === 'vermelho' ? 'attention' : indicators?.spi_status === 'verde' ? 'ok' : 'neutral' }
      ]} />
      {series.length ? <div className="cockpit-chart"><ResponsiveContainer width="100%" height={260}><LineChart data={series} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--cockpit-border)" /><XAxis dataKey="data" minTickGap={30} tickFormatter={(value) => formatDate(value)} /><YAxis domain={[0, 100]} /><Tooltip labelFormatter={formatDate} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name === 'planejado' ? 'Planejado' : 'Realizado']} /><Legend /><Line type="monotone" dataKey="planejado" stroke="var(--cockpit-primary)" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="real" stroke="var(--cockpit-success)" dot={false} strokeWidth={2} />
      </LineChart></ResponsiveContainer></div> : <EmptyState>Sem série de progresso para o período.</EmptyState>}
    </>}
  </CockpitCard>;
}

export function ActivityStatusCard({ view }) {
  return <CockpitCard title="Status das atividades" icon={Activity}>{!view ? <EmptyState>Dados do Gantt indisponíveis.</EmptyState> : <><MetricGrid items={[
    { label: 'Concluídas', value: view?.counts?.completed || 0, state: 'ok' },
    { label: 'Em andamento', value: view?.counts?.inProgress || 0, state: 'info' },
    { label: 'Não iniciadas', value: view?.counts?.notStarted || 0 },
    { label: 'Críticas', value: view?.counts?.critical || 0, state: 'attention' }
  ]} /><p className="cockpit-caption">{view.total || 0} atividades consideradas pelo Gantt oficial.</p></>}</CockpitCard>;
}

export function CriticalActivitiesCard({ view, onOpen, onOpenAll }) {
  return <CockpitCard title="Atividades críticas" icon={GitBranch} action={<Button size="sm" tone="primary" variant="ghost" endIcon={ArrowUpRight} onClick={onOpenAll}>Ver todas no Gantt</Button>}>
    {!view ? <EmptyState>Dados do Gantt indisponíveis.</EmptyState> : <ActivityList items={view.critical || []} empty="Nenhuma atividade no caminho crítico." onOpen={onOpen} />}
  </CockpitCard>;
}

export function UpcomingActivitiesCard({ view, onOpen }) {
  return <CockpitCard title="Próximas atividades" icon={CalendarClock} className="cockpit-card-wide">
    {!view ? <EmptyState>Dados do Gantt indisponíveis.</EmptyState> : <div className="cockpit-split">
      <div><h3>Em continuidade</h3><ActivityList items={view?.continuity || []} empty="Nenhuma atividade em continuidade." onOpen={onOpen} /></div>
      <div><h3>Previstas para iniciar</h3><ActivityList items={view?.starting || []} empty="Nenhum início previsto nos próximos 14 dias." onOpen={onOpen} /></div>
    </div>}
  </CockpitCard>;
}

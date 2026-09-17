import React from 'react';
import { Activity, AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, CircleDashed, GitBranch, PlayCircle, TrendingUp } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Button from '../ui/Button';
import { CockpitCard, EmptyState } from './CockpitPrimitives';
import { formatDate } from './cockpitTransforms';

const ActivityList = ({ items, empty, onOpen, tone = 'default' }) => items.length ? <div className={`cockpit-list cockpit-activity-list is-${tone}`}>
  {items.map((item) => {
    const progress = Math.max(0, Math.min(100, Number(item.percentual_executado || 0)));
    return <button type="button" key={item.id} className="cockpit-list-row cockpit-activity-row" onClick={() => onOpen?.(item)}>
      <span className="cockpit-activity-marker" aria-hidden="true" />
      <div className="cockpit-activity-content">
        <div className="cockpit-activity-title"><small>{item.codigo_eap || 'Sem código'}</small><strong>{item.nome}</strong></div>
        <span>{formatDate(item.data_inicio)} <i>→</i> {formatDate(item.data_fim)}</span>
      </div>
      <div className="cockpit-activity-progress">
        <div><span style={{ width: `${progress}%` }} /></div>
        <strong>{Math.round(progress)}%</strong>
        <small>{item.status || 'Sem status'}</small>
      </div>
    </button>;
  })}
</div> : <EmptyState>{empty}</EmptyState>;

export function CurvaSCard({ data, onOpen }) {
  const indicators = data?.indicadores;
  const series = data?.serie || [];
  const planned = Number(indicators?.avanco_planejado || 0);
  const actual = Number(indicators?.avanco_real || 0);
  const deviation = Number(indicators?.desvio || 0);
  const spi = Number(indicators?.spi || 0);
  const needsAttention = deviation < 0 || spi < 1;

  return <CockpitCard title="Curva S" icon={TrendingUp} className="cockpit-card-wide" action={<Button size="sm" tone="primary" variant="ghost" endIcon={ArrowUpRight} onClick={onOpen}>Abrir Curva S</Button>}>
    {!data ? <EmptyState>Curva S indisponível ou sem EAP configurada.</EmptyState> : <div className="cockpit-curve">
      <aside className="cockpit-curve-summary">
        <span className="cockpit-curve-kicker">Progresso acumulado</span>
        <div className="cockpit-curve-values">
          <div className="is-actual"><small>Realizado</small><strong>{actual.toFixed(2).replace('.', ',')}%</strong></div>
          <div><small>Planejado</small><strong>{planned.toFixed(2).replace('.', ',')}%</strong></div>
        </div>
        <div className={`cockpit-curve-diagnostic ${needsAttention ? 'is-attention' : 'is-positive'}`}>
          <div><span>Desvio</span><strong>{deviation > 0 ? '+' : ''}{deviation.toFixed(2).replace('.', ',')} p.p.</strong></div>
          <div><span>SPI</span><strong>{spi.toFixed(3).replace('.', ',')}</strong></div>
        </div>
        <p>{needsAttention ? 'O avanço realizado está abaixo da referência planejada e requer acompanhamento.' : 'A execução acompanha ou supera a referência planejada.'}</p>
      </aside>
      <div className="cockpit-curve-chart-panel">
        <header><div><strong>Evolução do avanço</strong><small>{data?.data_atual ? `Referência: ${formatDate(data.data_atual)}` : 'Planejado versus realizado'}</small></div><div className="cockpit-curve-legend"><span className="planned"><i />Planejado</span><span className="actual"><i />Realizado</span></div></header>
        {series.length ? <div className="cockpit-chart"><ResponsiveContainer width="100%" height={270}><ComposedChart data={series} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}>
          <defs><linearGradient id="cockpitRealArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cockpit-success)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--cockpit-success)" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid vertical={false} strokeDasharray="4 5" stroke="var(--cockpit-border)" /><XAxis dataKey="data" axisLine={false} tickLine={false} minTickGap={30} tick={{ fill: 'var(--cockpit-muted)', fontSize: 10 }} tickFormatter={(value) => formatDate(value)} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: 'var(--cockpit-muted)', fontSize: 10 }} tickFormatter={(value) => `${value}%`} /><Tooltip labelFormatter={formatDate} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name === 'planejado' ? 'Planejado' : 'Realizado']} contentStyle={{ borderColor: 'var(--cockpit-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(18,45,78,.12)' }} /><Area type="monotone" dataKey="real" fill="url(#cockpitRealArea)" stroke="none" tooltipType="none" /><Line type="monotone" dataKey="planejado" stroke="var(--cockpit-primary)" strokeDasharray="6 5" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="real" stroke="var(--cockpit-success)" dot={false} activeDot={{ r: 4 }} strokeWidth={3} />
        </ComposedChart></ResponsiveContainer></div> : <EmptyState>Sem série de progresso para o período.</EmptyState>}
      </div>
    </div>}
  </CockpitCard>;
}

export function ActivityStatusCard({ view }) {
  const total = Number(view?.total || 0);
  const completed = Number(view?.counts?.completed || 0);
  const inProgress = Number(view?.counts?.inProgress || 0);
  const notStarted = Number(view?.counts?.notStarted || 0);
  const percent = (value) => total ? (value / total) * 100 : 0;

  return <CockpitCard title="Panorama do cronograma" icon={Activity} className="cockpit-planning-overview">{!view ? <EmptyState>Dados do Gantt indisponíveis.</EmptyState> : <div className="cockpit-planning-status">
    <div className="cockpit-planning-total">
      <span>Atividades do cronograma</span>
      <strong>{total}</strong>
      <small>itens executáveis no Gantt oficial</small>
    </div>
    <div className="cockpit-planning-distribution">
      <div className="cockpit-planning-segments" aria-label="Distribuição das atividades">
        <span className="is-complete" style={{ width: `${percent(completed)}%` }} />
        <span className="is-progress" style={{ width: `${percent(inProgress)}%` }} />
        <span className="is-pending" style={{ width: `${percent(notStarted)}%` }} />
      </div>
      <div className="cockpit-planning-counts">
        <div className="is-complete"><CheckCircle2 /><span><strong>{completed}</strong><small>Concluídas</small></span></div>
        <div className="is-progress"><PlayCircle /><span><strong>{inProgress}</strong><small>Em andamento</small></span></div>
        <div className="is-pending"><CircleDashed /><span><strong>{notStarted}</strong><small>Não iniciadas</small></span></div>
      </div>
    </div>
    <div className={`cockpit-planning-critical ${view.counts.critical ? 'has-critical' : ''}`}>
      <AlertTriangle />
      <span><strong>{view.counts.critical || 0}</strong><small>no caminho crítico</small></span>
    </div>
  </div>}</CockpitCard>;
}

export function CriticalActivitiesCard({ view, onOpen, onOpenAll }) {
  return <CockpitCard title="Atividades críticas" icon={GitBranch} action={<Button size="sm" tone="primary" variant="ghost" endIcon={ArrowUpRight} onClick={onOpenAll}>Ver todas no Gantt</Button>}>
    {!view ? <EmptyState>Dados do Gantt indisponíveis.</EmptyState> : <ActivityList tone="critical" items={view.critical || []} empty="Nenhuma atividade no caminho crítico." onOpen={onOpen} />}
  </CockpitCard>;
}

export function UpcomingActivitiesCard({ view, onOpen }) {
  return <CockpitCard title="Agenda das próximas atividades" icon={CalendarClock}>
    {!view ? <EmptyState>Dados do Gantt indisponíveis.</EmptyState> : <div className="cockpit-split">
      <div><h3><span>Em continuidade</span><small>{view?.continuity?.length || 0}</small></h3><ActivityList tone="progress" items={view?.continuity || []} empty="Nenhuma atividade em continuidade." onOpen={onOpen} /></div>
      <div><h3><span>Previstas para iniciar</span><small>{view?.starting?.length || 0}</small></h3><ActivityList tone="upcoming" items={view?.starting || []} empty="Nenhum início previsto nos próximos 14 dias." onOpen={onOpen} /></div>
    </div>}
  </CockpitCard>;
}

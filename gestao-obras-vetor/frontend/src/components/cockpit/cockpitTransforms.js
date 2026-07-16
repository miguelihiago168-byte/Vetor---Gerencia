const COCKPIT_TIME_ZONE = 'America/Sao_Paulo';

export const formatDate = (value, fallback = '—') => {
  if (!value) return fallback;
  const raw = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00-03:00` : raw.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString('pt-BR', { timeZone: COCKPIT_TIME_ZONE });
};

export const toDateKey = (value) => {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = value instanceof Date ? value : new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COCKPIT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const daysBetween = (from, to) => {
  const a = toDateKey(from);
  const b = toDateKey(to);
  if (!a || !b) return null;
  return Math.ceil((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
};

export const projectDeadline = (project, today = new Date()) => {
  const todayKey = toDateKey(today);
  const days = daysBetween(todayKey, project?.prazo_termino);
  return { days, overdue: days !== null && days < 0 };
};

export const buildActivityView = (payload, today = new Date()) => {
  if (payload == null) return null;
  const activities = payload?.atividades || [];
  const todayKey = toDateKey(today);
  const end = new Date(`${todayKey}T12:00:00`);
  end.setDate(end.getDate() + 14);
  const endKey = toDateKey(end);
  const counts = { completed: 0, inProgress: 0, notStarted: 0, critical: 0 };
  activities.forEach((item) => {
    const pct = Number(item.percentual_executado || 0);
    if (pct >= 100 || item.status === 'Concluída') counts.completed += 1;
    else if (pct > 0 || item.status === 'Em andamento') counts.inProgress += 1;
    else counts.notStarted += 1;
    if (item.no_caminho_critico) counts.critical += 1;
  });
  const critical = activities
    .filter((item) => item.no_caminho_critico)
    .sort((a, b) => String(a.data_fim || '').localeCompare(String(b.data_fim || '')))
    .slice(0, 5);
  const continuity = activities
    .filter((item) => Number(item.percentual_executado || 0) > 0 && Number(item.percentual_executado || 0) < 100)
    .sort((a, b) => String(a.data_fim || '').localeCompare(String(b.data_fim || '')))
    .slice(0, 6);
  const starting = activities
    .filter((item) => Number(item.percentual_executado || 0) === 0 && item.data_inicio >= todayKey && item.data_inicio <= endKey)
    .sort((a, b) => String(a.data_inicio || '').localeCompare(String(b.data_inicio || '')))
    .slice(0, 6);
  return { counts, critical, continuity, starting, total: activities.length, window: { from: todayKey, to: endKey } };
};

const cardsFromKanban = (kanban) => (kanban || []).flatMap((column) => column.requisicoes || column.itens || []);

export const buildProcurementView = (kanban) => {
  if (!Array.isArray(kanban)) return null;
  const byId = Object.fromEntries(kanban.map((column) => [column.id, Number(column.count ?? (column.requisicoes || column.itens || []).length)]));
  const pendingColumns = kanban.filter((column) => column.id !== 'comprado');
  const pendingCards = cardsFromKanban(pendingColumns);
  return {
    analysis: byId.solicitado || 0,
    quotation: byId.em_cotacao || 0,
    authorized: (byId.cot_recebidas || 0) + (byId.cot_recebida || 0) + (byId.liberado || 0) + (byId.ag_aprovacao || 0) + (byId.ag_decisao || 0),
    bought: byId.comprado || 0,
    urgent: pendingCards.filter((item) => ['Urgente', 'Emergencial'].includes(item.urgencia)),
    total: Object.values(byId).reduce((sum, value) => sum + value, 0)
  };
};

export const buildAttentionPoints = ({ cockpit, activities, procurement, assets, curve }) => {
  const points = [];
  (activities?.critical || []).slice(0, 3).forEach((item) => points.push({
    source: 'Planejamento', priority: 'critical', title: item.nome, detail: 'Atividade no caminho crítico', date: item.data_fim, href: 'gantt'
  }));
  (cockpit?.quality?.attention || []).forEach((item) => points.push({
    source: 'Qualidade', priority: item.gravidade === 'Crítica' ? 'critical' : 'attention', title: item.titulo || `RNC #${item.id}`, detail: `${item.gravidade} · ${item.status}`, date: item.criado_em, href: `rnc/${item.id}`
  }));
  (procurement?.urgent || []).slice(0, 3).forEach((item) => points.push({
    source: 'Suprimentos', priority: item.urgencia === 'Emergencial' ? 'critical' : 'attention', title: item.numero_requisicao || 'Requisição urgente', detail: item.urgencia, date: item.criado_em, href: `compras/${item.id}`
  }));
  if (Number(assets?.ferramentas_manutencao || 0) > 0) points.push({ source: 'Ativos', priority: 'attention', title: `${assets.ferramentas_manutencao} em manutenção`, detail: 'Verificar disponibilidade', href: 'almoxarifado/manutencao' });
  if (Number(assets?.total_perdas || 0) > 0) points.push({ source: 'Ativos', priority: 'critical', title: `${assets.total_perdas} perda(s) registrada(s)`, detail: 'Ocorrência oficial do Almoxarifado', href: 'almoxarifado/perdas' });
  if (cockpit?.execution?.totals?.awaiting_analysis > 0) points.push({ source: 'RDO', priority: 'attention', title: `${cockpit.execution.totals.awaiting_analysis} RDO(s) aguardando análise`, href: 'rdos' });
  if (cockpit?.execution?.days_since_latest >= 3) points.push({ source: 'Execução', priority: 'critical', title: `${cockpit.execution.days_since_latest} dias sem novo RDO`, detail: 'Regra existente do Dashboard', date: cockpit.execution.latest_rdo_date, href: 'rdos' });
  if (curve?.indicadores?.spi_status === 'vermelho') points.push({ source: 'Planejamento', priority: 'attention', title: `SPI ${Number(curve.indicadores.spi).toFixed(3)}`, detail: 'Ritmo abaixo do planejado', href: 'curva-s' });
  return points.slice(0, 8);
};

export const buildDomainStatus = ({ cockpit, procurement, assets, curve }) => {
  const noData = { state: 'nodata', label: 'Sem dados' };
  const planning = !curve ? noData : curve.indicadores?.spi_status === 'verde'
    ? { state: 'normal', label: 'Normal' }
    : curve.indicadores?.spi_status === 'vermelho' ? { state: 'attention', label: 'Atenção' } : { state: 'attention', label: 'Atenção' };
  const quality = !cockpit?.permissions?.quality ? null : !cockpit.quality ? noData
    : cockpit.quality.critical_open > 0 ? { state: 'critical', label: 'Crítico' }
      : cockpit.quality.open > 0 ? { state: 'attention', label: 'Atenção' } : { state: 'normal', label: 'Normal' };
  const supplies = !cockpit?.permissions?.procurement ? null : !procurement ? noData
    : procurement.urgent.some((item) => item.urgencia === 'Emergencial') ? { state: 'critical', label: 'Crítico' }
      : procurement.analysis + procurement.quotation + procurement.authorized > 0 ? { state: 'attention', label: 'Atenção' } : { state: 'normal', label: 'Normal' };
  const assetStatus = !cockpit?.permissions?.assets ? null : !assets ? noData
    : Number(assets.total_perdas || 0) > 0 ? { state: 'critical', label: 'Crítico' }
      : Number(assets.ferramentas_manutencao || 0) + Number(assets.ferramentas_atrasadas || 0) > 0 ? { state: 'attention', label: 'Atenção' } : { state: 'normal', label: 'Normal' };
  const rdo = !cockpit?.permissions?.rdo ? null : !cockpit.execution ? noData
    : cockpit.execution.recent.length === 0 ? noData
      : cockpit.execution.recent.some((item) => item.status === 'Reprovado') ? { state: 'critical', label: 'Crítico' }
      : cockpit.execution.totals.awaiting_analysis > 0 ? { state: 'attention', label: 'Atenção' } : { state: 'normal', label: 'Normal' };
  const execution = !cockpit?.permissions?.rdo ? null : !cockpit.execution?.latest_rdo_date ? noData
    : Number(cockpit.execution.days_since_latest) >= 3 ? { state: 'critical', label: 'Crítico' } : { state: 'normal', label: 'Normal' };
  return [{ name: 'Planejamento', ...planning }, execution && { name: 'Execução', ...execution }, quality && { name: 'Qualidade', ...quality }, supplies && { name: 'Suprimentos', ...supplies }, assetStatus && { name: 'Ativos', ...assetStatus }, rdo && { name: 'RDO', ...rdo }].filter(Boolean);
};

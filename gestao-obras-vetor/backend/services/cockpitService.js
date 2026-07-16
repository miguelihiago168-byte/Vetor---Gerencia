const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

const number = (value) => Number(value || 0);

const dateKey = (value, timeZone = DEFAULT_TIME_ZONE) => {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = value instanceof Date ? value : new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const shiftDateKey = (key, days) => {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const inWindow = (value, from, to, timeZone) => {
  const key = dateKey(value, timeZone);
  return Boolean(key && key >= from && key <= to);
};

const effective = (rdo) => number(rdo.mao_obra_direta) + number(rdo.mao_obra_indireta) + number(rdo.mao_obra_terceiros);

const summarizeExecution = (rdos = [], now = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const today = dateKey(now, timeZone);
  const from = shiftDateKey(today, -6);
  const ordered = [...rdos].sort((a, b) => String(b.data_relatorio || '').localeCompare(String(a.data_relatorio || '')));
  const period = ordered.filter((rdo) => inWindow(rdo.data_relatorio, from, today, timeZone));
  const latestDate = dateKey(ordered[0]?.data_relatorio, timeZone);
  const daysSinceLatest = latestDate ? Math.max(0, Math.floor((new Date(`${today}T12:00:00Z`) - new Date(`${latestDate}T12:00:00Z`)) / 86400000)) : null;
  return {
    period: { from, to: today, days: 7 },
    latest_rdo_date: ordered[0]?.data_relatorio || null,
    days_since_latest: daysSinceLatest,
    recent: ordered.slice(0, 5),
    totals: {
      rdos: period.length,
      activities: period.reduce((sum, rdo) => sum + number(rdo.activity_count), 0),
      photos: period.reduce((sum, rdo) => sum + number(rdo.photo_count), 0),
      occurrences: period.reduce((sum, rdo) => sum + number(rdo.occurrence_count), 0),
      awaiting_analysis: period.filter((rdo) => ['Em análise', 'Em analise'].includes(rdo.status)).length
    }
  };
};

const summarizeWorkforce = (rdos = [], rows = [], now = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const today = dateKey(now, timeZone);
  const from = shiftDateKey(today, -6);
  const periodRdos = rdos.filter((rdo) => inWindow(rdo.data_relatorio, from, today, timeZone));
  const ordered = [...rdos].sort((a, b) => String(b.data_relatorio || '').localeCompare(String(a.data_relatorio || '')));
  const periodRows = rows.filter((row) => inWindow(row.data_relatorio, from, today, timeZone));
  const byFunction = new Map();
  for (const row of periodRows) {
    const label = String(row.funcao || 'Não informada').trim() || 'Não informada';
    byFunction.set(label, (byFunction.get(label) || 0) + 1);
  }
  const hhAvailable = periodRows.length > 0;
  const average = periodRdos.length
    ? periodRdos.reduce((sum, rdo) => sum + effective(rdo), 0) / periodRdos.length
    : null;
  return {
    period: { from, to: today, days: 7 },
    latest_effective: ordered.length ? effective(ordered[0]) : null,
    average_effective: average === null ? null : Math.round(average * 10) / 10,
    hh: hhAvailable ? Math.round(periodRows.reduce((sum, row) => sum + number(row.horas_trabalhadas), 0) * 100) / 100 : null,
    hh_available: hhAvailable,
    by_function: [...byFunction.entries()].map(([funcao, quantidade]) => ({ funcao, quantidade })).sort((a, b) => b.quantidade - a.quantidade)
  };
};

const normalizeEquipmentName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

const summarizeEquipment = (rows = []) => {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeEquipmentName(row.nome);
    if (!key) continue;
    const current = grouped.get(key) || { name: String(row.nome).trim(), max_quantity: 0, dates: new Set(), last_used: null };
    current.max_quantity = Math.max(current.max_quantity, number(row.quantidade) || 1);
    const used = dateKey(row.data_relatorio);
    if (used) {
      current.dates.add(used);
      if (!current.last_used || used > current.last_used) current.last_used = used;
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((item) => ({ name: item.name, max_quantity: item.max_quantity, days_used: item.dates.size, last_used: item.last_used }))
    .sort((a, b) => String(b.last_used || '').localeCompare(String(a.last_used || '')) || a.name.localeCompare(b.name));
};

const summarizeQuality = (rows = [], now = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const today = dateKey(now, timeZone);
  const from = shiftDateKey(today, -6);
  const open = rows.filter((row) => row.status !== 'Encerrada');
  const countStatus = (status) => rows.filter((row) => row.status === status).length;
  const gravities = ['Baixa', 'Média', 'Alta', 'Crítica'].map((gravidade) => ({
    gravidade,
    count: open.filter((row) => row.gravidade === gravidade).length
  }));
  return {
    total: rows.length,
    open: open.length,
    awaiting_approval: countStatus('Em análise'),
    in_correction: countStatus('Em andamento') + countStatus('Reprovada'),
    recently_closed: rows.filter((row) => row.status === 'Encerrada' && inWindow(row.resolvido_em || row.atualizado_em, from, today, timeZone)).length,
    critical_open: open.filter((row) => row.gravidade === 'Crítica').length,
    by_gravity: gravities,
    attention: open.filter((row) => ['Crítica', 'Alta'].includes(row.gravidade)).slice(0, 5)
  };
};

const safeBlock = async (name, loader, errors) => {
  try {
    return await loader();
  } catch (error) {
    errors.push({ source: name, message: error?.message || 'Fonte indisponível.' });
    return null;
  }
};

const loadCockpit = async ({ project, permissions, allQuery, now = new Date() }) => {
  const projectId = Number(project.id);
  const errors = [];
  const today = dateKey(now);
  const from = shiftDateKey(today, -6);
  const activitiesMetaPromise = permissions.eap
    ? safeBlock('eap_meta', () => allQuery(`
        SELECT COUNT(*) AS total, MIN(data_inicio_planejada) AS planned_start, MAX(atualizado_em) AS latest_update
        FROM atividades_eap WHERE projeto_id = ?
      `, [projectId]).then((rows) => rows[0] || {}), errors)
    : Promise.resolve(null);

  let execution = null;
  let workforce = null;
  let equipment = null;
  let rdosPromise = Promise.resolve(null);
  let workforceRowsPromise = Promise.resolve(null);
  let equipmentRowsPromise = Promise.resolve(null);
  if (permissions.rdo) {
    rdosPromise = safeBlock('rdos', () => allQuery(`
      SELECT r.id, r.numero_rdo, r.data_relatorio, r.status, r.criado_em, r.atualizado_em,
             r.mao_obra_direta, r.mao_obra_indireta, r.mao_obra_terceiros,
             u.nome AS responsavel,
             (SELECT COUNT(*) FROM rdo_atividades ra WHERE ra.rdo_id = r.id) AS activity_count,
             (SELECT COUNT(*) FROM rdo_fotos rf WHERE rf.rdo_id = r.id) AS photo_count,
             (SELECT COUNT(*) FROM rdo_ocorrencias ro WHERE ro.rdo_id = r.id) AS occurrence_count
      FROM rdos r LEFT JOIN usuarios u ON u.id = r.criado_por
      WHERE r.projeto_id = ?
        AND (
          date(r.data_relatorio) BETWEEN date(?) AND date(?)
          OR r.id IN (SELECT id FROM rdos WHERE projeto_id = ? ORDER BY data_relatorio DESC, id DESC LIMIT 5)
        )
      ORDER BY r.data_relatorio DESC, r.id DESC
    `, [projectId, from, today, projectId]), errors);

    workforceRowsPromise = safeBlock('workforce', () => allQuery(`
      SELECT r.data_relatorio, rmo.horas_trabalhadas, mo.funcao
      FROM rdo_mao_obra rmo
      INNER JOIN rdos r ON r.id = rmo.rdo_id
      LEFT JOIN mao_obra mo ON mo.id = rmo.mao_obra_id
      WHERE r.projeto_id = ? AND date(r.data_relatorio) BETWEEN date(?) AND date(?)
      ORDER BY r.data_relatorio DESC
    `, [projectId, from, today]), errors);

    equipmentRowsPromise = safeBlock('equipment', () => allQuery(`
      SELECT e.nome, e.quantidade, e.horas_utilizadas, r.data_relatorio
      FROM rdo_equipamentos e INNER JOIN rdos r ON r.id = e.rdo_id
      WHERE r.projeto_id = ? ORDER BY r.data_relatorio DESC, e.id DESC
    `, [projectId]), errors);
  }

  const qualityRowsPromise = permissions.quality
    ? safeBlock('quality', () => allQuery(`
        SELECT id, titulo, gravidade, status, criado_em, atualizado_em, resolvido_em
        FROM rnc WHERE projeto_id = ? ORDER BY criado_em DESC
      `, [projectId]), errors)
    : Promise.resolve(null);

  const [activitiesMeta, rdos, workforceRows, equipmentRows, qualityRows] = await Promise.all([
    activitiesMetaPromise, rdosPromise, workforceRowsPromise, equipmentRowsPromise, qualityRowsPromise
  ]);
  if (permissions.rdo) {
    execution = rdos === null ? null : summarizeExecution(rdos, now);
    workforce = workforceRows === null ? null : summarizeWorkforce(rdos || [], workforceRows, now);
    equipment = equipmentRows === null ? null : { items: summarizeEquipment(equipmentRows) };
  }
  const quality = qualityRows === null ? null : summarizeQuality(qualityRows, now);

  const sourceDates = [project.atualizado_em, activitiesMeta?.latest_update, execution?.recent?.[0]?.atualizado_em].filter(Boolean).sort();
  return {
    updated_at: new Date().toISOString(),
    project: { ...project, planned_start: activitiesMeta?.planned_start || null, activity_count: activitiesMeta ? number(activitiesMeta.total) : null },
    execution,
    workforce,
    equipment,
    quality,
    permissions,
    traceability: {
      sources: ['cockpit', permissions.curve_s && 'curva-s', permissions.eap && 'gantt-data', permissions.procurement && 'requisicoes-kanban', permissions.assets && 'almoxarifado', permissions.rdo && 'galeria-rdos'].filter(Boolean),
      counts: {
        activities: activitiesMeta ? number(activitiesMeta.total) : null,
        rdos: execution?.recent?.length ?? null,
        rncs: quality?.total ?? null
      },
      latest_source_update: sourceDates.at(-1) || null,
      failed_sources: errors.map((item) => item.source)
    },
    errors
  };
};

module.exports = {
  DEFAULT_TIME_ZONE,
  dateKey,
  effective,
  summarizeExecution,
  summarizeWorkforce,
  summarizeEquipment,
  summarizeQuality,
  loadCockpit
};

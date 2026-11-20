const dayMs = 86400000;
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const dateKey = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const timeMinutes = value => {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value || ''));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};
function registeredHours(occurrences, date) {
  if (!occurrences.length) return { horas: null, incompleto: false };
  const intervals = [];
  let incomplete = false;
  for (const occurrence of occurrences) {
    const start = timeMinutes(occurrence.hora_inicio), end = timeMinutes(occurrence.hora_fim);
    if (occurrence.em_andamento || (occurrence.data_ocorrencia && dateKey(occurrence.data_ocorrencia) !== date) || start == null || end == null || end <= start) { incomplete = true; continue; }
    intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let minutes = 0, current = null;
  for (const interval of intervals) {
    if (!current) current = interval.slice();
    else if (interval[0] <= current[1]) current[1] = Math.max(current[1], interval[1]);
    else { minutes += current[1] - current[0]; current = interval.slice(); }
  }
  if (current) minutes += current[1] - current[0];
  return { horas: intervals.length ? minutes / 60 : null, incompleto: incomplete };
}
function consolidateWeather({ inicio, fim, rdos, allRdos = rdos, weather, occurrences = [], calendario }) {
  const days = [];
  for (let t = Date.parse(`${inicio}T00:00:00Z`); t <= Date.parse(`${fim}T00:00:00Z`); t += dayMs) {
    const date = new Date(t).toISOString().slice(0, 10);
    const records = weather.filter(w => dateKey(w.data) === date && (String(w.condicao_tempo || '').trim() || String(w.condicao_trabalho || '').trim()));
    const dayRdos = rdos.filter(r => dateKey(r.data_relatorio) === date);
    const hasOtherRdo = allRdos.some(r => dateKey(r.data_relatorio) === date);
    const dayOccurrences = occurrences.filter(o => dateKey(o.data) === date);
    const schedule = calendario && Array.isArray(calendario.dias) && calendario.dias.every(d => Number.isInteger(d) && d >= 0 && d <= 6)
      ? (Object.hasOwn(calendario.excecoes || {}, date) ? calendario.excecoes[date] : calendario.dias.includes(new Date(t).getUTCDay())) : null;
    const statuses = records.map(r => normalize(r.condicao_trabalho));
    const impacted = statuses.includes('impraticavel') || dayOccurrences.length > 0;
    const situation = statuses.includes('impraticavel') && statuses.includes('praticavel') ? 'Parcialmente impeditivo' : impacted ? 'Impacto registrado' : records.length && statuses.every(s => s === 'praticavel') ? 'Favorável' : 'Sem informação';
    const presence = dayRdos.length ? (records.length ? 'registrado' : 'sem_clima') : hasOtherRdo ? 'sem_rdo_aprovado' : schedule === false ? 'sem_operacao' : 'sem_rdo';
    const duration = registeredHours(dayOccurrences, date);
    days.push({ data: date, dia_semana: ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][new Date(t).getUTCDay()], presenca: presence, operacao_prevista: typeof schedule === 'boolean' ? schedule : null,
      situacao: situation, impacto: impacted, periodos: records.map(({ periodo, condicao_tempo, condicao_trabalho, pluviometria_mm }) => ({ periodo, condicao_tempo, condicao_trabalho, pluviometria_mm })),
      horas_paralisacao: duration.horas, horas_incompletas: duration.incompleto });
  }
  const timed = days.filter(d => d.horas_paralisacao != null);
  return { versao: 1, dias: days, resumo: { dias_periodo: days.length,
    dias_operacao_prevista: days.every(d => d.operacao_prevista != null) ? days.filter(d => d.operacao_prevista).length : null,
    dias_com_clima: days.filter(d => d.periodos.length).length, dias_com_impacto: days.filter(d => d.impacto).length,
    dias_parciais: days.filter(d => d.situacao === 'Parcialmente impeditivo').length,
    dias_sem_informacao: days.filter(d => d.presenca !== 'sem_operacao' && !d.periodos.length).length,
    horas_paralisacao: timed.length ? timed.reduce((sum, d) => sum + d.horas_paralisacao, 0) : null,
    horas_incompletas: days.some(d => d.horas_incompletas) } };
}
module.exports = { consolidateWeather };

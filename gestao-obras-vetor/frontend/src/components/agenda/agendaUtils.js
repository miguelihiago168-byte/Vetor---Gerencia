const pad = (n) => String(n).padStart(2, '0');
export const dateValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const monthValue = (date) => dateValue(date).slice(0, 7);
export const localDate = (value) => new Date(`${value}T12:00:00`);
export const timeLabel = (value) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const reminderLabel = (value) => value === null ? 'Sem lembrete' : value === 1440 ? '1 dia antes' : `${value} minutos antes`;
export const normalizeSearch = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function calendarDays(month) {
  const start = new Date(`${month}-01T12:00:00`);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return { date, value: dateValue(date), inMonth: monthValue(date) === month };
  });
}
export function calendarPeriod(month) {
  const days = calendarDays(month);
  const start = new Date(`${days[0].value}T00:00:00`);
  const end = new Date(`${days[41].value}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { inicio_em: start.toISOString(), fim_em: end.toISOString() };
}
export function shiftMonth(day, delta) {
  const date = localDate(day);
  const target = new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return dateValue(target);
}
export function meetingStatus(meeting, now) {
  if (meeting.status === 'cancelada') return { key: 'cancelada', label: 'Cancelada' };
  if (new Date(meeting.fim_em).getTime() <= now) return { key: 'encerrada', label: 'Encerrada' };
  if (new Date(meeting.inicio_em).getTime() <= now) return { key: 'andamento', label: 'Em andamento' };
  return { key: 'agendada', label: 'Agendada' };
}
export function initialForm(meeting, day, userId) {
  const start = meeting ? new Date(meeting.inicio_em) : null;
  return {
    assunto: meeting?.assunto || '', descricao: meeting?.descricao || '',
    data: start ? dateValue(start) : day,
    hora: start ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : '09:00',
    duracao_minutos: meeting ? Math.round((new Date(meeting.fim_em) - start) / 60000) : 60,
    lembrete_minutos: meeting ? meeting.lembrete_minutos ?? null : 15,
    participantes_ids: (meeting?.participantes || []).filter((p) => Number(p.id) !== Number(userId)).map((p) => Number(p.id))
  };
}
export function formPayload(form) {
  const start = new Date(`${form.data}T${form.hora}:00`);
  if (!Number.isFinite(start.getTime()) || dateValue(start) !== form.data || `${pad(start.getHours())}:${pad(start.getMinutes())}` !== form.hora) {
    throw new Error('Escolha uma data e um horário válidos neste fuso.');
  }
  if (form.assunto.trim().length < 3) throw new Error('Informe um assunto com pelo menos 3 caracteres.');
  if (!form.participantes_ids.length) throw new Error('Selecione pelo menos um convidado.');
  return { assunto: form.assunto.trim(), descricao: form.descricao.trim(), inicio_em: start.toISOString(),
    duracao_minutos: Number(form.duracao_minutos), lembrete_minutos: form.lembrete_minutos,
    participantes_ids: form.participantes_ids.map(Number) };
}

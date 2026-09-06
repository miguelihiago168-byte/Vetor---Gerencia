import assert from 'node:assert/strict';
import { calendarDays, calendarPeriod, dateValue, formPayload, meetingStatus, reminderLabel, shiftMonth } from './agendaUtils.js';

assert.equal(calendarDays('2026-02').length, 42);
assert.equal(calendarDays('2026-02')[0].value, '2026-02-01');
assert.equal(calendarDays('2026-02')[41].value, '2026-03-14');
assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28');
assert.equal(shiftMonth('2028-01-31', 1), '2028-02-29');
assert.equal(calendarPeriod('2026-02').inicio_em.endsWith('Z'), true);
assert.equal(reminderLabel(null), 'Sem lembrete');
assert.equal(reminderLabel(1440), '1 dia antes');

const now = Date.now();
assert.equal(meetingStatus({ status: 'ativa', inicio_em: new Date(now - 60_000), fim_em: new Date(now + 60_000) }, now).key, 'andamento');
assert.equal(meetingStatus({ status: 'ativa', inicio_em: new Date(now - 120_000), fim_em: new Date(now - 60_000) }, now).key, 'encerrada');
assert.equal(meetingStatus({ status: 'cancelada', inicio_em: new Date(now + 60_000), fim_em: new Date(now + 120_000) }, now).key, 'cancelada');

const payload = formPayload({ assunto: 'Reunião de obra', descricao: '', data: '2026-10-15', hora: '09:30', duracao_minutos: 60, lembrete_minutos: 15, participantes_ids: [4] });
assert.equal(payload.inicio_em, new Date('2026-10-15T09:30:00').toISOString());
assert.equal(dateValue(new Date(payload.inicio_em)), '2026-10-15');
assert.throws(() => formPayload({ assunto: 'ok', data: '2026-10-15', hora: '09:30', participantes_ids: [4] }), /3 caracteres/);
assert.throws(() => formPayload({ assunto: 'Reunião de obra', data: '2026-10-15', hora: '09:30', participantes_ids: [] }), /convidado/);

console.log('OK: calendário, status e payload da agenda validados.');

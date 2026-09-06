import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { dateValue, timeLabel } from './agendaUtils';
import './MeetingReminderNotice.css';

const memory = new Map();
export function claimReminder(scope, id, storage) {
  const key = `vetor:lembretes-vistos:${scope}`;
  let seen = memory.get(key) || [];
  try { storage ||= globalThis.localStorage; seen = [...new Set([...seen, ...JSON.parse(storage.getItem(key) || '[]')])]; } catch (_) { /* memória cobre navegação sem armazenamento */ }
  if (seen.includes(String(id))) return false;
  seen = [...seen, String(id)].slice(-1000);
  memory.set(key, seen);
  try { storage.setItem(key, JSON.stringify(seen)); } catch (_) { /* sessão em memória */ }
  return true;
}

export default function MeetingReminderNotice({ notifications, scope, onOpen }) {
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    const current = notifications.filter((n) => n.tipo === 'reuniao_lembrete' && new Date(n.reuniao_inicio_em).getTime() > Date.now());
    const fresh = current.filter((n) => claimReminder(scope, n.id));
    setQueue((previous) => [...previous.filter((n) => current.some((item) => item.id === n.id)), ...fresh]);
  }, [notifications, scope]);
  const notice = queue[0];
  if (!notice) return null;
  return <aside className="meeting-reminder-notice" aria-label="Lembrete de reunião">
    <Bell size={22} aria-hidden="true" /><div><div role="status"><strong>Sua reunião está chegando</strong><p>{notice.mensagem}</p><small>{dateValue(new Date(notice.reuniao_inicio_em)) === dateValue(new Date()) ? 'Hoje' : new Date(notice.reuniao_inicio_em).toLocaleDateString('pt-BR')} às {timeLabel(notice.reuniao_inicio_em)}</small></div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpen(notice)}>Ver reunião</button>{queue.length > 1 && <small> +{queue.length - 1} {queue.length === 2 ? 'lembrete' : 'lembretes'}</small>}</div>
    <button type="button" className="meeting-reminder-close" aria-label="Dispensar aviso" onClick={() => setQueue((items) => items.slice(1))}><X size={18} /></button>
  </aside>;
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Clock, MessageSquare, Pencil, Plus, Users, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { useNotification } from '../../context/NotificationContext';
import { cancelarReuniaoMensagem, criarReuniaoMensagem, editarReuniaoMensagem, getReuniaoMensagem, getUsuarios, listarReunioesMensagens } from '../../services/api';
import ReuniaoDialog from './ReuniaoDialog';
import { calendarDays, calendarPeriod, dateValue, localDate, meetingStatus, reminderLabel, shiftMonth, timeLabel } from './agendaUtils';
import './Agenda.css';

export default function Agenda({ projetoId, onConversas }) {
  const { usuario } = useAuth();
  const { confirm } = useDialog();
  const { success, error } = useNotification();
  const [params, setParams] = useSearchParams();
  const focusId = params.get('reuniao');
  const [day, setDay] = useState(() => dateValue(new Date()));
  const month = day.slice(0, 7);
  const monthLabel = useMemo(() => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T12:00:00`)), [month]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [focusError, setFocusError] = useState('');
  const [focusRetry, setFocusRetry] = useState(0);
  const [focusing, setFocusing] = useState(Boolean(focusId));
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState('');
  const [editor, setEditor] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(null);
  const request = useRef(0);
  const participantRequest = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setLoadError('');
    if (!projetoId) { setLoading(false); setMeetings([]); return; }
    try {
      const { data } = await listarReunioesMensagens({ projeto_id: projetoId, ...calendarPeriod(month) });
      if (id === request.current) setMeetings(data || []);
    } catch (e) {
      if (id === request.current) { setMeetings([]); setLoadError(e.response?.data?.erro || 'Não foi possível carregar a agenda.'); }
    } finally { if (id === request.current) setLoading(false); }
  }, [projetoId, month, usuario?.tenant_id]);
  const refreshParticipants = useCallback(async () => {
    const id = ++participantRequest.current;
    setParticipantsLoading(true); setParticipantsError('');
    try {
      if (!projetoId) { setParticipants([]); return; }
      const { data } = await getUsuarios({ projeto_id: projetoId, ativo: 1 });
      if (id === participantRequest.current) setParticipants(data || []);
    } catch (_) { if (id === participantRequest.current) setParticipantsError('Não foi possível carregar os participantes.'); }
    finally { if (id === participantRequest.current) setParticipantsLoading(false); }
  }, [projetoId, usuario?.tenant_id]);
  useEffect(() => { refresh(); return () => { request.current++; }; }, [refresh]);
  useEffect(() => { refreshParticipants(); return () => { participantRequest.current++; }; }, [refreshParticipants]);
  useEffect(() => {
    const tick = () => { setNow(Date.now()); if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setFocusError(''); setFocusing(Boolean(focusId));
    if (focusId) getReuniaoMensagem(focusId).then(({ data }) => {
      if (!active) return;
      if (Number(data.projeto_id) !== Number(projetoId)) throw new Error('Esta reunião pertence a outro projeto.');
      setDay(dateValue(new Date(data.inicio_em)));
    }).catch((e) => { if (active) setFocusError(e.response?.data?.erro || e.message); })
      .finally(() => { if (active) setFocusing(false); });
    return () => { active = false; };
  }, [focusId, projetoId, usuario?.tenant_id, focusRetry]);
  useEffect(() => {
    if (focusId && !loading && !focusing) document.getElementById(`agenda-reuniao-${focusId}`)?.focus();
  }, [focusId, loading, focusing]);
  const selectDay = (value) => { setDay(value); setParams({ tab: 'agenda' }); };
  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of meetings) { const key = dateValue(new Date(m.inicio_em)); map.set(key, [...(map.get(key) || []), m]); }
    return map;
  }, [meetings]);
  const selected = [...(byDay.get(day) || [])].sort((a, b) => new Date(a.inicio_em) - new Date(b.inicio_em));
  const upcoming = selected.find((m) => meetingStatus(m, now).key === 'agendada');
  const today = dateValue(new Date(now));
  const newMeeting = () => setEditor({ meeting: null, day });
  const save = async (payload) => {
    if (editor.meeting) await editarReuniaoMensagem(editor.meeting.id, payload);
    else await criarReuniaoMensagem({ ...payload, projeto_id: projetoId });
    success(editor.meeting ? 'Reunião atualizada e convidados notificados.' : 'Reunião marcada e convidados notificados.');
    selectDay(dateValue(new Date(payload.inicio_em)));
    await refresh();
    window.dispatchEvent(new Event('vetor:notificacoes-atualizar'));
  };
  const cancel = async (m) => {
    if (!await confirm({ title: 'Cancelar reunião', message: `Cancelar “${m.assunto}” e avisar os convidados?`, confirmText: 'Cancelar reunião', cancelText: 'Manter reunião' })) return;
    try { setCancelling(m.id); await cancelarReuniaoMensagem(m.id); success('Reunião cancelada.'); await refresh(); window.dispatchEvent(new Event('vetor:notificacoes-atualizar')); }
    catch (e) { error(e.response?.data?.erro || 'Não foi possível cancelar a reunião.'); }
    finally { setCancelling(null); }
  };
  return <>
    <section className="agenda-sidebar card">
      <header className="agenda-sidebar-header"><h2><CalendarDays size={20} /> Agenda</h2><button className="btn btn-secondary btn-sm" onClick={onConversas}><MessageSquare size={15} /> Conversas</button></header>
      <p className="agenda-help">Suas reuniões neste projeto.</p>
      <button className="btn btn-primary agenda-new" onClick={newMeeting} disabled={!projetoId}><Plus size={17} /> Nova reunião</button>
      <div className="agenda-month" aria-label={`Mês exibido: ${monthLabel}`}>
        <button type="button" className="agenda-month-arrow" aria-label="Mês anterior" onClick={() => selectDay(shiftMonth(day, -1))}><ChevronLeft size={18} /></button>
        <label className="agenda-month-current" title="Selecionar outro mês">
          <strong>{monthLabel}</strong>
          <input type="month" value={month} aria-label="Selecionar mês da agenda" onChange={(e) => { if (e.target.value) selectDay(`${e.target.value}-01`); }} />
        </label>
        <button type="button" className="agenda-month-arrow" aria-label="Próximo mês" onClick={() => selectDay(shiftMonth(day, 1))}><ChevronRight size={18} /></button>
      </div>
      <div className="agenda-calendar" aria-label="Calendário de reuniões">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label) => <span key={label} className="agenda-weekday">{label}</span>)}
        {calendarDays(month).map((d) => {
          const count = (byDay.get(d.value) || []).filter((m) => m.status !== 'cancelada').length;
          return <button key={d.value} className={`agenda-day${!d.inMonth ? ' outside' : ''}${d.value === day ? ' selected' : ''}${d.value === today ? ' today' : ''}`} aria-pressed={d.value === day} aria-current={d.value === today ? 'date' : undefined} aria-label={`${d.date.toLocaleDateString('pt-BR', { dateStyle: 'full' })}, ${count} ${count === 1 ? 'reunião' : 'reuniões'}`} onClick={() => selectDay(d.value)}>
            <span>{d.date.getDate()}</span>{count > 0 && <small>{count}</small>}
          </button>;
        })}
      </div>
      <button className="btn btn-secondary agenda-today" onClick={() => selectDay(today)}>Hoje</button>
      <div className="agenda-tip"><Bell size={19} /><p>Um aviso antes de começar.<span>Configure o lembrete ao marcar sua reunião.</span></p></div>
    </section>
    <section className="agenda-panel card" aria-busy={loading || focusing}>
      <header className="agenda-panel-header"><div><span className="agenda-eyebrow">{day === today ? 'HOJE' : 'PROGRAMAÇÃO DO DIA'}</span><h2>{localDate(day).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>{selected.length} {selected.length === 1 ? 'reunião' : 'reuniões'}{loading ? ' · Atualizando...' : ''}</p></div><CalendarDays size={28} /></header>
      {!projetoId ? <div className="agenda-empty">Abra um projeto para consultar e marcar reuniões.</div> : focusing ? <div className="agenda-empty" role="status">Localizando reunião...</div> : focusError || loadError ? <div className="agenda-empty agenda-error" role="alert"><p>{focusError || loadError}</p><button className="btn btn-secondary" onClick={() => focusError ? setFocusRetry((n) => n + 1) : refresh()}>Tentar novamente</button>{focusError && <button className="btn btn-secondary" onClick={() => setParams({ tab: 'agenda' })}>Voltar à agenda</button>}</div> : loading && !meetings.length ? <div className="agenda-empty" role="status">Carregando reuniões...</div> : !selected.length ? <div className="agenda-empty"><CalendarDays size={40} /><h3>Seu dia está livre por aqui</h3><p>Nenhuma reunião marcada para esta data.</p><button className="btn btn-primary" onClick={newMeeting}><Plus size={16} /> Marcar reunião</button></div> : <div className="agenda-meetings">
        {selected.map((m) => {
          const status = meetingStatus(m, now), next = m.id === upcoming?.id;
          return <article key={m.id} id={`agenda-reuniao-${m.id}`} tabIndex={-1} className={`agenda-meeting ${status.key}${next ? ' next' : ''}${String(m.id) === focusId ? ' focused' : ''}`}>
            {next && <div className="agenda-next-label"><Clock size={13} /> Próxima reunião do dia</div>}
            <div className="agenda-meeting-content"><div className="agenda-time"><strong>{timeLabel(m.inicio_em)}</strong><span>até {timeLabel(m.fim_em)}</span></div><div className="agenda-meeting-body"><div className="agenda-meeting-title"><h3>{m.assunto}</h3><span className={`agenda-status ${status.key}`}>{status.label}</span></div>
              {m.descricao && <p className="agenda-description">{m.descricao}</p>}
              <div className="agenda-meta"><span><Users size={14} /> {(m.participantes || []).map((p) => p.nome).join(', ')}</span><span><Bell size={14} /> {reminderLabel(m.lembrete_minutos)}</span></div>
              <p className="agenda-help">Organizada por {m.criador_nome || 'você'}</p>
              {Number(m.criada_por) === Number(usuario.id) && m.status !== 'cancelada' && <div className="agenda-actions"><button className="btn btn-secondary btn-sm" onClick={() => setEditor({ meeting: m, day })}><Pencil size={14} /> Editar</button><button className="btn btn-secondary btn-sm" onClick={() => cancel(m)} disabled={cancelling !== null}><XCircle size={14} /> {cancelling === m.id ? 'Cancelando...' : 'Cancelar reunião'}</button></div>}
            </div></div>
          </article>;
        })}
      </div>}
    </section>
    {editor && <ReuniaoDialog meeting={editor.meeting} day={editor.day} user={usuario} participants={participants} participantsLoading={participantsLoading} participantsError={participantsError} onRetryParticipants={refreshParticipants} onSave={save} onClose={() => setEditor(null)} />}
  </>;
}

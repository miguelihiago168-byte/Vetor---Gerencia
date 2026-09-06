import React, { useEffect, useRef, useState } from 'react';
import { Bell, Clock, Search, Users, X } from 'lucide-react';
import { useLeaveGuard } from '../../context/LeaveGuardContext';
import { formPayload, initialForm, normalizeSearch, reminderLabel, timeLabel } from './agendaUtils';

export default function ReuniaoDialog({ meeting, day, user, participants, participantsLoading, participantsError, onRetryParticipants, onSave, onClose }) {
  const [initial] = useState(() => initialForm(meeting, day, user.id));
  const [form, setForm] = useState(initial);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const { setDirty } = useLeaveGuard();
  const dialogRef = useRef(null);
  const submitting = useRef(false);
  const dirty = JSON.stringify(initial) !== JSON.stringify(form);
  const update = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } };
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('input')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); discard ? setDiscard(false) : close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    try {
      const payload = formPayload(form);
      submitting.current = true; setSaving(true); setError('');
      await onSave(payload);
      setDirty(false); onClose();
    } catch (e) { setError(e.response?.data?.erro || e.message); }
    finally { submitting.current = false; setSaving(false); }
  };
  const start = new Date(`${form.data}T${form.hora}:00`);
  const end = Number.isFinite(start.getTime()) ? new Date(start.getTime() + Number(form.duracao_minutos) * 60000) : null;
  const filtered = participants.filter((p) => Number(p.id) !== Number(user.id) && normalizeSearch(p.nome).includes(normalizeSearch(search)));
  return <div className="agenda-dialog-overlay">
    <section className="agenda-dialog" role="dialog" aria-modal="true" aria-labelledby="reuniao-dialog-title" ref={dialogRef} onKeyDown={onKeyDown}>
      <header className="agenda-dialog-header"><div><h2 id="reuniao-dialog-title">{meeting ? 'Editar reunião' : 'Nova reunião'}</h2><p>Combine um horário e avise sua equipe.</p></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={close} disabled={saving} aria-label="Fechar formulário"><X size={18} /></button></header>
      {discard ? <div className="agenda-discard" role="alert">
        <h3>Descartar alterações?</h3><p>Os dados desta edição ainda não foram salvos.</p>
        <div className="agenda-actions"><button className="btn btn-secondary" autoFocus onClick={() => setDiscard(false)}>Continuar editando</button><button className="btn btn-danger" onClick={onClose}>Descartar</button></div>
      </div> : <form className="agenda-form" onSubmit={submit}>
        <fieldset disabled={saving}>
          <label>Assunto<input autoComplete="off" required minLength={3} maxLength={160} value={form.assunto} onChange={(e) => update('assunto', e.target.value)} placeholder="Ex.: alinhamento da obra" /></label>
          <div className="agenda-form-row"><label>Data<input type="date" required value={form.data} onChange={(e) => update('data', e.target.value)} /></label>
            <label>Horário<input type="time" required value={form.hora} onChange={(e) => update('hora', e.target.value)} /></label>
            <label>Duração<select value={form.duracao_minutos} onChange={(e) => update('duracao_minutos', Number(e.target.value))}>
              {[...new Set([15, 30, 45, 60, 90, 120, form.duracao_minutos])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n < 60 ? `${n} minutos` : `${Math.floor(n / 60)}h${n % 60 ? String(n % 60).padStart(2, '0') : ''}`}</option>)}
            </select></label></div>
          <p className="agenda-help"><Clock size={14} /> {end ? `Término às ${timeLabel(end)}${end.getDate() !== start.getDate() ? ' do dia seguinte' : ''}. ` : ''}Fuso: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
          <div className="agenda-participants"><span className="agenda-label"><Users size={15} /> Participantes · {form.participantes_ids.length + 1} selecionado{form.participantes_ids.length ? 's' : ''}</span>
            <p className="agenda-help">Você ({user.nome}) participa automaticamente.</p>
            <label className="agenda-search"><Search size={16} /><input aria-label="Buscar participantes" placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
            {participantsLoading ? <p role="status">Carregando participantes...</p> : participantsError ? <p role="alert">Não foi possível carregar os participantes. <button type="button" onClick={onRetryParticipants}>Tentar novamente</button></p> : <div className="agenda-participants-list">
              {filtered.length === 0 && <p className="agenda-help">{search ? 'Nenhum participante encontrado.' : 'Nenhum convidado disponível neste projeto.'}</p>}
              {filtered.map((p) => <label key={p.id} className="agenda-participant"><input type="checkbox" checked={form.participantes_ids.includes(Number(p.id))} onChange={(e) => update('participantes_ids', e.target.checked ? [...form.participantes_ids, Number(p.id)] : form.participantes_ids.filter((id) => id !== Number(p.id)))} /><span>{p.nome}</span></label>)}
            </div>}
          </div>
          <label><span><Bell size={15} /> Lembrete para todos</span><select value={form.lembrete_minutos ?? ''} onChange={(e) => update('lembrete_minutos', e.target.value === '' ? null : Number(e.target.value))}>
            {[5, 15, 30, 60, 1440].map((n) => <option key={n} value={n}>{reminderLabel(n)}</option>)}<option value="">Sem lembrete</option>
          </select></label><p className="agenda-help">O aviso aparece dentro do sistema para você e seus convidados.</p>
          <label>Descrição <small>(opcional)</small><textarea rows={3} maxLength={1000} value={form.descricao} onChange={(e) => update('descricao', e.target.value)} placeholder="Pauta, local ou link da chamada" /></label>
        </fieldset>
        {error && <p className="agenda-error" role="alert">{error}</p>}
        <footer className="agenda-actions"><button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving || participantsLoading || Boolean(participantsError)}>{saving ? 'Salvando...' : meeting ? 'Salvar alterações' : 'Marcar reunião'}</button></footer>
      </form>}
    </section>
  </div>;
}

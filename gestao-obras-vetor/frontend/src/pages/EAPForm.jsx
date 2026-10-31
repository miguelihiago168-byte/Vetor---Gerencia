import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Button from '../components/ui/Button';
import CockpitReturnButton, { getCockpitReturnContext } from '../components/CockpitReturnButton';
import { getAtividadesEAP } from '../services/api';
import useEapEditor from '../components/eap/useEapEditor';
import { EapEditorContent, EditorActions } from '../components/eap/EapEditor';
import '../components/eap/EapWorkspace.css';

export default function EAPForm() {
  const { projetoId, atividadeId } = useParams();
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get('pai') || '';
  const navigate = useNavigate();
  const location = useLocation();
  const cockpitReturn = getCockpitReturnContext(location);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState('data');
  const ref = useRef(null);
  const editor = useEapEditor({
    projectId: projetoId, activities,
    onSaved: () => navigate(`/projeto/${projetoId}/eap`)
  });

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(''); setTab('data');
    getAtividadesEAP(projetoId).then((response) => {
      if (!active) return;
      const list = response.data || [];
      const activity = atividadeId ? list.find((item) => String(item.id) === String(atividadeId)) : null;
      if (atividadeId && !activity) { setLoadError('Atividade não encontrada neste projeto.'); return; }
      setActivities(list);
      editor.begin(activity, parentId, list);
    }).catch(() => { if (active) setLoadError('Não foi possível carregar a atividade. Tente novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projetoId, atividadeId, parentId, retry]);

  useEffect(() => {
    if (!Object.values(editor.errors).some(Boolean)) return;
    setTab('data');
    const frame = requestAnimationFrame(() => ref.current?.querySelector('[aria-invalid="true"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editor.validationAttempt]);
  const leave = async () => { if (await editor.cancel()) navigate(cockpitReturn?.to || `/projeto/${projetoId}/eap`); };
  const keyDown = (event) => {
    if (document.querySelector('.modal-overlay')) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); editor.save(); }
    if (event.key === 'Escape') { event.preventDefault(); leave(); }
  };

  return <><Navbar /><main className="eap-standalone" ref={ref} onKeyDown={keyDown}>
    <header className="eap-standalone-header">
      <CockpitReturnButton fallbackTo={`/projeto/${projetoId}/eap`} fallbackLabel="Voltar para a EAP" onClick={leave} disabled={editor.saving} />
      <div><span className="eap-eyebrow">Estrutura analítica do projeto</span><h1>{atividadeId ? 'Editar atividade' : 'Nova atividade'}</h1></div>
    </header>
    <div className="eap-standalone-card">
      {loading ? <p role="status">Carregando atividade…</p> : loadError ? <div className="eap-editor-error" role="alert">{loadError} <Button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button></div> : editor.session && <>
        <EapEditorContent editor={editor} activities={activities} tab={tab} setTab={setTab} />
        <EditorActions editor={editor} onCancel={leave} allowAnother={false} />
      </>}
    </div>
  </main></>;
}

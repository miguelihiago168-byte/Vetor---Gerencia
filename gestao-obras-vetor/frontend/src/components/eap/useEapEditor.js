import { useEffect, useRef, useState } from 'react';
import { createAtividade, updateAtividade, getUnidadesEAP } from '../../services/api';
import { useDialog } from '../../context/DialogContext';
import { useNotification } from '../../context/NotificationContext';
import { useLeaveGuard } from '../../context/LeaveGuardContext';
import { activityPayload, initialDraft, nextChildCode, validateDraft, isMeasurementOnlyDraft, parseMeasurementInput } from './eapUtils';
import { registerEapNavigationGuard } from './eapNavigationGuard';

export default function useEapEditor({ projectId, activities, onSaved }) {
  const { confirm, alert } = useDialog();
  const { success, error: notifyError } = useNotification();
  const { setDirty } = useLeaveGuard();
  const [session, setSession] = useState(null);
  const [errors, setErrors] = useState({});
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [units, setUnits] = useState([]);
  const [unitsError, setUnitsError] = useState('');
  const dirty = Boolean(session && JSON.stringify(session.draft) !== JSON.stringify(session.initial));
  useEffect(() => { setSession(null); setErrors({}); setError(''); }, [projectId]);

  const loadUnits = async () => {
    try {
      setUnitsError('');
      const response = await getUnidadesEAP();
      setUnits(response.data?.unidades || []);
    } catch { setUnitsError('Não foi possível carregar as unidades. Tente novamente.'); }
  };
  useEffect(() => { loadUnits(); }, []);
  useEffect(() => { setDirty(dirty || saving); return () => setDirty(false); }, [dirty, saving, setDirty]);

  useEffect(() => {
    if (!dirty && !saving) return undefined;
    return registerEapNavigationGuard(() => !submitting.current && window.confirm('Há alterações não salvas na EAP. Deseja descartá-las e sair?'));
  }, [dirty, saving]);

  const begin = (activity = null, parentId = '', list = activities) => {
    const draft = initialDraft(activity, parentId, list);
    const isGroup = Boolean(activity && list.some((item) => String(item.pai_id) === String(activity.id)));
    setSession({ original: activity, initial: draft, draft, isGroup });
    setErrors({}); setError('');
  };

  const canDiscard = async () => {
    if (submitting.current) return false;
    if (!dirty) return true;
    return confirm({ title: 'Descartar alterações?', message: 'Esta atividade tem alterações não salvas.', confirmText: 'Descartar', cancelText: 'Continuar editando' });
  };
  const cancel = async () => {
    if (!await canDiscard()) return false;
    setSession(null); setErrors({}); setError(''); setDirty(false);
    return true;
  };
  const update = (name, value) => {
    if (submitting.current) return;
    setSession((current) => {
      if (!current) return current;
      const draft = { ...current.draft, [name]: value };
      if (name === 'pai_id' && !current.original) draft.codigo_eap = value ? nextChildCode(value, activities) : '';
      return { ...current, draft };
    });
    setErrors((current) => ({ ...current, [name]: undefined }));
    setError('');
  };

  const save = async ({ another = false } = {}) => {
    if (!session || submitting.current || (session.original && !dirty)) return false;
    const measurementOnly = Boolean(session.original && !session.isGroup && isMeasurementOnlyDraft(session.draft, session.initial));
    const priceChanged = Boolean(session.original && !session.isGroup && parseMeasurementInput(session.draft.valor_total_medicao) !== parseMeasurementInput(session.initial.valor_total_medicao));
    let nextErrors = validateDraft(session.draft, Boolean(session.original));
    if (measurementOnly) nextErrors = nextErrors.valor_total_medicao ? { valor_total_medicao: nextErrors.valor_total_medicao } : {};
    setErrors(nextErrors); setError('');
    setValidationAttempt((attempt) => attempt + 1);
    if (Object.keys(nextErrors).length) return false;
    submitting.current = true; setSaving(true);
    try {
      if (session.original && (!measurementOnly || priceChanged) && !await confirm({
        title: measurementOnly ? 'Atualizar valor de medição' : 'Recalcular EAP',
        message: [!measurementOnly && 'Ao alterar esta atividade da EAP, os RDOs relacionados serão recalculados (ajuste aplicado ao último RDO).', priceChanged && 'O novo valor será aplicado a toda a execução aprovada, incluindo RDOs anteriores. Remover o preço deixará a atividade sem medição financeira.', 'Deseja continuar?'].filter(Boolean).join(' '),
        confirmText: 'Continuar', cancelText: 'Cancelar'
      })) return false;
      const payload = measurementOnly
        ? { valor_total_medicao: parseMeasurementInput(session.draft.valor_total_medicao) }
        : activityPayload(session.draft, projectId, session.original, session.isGroup);
      const response = session.original
        ? await updateAtividade(session.original.id, payload)
        : await createAtividade(payload);
      const affected = Number(response.data?.affectedRDOs || 0);
      if (affected > 0) {
        const names = (Array.isArray(response.data?.rdos) ? response.data.rdos : []).map((rdo) => rdo.numero_rdo || `RDO-${String(rdo.id).padStart(3, '0')}`).join(', ');
        await alert({ title: 'RDOs precisam de revisão', message: `${affected} RDO${affected === 1 ? '' : 's'} foram afetados pelo recálculo e precisam de correção.${names ? `\n\n${names}` : ''}`, confirmText: 'Entendi' });
      }
      // A gravação já terminou: uma falha na atualização da lista não deve
      // deixar o formulário disponível para repetir o POST.
      setSession(null); setDirty(false);
      success('Atividade salva com sucesso.');
      try {
        const list = await onSaved?.();
        if (another && !session.original && Array.isArray(list)) begin(null, session.draft.pai_id, list);
      } catch {
        notifyError('A atividade foi salva, mas a lista não pôde ser atualizada. Recarregue a EAP antes de continuar.', 9000);
      }
      return true;
    } catch (failure) {
      const message = failure.response?.data?.erro || 'Não foi possível salvar. Seus dados foram mantidos para tentar novamente.';
      setError(message);
      const details = Array.isArray(failure.response?.data?.detalhes) ? failure.response.data.detalhes : [];
      const fields = Object.fromEntries(details.filter((item) => item.path || item.param).map((item) => [item.path || item.param, item.msg]));
      if (/peso/i.test(message)) fields.peso_percentual_projeto = message;
      if (/data_fim_planejada/i.test(message)) fields.data_fim_planejada = message;
      if (/quantidade_total/i.test(message)) fields.quantidade_total = message;
      if (/valor_total_medicao/i.test(message)) fields.valor_total_medicao = message;
      if (/unidade/i.test(message)) fields.unidade_medida = message;
      setErrors(fields);
      setValidationAttempt((attempt) => attempt + 1);
      return false;
    } finally { submitting.current = false; setSaving(false); }
  };

  return { session, draft: session?.draft, dirty, saving, errors, validationAttempt, error, units, unitsError, loadUnits, begin, update, canDiscard, cancel, save };
}

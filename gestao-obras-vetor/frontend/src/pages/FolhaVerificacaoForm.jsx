import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import { addFolhaResposta, createFolhaVerificacao, getFolhasContexto, getModelosFolha } from '../services/api';
import './FolhasVerificacao.css';
import './FolhasVerificacaoChecklist.css';

const Help = ({ text }) => <span className="help-anchor"><span className="field-help" aria-label={`Ajuda: ${text}`} tabIndex="0">?</span><span className="help-popover" role="tooltip"><span className="help-popover-heading"><strong>Como preencher</strong></span><span>{text}</span></span></span>;
const Field = ({ label, helpText, children }) => <label><span className="label-help">{label}<Help text={helpText} /></span>{children}</label>;
const Toast = ({ notice, onClose }) => !notice ? null : <aside className={`folhas-toast folhas-toast--${notice.type || 'info'}`} role={notice.type === 'error' ? 'alert' : 'status'}><span>{notice.message}</span><button type="button" aria-label="Fechar aviso" onClick={onClose}>×</button></aside>;

export default function FolhaVerificacaoForm() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [context, setContext] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [naModal, setNaModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    modelo_id: '', codigo_lote: '', descricao_lote: '', area: '', populacao_total: '', unidade_populacao: 'estruturas', amostra_prevista: '', criterio_aceitacao: 'C_ZERO', maximo_nc: '0', atividade_eap_id: '', rdo_id: '', equipe: [],
    torque: {
      tipo_ligacao: '', fixador: '', componente: '', classe_material: '', condicao_montagem: '',
      expected: '', unidade: 'N·m', toleranceType: 'PERCENTUAL', tolerance: '',
      metodo_verificacao: '', fonte_requisito: '', documento_referencia: '', revisao_documento: '',
      instrumento: {}
    }
  });

  useEffect(() => {
    let active = true;
    setError('');
    getFolhasContexto(projetoId)
      .then((result) => active && setContext(result.data))
      .catch((requestError) => active && setError(requestError.response?.data?.erro || 'Não foi possível carregar os cadastros da obra.'));
    getModelosFolha()
      .then((result) => active && setModels(result.data || []))
      .catch((requestError) => active && setError(requestError.response?.data?.erro || 'Não foi possível carregar os modelos. Execute a migration de Folhas de Verificação e atualize a página.'));
    return () => { active = false; };
  }, [projetoId]);

  useEffect(() => {
    if (!toast && !error) return undefined;
    const timer = window.setTimeout(() => { setToast(null); setError(''); }, 6500);
    return () => window.clearTimeout(timer);
  }, [toast, error]);

  const model = useMemo(() => models.find((item) => String(item.id) === String(form.modelo_id)), [models, form.modelo_id]);
  const modelConfig = useMemo(() => {
    try { return typeof model?.configuracao === 'string' ? JSON.parse(model.configuracao) : (model?.configuracao || {}); } catch { return {}; }
  }, [model]);
  const isTorque = model?.tipo_folha === 'TORQUE';
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setTorque = (field, value) => setForm((current) => ({ ...current, torque: { ...current.torque, [field]: value } }));
  const selectAnswer = (item, resultado) => {
    if (resultado === 'NAO_APLICAVEL') {
      setNaModal({ item, justificativa: answers[item.chave]?.justificativa || '' });
      return;
    }
    setAnswers((current) => ({ ...current, [item.chave]: { item, resultado, justificativa: null } }));
    setToast({ type: resultado === 'CONFORME' ? 'success' : 'error', message: resultado === 'CONFORME' ? 'Item marcado como conforme.' : 'Item marcado como não conforme.' });
  };
  const confirmNotApplicable = () => {
    const justificativa = naModal?.justificativa?.trim();
    if (!justificativa) return;
    setAnswers((current) => ({ ...current, [naModal.item.chave]: { item: naModal.item, resultado: 'NAO_APLICAVEL', justificativa } }));
    setNaModal(null);
    setToast({ type: 'warning', message: 'Item marcado como não aplicável.' });
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        modelo_id: Number(form.modelo_id),
        populacao_total: Number(form.populacao_total || 0),
        amostra_prevista: Number(form.amostra_prevista || 0),
        maximo_nc: Number(form.maximo_nc || 0),
        atividade_eap_id: form.atividade_eap_id || null,
        rdo_id: form.rdo_id || null,
        identificacao: { codigo_lote: form.codigo_lote, descricao_lote: form.descricao_lote, area: form.area }
      };
      if (isTorque) payload.torque = form.torque;
      const created = await createFolhaVerificacao(projetoId, payload);
      await Promise.all(Object.values(answers).map((answer) => addFolhaResposta(created.data.id, answer)));
      navigate(`/projeto/${projetoId}/qualidade/folhas/${created.data.id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.erro || 'Não foi possível salvar a folha.');
    } finally {
      setSaving(false);
    }
  };

  return <><Navbar /><main className="container folhas-page">
    <header className="folhas-header"><div><p className="eyebrow">QUALIDADE / FOLHAS DE VERIFICAÇÃO</p><h1>Nova folha</h1><p>Escolha o modelo para abrir o formulário completo de preenchimento.</p></div></header>
    <Toast notice={error ? { type: 'error', message: error } : toast} onClose={() => { setError(''); setToast(null); }} />
    <form className="folha-form" onSubmit={submit}>
      <section><h2>1. Modelo e rastreabilidade <Help text="Selecione o modelo e identifique o lote, a atividade e o RDO que sustentam esta inspeção." /></h2><div className="folha-grid">
        <Field label="Modelo" helpText="Define se a folha é de montagem ou torque e carrega as verificações aplicáveis."><select required value={form.modelo_id} onChange={(e) => { setField('modelo_id', e.target.value); setAnswers({}); }}><option value="">Selecione um modelo</option>{models.map((item) => <option key={item.id} value={item.id}>{item.tipo_folha === 'TORQUE' ? 'FV-TOR' : 'FV-MON'} — {item.nome}</option>)}</select></Field>
        <Field label="Código do lote" helpText="Identificador usado para rastrear o conjunto de estruturas ou ligações inspecionado."><input required value={form.codigo_lote} onChange={(e) => setField('codigo_lote', e.target.value)} /></Field>
        <Field label="Descrição do lote" helpText="Descreva o que compõe o lote para facilitar consultas e auditorias."><input value={form.descricao_lote} onChange={(e) => setField('descricao_lote', e.target.value)} /></Field>
        <Field label="Área / setor / trecho" helpText="Informe a localização física do lote na obra."><input value={form.area} onChange={(e) => setField('area', e.target.value)} /></Field>
        <Field label="Atividade EAP" helpText="Vincula a inspeção à atividade da EAP, sem alterar o avanço físico."><select value={form.atividade_eap_id} onChange={(e) => setField('atividade_eap_id', e.target.value)}><option value="">Não vinculada</option>{context?.atividades?.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.atividade}</option>)}</select></Field>
        <Field label="RDO relacionado" helpText="Opcionalmente relaciona a folha ao Diário de Obra correspondente."><select value={form.rdo_id} onChange={(e) => setField('rdo_id', e.target.value)}><option value="">Não vinculado</option>{context?.rdos?.map((item) => <option key={item.id} value={item.id}>RDO {item.numero_rdo || item.id} — {item.data_relatorio}</option>)}</select></Field>
        <Field label="População total" helpText="Quantidade total de unidades disponíveis no lote."><input type="number" min="0" value={form.populacao_total} onChange={(e) => setField('populacao_total', e.target.value)} /></Field>
        <Field label="Amostra prevista" helpText="Quantidade mínima de pontos que deve ser registrada antes da conclusão."><input type="number" min="0" value={form.amostra_prevista} onChange={(e) => setField('amostra_prevista', e.target.value)} /></Field>
        <Field label="Critério de aceitação" helpText="Define como o resultado do lote é calculado a partir das não conformidades."><select value={form.criterio_aceitacao} onChange={(e) => setField('criterio_aceitacao', e.target.value)}><option value="C_ZERO">C=0</option><option value="MAX_NC">Quantidade máxima de NC</option><option value="CEM_PORCENTO">Inspeção 100%</option></select></Field>
      </div></section>
      {isTorque && <section><h2>2. Requisito e instrumento de torque <Help text="Informe o requisito técnico e os dados do instrumento que serão usados pelo servidor para validar as medições." /></h2><div className="folha-grid">
        <Field label="Tipo de ligação" helpText="Descreva a aplicação ou ligação que receberá torque."><input required value={form.torque.tipo_ligacao} onChange={(e) => setTorque('tipo_ligacao', e.target.value)} /></Field><Field label="Fixador" helpText="Identifique o fixador, por exemplo M12."><input value={form.torque.fixador} onChange={(e) => setTorque('fixador', e.target.value)} /></Field>
        <Field label="Componente" helpText="Informe o componente ou conjunto que receberá o torque."><input value={form.torque.componente} onChange={(e) => setTorque('componente', e.target.value)} /></Field><Field label="Classe / material" helpText="Registre a classe, resistência ou material do fixador."><input value={form.torque.classe_material} onChange={(e) => setTorque('classe_material', e.target.value)} /></Field>
        <Field label="Condição de montagem" helpText="Descreva a condição exigida, como seco, lubrificado ou com trava."><input value={form.torque.condicao_montagem} onChange={(e) => setTorque('condicao_montagem', e.target.value)} /></Field>
        <Field label="Torque esperado" helpText="Valor nominal definido pelo projeto, procedimento ou manual do fabricante."><input required type="number" step="0.000001" value={form.torque.expected} onChange={(e) => setTorque('expected', e.target.value)} /></Field><Field label="Unidade" helpText="Unidade em que o requisito e as medições serão registrados."><select value={form.torque.unidade} onChange={(e) => setTorque('unidade', e.target.value)}><option>N·m</option><option>lbf·ft</option><option>kgf·m</option></select></Field>
        <Field label="Tipo de tolerância" helpText="Escolha percentual, valor absoluto ou informe os limites diretamente."><select value={form.torque.toleranceType} onChange={(e) => setTorque('toleranceType', e.target.value)}><option value="PERCENTUAL">Percentual</option><option value="ABSOLUTA">Absoluta</option><option value="MANUAL">Limites manuais</option></select></Field>
        {form.torque.toleranceType !== 'MANUAL' ? <Field label="Tolerância" helpText="Margem aceita em torno do torque esperado; os limites são calculados no servidor."><input required type="number" step="0.000001" value={form.torque.tolerance} onChange={(e) => setTorque('tolerance', e.target.value)} /></Field> : <><Field label="Limite inferior" helpText="Menor torque aceitável para esta aplicação."><input required type="number" step="0.000001" onChange={(e) => setTorque('lowerLimit', e.target.value)} /></Field><Field label="Limite superior" helpText="Maior torque aceitável para esta aplicação."><input required type="number" step="0.000001" onChange={(e) => setTorque('upperLimit', e.target.value)} /></Field></>}
        <Field label="Método de verificação" helpText="Descreva como o torque será conferido."><input value={form.torque.metodo_verificacao} onChange={(e) => setTorque('metodo_verificacao', e.target.value)} /></Field><Field label="Fonte do requisito" helpText="Informe a origem do valor: projeto, procedimento ou fabricante."><input value={form.torque.fonte_requisito} onChange={(e) => setTorque('fonte_requisito', e.target.value)} /></Field>
        <Field label="Documento de referência" helpText="Informe o documento ou procedimento usado na inspeção."><input value={form.torque.documento_referencia} onChange={(e) => setTorque('documento_referencia', e.target.value)} /></Field><Field label="Revisão do documento" helpText="Informe a revisão vigente do documento."><input value={form.torque.revisao_documento} onChange={(e) => setTorque('revisao_documento', e.target.value)} /></Field>
        <Field label="Torquímetro / ativo" helpText="Selecione o ativo alocado na obra; seus dados são copiados para o histórico desta folha."><select onChange={(e) => setTorque('instrumento', context?.ativos?.find((item) => String(item.id) === e.target.value) || {})}><option value="">Selecionar ativo da obra</option>{context?.ativos?.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.nome}</option>)}</select></Field>
        <Field label="Patrimônio / série" helpText="Registre o patrimônio ou número de série confirmado no instrumento."><input onChange={(e) => setTorque('instrumento', { ...form.torque.instrumento, patrimonio_serie: e.target.value })} /></Field><Field label="Faixa mínima" helpText="Menor torque permitido pela faixa de operação do instrumento."><input type="number" step="0.000001" onChange={(e) => setTorque('instrumento', { ...form.torque.instrumento, rangeMin: e.target.value })} /></Field><Field label="Faixa máxima" helpText="Maior torque permitido pela faixa de operação do instrumento."><input type="number" step="0.000001" onChange={(e) => setTorque('instrumento', { ...form.torque.instrumento, rangeMax: e.target.value })} /></Field><Field label="Validade da calibração" helpText="Data até a qual o certificado de calibração é válido."><input type="date" onChange={(e) => setTorque('instrumento', { ...form.torque.instrumento, calibrationValidUntil: e.target.value })} /></Field>
      </div></section>}
      {(modelConfig.sections || []).map((section, sectionIndex) => <section key={section.title}><h2>{isTorque ? '3' : '2'}. {section.title} <Help text="Responda cada verificação antes de enviar a folha. Itens não aplicáveis exigem justificativa." /></h2><div className="checklist-grid">{section.items.map((label, itemIndex) => { const item = { chave: `${sectionIndex}-${itemIndex}`, rotulo: label, obrigatorio: true }; const selected = answers[item.chave]?.resultado; const visualStatus = selected === 'CONFORME' ? 'conforme' : selected === 'NAO_CONFORME' ? 'nao-conforme' : selected === 'NAO_APLICAVEL' ? 'nao-aplicavel' : 'pendente'; return <div className={`check-item check-item--${visualStatus}`} key={item.chave}><div className="check-item-title"><b>{label}</b><Help text="Marque Conforme quando o item atende ao requisito, NC quando houver desvio ou N/A quando não se aplicar com justificativa." /></div><span className="check-item-status">{selected === 'CONFORME' ? 'Conforme' : selected === 'NAO_CONFORME' ? 'Não conforme' : selected === 'NAO_APLICAVEL' ? 'Não aplicável' : 'Pendente'}</span><div><button type="button" className={selected === 'CONFORME' ? 'is-selected is-conforme' : ''} aria-pressed={selected === 'CONFORME'} onClick={() => selectAnswer(item, 'CONFORME')}>Conforme</button><button type="button" className={`danger-button ${selected === 'NAO_CONFORME' ? 'is-selected is-nao-conforme' : ''}`} aria-pressed={selected === 'NAO_CONFORME'} onClick={() => selectAnswer(item, 'NAO_CONFORME')}>NC</button><button type="button" className={selected === 'NAO_APLICAVEL' ? 'is-selected is-nao-aplicavel' : ''} aria-pressed={selected === 'NAO_APLICAVEL'} onClick={() => selectAnswer(item, 'NAO_APLICAVEL')}>N/A</button></div></div>; })}</div></section>)}
      {form.modelo_id && <section><h2>{isTorque ? '4' : '3'}. Pontos, medições e evidências <Help text="Depois de salvar a identificação, você registrará pontos, medições, fotos, correções, reinspeções e assinaturas na folha criada." /></h2><p className="folhas-empty">Após salvar a identificação, a folha abre em modo de preenchimento para registrar estruturas, medições, fotos, correções, reinspeções e assinaturas.</p></section>}
      <footer className="folha-actions"><button type="button" onClick={() => navigate(-1)}>Cancelar</button><button className="btn-primary" disabled={saving || !form.modelo_id}>{saving ? 'Salvando…' : 'Salvar e continuar preenchimento'}</button></footer>
    </form>
    <Modal open={Boolean(naModal)} title="Item não aplicável" onClose={() => setNaModal(null)}>
      <div className="folhas-na-modal">
        <p>Informe por que este item não se aplica ao lote. A justificativa ficará registrada no histórico da folha.</p>
        <label>Justificativa<textarea autoFocus rows="4" value={naModal?.justificativa || ''} onChange={(event) => setNaModal((current) => ({ ...current, justificativa: event.target.value }))} placeholder="Descreva o motivo..." /></label>
        <div className="folha-actions"><button type="button" onClick={() => setNaModal(null)}>Cancelar</button><button type="button" className="btn-primary" disabled={!naModal?.justificativa?.trim()} onClick={confirmNotApplicable}>Confirmar N/A</button></div>
      </div>
    </Modal>
  </main></>;
}

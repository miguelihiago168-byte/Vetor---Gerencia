import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Search, ShieldAlert, UserCheck, Users, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import { addFolhaResposta, createFolhaVerificacao, getFolhasContexto, getModelosFolha } from '../services/api';
import './FolhasVerificacao.css';
import './FolhasVerificacaoChecklist.css';

const Help = ({ text }) => <span className="help-anchor"><span className="field-help" aria-label={`Ajuda: ${text}`} tabIndex="0">?</span><span className="help-popover" role="tooltip"><span className="help-popover-heading"><strong>Como preencher</strong></span><span>{text}</span></span></span>;
const Field = ({ label, helpText, children }) => <label><span className="label-help">{label}<Help text={helpText} /></span>{children}</label>;
const Toast = ({ notice, onClose }) => !notice ? null : <aside className={`folhas-toast folhas-toast--${notice.type || 'info'}`} role={notice.type === 'error' ? 'alert' : 'status'}><span>{notice.message}</span><button type="button" aria-label="Fechar aviso" onClick={onClose}>×</button></aside>;
const defaultModalities = [{ codigo: 'CONFERENCIA_MONTAGEM', titulo: 'Conferência de montagem', usa_torque: false }, { codigo: 'TORQUE_ESTRUTURAL', titulo: 'Torque estrutural', usa_torque: true }];
const normalizeChecklistItem = (item) => typeof item === 'string' ? { rotulo: item, obrigatorio: true } : { rotulo: item?.rotulo || item?.label || '', obrigatorio: item?.obrigatorio !== false };

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';

const TeamPicker = ({ users = [], selected = [], onChange, responsibleId, inspectorId, onRoleChange }) => {
  const [query, setQuery] = useState('');
  const selectedIds = new Set(selected.map(Number));
  const chosen = users.filter((user) => selectedIds.has(Number(user.id)));
  const available = users.filter((user) => {
    const search = `${user.nome || ''} ${user.funcao || ''} ${user.perfil || ''}`.toLocaleLowerCase('pt-BR');
    return search.includes(query.trim().toLocaleLowerCase('pt-BR'));
  });
  const toggle = (id) => onChange(selectedIds.has(Number(id)) ? selected.filter((item) => Number(item) !== Number(id)) : [...selected, Number(id)]);
  return <section className="civil-team-card">
    <header className="civil-team-header"><span className="civil-team-icon"><Users size={21}/></span><div><span>EQUIPE DA ATIVIDADE</span><h2>Equipe e responsabilidades</h2><p>Defina quem executa, quem responde pela atividade e quem realiza a inspeção.</p></div><strong>{chosen.length}<small> integrante{chosen.length===1?'':'s'}</small></strong></header>
    <div className="civil-role-grid">
      <label className="civil-role-card"><span><UserCheck size={17}/><b>Responsável pela execução</b></span><select value={responsibleId} onChange={(event)=>onRoleChange('responsavel_execucao_id',event.target.value)}><option value="">Selecionar responsável</option>{users.map(user=><option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>
      <label className="civil-role-card"><span><ClipboardCheck size={17}/><b>Fiscal / Inspetor</b></span><select value={inspectorId} onChange={(event)=>onRoleChange('fiscal_inspetor_id',event.target.value)}><option value="">Selecionar fiscal ou inspetor</option>{users.map(user=><option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>
    </div>
    <div className="team-roster-heading"><div><b>Composição da equipe</b><small>Profissionais vinculados à execução em campo</small></div><details className="team-picker">
      <summary><Users size={15}/>{chosen.length ? 'Alterar equipe' : 'Adicionar integrantes'}</summary>
      <div className="team-picker-panel">
        <label className="team-search"><Search size={16}/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por nome ou função" aria-label="Pesquisar integrantes" /></label>
        <div className="team-options">
          {available.length ? available.map((user) => <label className="team-option" key={user.id}>
            <input type="checkbox" checked={selectedIds.has(Number(user.id))} onChange={() => toggle(user.id)} />
            <i className="team-avatar">{initials(user.nome)}</i><span><strong>{user.nome}</strong>{(user.funcao || user.perfil) && <small>{user.funcao || user.perfil}</small>}</span>
          </label>) : <p>Nenhum profissional encontrado.</p>}
        </div>
      </div>
    </details></div>
    <div className={`team-roster ${chosen.length ? '' : 'is-empty'}`}>
      {chosen.length ? chosen.map((user) => <article key={user.id}><i className="team-avatar">{initials(user.nome)}</i><div><strong>{user.nome}</strong><small>{user.funcao || user.perfil || 'Integrante da equipe'}</small></div><button type="button" aria-label={`Remover ${user.nome}`} onClick={() => toggle(user.id)}><X size={15}/></button></article>) : <div className="team-empty"><Users size={22}/><span><b>Nenhum integrante selecionado</b><small>Use “Adicionar integrantes” para compor a equipe desta atividade.</small></span></div>}
    </div>
  </section>;
};

const ChecklistSection = ({ section, sectionIndex, answers, setAnswers, selectAnswer, isCivil }) => {
  const items = (section.items || []).map((rawItem, itemIndex) => ({ ...normalizeChecklistItem(rawItem), chave:`${sectionIndex}-${itemIndex}` }));
  const results = items.map((item) => answers[item.chave]?.resultado || 'PENDENTE');
  const done = results.filter((result) => result !== 'PENDENTE').length;
  const conforming = results.filter((result) => result === 'CONFORME').length;
  const nonConforming = results.filter((result) => result === 'NAO_CONFORME').length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;
  return <section className="check-section">
    <header className="check-section-heading"><div className="check-section-title"><span>ETAPA {sectionIndex + 1}</span><h2>{section.title}</h2><p>{done} de {items.length} verificações respondidas</p></div><div className="check-section-summary"><span className="is-success"><CheckCircle2 size={14}/><b>{conforming}</b> conformes</span><span className="is-danger"><ShieldAlert size={14}/><b>{nonConforming}</b> desvios</span><strong>{progress}%</strong></div><div className="check-progress"><span style={{width:`${progress}%`}}/></div></header>
    <div className="checklist-grid">{items.map((configuredItem) => { const item={chave:configuredItem.chave,rotulo:configuredItem.rotulo,obrigatorio:configuredItem.obrigatorio}; const selected=answers[item.chave]?.resultado; const observation=answers[item.chave]?.observacao||''; const visualStatus=selected==='CONFORME'?'conforme':selected==='NAO_CONFORME'?'nao-conforme':selected==='NAO_APLICAVEL'?'nao-aplicavel':'pendente'; return <article className={`check-item check-item--${visualStatus}`} key={item.chave}><div className="check-item-top"><span className="check-item-index">{String(Number(item.chave.split('-')[1])+1).padStart(2,'0')}</span><div className="check-item-copy"><b>{configuredItem.rotulo}</b><span className="check-item-status">{selected==='CONFORME'?'Conforme':selected==='NAO_CONFORME'?'Não conforme':selected==='NAO_APLICAVEL'?'Não aplicável':'Aguardando verificação'}</span>{!configuredItem.obrigatorio&&<small>Opcional</small>}</div></div><div className="check-item-actions" role="group" aria-label={`Resultado de ${configuredItem.rotulo}`}><button type="button" className={selected==='CONFORME'?'is-selected is-conforme':''} aria-pressed={selected==='CONFORME'} onClick={()=>selectAnswer(item,'CONFORME')}>Conforme</button><button type="button" className={selected==='NAO_CONFORME'?'is-selected is-nao-conforme':''} aria-pressed={selected==='NAO_CONFORME'} onClick={()=>selectAnswer(item,'NAO_CONFORME')}>Não conforme</button><button type="button" className={selected==='NAO_APLICAVEL'?'is-selected is-nao-aplicavel':''} aria-pressed={selected==='NAO_APLICAVEL'} onClick={()=>selectAnswer(item,'NAO_APLICAVEL')}>N/A</button></div>{isCivil&&<details className="check-item-note" open={Boolean(observation)}><summary>{observation?'Observação registrada':'Adicionar observação técnica'}</summary><textarea rows="2" placeholder="Registre condições de campo, referências ou ressalvas relevantes" value={observation} onChange={event=>setAnswers(current=>({...current,[item.chave]:{...current[item.chave],item,resultado:current[item.chave]?.resultado||'PENDENTE',observacao:event.target.value}}))}/></details>}</article>})}</div>
  </section>;
};

export default function FolhaVerificacaoForm() {
  const { projetoId } = useParams();
  const navigate = useNavigate(); const [searchParams] = useSearchParams();
  const [models, setModels] = useState([]);
  const [context, setContext] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [naModal, setNaModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    modelo_id: '', modalidade: 'CONFERENCIA_MONTAGEM', codigo_lote: '', descricao_lote: '', area: '', empreendimento_tipo: '', sistema_eletrico: '', classe_tensao: '', tensao_nominal: '', corrente_nominal: '', setor: '', trecho: '', painel: '', equipamento: '', circuito: '', populacao_total: '', unidade_populacao: 'estruturas', amostra_prevista: '', criterio_aceitacao: 'C_ZERO', maximo_nc: '0', atividade_eap_id: '', rdo_id: '', equipe: [], cliente: '', atividade_executada: '', empresa_executante: '', responsavel_execucao_id: '', fiscal_inspetor_id: '', data_inspecao: '', hora_inspecao: '', documento_referencia: '', revisao_documento: '', procedimento_executivo: '',
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
  const mountingModes = useMemo(() => Array.isArray(modelConfig.modalidades) && modelConfig.modalidades.length ? modelConfig.modalidades : defaultModalities, [modelConfig]);
  const isTorque = model?.tipo_folha === 'TORQUE';
  const isElectrical = model?.tipo_folha === 'ELETRICA';
  const isCivil = model?.tipo_folha === 'CIVIL';
  const requestedType = ['MONTAGEM', 'ELETRICA', 'CIVIL'].includes(searchParams.get('tipo')) ? searchParams.get('tipo') : '';
  const isStructuralTorque = requestedType === 'MONTAGEM' && Boolean(mountingModes.find((item) => item.codigo === form.modalidade)?.usa_torque);
  const requiresTorque = isTorque || isStructuralTorque;
  const availableModels = requestedType ? models.filter((item) => item.tipo_folha === requestedType) : models.filter((item) => item.tipo_folha !== 'TORQUE');
  useEffect(() => {
    if (!requestedType || form.modelo_id || !availableModels.length) return;
    setField('modelo_id', String(availableModels[0].id));
  }, [requestedType, availableModels.length, form.modelo_id]);
  useEffect(() => {
    if (requestedType !== 'MONTAGEM' || mountingModes.some((item) => item.codigo === form.modalidade)) return;
    setField('modalidade', mountingModes[0]?.codigo || 'CONFERENCIA_MONTAGEM');
  }, [requestedType, mountingModes, form.modalidade]);
  useEffect(() => {
    if (!isCivil || !context?.projeto) return;
    setForm((current) => ({ ...current, cliente:current.cliente || context.projeto.empresa_responsavel || '', empresa_executante:current.empresa_executante || context.projeto.empresa_executante || '', data_inspecao:current.data_inspecao || new Date().toISOString().slice(0,10), hora_inspecao:current.hora_inspecao || new Date().toTimeString().slice(0,5) }));
  }, [isCivil, context?.projeto]);
  const checklistSections = useMemo(() => {
    const common = modelConfig.sections || [];
    if (!isElectrical || !form.empreendimento_tipo) return common;
    const key = form.empreendimento_tipo === 'FOTOVOLTAICA' ? 'FOTOVOLTAICA' : form.empreendimento_tipo === 'SUBESTACAO' ? 'SUBESTACAO' : form.empreendimento_tipo === 'LINHA_TRANSMISSAO' ? 'LINHA_TRANSMISSAO' : ['INDUSTRIAL', 'PREDIAL'].includes(form.empreendimento_tipo) ? 'PREDIAL_INDUSTRIAL' : null;
    const items = key ? modelConfig.requisitosEspecificos?.[key] || [] : [];
    return items.length ? [...common, { title: 'Requisitos específicos do empreendimento', items }] : common;
  }, [modelConfig, isElectrical, form.empreendimento_tipo]);
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setTorque = (field, value) => setForm((current) => ({ ...current, torque: { ...current.torque, [field]: value } }));
  const selectAnswer = (item, resultado) => {
    if (resultado === 'NAO_APLICAVEL') {
      setNaModal({ item, justificativa: answers[item.chave]?.justificativa || '' });
      return;
    }
    setAnswers((current) => ({ ...current, [item.chave]: { ...current[item.chave], item, resultado, justificativa: null } }));
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
        equipe: form.equipe.map((userId) => context?.usuarios?.find((user) => Number(user.id) === Number(userId))).filter(Boolean),
        identificacao: { codigo_lote: form.codigo_lote, descricao_lote: form.descricao_lote, area: form.area, modalidade: requestedType === 'MONTAGEM' ? form.modalidade : null, empreendimento_tipo: form.empreendimento_tipo, sistema_eletrico: form.sistema_eletrico, classe_tensao: form.classe_tensao, tensao_nominal: form.tensao_nominal, corrente_nominal: form.corrente_nominal, setor: form.setor, trecho: form.trecho, painel: form.painel, equipamento: form.equipamento, circuito: form.circuito, cliente:form.cliente, atividade_executada:form.atividade_executada, empresa_executante:form.empresa_executante, responsavel_execucao_id:form.responsavel_execucao_id||null, fiscal_inspetor_id:form.fiscal_inspetor_id||null, data_inspecao:form.data_inspecao, hora_inspecao:form.hora_inspecao, documento_referencia:form.documento_referencia, revisao_documento:form.revisao_documento, procedimento_executivo:form.procedimento_executivo }
      };
      if (requiresTorque) payload.torque = form.torque;
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
    <header className="folhas-header"><div><p className="eyebrow">QUALIDADE / FOLHAS DE VERIFICAÇÃO</p><h1>{requestedType === 'MONTAGEM' ? 'Nova FV-MON — Montagem' : requestedType === 'ELETRICA' ? 'Nova FV-ELE — Elétrica' : requestedType === 'CIVIL' ? 'Nova FV-CIV — Civil' : 'Nova folha'}</h1><p>{requestedType === 'MONTAGEM' ? 'Estruturas, componentes, fixações e torque estrutural.' : requestedType === 'ELETRICA' ? 'Circuitos, conexões, ensaios e requisitos elétricos.' : requestedType === 'CIVIL' ? 'Escavação, fundações, concretagem, drenagem e obras complementares.' : 'Escolha a frente para abrir o formulário completo.'}</p></div></header>
    <Toast notice={error ? { type: 'error', message: error } : toast} onClose={() => { setError(''); setToast(null); }} />
    <form className="folha-form" onSubmit={submit}>
      <section><h2>1. Modelo e rastreabilidade <Help text="Selecione o modelo e identifique o lote, a atividade e o RDO que sustentam esta inspeção." /></h2><div className="folha-grid">
        <Field label="Modelo" helpText="Carrega as verificações aplicáveis à disciplina."><select required value={form.modelo_id} onChange={(e) => { const selected = models.find((item) => String(item.id) === e.target.value); const config = typeof selected?.configuracao === 'string' ? JSON.parse(selected.configuracao || '{}') : selected?.configuracao || {}; setField('modelo_id', e.target.value); setField('criterio_aceitacao', config.criterio_padrao || 'C_ZERO'); setField('maximo_nc', String(config.maximo_nc_padrao ?? 0)); setAnswers({}); }}><option value="">Selecione um modelo</option>{availableModels.map((item) => <option key={item.id} value={item.id}>{item.tipo_folha === 'ELETRICA' ? 'FV-ELE' : item.tipo_folha === 'CIVIL' ? 'FV-CIV' : 'FV-MON'} — {item.nome}</option>)}</select></Field>
        {requestedType === 'MONTAGEM' && <Field label="Modalidade da verificação" helpText="Escolha o foco configurado neste modelo. Modalidades com torque habilitam o requisito técnico e o instrumento."><select value={form.modalidade} onChange={(e) => setField('modalidade', e.target.value)}>{mountingModes.map((item) => <option key={item.codigo} value={item.codigo}>{item.titulo}</option>)}</select></Field>}
        <Field label="Código do lote" helpText="Identificador usado para rastrear o conjunto de estruturas ou ligações inspecionado."><input required value={form.codigo_lote} onChange={(e) => setField('codigo_lote', e.target.value)} /></Field>
        <Field label="Descrição do lote" helpText="Descreva o que compõe o lote para facilitar consultas e auditorias."><input value={form.descricao_lote} onChange={(e) => setField('descricao_lote', e.target.value)} /></Field>
        <Field label="Área / setor / trecho" helpText="Informe a localização física do lote na obra."><input value={form.area} onChange={(e) => setField('area', e.target.value)} /></Field>
        <Field label="Atividade EAP" helpText="Vincula a inspeção à atividade da EAP, sem alterar o avanço físico."><select value={form.atividade_eap_id} onChange={(e) => setField('atividade_eap_id', e.target.value)}><option value="">Não vinculada</option>{context?.atividades?.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.atividade}</option>)}</select></Field>
        <Field label="RDO relacionado" helpText="Opcionalmente relaciona a folha ao Diário de Obra correspondente."><select value={form.rdo_id} onChange={(e) => setField('rdo_id', e.target.value)}><option value="">Não vinculado</option>{context?.rdos?.map((item) => <option key={item.id} value={item.id}>RDO {item.numero_rdo || item.id} — {item.data_relatorio}</option>)}</select></Field>
        <Field label="População total" helpText="Quantidade total de unidades disponíveis no lote."><input type="number" min="0" value={form.populacao_total} onChange={(e) => setField('populacao_total', e.target.value)} /></Field>
        <Field label="Amostra prevista" helpText="Quantidade mínima de pontos que deve ser registrada antes da conclusão."><input type="number" min="0" value={form.amostra_prevista} onChange={(e) => setField('amostra_prevista', e.target.value)} /></Field>
        <Field label="Critério de aceitação" helpText="Define como o resultado do lote é calculado a partir das não conformidades."><select value={form.criterio_aceitacao} onChange={(e) => setField('criterio_aceitacao', e.target.value)}><option value="C_ZERO">C=0</option><option value="MAX_NC">Quantidade máxima de NC</option><option value="CEM_PORCENTO">Inspeção 100%</option></select></Field>
        {isElectrical && <><Field label="Tipo de empreendimento" helpText="Adapta os requisitos específicos da FV-ELE."><select required value={form.empreendimento_tipo} onChange={e=>setField('empreendimento_tipo',e.target.value)}><option value="">Selecionar</option><option value="USINA_GERACAO">Usina de geração</option><option value="FOTOVOLTAICA">Usina fotovoltaica</option><option value="SUBESTACAO">Subestação</option><option value="LINHA_TRANSMISSAO">Torre/linha de transmissão</option><option value="INDUSTRIAL">Instalação industrial</option><option value="PREDIAL">Instalação predial</option></select></Field><Field label="Sistema elétrico" helpText="Sistema ou conjunto inspecionado."><input value={form.sistema_eletrico} onChange={e=>setField('sistema_eletrico',e.target.value)}/></Field><Field label="Classe de tensão"><input value={form.classe_tensao} onChange={e=>setField('classe_tensao',e.target.value)}/></Field><Field label="Tensão nominal"><input type="number" value={form.tensao_nominal} onChange={e=>setField('tensao_nominal',e.target.value)}/></Field><Field label="Circuito / painel"><input value={form.circuito} onChange={e=>setField('circuito',e.target.value)}/></Field></>}
        {isCivil && <><Field label="Cliente"><input value={form.cliente} onChange={e=>setField('cliente',e.target.value)}/></Field><Field label="Atividade executada"><input required value={form.atividade_executada} onChange={e=>setField('atividade_executada',e.target.value)}/></Field><Field label="Empresa executante"><input value={form.empresa_executante} onChange={e=>setField('empresa_executante',e.target.value)}/></Field><Field label="Data da inspeção"><input type="date" value={form.data_inspecao} onChange={e=>setField('data_inspecao',e.target.value)}/></Field><Field label="Hora da inspeção"><input type="time" value={form.hora_inspecao} onChange={e=>setField('hora_inspecao',e.target.value)}/></Field><Field label="Documento / projeto de referência"><input value={form.documento_referencia} onChange={e=>setField('documento_referencia',e.target.value)}/></Field><Field label="Revisão do documento"><input value={form.revisao_documento} onChange={e=>setField('revisao_documento',e.target.value)}/></Field><Field label="Procedimento executivo"><input value={form.procedimento_executivo} onChange={e=>setField('procedimento_executivo',e.target.value)}/></Field><TeamPicker users={context?.usuarios||[]} selected={form.equipe} onChange={(value)=>setField('equipe',value)} responsibleId={form.responsavel_execucao_id} inspectorId={form.fiscal_inspetor_id} onRoleChange={setField}/></>}
      </div></section>
      {requiresTorque && <section><h2>2. Requisito e instrumento de torque <Help text="Informe o requisito técnico e os dados do instrumento que serão usados pelo servidor para validar as medições." /></h2><div className="folha-grid">
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
      {checklistSections.map((section, sectionIndex) => <ChecklistSection key={section.title} section={section} sectionIndex={sectionIndex} answers={answers} setAnswers={setAnswers} selectAnswer={selectAnswer} isCivil={isCivil}/>)}
      {form.modelo_id && <section><h2>{requiresTorque ? '4' : '3'}. Pontos, medições e evidências <Help text="Depois de salvar a identificação, você registrará pontos, medições, fotos, correções, reinspeções e assinaturas na folha criada." /></h2><p className="folhas-empty">Após salvar a identificação, a folha abre em modo de preenchimento para registrar estruturas, medições, fotos, correções, reinspeções e assinaturas.</p></section>}
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

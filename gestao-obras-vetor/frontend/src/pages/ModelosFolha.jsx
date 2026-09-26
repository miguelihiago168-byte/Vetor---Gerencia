import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, FilePlus2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { createModeloFolha, getModelosFolha, updateModeloFolha } from '../services/api';
import './FolhasVerificacao.css';
import './FolhasVerificacaoChecklist.css';
import './ModelosFolha.css';

const defaultMontagemModalities = [
  { codigo: 'CONFERENCIA_MONTAGEM', titulo: 'Conferência de montagem', usa_torque: false },
  { codigo: 'TORQUE_ESTRUTURAL', titulo: 'Torque estrutural', usa_torque: true }
];
const electricalTestTypes = ['CONTINUIDADE', 'CONTINUIDADE_PE', 'RESISTENCIA_ISOLACAO', 'RESISTENCIA_ATERRAMENTO', 'POLARIDADE', 'SEQUENCIA_FASES', 'TENSAO', 'CORRENTE', 'TESTE_FUNCIONAL', 'DR_RCD', 'INTERTRAVAMENTO', 'COMANDO', 'PROTECAO', 'SINALIZACAO'];
const defaultModalitiesFor = (type) => type === 'MONTAGEM' ? defaultMontagemModalities : [];
const newSection = () => ({ id: crypto.randomUUID(), titulo: '', optional: false, items: [] });
const emptyEditor = (type = 'MONTAGEM') => ({ codigo: '', nome: '', descricao: '', criterio_padrao: 'C_ZERO', maximo_nc_padrao: 0, modalidades: defaultModalitiesFor(type), ensaios_obrigatorios: [], sections: [newSection()] });
const parseConfig = (value) => { try { return typeof value === 'string' ? JSON.parse(value || '{}') : (value || {}); } catch { return {}; } };
const normalizeItem = (item) => typeof item === 'string' ? { id: crypto.randomUUID(), rotulo: item, obrigatorio: true } : { id: crypto.randomUUID(), rotulo: item?.rotulo || item?.label || '', obrigatorio: item?.obrigatorio !== false };
const Help = ({ text }) => <span className="help-anchor"><span className="field-help" aria-label={`Ajuda: ${text}`} tabIndex="0">?</span><span className="help-popover" role="tooltip"><span className="help-popover-heading"><strong>Como preencher</strong></span><span>{text}</span></span></span>;

export default function ModelosFolha() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [models, setModels] = useState([]);
  const requestedModelType = ['MONTAGEM','ELETRICA','CIVIL'].includes(new URLSearchParams(location.search).get('tipo')) ? new URLSearchParams(location.search).get('tipo') : 'MONTAGEM';
  const [modelType, setModelType] = useState(requestedModelType);
  const [editor, setEditor] = useState(() => emptyEditor(requestedModelType));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isElectrical = modelType === 'ELETRICA';
  const isCivil = modelType === 'CIVIL';
  const typeName = isElectrical ? 'Elétrica' : isCivil ? 'Civil' : 'Montagem';
  const modelsForType = useMemo(() => models.filter((model) => model.tipo_folha === modelType), [models, modelType]);

  const load = async () => {
    setLoading(true); setError('');
    try { const response = await getModelosFolha(); setModels(Array.isArray(response.data) ? response.data : []); }
    catch (requestError) { setError(requestError.response?.data?.erro || 'Não foi possível carregar os modelos.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const changeSection = (sectionId, changes) => setEditor((current) => ({ ...current, sections: current.sections.map((section) => section.id === sectionId ? { ...section, ...changes } : section) }));
  const addItem = (sectionId) => changeSection(sectionId, { items: editor.sections.find((section) => section.id === sectionId).items.concat({ id: crypto.randomUUID(), rotulo: '', obrigatorio: true }) });
  const changeItem = (sectionId, itemId, changes) => changeSection(sectionId, { items: editor.sections.find((section) => section.id === sectionId).items.map((item) => item.id === itemId ? { ...item, ...changes } : item) });
  const removeItem = (sectionId, itemId) => changeSection(sectionId, { items: editor.sections.find((section) => section.id === sectionId).items.filter((item) => item.id !== itemId) });
  const removeSection = (sectionId) => setEditor((current) => ({ ...current, sections: current.sections.filter((section) => section.id !== sectionId) }));
  const changeMode = (index, changes) => setEditor((current) => ({ ...current, modalidades: current.modalidades.map((mode, position) => position === index ? { ...mode, ...changes } : mode) }));
  const changeTest = (index, changes) => setEditor((current) => ({ ...current, ensaios_obrigatorios: current.ensaios_obrigatorios.map((test, position) => position === index ? { ...test, ...changes } : test) }));

  const startEditing = (model) => {
    const config = parseConfig(model.configuracao);
    setModelType(model.tipo_folha);
    setEditingId(model.id);
    setEditor({
      codigo: model.codigo, nome: model.nome, descricao: model.descricao || '',
      criterio_padrao: config.criterio_padrao || 'C_ZERO', maximo_nc_padrao: config.maximo_nc_padrao ?? 0,
      modalidades: Array.isArray(config.modalidades) && config.modalidades.length ? config.modalidades : defaultModalitiesFor(model.tipo_folha),
      ensaios_obrigatorios: Array.isArray(config.ensaios_obrigatorios) ? config.ensaios_obrigatorios : [],
      sections: (config.sections || []).map((section) => ({ id: crypto.randomUUID(), titulo: section.title || section.titulo || '', optional:Boolean(section.optional), items: (section.items || []).map(normalizeItem) })) || [newSection()]
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const resetEditor = (type = modelType) => { setEditingId(null); setEditor(emptyEditor(type)); setError(''); };
  const submit = async (event) => {
    event.preventDefault(); setError('');
    const sections = editor.sections.map((section) => ({ title: section.titulo.trim(), optional:Boolean(section.optional), items: section.items.filter((item) => item.rotulo.trim()).map((item) => ({ rotulo: item.rotulo.trim(), obrigatorio: Boolean(item.obrigatorio) })) })).filter((section) => section.title && section.items.length);
    const modalidades = editor.modalidades.map((mode) => ({ codigo: mode.codigo.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'), titulo: mode.titulo.trim(), usa_torque: Boolean(mode.usa_torque) })).filter((mode) => mode.codigo && mode.titulo);
    const ensaiosObrigatorios = editor.ensaios_obrigatorios.map((test) => ({ tipo: test.tipo, obrigatorio: Boolean(test.obrigatorio), exige_instrumento: Boolean(test.exige_instrumento) })).filter((test) => test.tipo);
    if (!editor.codigo.trim() || !editor.nome.trim() || !sections.length || (modelType === 'MONTAGEM' && !modalidades.length)) { setError(modelType === 'MONTAGEM' ? 'Informe código, nome, ao menos uma seção com item e uma modalidade.' : 'Informe código, nome e ao menos uma seção com item.'); return; }
    const configuration = { sections, modalidades, ensaios_obrigatorios: ensaiosObrigatorios, criterio_padrao: editor.criterio_padrao, maximo_nc_padrao: Number(editor.maximo_nc_padrao || 0), torqueIntegrado: modalidades.some((mode) => mode.usa_torque) };
    setSaving(true);
    try {
      if (editingId) await updateModeloFolha(editingId, { nome: editor.nome.trim(), descricao: editor.descricao.trim() || null, configuracao: configuration, ativo: true });
      else {
        const categoryId = modelsForType[0]?.categoria_id;
        if (!categoryId) throw new Error(`Não há uma categoria de ${typeName} disponível para este tenant.`);
        await createModeloFolha({ codigo: editor.codigo.trim(), nome: editor.nome.trim(), descricao: editor.descricao.trim() || null, categoria_id: Number(categoryId), tipo_folha: modelType, configuracao: configuration });
      }
      resetEditor(); await load();
    } catch (requestError) { setError(requestError.response?.data?.erro || requestError.message || 'Não foi possível salvar o modelo.'); }
    finally { setSaving(false); }
  };

  return <><Navbar /><main className="container folhas-page modelos-page">
    <header className="folhas-header modelos-header"><div><p className="eyebrow">QUALIDADE / MODELOS / {typeName.toUpperCase()}</p><h1>Construtor de modelos {isElectrical ? 'elétricos' : isCivil ? 'civis' : 'de montagem'}</h1><p>{isElectrical ? 'Defina os requisitos, ensaios e instrumentos que a equipe deverá comprovar em campo.' : 'Monte um roteiro de inspeção que a equipe consiga executar em campo, sem depender de código.'}</p><div className="model-type-switch" role="tablist" aria-label="Frente dos modelos"><button type="button" role="tab" aria-selected={modelType==='MONTAGEM'} className={modelType==='MONTAGEM' ? 'active' : ''} onClick={() => { setModelType('MONTAGEM'); resetEditor('MONTAGEM'); }}>Montagem</button><button type="button" role="tab" aria-selected={isElectrical} className={isElectrical ? 'active' : ''} onClick={() => { setModelType('ELETRICA'); resetEditor('ELETRICA'); }}>Elétrica</button><button type="button" role="tab" aria-selected={isCivil} className={isCivil ? 'active' : ''} onClick={() => { setModelType('CIVIL'); resetEditor('CIVIL'); }}>Civil</button></div><div className="model-stepper"><span><b>1</b> Definição</span><i/><span><b>2</b> {isElectrical ? 'Ensaios' : isCivil ? 'Seções' : 'Modalidades'}</span><i/><span><b>3</b> Checklist</span></div></div><div className="header-actions"><button type="button" onClick={() => navigate(`/projeto/${projetoId}/qualidade/folhas`)}><ArrowLeft size={16}/> Voltar</button><button type="button" onClick={load} disabled={loading}><RefreshCw size={16}/> Atualizar</button></div></header>
    {error && <div className="folhas-error" role="alert">{error}</div>}
    <form className="folha-form model-builder" onSubmit={submit}>
      <section className="model-step model-step--definition"><div className="model-builder-heading"><div><span className="model-step-number">01</span><h2>{editingId ? 'Editar modelo' : 'Nome e regra de aceitação'} <Help text="Um modelo é o roteiro reutilizável da inspeção. Crie um para cada tipo de empreendimento que tenha requisitos diferentes." /></h2><p>Comece dando um nome claro para a equipe encontrar o modelo certo.</p></div>{editingId && <button type="button" onClick={resetEditor}>Cancelar edição</button>}</div><div className="folha-grid"><label><span className="label-help">Código <Help text="Identificador único do modelo. Depois de criado, o código não muda." /></span><input required value={editor.codigo} disabled={Boolean(editingId)} onChange={(event) => setEditor((current) => ({ ...current, codigo: event.target.value }))} placeholder={isElectrical ? 'Ex.: FV-ELE-PAINEIS' : 'Ex.: FV-MON-EQUIP'} /></label><label><span className="label-help">Nome <Help text="Nome que aparecerá para quem abrir uma nova folha. Diga claramente o que será inspecionado." /></span><input required value={editor.nome} onChange={(event) => setEditor((current) => ({ ...current, nome: event.target.value }))} placeholder={isElectrical ? 'Ex.: Painéis e circuitos de força' : 'Ex.: Montagem de equipamentos'} /></label><label className="field-wide"><span className="label-help">Descrição <Help text="Explique quando este modelo deve ser escolhido pela equipe." /></span><textarea rows="2" value={editor.descricao} onChange={(event) => setEditor((current) => ({ ...current, descricao: event.target.value }))} placeholder={isElectrical ? 'Ex.: Utilizar em painéis, circuitos, ensaios e liberação elétrica.' : 'Ex.: Utilizar na instalação, alinhamento e liberação de conjuntos motobomba.'} /></label><label><span className="label-help">Critério padrão <Help text="C=0 reprova com qualquer não conformidade. Máximo de NC permite uma quantidade definida. Inspeção 100% exige verificar toda a população." /></span><select value={editor.criterio_padrao} onChange={(event) => setEditor((current) => ({ ...current, criterio_padrao: event.target.value }))}><option value="C_ZERO">C=0 — nenhuma NC aceita</option><option value="MAX_NC">Quantidade máxima de NC</option><option value="CEM_PORCENTO">Inspeção 100%</option></select></label>{editor.criterio_padrao === 'MAX_NC' && <label><span className="label-help">Máximo de NC <Help text="Quantidade de itens não conformes que ainda pode ser aceita para este modelo." /></span><input type="number" min="0" value={editor.maximo_nc_padrao} onChange={(event) => setEditor((current) => ({ ...current, maximo_nc_padrao: event.target.value }))} /></label>}</div></section>
      {!isElectrical && !isCivil && <section className="model-step model-step--modes"><div className="model-builder-heading"><div><span className="model-step-number">02</span><h2>Modalidades <Help text="São as opções que o inspetor verá ao criar uma FV-MON deste modelo. Use uma modalidade por foco de inspeção." /></h2><p>Defina se a equipe fará uma conferência geral ou uma inspeção com torque.</p></div></div><div className="model-modes">{editor.modalidades.map((mode, index) => <div className="model-mode" key={`${mode.codigo}-${index}`}><input className="model-mode-code" aria-label="Código da modalidade" title="Código interno: use letras, números e sublinhado" value={mode.codigo} placeholder="CÓDIGO" onChange={(event) => changeMode(index, { codigo: event.target.value })}/><input className="model-mode-title" aria-label="Nome da modalidade" title="Nome exibido ao inspetor" value={mode.titulo} placeholder="Ex.: Conferência de montagem" onChange={(event) => changeMode(index, { titulo: event.target.value })}/><label className="model-torque-toggle"><input type="checkbox" checked={Boolean(mode.usa_torque)} onChange={(event) => changeMode(index, { usa_torque: event.target.checked })}/><span>Usa torque</span><Help text="Quando marcado, a folha pedirá torque nominal, tolerância, documento de referência e torquímetro calibrado." /></label><button type="button" aria-label="Remover modalidade" onClick={() => setEditor((current) => ({ ...current, modalidades: current.modalidades.filter((_, position) => position !== index) }))}><Trash2 size={16}/></button></div>)}</div><button type="button" className="model-add" onClick={() => setEditor((current) => ({ ...current, modalidades: current.modalidades.concat({ codigo: '', titulo: '', usa_torque: false }) }))}><Plus size={16}/> Adicionar modalidade</button></section>}
      {isElectrical && <section className="model-step model-step--modes electrical-tests-builder"><div className="model-builder-heading"><div><span className="model-step-number">02</span><h2>Ensaios e instrumentos <Help text="Cadastre os ensaios que devem aparecer neste tipo de folha elétrica. Os obrigatórios serão conferidos pelo sistema antes da aprovação." /></h2><p>Use somente ensaios aplicáveis ao equipamento, circuito ou empreendimento deste modelo.</p></div></div><div className="electrical-test-list">{editor.ensaios_obrigatorios.map((test, index) => <div className="electrical-test-row" key={`${test.tipo}-${index}`}><select aria-label="Tipo de ensaio" value={test.tipo} onChange={(event) => changeTest(index, { tipo: event.target.value })}>{electricalTestTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select><label className="model-required-toggle"><input type="checkbox" checked={Boolean(test.obrigatorio)} onChange={(event) => changeTest(index, { obrigatorio: event.target.checked })}/><span>Obrigatório</span><Help text="O ensaio precisa ser registrado com resultado conforme antes que a folha possa ser aprovada." /></label><label className="model-required-toggle"><input type="checkbox" checked={Boolean(test.exige_instrumento)} onChange={(event) => changeTest(index, { exige_instrumento: event.target.checked })}/><span>Exige instrumento</span><Help text="Exige o registro de um instrumento com calibração válida no ensaio." /></label><button type="button" aria-label="Remover ensaio" onClick={() => setEditor((current) => ({ ...current, ensaios_obrigatorios: current.ensaios_obrigatorios.filter((_, position) => position !== index) }))}><Trash2 size={16}/></button></div>)}</div><button type="button" className="model-add" onClick={() => setEditor((current) => ({ ...current, ensaios_obrigatorios: current.ensaios_obrigatorios.concat({ tipo: 'CONTINUIDADE', obrigatorio: true, exige_instrumento: false }) }))}><Plus size={16}/> Adicionar ensaio</button></section>}
      <section className="model-step model-step--checklist"><div className="model-builder-heading"><div><span className="model-step-number">03</span><h2>Checklist de verificação <Help text="Seções organizam o formulário; os itens são as perguntas ou requisitos que o inspetor responderá em campo." /></h2><p>Crie perguntas simples, objetivas e observáveis em campo.</p></div><button type="button" className="model-add" onClick={() => setEditor((current) => ({ ...current, sections: current.sections.concat(newSection()) }))}><Plus size={16}/> Adicionar seção</button></div><div className="model-sections">{editor.sections.map((section, sectionIndex) => <article className="model-section" key={section.id}><header><strong>Seção {sectionIndex + 1}</strong><button type="button" aria-label="Remover seção" onClick={() => removeSection(section.id)}><Trash2 size={16}/></button></header><input required aria-label={`Nome da seção ${sectionIndex + 1}`} placeholder="Ex.: Posicionamento e fixações" value={section.titulo} onChange={(event) => changeSection(section.id, { titulo: event.target.value })}/><div className="model-items">{section.items.map((item) => <div key={item.id}><input aria-label="Item de verificação" placeholder="Ex.: Fixadores completamente instalados" value={item.rotulo} onChange={(event) => changeItem(section.id, item.id, { rotulo: event.target.value })}/><label className="model-required-toggle"><input type="checkbox" checked={item.obrigatorio} onChange={(event) => changeItem(section.id, item.id, { obrigatorio: event.target.checked })}/><span>Obrigatório</span><Help text="Itens obrigatórios precisam receber Conforme, NC ou N/A com justificativa antes do envio. Desmarque somente para informações de apoio." /></label><button type="button" aria-label="Remover item" onClick={() => removeItem(section.id, item.id)}><Trash2 size={16}/></button></div>)}</div><button type="button" className="model-add" onClick={() => addItem(section.id)}><Plus size={15}/> Adicionar item</button></article>)}</div></section>
      <footer className="folha-actions"><button type="button" onClick={resetEditor}>Limpar</button><button className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : <><Save size={16}/>{editingId ? 'Salvar alterações' : 'Criar modelo'}</>}</button></footer>
    </form>
    <section className="folhas-list-card"><div className="folhas-list-head"><h2>Modelos {isElectrical ? 'elétricos' : isCivil ? 'civis' : 'de montagem'} disponíveis</h2><span>{modelsForType.length} modelo(s)</span></div>{loading ? <p className="folhas-empty">Carregando modelos…</p> : modelsForType.length === 0 ? <p className="folhas-empty">Nenhum modelo de {typeName.toLowerCase()} disponível.</p> : modelsForType.map((model) => { const config = parseConfig(model.configuracao); const sections = config.sections || []; const tests = config.ensaios_obrigatorios || []; return <article className="model-card model-card--expanded" key={model.id}><div className="model-card-heading"><div><b>{model.codigo}</b><h3>{model.nome}</h3><span>{model.descricao || `Modelo de ${typeName.toLowerCase()} configurável`}</span></div><span className="model-active-badge"><CheckCircle2 size={15}/> Disponível</span></div><div className="model-summary"><span>{sections.length} seção(ões)</span><span>{sections.reduce((total, section) => total + (section.items?.length || 0), 0)} item(ns)</span>{isElectrical ? <span>{tests.length} ensaio(s) configurado(s)</span> : !isCivil && <span>{(config.modalidades || defaultModalitiesFor('MONTAGEM')).map((mode) => mode.titulo).join(' · ')}</span>}<button type="button" onClick={() => startEditing(model)}>Editar modelo</button></div></article>; })}</section>
  </main></>;
}

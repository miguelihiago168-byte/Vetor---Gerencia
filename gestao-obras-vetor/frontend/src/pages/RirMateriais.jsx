import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Camera, ClipboardList, FileDown, FileText, ImagePlus, PackageCheck, Pencil, Plus, Search, Trash2, Truck, Upload, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { createRir, updateRir, getRir, getRirs, getRirPdf, getRirAnexo, uploadRirAnexo, deleteRirAnexo } from '../services/api';
import { resumoQuantidade } from './rirQuantidades';
import RastreabilidadeMateriais from './RastreabilidadeMateriais';
import './RastreabilidadeMateriais.css';
import './RirMateriais.css';

const groups = [
  { title: 'Identificação do recebimento', description: 'Informe os dados que identificam a carga.', icon: ClipboardList, fields: [['fornecedor','Fornecedor'],['data','Data do recebimento','date'],['pedido_compra','Pedido de compra'],['nota_fiscal','Nota fiscal'],['romaneio','Romaneio']] },
  { title: 'Transporte e descarga', description: 'Registre as condições da carga na chegada.', icon: Truck, fields: [['veiculo','Veículo'],['placa_veiculo','Placa do veículo'],['placa_carreta','Placa da carreta'],['motorista','Motorista'],['transportadora','Transportadora'],['situacao_carga','Situação da carga'],['condicoes_descarga','Condições de descarga'],['equipamentos','Equipamentos utilizados']] }
];
const conclusion = [['conformidade','Conformidade'],['conclusao','Conclusão','textarea'],['observacoes','Observações','textarea']];
const blank = () => ({ dados: {}, itens: [], anexos: [] });
const fmt = value => value == null || value === '' ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(Number(value));
const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : value || 'Data não informada';
const message = (error, fallback) => typeof error.response?.data?.erro === 'string' ? error.response.data.erro : fallback;

function SectionHeading({ icon: Icon, title, description, aside }) {
  return <div className="rir-section-heading"><span className="rir-section-icon"><Icon size={19}/></span><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{aside && <span className="rir-section-count">{aside}</span>}</div>;
}

function Fields({ fields, values, editing, onChange }) {
  return <div className="rir-fields">{fields.map(([key, label, type]) => <label className={type === 'textarea' ? 'rir-field-wide' : ''} key={key}><span>{label}</span>{editing ? type === 'textarea' ? <textarea className="form-textarea" rows="3" value={values?.[key] ?? ''} onChange={event => onChange(key, event.target.value)}/> : <input className="form-input" type={type || 'text'} value={values?.[key] ?? ''} onChange={event => onChange(key, event.target.value)}/> : <strong>{values?.[key] === '' || values?.[key] == null ? '—' : type === 'date' ? dateLabel(values[key]) : values[key]}</strong>}</label>)}</div>;
}

// Thumbnails use the authenticated RIR endpoint, not a public uploads URL.
function PhotoCard({ reportId, attachment, canRemove, onRemove, busy }) {
  const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl;
    setUrl(''); setFailed(false);
    getRirAnexo(reportId, attachment.id).then(response => { if (!active) return; objectUrl = URL.createObjectURL(response.data); setUrl(objectUrl); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [reportId, attachment.id]);
  return <article className="rir-photo-card"><div className="rir-photo-preview">{url && !failed ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Ampliar ${attachment.legenda || attachment.nome}`}><img src={url} alt={attachment.legenda || attachment.nome} onError={() => setFailed(true)}/></a> : <div className="rir-preview-placeholder"><Camera size={24}/><span>{failed ? 'Não foi possível carregar a foto' : 'Carregando foto...'}</span></div>}</div><div className="rir-photo-info"><strong title={attachment.legenda || attachment.nome}>{attachment.legenda || attachment.nome}</strong><span title={attachment.nome}>{attachment.nome}</span>{canRemove && <button type="button" disabled={busy} onClick={() => onRemove(attachment)}><Trash2 size={14}/> Remover</button>}</div></article>;
}

function PendingFile({ entry, onChange, onRemove }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (!entry.file.type.startsWith('image/')) return undefined; const next = URL.createObjectURL(entry.file); setUrl(next); return () => URL.revokeObjectURL(next); }, [entry.file]);
  return <article className="rir-pending-file">{url ? <img src={url} alt="Prévia do arquivo selecionado"/> : <span className="rir-pending-file-icon"><FileText size={22}/></span>}<div><strong title={entry.file.name}>{entry.file.name}</strong><label>Legenda <span>(opcional)</span><input className="form-input" value={entry.caption} placeholder="Descreva o arquivo" onChange={event => onChange(entry.key, event.target.value)}/></label></div><button type="button" aria-label={`Remover ${entry.file.name} da seleção`} onClick={() => onRemove(entry.key)}><X size={17}/></button></article>;
}

export default function RirMateriais() {
  const { projetoId } = useParams(); const navigate = useNavigate(); const { perfil } = useAuth();
  const [legacy, setLegacy] = useState(false); const [reports, setReports] = useState([]);
  const [current, setCurrent] = useState(null); const [editing, setEditing] = useState(false); const [loading, setLoading] = useState(true); const [loadFailed, setLoadFailed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [query, setQuery] = useState('');
  const [pending, setPending] = useState([]); const fileRef = useRef(null); const sequence = useRef(0); const itemSequence = useRef(0);
  const canEdit = ['ADM','Gestor Geral','Gestor da Qualidade','Gestor de Qualidade','Almoxarife'].includes(perfil);
  const load = async () => { const r = await getRirs(projetoId); setReports(r.data); };
  const refresh = async () => { setLoading(true); setError(''); try { await load(); setLoadFailed(false); } catch(e) { setLoadFailed(true); setError(message(e, 'Não foi possível carregar os relatórios.')); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, [projetoId]);
  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase('pt-BR'); return reports.filter(r => !term || [r.id, r.dados?.fornecedor, r.dados?.nota_fiscal, r.dados?.romaneio].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term))); }, [reports, query]);
  const leave = () => !editing && !pending.length || window.confirm('Há alterações ou arquivos ainda não salvos. Deseja sair mesmo assim?');
  const backToList = () => { if (busy || !leave()) return; setCurrent(null); setEditing(false); setPending([]); setError(''); setNotice(''); };
  const open = async id => { try { setBusy(true); setError(''); setNotice(''); setPending([]); const report = (await getRir(id)).data; setCurrent(report); setEditing(false); } catch(e) { setError(message(e, 'Não foi possível abrir o RIR.')); } finally { setBusy(false); } };
  const updateItem = (index, key, value) => setCurrent(c => ({ ...c, itens: c.itens.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const addItem = () => setCurrent(c => ({ ...c, itens:[...c.itens, { _key: `novo-${++itemSequence.current}`, codigo:'', descricao:'', quantidade:'', quantidade_recebida:'', quantidade_total:'', unidade:'' }] }));
  const addFiles = event => {
    const selected = [...(event.target.files || [])]; event.target.value = '';
    const allowed = selected.filter(file => ['image/jpeg','image/png','application/pdf'].includes(file.type) && file.size <= 25 * 1024 * 1024);
    if (allowed.length !== selected.length) setError('Alguns arquivos não foram selecionados. Use JPEG, PNG ou PDF de até 25 MB cada.'); else setError('');
    setPending(previous => [...previous, ...allowed.map(file => ({ key: ++sequence.current, file, caption: '' }))]);
  };
  const sendPending = async (report, queue) => {
    let updated = report;
    for (const entry of queue) {
      const data = new FormData(); data.append('arquivo', entry.file); data.append('legenda', entry.caption);
      try { updated = (await uploadRirAnexo(report.id, data)).data; setCurrent(updated); setPending(previous => previous.filter(item => item.key !== entry.key)); }
      catch (e) { throw new Error(message(e, `Não foi possível anexar ${entry.file.name}.`)); }
    }
    return updated;
  };
  const save = async event => {
    event.preventDefault(); if (!current.itens.length) { setError('Adicione pelo menos um item ao RIR.'); return; }
    setBusy(true); setError(''); setNotice(''); let saved;
    try { saved = (current.id ? await updateRir(current.id, current) : await createRir({ ...current, projeto_id: Number(projetoId) })).data; setCurrent(saved); setEditing(false); }
    catch (err) { setError(message(err, 'Não foi possível salvar o RIR.')); setBusy(false); return; }
    try { if (pending.length) await sendPending(saved, pending); setNotice('RIR salvo com sucesso.'); }
    catch (err) { setError(`O RIR foi salvo, mas ${err.message} Os arquivos restantes continuam selecionados para tentar novamente.`); }
    try { await load(); } catch (_) { setError('O RIR foi salvo, mas não foi possível atualizar a lista.'); }
    setBusy(false);
  };
  const uploadSelected = async () => { if (!current?.id || !pending.length) return; setBusy(true); setError(''); setNotice(''); try { await sendPending(current, pending); setNotice('Arquivos anexados com sucesso.'); } catch(e) { setError(`${e.message} Os arquivos restantes continuam selecionados.`); } finally { setBusy(false); } };
  const removeAttachment = async attachment => { if (!window.confirm(`Remover o arquivo "${attachment.nome}" deste RIR?`)) return; setBusy(true); setError(''); try { setCurrent((await deleteRirAnexo(current.id, attachment.id)).data); } catch(e) { setError(message(e, 'Não foi possível remover o anexo.')); } finally { setBusy(false); } };
  const showBlob = async promise => { const tab = window.open('', '_blank'); try { const response = await promise; const url = URL.createObjectURL(response.data); if (tab) { tab.opener = null; tab.location.href = url; } else { const link = document.createElement('a'); link.href = url; link.download = 'arquivo'; link.click(); } setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (_) { tab?.close(); setError('Não foi possível abrir o arquivo.'); } };
  const changeData = (key, value) => setCurrent(c => ({ ...c, dados: { ...c.dados, [key]: value } }));
  const photos = (current?.anexos || []).filter(a => a.tipo?.startsWith('image/')); const docs = (current?.anexos || []).filter(a => !a.tipo?.startsWith('image/'));

  if (legacy) return <><div className="rir-return"><button type="button" onClick={() => setLegacy(false)}>← Voltar aos relatórios RIR</button></div><RastreabilidadeMateriais /></>;
  return <><Navbar/><main className="container quality-page rir-page">
    <div className="rir-topline"><button className="rir-back" type="button" onClick={() => current ? backToList() : navigate(`/projeto/${projetoId}/qualidade`)}><ArrowLeft size={16}/>{current ? 'Voltar aos relatórios' : 'Voltar para Qualidade'}</button>{!current && <Button variant="outline" startIcon={PackageCheck} onClick={() => setLegacy(true)}>Inspeção e histórico por lote</Button>}</div>
    <header className="rir-hero"><div><p className="eyebrow">QUALIDADE / RECEBIMENTO</p><h1>{current ? current.id ? `RIR #${current.id}` : 'Novo RIR' : 'RIR - Relatório de Inspeção e Recebimento'}</h1><p>{current ? editing ? 'Preencha os dados da carga e registre as evidências do recebimento.' : 'Dados da carga, conferência dos materiais e evidências.' : 'Acompanhe as cargas recebidas, os materiais conferidos e suas evidências.'}</p></div><div className="rir-actions">{!current && canEdit && <Button tone="primary" variant="solid" startIcon={Plus} disabled={loading || loadFailed} onClick={() => { setCurrent(blank()); setEditing(true); setError(''); setNotice(''); }}>Novo RIR</Button>}{current && <Button startIcon={Camera} onClick={() => document.getElementById('rir-galeria')?.scrollIntoView({ behavior:'smooth', block:'start' })}>Fotos e documentos</Button>}{current?.id && !editing && <><Button startIcon={FileDown} onClick={() => showBlob(getRirPdf(current.id))}>Abrir PDF</Button>{canEdit && <Button tone="primary" variant="solid" startIcon={Pencil} onClick={() => { setEditing(true); setNotice(''); }}>Editar relatório</Button>}</>}</div></header>
    {error && <div className="alert alert-error" role="alert">{error}</div>}{notice && <div className="material-success-notice" role="status">{notice}</div>}
    {!current ? <section className="rir-list-panel"><div className="rir-list-heading"><div><h2>Relatórios da obra</h2><p>Consulte os registros de recebimento desta obra.</p></div><span className="rir-count">{reports.length} {reports.length === 1 ? 'relatório' : 'relatórios'}</span></div><label className="rir-search"><Search size={18}/><span className="rir-sr-only">Buscar relatório</span><input placeholder="Buscar por número, fornecedor, NF ou romaneio" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><X size={16}/></button>}</label>
      {loading ? <div className="rir-empty"><p>Carregando relatórios...</p></div> : loadFailed ? <div className="rir-empty"><p>Não foi possível consultar os relatórios desta obra.</p><Button onClick={refresh}>Tentar novamente</Button></div> : filtered.length ? <div className="rir-report-grid">{filtered.map(r => <button className="rir-report-card" type="button" key={r.id} disabled={busy} onClick={() => open(r.id)}><div className="rir-report-card-top"><span className="rir-report-icon"><ClipboardList size={19}/></span><span className="rir-report-number">RIR #{r.id}</span><ArrowRight size={17}/></div><strong>{r.dados?.fornecedor || 'Fornecedor não informado'}</strong><span>NF {r.dados?.nota_fiscal || '—'}{r.dados?.romaneio ? ` · Romaneio ${r.dados.romaneio}` : ''}</span><div className="rir-report-card-foot"><span><CalendarDays size={14}/>{dateLabel(r.dados?.data)}</span><span><PackageCheck size={14}/>{r.total_itens} {Number(r.total_itens) === 1 ? 'item' : 'itens'}</span></div></button>)}</div> : <div className="rir-empty"><span><ClipboardList size={26}/></span><h3>{query ? 'Nenhum relatório encontrado' : 'Nenhum relatório cadastrado'}</h3><p>{query ? 'Tente buscar por outro termo.' : 'Crie um RIR para reunir as entradas de uma carga e registrar sua conferência.'}</p>{!query && canEdit && <Button tone="primary" variant="solid" startIcon={Plus} onClick={() => { setCurrent(blank()); setEditing(true); setError(''); }}>Criar primeiro RIR</Button>}</div>}
    </section> : <div className="rir-workspace"><form id="rir-form" onSubmit={save}>
      {groups.map(({ title, description, icon, fields }) => <section className="rir-panel" key={title}><SectionHeading icon={icon} title={title} description={description}/><Fields fields={fields} values={current.dados} editing={editing} onChange={changeData}/></section>)}
      <section className="rir-panel"><SectionHeading icon={PackageCheck} title="Itens da carga" description="Informe os itens livremente e acompanhe o recebimento de cada um." aside={`${current.itens.length} ${current.itens.length === 1 ? 'item' : 'itens'}`}/>
        {!current.itens.length ? <div className="rir-inline-empty">Nenhum item adicionado à carga.</div> : <div className="rir-items">{current.itens.map((item,index) => { const resumo = resumoQuantidade(item.quantidade_recebida, item.quantidade_total); return <article className="rir-item" key={item.id || item._key}><div className="rir-item-heading"><div><span>ITEM {String(index + 1).padStart(2,'0')}</span><h4>{item.descricao || 'Novo item'}</h4>{item.lote && <p>Lote anteriormente vinculado: {item.lote}</p>}</div>{resumo && <div className="rir-received"><small>{resumo.status}</small><strong>{fmt(resumo.percentual)}% recebido</strong></div>}</div><div className="rir-fields">{[['codigo','Código','text',false],['descricao','Descrição','text',true],['quantidade','Quantidade','number',true],['quantidade_recebida','Quantidade recebida','number',true],['quantidade_total','Quantidade total','number',true],['unidade','Unidade','text',true]].map(([key,label,type,required]) => <label key={key}><span>{label}</span>{editing ? <input className="form-input" type={type} required={required} min={type === 'number' ? (key === 'quantidade_total' ? '0.0001' : '0') : undefined} step={type === 'number' ? '0.0001' : undefined} value={item[key] ?? ''} onChange={e => updateItem(index,key,e.target.value)}/> : <strong>{item[key] === '' || item[key] == null ? '—' : type === 'number' ? fmt(item[key]) : item[key]}</strong>}</label>)}</div><div className={`rir-progress ${resumo?.saldo < 0 ? 'is-excess' : ''}`}><div className="rir-progress-heading"><span>{resumo ? resumo.status : 'Informe as quantidades para calcular'}</span><strong>{resumo ? `${fmt(resumo.percentual)}%` : '—'}</strong></div><div className="rir-progress-track" role="progressbar" aria-label={`Recebimento do item ${index + 1}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={resumo ? Math.min(100, resumo.percentual) : 0}><span style={{width:`${resumo ? Math.min(100, resumo.percentual) : 0}%`}}/></div><p>{resumo ? `Saldo: ${fmt(resumo.saldo)} ${item.unidade || ''} (total − recebido)` : 'Saldo e percentual aparecerão após informar o total e o recebido.'}</p></div>{editing && <button className="rir-remove" type="button" onClick={() => setCurrent(c => ({ ...c, itens:c.itens.filter((_,i) => i !== index) }))}><Trash2 size={14}/> Remover item</button>}</article>; })}</div>}
        {editing && <Button className="rir-add-item" startIcon={Plus} onClick={addItem}>Adicionar item</Button>}
      </section>
      <section className="rir-panel"><SectionHeading icon={ClipboardList} title="Conclusão" description="Registre a conformidade e as observações da carga."/><Fields fields={conclusion} values={current.dados} editing={editing} onChange={changeData}/></section>
    </form>
    <section id="rir-galeria" className="rir-panel rir-evidence"><SectionHeading icon={Camera} title="Galeria de fotos e documentos" description="Registre as condições da carga, descarga, placas e documentos do recebimento." aside={`${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}`}/>
      {canEdit && <><input ref={fileRef} className="rir-sr-only" type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={addFiles}/><div className="rir-upload-zone"><span><ImagePlus size={23}/></span><div><strong>Adicionar fotos ou documentos</strong><p>Selecione um ou mais arquivos JPEG, PNG ou PDF. Até 25 MB por arquivo.</p></div><Button startIcon={Upload} onClick={() => fileRef.current?.click()} disabled={busy}>Selecionar arquivos</Button></div></>}
      {!!pending.length && <div className="rir-pending"><div className="rir-subheading"><h4>Arquivos selecionados</h4><span>{pending.length} pendente(s)</span></div><p>{editing || !current.id ? 'Os arquivos serão enviados ao salvar o RIR.' : 'Envie os arquivos para adicioná-los ao relatório.'}</p><div className="rir-pending-list">{pending.map(entry => <PendingFile key={entry.key} entry={entry} onChange={(key,value) => setPending(previous => previous.map(item => item.key === key ? { ...item, caption:value } : item))} onRemove={key => setPending(previous => previous.filter(item => item.key !== key))}/>)}</div>{current.id && !editing && <Button tone="primary" variant="solid" startIcon={Upload} loading={busy} onClick={uploadSelected}>Enviar arquivos selecionados</Button>}</div>}
      <div className="rir-subheading"><h4>Fotos do recebimento</h4><span>{photos.length} {photos.length === 1 ? 'foto' : 'fotos'}</span></div>{photos.length ? <div className="rir-photo-grid">{photos.map(photo => <PhotoCard key={photo.id} reportId={current.id} attachment={photo} canRemove={canEdit} onRemove={removeAttachment} busy={busy}/>)}</div> : <div className="rir-gallery-empty"><Camera size={22}/><div><strong>Nenhuma foto anexada</strong><p>{current.id ? 'As fotos enviadas aparecerão aqui e no PDF do relatório.' : 'Selecione fotos para visualizá-las e incluí-las ao salvar o relatório.'}</p></div></div>}
      <div className="rir-subheading"><h4>Documentos</h4><span>{docs.length} {docs.length === 1 ? 'arquivo' : 'arquivos'}</span></div>{docs.length ? <div className="rir-documents">{docs.map(doc => <div className="rir-document" key={doc.id}><span><FileText size={19}/></span><div><strong>{doc.nome}</strong><small>{doc.legenda || 'Documento do recebimento'}</small></div><button type="button" onClick={() => showBlob(getRirAnexo(current.id,doc.id))}>Abrir</button>{canEdit && <button type="button" disabled={busy} onClick={() => removeAttachment(doc)} aria-label={`Remover ${doc.nome}`}><Trash2 size={16}/></button>}</div>)}</div> : <p className="rir-no-documents">Nenhum documento anexado.</p>}
    </section>
    {editing && <div className="rir-form-footer"><p>Revise os dados e as evidências antes de salvar.</p><div className="rir-actions"><Button onClick={backToList} disabled={busy}>Cancelar</Button><Button type="submit" form="rir-form" tone="primary" variant="solid" loading={busy}>Salvar RIR</Button></div></div>}
    </div>}
  </main></>;
}

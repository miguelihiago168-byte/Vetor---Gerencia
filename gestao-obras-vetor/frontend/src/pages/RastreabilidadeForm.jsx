import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, FileText, PackagePlus, Paperclip, Save, Trash2, Warehouse } from 'lucide-react';
import Navbar from '../components/Navbar';
import Button from '../components/ui/Button';
import { createMaterialRecebimento, deleteEvidenciaMaterial, enviarMaterialParaInspecao, getMaterialRecebimento, getMaterialTraceConfig, getUploadUrl, updateMaterialRecebimento, uploadEvidenciaMaterial } from '../services/api';
import './RastreabilidadeMateriais.css';

const localDateTime = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const toLocalDateTimeInput = (value) => {
  if (!value) return localDateTime();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const novoRecebimento = () => ({
  tipo_id: '', tipo_outro: '', codigo_material: '', nome_material: '', descricao: '',
  quantidade_recebida: '', unidade: 'UN', recebido_em: localDateTime(),
  fornecedor_nome: '', fabricante: '', nota_fiscal: '', lote: '', numero_serie: '', local_armazenamento: '',
  observacoes: '', dados_tecnicos: {}
});

const TECHNICAL_FIELD_LABELS = {
  fck_mpa: 'Fck (MPa)',
  volume_solicitado: 'Volume solicitado',
  volume_recebido: 'Volume recebido',
  slump_especificado: 'Slump especificado',
  elemento_concretado: 'Elemento concretado',
  localizacao: 'Localização',
  atividade_eap_id: 'Atividade EAP',
  rdo_id: 'RDO vinculado',
  classe_aco: 'Classe do aço',
  condicao_visual: 'Condição visual',
  material_condutor: 'Material condutor',
  secao_nominal: 'Seção nominal',
  classe_tensao: 'Classe de tensão',
  numero_serie: 'Número de série',
  potencia: 'Potência',
  tensao: 'Tensão',
  codigo_patrimonial: 'Código patrimonial',
  faixa_series: 'Faixa de séries',
  quantidade_avariada: 'Quantidade avariada',
  tipo_peca: 'Tipo de peça',
  espessura_galvanizacao: 'Espessura da galvanização',
  tipo_agregado: 'Tipo de agregado',
  granulometria: 'Granulometria'
};

const fieldLabel = (field) => TECHNICAL_FIELD_LABELS[field] || field.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function RastreabilidadeForm() {
  const { projetoId, recebimentoId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(recebimentoId);
  const [config, setConfig] = useState({ tipos: [], unidades: [], campos_tecnicos: {} });
  const [form, setForm] = useState(novoRecebimento);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [removingEvidenceId, setRemovingEvidenceId] = useState(null);
  const attachmentUrls = useRef(new Set());

  useEffect(() => () => attachmentUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    getMaterialTraceConfig()
      .then(({ data }) => setConfig(data || { tipos: [], unidades: [], campos_tecnicos: {} }))
      .catch((error) => setErro(error.response?.data?.erro || error.message));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getMaterialRecebimento(recebimentoId)
      .then(({ data }) => {
        setForm((current) => ({ ...current, ...data, recebido_em: toLocalDateTimeInput(data.recebido_em), dados_tecnicos: data.dados_tecnicos || {} }));
        setExistingAttachments(data.evidencias || []);
      })
      .catch((error) => setErro(error.response?.data?.erro || error.message));
  }, [isEdit, recebimentoId]);

  const materialType = useMemo(
    () => config.tipos?.find((item) => String(item.id) === String(form.tipo_id)),
    [config.tipos, form.tipo_id]
  );
  const technicalFields = materialType ? config.campos_tecnicos?.[materialType.codigo] || [] : [];
  const showGeneralManufacturer = !technicalFields.includes('fabricante');
  const showGeneralSerialNumber = !technicalFields.includes('numero_serie');
  const setValue = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const addFiles = (event, categoria) => {
    const files = Array.from(event.target.files || []).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      attachmentUrls.current.add(previewUrl);
      return { id: `${file.name}-${file.lastModified}-${Math.random()}`, file, categoria, previewUrl };
    });
    setAttachments((current) => [...current, ...files]);
    event.target.value = '';
  };
  const removeAttachment = (attachment) => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
      attachmentUrls.current.delete(attachment.previewUrl);
    }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
  };
  const imageAttachments = attachments.filter((attachment) => String(attachment.file.type || '').startsWith('image/'));
  const pdfAttachments = attachments.filter((attachment) => attachment.file.type === 'application/pdf' || /\.pdf$/i.test(attachment.file.name));
  const otherAttachments = attachments.filter((attachment) => !imageAttachments.includes(attachment) && !pdfAttachments.includes(attachment));
  const isEvidenceImage = (evidence) => /^image\//i.test(evidence.tipo_arquivo || '') || /\.(jpe?g|png|webp|gif)$/i.test(evidence.nome_arquivo || '');
  const existingImages = existingAttachments.filter(isEvidenceImage);
  const existingPdfs = existingAttachments.filter((evidence) => /pdf/i.test(evidence.tipo_arquivo || '') || /\.pdf$/i.test(evidence.nome_arquivo || ''));
  const existingOtherFiles = existingAttachments.filter((evidence) => !existingImages.includes(evidence) && !existingPdfs.includes(evidence));
  const uploadPendingAttachments = async (receiptId) => {
    for (const attachment of [...attachments]) {
      const data = new FormData();
      data.append('arquivo', attachment.file);
      data.append('categoria', attachment.categoria);
      await uploadEvidenciaMaterial(receiptId, data);
      removeAttachment(attachment);
    }
  };
  const removeExistingAttachment = async (evidence) => {
    if (!window.confirm(`Excluir o anexo “${evidence.nome_arquivo}”?`)) return;
    try {
      setErro('');
      setRemovingEvidenceId(evidence.id);
      await deleteEvidenciaMaterial(recebimentoId, evidence.id);
      setExistingAttachments((current) => current.filter((item) => item.id !== evidence.id));
    } catch (error) {
      setErro(error.response?.data?.erro || error.message);
    } finally {
      setRemovingEvidenceId(null);
    }
  };

  const submit = async (rascunho) => {
    setErro('');
    if (!rascunho && (!form.tipo_id || !form.nome_material.trim() || Number(form.quantidade_recebida) <= 0)) {
      setErro('Informe o tipo, o nome do material e uma quantidade maior que zero.');
      return;
    }
    if (materialType?.codigo === 'OUTROS' && !form.tipo_outro.trim()) {
      setErro('Descreva o tipo de material selecionado como Outros.');
      return;
    }
    try {
      setSaving(true);
      const payload = { ...form, recebido_em: form.recebido_em ? new Date(form.recebido_em).toISOString() : undefined, projeto_id: Number(projetoId) };
      if (isEdit) {
        await updateMaterialRecebimento(recebimentoId, payload);
        await uploadPendingAttachments(recebimentoId);
        navigate(`/projeto/${projetoId}/rastreabilidade-materiais/${recebimentoId}`);
        return;
      }
      const response = await createMaterialRecebimento({ ...payload, rascunho: true });
      await uploadPendingAttachments(response.data.id);
      if (!rascunho) await enviarMaterialParaInspecao(response.data.id);
      navigate(`/projeto/${projetoId}/rastreabilidade-materiais/${response.data.id}`);
    } catch (error) {
      setErro(error.response?.data?.erro || error.message);
    } finally {
      setSaving(false);
    }
  };

  return <>
    <Navbar />
    <main className="container quality-page material-form-page">
      <div className="material-form-topbar">
        <Button className="quality-back-button" variant="outline" startIcon={ArrowLeft} onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais`)}>
          Voltar para recebimentos
        </Button>
        <div className="material-form-actions">
          {isEdit ? <Button startIcon={Save} loading={saving} onClick={() => submit(false)}>Salvar alterações</Button> : <><Button variant="outline" startIcon={Save} loading={saving} onClick={() => submit(true)}>Salvar rascunho</Button><Button startIcon={ClipboardCheck} loading={saving} onClick={() => submit(false)}>Enviar para inspeção</Button></>}
        </div>
      </div>

      <div className="material-form-heading">
        <div className="material-heading-icon"><PackagePlus size={24} /></div>
        <div><p className="eyebrow">QUALIDADE / RASTREABILIDADE</p><h1>{isEdit ? 'Editar recebimento' : 'Novo recebimento'}</h1><p>{isEdit ? 'Ajuste as informações enquanto o recebimento ainda aguarda inspeção.' : 'Registre os dados do material para iniciar a inspeção, o saldo e sua rastreabilidade.'}</p></div>
      </div>
      {erro && <div className="alert alert-error">{erro}</div>}

      <section className="material-form-section">
        <div className="material-section-title"><span>1</span><div><h2>Identificação do material</h2><p>Defina o tipo e a referência para localizar este recebimento depois.</p></div></div>
        <div className="material-form-grid material-form-grid--three">
          <label className="form-group"><span className="form-label">Tipo de material *</span><select className="form-select" value={form.tipo_id} onChange={(event) => setValue('tipo_id', event.target.value)}><option value="">Selecione o tipo</option>{config.tipos?.map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}</select></label>
          <label className="form-group"><span className="form-label">Nome do material *</span><input className="form-input" placeholder="Ex.: Cimento CP-II 50 kg" value={form.nome_material} onChange={(event) => setValue('nome_material', event.target.value)} /></label>
          <label className="form-group"><span className="form-label">Código interno</span><input className="form-input" placeholder="Opcional" value={form.codigo_material} onChange={(event) => setValue('codigo_material', event.target.value)} /></label>
        </div>
        {materialType?.codigo === 'OUTROS' && <label className="form-group material-form-inline-field"><span className="form-label">Descrição do tipo *</span><input className="form-input" placeholder="Informe qual material será rastreado" value={form.tipo_outro} onChange={(event) => setValue('tipo_outro', event.target.value)} /></label>}
        <label className="form-group material-form-inline-field"><span className="form-label">Descrição complementar</span><textarea className="form-textarea" rows="3" placeholder="Características ou especificações relevantes do material" value={form.descricao} onChange={(event) => setValue('descricao', event.target.value)} /></label>
      </section>

      <section className="material-form-section">
        <div className="material-section-title"><span>2</span><div><h2>Dados do recebimento</h2><p>Informe a quantidade recebida, documentos e onde o material ficará armazenado.</p></div></div>
        <div className="material-form-grid material-form-grid--four">
          <label className="form-group"><span className="form-label">Quantidade *</span><input className="form-input" type="number" min="0" step="0.001" value={form.quantidade_recebida} onChange={(event) => setValue('quantidade_recebida', event.target.value)} /></label>
          <label className="form-group"><span className="form-label">Unidade *</span><select className="form-select" value={form.unidade} onChange={(event) => setValue('unidade', event.target.value)}>{config.unidades?.map((unit) => <option key={unit.codigo} value={unit.codigo}>{unit.nome} ({unit.codigo})</option>)}</select></label>
          <label className="form-group"><span className="form-label">Data e hora do recebimento</span><input className="form-input" type="datetime-local" value={form.recebido_em} onChange={(event) => setValue('recebido_em', event.target.value)} /></label>
          <label className="form-group"><span className="form-label">Local inicial</span><input className="form-input" placeholder="Ex.: Almoxarifado da obra" value={form.local_armazenamento} onChange={(event) => setValue('local_armazenamento', event.target.value)} /></label>
          <label className="form-group"><span className="form-label">Fornecedor</span><input className="form-input" placeholder="Nome do fornecedor" value={form.fornecedor_nome} onChange={(event) => setValue('fornecedor_nome', event.target.value)} /></label>
          {showGeneralManufacturer && <label className="form-group"><span className="form-label">Fabricante</span><input className="form-input" value={form.fabricante} onChange={(event) => setValue('fabricante', event.target.value)} /></label>}
          <label className="form-group"><span className="form-label">Nota fiscal</span><input className="form-input" value={form.nota_fiscal} onChange={(event) => setValue('nota_fiscal', event.target.value)} /></label>
          <label className="form-group"><span className="form-label">Lote</span><input className="form-input" value={form.lote} onChange={(event) => setValue('lote', event.target.value)} /></label>
          {showGeneralSerialNumber && <label className="form-group"><span className="form-label">Número de série</span><input className="form-input" value={form.numero_serie} onChange={(event) => setValue('numero_serie', event.target.value)} /></label>}
        </div>
      </section>

      <section className="material-form-section">
        <div className="material-section-title"><span>3</span><div><h2>Dados técnicos</h2><p>Campos adaptados ao tipo de material escolhido.</p></div></div>
        {!materialType ? <div className="material-form-hint"><Warehouse size={18} />Selecione o tipo de material para exibir os campos técnicos aplicáveis.</div> : technicalFields.length ? <div className="material-form-grid material-form-grid--three">{technicalFields.map((field) => <label className="form-group" key={field}><span className="form-label">{fieldLabel(field)}</span><input className="form-input" value={form.dados_tecnicos[field] || ''} onChange={(event) => setForm((current) => ({ ...current, dados_tecnicos: { ...current.dados_tecnicos, [field]: event.target.value } }))} /></label>)}</div> : <div className="material-form-hint"><FileText size={18} />Este tipo não exige campos técnicos adicionais.</div>}
      </section>

      <section className="material-form-section">
        <div className="material-section-title"><span>4</span><div><h2>Nota fiscal, fotos e documentos</h2><p>Anexe os arquivos que comprovam o recebimento. Eles ficarão disponíveis na visualização do material.</p></div></div>
        {isEdit && existingAttachments.length > 0 && <div className="material-existing-evidences">
          <h3>Anexos atuais</h3>
          {existingImages.length > 0 && <div className="material-image-gallery">{existingImages.map((evidence) => <figure key={evidence.id} className="material-image-preview"><a href={getUploadUrl(evidence.caminho_arquivo)} target="_blank" rel="noreferrer"><img src={getUploadUrl(evidence.caminho_arquivo)} alt={evidence.descricao || evidence.nome_arquivo} /></a><figcaption><span>{evidence.nome_arquivo}</span><button type="button" disabled={removingEvidenceId === evidence.id} onClick={() => removeExistingAttachment(evidence)} aria-label={`Excluir ${evidence.nome_arquivo}`}><Trash2 size={15} /></button></figcaption></figure>)}</div>}
          {existingPdfs.length > 0 && <div className="material-pdf-list"><h3>PDFs atuais</h3>{existingPdfs.map((evidence) => <div key={evidence.id} className="material-pdf-row"><FileText size={18} /><div><strong>{evidence.nome_arquivo}</strong><span>{evidence.categoria || 'Documento'}</span></div><a href={getUploadUrl(evidence.caminho_arquivo)} target="_blank" rel="noreferrer">Abrir PDF</a><button type="button" disabled={removingEvidenceId === evidence.id} onClick={() => removeExistingAttachment(evidence)} aria-label={`Excluir ${evidence.nome_arquivo}`}><Trash2 size={15} /></button></div>)}</div>}
          {existingOtherFiles.length > 0 && <div className="material-file-list">{existingOtherFiles.map((evidence) => <div key={evidence.id} className="material-file-row"><FileText size={16} /><a href={getUploadUrl(evidence.caminho_arquivo)} target="_blank" rel="noreferrer">{evidence.nome_arquivo}</a><small>{evidence.categoria || 'Documento'}</small><button type="button" disabled={removingEvidenceId === evidence.id} onClick={() => removeExistingAttachment(evidence)} aria-label={`Excluir ${evidence.nome_arquivo}`}><Trash2 size={15} /></button></div>)}</div>}
        </div>}
        {isEdit && <p className="material-form-hint">Inclua novos arquivos abaixo. As alterações serão aplicadas ao salvar o recebimento.</p>}
        <div className="material-upload-options">
          <label className="material-upload-option"><FileText size={20} /><strong>Nota fiscal e comprovantes</strong><span>PDF, imagem ou planilha</span><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(event) => addFiles(event, 'Nota fiscal')} /></label>
          <label className="material-upload-option"><Paperclip size={20} /><strong>Fotos do recebimento</strong><span>Fotos do lote, embalagem e condições</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => addFiles(event, 'Foto')} /></label>
          <label className="material-upload-option"><Warehouse size={20} /><strong>Outros documentos</strong><span>Laudos, certificados e romaneios</span><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(event) => addFiles(event, 'Documento')} /></label>
        </div>
        {imageAttachments.length > 0 && <div className="material-image-gallery">{imageAttachments.map((attachment) => <figure key={attachment.id} className="material-image-preview"><img src={attachment.previewUrl} alt={attachment.file.name} /><figcaption><span>{attachment.file.name}</span><button type="button" onClick={() => removeAttachment(attachment)} aria-label={`Remover ${attachment.file.name}`}><Trash2 size={15} /></button></figcaption></figure>)}</div>}
        {pdfAttachments.length > 0 && <div className="material-pdf-list"><h3>PDFs anexados</h3>{pdfAttachments.map((attachment) => <div key={attachment.id} className="material-pdf-row"><FileText size={18} /><div><strong>{attachment.file.name}</strong><span>{attachment.categoria} · {(attachment.file.size / 1024 / 1024).toFixed(1)} MB</span></div><a href={attachment.previewUrl} target="_blank" rel="noreferrer">Abrir PDF</a><button type="button" onClick={() => removeAttachment(attachment)} aria-label={`Remover ${attachment.file.name}`}><Trash2 size={15} /></button></div>)}</div>}
        {otherAttachments.length > 0 && <div className="material-file-list">{otherAttachments.map((attachment) => <div key={attachment.id} className="material-file-row"><FileText size={16} /><span>{attachment.file.name}</span><small>{attachment.categoria} · {(attachment.file.size / 1024 / 1024).toFixed(1)} MB</small><button type="button" onClick={() => removeAttachment(attachment)} aria-label={`Remover ${attachment.file.name}`}><Trash2 size={15} /></button></div>)}</div>}
      </section>

      <section className="material-form-section">
        <div className="material-section-title"><span>5</span><div><h2>Observações e próximos passos</h2><p>{isEdit ? 'Salve as alterações antes da conclusão da inspeção.' : 'A inspeção e as aplicações são registradas após criar o recebimento.'}</p></div></div>
        <label className="form-group material-form-inline-field"><span className="form-label">Observações</span><textarea className="form-textarea" rows="4" placeholder="Condições do recebimento, divergências ou orientações para a inspeção" value={form.observacoes} onChange={(event) => setValue('observacoes', event.target.value)} /></label>
        <div className="material-next-step"><ClipboardCheck size={19} /><span>Após o registro, a Qualidade poderá inspecionar e liberar o saldo para aplicação na obra.</span></div>
      </section>

      <div className="material-form-footer">
        <Button className="quality-back-button" variant="outline" startIcon={ArrowLeft} onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais`)}>Cancelar</Button>
        <div className="material-form-actions">{isEdit ? <Button startIcon={Save} loading={saving} onClick={() => submit(false)}>Salvar alterações</Button> : <><Button variant="outline" startIcon={Save} loading={saving} onClick={() => submit(true)}>Salvar rascunho</Button><Button startIcon={ClipboardCheck} loading={saving} onClick={() => submit(false)}>Enviar para inspeção</Button></>}</div>
      </div>
    </main>
  </>;
}

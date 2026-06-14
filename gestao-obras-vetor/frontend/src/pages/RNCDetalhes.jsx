import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getRNCs,
  updateStatusRNC,
  getAnexosRNC,
  uploadAnexoRNC,
  submitCorrecaoRNC,
  enviarRncParaAprovacao,
  getRNCPDF,
  getUploadUrl
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  Send,
  Paperclip,
  Wrench,
  User,
  Calendar,
  Info,
  Upload,
  X,
  CheckCircle
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import './RNCDetalhes.css';

const cleanText = (value) => {
  if (value == null) return '';
  const text = String(value).trim();
  return text === '' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined' ? '' : text;
};

const normalizeUploadPath = (raw) => {
  const base = cleanText(raw);
  if (!base) return '';
  let normalized = base.replace(/\\/g, '/').replace(/^\/+/, '');
  const uploadsIndex = normalized.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIndex >= 0) normalized = normalized.slice(uploadsIndex + '/uploads/'.length);
  return normalized.replace(/^api\/uploads\//i, '').replace(/^uploads\//i, '').split('?')[0];
};

const uploadFileUrl = (anexo) => {
  const path = normalizeUploadPath(anexo?.caminho_arquivo);
  return path ? getUploadUrl(path) : '#';
};

const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

const isImage = (anexo) => {
  const type = String(anexo?.tipo || '').toLowerCase();
  const name = String(anexo?.nome_arquivo || '').toLowerCase();
  return type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(name);
};

const fmtDate = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match ? new Date(+match[1], +match[2] - 1, +match[3]) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('pt-BR');
};

const fmtDatetime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const STATUS_META = {
  Aberta: { label: 'Aberta', cls: 'status-aberta' },
  'Em andamento': { label: 'Aberta', cls: 'status-aberta' },
  'Em análise': { label: 'Em aprovação', cls: 'status-analise' },
  Encerrada: { label: 'Encerrada', cls: 'status-encerrada' },
  Reprovada: { label: 'Reprovada', cls: 'status-reprovada' }
};

const GRAV_CLS = (gravidade) => {
  if (!gravidade) return '';
  const lower = gravidade.toLowerCase();
  if (lower.includes('cr')) return 'grav-critica';
  if (lower === 'alta') return 'grav-alta';
  if (lower.includes('m')) return 'grav-media';
  return 'grav-baixa';
};

const STEPS = [
  { key: 'abertura', label: 'Registro', icon: AlertTriangle },
  { key: 'correcao', label: 'Correção', icon: Wrench },
  { key: 'aprovacao', label: 'Aprovação', icon: CheckCircle },
  { key: 'encerrada', label: 'Encerrada', icon: CheckCircle2 }
];

const stepIndex = (status) => {
  if (status === 'Em análise') return 2;
  if (status === 'Encerrada') return 3;
  if (status === 'Aberta' || status === 'Em andamento' || status === 'Reprovada') return 1;
  return 1;
};

function RNCDetalhes() {
  const { projetoId, rncId } = useParams();
  const navigate = useNavigate();
  const { isGestor, perfil } = useAuth();
  const canAprovarRnc = isGestor || ['Gestor da Qualidade', 'Gestor de Qualidade'].includes(perfil);
  const { success, error } = useNotification();

  const [rnc, setRnc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [anexos, setAnexos] = useState([]);
  const [correcaoTexto, setCorrecaoTexto] = useState('');
  const [fotosCorrecao, setFotosCorrecao] = useState([]);
  const [previewCorrecao, setPreviewCorrecao] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [draggingC, setDraggingC] = useState(false);
  const dropCorrecaoRef = useRef(null);

  useEffect(() => {
    carregarRNC();
  }, [rncId]);

  useEffect(() => {
    if (rnc?.descricao_correcao) setCorrecaoTexto(rnc.descricao_correcao);
  }, [rnc?.descricao_correcao]);

  const carregarRNC = async () => {
    try {
      setLoading(true);
      const res = await getRNCs(projetoId);
      const found = (res.data || []).find((item) => String(item.id) === String(rncId));
      if (!found) {
        setErro('RNC não encontrada');
        return;
      }
      setRnc(found);
      try {
        const anexosRes = await getAnexosRNC(rncId);
        setAnexos(anexosRes.data || []);
      } catch (_) {
        setAnexos([]);
      }
    } catch (_) {
      setErro('Erro ao carregar RNC');
    } finally {
      setLoading(false);
    }
  };

  const adicionarFotosCorrecao = (files) => {
    const selected = Array.from(files || []).filter((file) =>
      file.type.startsWith('image/') || /\.(jpg|jpeg|png|heic|heif|webp)$/i.test(file.name)
    );
    if (!selected.length) return;

    setFotosCorrecao((prev) => [...prev, ...selected]);
    selected.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => setPreviewCorrecao((prev) => [...prev, { name: file.name, src: event.target.result }]);
      reader.readAsDataURL(file);
    });
  };

  const removerFotoCorrecao = (index) => {
    setFotosCorrecao((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setPreviewCorrecao((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const enviarCorrecao = async () => {
    if (!correcaoTexto.trim()) {
      error('Descreva o que foi feito para corrigir a não conformidade.');
      return;
    }

    if (enviando) return;

    setEnviando(true);
    try {
      for (const foto of fotosCorrecao) {
        const formData = new FormData();
        formData.append('arquivo', foto);
        formData.append('descricao', 'Foto da correção');
        formData.append('categoria', 'correcao');
        await uploadAnexoRNC(rncId, formData);
      }

      await submitCorrecaoRNC(rncId, { descricao_correcao: correcaoTexto.trim() });
      await enviarRncParaAprovacao(rncId);
      success('Correção registrada e enviada para aprovação!');
      await carregarRNC();
      setFotosCorrecao([]);
      setPreviewCorrecao([]);
    } catch (err) {
      error('Falha ao enviar correção: ' + (err.response?.data?.erro || err.message));
    } finally {
      setEnviando(false);
    }
  };

  const aprovarRNC = async () => {
    try {
      await updateStatusRNC(rncId, 'Encerrada');
      setRnc((prev) => ({ ...prev, status: 'Encerrada' }));
      success('RNC aprovada e encerrada.');
    } catch (err) {
      error('Falha: ' + (err.response?.data?.erro || err.message));
    }
  };

  const reprovarRNC = async () => {
    try {
      await updateStatusRNC(rncId, 'Reprovada');
      setRnc((prev) => ({ ...prev, status: 'Reprovada' }));
      success('RNC reprovada - responsável deve corrigir novamente.');
    } catch (err) {
      error('Falha: ' + (err.response?.data?.erro || err.message));
    }
  };

  const handleOpenPdf = async () => {
    const pdfWindow = window.open('about:blank', '_blank');
    try {
      const res = await getRNCPDF(rncId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (pdfWindow) pdfWindow.location.href = url;
      else window.open(url, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (err) {
      if (Number(err?.response?.status) >= 500) {
        const token = getToken();
        const fallback = token ? `/api/rnc/${rncId}/pdf?token=${encodeURIComponent(token)}` : `/api/rnc/${rncId}/pdf`;
        if (pdfWindow) pdfWindow.location.href = fallback;
        else window.open(fallback, '_blank');
        return;
      }
      if (pdfWindow) pdfWindow.close();
      error('Falha ao abrir PDF: ' + (err.response?.data?.erro || err.message));
    }
  };

  const legacyFotos = (() => {
    if (!rnc?.registros_fotograficos) return [];
    try {
      let raw = rnc.registros_fotograficos;
      if (typeof raw === 'string') raw = JSON.parse(raw);
      if (!Array.isArray(raw)) return [];
      return raw.map((item, index) => {
        const path = typeof item === 'string' ? item : (item?.caminho_arquivo || item?.path || item?.url || '');
        if (!path) return null;
        const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//i, '');
        if (!normalized) return null;
        return {
          id: `legacy-${index}`,
          caminho_arquivo: normalized,
          nome_arquivo: normalized.split('/').pop(),
          tipo: 'image/jpeg',
          categoria: 'registro'
        };
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  })();

  const anexosRegistro = [
    ...anexos.filter((anexo) => !anexo.categoria || anexo.categoria === 'registro'),
    ...legacyFotos.filter((legacy) => !anexos.some((anexo) => anexo.caminho_arquivo === legacy.caminho_arquivo))
  ];
  const anexosCorrecao = anexos.filter((anexo) => anexo.categoria === 'correcao');
  const fotosRegistro = anexosRegistro.filter(isImage);
  const fotosCorrecaoRegistradas = anexosCorrecao.filter(isImage);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container rdet-page" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="spinner" />
        </div>
      </>
    );
  }

  if (!rnc) {
    return (
      <>
        <Navbar />
        <div className="container rdet-page">
          <div className="rdet-empty-state">
            <AlertTriangle size={40} />
            <p>{erro || 'RNC não encontrada.'}</p>
            <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
              <ArrowLeft size={15} /> Voltar
            </button>
          </div>
        </div>
      </>
    );
  }

  const titulo = cleanText(rnc.titulo) || `RNC #${rnc.id}`;
  const statusMeta = STATUS_META[rnc.status] || { label: rnc.status, cls: 'status-aberta' };
  const activeStep = stepIndex(rnc.status);
  const isEncerrada = rnc.status === 'Encerrada';
  const isEmAnalise = rnc.status === 'Em análise';
  const isAberta = rnc.status === 'Aberta' || rnc.status === 'Em andamento';
  const isReprovada = rnc.status === 'Reprovada';
  const podeCorrigir = (isAberta || isReprovada) && !isEncerrada;
  const totalFotosCorrecao = fotosCorrecaoRegistradas.length + fotosCorrecao.length;

  const timeline = [
    { icon: AlertTriangle, color: '#2563eb', label: 'RNC registrada', date: fmtDatetime(rnc.criado_em), detail: titulo },
    rnc.descricao_correcao && {
      icon: Wrench,
      color: '#16a34a',
      label: 'Correção registrada',
      date: fmtDatetime(rnc.atualizado_em),
      detail: cleanText(rnc.descricao_correcao).slice(0, 80) + (cleanText(rnc.descricao_correcao).length > 80 ? '...' : '')
    },
    isEmAnalise && { icon: Send, color: '#d97706', label: 'Enviada para aprovação', date: fmtDatetime(rnc.atualizado_em), detail: 'Aguardando revisão do gestor' },
    isEncerrada && { icon: CheckCircle2, color: '#16a34a', label: 'RNC encerrada', date: fmtDatetime(rnc.atualizado_em), detail: 'Correção aprovada' },
    isReprovada && { icon: XCircle, color: '#dc2626', label: 'Correção reprovada', date: fmtDatetime(rnc.atualizado_em), detail: 'Responsável deve corrigir novamente' }
  ].filter(Boolean);

  return (
    <>
      <Navbar />
      <div className="container rdet-page">
        <div className="rdet-header">
          <button className="rdet-back" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
            <ArrowLeft size={15} />
          </button>
          <div className="rdet-header-main">
            <div className="rdet-header-breadcrumb">
              Qualidade / RNC / <strong>#{rnc.id}</strong>
            </div>
            <h1 className="rdet-title">{titulo}</h1>
            <div className="rdet-badges">
              <span className={`rdet-status-badge ${statusMeta.cls}`}>{statusMeta.label}</span>
              {rnc.gravidade && <span className={`rdet-grav-badge ${GRAV_CLS(rnc.gravidade)}`}>{rnc.gravidade}</span>}
              {rnc.origem && <span className="rdet-origem-badge">{rnc.origem}</span>}
            </div>
          </div>
          <div className="rdet-header-actions">
            <button className="btn btn-secondary" onClick={handleOpenPdf}>
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>

        <div className="rdet-progress">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const done = index < activeStep;
            const active = index === activeStep;
            return (
              <React.Fragment key={step.key}>
                <div className={`rdet-prog-step${active ? ' active' : done ? ' done' : ''}`}>
                  <div className="rdet-prog-circle"><Icon size={14} /></div>
                  <span>{step.label}</span>
                </div>
                {index < STEPS.length - 1 && <div className={`rdet-prog-line${done ? ' done' : ''}`} />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="rdet-body">
          <div className="rdet-main">
            <div className="rdet-card">
              <div className="rdet-card-head">
                <div className="rdet-card-icon rdet-icon-red"><AlertTriangle size={15} /></div>
                <h3>Não Conformidade</h3>
              </div>
              <p className="rdet-desc">{rnc.descricao}</p>
              {rnc.norma_referencia && (
                <div className="rdet-inline-info">
                  <Info size={13} />
                  <span>Norma/Referência: <strong>{rnc.norma_referencia}</strong></span>
                </div>
              )}

              {anexosRegistro.length > 0 && (
                <div className="rdet-gallery-block">
                  <p className="rdet-gallery-title">Fotos da não conformidade</p>
                  {fotosRegistro.length > 0 && (
                    <div className="rdet-gallery-grid">
                      {fotosRegistro.map((anexo) => (
                        <a key={anexo.id} href={uploadFileUrl(anexo)} target="_blank" rel="noreferrer" className="rdet-gallery-item">
                          <img src={uploadFileUrl(anexo)} alt={anexo.nome_arquivo} loading="lazy" />
                          <span>{anexo.nome_arquivo}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {anexosRegistro.filter((anexo) => !isImage(anexo)).map((anexo) => (
                    <a key={anexo.id} href={uploadFileUrl(anexo)} target="_blank" rel="noreferrer" className="rdet-file-link">
                      <Paperclip size={13} /> {anexo.nome_arquivo}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {rnc.acao_corretiva && (
              <div className="rdet-card rdet-card-blue">
                <div className="rdet-card-head">
                  <div className="rdet-card-icon rdet-icon-blue"><Wrench size={15} /></div>
                  <h3>O que deve ser corrigido</h3>
                </div>
                <p className="rdet-desc">{rnc.acao_corretiva}</p>
                {rnc.responsavel_nome && (
                  <div className="rdet-inline-info">
                    <User size={13} />
                    <span>Responsável: <strong>{rnc.responsavel_nome}</strong></span>
                  </div>
                )}
                {rnc.data_prevista_encerramento && (
                  <div className="rdet-inline-info">
                    <Calendar size={13} />
                    <span>Prazo: <strong>{fmtDate(rnc.data_prevista_encerramento)}</strong></span>
                  </div>
                )}
              </div>
            )}

            {podeCorrigir && (
              <div className="rdet-card rdet-card-correction">
                <div className="rdet-card-head">
                  <div className="rdet-card-icon rdet-icon-green"><Wrench size={15} /></div>
                  <h3>Registrar Correção</h3>
                  <span className="rdet-correction-hint">
                    {isReprovada ? 'Correção reprovada - registre novamente' : 'Descreva o que foi feito e envie para aprovação'}
                  </span>
                </div>
                <div className="form-group">
                  <label className="form-label">O que foi feito para corrigir? <span style={{ color: '#dc2626' }}>*</span></label>
                  <textarea
                    className="form-input rdet-correcao-textarea"
                    rows={5}
                    value={correcaoTexto}
                    onChange={(event) => setCorrecaoTexto(event.target.value)}
                    placeholder="Descreva detalhadamente as ações tomadas para eliminar a não conformidade..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fotos da correção (opcional)</label>
                  <div
                    ref={dropCorrecaoRef}
                    className={`rdet-dropzone${draggingC ? ' dragging' : ''}`}
                    onDragOver={(event) => { event.preventDefault(); setDraggingC(true); }}
                    onDragLeave={() => setDraggingC(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDraggingC(false);
                      adicionarFotosCorrecao(event.dataTransfer.files);
                    }}
                    onClick={() => dropCorrecaoRef.current?.querySelector('input')?.click()}
                  >
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(event) => adicionarFotosCorrecao(event.target.files)} />
                    <Upload size={20} />
                    <span>Adicionar evidências da correção ({totalFotosCorrecao})</span>
                  </div>
                  {previewCorrecao.length > 0 && (
                    <div className="rdet-preview-grid">
                      {previewCorrecao.map((preview, index) => (
                        <div key={`${preview.name}-${index}`} className="rdet-preview-thumb">
                          <img src={preview.src} alt={preview.name} />
                          <button type="button" className="rdet-preview-remove" onClick={() => removerFotoCorrecao(index)}>
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rdet-correction-actions">
                  <button className="btn btn-primary rdet-send-btn" disabled={enviando || !correcaoTexto.trim()} onClick={enviarCorrecao}>
                    <Send size={15} />
                    {enviando ? 'Enviando...' : 'Enviar para aprovação'}
                  </button>
                </div>
              </div>
            )}

            {canAprovarRnc && isEmAnalise && (
              <div className="rdet-card rdet-card-approval">
                <div className="rdet-card-head">
                  <div className="rdet-card-icon rdet-icon-amber"><CheckCircle size={15} /></div>
                  <h3>Aguardando sua aprovação</h3>
                  <span className="rdet-correction-hint">Revise a correção e decida encerrar ou reprovar</span>
                </div>

                {rnc.descricao_correcao && (
                  <div className="rdet-correcao-display">
                    <p className="rdet-correcao-label">Resposta:</p>
                    <p className="rdet-correcao-text">{rnc.descricao_correcao}</p>
                  </div>
                )}

                {fotosCorrecaoRegistradas.length > 0 && (
                  <>
                    <p className="rdet-correcao-label" style={{ margin: '12px 0 8px' }}>Galeria da correção:</p>
                    <div className="rdet-gallery-grid">
                      {fotosCorrecaoRegistradas.map((anexo) => (
                        <a key={anexo.id} href={uploadFileUrl(anexo)} target="_blank" rel="noreferrer" className="rdet-gallery-item">
                          <img src={uploadFileUrl(anexo)} alt={anexo.nome_arquivo} loading="lazy" />
                          <span>{anexo.nome_arquivo}</span>
                        </a>
                      ))}
                    </div>
                  </>
                )}
                <div className="rdet-approval-btns">
                  <button className="btn btn-success rdet-approve-btn" onClick={aprovarRNC}>
                    <CheckCircle2 size={15} /> Aprovar e Encerrar
                  </button>
                  <button className="btn btn-danger rdet-reprove-btn" onClick={reprovarRNC}>
                    <XCircle size={15} /> Reprovar
                  </button>
                </div>
              </div>
            )}

            {rnc.descricao_correcao && !isEmAnalise && (
              <div className="rdet-card rdet-card-done">
                <div className="rdet-card-head">
                  <div className="rdet-card-icon rdet-icon-green"><CheckCircle2 size={15} /></div>
                  <h3>Correção registrada</h3>
                </div>

                <div className="rdet-correcao-display">
                  <p className="rdet-correcao-label">Resposta:</p>
                  <p className="rdet-correcao-text">{rnc.descricao_correcao}</p>
                </div>

                {fotosCorrecaoRegistradas.length > 0 && (
                  <>
                    <p className="rdet-correcao-label" style={{ margin: '12px 0 8px' }}>Galeria da correção:</p>
                    <div className="rdet-gallery-grid">
                      {fotosCorrecaoRegistradas.map((anexo) => (
                        <a key={anexo.id} href={uploadFileUrl(anexo)} target="_blank" rel="noreferrer" className="rdet-gallery-item">
                          <img src={uploadFileUrl(anexo)} alt={anexo.nome_arquivo} loading="lazy" />
                          <span>{anexo.nome_arquivo}</span>
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="rdet-sidebar">
            <div className="rdet-side-card">
              <h4>Informações</h4>
              {[
                { label: 'Responsável', val: cleanText(rnc.responsavel_nome) },
                { label: 'Área afetada', val: cleanText(rnc.area_afetada) },
                { label: 'Origem', val: cleanText(rnc.origem) },
                { label: 'Norma/Ref.', val: cleanText(rnc.norma_referencia) },
                { label: 'Aberta em', val: fmtDate(rnc.criado_em) },
                { label: 'Prazo', val: fmtDate(rnc.data_prevista_encerramento) },
                { label: 'RDO vinculado', val: rnc.rdo_id ? `#${rnc.rdo_id}` : null }
              ].filter((row) => row.val).map((row) => (
                <div key={row.label} className="rdet-meta-row">
                  <span>{row.label}</span>
                  <strong>{row.val}</strong>
                </div>
              ))}
            </div>

            <div className="rdet-side-card">
              <h4>Histórico</h4>
              <div className="rdet-timeline">
                {timeline.map((event, index) => {
                  const Icon = event.icon;
                  return (
                    <div key={`${event.label}-${index}`} className="rdet-timeline-item">
                      <div className="rdet-timeline-track">
                        <div className="rdet-timeline-dot" style={{ background: event.color }}>
                          <Icon size={11} color="#fff" />
                        </div>
                        {index < timeline.length - 1 && <div className="rdet-timeline-line" />}
                      </div>
                      <div className="rdet-timeline-content">
                        <strong>{event.label}</strong>
                        {event.date && <span>{event.date}</span>}
                        {event.detail && <p>{event.detail}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export default RNCDetalhes;

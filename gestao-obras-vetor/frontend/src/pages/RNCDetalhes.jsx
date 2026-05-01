import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getRNCs, updateStatusRNC, getAnexosRNC, uploadAnexoRNC,
  submitCorrecaoRNC, enviarRncParaAprovacao, getRNCPDF
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle, ArrowLeft, FileText, CheckCircle2,
  XCircle, Send, Paperclip, Wrench, User,
  Calendar, Info, Upload, X, CheckCircle
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import './RNCDetalhes.css';

/* helpers */
const cleanText = (v) => {
  if (v == null) return '';
  const t = String(v).trim();
  return (t === '' || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') ? '' : t;
};
const normalizeUploadPath = (raw) => {
  const b = cleanText(raw);
  return b ? b.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//i, '') : '';
};
const uploadFileUrl = (a) => {
  const p = normalizeUploadPath(a?.caminho_arquivo);
  return p ? `/uploads/${encodeURI(p)}` : '#';
};
const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';
const isImage = (a) => {
  const t = String(a?.tipo || '').toLowerCase();
  const n = String(a?.nome_arquivo || '').toLowerCase();
  return t.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(n);
};
const fmtDate = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('pt-BR');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR');
};
const fmtDatetime = (s) => {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return fmtDate(s);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const STATUS_META = {
  'Aberta':       { label: 'Aberta',       cls: 'status-aberta'   },
  'Em andamento': { label: 'Aberta',       cls: 'status-aberta'   },
  'Em análise':   { label: 'Em aprovação', cls: 'status-analise'  },
  'Encerrada':    { label: 'Encerrada',    cls: 'status-encerrada'},
  'Reprovada':    { label: 'Reprovada',    cls: 'status-reprovada'},
};

const GRAV_CLS = (g) => {
  if (!g) return '';
  const l = g.toLowerCase();
  if (l.includes('cr')) return 'grav-critica';
  if (l === 'alta')     return 'grav-alta';
  if (l.includes('m'))  return 'grav-media';
  return 'grav-baixa';
};

const STEPS = [
  { key: 'abertura',  label: 'Registro',  icon: AlertTriangle },
  { key: 'correcao',  label: 'Correção',   icon: Wrench        },
  { key: 'aprovacao', label: 'Aprovação',  icon: CheckCircle   },
  { key: 'encerrada', label: 'Encerrada',  icon: CheckCircle2  },
];

const stepIndex = (status) => {
  if (status === 'Em análise')              return 2;
  if (status === 'Encerrada')               return 3;
  if (status === 'Aberta' || status === 'Em andamento' || status === 'Reprovada') return 1;
  return 1;
};

function RNCDetalhes() {
  const { projetoId, rncId } = useParams();
  const navigate = useNavigate();
  const { isGestor, usuario } = useAuth();
  const { success, error } = useNotification();

  const [rnc,    setRnc]    = useState(null);
  const [loading,setLoading]= useState(true);
  const [erro,   setErro]   = useState('');
  const [anexos, setAnexos] = useState([]);

  const [correcaoTexto,   setCorrecaoTexto]   = useState('');
  const [fotosCorrecao,   setFotosCorrecao]   = useState([]);
  const [previewCorrecao, setPreviewCorrecao] = useState([]);
  const [enviando,        setEnviando]        = useState(false);
  const [draggingC,       setDraggingC]       = useState(false);
  const dropCorrecaoRef = useRef(null);

  const [fotoFile, setFotoFile] = useState(null);

  useEffect(() => { carregarRNC(); }, [rncId]);
  useEffect(() => {
    if (rnc?.descricao_correcao) setCorrecaoTexto(rnc.descricao_correcao);
  }, [rnc?.descricao_correcao]);

  const carregarRNC = async () => {
    try {
      setLoading(true);
      const res = await getRNCs(projetoId);
      const found = (res.data || []).find(r => String(r.id) === String(rncId));
      if (!found) { setErro('RNC não encontrada'); return; }
      setRnc(found);
      try {
        const aRes = await getAnexosRNC(rncId);
        setAnexos(aRes.data || []);
      } catch {}
    } catch { setErro('Erro ao carregar RNC'); }
    finally  { setLoading(false); }
  };

  const adicionarFotosCorrecao = (files) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|heic|heif|webp)$/i.test(f.name));
    if (!arr.length) return;
    setFotosCorrecao(prev => [...prev, ...arr]);
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => setPreviewCorrecao(prev => [...prev, { name: f.name, src: ev.target.result }]);
      reader.readAsDataURL(f);
    });
  };

  const removerFotoCorrecao = (i) => {
    setFotosCorrecao(prev => prev.filter((_, j) => j !== i));
    setPreviewCorrecao(prev => prev.filter((_, j) => j !== i));
  };

  const enviarCorrecao = async () => {
    if (!correcaoTexto.trim()) { error('Descreva o que foi feito para corrigir a não conformidade.'); return; }
    const totalFotosCorrecao = anexos.filter(a => a.categoria === 'correcao' && isImage(a)).length + fotosCorrecao.length;
    if (totalFotosCorrecao < 4) { error('Inclua no mínimo 4 fotos da correção para enviar à aprovação.'); return; }
    if (enviando) return;
    setEnviando(true);
    try {
      await submitCorrecaoRNC(rncId, { descricao_correcao: correcaoTexto.trim() });
      for (const foto of fotosCorrecao) {
        try {
          const fd = new FormData();
          fd.append('arquivo', foto);
          fd.append('descricao', 'Foto da correção');
          fd.append('categoria', 'correcao');
          await uploadAnexoRNC(rncId, fd);
        } catch {}
      }
      await enviarRncParaAprovacao(rncId);
      success('Correção registrada e enviada para aprovação!');
      await carregarRNC();
      setFotosCorrecao([]);
      setPreviewCorrecao([]);
    } catch (err) {
      error('Falha: ' + (err.response?.data?.erro || err.message));
    } finally { setEnviando(false); }
  };

  const aprovarRNC = async () => {
    try {
      await updateStatusRNC(rncId, 'Encerrada');
      setRnc(prev => ({ ...prev, status: 'Encerrada' }));
      success('RNC aprovada e encerrada.');
    } catch (err) { error('Falha: ' + (err.response?.data?.erro || err.message)); }
  };

  const reprovarRNC = async () => {
    try {
      await updateStatusRNC(rncId, 'Reprovada');
      setRnc(prev => ({ ...prev, status: 'Reprovada' }));
      success('RNC reprovada — responsável deve corrigir novamente.');
    } catch (err) { error('Falha: ' + (err.response?.data?.erro || err.message)); }
  };

  const uploadFotoRegistro = async () => {
    if (!fotoFile) return;
    try {
      const fd = new FormData();
      fd.append('arquivo', fotoFile);
      fd.append('descricao', 'Evidência fotográfica');
      fd.append('categoria', 'registro');
      await uploadAnexoRNC(rncId, fd);
      const res = await getAnexosRNC(rncId);
      setAnexos(res.data || []);
      setFotoFile(null);
      success('Foto adicionada.');
    } catch (err) { error('Falha ao enviar foto: ' + (err.response?.data?.erro || err.message)); }
  };

  const handleOpenPdf = async () => {
    const w = window.open('about:blank', '_blank');
    try {
      const res = await getRNCPDF(rncId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (w) w.location.href = url; else window.open(url, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (err) {
      if (Number(err?.response?.status) >= 500) {
        const token = getToken();
        const fb = token ? `/api/rnc/${rncId}/pdf?token=${encodeURIComponent(token)}` : `/api/rnc/${rncId}/pdf`;
        if (w) w.location.href = fb; else window.open(fb, '_blank');
        return;
      }
      if (w) w.close();
      error('Falha ao abrir PDF: ' + (err.response?.data?.erro || err.message));
    }
  };

  // Suporte ao campo legado registros_fotograficos (JSON com paths)
  const legacyFotos = (() => {
    if (!rnc?.registros_fotograficos) return [];
    try {
      let raw = rnc.registros_fotograficos;
      if (typeof raw === 'string') raw = JSON.parse(raw);
      if (!Array.isArray(raw)) return [];
      return raw.map((item, i) => {
        const p = typeof item === 'string' ? item : (item?.caminho_arquivo || item?.path || item?.url || '');
        if (!p) return null;
        const normalized = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//i, '');
        if (!normalized) return null;
        return { id: `legacy-${i}`, caminho_arquivo: normalized, nome_arquivo: normalized.split('/').pop(), tipo: 'image/jpeg', categoria: 'registro' };
      }).filter(Boolean);
    } catch { return []; }
  })();

  const anexosRegistro = [
    ...anexos.filter(a => !a.categoria || a.categoria === 'registro'),
    ...legacyFotos.filter(lf => !anexos.some(a => a.caminho_arquivo === lf.caminho_arquivo))
  ];
  const anexosCorrecao = anexos.filter(a => a.categoria === 'correcao');
  const fotosRegistro = anexosRegistro.filter(isImage);
  const fotosCorrecaoRegistradas = anexosCorrecao.filter(isImage);

  if (loading) return (
    <><Navbar />
      <div className="container rdet-page" style={{ textAlign: 'center', paddingTop: 80 }}>
        <div className="spinner" />
      </div>
    </>
  );

  if (!rnc) return (
    <><Navbar />
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

  const titulo      = cleanText(rnc.titulo) || `RNC #${rnc.id}`;
  const statusMeta  = STATUS_META[rnc.status] || { label: rnc.status, cls: 'status-aberta' };
  const activeStep  = stepIndex(rnc.status);
  const isEncerrada = rnc.status === 'Encerrada';
  const isEmAnalise = rnc.status === 'Em análise';
  const isAberta    = rnc.status === 'Aberta' || rnc.status === 'Em andamento';
  const isReprovada = rnc.status === 'Reprovada';
  const uid = String(usuario?.id ?? '');
  const canEdit     = (isGestor || uid === String(rnc.criado_por) || uid === String(rnc.responsavel_id)) && !isEncerrada;
  // Mostra o campo de correção sempre que a RNC está aberta/reprovada; o backend valida a permissão real
  const podeCorrigir  = isAberta || isReprovada;
  const totalFotosCorrecao = fotosCorrecaoRegistradas.length + fotosCorrecao.length;

  const timeline = [
    { icon: AlertTriangle, color: '#2563eb', label: 'RNC registrada',          date: fmtDatetime(rnc.criado_em),    detail: titulo },
    rnc.descricao_correcao && { icon: Wrench, color: '#16a34a', label: 'Correção registrada', date: fmtDatetime(rnc.atualizado_em), detail: cleanText(rnc.descricao_correcao).slice(0,80) + (cleanText(rnc.descricao_correcao).length > 80 ? '…' : '') },
    isEmAnalise && { icon: Send, color: '#d97706', label: 'Enviada para aprovação', date: fmtDatetime(rnc.atualizado_em), detail: 'Aguardando revisão do gestor' },
    isEncerrada && { icon: CheckCircle2, color: '#16a34a', label: 'RNC encerrada', date: fmtDatetime(rnc.atualizado_em), detail: 'Correção aprovada' },
    isReprovada && { icon: XCircle, color: '#dc2626', label: 'Correção reprovada', date: fmtDatetime(rnc.atualizado_em), detail: 'Responsável deve corrigir novamente' },
  ].filter(Boolean);

  return (
    <><Navbar />
      <div className="container rdet-page">

        {/* Header */}
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

        {/* Progresso */}
        <div className="rdet-progress">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done   = i < activeStep;
            const active = i === activeStep;
            return (
              <React.Fragment key={s.key}>
                <div className={`rdet-prog-step${active ? ' active' : done ? ' done' : ''}`}>
                  <div className="rdet-prog-circle"><Icon size={14} /></div>
                  <span>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`rdet-prog-line${done ? ' done' : ''}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="rdet-body">
          <div className="rdet-main">

            {/* Não Conformidade */}
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

              {(fotosRegistro.length > 0 || canEdit) && (
                <div className="rdet-gallery-block">
                  <p className="rdet-gallery-title">Fotos da não conformidade</p>
                  {fotosRegistro.length > 0 && (
                    <div className="rdet-gallery-grid">
                      {fotosRegistro.map(a => (
                        <a key={a.id} href={uploadFileUrl(a)} target="_blank" rel="noreferrer" className="rdet-gallery-item">
                          <img src={uploadFileUrl(a)} alt={a.nome_arquivo} loading="lazy" />
                          <span>{a.nome_arquivo}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {anexosRegistro.filter(a => !isImage(a)).map(a => (
                    <a key={a.id} href={uploadFileUrl(a)} target="_blank" rel="noreferrer" className="rdet-file-link">
                      <Paperclip size={13} /> {a.nome_arquivo}
                    </a>
                  ))}

                  {canEdit && (
                    <div className="rdet-upload-row">
                      <input type="file" accept="image/*" className="form-input" onChange={e => setFotoFile(e.target.files?.[0] || null)} />
                      <button className="btn btn-secondary" disabled={!fotoFile} onClick={uploadFotoRegistro}>
                        <Upload size={13} /> Enviar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* O que deve ser corrigido */}
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

            {/* Registrar Correção */}
            {podeCorrigir && (
              <div className="rdet-card rdet-card-correction">
                <div className="rdet-card-head">
                  <div className="rdet-card-icon rdet-icon-green"><Wrench size={15} /></div>
                  <h3>Registrar Correção</h3>
                  <span className="rdet-correction-hint">
                    {isReprovada ? 'Correção reprovada — registre novamente' : 'Descreva o que foi feito e envie para aprovação'}
                  </span>
                </div>
                <div className="form-group">
                  <label className="form-label">O que foi feito para corrigir? <span style={{ color: '#dc2626' }}>*</span></label>
                  <textarea
                    className="form-input rdet-correcao-textarea"
                    rows={5}
                    value={correcaoTexto}
                    onChange={e => setCorrecaoTexto(e.target.value)}
                    placeholder="Descreva detalhadamente as ações tomadas para eliminar a não conformidade..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fotos da correção (mínimo 4)</label>
                  <div
                    ref={dropCorrecaoRef}
                    className={`rdet-dropzone${draggingC ? ' dragging' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDraggingC(true); }}
                    onDragLeave={() => setDraggingC(false)}
                    onDrop={e => { e.preventDefault(); setDraggingC(false); adicionarFotosCorrecao(e.dataTransfer.files); }}
                    onClick={() => dropCorrecaoRef.current?.querySelector('input')?.click()}
                  >
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => adicionarFotosCorrecao(e.target.files)} />
                    <Upload size={20} />
                    <span>Clique ou arraste as fotos aqui ({totalFotosCorrecao}/4)</span>
                  </div>
                  {previewCorrecao.length > 0 && (
                    <div className="rdet-preview-grid">
                      {previewCorrecao.map((p, i) => (
                        <div key={i} className="rdet-preview-thumb">
                          <img src={p.src} alt={p.name} />
                          <button type="button" className="rdet-preview-remove" onClick={() => removerFotoCorrecao(i)}>
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rdet-correction-actions">
                  <button className="btn btn-primary rdet-send-btn" disabled={enviando || !correcaoTexto.trim() || totalFotosCorrecao < 4} onClick={enviarCorrecao}>
                    <Send size={15} />
                    {enviando ? 'Enviando...' : 'Enviar para aprovação'}
                  </button>
                </div>
              </div>
            )}

            {/* Aguardando Aprovação */}
            {isGestor && isEmAnalise && (
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
                      {fotosCorrecaoRegistradas.map(a => (
                        <a key={a.id} href={uploadFileUrl(a)} target="_blank" rel="noreferrer" className="rdet-gallery-item">
                          <img src={uploadFileUrl(a)} alt={a.nome_arquivo} loading="lazy" />
                          <span>{a.nome_arquivo}</span>
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

            {/* Correção registrada (histórico) */}
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
                      {fotosCorrecaoRegistradas.map(a => (
                        <a key={a.id} href={uploadFileUrl(a)} target="_blank" rel="noreferrer" className="rdet-gallery-item">
                          <img src={uploadFileUrl(a)} alt={a.nome_arquivo} loading="lazy" />
                          <span>{a.nome_arquivo}</span>
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

          </div>

          {/* Sidebar */}
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
                { label: 'RDO vinculado', val: rnc.rdo_id ? `#${rnc.rdo_id}` : null },
              ].filter(r => r.val).map(r => (
                <div key={r.label} className="rdet-meta-row">
                  <span>{r.label}</span>
                  <strong>{r.val}</strong>
                </div>
              ))}
            </div>

            <div className="rdet-side-card">
              <h4>Histórico</h4>
              <div className="rdet-timeline">
                {timeline.map((ev, i) => {
                  const Icon = ev.icon;
                  return (
                    <div key={i} className="rdet-timeline-item">
                      <div className="rdet-timeline-track">
                        <div className="rdet-timeline-dot" style={{ background: ev.color }}>
                          <Icon size={11} color="#fff" />
                        </div>
                        {i < timeline.length - 1 && <div className="rdet-timeline-line" />}
                      </div>
                      <div className="rdet-timeline-content">
                        <strong>{ev.label}</strong>
                        {ev.date && <span>{ev.date}</span>}
                        {ev.detail && <p>{ev.detail}</p>}
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

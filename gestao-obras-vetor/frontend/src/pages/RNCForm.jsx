import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { createRNC, getUsuarios, getProjeto, getRDOs, uploadAnexoRNC } from '../services/api';
import { ArrowLeft, Save, X, AlertTriangle, Camera, Wrench, Users, Calendar, Upload, CheckCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import './RNCForm.css';

function RNCForm() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { success, error: notifyError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [rdos, setRdos] = useState([]);
  const [projetoNome, setProjetoNome] = useState('');
  const [erro, setErro] = useState('');
  const dropRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    gravidade: '',
    acao_corretiva: '',
    responsavel_id: '',
    rdo_id: '',
    projeto_id: projetoId,
    data_prevista_encerramento: '',
    origem: 'Execução',
    area_afetada: '',
    norma_referencia: '',
  });
  const [localSetor, setLocalSetor] = useState('');
  const [fotos, setFotos] = useState([]);
  const [fotoPreviews, setFotoPreviews] = useState([]);

  useEffect(() => {
    const carregarDados = async () => {
      try {
        const [usuariosRes, projetoRes, rdosRes] = await Promise.all([
          getUsuarios(),
          getProjeto(projetoId),
          getRDOs(projetoId)
        ]);
        const ativos = (usuariosRes.data || []).filter((u) => {
          const ativoRaw = u?.ativo;
          const ativo = ativoRaw == null || ativoRaw === 1 || ativoRaw === true || String(ativoRaw).toLowerCase() === '1' || String(ativoRaw).toLowerCase() === 'true';
          return ativo && !u?.deletado_em;
        });
        setUsuarios(ativos);
        setRdos(Array.isArray(rdosRes?.data) ? rdosRes.data : []);
        setProjetoNome(projetoRes?.data?.nome || `Projeto #${projetoId}`);
      } catch {
        setRdos([]);
        setProjetoNome(`Projeto #${projetoId}`);
      }
    };
    carregarDados();
  }, [projetoId]);

  const formatRdoDate = (value) => {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString('pt-BR');
  };

  const adicionarFotos = (files) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|heic|heif|webp)$/i.test(f.name));
    if (!arr.length) return;
    setFotos(prev => [...prev, ...arr]);
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => setFotoPreviews(prev => [...prev, { name: f.name, src: ev.target.result }]);
      reader.readAsDataURL(f);
    });
  };

  const removerFoto = (idx) => {
    setFotos(prev => prev.filter((_, i) => i !== idx));
    setFotoPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    adicionarFotos(e.dataTransfer.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.gravidade) { setErro('Selecione a gravidade da não conformidade.'); return; }
    if (fotos.length < 4) { setErro('Inclua no mínimo 4 fotos da não conformidade.'); return; }
    setLoading(true);
    setErro('');
    try {
      const dataToSend = {
        ...formData,
        projeto_id: parseInt(projetoId),
        responsavel_id: formData.responsavel_id ? parseInt(formData.responsavel_id) : null,
        rdo_id: formData.rdo_id ? parseInt(formData.rdo_id) : null
      };
      const rncRes = await createRNC(dataToSend);
      const rncId = rncRes?.data?.id;

      const fotosComFalha = [];
      if (rncId && fotos.length > 0) {
        for (const foto of fotos) {
          try {
            const fd = new FormData();
            fd.append('arquivo', foto);
            fd.append('descricao', 'Registro fotográfico');
            fd.append('categoria', 'registro');
            await uploadAnexoRNC(rncId, fd);
          } catch { fotosComFalha.push(foto.name); }
        }
      }

      success(dataToSend.responsavel_id ? 'RNC criada e responsável notificado!' : 'RNC criada com sucesso!');
      if (fotosComFalha.length > 0) notifyError(`Fotos não enviadas: ${fotosComFalha.join(', ')}`);
      navigate(`/projeto/${projetoId}/rnc`);
    } catch (err) {
      const msg = err.response?.data?.erro || err.message || 'Erro ao criar RNC.';
      setErro(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  const set = (name) => (e) => setFormData(prev => ({ ...prev, [name]: e.target.value }));

  const GRAVIDADES = [
    { val: 'Baixa',   cor: 'grav-baixa'  },
    { val: 'Média',   cor: 'grav-media'  },
    { val: 'Alta',    cor: 'grav-alta'   },
    { val: 'Crítica', cor: 'grav-critica'},
  ];

  const responsavelNome = usuarios.find(u => String(u.id) === String(formData.responsavel_id))?.nome || null;
  const prazoFmt = formData.data_prevista_encerramento
    ? new Date(formData.data_prevista_encerramento + 'T00:00:00').toLocaleDateString('pt-BR')
    : null;

  const etapas = [
    { num: 1, label: 'Identificação', icon: AlertTriangle },
    { num: 2, label: 'Correção',      icon: Wrench        },
    { num: 3, label: 'Aprovação',     icon: CheckCircle   },
    { num: 4, label: 'Encerrada',     icon: CheckCircle   },
  ];

  return (
    <>
      <Navbar />
      <div className="container rnc-form-page">

        {/* Top bar */}
        <div className="rnc-form-topbar">
          <button className="rnc-form-back" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <div className="rnc-form-topbar-title">
            <span className="rnc-form-breadcrumb">Qualidade / Não Conformidades / <strong>Nova RNC</strong></span>
            <h1>Abrir Não Conformidade</h1>
          </div>
          <div className="rnc-form-topbar-actions">
            <button type="button" className="btn btn-ghost" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
              Cancelar
            </button>
            <button type="submit" form="rnc-form-main" className="btn btn-primary" disabled={loading}>
              <Save size={15} />
              {loading ? 'Salvando...' : 'Registrar RNC'}
            </button>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="rnc-progress-bar">
          {etapas.map((et, i) => {
            const Icon = et.icon;
            return (
              <React.Fragment key={et.num}>
                <div className={`rnc-progress-step${i === 0 ? ' active' : ''}`}>
                  <div className="rnc-progress-circle"><Icon size={14} /></div>
                  <span>{et.label}</span>
                </div>
                {i < etapas.length - 1 && <div className={`rnc-progress-line${i === 0 ? ' done' : ''}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {erro && <div className="alert alert-error" style={{ marginBottom: 16 }}>{erro}</div>}

        <div className="rnc-form-layout">
          <form id="rnc-form-main" onSubmit={handleSubmit} className="rnc-form-main">

            {/* Seção 1 — Identificação */}
            <section className="rnc-section-card">
              <div className="rnc-section-head">
                <div className="rnc-section-icon rnc-icon-red"><AlertTriangle size={16} /></div>
                <div>
                  <h3>Identificação da Não Conformidade</h3>
                  <p>O que aconteceu e onde ocorreu o problema</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Título da Não Conformidade</label>
                <input
                  className="form-input rnc-input-lg"
                  type="text"
                  name="titulo"
                  value={formData.titulo}
                  onChange={set('titulo')}
                  placeholder="Ex.: Material fora de especificação, Procedimento não seguido..."
                  required
                />
              </div>

              <div className="rnc-fields-grid rnc-fields-grid-3">
                <div className="form-group">
                  <label className="form-label">Projeto</label>
                  <input className="form-input" type="text" value={projetoNome} readOnly />
                </div>
                <div className="form-group">
                  <label className="form-label">Área / Setor afetado</label>
                  <input
                    className="form-input"
                    type="text"
                    name="area_afetada"
                    value={formData.area_afetada}
                    onChange={set('area_afetada')}
                    placeholder="Ex.: Estrutura, Elétrica, Civil"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Local / Ponto específico</label>
                  <input
                    className="form-input"
                    type="text"
                    value={localSetor}
                    onChange={e => setLocalSetor(e.target.value)}
                    placeholder="Ex.: Bloco A, km 4+200"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Gravidade</label>
                <div className="rnc-gravidade-chips">
                  {GRAVIDADES.map(g => (
                    <button
                      key={g.val}
                      type="button"
                      className={`rnc-grav-chip ${g.cor}${formData.gravidade === g.val ? ' selected' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, gravidade: g.val }))}
                    >
                      {g.val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Norma / Referência técnica</label>
                <input
                  className="form-input"
                  type="text"
                  name="norma_referencia"
                  value={formData.norma_referencia}
                  onChange={set('norma_referencia')}
                  placeholder="Ex.: ABNT NBR 6122, Procedimento PO-014"
                />
              </div>
            </section>

            {/* Seção 2 — O que aconteceu */}
            <section className="rnc-section-card">
              <div className="rnc-section-head">
                <div className="rnc-section-icon rnc-icon-orange"><AlertTriangle size={16} /></div>
                <div>
                  <h3>O que aconteceu?</h3>
                  <p>Descreva a não conformidade com o máximo de detalhes</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Descrição detalhada</label>
                <textarea
                  className="form-input rnc-textarea-main"
                  name="descricao"
                  value={formData.descricao}
                  onChange={set('descricao')}
                  rows={5}
                  placeholder="Descreva detalhadamente o que foi identificado: quando, como, quais desvios observados..."
                  required
                />
              </div>

              <div className="rnc-fields-grid rnc-fields-grid-2">
                <div className="form-group">
                  <label className="form-label">Origem</label>
                  <select className="form-input" name="origem" value={formData.origem} onChange={set('origem')}>
                    <option value="Execução">Execução</option>
                    <option value="Material">Material</option>
                    <option value="Projeto">Projeto</option>
                    <option value="Procedimento">Procedimento</option>
                    <option value="Inspeção">Inspeção</option>
                    <option value="Auditoria">Auditoria</option>
                    <option value="Cliente">Cliente</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vinculado ao RDO</label>
                  <select className="form-input" name="rdo_id" value={formData.rdo_id} onChange={set('rdo_id')}>
                    <option value="">Nenhum</option>
                    {rdos.map((rdo) => {
                      const dataLabel = formatRdoDate(rdo?.data_relatorio || rdo?.criado_em);
                      const statusLabel = rdo?.status ? ` - ${rdo.status}` : '';
                      return (
                        <option key={rdo.id} value={String(rdo.id)}>
                          {`RDO #${rdo.id}${dataLabel ? ` - ${dataLabel}` : ''}${statusLabel}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </section>

            {/* Seção 3 — O que deve ser corrigido */}
            <section className="rnc-section-card rnc-card-correction">
              <div className="rnc-section-head">
                <div className="rnc-section-icon rnc-icon-blue"><Wrench size={16} /></div>
                <div>
                  <h3>O que deve ser corrigido?</h3>
                  <p>Defina a ação corretiva esperada e o responsável por executá-la</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Ação corretiva esperada</label>
                <textarea
                  className="form-input rnc-textarea-correction"
                  name="acao_corretiva"
                  value={formData.acao_corretiva}
                  onChange={set('acao_corretiva')}
                  rows={4}
                  placeholder="Descreva claramente o que precisa ser feito para corrigir e evitar a recorrência..."
                  required
                />
              </div>

              <div className="rnc-fields-grid rnc-fields-grid-2">
                <div className="form-group">
                  <label className="form-label"><Users size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Responsável pela correção</label>
                  <select className="form-input" name="responsavel_id" value={formData.responsavel_id} onChange={set('responsavel_id')}>
                    <option value="">Selecione o responsável</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label"><Calendar size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Prazo para encerramento</label>
                  <input
                    className="form-input"
                    type="date"
                    name="data_prevista_encerramento"
                    value={formData.data_prevista_encerramento}
                    onChange={set('data_prevista_encerramento')}
                  />
                </div>
              </div>
            </section>

            {/* Seção 4 — Fotos */}
            <section className="rnc-section-card">
              <div className="rnc-section-head">
                <div className="rnc-section-icon rnc-icon-teal"><Camera size={16} /></div>
                <div>
                  <h3>Evidências fotográficas</h3>
                  <p>Registre no mínimo 4 fotos da não conformidade como evidência</p>
                </div>
              </div>

              <div
                ref={dropRef}
                className={`rnc-dropzone${dragging ? ' dragging' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => dropRef.current?.querySelector('input')?.click()}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => adicionarFotos(e.target.files)}
                />
                <Upload size={28} className="rnc-dropzone-icon" />
                <p><strong>Clique ou arraste as fotos aqui</strong></p>
                <small>JPG, PNG, HEIC — até 10 MB por arquivo (mínimo de 4 fotos)</small>
              </div>

              {fotoPreviews.length > 0 && (
                <div className="rnc-photo-preview-grid">
                  {fotoPreviews.map((p, i) => (
                    <div key={i} className="rnc-photo-thumb">
                      <img src={p.src} alt={p.name} />
                      <button type="button" className="rnc-photo-remove" onClick={() => removerFoto(i)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="rnc-form-submit-row">
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                <Save size={16} />
                {loading ? 'Registrando...' : 'Registrar RNC'}
              </button>
            </div>
          </form>

          {/* Sidebar */}
          <aside className="rnc-form-sidebar">
            <div className="rnc-side-card rnc-side-summary">
              <h4>Resumo</h4>
              <div className="rnc-side-item">
                <span>Título</span>
                <strong>{formData.titulo || <em>Não preenchido</em>}</strong>
              </div>
              {formData.gravidade && (
                <div className="rnc-side-item">
                  <span>Gravidade</span>
                  <strong className={`rnc-grav-pill ${
                    formData.gravidade === 'Baixa'   ? 'grav-baixa'  :
                    formData.gravidade === 'Média'   ? 'grav-media'  :
                    formData.gravidade === 'Alta'    ? 'grav-alta'   : 'grav-critica'
                  }`}>{formData.gravidade}</strong>
                </div>
              )}
              {formData.area_afetada && (
                <div className="rnc-side-item">
                  <span>Área</span>
                  <strong>{formData.area_afetada}</strong>
                </div>
              )}
              {responsavelNome && (
                <div className="rnc-side-item">
                  <span>Responsável</span>
                  <strong>{responsavelNome}</strong>
                </div>
              )}
              {prazoFmt && (
                <div className="rnc-side-item">
                  <span>Prazo</span>
                  <strong>{prazoFmt}</strong>
                </div>
              )}
              {fotos.length > 0 && (
                <div className="rnc-side-item">
                  <span>Fotos</span>
                  <strong>{fotos.length} selecionada{fotos.length > 1 ? 's' : ''}</strong>
                </div>
              )}
              <div className="rnc-side-item">
                <span>Projeto</span>
                <strong>{projetoNome}</strong>
              </div>
            </div>

            <div className="rnc-side-card">
              <h4>Fluxo de tratativa</h4>
              <div className="rnc-side-flow">
                <div className="rnc-side-flow-step active">
                  <div className="rnc-sflow-dot"><AlertTriangle size={11} /></div>
                  <div>
                    <strong>Registro</strong>
                    <p>Você está aqui</p>
                  </div>
                </div>
                <div className="rnc-side-flow-step">
                  <div className="rnc-sflow-dot"><Wrench size={11} /></div>
                  <div>
                    <strong>Correção</strong>
                    <p>Responsável registra</p>
                  </div>
                </div>
                <div className="rnc-side-flow-step">
                  <div className="rnc-sflow-dot"><CheckCircle size={11} /></div>
                  <div>
                    <strong>Aprovação</strong>
                    <p>Gestor aprova</p>
                  </div>
                </div>
                <div className="rnc-side-flow-step">
                  <div className="rnc-sflow-dot"><CheckCircle size={11} /></div>
                  <div>
                    <strong>Encerrada</strong>
                    <p>RNC concluída</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rnc-side-card rnc-side-tips">
              <h4>Dicas de preenchimento</h4>
              <ul>
                <li>Seja específico na descrição: mencione medições e desvios</li>
                <li>A ação corretiva deve evitar que o problema se repita</li>
                <li>Fotos são fundamentais para registro e PDF</li>
                <li>Defina sempre um responsável para não ficar sem acompanhamento</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export default RNCForm;

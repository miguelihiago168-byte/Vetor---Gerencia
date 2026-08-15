import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjetos, createProjeto, updateProjeto, getUsuarios, arquivarProjeto, desarquivarProjeto, getDashboardAvanco, copiarEapProjeto } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { Plus, Edit, Users, Calendar, Archive, RotateCcw, Eye, EyeOff, MapPin } from 'lucide-react';
import { IconButton } from '../components/ui/Button';
import './Projetos.css';

// Datas DATE do PostgreSQL podem chegar como "YYYY-MM-DD" ou como timestamp ISO.
// Mantemos apenas a parte do calendário para evitar mudança de fuso e strings como
// "2026-08-15T00:00:00.000ZT00:00:00", que resultam em Invalid Date.
const getDateKey = (value) => {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const parseProjectDeadline = (value) => {
  const dateKey = getDateKey(value);
  if (!dateKey) return null;

  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

function Projetos() {
  const { confirm } = useDialog();
  const { success: notifySuccess, error: notifyError } = useNotification();
  const [projetos, setProjetos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    empresa_responsavel: '',
    empresa_executante: '',
    prazo_termino: '',
    cidade: '',
    usuarios: []
  });
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [showArquivados, setShowArquivados] = useState(false);
  const [copiarEapDe, setCopiarEapDe] = useState('');
  
  const { isGestor, perfil } = useAuth();
  const navigate = useNavigate();
  const podeListarUsuarios = perfil === 'ADM' || perfil === 'Gestor Geral';

  const projetosFiltrados = projetos.filter((p) => showArquivados ? p.arquivado === 1 : p.arquivado === 0);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const projetosRes = await getProjetos();
      
      // Carregar avanço para cada projeto
      const projetosComAvanco = await Promise.all(
        projetosRes.data.map(async (projeto) => {
          try {
            const avancoRes = await getDashboardAvanco(projeto.id);
            return {
              ...projeto,
              percentual_progresso: avancoRes.data?.avanco_geral?.avanco_medio || 0
            };
          } catch (error) {
            console.error(`Erro ao carregar avanço do projeto ${projeto.id}:`, error);
            return {
              ...projeto,
              percentual_progresso: projeto.percentual_progresso || 0
            };
          }
        })
      );
      
      setProjetos(projetosComAvanco);
      if (podeListarUsuarios) {
        try {
          const usuariosRes = await getUsuarios();
          setUsuarios(usuariosRes.data || []);
        } catch (errorUsuarios) {
          console.warn('Sem permissão para listar usuários no modal de projetos.', errorUsuarios?.response?.status);
          setUsuarios([]);
        }
      } else {
        setUsuarios([]);
      }
      if (isGestor && projetosComAvanco.length === 0) {
        setShowModal(true);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setErro('Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    try {
      if (editando) {
        await updateProjeto(editando.id, formData);
        setSucesso('Projeto atualizado com sucesso!');
        notifySuccess('Projeto atualizado com sucesso!', 4000);
      } else {
        const res = await createProjeto(formData);
        const novoId = res.data?.projeto?.id;
        if (copiarEapDe && novoId) {
          try {
            await copiarEapProjeto(novoId, Number(copiarEapDe));
            setSucesso('Projeto criado e EAP copiada com sucesso!');
            notifySuccess('Projeto criado e EAP copiada com sucesso!', 4500);
          } catch (eapErr) {
            const msg = 'Projeto criado! Não foi possível copiar a EAP: ' + (eapErr.response?.data?.erro || 'Erro desconhecido');
            setSucesso(msg);
            notifyError(msg, 6000);
          }
        } else {
          setSucesso('Projeto criado com sucesso!');
          notifySuccess('Projeto criado com sucesso!', 4000);
        }
      }
      
      await carregarDados();
      fecharModal();
      
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      const msg = error.response?.data?.erro || 'Erro ao salvar projeto.';
      setErro(msg);
      notifyError(msg, 6000);
    }
  };

  const abrirModal = (projeto = null) => {
    if (projeto) {
      setEditando(projeto);
      setFormData({
        nome: projeto.nome,
        empresa_responsavel: projeto.empresa_responsavel,
        empresa_executante: projeto.empresa_executante,
        prazo_termino: getDateKey(projeto.prazo_termino),
        cidade: projeto.cidade,
        usuarios: projeto.usuarios?.map(u => u.id) || []
      });
    } else {
      setEditando(null);
      setFormData({
        nome: '',
        empresa_responsavel: '',
        empresa_executante: '',
        prazo_termino: '',
        cidade: '',
        usuarios: []
      });
    }
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
    setErro('');
    setCopiarEapDe('');
  };

  const handleArquivar = async (id) => {
    const ok = await confirm({
      title: 'Arquivar projeto',
      message: 'Deseja arquivar este projeto? Ele ficará inacessível até ser desarquivado.',
      confirmText: 'Arquivar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await arquivarProjeto(id);
      setSucesso('Projeto arquivado com sucesso!');
      notifySuccess('Projeto arquivado com sucesso!', 4000);
      await carregarDados();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao arquivar projeto.');
      notifyError('Erro ao arquivar projeto.', 6000);
    }
  };

  const handleDesarquivar = async (id) => {
    const ok = await confirm({
      title: 'Restaurar projeto',
      message: 'Deseja restaurar este projeto?',
      confirmText: 'Restaurar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await desarquivarProjeto(id);
      setSucesso('Projeto restaurado com sucesso!');
      notifySuccess('Projeto restaurado com sucesso!', 4000);
      await carregarDados();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao restaurar projeto.');
      notifyError('Erro ao restaurar projeto.', 6000);
    }
  };

  const handleUsuarioChange = (usuarioId) => {
    const usuariosSelecionados = formData.usuarios.includes(usuarioId)
      ? formData.usuarios.filter(id => id !== usuarioId)
      : [...formData.usuarios, usuarioId];
    
    setFormData({ ...formData, usuarios: usuariosSelecionados });
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="loading"><div className="spinner"></div></div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container projetos-page">
        <div className="projetos-header">
          <div>
            <h1>Projetos</h1>
            <p>{showArquivados ? 'Projetos arquivados' : 'Obras ativas'}</p>
          </div>
          <div className="projetos-actions">
            <button 
              className={`btn projetos-btn-toggle ${showArquivados ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setShowArquivados(!showArquivados)}
            >
              {showArquivados ? <Eye size={18} /> : <EyeOff size={18} />}
              {showArquivados ? 'Mostrar ativos' : 'Mostrar arquivados'}
            </button>
            {isGestor && (
              <button onClick={() => abrirModal()} className="btn btn-primary projetos-btn-new">
                <Plus size={20} />
                Novo Projeto
              </button>
            )}
          </div>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div className="projetos-grid">
          {projetosFiltrados.map((projeto) => {
            const pct = Math.round(projeto.percentual_progresso || 0);
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const prazo = parseProjectDeadline(projeto.prazo_termino);
            const diasRestantes = prazo ? Math.round((prazo - hoje) / (1000 * 60 * 60 * 24)) : null;
            const prazoTone = diasRestantes === null ? 'muted'
              : diasRestantes > 30 ? 'ok'
              : diasRestantes > 0  ? 'soon'
              : 'late';
            const prazoLabel = diasRestantes === null ? 'Sem prazo'
              : diasRestantes > 0 ? `Restam ${diasRestantes}d`
              : diasRestantes === 0 ? 'Vence hoje'
              : `Vencido há ${Math.abs(diasRestantes)}d`;

            return (
              <div
                key={projeto.id}
                onClick={() => navigate(perfil === 'Almoxarife' ? `/projeto/${projeto.id}/compras` : `/projeto/${projeto.id}`)}
                className="projeto-card"
              >
                <div className="projeto-card-main">
                  <div className="projeto-card-top">
                    <div className="projeto-title-block">
                      <h3>{projeto.nome}</h3>
                      {projeto.cidade && (
                        <span className="projeto-city">
                          <MapPin size={12} />
                          {projeto.cidade}
                        </span>
                      )}
                    </div>
                    <span className="projeto-progress-value">{pct}%</span>
                  </div>

                  <div className="projeto-meta">
                    <span>Contratante: <strong>{projeto.empresa_responsavel || '-'}</strong></span>
                    <span>Executante: <strong>{projeto.empresa_executante || '-'}</strong></span>
                  </div>

                  <div className="projeto-progress" aria-label={`Progresso ${pct}%`}>
                    <div style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
                  </div>

                  <div className="projeto-date-row">
                    <span>
                      <Calendar size={14} />
                      {prazo ? prazo.toLocaleDateString('pt-BR') : 'Sem prazo'}
                    </span>
                    <strong className={`projeto-date-${prazoTone}`}>{prazoLabel}</strong>
                  </div>
                </div>
                {isGestor && (
                  <div
                    className="projeto-card-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButton
                      onClick={() => abrirModal(projeto)}
                      icon={Edit}
                      label={`Editar ${projeto.nome}`}
                      size="sm"
                      tone="neutral"
                      variant="outline"
                    />
                    <IconButton
                      onClick={() => showArquivados ? handleDesarquivar(projeto.id) : handleArquivar(projeto.id)}
                      icon={showArquivados ? RotateCcw : Archive}
                      label={`${showArquivados ? 'Restaurar' : 'Arquivar'} ${projeto.nome}`}
                      size="sm"
                      tone="warning"
                      variant="outline"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showArquivados && (
          <div className="projetos-archive-note">
            Mostrando projetos <strong>arquivados</strong>.
          </div>
        )}

        {projetos.length === 0 && (
          <div className="card text-center" style={{ padding: '60px' }}>
            <h3 style={{ color: 'var(--gray-500)' }}>Nenhum projeto cadastrado</h3>
            <p style={{ color: 'var(--gray-400)', marginTop: '8px' }}>
              {isGestor ? 'Crie o primeiro projeto para começar.' : 'Você não está vinculado a nenhum projeto.'}
            </p>
            {isGestor && (
              <button className="btn btn-primary mt-2" onClick={() => setShowModal(true)}>
                <Plus size={18} /> Criar projeto
              </button>
            )}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={fecharModal}>
            <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex-between mb-3">
                <h2 style={{ margin: 0 }}>{editando ? 'Editar Projeto' : 'Novo Projeto'}</h2>
                <button type="button" className="btn btn-secondary" onClick={fecharModal}>Fechar</button>
              </div>

              {erro && <div className="alert alert-error mb-3">{erro}</div>}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Nome do Projeto *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Empresa Responsável *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.empresa_responsavel}
                    onChange={(e) => setFormData({ ...formData, empresa_responsavel: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Empresa Executante *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.empresa_executante}
                    onChange={(e) => setFormData({ ...formData, empresa_executante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Prazo de Término *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.prazo_termino}
                    onChange={(e) => setFormData({ ...formData, prazo_termino: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Cidade *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    required
                  />
                </div>

                {!editando && projetos.filter(p => p.arquivado === 0).length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Copiar EAP de outro projeto (opcional)</label>
                    <select
                      className="form-select"
                      value={copiarEapDe}
                      onChange={(e) => setCopiarEapDe(e.target.value)}
                    >
                      <option value="">— Não copiar EAP —</option>
                      {projetos.filter(p => p.arquivado === 0).map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                    {copiarEapDe && (
                      <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                        A estrutura de atividades será copiada. Percentuais zerados, status "Não iniciada".
                      </small>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">
                    <Users size={16} style={{ display: 'inline', marginRight: '6px' }} />
                    Usuários Vinculados
                  </label>
                  <div style={{ 
                    border: '1px solid var(--gray-300)', 
                    borderRadius: '6px', 
                    padding: '12px',
                    maxHeight: '200px',
                    overflow: 'auto'
                  }}>
                    {usuarios.length > 0 ? (
                      usuarios.map(usuario => (
                        <div key={usuario.id} style={{ marginBottom: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.usuarios.includes(usuario.id)}
                              onChange={() => handleUsuarioChange(usuario.id)}
                              style={{ marginRight: '8px' }}
                            />
                            <span>{usuario.nome} ({usuario.login})</span>
                            {usuario.is_gestor === 1 && (
                              <span className="badge badge-blue" style={{ marginLeft: '8px' }}>Gestor</span>
                            )}
                          </label>
                        </div>
                      ))
                    ) : (
                      <p style={{ margin: 0, color: 'var(--gray-500)' }}>
                        Sem permissão para listar usuários nesta conta.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {editando ? 'Atualizar' : 'Criar'} Projeto
                  </button>
                  <button 
                    type="button" 
                    onClick={fecharModal} 
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default Projetos;

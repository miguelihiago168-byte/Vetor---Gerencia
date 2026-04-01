import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjetos, createProjeto, updateProjeto, deleteProjeto, getUsuarios, arquivarProjeto, desarquivarProjeto, getDashboardAvanco, copiarEapProjeto } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { Plus, Edit, Trash2, Users, Calendar, Building, Archive, RotateCcw, Eye, EyeOff } from 'lucide-react';

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
        prazo_termino: projeto.prazo_termino,
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

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Desativar projeto',
      message: 'Deseja realmente desativar este projeto?',
      confirmText: 'Desativar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await deleteProjeto(id);
      setSucesso('Projeto desativado com sucesso!');
      notifySuccess('Projeto desativado com sucesso!', 4000);
      await carregarDados();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao desativar projeto.');
      notifyError('Erro ao desativar projeto.', 6000);
    }
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
      <div className="container">
        <div className="flex-between mb-4">
          <h1>Projetos</h1>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              className={`btn ${showArquivados ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setShowArquivados(!showArquivados)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {showArquivados ? <Eye size={18} /> : <EyeOff size={18} />}
              {showArquivados ? 'Mostrar ativos' : 'Mostrar arquivados'}
            </button>
            {isGestor && (
              <button onClick={() => abrirModal()} className="btn btn-primary">
                <Plus size={20} />
                Novo Projeto
              </button>
            )}
          </div>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {projetosFiltrados.map((projeto) => {
            const pct = Math.round(projeto.percentual_progresso || 0);
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const prazo = projeto.prazo_termino ? new Date(projeto.prazo_termino + 'T00:00:00') : null;
            const diasRestantes = prazo ? Math.round((prazo - hoje) / (1000 * 60 * 60 * 24)) : null;
            const barColor = pct >= 80 ? '#22c55e' : pct >= 40 ? '#3b82f6' : '#f59e0b';
            const prazoColor = diasRestantes === null ? '#94a3b8'
              : diasRestantes > 30 ? '#15803d'
              : diasRestantes > 0  ? '#d97706'
              : '#dc2626';
            const prazoBg = diasRestantes === null ? '#f8fafc'
              : diasRestantes > 30 ? '#f0fdf4'
              : diasRestantes > 0  ? '#fffbeb'
              : '#fef2f2';

            return (
              <div
                key={projeto.id}
                onClick={() => navigate(perfil === 'Almoxarife' ? `/projeto/${projeto.id}/compras` : `/projeto/${projeto.id}`)}
                style={{
                  background: 'var(--card-bg)',
                  borderRadius: '14px',
                  padding: '22px 24px',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.11)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.07)'; }}
              >
                {/* Cabeçalho */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {projeto.nome}
                    </h3>
                    {projeto.cidade && (
                      <span style={{
                        flexShrink: 0, fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                        borderRadius: '999px', background: '#f1f5f9', color: '#64748b',
                      }}>
                        📍 {projeto.cidade}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      <span style={{ color: '#94a3b8' }}>Contratante:</span>{' '}
                      <span style={{ fontWeight: 500 }}>{projeto.empresa_responsavel || '—'}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      <span style={{ color: '#94a3b8' }}>Executante:</span>{' '}
                      <span style={{ fontWeight: 500 }}>{projeto.empresa_executante || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Barra de progresso */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Progresso</span>
                    <span style={{ fontWeight: 700, color: barColor }}>{pct}%</span>
                  </div>
                  <div style={{ background: 'var(--border-medium)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: '999px',
                      background: barColor, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>

                {/* Prazo */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: prazoBg, borderRadius: '8px', padding: '8px 12px',
                  marginBottom: '14px',
                }}>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Calendar size={13} color="#94a3b8" />
                    {prazo ? prazo.toLocaleDateString('pt-BR') : 'Sem prazo'}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: prazoColor }}>
                    {diasRestantes === null ? 'Sem prazo'
                      : diasRestantes > 0 ? `Restam ${diasRestantes}d`
                      : diasRestantes === 0 ? 'Vence hoje'
                      : `Vencido há ${Math.abs(diasRestantes)}d`}
                  </span>
                </div>

                {/* Ações de gestão (interrompem propagação do clique) */}
                {isGestor && (
                  <div
                    style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-default)', paddingTop: '12px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => abrirModal(projeto)}
                      className="btn btn-icon btn-secondary"
                      title="Editar"
                      style={{ padding: '5px 8px' }}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => showArquivados ? handleDesarquivar(projeto.id) : handleArquivar(projeto.id)}
                      className="btn btn-icon btn-warning"
                      title={showArquivados ? 'Restaurar' : 'Arquivar'}
                      style={{ padding: '5px 8px' }}
                    >
                      {showArquivados ? <RotateCcw size={14} /> : <Archive size={14} />}
                    </button>
                    <button
                      onClick={() => handleDelete(projeto.id)}
                      className="btn btn-icon btn-danger"
                      title="Excluir"
                      style={{ padding: '5px 8px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showArquivados && (
          <div className="alert" style={{ backgroundColor: 'var(--badge-yellow-bg)', borderLeft: '4px solid var(--badge-yellow-color)', marginBottom: '20px', color: 'var(--badge-yellow-color)' }}>
            ⚠️ Mostrando projetos <strong>arquivados</strong>. Clique no botão acima para retornar aos projetos ativos.
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

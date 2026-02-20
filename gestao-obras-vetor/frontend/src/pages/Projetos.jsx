import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjetos, createProjeto, updateProjeto, deleteProjeto, getUsuarios, arquivarProjeto, desarquivarProjeto, getDashboardAvanco } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { Plus, Edit, Trash2, Users, Calendar, Building, Archive, RotateCcw, Eye, EyeOff } from 'lucide-react';

function Projetos() {
  const { confirm } = useDialog();
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
      } else {
        await createProjeto(formData);
        setSucesso('Projeto criado com sucesso!');
      }
      
      await carregarDados();
      fecharModal();
      
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao salvar projeto.');
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
      await carregarDados();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao desativar projeto.');
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
      await carregarDados();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao arquivar projeto.');
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
      await carregarDados();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao restaurar projeto.');
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

        <div className="grid grid-1 md:grid-2 lg:grid-3 gap-4">
          {projetosFiltrados.map((projeto) => (
            <div key={projeto.id} className="card">
              <div className="card-header">
                <div className="flex-between">
                  <h3 className="card-title">{projeto.nome}</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => abrirModal(projeto)} 
                      className="btn btn-icon btn-secondary"
                      title="Editar"
                    >
                      <Edit size={16} />
                    </button>
                    {isGestor && (
                      <>
                        <button 
                          onClick={() => showArquivados ? handleDesarquivar(projeto.id) : handleArquivar(projeto.id)} 
                          className="btn btn-icon btn-warning"
                          title={showArquivados ? 'Desarquivar' : 'Arquivar'}
                        >
                          {showArquivados ? <RotateCcw size={16} /> : <Archive size={16} />}
                        </button>
                        <button 
                          onClick={() => handleDelete(projeto.id)} 
                          className="btn btn-icon btn-danger"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="card-meta">
                  <span className="badge badge-primary">#{projeto.id}</span>
                  {projeto.cidade && <span className="badge badge-secondary">{projeto.cidade}</span>}
                </div>
              </div>
              
              <div className="card-body">
                <div className="project-info">
                  <div className="info-item">
                    <Building size={16} />
                    <span>{projeto.empresa_executante || 'Não informado'}</span>
                  </div>
                  <div className="info-item">
                    <Calendar size={16} />
                    <span>
                      {projeto.prazo_termino 
                        ? new Date(projeto.prazo_termino).toLocaleDateString('pt-BR')
                        : 'Sem prazo'
                      }
                    </span>
                  </div>
                  <div className="info-item">
                    <Users size={16} />
                    <span>{Number(projeto.total_usuarios ?? projeto.usuarios?.length ?? 0)} usuários</span>
                  </div>
                </div>
                
                <div className="progress-bar mt-3">
                  <div 
                    className="progress-fill"
                    style={{ width: `${projeto.percentual_progresso || 0}%` }}
                  ></div>
                </div>
                <div className="progress-text">
                  {Math.round(projeto.percentual_progresso || 0)}% concluído
                </div>
              </div>
              <div className="card-footer">
                <button 
                  onClick={() => navigate(`/projeto/${projeto.id}`)} 
                  className="btn btn-primary btn-block"
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))}
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        {showArquivados && (
          <div className="alert" style={{ backgroundColor: '#fff3cd', borderLeft: '4px solid #ffc107', marginBottom: '20px', color: '#856404' }}>
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
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}>
              <h2 className="mb-3">{editando ? 'Editar Projeto' : 'Novo Projeto'}</h2>

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

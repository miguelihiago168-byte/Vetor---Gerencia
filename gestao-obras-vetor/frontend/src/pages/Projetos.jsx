import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjetos, createProjeto, updateProjeto, deleteProjeto, getUsuarios } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit, Trash2, Users, Calendar, Building } from 'lucide-react';

function Projetos() {
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
  
  const { isGestor } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const [projetosRes, usuariosRes] = await Promise.all([
        getProjetos(),
        getUsuarios()
      ]);
      setProjetos(projetosRes.data);
      setUsuarios(usuariosRes.data);
      if (isGestor && projetosRes.data.length === 0) {
        setShowModal(true);
      }
    } catch (error) {
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
    if (!window.confirm('Deseja realmente desativar este projeto?')) return;

    try {
      await deleteProjeto(id);
      setSucesso('Projeto desativado com sucesso!');
      await carregarDados();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao desativar projeto.');
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
          {isGestor && (
            <button onClick={() => abrirModal()} className="btn btn-primary">
              <Plus size={20} />
              Novo Projeto
            </button>
          )}
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div className="grid grid-3">
          {projetos.map(projeto => (
            <div key={projeto.id} className="card" style={{ cursor: 'pointer' }}>
              <div onClick={() => navigate(`/projeto/${projeto.id}`)}>
                <h3 style={{ marginBottom: '12px', color: 'var(--primary)' }}>
                  {projeto.nome}
                </h3>
                
                <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                  <Building size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  <strong>Responsável:</strong> {projeto.empresa_responsavel}
                </div>
                
                <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                  <Building size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  <strong>Executante:</strong> {projeto.empresa_executante}
                </div>
                
                <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                  <Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  <strong>Prazo:</strong> {new Date(projeto.prazo_termino).toLocaleDateString('pt-BR')}
                </div>
                
                <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '12px' }}>
                  📍 <strong>{projeto.cidade}</strong>
                </div>
                {/* Layout simplificado: retornado ao estado anterior sem colunas Previsto/Executado */}
              </div>

              {isGestor && (
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => abrirModal(projeto)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '8px' }}
                  >
                    <Edit size={16} />
                    Editar
                  </button>
                  <button 
                    onClick={() => handleDelete(projeto.id)}
                    className="btn btn-danger"
                    style={{ flex: 1, padding: '8px' }}
                  >
                    <Trash2 size={16} />
                    Desativar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {projetos.length === 0 && (
          <div className="card text-center" style={{ padding: '60px' }}>
            <h3 style={{ color: 'var(--gray-500)' }}>Nenhum projeto cadastrado</h3>
            <p style={{ color: 'var(--gray-400)', marginTop: '8px' }}>
              {isGestor ? 'Crie o primeiro projeto e vincule a equipe.' : 'Você não está vinculado a nenhum projeto.'}
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
                    {usuarios.map(usuario => (
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
                    ))}
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

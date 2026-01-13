import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { getUsuarios, getUsuario, createUsuario, updateUsuario, updateUsuarioGestor, deleteUsuario, getNovoLogin, getProjetos } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Shield, Crown, UserPlus, Trash2 } from 'lucide-react';

function Usuarios() {
  const { isGestor } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [formData, setFormData] = useState({ 
    nome: '', 
    email: '', 
    senha: '',
    pin: '',
    is_gestor: 0 
  });
  const [loginGerado, setLoginGerado] = useState('');

  useEffect(() => {
    const carregar = async () => {
      try {
        const res = await getUsuarios();
        setUsuarios(res.data);
        // carregar projetos para vinculação
        try {
          const projetosRes = await getProjetos();
          setProjetos(projetosRes.data);
        } catch (err) {
          // ignore projetos load
        }
      } catch (error) {
        setErro('Erro ao carregar usuários.');
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    console.log('Vai inserir o usuario:', formData);

    if (!formData.nome) {
      setErro('Preencha o nome.');
      return;
    }

    if (!editingUserId) {
      if (!formData.senha) {
        setErro('Preencha a senha.');
        return;
      }
      if (formData.senha.length !== 6 || !/^\d+$/.test(formData.senha)) {
        setErro('A senha deve ter 6 dígitos.');
        return;
      }
      if (!formData.projeto_id) {
        setErro('Selecione um projeto para vincular o usuário.');
        return;
      }
    }

    if (formData.pin && (formData.pin.length !== 6 || !/^\d+$/.test(formData.pin))) {
      setErro('O PIN deve ter 6 dígitos.');
      return;
    }

    try {
      if (editingUserId) {
        const payload = {
          nome: formData.nome,
          pin: formData.pin || undefined,
          is_gestor: formData.is_gestor,
          ativo: formData.ativo
        };
        if (formData.senha && formData.senha.length === 6) payload.senha = formData.senha;
        await updateUsuario(editingUserId, payload);
        const list = await getUsuarios();
        setUsuarios(list.data);
        setSucesso('Usuário atualizado com sucesso.');
        setShowModal(false);
        setEditingUserId(null);
        setFormData({ nome: '', email: '', senha: '', pin: '', is_gestor: 0 });
        setLoginGerado('');
      } else {
        const payload = {
          nome: formData.nome,
          senha: formData.senha,
          pin: formData.pin || undefined,
          is_gestor: formData.is_gestor,
          projeto_id: formData.projeto_id
        };
        if (loginGerado) payload.login = loginGerado;
  

      
        const res = await createUsuario(payload);
       
        const novo = res.data?.usuario;

        const list = await getUsuarios();
        setUsuarios(list.data);
        setSucesso(`Usuário criado com sucesso! Login gerado: ${novo?.login || ''}`);
        setShowModal(false);
        setFormData({ nome: '', email: '', senha: '', pin: '', is_gestor: 0 });
        setLoginGerado('');
      }
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao criar/atualizar usuário.');
    }
  };

  const abrirEdicao = (u) => {
    (async () => {
      try {
        const res = await getUsuario(u.id);
        const dados = res.data;
        setEditingUserId(dados.id);
        setFormData({ nome: dados.nome || '', email: dados.email || '', senha: '', pin: dados.pin || '', is_gestor: dados.is_gestor ? 1 : 0, ativo: dados.ativo, projeto_id: dados.projeto_id });
        setLoginGerado(dados.login || '');
        setShowModal(true);
      } catch (err) {
        setErro('Erro ao carregar usuário para edição.');
      }
    })();
  };

  const handleGerarLogin = async () => {
    try {
      const res = await getNovoLogin();
      setLoginGerado(res.data.login);
    } catch (err) {
      setErro('Erro ao gerar ID.');
    }
  };

  const toggleGestor = async (id, atual) => {
    try {
      await updateUsuarioGestor(id, atual ? 0 : 1);
      const res = await getUsuarios();
      setUsuarios(res.data);
    } catch (error) {
      setErro('Erro ao atualizar permissões.');
    }
  };

  const desativar = async (id) => {
    if (!window.confirm('Deseja desativar este usuário?')) return;
    try {
      await deleteUsuario(id);
      setUsuarios(usuarios.map((u) => u.id === id ? { ...u, ativo: 0 } : u));
    } catch (error) {
      setErro('Erro ao desativar usuário.');
    }
  };

  if (!isGestor) {
    return (
      <>
        <Navbar />
        <div className="container">
          <div className="card" style={{ marginTop: '20px' }}>
            <h3 className="card-header">Acesso restrito</h3>
            <p>Apenas gestores podem gerenciar usuários.</p>
          </div>
        </div>
      </>
    );
  }

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
        <div className="flex-between mb-3">
          <div>
            <p className="eyebrow">Equipe</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={24} /> Usuários
            </h1>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <UserPlus size={18} /> Novo usuário
          </button>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div className="grid grid-3">
          {usuarios.map((u) => (
            <div key={u.id} className="card" style={{ border: u.ativo ? '1px solid #e2e8f0' : '1px dashed #fca5a5' }}>
              <div className="flex-between mb-1">
                <div>
                  <p className="eyebrow">Login: {u.login}</p>
                  <h3>{u.nome}</h3>
                  <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>ID: {u.id}</p>
                  {u.pin && <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>PIN: {u.pin}</p>}
                  <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>{u.email || 'sem e-mail'}</p>
                </div>
                {u.is_gestor === 1 && (
                  <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Crown size={14} /> Gestor
                  </span>
                )}
              </div>

              <div className="flex gap-1">
                <button className="btn btn-secondary" onClick={() => abrirEdicao(u)}>Editar</button>
                <button className="btn btn-secondary" onClick={() => toggleGestor(u.id, u.is_gestor === 1)}>
                  {u.is_gestor === 1 ? 'Remover gestor' : 'Promover a gestor'}
                </button>
                <button className="btn btn-danger" onClick={() => desativar(u.id)} disabled={u.ativo === 0}>
                  <Trash2 size={16} />
                </button>
              </div>

              <p style={{ marginTop: '10px', color: u.ativo ? 'var(--success)' : 'var(--danger)' }}>
                {u.ativo ? 'Ativo' : 'Desativado'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="flex-between mb-2">
              <h2>{editingUserId ? 'Editar usuário' : 'Novo usuário'}</h2>
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingUserId(null); }}>Fechar</button>
            </div>

            {erro && <div className="alert alert-error">{erro}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Nome completo"
                  required
                />
              </div>

              {/* Login será gerado automaticamente pelo sistema; gestor informa apenas a senha */}

              <div className="form-group">
                <label className="form-label">Senha (6 dígitos) *</label>
                <input
                  type="password"
                  className="form-input"
                  maxLength="6"
                  value={formData.senha}
                  onChange={(e) => setFormData({ ...formData, senha: e.target.value.replace(/\D/g, '') })}
                  placeholder="000000"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Login gerado</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" className="form-input" value={loginGerado || 'Ainda não gerado'} readOnly />
                  <button type="button" className="btn btn-secondary" onClick={handleGerarLogin}>Gerar ID</button>
                </div>
                <small style={{ color: 'var(--gray-500)' }}>O sistema gera um login único de 6 dígitos. Gere antes de criar se quiser ver o ID.</small>
              </div>

              <div className="form-group">
                <label className="form-label">PIN (6 dígitos) <small style={{color: 'var(--gray-500)'}}>Opcional - para login rápido</small></label>
                <input
                  type="text"
                  className="form-input"
                  maxLength="6"
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="Deixe vazio para gerar automaticamente"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Vincular ao projeto *</label>
                <select className="form-select" value={formData.projeto_id || ''} onChange={(e) => setFormData({ ...formData, projeto_id: e.target.value })} required>
                  <option value="">Selecione projeto</option>
                  {projetos.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
                <small style={{ color: 'var(--gray-500)' }}>Usuário será vinculado ao projeto selecionado.</small>
              </div>

              {/* Removido campo E-mail conforme regra de interface */}

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_gestor === 1}
                    onChange={(e) => setFormData({ ...formData, is_gestor: e.target.checked ? 1 : 0 })}
                  />
                  <span className="form-label" style={{ margin: 0 }}>
                    <Crown size={16} style={{ display: 'inline', marginRight: '6px' }} />
                    Permitir acesso como gestor
                  </span>
                </label>
              </div>

              <div className="flex-between mt-3">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Criar usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Usuarios;

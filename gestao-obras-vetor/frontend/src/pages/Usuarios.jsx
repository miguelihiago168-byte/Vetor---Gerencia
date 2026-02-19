import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getUsuarios,
  getUsuario,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  getNovoLogin,
  getProjetos,
  getMaoObraDireta,
  createMaoObraDireta,
  updateMaoObraDireta,
  baixaMaoObraDireta
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { Shield, UserPlus, Trash2, RotateCcw, Eye, EyeOff, UserX } from 'lucide-react';

const PERFIS = ['ADM', 'Gestor Geral', 'Gestor Local', 'Gestor de Qualidade', 'Almoxarife', 'Fiscal'];
const SETORES = ['Administrativo', 'Engenharia', 'Qualidade', 'Almoxarifado', 'Financeiro', 'Outro'];
const FUNCOES = ['Administrativo', 'Almoxarife', 'Fiscal', 'Gestor Geral', 'Gestor Local', 'Gestor de Qualidade'];

const normalizarPerfilParaApi = (perfil) => {
  if (perfil === 'Gestor Local') return 'Gestor da Obra';
  if (perfil === 'Gestor de Qualidade') return 'Gestor da Qualidade';
  return perfil;
};

const normalizarPerfilTela = (perfil) => {
  if (perfil === 'Gestor da Obra') return 'Gestor Local';
  if (perfil === 'Gestor da Qualidade') return 'Gestor de Qualidade';
  return perfil || 'ADM';
};

function Usuarios() {
  const { perfil } = useAuth();
  const { confirm } = useDialog();
  const navigate = useNavigate();

  const podeGerenciar = perfil === 'Gestor Geral' || perfil === 'ADM';

  const [aba, setAba] = useState('usuarios');
  const [usuarios, setUsuarios] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [loginGerado, setLoginGerado] = useState('');
  const [showDeletedUsers, setShowDeletedUsers] = useState(false);
  const [filtroSetor, setFiltroSetor] = useState('');
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    pin: '',
    funcao: 'Administrativo',
    perfil: 'ADM',
    setor: 'Administrativo',
    setor_outro: '',
    projeto_ids: [],
    ativo: 1
  });

  const [maoObra, setMaoObra] = useState([]);
  const [maoForm, setMaoForm] = useState({ nome: '', funcao: '' });
  const [maoEditId, setMaoEditId] = useState(null);

  const carregarDados = async (setor = filtroSetor) => {
    setLoading(true);
    try {
      const [resUsuarios, projetosRes, maoRes] = await Promise.all([
        getUsuarios(setor ? { setor } : undefined),
        getProjetos(),
        getMaoObraDireta({ ativos: 0 })
      ]);
      setUsuarios(resUsuarios.data || []);
      setProjetos(projetosRes.data || []);
      setMaoObra(maoRes.data || []);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao carregar dados de usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    if (showModal && !editingUserId) {
      handleGerarLogin();
    }
  }, [showModal, editingUserId]);

  const handleGerarLogin = async () => {
    try {
      const res = await getNovoLogin();
      setLoginGerado(res.data.login || '');
    } catch (error) {
      setErro('Erro ao gerar login.');
    }
  };

  const validarFormulario = () => {
    if (!formData.nome.trim()) return 'Preencha o nome.';
    if (formData.email.trim() && !/^\S+@\S+\.\S+$/.test(formData.email.trim())) return 'E-mail inválido.';

    if (!editingUserId) {
      if (!/^\d{6}$/.test(formData.senha || '')) return 'A senha deve ter 6 dígitos numéricos.';
    } else if (formData.senha && !/^\d{6}$/.test(formData.senha)) {
      return 'A senha deve ter 6 dígitos numéricos.';
    }

    if (formData.pin && !/^\d{6}$/.test(formData.pin)) return 'O PIN deve ter 6 dígitos numéricos.';
    if (!FUNCOES.includes(formData.funcao)) return 'Função inválida.';
    if (!PERFIS.includes(formData.perfil)) return 'Perfil inválido.';
    if (!SETORES.includes(formData.setor)) return 'Setor inválido.';
    if (formData.setor === 'Outro' && !formData.setor_outro.trim()) return 'Informe o setor em texto livre.';
    if (formData.perfil === 'Gestor Local' && formData.projeto_ids.length === 0) return 'Gestor Local deve ter ao menos uma obra vinculada.';

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    const erroValidacao = validarFormulario();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    const payload = {
      nome: formData.nome.trim(),
      email: formData.email.trim() || null,
      pin: formData.pin || undefined,
      funcao: formData.funcao,
      perfil: normalizarPerfilParaApi(formData.perfil),
      setor: formData.setor,
      setor_outro: formData.setor === 'Outro' ? formData.setor_outro.trim() : null,
      projeto_ids: formData.projeto_ids,
      ativo: formData.ativo
    };

    if (!editingUserId || formData.senha) payload.senha = formData.senha;
    if (!editingUserId && loginGerado) payload.login = loginGerado;

    try {
      if (editingUserId) {
        await updateUsuario(editingUserId, payload);
        setSucesso('Usuário atualizado com sucesso.');
      } else {
        const res = await createUsuario(payload);
        setSucesso(`Usuário criado com sucesso! Login: ${res.data?.usuario?.login || ''}`);
      }

      setShowModal(false);
      setEditingUserId(null);
      setFormData({
        nome: '',
        email: '',
        senha: '',
        pin: '',
        funcao: 'Administrativo',
        perfil: 'ADM',
        setor: 'Administrativo',
        setor_outro: '',
        projeto_ids: [],
        ativo: 1
      });
      setLoginGerado('');
      await carregarDados();
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao salvar usuário.');
    }
  };

  const abrirEdicao = async (usuario) => {
    try {
      const res = await getUsuario(usuario.id);
      const dados = res.data;
      setEditingUserId(dados.id);
      setLoginGerado(dados.login || '');
      setFormData({
        nome: dados.nome || '',
        email: dados.email || '',
        senha: '',
        pin: dados.pin || '',
        funcao: FUNCOES.includes(dados.funcao) ? dados.funcao : 'Administrativo',
        perfil: normalizarPerfilTela(dados.perfil),
        setor: dados.setor || 'Administrativo',
        setor_outro: dados.setor_outro || '',
        projeto_ids: dados.projeto_ids || (dados.projeto_id ? [dados.projeto_id] : []),
        ativo: dados.ativo ? 1 : 0
      });
      setShowModal(true);
    } catch (error) {
      setErro('Erro ao carregar usuário para edição.');
    }
  };

  const toggleProjeto = (projetoId) => {
    const id = Number(projetoId);
    setFormData((prev) => ({
      ...prev,
      projeto_ids: prev.projeto_ids.includes(id)
        ? prev.projeto_ids.filter((item) => item !== id)
        : [...prev.projeto_ids, id]
    }));
  };

  const desativar = async (id) => {
    const ok = await confirm({
      title: 'Desativar usuário',
      message: 'Deseja desativar este usuário?',
      confirmText: 'Desativar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await deleteUsuario(id);
      await carregarDados();
      setSucesso('Usuário desativado com sucesso.');
    } catch {
      setErro('Erro ao desativar usuário.');
    }
  };

  const reativar = async (id) => {
    const ok = await confirm({
      title: 'Reativar usuário',
      message: 'Deseja reativar este usuário?',
      confirmText: 'Reativar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await updateUsuario(id, { ativo: 1 });
      await carregarDados();
      setSucesso('Usuário reativado com sucesso.');
    } catch {
      setErro('Erro ao reativar usuário.');
    }
  };

  const salvarMaoObra = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!maoForm.nome.trim() || !maoForm.funcao.trim()) {
      setErro('Preencha nome e função da mão de obra direta.');
      return;
    }

    try {
      if (maoEditId) {
        await updateMaoObraDireta(maoEditId, maoForm);
        setSucesso('Mão de obra direta atualizada com sucesso.');
      } else {
        await createMaoObraDireta(maoForm);
        setSucesso('Mão de obra direta cadastrada com sucesso.');
      }
      setMaoForm({ nome: '', funcao: '' });
      setMaoEditId(null);
      await carregarDados();
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao salvar mão de obra direta.');
    }
  };

  const editarMaoObra = (item) => {
    setMaoEditId(item.id);
    setMaoForm({
      nome: item.nome || '',
      funcao: item.funcao || ''
    });
    setAba('mao-obra-direta');
  };

  const darBaixaMaoObra = async (id) => {
    const ok = await confirm({
      title: 'Dar baixa',
      message: 'Deseja dar baixa neste colaborador de mão de obra direta?',
      confirmText: 'Dar baixa',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await baixaMaoObraDireta(id);
      setSucesso('Baixa realizada com sucesso.');
      await carregarDados();
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao dar baixa.');
    }
  };

  if (!podeGerenciar) {
    return (
      <>
        <Navbar />
        <div className="container">
          <div className="card" style={{ marginTop: '20px' }}>
            <h3 className="card-header">Acesso restrito</h3>
            <p>Apenas Gestor Geral e ADM podem gerenciar usuários.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="flex-between mb-3">
          <div>
            <p className="eyebrow">Administração</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={24} /> Usuários
            </h1>
          </div>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div className="almox-layout">
          <aside className="almox-sidebar card">
            <h3 className="card-header" style={{ marginBottom: 12 }}>Menu</h3>
            <nav className="almox-nav">
              <button className={`almox-nav-link${aba === 'usuarios' ? ' active' : ''}`} onClick={() => setAba('usuarios')} type="button">Usuários do Sistema</button>
              <button className={`almox-nav-link${aba === 'mao-obra-direta' ? ' active' : ''}`} onClick={() => setAba('mao-obra-direta')} type="button">Mão de Obra Direta</button>
            </nav>
          </aside>

          <main className="almox-content">
            {aba === 'usuarios' && (
              <>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: 16 }}>
                  <select
                    className="form-select"
                    value={filtroSetor}
                    onChange={async (e) => {
                      const value = e.target.value;
                      setFiltroSetor(value);
                      await carregarDados(value);
                    }}
                    style={{ minWidth: '180px' }}
                  >
                    <option value="">Todos os setores</option>
                    {SETORES.map((setor) => (
                      <option key={setor} value={setor}>{setor}</option>
                    ))}
                  </select>
                  <button className="btn btn-outline" onClick={() => navigate('/usuarios-deleted')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserX size={18} /> Usuários Deletados
                  </button>
                  <button className={`btn ${showDeletedUsers ? 'btn-secondary' : 'btn-outline'}`} onClick={() => setShowDeletedUsers(!showDeletedUsers)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {showDeletedUsers ? <Eye size={18} /> : <EyeOff size={18} />}
                    {showDeletedUsers ? 'Mostrar ativos' : 'Mostrar desativados'}
                  </button>
                  <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <UserPlus size={18} /> Novo usuário
                  </button>
                </div>

                {loading ? (
                  <div className="loading"><div className="spinner"></div></div>
                ) : (
                  <div className="grid grid-3">
                    {usuarios
                      .filter((u) => (showDeletedUsers ? Number(u.ativo) === 0 : Number(u.ativo) === 1))
                      .map((u) => (
                        <div key={u.id} className="card" style={{ border: u.ativo ? '1px solid #e2e8f0' : '1px dashed #fca5a5' }}>
                          <div className="flex-between mb-1">
                            <div>
                              <p className="eyebrow">Login: {u.login}</p>
                              <h3>{u.nome}</h3>
                              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>{u.email || 'sem e-mail'}</p>
                              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>Função: {u.funcao || '-'}</p>
                              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>{normalizarPerfilTela(u.perfil) || 'Sem perfil'}</p>
                              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>
                                Setor: {u.setor}{u.setor === 'Outro' && u.setor_outro ? ` (${u.setor_outro})` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-1">
                            {Number(u.ativo) === 1 ? (
                              <>
                                <button className="btn btn-secondary" onClick={() => abrirEdicao(u)}>Editar</button>
                                <button className="btn btn-danger" onClick={() => desativar(u.id)}>
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <button className="btn btn-success" onClick={() => reativar(u.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <RotateCcw size={16} /> Reativar
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}

            {aba === 'mao-obra-direta' && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <h2 className="card-header">Cadastro de Mão de Obra Direta</h2>
                  <form onSubmit={salvarMaoObra} className="grid grid-3" style={{ gap: 12 }}>
                    <input className="form-input" value="ID gerado automaticamente" readOnly style={{ backgroundColor: '#f0f0f0' }} />
                    <input className="form-input" placeholder="Nome" value={maoForm.nome} onChange={(e) => setMaoForm({ ...maoForm, nome: e.target.value })} required />
                    <input className="form-input" placeholder="Função" value={maoForm.funcao} onChange={(e) => setMaoForm({ ...maoForm, funcao: e.target.value })} required />
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" type="submit">{maoEditId ? 'Salvar alterações' : 'Cadastrar'}</button>
                      {maoEditId && <button className="btn btn-secondary" type="button" onClick={() => { setMaoEditId(null); setMaoForm({ nome: '', funcao: '' }); }}>Cancelar edição</button>}
                    </div>
                  </form>
                </div>

                <div className="card">
                  <h2 className="card-header">Base de Mão de Obra Direta</h2>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Nome</th>
                          <th>Função</th>
                          <th>Status</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(maoObra || []).map((item) => (
                          <tr key={item.id}>
                            <td>{item.identificador || `#${item.id}`}</td>
                            <td>{item.nome}</td>
                            <td>{item.funcao}</td>
                            <td>{Number(item.ativo) === 1 ? 'Ativo' : 'Baixado'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary" onClick={() => editarMaoObra(item)}>Editar</button>
                                {Number(item.ativo) === 1 && (
                                  <button className="btn btn-danger" onClick={() => darBaixaMaoObra(item.id)}>Dar baixa</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {(!maoObra || maoObra.length === 0) && (
                          <tr><td colSpan={5}>Nenhum registro cadastrado.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="flex-between mb-2">
              <h2>{editingUserId ? 'Editar usuário' : 'Novo usuário'}</h2>
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingUserId(null); }}>Fechar</button>
            </div>

            {erro && <div className="alert alert-error">{erro}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-input" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
              </div>

              <div className="form-group">
                <label className="form-label">E-mail (opcional)</label>
                <input type="email" className="form-input" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Senha (6 dígitos) {editingUserId ? '(opcional)' : '*'}</label>
                <input type="password" maxLength="6" className="form-input" value={formData.senha} onChange={(e) => setFormData({ ...formData, senha: e.target.value.replace(/\D/g, '') })} required={!editingUserId} />
              </div>

              <div className="form-group">
                <label className="form-label">Login (gerado automaticamente)</label>
                <input type="text" className="form-input" value={loginGerado || '...gerando...'} readOnly style={{ backgroundColor: '#f0f0f0' }} />
              </div>

              <div className="form-group">
                <label className="form-label">PIN (6 dígitos)</label>
                <input type="text" maxLength="6" className="form-input" value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })} />
              </div>

              <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Função *</label>
                  <select className="form-select" value={formData.funcao} onChange={(e) => setFormData({ ...formData, funcao: e.target.value })}>
                    {FUNCOES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Perfil de acesso *</label>
                  <select className="form-select" value={formData.perfil} onChange={(e) => setFormData({ ...formData, perfil: e.target.value })}>
                    {PERFIS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Setor *</label>
                  <select className="form-select" value={formData.setor} onChange={(e) => setFormData({ ...formData, setor: e.target.value })}>
                    {SETORES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.setor === 'Outro' && (
                <div className="form-group">
                  <label className="form-label">Setor (texto livre) *</label>
                  <input className="form-input" value={formData.setor_outro} onChange={(e) => setFormData({ ...formData, setor_outro: e.target.value })} />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Obras vinculadas {formData.perfil === 'Gestor Local' ? '*' : '(opcional)'}</label>
                <div className="card" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                  {projetos.map((projeto) => (
                    <label key={projeto.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <input
                        type="checkbox"
                        checked={formData.projeto_ids.includes(Number(projeto.id))}
                        onChange={() => toggleProjeto(projeto.id)}
                      />
                      <span>{projeto.nome}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex-between mt-3">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Usuarios;

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getUsuarios,
  getUsuario,
  createUsuario,
  updateUsuario,
  bulkUpdateUsuarios,
  getProjetos,
  getMaoObraDireta,
  createMaoObraDireta,
  updateMaoObraDireta,
  baixaMaoObraDireta
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { Shield, UserPlus, Trash2, RotateCcw, Search, X, Users, UserCheck, Eye, EyeOff } from 'lucide-react';

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

const normalizeName = (value) => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const buildUsernameFromName = (name) => {
  const base = normalizeName(name).slice(0, 14) || 'usuario';
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${base}${suffix}`;
};

const getPasswordStrength = (value) => {
  const pwd = String(value || '');
  if (!pwd) return { level: 'fraca', label: 'Fraca', color: '#ef4444', width: '0%' };

  const upper = (pwd.match(/[A-Z]/g) || []).length;
  const lower = (pwd.match(/[a-z]/g) || []).length;
  const digits = (pwd.match(/\d/g) || []).length;
  const special = (pwd.match(/[^A-Za-z0-9]/g) || []).length;

  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (upper > 0) score += 1;
  if (lower > 0) score += 1;
  if (digits > 0) score += 1;
  if (digits >= 3) score += 1;
  if (special > 0) score += 1;
  if (special >= 2) score += 1;

  if (score <= 3) return { level: 'fraca', label: 'Fraca', color: '#ef4444', width: '25%' };
  if (score <= 6) return { level: 'medio', label: 'Médio', color: '#f59e0b', width: '50%' };
  if (score <= 8) return { level: 'forte', label: 'Forte', color: '#10b981', width: '75%' };
  return { level: 'extraforte', label: 'Extraforte', color: '#0ea5e9', width: '100%' };
};

function Usuarios() {
  const { projetoId } = useParams();
  const { perfil, usuario: usuarioLogado, atualizarUsuarioLogado } = useAuth();
  const { confirm } = useDialog();
  const { success: notifySuccess, error: notifyError } = useNotification();

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
  const [usuarioManual, setUsuarioManual] = useState(false);
  const [showSenha, setShowSenha] = useState(false);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('ativos'); // 'ativos' | 'desativados' | 'todos'
  const [filtroObra, setFiltroObra] = useState('');

  // Seleção em lote
  const [selecionados, setSelecionados] = useState([]);
  const [bulkAcao, setBulkAcao] = useState('');
  const [bulkValor, setBulkValor] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    login: '',
    email: '',
    senha: '',
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

  const resetFormularioUsuario = () => {
    setEditingUserId(null);
    setFormData({
      nome: '',
      login: '',
      email: '',
      senha: '',
      funcao: 'Administrativo',
      perfil: 'ADM',
      setor: 'Administrativo',
      setor_outro: '',
      projeto_ids: [],
      ativo: 1
    });
    setLoginGerado('');
    setUsuarioManual(false);
    setShowSenha(false);
  };

  const fecharModalUsuario = () => {
    setShowModal(false);
    resetFormularioUsuario();
  };

  const abrirNovoUsuario = () => {
    resetFormularioUsuario();
    setShowModal(true);
  };

  const carregarDados = async (setor = filtroSetor) => {
    setLoading(true);
    try {
      const paramsUsuarios = {};
      if (setor) paramsUsuarios.setor = setor;
      if (projetoId) paramsUsuarios.projeto_id = Number(projetoId);

      const paramsMaoObra = { ativos: 0 };
      if (projetoId) paramsMaoObra.projeto_id = Number(projetoId);

      const [resUsuarios, projetosRes, maoRes] = await Promise.all([
        getUsuarios(Object.keys(paramsUsuarios).length ? paramsUsuarios : undefined),
        getProjetos(),
        getMaoObraDireta(paramsMaoObra)
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
    if (!sucesso) return;
    notifySuccess(sucesso, 5000);
    setSucesso('');
  }, [sucesso, notifySuccess]);

  useEffect(() => {
    if (!erro) return;
    notifyError(erro, 7000);
    setErro('');
  }, [erro, notifyError]);

  const validarFormulario = () => {
    if (!formData.nome.trim()) return 'Preencha o nome.';
    if (!formData.login.trim()) return 'Usuário é obrigatório.';
    if (formData.email.trim() && !/^\S+@\S+\.\S+$/.test(formData.email.trim())) return 'E-mail inválido.';

    if (!editingUserId) {
      if (!formData.senha) return 'Preencha a senha.';
    } else if (formData.senha && formData.senha.length > 72) {
      return 'A senha deve ter no máximo 72 caracteres.';
    }

    if (!editingUserId && formData.senha.length > 72) return 'A senha deve ter no máximo 72 caracteres.';
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
      login: formData.login.trim(),
      email: formData.email.trim() || null,
      funcao: formData.funcao,
      perfil: normalizarPerfilParaApi(formData.perfil),
      setor: formData.setor,
      setor_outro: formData.setor === 'Outro' ? formData.setor_outro.trim() : null,
      projeto_ids: formData.projeto_ids,
      ativo: formData.ativo
    };

    if (!editingUserId || formData.senha) payload.senha = formData.senha;
    // Protege: usuário não pode alterar o próprio perfil de acesso
    if (editingUserId === usuarioLogado?.id) delete payload.perfil;

    try {
      if (editingUserId) {
        await updateUsuario(editingUserId, payload);
        setSucesso('Usuário atualizado com sucesso.');
        if (editingUserId === usuarioLogado?.id) {
          atualizarUsuarioLogado({ nome: payload.nome, email: payload.email });
        }
      } else {
        const res = await createUsuario(payload);
        setSucesso(`Usuário criado com sucesso! Login: ${res.data?.usuario?.login || ''}`);
      }

      fecharModalUsuario();
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
        login: dados.login || '',
        email: dados.email || '',
        senha: '',
        funcao: FUNCOES.includes(dados.funcao) ? dados.funcao : 'Administrativo',
        perfil: normalizarPerfilTela(dados.perfil),
        setor: dados.setor || 'Administrativo',
        setor_outro: dados.setor_outro || '',
        projeto_ids: dados.projeto_ids || (dados.projeto_id ? [dados.projeto_id] : []),
        ativo: dados.ativo ? 1 : 0
      });
      setUsuarioManual(true);
      setShowSenha(false);
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
      message: 'Tem certeza que deseja desativar este usuário?',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await updateUsuario(id, { ativo: 0 });
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
        await createMaoObraDireta({
          ...maoForm,
          projeto_id: projetoId ? Number(projetoId) : undefined
        });
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

  // Lista filtrada client-side
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      // Status
      if (filtroStatus === 'ativos' && Number(u.ativo) !== 1) return false;
      if (filtroStatus === 'desativados' && Number(u.ativo) !== 0) return false;

      // Texto livre
      if (filtroTexto.trim()) {
        const t = filtroTexto.trim().toLowerCase();
        const emNome = (u.nome || '').toLowerCase().includes(t);
        const emEmail = (u.email || '').toLowerCase().includes(t);
        const emLogin = (u.login || '').toLowerCase().includes(t);
        if (!emNome && !emEmail && !emLogin) return false;
      }

      // Perfil
      if (filtroPerfil) {
        const perfilTela = normalizarPerfilTela(u.perfil);
        if (perfilTela !== filtroPerfil) return false;
      }

      // Setor
      if (filtroSetor && u.setor !== filtroSetor) return false;

      // Obra
      if (filtroObra) {
        const ids = u.projeto_ids || (u.projeto_id ? [u.projeto_id] : []);
        if (!ids.includes(Number(filtroObra))) return false;
      }

      return true;
    });
  }, [usuarios, filtroStatus, filtroTexto, filtroPerfil, filtroSetor, filtroObra]);

  const filtrosAtivos = filtroTexto || filtroSetor || filtroPerfil || filtroStatus !== 'ativos' || filtroObra;

  const limparFiltros = () => {
    setFiltroTexto('');
    setFiltroSetor('');
    setFiltroPerfil('');
    setFiltroStatus('ativos');
    setFiltroObra('');
  };

  const toggleSelecionado = (id) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelecionarTodos = () => {
    if (selecionados.length === usuariosFiltrados.length && usuariosFiltrados.length > 0) {
      setSelecionados([]);
    } else {
      setSelecionados(usuariosFiltrados.map((u) => u.id));
    }
  };

  const executarBulk = async () => {
    if (!bulkAcao || selecionados.length === 0) return;

    const textos = {
      ativo_desativar: 'Desativar os usuários selecionados?',
      ativo_ativar: 'Ativar os usuários selecionados?',
      perfil: `Alterar perfil de ${selecionados.length} usuário(s) para "${bulkValor}"?`,
      setor: `Alterar setor de ${selecionados.length} usuário(s) para "${bulkValor}"?`,
      is_gestor_sim: `Marcar ${selecionados.length} usuário(s) como Gestor?`,
      is_gestor_nao: `Remover flag Gestor de ${selecionados.length} usuário(s)?`,
      projeto_vincular: `Vincular ${selecionados.length} usuário(s) à obra selecionada?`,
      projeto_desvincular: `Desvincular ${selecionados.length} usuário(s) da obra selecionada?`,
    };

    const ok = await confirm({
      title: 'Alteração em lote',
      message: textos[bulkAcao] || 'Confirmar alteração?',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    setBulkLoading(true);
    setErro('');
    try {
      if (bulkAcao === 'ativo_desativar') {
        await bulkUpdateUsuarios(selecionados, 'ativo', false);
      } else if (bulkAcao === 'ativo_ativar') {
        await bulkUpdateUsuarios(selecionados, 'ativo', true);
      } else if (bulkAcao === 'perfil') {
        if (!bulkValor) { setErro('Selecione o perfil desejado.'); setBulkLoading(false); return; }
        await bulkUpdateUsuarios(selecionados, 'perfil', normalizarPerfilParaApi(bulkValor));
      } else if (bulkAcao === 'setor') {
        if (!bulkValor) { setErro('Selecione o setor desejado.'); setBulkLoading(false); return; }
        await bulkUpdateUsuarios(selecionados, 'setor', bulkValor);
      } else if (bulkAcao === 'is_gestor_sim') {
        await bulkUpdateUsuarios(selecionados, 'is_gestor', true);
      } else if (bulkAcao === 'is_gestor_nao') {
        await bulkUpdateUsuarios(selecionados, 'is_gestor', false);
      } else if (bulkAcao === 'projeto_vincular' || bulkAcao === 'projeto_desvincular') {
        if (!bulkValor) { setErro('Selecione a obra desejada.'); setBulkLoading(false); return; }
        await bulkUpdateUsuarios(selecionados, bulkAcao, null, Number(bulkValor));
      }

      setSucesso(`Alteração em lote aplicada a ${selecionados.length} usuário(s).`);
      setSelecionados([]);
      setBulkAcao('');
      setBulkValor('');
      await carregarDados();
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao executar alteração em lote.');
    } finally {
      setBulkLoading(false);
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
      <div className="container" style={{ maxWidth: '100%' }}>
        <div className="flex-between mb-3">
          <div>
            <p className="eyebrow">Administração</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={24} /> Usuários
            </h1>
          </div>
        </div>

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
                {/* Barra de ações */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={abrirNovoUsuario} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <UserPlus size={16} /> Novo usuário
                  </button>
                  {filtrosAtivos && (
                    <button className="btn btn-outline" onClick={limparFiltros} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-danger)' }}>
                      <X size={16} /> Limpar filtros
                    </button>
                  )}
                  <span style={{ marginLeft: 'auto', color: 'var(--gray-500)', fontSize: '0.85rem' }}>
                    {usuariosFiltrados.length} usuário(s)
                  </span>
                </div>

                {/* Filtros */}
                <div className="card" style={{ marginBottom: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    {/* Busca por texto */}
                    <div style={{ position: 'relative' }}>
                      <Search size={15} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} />
                      <input
                        className="form-input"
                        placeholder="Buscar por nome, e-mail ou login"
                        value={filtroTexto}
                        onChange={(e) => setFiltroTexto(e.target.value)}
                        style={{ paddingLeft: 30 }}
                      />
                    </div>

                    {/* Status */}
                    <select className="form-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                      <option value="ativos">Ativos</option>
                      <option value="desativados">Desativados</option>
                      <option value="todos">Todos os status</option>
                    </select>

                    {/* Perfil */}
                    <select className="form-select" value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)}>
                      <option value="">Todos os perfis</option>
                      {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>

                    {/* Setor */}
                    <select className="form-select" value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}>
                      <option value="">Todos os setores</option>
                      {SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* Obra */}
                    <select className="form-select" value={filtroObra} onChange={(e) => setFiltroObra(e.target.value)}>
                      <option value="">Todas as obras</option>
                      {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                </div>

                {/* Barra de ações em lote */}
                {selecionados.length > 0 && (
                  <div className="card" style={{
                    marginBottom: 14, padding: '12px 16px', background: 'var(--badge-blue-bg)',
                    border: '1px solid var(--badge-blue-color)',
                    display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={16} /> {selecionados.length} usuário(s) selecionado(s)
                    </span>

                    <select
                      className="form-select"
                      value={bulkAcao}
                      onChange={(e) => { setBulkAcao(e.target.value); setBulkValor(''); }}
                      style={{ minWidth: 210 }}
                    >
                      <option value="">-- Escolha a ação --</option>
                      <option value="ativo_ativar">Ativar</option>
                      <option value="ativo_desativar">Desativar</option>
                      <option value="perfil">Alterar Perfil</option>
                      <option value="setor">Alterar Setor</option>
                      <option value="is_gestor_sim">Marcar como Gestor</option>
                      <option value="is_gestor_nao">Remover flag Gestor</option>
                      <option value="projeto_vincular">Vincular à Obra</option>
                      <option value="projeto_desvincular">Desvincular da Obra</option>
                    </select>

                    {/* Campo extra por ação */}
                    {bulkAcao === 'perfil' && (
                      <select className="form-select" style={{ minWidth: 180 }} value={bulkValor} onChange={(e) => setBulkValor(e.target.value)}>
                        <option value="">Selecione o perfil</option>
                        {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                    {bulkAcao === 'setor' && (
                      <select className="form-select" style={{ minWidth: 180 }} value={bulkValor} onChange={(e) => setBulkValor(e.target.value)}>
                        <option value="">Selecione o setor</option>
                        {SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {(bulkAcao === 'projeto_vincular' || bulkAcao === 'projeto_desvincular') && (
                      <select className="form-select" style={{ minWidth: 200 }} value={bulkValor} onChange={(e) => setBulkValor(e.target.value)}>
                        <option value="">Selecione a obra</option>
                        {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    )}

                    {bulkAcao && (
                      <button
                        className="btn btn-primary"
                        onClick={executarBulk}
                        disabled={bulkLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <UserCheck size={16} /> {bulkLoading ? 'Aplicando...' : 'Aplicar'}
                      </button>
                    )}

                    <button
                      className="btn btn-outline"
                      onClick={() => { setSelecionados([]); setBulkAcao(''); setBulkValor(''); }}
                      style={{ marginLeft: 'auto' }}
                    >
                      <X size={15} /> Cancelar
                    </button>
                  </div>
                )}

                {loading ? (
                  <div className="loading"><div className="spinner"></div></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>
                            <input
                              type="checkbox"
                              title="Selecionar todos"
                              checked={selecionados.length === usuariosFiltrados.length && usuariosFiltrados.length > 0}
                              onChange={toggleSelecionarTodos}
                            />
                          </th>
                          <th>Nome</th>
                          <th>Login</th>
                          <th>E-mail</th>
                          <th>Perfil</th>
                          <th>Setor</th>
                          <th>Obra(s)</th>
                          <th>Status</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuariosFiltrados.map((u) => {
                          const isAtivo = Number(u.ativo) === 1;
                          const obrasTitulos = (u.projeto_ids || []).map((pid) => {
                            const p = projetos.find((pr) => pr.id === pid);
                            return p ? p.nome : `#${pid}`;
                          }).join(', ');
                          return (
                            <tr key={u.id} style={{ opacity: isAtivo ? 1 : 0.6 }}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selecionados.includes(u.id)}
                                  onChange={() => toggleSelecionado(u.id)}
                                />
                              </td>
                              <td style={{ fontWeight: 500 }}>{u.nome}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{u.login}</td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>{u.email || <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                              <td>
                                <span style={{
                                  fontSize: '0.78rem', fontWeight: 600, padding: '2px 8px',
                                  borderRadius: 12, background: 'var(--badge-blue-bg)',
                                  color: 'var(--badge-blue-color)'
                                }}>
                                  {normalizarPerfilTela(u.perfil)}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.85rem' }}>
                                {u.setor}{u.setor === 'Outro' && u.setor_outro ? ` (${u.setor_outro})` : ''}
                              </td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--gray-500)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={obrasTitulos}>
                                {obrasTitulos || <span style={{ color: 'var(--gray-300)' }}>—</span>}
                              </td>
                              <td>
                                <span style={{
                                  fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px',
                                  borderRadius: 12,
                                  background: isAtivo ? 'var(--badge-green-bg)' : 'var(--badge-red-bg)',
                                  color: isAtivo ? 'var(--badge-green-color)' : 'var(--badge-red-color)'
                                }}>
                                  {isAtivo ? 'Ativo' : 'Desativado'}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  {isAtivo ? (
                                    <>
                                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => abrirEdicao(u)}>Editar</button>
                                      <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => desativar(u.id)}>
                                        <Trash2 size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => reativar(u.id)}>
                                      <RotateCcw size={13} /> Reativar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {usuariosFiltrados.length === 0 && (
                          <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '24px 0' }}>Nenhum usuário encontrado com os filtros aplicados.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {aba === 'mao-obra-direta' && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <h2 className="card-header">Cadastro de Mão de Obra Direta</h2>
                  <form onSubmit={salvarMaoObra} className="grid grid-3" style={{ gap: 12 }}>
                    <input className="form-input" value="ID gerado automaticamente" readOnly style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'default' }} />
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
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={fecharModalUsuario}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between mb-2">
              <h2>{editingUserId ? 'Editar usuário' : 'Novo usuário'}</h2>
              <button className="btn btn-secondary" onClick={fecharModalUsuario}>Fechar</button>
            </div>


            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input
                  className="form-input"
                  value={formData.nome}
                  onChange={(e) => {
                    const nome = e.target.value;
                    const usuarioGerado = !editingUserId && !usuarioManual ? buildUsernameFromName(nome) : formData.login;
                    setFormData({ ...formData, nome, login: usuarioGerado });
                    if (!editingUserId && !usuarioManual) setLoginGerado(usuarioGerado);
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Usuário *</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingUserId ? (formData.login || loginGerado) : formData.login}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\s+/g, '').toLowerCase();
                    setUsuarioManual(true);
                    setFormData({ ...formData, login: value });
                    setLoginGerado(value);
                  }}
                  readOnly={!!editingUserId}
                  style={editingUserId ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'default' } : undefined}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">E-mail (opcional)</label>
                <input type="email" className="form-input" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Senha {editingUserId ? '(opcional)' : '*'}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSenha ? 'text' : 'password'}
                    maxLength="72"
                    className="form-input"
                    value={formData.senha}
                    onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                    required={!editingUserId}
                    style={{ paddingRight: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {formData.senha && (
                  <>
                    <div style={{ width: '100%', height: '6px', borderRadius: '999px', backgroundColor: 'rgba(148, 163, 184, 0.2)', marginTop: '8px', overflow: 'hidden' }}>
                      <div style={{ width: getPasswordStrength(formData.senha).width, backgroundColor: getPasswordStrength(formData.senha).color, height: '100%', borderRadius: '999px', transition: 'all 0.2s ease' }} />
                    </div>
                    <small style={{ color: getPasswordStrength(formData.senha).color, display: 'inline-block', marginTop: '6px', fontSize: '0.82rem' }}>
                      Nível da senha: {getPasswordStrength(formData.senha).label}
                    </small>
                  </>
                )}
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
                  <select
                    className="form-select"
                    value={formData.perfil}
                    onChange={(e) => setFormData({ ...formData, perfil: e.target.value })}
                    disabled={editingUserId === usuarioLogado?.id}
                    title={editingUserId === usuarioLogado?.id ? 'Você não pode alterar o próprio perfil de acesso.' : undefined}
                  >
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
                <button type="button" className="btn btn-secondary" onClick={fecharModalUsuario}>Cancelar</button>
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

import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, User, Mail, Phone, Pencil, Check, X, Camera } from 'lucide-react';
import Navbar from '../components/Navbar';
import { hasForbiddenPasswordSequence } from '../utils/passwordPolicy';
import { patchUsuarioInfo, patchUsuarioAvatar } from '../services/api';
import './MeuPerfil.css';

function MeuPerfil() {
  const { usuario, atualizarUsuarioLogado, loading } = useAuth();
  const { alert } = useDialog();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loadingSenha, setLoadingSenha] = useState(false);
  const navigate = useNavigate();

  // Edição de dados pessoais
  const [editando, setEditando] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelefone, setEditTelefone] = useState('');
  const [salvandoInfo, setSalvandoInfo] = useState(false);

  // Avatar
  const avatarInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const cleanText = (value) => {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text) return '';
    if (text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
    return text;
  };

  const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!usuario) return <Navigate to="/login" />;

  const iniciarEdicao = () => {
    setEditNome(usuario?.nome || '');
    setEditEmail(usuario?.email || '');
    setEditTelefone(usuario?.telefone || '');
    setEditando(true);
  };

  const cancelarEdicao = () => setEditando(false);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await patchUsuarioAvatar(usuario.id, fd);
      const novoAvatar = res?.data?.avatar;
      if (novoAvatar && typeof atualizarUsuarioLogado === 'function') {
        atualizarUsuarioLogado({ avatar: novoAvatar });
      }
    } catch (err) {
      await alert({ title: 'Erro', message: err.response?.data?.erro || 'Erro ao enviar foto.' });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSalvarInfo = async () => {
    setSalvandoInfo(true);
    try {
      const res = await patchUsuarioInfo(usuario.id, { nome: editNome, email: editEmail, telefone: editTelefone });
      const usuarioAtualizado = res?.data?.usuario || {
        nome: editNome,
        email: editEmail,
        telefone: editTelefone,
      };
      if (typeof atualizarUsuarioLogado === 'function') atualizarUsuarioLogado(usuarioAtualizado);
      setEditando(false);
      await alert({ title: 'Sucesso', message: 'Informações atualizadas.' });
    } catch (e) {
      await alert({ title: 'Erro', message: e.response?.data?.erro || e.message });
    } finally {
      setSalvandoInfo(false);
    }
  };

  const handleTrocarSenha = async (e) => {
    e.preventDefault();
    if (novaSenha.length !== 6 || !/^\d{6}$/.test(novaSenha)) {
      await alert({ title: 'Erro', message: 'A nova senha deve ter 6 dígitos numéricos.' });
      return;
    }
    if (hasForbiddenPasswordSequence(novaSenha)) {
      await alert({ title: 'Erro', message: 'A nova senha não pode conter sequência crescente/decrescente (ex: 123456 ou 987654).' });
      return;
    }
    if (novaSenha !== confirmarSenha) {
      await alert({ title: 'Erro', message: 'As senhas não conferem.' });
      return;
    }
    setLoadingSenha(true);
    try {
      const resp = await fetch(`/api/usuarios/${usuario.id}/senha`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ senhaAtual, novaSenha })
      });
      if (!resp.ok) {
        const erro = await resp.json();
        throw new Error(erro.erro || 'Erro ao trocar senha.');
      }
      await alert({ title: 'Sucesso', message: 'Senha alterada com sucesso!' });
      setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('');
      if (typeof atualizarUsuarioLogado === 'function') atualizarUsuarioLogado();
    } catch (e) {
      await alert({ title: 'Erro', message: e.message });
    } finally {
      setLoadingSenha(false);
    }
  };

  // Avatar com iniciais
  const getInitials = (nome) => {
    if (!nome) return '';
    const partes = nome.trim().split(' ');
    if (partes.length === 1) return partes[0][0].toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  const nomeExibicao = usuario?.nome || usuario?.login;
  const perfilExibicao = usuario?.perfil || 'Sem perfil';
  const funcaoExibicao = usuario?.funcao || 'Não informada';
  const ultimoProjetoId = (() => {
    try {
      return localStorage.getItem('navbar_last_project_id');
    } catch (_) {
      return null;
    }
  })();
  const rotaVoltar = ultimoProjetoId ? `/projeto/${ultimoProjetoId}` : '/projetos';
  const tituloVoltar = ultimoProjetoId ? 'Voltar para o dashboard da obra' : 'Voltar para projetos';

  return (
    <>
      <Navbar />

      <div className="perfil-page container">
        <div className="perfil-header-bar">
          <div>
            <h1 className="perfil-page-title">Meu perfil</h1>
            <p className="perfil-page-subtitle">Consulte seus dados de acesso e altere sua senha.</p>
          </div>

          <button className="btn btn-secondary perfil-back-btn" onClick={() => navigate(rotaVoltar)} title={tituloVoltar}>
            <ArrowLeft size={18} />
            Voltar
          </button>
        </div>

        <div className="perfil-grid">
          {/* Informações do usuário */}
          <section className="card perfil-section-card">
            <div className="perfil-user-card">
              <div className="perfil-avatar perfil-avatar-clickable" onClick={() => avatarInputRef.current?.click()} title="Clique para trocar a foto">
                {usuario?.avatar
                  ? <img src={`/uploads/${usuario.avatar}`} alt="avatar" className="perfil-avatar-image" />
                  : <span className="perfil-avatar-iniciais">{getInitials(nomeExibicao)}</span>
                }
                <div className="perfil-avatar-camera-badge">
                  {uploadingAvatar ? <span style={{ fontSize: 10, color: '#fff' }}>...</span> : <Camera size={12} color="#fff" />}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
              </div>

              <div className="perfil-user-main" style={{ flex: 1 }}>
                <h2 className="perfil-user-name">{nomeExibicao}</h2>
                <div className="perfil-user-meta">
                  <div className="perfil-meta-item">
                    <span className="perfil-meta-label">Login</span>
                    <strong>{usuario?.login}</strong>
                  </div>
                  <div className="perfil-meta-item">
                    <span className="perfil-meta-label">Perfil</span>
                    <strong>{perfilExibicao}</strong>
                  </div>
                  <div className="perfil-meta-item">
                    <span className="perfil-meta-label">Função</span>
                    <strong>{funcaoExibicao}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Dados pessoais editáveis */}
            <div className="perfil-section-header" style={{ marginTop: 24 }}>
              <div>
                <p className="perfil-section-eyebrow">Dados pessoais</p>
                <h2 className="card-title">Informações de contato</h2>
              </div>
              <div className="perfil-section-icon">
                <User size={18} />
              </div>
            </div>

            {!editando ? (
              <div style={{ marginTop: 12 }}>
                <div className="perfil-info-row">
                  <Mail size={14} style={{ opacity: 0.6 }} />
                  <span className="perfil-meta-label">E-mail:</span>
                  <span>{cleanText(usuario?.email) || <em style={{ opacity: 0.5 }}>Não informado</em>}</span>
                </div>
                <div className="perfil-info-row">
                  <Phone size={14} style={{ opacity: 0.6 }} />
                  <span className="perfil-meta-label">Telefone:</span>
                  <span>{cleanText(usuario?.telefone) || <em style={{ opacity: 0.5 }}>Não informado</em>}</span>
                </div>
                <button className="btn btn-secondary perfil-inline-btn" onClick={iniciarEdicao}>
                  <Pencil size={14} /> Editar informações
                </button>
              </div>
            ) : (
              <div className="perfil-edit-wrap">
                <div className="form-group">
                  <label className="form-label">Nome completo</label>
                  <input className="form-input" type="text" value={editNome} onChange={e => setEditNome(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail</label>
                  <input className="form-input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="seuemail@exemplo.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone</label>
                  <input className="form-input" type="tel" value={editTelefone} onChange={e => setEditTelefone(e.target.value)} placeholder="(99) 99999-9999" />
                </div>
                <div className="perfil-edit-actions">
                  <button className="btn btn-primary perfil-inline-btn" disabled={salvandoInfo} onClick={handleSalvarInfo}>
                    <Check size={14} /> {salvandoInfo ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button className="btn btn-secondary perfil-inline-btn" onClick={cancelarEdicao}>
                    <X size={14} /> Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card perfil-section-card">
            <div className="perfil-section-header">
              <div>
                <p className="perfil-section-eyebrow">Segurança</p>
                <h2 className="card-title">Alterar senha</h2>
              </div>
              <div className="perfil-section-icon">
                <KeyRound size={18} />
              </div>
            </div>

            <p className="perfil-section-copy">
              Sua senha deve conter 6 dígitos numéricos, seguindo o padrão operacional do sistema.
            </p>

            <form className="perfil-form" onSubmit={handleTrocarSenha} autoComplete="off">
              <div className="form-group">
                <label className="form-label" htmlFor="senha-atual">Senha atual</label>
                <input
                  id="senha-atual"
                  className="form-input"
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Digite sua senha atual"
                />
              </div>

              <div className="perfil-form-split">
                <div className="form-group">
                  <label className="form-label" htmlFor="nova-senha">Nova senha</label>
                  <input
                    id="nova-senha"
                    className="form-input"
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="6 dígitos"
                    inputMode="numeric"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="confirmar-senha">Confirmar nova senha</label>
                  <input
                    id="confirmar-senha"
                    className="form-input"
                    type="password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="perfil-form-footer">
                <p className="perfil-helper-text">A alteração é aplicada imediatamente após a confirmação.</p>
                <button
                  className="btn btn-primary perfil-btn-salvar"
                  type="submit"
                  disabled={loadingSenha || !senhaAtual || !novaSenha || !confirmarSenha}
                >
                  {loadingSenha ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

export default MeuPerfil;

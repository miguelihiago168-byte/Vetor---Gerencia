import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, User, Mail, Pencil, Check, X, Briefcase, ShieldCheck, AtSign, Upload, Trash2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import { getPasswordStrength, hasForbiddenPasswordSequence } from '../utils/passwordPolicy';
import { patchUsuarioInfo, patchUsuarioAssinatura, deleteUsuarioAssinatura, patchUsuarioPresenca, getUploadUrl } from '../services/api';
import './MeuPerfil.css';

const PRESENCA_OPTIONS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'ausente', label: 'Ausente' },
  { value: 'indisponivel', label: 'Indisponível' }
];

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
  const [salvandoInfo, setSalvandoInfo] = useState(false);

  const assinaturaInputRef = useRef(null);
  const [uploadingAssinatura, setUploadingAssinatura] = useState(false);
  const [removendoAssinatura, setRemovendoAssinatura] = useState(false);
  const [atualizandoPresenca, setAtualizandoPresenca] = useState(false);

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
    setEditando(true);
  };

  const cancelarEdicao = () => setEditando(false);

  const handleAssinaturaChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      await alert({ title: 'Formato inválido', message: 'A assinatura deve ser enviada em PNG.' });
      event.target.value = '';
      return;
    }

    setUploadingAssinatura(true);
    try {
      const formData = new FormData();
      formData.append('assinatura', file);
      const response = await patchUsuarioAssinatura(usuario.id, formData);
      atualizarUsuarioLogado?.({ assinatura_png: response?.data?.assinatura_png || null });
      await alert({ title: 'Sucesso', message: 'Assinatura atualizada.' });
    } catch (error) {
      await alert({ title: 'Erro', message: error.response?.data?.erro || 'Erro ao enviar assinatura.' });
    } finally {
      setUploadingAssinatura(false);
      event.target.value = '';
    }
  };

  const handleRemoverAssinatura = async () => {
    if (!usuario?.assinatura_png || removendoAssinatura) return;
    setRemovendoAssinatura(true);
    try {
      await deleteUsuarioAssinatura(usuario.id);
      atualizarUsuarioLogado?.({ assinatura_png: null });
      await alert({ title: 'Sucesso', message: 'Assinatura removida.' });
    } catch (error) {
      await alert({ title: 'Erro', message: error.response?.data?.erro || 'Erro ao remover assinatura.' });
    } finally {
      setRemovendoAssinatura(false);
    }
  };

  const handleSalvarInfo = async () => {
    setSalvandoInfo(true);
    try {
      const res = await patchUsuarioInfo(usuario.id, { nome: editNome, email: editEmail });
      const usuarioAtualizado = res?.data?.usuario || {
        nome: editNome,
        email: editEmail,
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

  const handleAtualizarPresenca = async (novoStatus) => {
    if (!usuario?.id || !novoStatus || atualizandoPresenca) return;
    if (String(usuario?.presenca_status || 'disponivel') === String(novoStatus)) return;

    setAtualizandoPresenca(true);
    try {
      const res = await patchUsuarioPresenca(usuario.id, novoStatus);
      const atualizado = res?.data?.usuario || { presenca_status: novoStatus };
      if (typeof atualizarUsuarioLogado === 'function') {
        atualizarUsuarioLogado({
          presenca_status: atualizado.presenca_status || novoStatus,
          presenca_atualizado_em: atualizado.presenca_atualizado_em || null
        });
      }
    } catch (e) {
      await alert({ title: 'Erro', message: e.response?.data?.erro || 'Erro ao atualizar presença.' });
    } finally {
      setAtualizandoPresenca(false);
    }
  };

  const handleTrocarSenha = async (e) => {
    e.preventDefault();
    if (novaSenha.length > 72) {
      await alert({ title: 'Erro', message: 'A nova senha deve ter no máximo 72 caracteres.' });
      return;
    }
    const senhaStrength = getPasswordStrength(novaSenha);
    if (senhaStrength.level === 'fraca') {
      await alert({ title: 'Erro', message: 'A nova senha precisa ter no mínimo nível Médio de segurança. Use letras, números e caracteres especiais.' });
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
            <p className="perfil-header-kicker">Conta e acesso</p>
            <h1 className="perfil-page-title">Meu perfil</h1>
            <p className="perfil-page-subtitle">Consulte seus dados de acesso e altere sua senha.</p>
          </div>

          <div className="perfil-header-actions">
            <span className="perfil-header-status"><span /> Sessão ativa</span>
            <button className="btn btn-secondary perfil-back-btn" onClick={() => navigate(rotaVoltar)} title={tituloVoltar}>
              <ArrowLeft size={18} />
              Voltar
            </button>
          </div>
        </div>

        <div className="perfil-grid">
          {/* Informações do usuário */}
          <section className="card perfil-section-card perfil-profile-card">
            <div className="perfil-user-card">
              <div className="perfil-user-main">
                <div className="perfil-user-heading">
                  <div>
                    <p className="perfil-user-kicker">Perfil pessoal</p>
                    <h2 className="perfil-user-name">{nomeExibicao}</h2>
                  </div>
                  <span className="perfil-active-badge"><span /> Ativo</span>
                </div>
                <div className="perfil-user-context">
                  <span><Briefcase size={14} /> {funcaoExibicao}</span>
                  <span><AtSign size={14} /> {usuario?.login}</span>
                </div>
                <p className="perfil-presenca-label">Como você está disponível hoje?</p>
                <div className="perfil-presenca-wrap">
                  {PRESENCA_OPTIONS.map((option) => {
                    const ativo = String(usuario?.presenca_status || 'disponivel') === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`perfil-presenca-btn${ativo ? ' active' : ''}`}
                        disabled={atualizandoPresenca}
                        onClick={() => handleAtualizarPresenca(option.value)}
                      >
                        <span className={`perfil-presenca-dot ${option.value}`} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
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
            <div className="perfil-section-header perfil-contact-header">
              <div>
                <p className="perfil-section-eyebrow">Dados pessoais</p>
                <h2 className="card-title">Informações de contato</h2>
              </div>
              <div className="perfil-section-icon">
                <User size={18} />
              </div>
            </div>

            {!editando ? (
              <div className="perfil-contact-list">
                <div className="perfil-info-row">
                  <Mail size={14} style={{ opacity: 0.6 }} />
                  <span className="perfil-meta-label">E-mail:</span>
                  <span>{cleanText(usuario?.email) || <em style={{ opacity: 0.5 }}>Não informado</em>}</span>
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

            <div className="perfil-signature-section">
              <div className="perfil-section-header">
                <div>
                  <p className="perfil-section-eyebrow">Documentos</p>
                  <h2 className="card-title">Assinatura digital</h2>
                </div>
                <div className="perfil-section-icon perfil-section-icon-signature">
                  <Pencil size={18} />
                </div>
              </div>
              <p className="perfil-signature-copy">Adicione sua assinatura em PNG para aparecer nos PDFs de RDO e RNC gerados por você.</p>

              {usuario?.assinatura_png ? (
                <div className="perfil-signature-preview">
                  <div className="perfil-signature-image-wrap">
                    <img src={getUploadUrl(usuario.assinatura_png)} alt="Assinatura cadastrada" />
                  </div>
                  <button className="btn btn-secondary perfil-signature-remove" type="button" onClick={handleRemoverAssinatura} disabled={removendoAssinatura}>
                    <Trash2 size={14} /> {removendoAssinatura ? 'Removendo...' : 'Remover assinatura'}
                  </button>
                </div>
              ) : (
                <label className="perfil-signature-upload">
                  <Upload size={18} />
                  <span>
                    <strong>{uploadingAssinatura ? 'Enviando...' : 'Adicionar assinatura PNG'}</strong>
                    <small>Use uma imagem com fundo transparente, se possível.</small>
                  </span>
                  <input ref={assinaturaInputRef} type="file" accept="image/png" onChange={handleAssinaturaChange} disabled={uploadingAssinatura} />
                </label>
              )}
            </div>
          </section>

          <section className="card perfil-section-card perfil-security-card">
            <div className="perfil-section-header">
              <div>
                <p className="perfil-section-eyebrow">Segurança</p>
                <h2 className="card-title">Alterar senha</h2>
              </div>
              <div className="perfil-section-icon perfil-section-icon-security">
                <KeyRound size={18} />
              </div>
            </div>

            <div className="perfil-security-note">
              <ShieldCheck size={18} />
              <p>Use uma senha com no mínimo nível Médio de segurança, combinando letras, números e caracteres especiais.</p>
            </div>

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
                    placeholder="Digite uma senha forte"
                  />
                  {novaSenha && (
                    <div className="perfil-password-strength" aria-live="polite">
                      <div className="perfil-password-strength-track">
                        <span style={{ width: getPasswordStrength(novaSenha).width, backgroundColor: getPasswordStrength(novaSenha).color }} />
                      </div>
                      <span style={{ color: getPasswordStrength(novaSenha).color }}>
                        Nível da senha: {getPasswordStrength(novaSenha).label}
                      </span>
                    </div>
                  )}
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

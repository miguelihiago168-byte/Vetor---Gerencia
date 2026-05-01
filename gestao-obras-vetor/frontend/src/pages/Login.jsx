import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginAPI, registerTrialAccount, esqueciSenha, cancelarConta } from '../services/api';
import { ArrowRight, Eye, EyeOff, CalendarX } from 'lucide-react';
import './Login.css';

const getPasswordStrength = (value) => {
  const pwd = String(value || '');
  if (!pwd) return { level: 'fraca', score: 0, label: 'Fraca', color: '#ef4444' };

  const upper = (pwd.match(/[A-Z]/g) || []).length;
  const lower = (pwd.match(/[a-z]/g) || []).length;
  const digits = (pwd.match(/\d/g) || []).length;
  const special = (pwd.match(/[^A-Za-z0-9]/g) || []).length;

  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (upper > 0) score += 1;
  if (upper >= 2) score += 1;
  if (lower > 0) score += 1;
  if (digits > 0) score += 1;
  if (digits >= 3) score += 1;
  if (special > 0) score += 1;
  if (special >= 2) score += 1;

  if (score <= 3) return { level: 'fraca', score, label: 'Fraca', color: '#ef4444' };
  if (score <= 6) return { level: 'medio', score, label: 'Médio', color: '#f59e0b' };
  if (score <= 8) return { level: 'forte', score, label: 'Forte', color: '#10b981' };
  return { level: 'extraforte', score, label: 'Extraforte', color: '#0ea5e9' };
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

const normalizeAuthErrorMessage = (msg) => {
  return String(msg || '');
};

function Login() {
  const [modo, setModo] = useState('login');
  const [loginForm, setLoginForm] = useState({ usuario: '', senha: '' });
  const [cadastroForm, setCadastroForm] = useState({ nome: '', empresa: '', email: '', usuario: '', senha: '', codigo_acesso: '' });
  const [usuarioManual, setUsuarioManual] = useState(false);
  const [showLoginSenha, setShowLoginSenha] = useState(false);
  const [showCadastroSenha, setShowCadastroSenha] = useState(false);
  const [manterLogin, setManterLogin] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(false);
  const [esqueciLogin, setEsqueciLogin] = useState('');
  const [trialExpirado, setTrialExpirado] = useState(null); // { tenant_id, login, senha }
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [cancelandoConta, setCancelandoConta] = useState(false);

  const { loginAuth } = useAuth();
  const navigate = useNavigate();

  const handleEsqueciSenha = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');
    if (!esqueciLogin.trim()) {
      setErro('Informe seu login ou e-mail.');
      return;
    }
    setLoading(true);
    try {
      await esqueciSenha(esqueciLogin.trim());
      setSucesso('Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.');
      setEsqueciLogin('');
    } catch {
      setSucesso('Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    const credential = loginForm.usuario.trim();
    if (!credential) {
      setErro('Informe seu usuário ou e-mail.');
      return;
    }

    if (!loginForm.senha) {
      setErro('Informe a senha.');
      return;
    }

    setLoading(true);

    try {
      const response = await loginAPI({
        usuario: credential,
        senha: loginForm.senha,
        manterLogin,
      });
      loginAuth(response.data.token, response.data.usuario, manterLogin);
      navigate(response.data?.usuario?.primeiro_acesso_pendente ? '/primeiro-acesso' : '/projetos');
    } catch (error) {
      const codigo = error.response?.data?.codigo;
      if (codigo === 'TRIAL_EXPIRADO') {
        setTrialExpirado({
          tenant_id: error.response.data.tenant_id,
          login: loginForm.usuario.trim(),
          senha: loginForm.senha,
        });
      } else {
        setErro(normalizeAuthErrorMessage(error.response?.data?.erro || 'Erro ao fazer login.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancelarConta = async () => {
    setCancelandoConta(true);
    setErro('');
    try {
      await cancelarConta(trialExpirado);
      setTrialExpirado(null);
      setConfirmarExclusao(false);
      setSucesso('Conta excluída com sucesso.');
    } catch {
      setErro('Erro ao excluir conta. Tente novamente.');
    } finally {
      setCancelandoConta(false);
    }
  };

  const handleCadastro = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    const usuario = cadastroForm.usuario.trim();

    if (!cadastroForm.nome.trim()) {
      setErro('Nome é obrigatório.');
      return;
    }

    if (!cadastroForm.empresa.trim()) {
      setErro('Empresa é obrigatória.');
      return;
    }

    if (!cadastroForm.email.trim()) {
      setErro('E-mail é obrigatório.');
      return;
    }

    if (!usuario) {
      setErro('Usuário é obrigatório.');
      return;
    }

    if (!cadastroForm.senha) {
      setErro('Senha é obrigatória.');
      return;
    }

    if (!cadastroForm.codigo_acesso.trim()) {
      setErro('Código global é obrigatório para criar conta.');
      return;
    }

    setLoading(true);
    try {
      const response = await registerTrialAccount({
        nome: cadastroForm.nome.trim(),
        empresa: cadastroForm.empresa.trim(),
        email: cadastroForm.email.trim(),
        usuario,
        senha: cadastroForm.senha,
        codigo_acesso: cadastroForm.codigo_acesso.trim(),
      });

      const loginCriado = response.data?.usuario || usuario;
      setSucesso(`Conta criada com 30 dias de teste. Usuário: ${loginCriado}`);
      setModo('login');
      setLoginForm((prev) => ({ ...prev, usuario: loginCriado }));
      setCadastroForm({ nome: '', empresa: '', email: '', usuario: '', senha: '', codigo_acesso: '' });
      setUsuarioManual(false);
    } catch (error) {
      setErro(normalizeAuthErrorMessage(error.response?.data?.erro || 'Erro ao criar conta de teste.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="login-page login-split-layout">
      {/* Coluna esquerda: Imagem */}
      <div className="login-image-col">
        <img src="/foto_para_gestao.png" alt="Equipe em campo" className="login-image-full" />
      </div>
      {/* Coluna direita: Card de login */}
      <div className="login-card login-card-split">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <img src="/logo_vetor.png" alt="Vetor" className="login-logo-img" />
          </div>
          <div>
            <p className="login-brand-sub">Gestão de Obras</p>
          </div>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab-btn ${modo === 'login' ? 'active' : ''}`}
            onClick={() => { setModo('login'); setErro(''); setSucesso(''); }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`login-tab-btn ${modo === 'cadastro' ? 'active' : ''}`}
            onClick={() => { setModo('cadastro'); setErro(''); setSucesso(''); }}
          >
            Criar conta (30 dias)
          </button>
        </div>

        {erro && <div className="login-error">{erro}</div>}
        {sucesso && <div className="login-success">{sucesso}</div>}

        {modo === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="login-field">
              <label className="login-label">Usuário ou e-mail</label>
              <input
                type="text"
                className="login-input"
                maxLength="40"
                value={loginForm.usuario}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, usuario: e.target.value.trimStart() }))}
                placeholder="Insira seu usuário ou e-mail"
                required
              />
            </div>

            <div className="login-field">
              <label className="login-label">Senha</label>
              <div className="password-wrap">
                <input
                  type={showLoginSenha ? 'text' : 'password'}
                  className="login-input"
                  maxLength="72"
                  value={loginForm.senha}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, senha: e.target.value }))}
                  placeholder="Insira sua senha"
                  required
                />
                <button type="button" className="password-toggle" onClick={() => setShowLoginSenha((v) => !v)}>
                  {showLoginSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
              <ArrowRight size={18} />
            </button>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary, #6b7280)' }}>
              <input
                type="checkbox"
                checked={manterLogin}
                onChange={(e) => setManterLogin(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary, #6366f1)' }}
              />
              Manter conectado
            </label>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="login-link-btn"
                onClick={() => { setModo('esqueci'); setErro(''); setSucesso(''); }}
              >
                Esqueci minha senha
              </button>
            </div>
          </form>
        )}

        {modo === 'esqueci' && (
          <form onSubmit={handleEsqueciSenha}>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: 16, marginTop: 0 }}>
              Informe seu login ou e-mail cadastrado. Se encontrarmos sua conta, enviaremos as instruções de recuperação.
            </p>
            <div className="login-field">
              <label className="login-label">Login ou e-mail</label>
              <input
                type="text"
                className="login-input"
                maxLength="120"
                value={esqueciLogin}
                onChange={(e) => setEsqueciLogin(e.target.value.trimStart())}
                placeholder="Seu login ou e-mail"
                autoFocus
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar instruções'}
              <ArrowRight size={18} />
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="login-link-btn"
                onClick={() => { setModo('login'); setErro(''); setSucesso(''); }}
              >
                ← Voltar ao login
              </button>
            </div>
          </form>
        )}

        {modo === 'cadastro' && (
          <form onSubmit={handleCadastro}>
            <div className="login-field">
              <label className="login-label">Nome completo</label>
              <input
                type="text"
                className="login-input"
                maxLength="80"
                value={cadastroForm.nome}
                onChange={(e) => {
                  const nome = e.target.value;
                  setCadastroForm((prev) => ({
                    ...prev,
                    nome,
                    usuario: usuarioManual ? prev.usuario : buildUsernameFromName(nome),
                  }));
                }}
                placeholder="Seu nome"
                required
              />
            </div>

            <div className="login-field">
              <label className="login-label">Empresa</label>
              <input
                type="text"
                className="login-input"
                maxLength="80"
                value={cadastroForm.empresa}
                onChange={(e) => setCadastroForm((prev) => ({ ...prev, empresa: e.target.value }))}
                placeholder="Nome da empresa"
                required
              />
            </div>

            <div className="login-field">
              <label className="login-label">E-mail</label>
              <input
                type="email"
                className="login-input"
                maxLength="120"
                value={cadastroForm.email}
                onChange={(e) => setCadastroForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="seuemail@empresa.com"
                required
              />
            </div>

            <div className="login-field">
              <label className="login-label">Usuário</label>
              <input
                type="text"
                className="login-input"
                maxLength="40"
                value={cadastroForm.usuario}
                onChange={(e) => {
                  setUsuarioManual(true);
                  setCadastroForm((prev) => ({ ...prev, usuario: e.target.value.replace(/\s+/g, '') }));
                }}
                placeholder="seunome1234"
                required
              />
            </div>

            <div className="login-field">
              <label className="login-label">Senha</label>
              <div className="password-wrap">
                <input
                  type={showCadastroSenha ? 'text' : 'password'}
                  className="login-input"
                  maxLength="72"
                  value={cadastroForm.senha}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, senha: e.target.value }))}
                  placeholder="Digite sua senha"
                  required
                />
                <button type="button" className="password-toggle" onClick={() => setShowCadastroSenha((v) => !v)}>
                  {showCadastroSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {(() => {
                const strength = getPasswordStrength(cadastroForm.senha);
                const width = strength.level === 'fraca' ? '25%' : strength.level === 'medio' ? '50%' : strength.level === 'forte' ? '75%' : '100%';
                return (
                  <>
                    <div className="password-strength">
                      <div className="password-strength-bar" style={{ width, backgroundColor: strength.color }} />
                    </div>
                    <small className="login-helper" style={{ color: strength.color }}>
                      Nível da senha: {strength.label}{strength.level === 'fraca' ? ' - Sugestão: adicione mais letras maiúsculas, números e caracteres especiais.' : ''}
                    </small>
                  </>
                );
              })()}
            </div>

            <div className="login-field">
              <label className="login-label">Código global de criação</label>
              <input
                type="text"
                className="login-input"
                value={cadastroForm.codigo_acesso}
                onChange={(e) => setCadastroForm((prev) => ({ ...prev, codigo_acesso: e.target.value }))}
                placeholder="Informe o código"
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta teste (30 dias)'}
              <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
    </div>

    {/* Modal: Trial expirado */}
    {trialExpirado && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
      }}>
        <div style={{
          background: '#fff', borderRadius: 20, padding: '40px 36px',
          maxWidth: 440, width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20
          }}>
            <CalendarX size={30} color="#d97706" />
          </div>

          <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
            Período de teste encerrado
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: '#475569', lineHeight: 1.55 }}>
            Seu período de <strong>30 dias gratuitos</strong> expirou. Seus dados estão preservados.
            Assine o serviço para continuar usando o sistema, ou cancele a conta para excluir todos os dados permanentemente.
          </p>

          {!confirmarExclusao ? (
            <>
              <button
                disabled
                style={{
                  width: '100%', height: 48, borderRadius: 12, border: 'none',
                  background: '#e2e8f0', color: '#94a3b8', fontWeight: 700, fontSize: 15,
                  cursor: 'not-allowed', marginBottom: 12, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                Assinar serviço
                <span style={{
                  background: '#0ea5e9', color: '#fff', fontSize: 10, fontWeight: 700,
                  borderRadius: 99, padding: '2px 8px', letterSpacing: '0.05em'
                }}>EM BREVE</span>
              </button>

              <button
                onClick={() => setConfirmarExclusao(true)}
                style={{
                  width: '100%', height: 44, borderRadius: 12, border: '1.5px solid #fecaca',
                  background: '#fff', color: '#dc2626', fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', marginBottom: 16
                }}
              >
                Excluir minha conta e dados
              </button>

              <button
                type="button"
                className="login-link-btn"
                onClick={() => setTrialExpirado(null)}
                style={{ fontSize: 13, color: '#94a3b8' }}
              >
                Fechar
              </button>
            </>
          ) : (
            <>
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                padding: '12px 16px', marginBottom: 20, width: '100%', textAlign: 'left'
              }}>
                <p style={{ margin: 0, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                  ⚠️ Atenção: esta ação é irreversível.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#7f1d1d' }}>
                  Todos os seus projetos, RDOs, EAP, compras e demais dados serão excluídos permanentemente e não poderão ser recuperados.
                </p>
              </div>

              <button
                onClick={handleCancelarConta}
                disabled={cancelandoConta}
                style={{
                  width: '100%', height: 48, borderRadius: 12, border: 'none',
                  background: cancelandoConta ? '#e2e8f0' : '#dc2626',
                  color: cancelandoConta ? '#94a3b8' : '#fff',
                  fontWeight: 700, fontSize: 15, cursor: cancelandoConta ? 'not-allowed' : 'pointer',
                  marginBottom: 12
                }}
              >
                {cancelandoConta ? 'Excluindo...' : 'Confirmar exclusão definitiva'}
              </button>

              <button
                type="button"
                className="login-link-btn"
                onClick={() => setConfirmarExclusao(false)}
              >
                ← Voltar
              </button>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}

export default Login;

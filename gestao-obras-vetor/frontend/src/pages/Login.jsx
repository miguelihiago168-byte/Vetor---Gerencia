import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginAPI, registerTrialAccount } from '../services/api';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
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
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(false);

  const { loginAuth } = useAuth();
  const navigate = useNavigate();

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
      });
      loginAuth(response.data.token, response.data.usuario);
      navigate(response.data?.usuario?.primeiro_acesso_pendente ? '/primeiro-acesso' : '/projetos');
    } catch (error) {
      setErro(normalizeAuthErrorMessage(error.response?.data?.erro || 'Erro ao fazer login.'));
    } finally {
      setLoading(false);
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

        {modo === 'login' ? (
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
          </form>
        ) : (
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
  );
}

export default Login;

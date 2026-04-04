import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { registerWithInviteToken, validateInviteToken } from '../services/api';
import { ArrowRight, ArrowLeft, Copy, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hasForbiddenPasswordSequence } from '../utils/passwordPolicy';
import './Login.css';

// Senha: exatamente 6 chars, >= 4 dígitos, >= 1 letra, >= 1 especial
const SENHA_REGEX = /^(?=(.*\d){4,})(?=.*[a-zA-Z])(?=.*[^a-zA-Z0-9]).{6}$/;

function CriarConta() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { loginAuth } = useAuth();

  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmar: '' });
  const [erro, setErro] = useState('');
  const [erroToken, setErroToken] = useState('');
  const [tokenValido, setTokenValido] = useState(false);
  const [validandoToken, setValidandoToken] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loginGerado, setLoginGerado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  React.useEffect(() => {
    const validarToken = async () => {
      if (!token) {
        setErroToken('Convite inválido. Solicite um novo link ao administrador.');
        setValidandoToken(false);
        return;
      }
      try {
        const response = await validateInviteToken(token);
        setTokenValido(true);
        setForm((prev) => ({
          ...prev,
          email: response.data?.email || '',
          nome: response.data?.nome || prev.nome
        }));
      } catch (e) {
        setTokenValido(false);
        setErroToken(e.response?.data?.erro || 'Convite inválido, expirado ou já utilizado.');
      } finally {
        setValidandoToken(false);
      }
    };

    validarToken();
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validar = () => {
    if (!form.nome.trim()) return 'Informe seu nome completo.';
    if (!form.email.trim()) return 'E-mail do convite não encontrado.';
    if (form.senha.length !== 6) return 'A senha deve ter exatamente 6 caracteres.';
    if (!SENHA_REGEX.test(form.senha)) {
      return 'A senha deve conter pelo menos 4 números, 1 letra e 1 caractere especial (ex: 1234a!).';
    }
    if (hasForbiddenPasswordSequence(form.senha)) {
      return 'A senha não pode conter sequência crescente/decrescente de letras ou números (ex: abcd, 1234, 9876).';
    }
    if (form.senha !== form.confirmar) return 'As senhas não conferem.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');

    const erroValidacao = validar();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    setLoading(true);
    try {
      const response = await registerWithInviteToken(token, {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        senha: form.senha
      });
      if (response?.data?.token && response?.data?.usuario) {
        loginAuth(response.data.token, response.data.usuario);
      }
      setLoginGerado(response.data?.usuario?.login || response.data?.login || '');
      setTimeout(() => navigate('/projetos'), 700);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const copiarLogin = () => {
    navigator.clipboard.writeText(loginGerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (validandoToken) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="criar-conta-heading">Validando convite...</p>
        </div>
      </div>
    );
  }

  if (!tokenValido) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            {erroToken || 'Convite inválido.'}
          </div>
          <div className="login-register-link">
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={14} />
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loginGerado) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-logo-wrap">
              <img src="/logo_vetor.png" alt="Vetor" className="login-logo-img" />
            </div>
            <div>
              <p className="login-brand-sub">Gestão de Obras</p>
            </div>
          </div>

          <div className="criar-conta-sucesso">
            <div className="criar-conta-sucesso-icone">✓</div>
            <h2 className="criar-conta-sucesso-titulo">Conta criada!</h2>
            <p className="criar-conta-sucesso-desc">
              Anote seu número de acesso abaixo. Você precisará dele para entrar no sistema.
            </p>

            <div className="criar-conta-login-box">
              <span className="criar-conta-login-label">Seu login</span>
              <div className="criar-conta-login-valor">
                <span>{loginGerado}</span>
                <button
                  type="button"
                  className="criar-conta-copiar-btn"
                  onClick={copiarLogin}
                  title="Copiar login"
                >
                  {copiado ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <Link to="/login" className="login-btn criar-conta-ir-login">
              Ir para o login
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <img src="/logo_vetor.png" alt="Vetor" className="login-logo-img" />
          </div>
          <div>
            <p className="login-brand-sub">Gestão de Obras</p>
          </div>
        </div>

        <p className="criar-conta-heading">Criar conta</p>

        <form onSubmit={handleSubmit}>
          {erro && <div className="login-error">{erro}</div>}

          <div className="login-field">
            <label className="login-label">Nome completo</label>
            <input
              type="text"
              name="nome"
              className="login-input"
              value={form.nome}
              onChange={handleChange}
              placeholder="Seu nome"
              autoComplete="name"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label">E-mail</label>
            <input
              type="email"
              name="email"
              className="login-input"
              value={form.email}
              onChange={handleChange}
              placeholder="seu@email.com"
              autoComplete="email"
              disabled
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label">
              Senha
              <span className="criar-conta-dica"> — 6 caracteres: 4 números + 1 letra + 1 especial</span>
            </label>
            <input
              type="password"
              name="senha"
              className="login-input"
              maxLength="6"
              value={form.senha}
              onChange={handleChange}
              placeholder="ex: 1234a!"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label">Confirmar senha</label>
            <input
              type="password"
              name="confirmar"
              className="login-input"
              maxLength="6"
              value={form.confirmar}
              onChange={handleChange}
              placeholder="ex: 1234a!"
              autoComplete="new-password"
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta'}
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="login-register-link">
          <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={14} />
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CriarConta;

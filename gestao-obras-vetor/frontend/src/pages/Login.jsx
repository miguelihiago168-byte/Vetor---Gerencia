import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginAPI } from '../services/api';
import { ArrowRight } from 'lucide-react';
import './Login.css';

function Login() {
  const [loginValue, setLoginValue] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const { loginAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');

    if (loginValue.length !== 6 || senha.length !== 6) {
      setErro('Login e senha devem ter 6 dígitos.');
      return;
    }

    setLoading(true);

    try {
      const response = await loginAPI({ login: loginValue, senha });
      loginAuth(response.data.token, response.data.usuario);
      navigate('/projetos');
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <img src="/logo.svg" alt="Vetor" className="login-logo-img" />
          </div>
          <div>
            <p className="login-brand-name">Vetor</p>
            <p className="login-brand-sub">Gestão de Obras</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {erro && <div className="login-error">{erro}</div>}

          <div className="login-field">
            <label className="login-label">Login</label>
            <input
              type="text"
              className="login-input"
              maxLength="6"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label">Senha</label>
            <input
              type="password"
              className="login-input"
              maxLength="6"
              value={senha}
              onChange={(e) => setSenha(e.target.value.replace(/\D/g, ''))}
              placeholder="······"
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginAPI } from '../services/api';
import { ShieldCheck, ArrowRight, Lock } from 'lucide-react';
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
      navigate('/dashboard');
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-hero">
          <div className="hero-badge">Vetor · Gestão de Obras</div>
          <h1>
            Painel de obras com foco na operação em campo.
          </h1>
          <p>
            Registre RDOs, envie evidências e acompanhe aprovações com simplicidade.
          </p>
          <div className="hero-grid">
            <div className="hero-card">
              <strong>1.8d</strong>
              <span>Aprovação média</span>
            </div>
            <div className="hero-card">
              <strong>98%</strong>
              <span>Conformidade</span>
            </div>
            <div className="hero-card">
              <strong>3.0</strong>
              <span>Evidências / RDO</span>
            </div>
          </div>
        </div>

        <div className="login-panel">
          <div className="panel-header">
            <div className="brand-mark">VT</div>
            <div>
              <p className="eyebrow">Gestão de Obras</p>
              <h2>Acesso ao Sistema</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {erro && <div className="alert alert-error">{erro}</div>}

            <div className="form-group">
              <label className="form-label">Login (6 dígitos)</label>
              <div className="input-shell">
                <ShieldCheck size={18} />
                <input
                  type="text"
                  className="form-input"
                  maxLength="6"
                  value={loginValue}
                  onChange={(e) => setLoginValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Senha (6 dígitos)</label>
              <div className="input-shell">
                <Lock size={18} />
                <input
                  type="password"
                  className="form-input"
                  maxLength="6"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value.replace(/\D/g, ''))}
                  placeholder="······"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar' }
              <ArrowRight size={18} />
            </button>

            <div className="login-hint">
              <span><strong>Demo:</strong> Login 000001 · Senha 123456</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginAPI } from '../services/api';
import { ShieldCheck, ArrowRight, Lock, ClipboardList, ShoppingCart, AlertTriangle, CheckCircle } from 'lucide-react';
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
      <div className="login-container">
        <div className="login-hero">
          <div className="hero-badge">Vetor · Gestão de Obras</div>
          <h1>
            Gestão de obras com controle total e rastreabilidade.
          </h1>
          <p>
            RDO digital, compras automatizadas e controle de não conformidades em um único sistema.
          </p>

          {/* Feature blocks */}
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon"><ClipboardList size={22} /></div>
              <div className="feature-content">
                <strong>RDO Digital</strong>
                <span>Registro diário com fotos, evidências e aprovações rápidas.</span>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon"><ShoppingCart size={22} /></div>
              <div className="feature-content">
                <strong>Compras Automatizadas</strong>
                <span>Solicitações e aprovações em fluxo digital.</span>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon"><AlertTriangle size={22} /></div>
              <div className="feature-content">
                <strong>RNC e Qualidade</strong>
                <span>Registro e tratamento de não conformidades.</span>
              </div>
            </div>
          </div>

          {/* Impact metrics */}
          <div className="hero-grid">
            <div className="hero-card hero-metric">
              <div className="metric-line"><CheckCircle size={18} /> <span>-40% retrabalho</span></div>
            </div>
            <div className="hero-card hero-metric">
              <div className="metric-line"><CheckCircle size={18} /> <span>Aprovações 2x mais rápidas</span></div>
            </div>
            <div className="hero-card hero-metric">
              <div className="metric-line"><CheckCircle size={18} /> <span>100% rastreabilidade</span></div>
            </div>
          </div>
        </div>

        <div className="login-panel">
          <div className="panel-header">
            <img src="/logo.svg" alt="Vetor" className="panel-logo" />
            <div>
              <p className="brand-title">Vetor</p>
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

            <div className="login-notes">
              <small className="text-muted">Ambiente seguro para dados de obra e documentos.</small>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;

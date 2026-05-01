import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { redefinirSenha } from '../services/api';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import './Login.css';

function RedefinirSenha() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!senha) {
      setErro('Informe a nova senha.');
      return;
    }

    if (senha !== confirmar) {
      setErro('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      await redefinirSenha(token, senha);
      setSucesso('Senha redefinida com sucesso!');
      setTimeout(() => navigate('/login'), 2500);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao redefinir senha. O link pode ter expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page login-split-layout">
      <div className="login-image-col">
        <img src="/foto_para_gestao.png" alt="Equipe em campo" className="login-image-full" />
      </div>

      <div className="login-card login-card-split">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <img src="/logo_vetor.png" alt="Vetor" className="login-logo-img" />
          </div>
          <div>
            <p className="login-brand-sub">Gestão de Obras</p>
          </div>
        </div>

        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: 8, marginTop: 0 }}>
          Redefinir senha
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: 20, marginTop: 0 }}>
          Digite e confirme sua nova senha.
        </p>

        {erro && <div className="login-error">{erro}</div>}
        {sucesso && <div className="login-success">{sucesso} Redirecionando para o login...</div>}

        {!sucesso && (
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label className="login-label">Nova senha</label>
              <div className="password-wrap">
                <input
                  type={showSenha ? 'text' : 'password'}
                  className="login-input"
                  maxLength="72"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite sua nova senha"
                  required
                  autoFocus
                />
                <button type="button" className="password-toggle" onClick={() => setShowSenha((v) => !v)}>
                  {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label className="login-label">Confirmar nova senha</label>
              <div className="password-wrap">
                <input
                  type={showConfirmar ? 'text' : 'password'}
                  className="login-input"
                  maxLength="72"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="Repita a nova senha"
                  required
                />
                <button type="button" className="password-toggle" onClick={() => setShowConfirmar((v) => !v)}>
                  {showConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Salvando...' : 'Redefinir senha'}
              <ArrowRight size={18} />
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="login-link-btn"
                onClick={() => navigate('/login')}
              >
                ← Voltar ao login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default RedefinirSenha;

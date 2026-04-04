import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, LogOut, ShieldCheck } from 'lucide-react';
import { concluirPrimeiroAcesso } from '../services/api';
import { useAuth } from '../context/AuthContext';

const FUNCOES = ['Administrativo', 'Almoxarife', 'Fiscal', 'Gestor Geral', 'Gestor Local', 'Gestor de Qualidade'];
const SETORES = ['Administrativo', 'Engenharia', 'Qualidade', 'Almoxarifado', 'Financeiro', 'Outro'];

function PrimeiroAcesso() {
  const navigate = useNavigate();
  const { usuario, atualizarUsuarioLogado, logout } = useAuth();
  const [funcao, setFuncao] = useState(usuario?.funcao || 'Administrativo');
  const [setor, setSetor] = useState(usuario?.setor || 'Administrativo');
  const [setorOutro, setSetorOutro] = useState(usuario?.setor_outro || '');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');

    if (!funcao.trim()) {
      setErro('Informe sua função/perfil de atuação.');
      return;
    }

    if (setor === 'Outro' && !setorOutro.trim()) {
      setErro('Informe o setor quando selecionar Outro.');
      return;
    }

    setLoading(true);
    try {
      const response = await concluirPrimeiroAcesso({
        funcao,
        setor,
        setor_outro: setor === 'Outro' ? setorOutro.trim() : null
      });
      atualizarUsuarioLogado(response.data.usuario);
      navigate('/projetos', { replace: true });
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao concluir primeiro acesso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.05), rgba(59, 130, 246, 0.08))' }}>
      <div className="card" style={{ width: '100%', maxWidth: '620px', padding: '28px', borderRadius: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <p className="eyebrow">Primeiro acesso</p>
            <h1 style={{ margin: '6px 0 8px', fontSize: '1.9rem' }}>Complete seu perfil inicial</h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Antes de entrar no sistema, informe sua função de atuação e confirme seu setor.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={16} /> Sair
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div style={{ padding: '14px 16px', borderRadius: '16px', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <ShieldCheck size={16} />
              <strong>Perfil de acesso</strong>
            </div>
                <div style={{ color: 'var(--text-secondary)' }}>{usuario?.perfil || 'Não informado'}</div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: '16px', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Building2 size={16} />
              <strong>Usuário</strong>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>{usuario?.login}</div>
          </div>
        </div>

        {erro && (
          <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '14px', background: 'rgba(239, 68, 68, 0.08)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.18)' }}>
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Qual sua função/perfil de atuação?</label>
            <div style={{ position: 'relative' }}>
              <Briefcase size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <select className="form-select" value={funcao} onChange={(e) => setFuncao(e.target.value)} style={{ paddingLeft: '38px' }}>
                {FUNCOES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Qual seu setor?</label>
            <select className="form-select" value={setor} onChange={(e) => setSetor(e.target.value)}>
              {SETORES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          {setor === 'Outro' && (
            <div className="form-group">
              <label className="form-label">Informe o setor</label>
              <input className="form-input" value={setorOutro} onChange={(e) => setSetorOutro(e.target.value)} />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Salvando...' : 'Continuar para o sistema'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PrimeiroAcesso;
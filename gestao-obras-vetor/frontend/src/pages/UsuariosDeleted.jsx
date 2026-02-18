import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getUsuariosDeletados } from '../services/api';
import { ArrowLeft, UserX, Calendar, User } from 'lucide-react';

function UsuariosDeleted() {
  const navigate = useNavigate();
  const [usuariosDeleted, setUsuariosDeleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    carregarUsuariosDeletados();
  }, []);

  const carregarUsuariosDeletados = async () => {
    try {
      setLoading(true);
      const response = await getUsuariosDeletados();
      setUsuariosDeleted(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar usuários deletados:', error);
      setErro('Erro ao carregar usuários deletados');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/usuarios')}>
            <ArrowLeft size={16} />
          </button>
          <h1>Usuários Deletados (Soft Delete)</h1>
        </div>

        {erro && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{erro}</div>}

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserX size={20} />
              Lista de Usuários Excluídos
            </h2>
            <p style={{ color: 'var(--gray-600)', marginTop: '4px' }}>
              Estes usuários foram removidos do sistema mas mantidos para auditoria.
            </p>
          </div>

          {usuariosDeleted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-500)' }}>
              <UserX size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p>Nenhum usuário deletado encontrado.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Login</th>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Tipo</th>
                    <th style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={16} />
                      Deletado em
                    </th>
                    <th>Deletado por</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosDeleted.map((usuario) => (
                    <tr key={usuario.id}>
                      <td>#{usuario.id}</td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {usuario.login}
                        </span>
                      </td>
                      <td>{usuario.nome}</td>
                      <td>{usuario.email || '-'}</td>
                      <td>
                        <span className={`badge ${usuario.is_gestor ? 'badge-primary' : 'badge-secondary'}`}>
                          {usuario.is_gestor ? 'Gestor' : 'Usuário'}
                        </span>
                      </td>
                      <td>
                        {usuario.deletado_em ? new Date(usuario.deletado_em).toLocaleString('pt-BR') : 'N/A'}
                      </td>
                      <td>
                        {usuario.deletado_por ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <User size={14} />
                            ID: {usuario.deletado_por}
                          </span>
                        ) : 'Sistema'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default UsuariosDeleted;
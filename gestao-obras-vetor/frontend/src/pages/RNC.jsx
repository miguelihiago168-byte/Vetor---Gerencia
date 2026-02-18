import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRNCs, deleteRNC } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Plus, Eye, Edit, Trash2 } from 'lucide-react';
import './RNC.css';

function RNC() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const [rncs, setRncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const formatLocalDate = (dstr) => {
    if (!dstr) return 'N/A';
    const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const dt = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
      return dt.toLocaleDateString('pt-BR');
    }
    const dt = new Date(dstr);
    return isNaN(dt.getTime()) ? dstr : dt.toLocaleDateString('pt-BR');
  };

  const statusLabel = (s) => {
    if (s === 'Em análise') return 'Em aprovação';
    return s || 'N/A';
  };

  const statusColor = (s) => {
    // Consistência visual com RDO: Em aprovação (amarelo), Encerrada (verde), Aberta/Em andamento (azul)
    if (s === 'Encerrada') return '#2E7D32';
    if (s === 'Em análise') return '#F9A825';
    return '#2962FF';
  };

  // Aprovação foi movida para a tela de detalhes (RNCDetalhes)

  useEffect(() => {
    carregarRNCs();
  }, [projetoId]);

  const carregarRNCs = async () => {
    try {
      setLoading(true);
      console.log('Carregando RNCs para projeto:', projetoId);
      const response = await getRNCs(projetoId);
      console.log('RNCs carregadas:', response.data);
      console.log('Número de RNCs:', response.data?.length || 0);
      setRncs(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar RNCs:', error);
      setErro('Erro ao carregar RNCs: ' + (error.response?.data?.erro || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja realmente deletar esta RNC?')) return;

    try {
      await deleteRNC(id);
      setRncs(rncs.filter(rnc => rnc.id !== id));
    } catch (error) {
      console.error('Erro ao deletar RNC:', error);
      setErro('Erro ao deletar RNC: ' + (error.response?.data?.erro || error.message));
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
      <div className="container rnc-container">
        <div className="rnc-header">
          <h1>RNCs do Projeto</h1>
          <button className="btn btn-primary" onClick={() => navigate(`/projeto/${projetoId}/rnc/novo`)}>
            <Plus size={16} />
            Nova RNC
          </button>
        </div>

        {erro && <div className="alert alert-error rnc-alert">{erro}</div>}

        {rncs.length === 0 ? (
          <div className="card rnc-empty">
            <AlertTriangle size={48} className="rnc-empty-icon" />
            <h3 className="rnc-empty-title">Nenhuma RNC encontrada</h3>
            <p className="rnc-empty-sub">Crie a primeira RNC para este projeto.</p>
          </div>
        ) : (
          <div className="rnc-grid">
            {rncs.map(rnc => (
              <div key={rnc.id} className="card rnc-card">
                <div className="rnc-card-header">
                  <div className="rnc-status" style={{ background: statusColor(rnc.status) }}>
                    {statusLabel(rnc.status)}
                  </div>
                  <div className="rnc-top-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => navigate(`/projeto/${projetoId}/rnc/${rnc.id}`)}
                      title="Ver detalhes"
                    >
                      <Eye size={16} /> Detalhes
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => window.open(`/api/rnc/${rnc.id}/pdf`, '_blank')}
                      title="Download PDF"
                    >
                      PDF
                    </button>
                  </div>
                </div>

                <h3 className="rnc-title">{rnc.titulo || `RNC #${rnc.id}`}</h3>

                <div className="rnc-dates">
                  <span>Data: {formatLocalDate(rnc.criado_em)}</span>
                  <span>Prevista: {formatLocalDate(rnc.data_prevista_encerramento)}</span>
                </div>

                {rnc.status !== 'Encerrada' && (
                  <div className="rnc-actions">
                    <button
                      className="btn btn-warning"
                      onClick={() => navigate(`/projeto/${projetoId}/rnc/${rnc.id}?responder=1`)}
                      title="Responder RNC"
                      disabled={rnc.status === 'Encerrada'}
                    >
                      <Edit size={16} /> Responder
                    </button>
                    {isGestor && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(rnc.id)}
                        title="Deletar RNC"
                        disabled={rnc.status === 'Encerrada'}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default RNC;

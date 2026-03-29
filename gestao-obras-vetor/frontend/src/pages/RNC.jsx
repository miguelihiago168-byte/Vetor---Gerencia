import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRNCs, deleteRNC } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { AlertTriangle, Plus, Eye, Edit2, Trash2, FileText } from 'lucide-react';
import './RNC.css';

function RNC() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const { confirm } = useDialog();
  const [rncs, setRncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const formatShortDate = (dstr) => {
    if (!dstr) return null;
    const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dt = m
      ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
      : new Date(dstr);
    if (isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const statusLabel = (s) => {
    if (s === 'Em análise') return 'Em aprovação';
    return s || 'N/A';
  };

  const getBadgeClass = (s) => {
    if (s === 'Encerrada') return 'rnc-badge rnc-badge-encerrada';
    if (s === 'Em análise') return 'rnc-badge rnc-badge-analise';
    return 'rnc-badge rnc-badge-aberta';
  };

  useEffect(() => {
    carregarRNCs();
  }, [projetoId]);

  const carregarRNCs = async () => {
    try {
      setLoading(true);
      const response = await getRNCs(projetoId);
      setRncs(response.data || []);
    } catch (error) {
      setErro('Erro ao carregar RNCs: ' + (error.response?.data?.erro || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Excluir RNC',
      message: 'Deseja realmente deletar esta RNC?',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    try {
      await deleteRNC(id);
      setRncs(rncs.filter(r => r.id !== id));
    } catch (error) {
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

        {/* ── Cabeçalho ── */}
        <div className="rnc-header">
          <div className="rnc-header-text">
            <h1>Relatórios de Não Conformidade</h1>
            <p>{rncs.length} {rncs.length === 1 ? 'registro' : 'registros'} neste projeto</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate(`/projeto/${projetoId}/rnc/novo`)}>
            <Plus size={15} />
            Nova RNC
          </button>
        </div>

        {erro && <div className="alert alert-error rnc-alert">{erro}</div>}

        {rncs.length === 0 ? (
          <div className="rnc-empty">
            <AlertTriangle size={40} className="rnc-empty-icon" />
            <h3 className="rnc-empty-title">Nenhuma RNC encontrada</h3>
            <p className="rnc-empty-sub">Crie a primeira RNC para este projeto.</p>
          </div>
        ) : (
          <div className="rnc-grid">
            {rncs.map(rnc => {
              const isEncerrada = rnc.status === 'Encerrada';
              const dataAbertura = formatShortDate(rnc.criado_em);
              const dataPrevista = formatShortDate(rnc.data_prevista_encerramento);

              return (
                <div
                  key={rnc.id}
                  className="card rnc-card"
                  onClick={() => navigate(`/projeto/${projetoId}/rnc/${rnc.id}`)}
                  title="Ver detalhes"
                >
                  {/* Badge de status */}
                  <span className={getBadgeClass(rnc.status)}>
                    {statusLabel(rnc.status)}
                  </span>

                  {/* Título */}
                  <h3 className="rnc-title">{rnc.titulo || `RNC #${rnc.id}`}</h3>

                  {/* Datas compactas */}
                  <div className="rnc-dates">
                    {dataAbertura && <span>{dataAbertura}</span>}
                    {dataAbertura && dataPrevista && <span className="rnc-dates-sep">•</span>}
                    {dataPrevista && <span>Prevista {dataPrevista}</span>}
                  </div>

                  {/* Separador + ações */}
                  <div className="rnc-divider" />
                  <div
                    className="rnc-actions"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      className="rnc-btn-ghost"
                      onClick={() => navigate(`/projeto/${projetoId}/rnc/${rnc.id}`)}
                      title="Ver detalhes"
                    >
                      <Eye size={13} />
                      Ver
                    </button>

                    <button
                      className="rnc-btn-ghost"
                      onClick={() => window.open(`/api/rnc/${rnc.id}/pdf`, '_blank')}
                      title="Download PDF"
                    >
                      <FileText size={13} />
                      PDF
                    </button>

                    {!isEncerrada && (
                      <button
                        className="rnc-btn-ghost"
                        onClick={() => navigate(`/projeto/${projetoId}/rnc/${rnc.id}?responder=1`)}
                        title="Responder RNC"
                      >
                        <Edit2 size={13} />
                        Responder
                      </button>
                    )}

                    {isGestor && !isEncerrada && (
                      <button
                        className="rnc-btn-icon"
                        onClick={e => handleDelete(e, rnc.id)}
                        title="Excluir RNC"
                        style={{ marginLeft: 'auto' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </>
  );
}

export default RNC;

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRNCs, deleteRNC, getRNCPDF } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { AlertTriangle, Plus, Eye, Trash2, FileText, Search } from 'lucide-react';
import './RNC.css';

const FILTER_TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'Em andamento', label: 'Aberta' },
  { key: 'Em análise', label: 'Em aprovação' },
  { key: 'Encerrada', label: 'Encerrada' },
  { key: 'Reprovada', label: 'Reprovada' },
];

function RNC() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const { confirm } = useDialog();
  const [rncs, setRncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');

  const cleanText = (value) => {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text) return '';
    if (text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
    return text;
  };

  const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

  const formatShortDate = (dstr) => {
    if (!dstr) return null;
    const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dt = m
      ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
      : new Date(dstr);
    if (isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  };

  const statusLabel = (s) => {
    if (s === 'Em análise') return 'Em aprovação';
    if (s === 'Em andamento') return 'Aberta';
    return s || 'N/A';
  };

  const statusDotClass = (s) => {
    if (s === 'Encerrada') return 'encerrada';
    if (s === 'Em análise') return 'analise';
    if (s === 'Reprovada') return 'reprovada';
    return 'aberta';
  };

  const statusChipClass = (s) => {
    if (s === 'Encerrada') return 'rnc-chip rnc-chip-encerrada';
    if (s === 'Em análise') return 'rnc-chip rnc-chip-analise';
    if (s === 'Reprovada') return 'rnc-chip rnc-chip-reprovada';
    return 'rnc-chip rnc-chip-aberta';
  };

  const gravidadeChipClass = (g) => {
    if (!g) return 'rnc-chip rnc-chip-default';
    const lower = g.toLowerCase();
    if (lower === 'crítica' || lower === 'critica') return 'rnc-chip rnc-chip-critica';
    if (lower === 'alta') return 'rnc-chip rnc-chip-alta';
    if (lower === 'média' || lower === 'media') return 'rnc-chip rnc-chip-media';
    if (lower === 'baixa') return 'rnc-chip rnc-chip-baixa';
    return 'rnc-chip rnc-chip-default';
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
      setErro('Erro ao deletar: ' + (error.response?.data?.erro || error.message));
    }
  };

  const handleOpenPdf = async (e, id) => {
    e.stopPropagation();
    const previewWindow = window.open('about:blank', '_blank');
    try {
      const response = await getRNCPDF(id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = blobUrl;
      } else {
        window.open(blobUrl, '_blank');
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 300000);
    } catch (error) {
      const isServerError = Number(error?.response?.status) >= 500;
      if (isServerError) {
        const token = getToken();
        const fallbackUrl = token
          ? `/api/rnc/${id}/pdf?token=${encodeURIComponent(token)}`
          : `/api/rnc/${id}/pdf`;
        if (previewWindow) {
          previewWindow.location.href = fallbackUrl;
        } else {
          window.open(fallbackUrl, '_blank');
        }
        setErro('PDF principal falhou. Tentando abertura alternativa...');
        return;
      }
      if (previewWindow) previewWindow.close();
      setErro('Erro ao abrir PDF: ' + (error.response?.data?.erro || error.message));
    }
  };

  // Filtered list
  const rncsFiltradas = rncs.filter(r => {
    if (filtroStatus !== 'todos' && r.status !== filtroStatus) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!(r.titulo || '').toLowerCase().includes(q) &&
          !(r.area_afetada || '').toLowerCase().includes(q) &&
          !(r.descricao || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const countByStatus = (key) => key === 'todos' ? rncs.length : rncs.filter(r => r.status === key).length;

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ textAlign: 'center', padding: '60px' }}>
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
          <div className="rnc-header-text">
            <h1>Não Conformidades</h1>
            <p>{rncs.length} {rncs.length === 1 ? 'registro' : 'registros'} neste projeto</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate(`/projeto/${projetoId}/rnc/novo`)}>
            <Plus size={15} />
            Nova RNC
          </button>
        </div>

        {erro && <div className="alert alert-error" style={{ marginBottom: 16 }}>{erro}</div>}

        {/* Toolbar */}
        <div className="rnc-toolbar">
          <div className="rnc-search-wrap">
            <Search size={14} className="rnc-search-icon" />
            <input
              className="rnc-search"
              type="text"
              placeholder="Buscar por título, área, descrição..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <div className="rnc-tabs">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                className={`rnc-tab${filtroStatus === tab.key ? ' active' : ''}`}
                onClick={() => setFiltroStatus(tab.key)}
              >
                {tab.label}
                <span className="rnc-tab-count">{countByStatus(tab.key)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {rncsFiltradas.length === 0 ? (
          <div className="rnc-empty">
            <AlertTriangle size={40} className="rnc-empty-icon" />
            <h3>{rncs.length === 0 ? 'Nenhuma RNC encontrada' : 'Nenhum resultado'}</h3>
            <p>{rncs.length === 0 ? 'Crie a primeira RNC para este projeto.' : 'Tente ajustar os filtros ou a busca.'}</p>
          </div>
        ) : (
          <div className="rnc-cards">
            {rncsFiltradas.map(rnc => {
              const isEncerrada = rnc.status === 'Encerrada';
              const dataAbertura = formatShortDate(rnc.criado_em);
              const titulo = cleanText(rnc.titulo) || cleanText(rnc.descricao).split('\n')[0] || `RNC #${rnc.id}`;
              const descPreview = cleanText(rnc.descricao);
              return (
                <div
                  key={rnc.id}
                  className="rnc-card"
                  onClick={() => navigate(`/projeto/${projetoId}/rnc/${rnc.id}`)}
                >
                  <div className="rnc-card-top">
                    <div className="rnc-card-badges">
                      <span className={statusChipClass(rnc.status)}>{statusLabel(rnc.status)}</span>
                      {rnc.gravidade && (
                        <span className={gravidadeChipClass(rnc.gravidade)}>{rnc.gravidade}</span>
                      )}
                    </div>
                    <div className="rnc-card-actions" onClick={e => e.stopPropagation()}>
                      <button className="rnc-act-btn" onClick={(e) => handleOpenPdf(e, rnc.id)} title="PDF">
                        <FileText size={13} />
                      </button>
                      {isGestor && !isEncerrada && (
                        <button className="rnc-act-btn rnc-act-danger" onClick={e => handleDelete(e, rnc.id)} title="Excluir">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rnc-card-body">
                    <div className="rnc-card-id">#{rnc.id}</div>
                    <h3 className="rnc-card-title">{titulo}</h3>
                    {descPreview && (
                      <p className="rnc-card-desc">{descPreview}</p>
                    )}
                  </div>

                  <div className="rnc-card-footer">
                    {cleanText(rnc.responsavel_nome) && (
                      <span className="rnc-card-meta">
                        <Eye size={11} /> {rnc.responsavel_nome}
                      </span>
                    )}
                    {cleanText(rnc.area_afetada) && (
                      <span className="rnc-card-meta">{rnc.area_afetada}</span>
                    )}
                    {dataAbertura && (
                      <span className="rnc-card-meta" style={{ marginLeft: 'auto' }}>{dataAbertura}</span>
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

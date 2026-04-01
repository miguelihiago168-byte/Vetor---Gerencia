import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRDOs, getRdoPDF } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FileText, Plus, Eye, MoreHorizontal, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useUserPreferences } from '../context/UserPreferencesContext';
import './RDOs.css';
import Modal from '../components/Modal';

function RDOs() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor, perfil } = useAuth();

  // Controle de permissões para ações nos RDOs
  const canAprovarRdo = perfil === 'Gestor Geral' || perfil === 'Gestor da Obra' || perfil === 'Gestor Local';
  const canReprovarRdo = canAprovarRdo || perfil === 'Fiscal';
  const { info, success, error: notifyError } = useNotification();
  const { alert } = useDialog();
  const [sucesso, setSucesso] = useState('');
  const [rdos, setRdos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyChecked, setCopyChecked] = useState(false);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleOutside = () => setOpenDropdown(null);
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const formatLocalDate = (dstr) => {
    if (!dstr) return 'N/A';
    const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      return dt.toLocaleDateString('pt-BR');
    }
    const dt = new Date(dstr);
    return isNaN(dt.getTime()) ? dstr : dt.toLocaleDateString('pt-BR');
  };

  const formatDateGroup = (dateStr) => {
    if (dateStr === 'sem-data') return 'Data não registrada';
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return dateStr;
    const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const statusLabel = (s) => {
    if (s === 'Em análise') return 'Em aprovação';
    if (s === 'Em preenchimento') return 'Aguardando aprovação';
    return s || 'N/A';
  };

  const getBadgeClass = (status) => {
    if (status === 'Aprovado') return 'rdo-badge rdo-badge-aprovado';
    if (status === 'Reprovado') return 'rdo-badge rdo-badge-reprovado';
    if (status === 'Em análise') return 'rdo-badge rdo-badge-analise';
    return 'rdo-badge rdo-badge-pendente';
  };

  const getRdoNumber = (rdo) =>
    rdo.numero_rdo ? String(rdo.numero_rdo) : `RDO-${String(rdo.id).padStart(3, '0')}`;

  useEffect(() => {
    carregarRDOs();
  }, [projetoId]);

  const carregarRDOs = async () => {
    try {
      setLoading(true);
      const response = await getRDOs(projetoId);
      setRdos(response.data || []);
    } catch (error) {
      setErro('Erro ao carregar RDOs: ' + (error.response?.data?.erro || error.message));
    } finally {
      setLoading(false);
    }
  };

  const aprovarRDO = async (rdoId, e) => {
    e?.stopPropagation?.();
    setOpenDropdown(null);
    try {
      const { updateStatusRDO } = await import('../services/api');
      await updateStatusRDO(rdoId, 'Aprovado');
      setRdos(prev => prev.map(r => r.id === rdoId ? { ...r, status: 'Aprovado' } : r));
      setSucesso('RDO aprovado com sucesso.');
      success('RDO aprovado com sucesso.', 4000);
    } catch (err) {
      const msg = 'Falha ao aprovar RDO: ' + (err.response?.data?.erro || err.message);
      notifyError(msg, 6000);
      await alert({ title: 'Erro', message: msg });
    }
  };

  const reprovarRDO = async (rdoId, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setOpenDropdown(null);
    try {
      const { updateStatusRDO } = await import('../services/api');
      await updateStatusRDO(rdoId, 'Reprovado');
      setRdos(prev => prev.map(r => r.id === rdoId ? { ...r, status: 'Reprovado' } : r));
      setSucesso('RDO reprovado.');
      success('RDO reprovado.', 4000);
    } catch (err) {
      const msg = 'Falha ao reprovar RDO: ' + (err.response?.data?.erro || err.message);
      notifyError(msg, 6000);
      await alert({ title: 'Erro', message: msg });
    }
  };

  const handleVoltarEdicao = async (rdoId, e) => {
    if (e) e.stopPropagation();
    setOpenDropdown(null);
    if (!isGestor) {
      await alert({ title: 'Acesso restrito', message: 'Apenas gestores podem voltar o RDO para edição.' });
      return;
    }
    try {
      const { updateStatusRDO } = await import('../services/api');
      await updateStatusRDO(rdoId, 'Em preenchimento');
      setRdos(prev => prev.map(r => r.id === rdoId ? { ...r, status: 'Em preenchimento' } : r));
      setSucesso('RDO revertido para edição.');
      success('RDO revertido para edição.', 4500);
      navigate(`/projeto/${projetoId}/rdos/${rdoId}/editar`);
    } catch (err) {
      const msg = 'Falha ao voltar para edição: ' + (err.response?.data?.erro || err.message);
      notifyError(msg, 6000);
      await alert({ title: 'Erro', message: msg });
    }
  };

  const handleDownloadPDF = async (rdoId, e) => {
    if (e) e.stopPropagation();
    try {
      const resp = await getRdoPDF(rdoId);
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RDO-${String(rdoId).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      await alert({ title: 'Erro', message: 'Falha ao gerar PDF: ' + (error.response?.data?.erro || error.message) });
    }
  };

  const { prefs, setPreference } = useUserPreferences();

  // Handler para botão Novo RDO
  const handleNovoRDO = () => {
    if (prefs?.alwaysCopyRDO) {
      navigate(`/projeto/${projetoId}/rdos/novo`, { state: { copyLast: true } });
    } else {
      setCopyChecked(Boolean(prefs?.alwaysCopyRDO));
      setShowCopyModal(true);
    }
  };

  const handleCopyModalConfirm = (copy) => {
    setShowCopyModal(false);
    setPreference('alwaysCopyRDO', Boolean(copy && copyChecked));
    navigate(`/projeto/${projetoId}/rdos/novo`, { state: { copyLast: copy } });
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

  const grupos = Object.entries(
    rdos.reduce((acc, r) => {
      const dt = r.criado_em ? new Date(r.criado_em) : null;
      const key = dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : 'sem-data';
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {})
  ).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '28px', paddingBottom: '48px' }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Relatórios Diários de Obra
            </h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0', fontWeight: 400 }}>
              {rdos.length} {rdos.length === 1 ? 'relatório' : 'relatórios'} neste projeto
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleNovoRDO}>
              <Plus size={15} />
              Novo RDO
            </button>
            {prefs?.alwaysCopyRDO && (
              <button
                className="btn btn-secondary"
                style={{ padding: '8px 12px', fontSize: 12 }}
                onClick={() => setPreference('alwaysCopyRDO', false)}
              >
                Desativar cópia automática
              </button>
            )}
          </div>

          <Modal open={showCopyModal} title="Novo RDO" onClose={() => {
            setShowCopyModal(false);
            setCopyChecked(Boolean(prefs?.alwaysCopyRDO));
          }}>
            <div style={{ marginBottom: 18 }}>
              Deseja copiar as informações do último relatório?
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
              <button className="btn btn-primary" onClick={() => handleCopyModalConfirm(true)}>Sim</button>
              <button className="btn btn-secondary" onClick={() => handleCopyModalConfirm(false)}>Não</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={copyChecked} onChange={e => setCopyChecked(e.target.checked)} />
              Sempre copiar automaticamente
            </label>
          </Modal>
        </div>

        {sucesso && <div className="alert alert-success" style={{ marginBottom: '20px' }}>{sucesso}</div>}
        {erro    && <div className="alert alert-error"   style={{ marginBottom: '20px' }}>{erro}</div>}

        {rdos.length === 0 ? (
          <div className="rdo-empty">
            <FileText size={40} style={{ color: '#cbd5e1' }} />
            <h3>Nenhum RDO encontrado</h3>
            <p>Crie o primeiro relatório diário para este projeto.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {grupos.map(([dia, lista]) => (
              <div key={dia}>

                {/* ── Grupo de data ── */}
                <div className="rdo-date-group">
                  <span className="rdo-date-group-label">{formatDateGroup(dia)}</span>
                  <span className="rdo-date-group-line" />
                </div>

                {/* ── Cards ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lista.map(rdo => {
                    const isAprovado = rdo.status === 'Aprovado';
                    const isPending  = rdo.status === 'Em preenchimento' || rdo.status === 'Em análise';

                    return (
                      <div
                        key={rdo.id}
                        className="rdo-card"
                        onClick={() => {
                          if (isAprovado) {
                            if (!isGestor) info('RDO aprovado. Somente visualização disponível.', 4500);
                            navigate(`/projeto/${projetoId}/rdos/${rdo.id}`);
                            return;
                          }
                          navigate(`/projeto/${projetoId}/rdos/${rdo.id}/editar`);
                        }}
                        title={isAprovado ? 'Ver detalhes do RDO' : 'Editar RDO'}
                      >
                        {/* Informações */}
                        <div className="rdo-card-body">
                          <div className="rdo-card-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <p className="rdo-card-title">{getRdoNumber(rdo)}</p>
                              <span className={getBadgeClass(rdo.status)}>{statusLabel(rdo.status)}</span>
                            </div>
                            <p className="rdo-card-meta">{formatLocalDate(rdo.data_relatorio)}</p>
                            {/* Pills de métricas rápidas */}
                            {(() => {
                              const total = Number(rdo.mao_obra_direta || 0) + Number(rdo.mao_obra_indireta || 0) + Number(rdo.mao_obra_terceiros || 0);
                              const horas = rdo.horas_trabalhadas;
                              if (!total && !horas) return null;
                              return (
                                <div className="rdo-meta-pills">
                                  {total > 0 && (
                                    <span className="rdo-meta-pill">
                                      <span className="rdo-meta-pill-icon">👥</span>
                                      {total} {total === 1 ? 'pessoa' : 'pessoas'}
                                    </span>
                                  )}
                                  {horas != null && (
                                    <span className="rdo-meta-pill">
                                      <span className="rdo-meta-pill-icon">⏱</span>
                                      {horas}h
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Ações — stopPropagation para não acionar o clique do card */}
                        <div className="rdo-actions" onClick={e => e.stopPropagation()}>

                          {/* PDF */}
                          <button
                            className="rdo-btn-ghost"
                            onClick={e => handleDownloadPDF(rdo.id, e)}
                            title="Baixar PDF"
                          >
                            <FileText size={13} />
                            PDF
                          </button>

                          {/* Menu (...) */}
                          <div
                            className="rdo-dropdown"
                            onMouseDown={e => e.stopPropagation()}
                          >
                            <button
                              className="rdo-btn-icon"
                              onClick={() => setOpenDropdown(prev => prev === rdo.id ? null : rdo.id)}
                              title="Mais ações"
                            >
                              <MoreHorizontal size={16} />
                            </button>

                            {openDropdown === rdo.id && (
                              <div className="rdo-dropdown-menu">

                                {/* Ver detalhes — sempre visível */}
                                <button
                                  className="rdo-dropdown-item"
                                  onClick={() => {
                                    setOpenDropdown(null);
                                    navigate(`/projeto/${projetoId}/rdos/${rdo.id}`);
                                  }}
                                >
                                  <Eye size={14} />
                                  Ver detalhes
                                </button>

                                {/* Aprovar: somente Gestor Geral / Gestor de Obra */}
                                {canAprovarRdo && isPending && (
                                  <>
                                    <div className="rdo-dropdown-divider" />
                                    <button
                                      className="rdo-dropdown-item success"
                                      onClick={e => aprovarRDO(rdo.id, e)}
                                    >
                                      <CheckCircle size={14} />
                                      Aprovar
                                    </button>
                                  </>
                                )}
                                {/* Reprovar: Gestor Geral, Gestor de Obra e Fiscal */}
                                {canReprovarRdo && isPending && (
                                  <>
                                    {!canAprovarRdo && <div className="rdo-dropdown-divider" />}
                                    <button
                                      className="rdo-dropdown-item danger"
                                      onClick={e => reprovarRDO(rdo.id, e)}
                                    >
                                      <XCircle size={14} />
                                      Reprovar
                                    </button>
                                  </>
                                )}

                                {/* Gestor: voltar para edição em RDOs aprovados */}
                                {isGestor && isAprovado && (
                                  <>
                                    <div className="rdo-dropdown-divider" />
                                    <button
                                      className="rdo-dropdown-item warning"
                                      onClick={e => handleVoltarEdicao(rdo.id, e)}
                                    >
                                      <RotateCcw size={14} />
                                      Voltar para edição
                                    </button>
                                  </>
                                )}

                              </div>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </>
  );
}

export default RDOs;

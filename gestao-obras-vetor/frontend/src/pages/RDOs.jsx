import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRDOs, addRdoComentario, updateStatusRDO } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FileText, Plus, Eye, MoreHorizontal, CheckCircle, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';
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
  const canAprovarRdo = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'].includes(perfil);
  const canReprovarRdo = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Fiscal'].includes(perfil);
  const { info, success, error: notifyError } = useNotification();
  const { alert } = useDialog();
  const [sucesso, setSucesso] = useState('');
  const [rdos, setRdos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyChecked, setCopyChecked] = useState(false);

  // Estados para modal de solicitar correção
  const [showSolicitarCorrecaoModal, setShowSolicitarCorrecaoModal] = useState(false);
  const [rdoSelecionadoCorrecao, setRdoSelecionadoCorrecao] = useState(null);
  const [textoCorrecao, setTextoCorrecao] = useState('');
  const [isEnviandoCorrecao, setIsEnviandoCorrecao] = useState(false);

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
    if (s === 'Em preenchimento') return 'Em preenchimento';
    return s || 'N/A';
  };

  const getBadgeClass = (status) => {
    if (status === 'Aprovado') return 'rdo-badge rdo-badge-aprovado';
    if (status === 'Reprovado') return 'rdo-badge rdo-badge-reprovado';
    if (status === 'Em análise') return 'rdo-badge rdo-badge-analise';
    return 'rdo-badge rdo-badge-pendente';
  };

  const getRdoNumber = (rdo) => {
    const raw = rdo.numero_rdo ?? rdo.id;
    const match = String(raw || '').match(/(\d+)$/);
    const numero = match ? Number(match[1]) : Number(raw || 0);
    return `RDO-${String(numero || rdo.id).padStart(3, '0')}`;
  };

  const normalizeStatus = (status) =>
    String(status || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

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

  const solicitarCorrecaoRDO = async () => {
    try {
      if (!textoCorrecao.trim()) {
        await alert({ title: 'Aviso', message: 'Por favor, descreva a correção solicitada.' });
        return;
      }
      
      setIsEnviandoCorrecao(true);
      
      // Adicionar comentário com a solicitação de correção
      await addRdoComentario(rdoSelecionadoCorrecao, { comentario: `[SOLICITAR CORREÇÃO] ${textoCorrecao}` });
      
      // Atualizar status do RDO para "Em preenchimento" para permitir edição
      await updateStatusRDO(rdoSelecionadoCorrecao, 'Em preenchimento');
      
      setRdos(prev => prev.map(r => r.id === rdoSelecionadoCorrecao ? { ...r, status: 'Em preenchimento' } : r));
      setTextoCorrecao('');
      setShowSolicitarCorrecaoModal(false);
      setRdoSelecionadoCorrecao(null);
      setSucesso('Correção solicitada com sucesso.');
      success('Correção solicitada com sucesso.', 4000);
    } catch (error) {
      const msg = 'Falha ao solicitar correção: ' + (error.response?.data?.erro || error.message);
      notifyError(msg, 6000);
      await alert({ title: 'Erro', message: msg });
    } finally {
      setIsEnviandoCorrecao(false);
    }
  };

  const handleDownloadPDF = async (rdoId, e) => {
    if (e) e.stopPropagation();
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const url = token
      ? `/api/rdos/${rdoId}/pdf?token=${encodeURIComponent(token)}`
      : `/api/rdos/${rdoId}/pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `RDO-${String(rdoId).padStart(3, '0')}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
      const m = r.data_relatorio ? String(r.data_relatorio).match(/^(\d{4}-\d{2}-\d{2})/) : null;
      const key = m ? m[1] : 'sem-data';
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
                    const statusNorm = normalizeStatus(rdo.status);
                    const isAprovado = statusNorm === 'aprovado';
                    const isEmAnalise = statusNorm === 'em analise';
                    const isVisualizacao = isAprovado || isEmAnalise;
                    const temCorrecaoPendente = Number(rdo.correcao_solicitada || 0) === 1;

                    return (
                      <div
                        key={rdo.id}
                        className={`rdo-card${temCorrecaoPendente ? ' rdo-card-correcao' : ''}`}
                        onClick={() => {
                          if (isVisualizacao) {
                            if (!isGestor) info('RDO em modo de visualização.', 4500);
                            navigate(`/projeto/${projetoId}/rdos/${rdo.id}`);
                            return;
                          }
                          navigate(`/projeto/${projetoId}/rdos/${rdo.id}/editar`);
                        }}
                        title={isVisualizacao ? 'Ver detalhes do RDO' : 'Editar RDO'}
                      >
                        {/* Informações */}
                        <div className="rdo-card-body">
                          <div className="rdo-card-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <p className="rdo-card-title">{getRdoNumber(rdo)}</p>
                              <span className={getBadgeClass(rdo.status)}>{statusLabel(rdo.status)}</span>
                              {temCorrecaoPendente && (
                                <span className="rdo-badge-correcao" title={rdo.correcao_motivo || 'Correção pendente'}>
                                  <AlertTriangle size={12} />
                                  CORREÇÃO PENDENTE
                                </span>
                              )}
                            </div>
                            {temCorrecaoPendente && rdo.correcao_motivo && (
                              <p className="rdo-card-warning">{rdo.correcao_motivo}</p>
                            )}
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

                                {/* Aprovar: Gestores de obra e qualidade */}
                                {canAprovarRdo && isEmAnalise && (
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
                                {canReprovarRdo && isEmAnalise && (
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

                                {/* Solicitar Correção: Gestor Geral, Gestor de Obra e Fiscal */}
                                {canReprovarRdo && isEmAnalise && (
                                  <button
                                    className="rdo-dropdown-item warning"
                                    onClick={e => {
                                      e?.stopPropagation?.();
                                      setOpenDropdown(null);
                                      setRdoSelecionadoCorrecao(rdo.id);
                                      setShowSolicitarCorrecaoModal(true);
                                    }}
                                  >
                                    <RotateCcw size={14} />
                                    Solicitar Correção
                                  </button>
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

      {/* Modal de Solicitar Correção */}
      {showSolicitarCorrecaoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)'
          }}>
            <h2 style={{ marginBottom: '16px', color: '#111827', fontSize: '20px' }}>Solicitar Correção</h2>
            <p style={{ marginBottom: '16px', color: '#6B7280', fontSize: '14px' }}>
              Descreva quais correções devem ser feitas neste RDO.
            </p>
            <textarea
              value={textoCorrecao}
              onChange={(e) => setTextoCorrecao(e.target.value)}
              placeholder="Ex: Revisar as quantidades de mão de obra registradas..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontFamily: 'inherit',
                fontSize: '14px',
                marginBottom: '16px',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowSolicitarCorrecaoModal(false);
                  setTextoCorrecao('');
                  setRdoSelecionadoCorrecao(null);
                }}
                className="btn btn-secondary"
                disabled={isEnviandoCorrecao}
              >
                Cancelar
              </button>
              <button
                onClick={solicitarCorrecaoRDO}
                className="btn btn-warning"
                disabled={isEnviandoCorrecao || !textoCorrecao.trim()}
              >
                {isEnviandoCorrecao ? 'Enviando...' : 'Solicitar Correção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RDOs;

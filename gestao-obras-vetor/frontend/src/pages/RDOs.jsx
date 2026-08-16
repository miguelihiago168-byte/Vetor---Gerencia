import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import CockpitReturnButton, { forwardCockpitNavigationState, getCockpitReturnContext } from '../components/CockpitReturnButton';
import { getRDOs, executeRdoWorkflow, getRdoConfiguracao, updateRdoConfiguracao } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FileText, Plus, Eye, MoreHorizontal, CheckCircle, XCircle, RotateCcw, AlertTriangle, Search, X, Settings } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useUserPreferences } from '../context/UserPreferencesContext';
import './RDOs.css';
import Modal from '../components/Modal';

function RDOs() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cockpitReturn = getCockpitReturnContext(location);
  const { isGestor, perfil } = useAuth();
  const { prefs, setPreference } = useUserPreferences();

  // Controle de permissões para ações nos RDOs
  const canDecidirGestor = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'].includes(perfil);
  const canDecidirFiscal = perfil === 'Fiscal';
  const canConfigurarRdo = perfil === 'Gestor Geral';
  const canConfigurarCopiaRdo = true;
  const { info, success, error: notifyError } = useNotification();
  const { alert } = useDialog();
  const [sucesso, setSucesso] = useState('');
  const [rdos, setRdos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyChecked, setCopyChecked] = useState(false);
  const [showRdoSettings, setShowRdoSettings] = useState(false);
  const [savingRdoSettings, setSavingRdoSettings] = useState(false);
  const [rdoConfig, setRdoConfig] = useState({ copiar_automaticamente: false, exige_aprovacao_fiscal: true, pode_configurar: false });
  const [filters, setFilters] = useState({
    dataInicial: '',
    dataFinal: '',
    identificador: '',
    somenteComOcorrencias: false,
    somenteImpraticaveis: false,
    status: ''
  });

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
    if (s === 'Em aprovação do gestor') return 'Aguardando gestor';
    if (s === 'Em aprovação do fiscal') return 'Aguardando fiscal';
    if (s === 'Em preenchimento') return 'Em preenchimento';
    return s || 'N/A';
  };

  const getBadgeClass = (status) => {
    if (status === 'Aprovado') return 'rdo-badge rdo-badge-aprovado';
    if (status === 'Reprovado') return 'rdo-badge rdo-badge-reprovado';
    if (status === 'Em aprovação do gestor' || status === 'Em aprovação do fiscal') return 'rdo-badge rdo-badge-analise';
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

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      dataInicial: '',
      dataFinal: '',
      identificador: '',
      somenteComOcorrencias: false,
      somenteImpraticaveis: false,
      status: ''
    });
  };

  const hasActiveFilters = Boolean(
    filters.dataInicial || filters.dataFinal || filters.identificador.trim() ||
    filters.somenteComOcorrencias || filters.somenteImpraticaveis || filters.status
  );

  const filteredRdos = useMemo(() => {
    const identifier = filters.identificador.trim().replace(/^rdo\s*-?\s*/i, '');
    const normalizedIdentifier = identifier.replace(/^0+(?=\d)/, '');
    const isNumericIdentifier = /^\d+$/.test(normalizedIdentifier);

    return rdos.filter((rdo) => {
      const date = String(rdo.data_relatorio || '').slice(0, 10);
      if (filters.dataInicial && (!date || date < filters.dataInicial)) return false;
      if (filters.dataFinal && (!date || date > filters.dataFinal)) return false;

      if (identifier) {
        if (!isNumericIdentifier) return false;
        const matchesIdentifier = [rdo.id, rdo.numero_rdo]
          .filter((value) => value !== null && typeof value !== 'undefined')
          .some((value) => String(Number(value)) === normalizedIdentifier);
        if (!matchesIdentifier) return false;
      }

      if (filters.somenteComOcorrencias && Number(rdo.ocorrencias_count || 0) === 0) return false;
      if (filters.somenteImpraticaveis && !(rdo.tem_impraticabilidade === true || Number(rdo.tem_impraticabilidade) === 1)) return false;
      if (filters.status && rdo.status !== filters.status) return false;
      return true;
    });
  }, [rdos, filters]);

  useEffect(() => {
    const carregarPagina = async () => {
      await carregarConfiguracaoRdo();
      await carregarRDOs();
    };
    carregarPagina();
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

  const carregarConfiguracaoRdo = async () => {
    try {
      const response = await getRdoConfiguracao(projetoId);
      setRdoConfig((current) => ({ ...current, ...response.data, copiar_automaticamente: Boolean(prefs?.alwaysCopyRDO) }));
    } catch (_) {}
  };

  const salvarConfiguracaoRdo = async () => {
    try {
      setSavingRdoSettings(true);
      setPreference('alwaysCopyRDO', Boolean(rdoConfig.copiar_automaticamente));
      if (canConfigurarRdo) {
        const response = await updateRdoConfiguracao(projetoId, { exige_aprovacao_fiscal: rdoConfig.exige_aprovacao_fiscal });
        setRdoConfig((current) => ({ ...current, ...response.data, copiar_automaticamente: current.copiar_automaticamente }));
        await carregarRDOs();
      }
      setShowRdoSettings(false);
      success('Configurações de RDO atualizadas.', 4000);
    } catch (err) {
      notifyError(err.response?.data?.erro || 'Não foi possível salvar as configurações de RDO.', 6000);
    } finally { setSavingRdoSettings(false); }
  };

  const aprovarRDO = async (rdoId, acao, e) => {
    e?.stopPropagation?.();
    setOpenDropdown(null);
    try {
      const resp = await executeRdoWorkflow(rdoId, acao);
      setRdos(prev => prev.map(r => r.id === rdoId ? { ...r, status: resp.data.status, correcao_solicitada: 0 } : r));
      const mensagem = resp.data?.mensagem || 'RDO aprovado com sucesso.';
      setSucesso(mensagem);
      success(mensagem, 4000);
    } catch (err) {
      const msg = 'Falha ao aprovar RDO: ' + (err.response?.data?.erro || err.message);
      notifyError(msg, 6000);
      await alert({ title: 'Erro', message: msg });
    }
  };

  const devolverRDO = async (rdoId, acao, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setOpenDropdown(null);
    const motivo = window.prompt(acao === 'REPROVAR' ? 'Informe o motivo da reprovação:' : 'Informe as correções necessárias:');
    if (!motivo?.trim()) return;
    try {
      const resp = await executeRdoWorkflow(rdoId, acao, motivo.trim());
      setRdos(prev => prev.map(r => r.id === rdoId ? {
        ...r,
        status: resp.data?.status || 'Em preenchimento',
        correcao_solicitada: resp.data?.correcao_solicitada ?? 1,
        correcao_motivo: resp.data?.correcao_motivo || motivo.trim()
      } : r));
      setSucesso(resp.data?.mensagem || 'RDO devolvido para correção.');
      success(resp.data?.mensagem || 'RDO devolvido para correção.', 4000);
    } catch (err) {
      const msg = 'Falha ao devolver RDO: ' + (err.response?.data?.erro || err.message);
      notifyError(msg, 6000);
      await alert({ title: 'Erro', message: msg });
    }
  };

  const solicitarCorrecaoRDO = (rdoId, e) => devolverRDO(rdoId, 'SOLICITAR_CORRECAO', e);

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
    filteredRdos.reduce((acc, r) => {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {cockpitReturn && <CockpitReturnButton fallbackTo={`/projeto/${projetoId}`} fallbackLabel="Voltar ao Cockpit" />}
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                Relatórios Diários de Obra
              </h1>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0', fontWeight: 400 }}>
                {filteredRdos.length} {filteredRdos.length === 1 ? 'relatório' : 'relatórios'}
                {hasActiveFilters ? ` de ${rdos.length}` : ''} neste projeto
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            {canConfigurarCopiaRdo && <button className="btn btn-secondary" onClick={() => setShowRdoSettings(true)} title="Configurações de RDO" aria-label="Configurações de RDO"><Settings size={18} /></button>}
            <button className="btn btn-primary" onClick={handleNovoRDO}>
              <Plus size={15} />
              Novo RDO
            </button>
            {false && (
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
            setCopyChecked(false);
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
          <Modal open={showRdoSettings} title="Configurações dos RDOs" onClose={() => setShowRdoSettings(false)}>
            <div style={{ display: 'grid', gap: 16 }}>
              <label style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={rdoConfig.copiar_automaticamente} onChange={e => setRdoConfig(c => ({ ...c, copiar_automaticamente: e.target.checked }))} /><span><strong>Copiar último RDO automaticamente</strong><br /><small>Ao criar, traz as informações do último relatório.</small></span></label>
              {canConfigurarRdo && <label style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={rdoConfig.exige_aprovacao_fiscal} onChange={e => setRdoConfig(c => ({ ...c, exige_aprovacao_fiscal: e.target.checked }))} /><span><strong>Exigir aprovação da fiscalização</strong><br /><small>Exclusivo do Gestor Geral. Desative para finalizar o RDO na aprovação do gestor.</small></span></label>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-secondary" onClick={() => setShowRdoSettings(false)}>Cancelar</button><button className="btn btn-primary" disabled={savingRdoSettings} onClick={salvarConfiguracaoRdo}>{savingRdoSettings ? 'Salvando...' : 'Salvar configurações'}</button></div>
            </div>
          </Modal>
        </div>

        {sucesso && <div className="alert alert-success" style={{ marginBottom: '20px' }}>{sucesso}</div>}
        {erro    && <div className="alert alert-error"   style={{ marginBottom: '20px' }}>{erro}</div>}

        {rdos.length > 0 && (
          <section className="rdo-filters" aria-label="Filtros de RDOs">
            <div className="rdo-filter-field rdo-filter-period">
              <span className="rdo-filter-label">Período</span>
              <div className="rdo-filter-date-range">
                <input
                  type="date"
                  value={filters.dataInicial}
                  onChange={(event) => updateFilter('dataInicial', event.target.value)}
                  aria-label="Data inicial"
                />
                <span>até</span>
                <input
                  type="date"
                  value={filters.dataFinal}
                  min={filters.dataInicial || undefined}
                  onChange={(event) => updateFilter('dataFinal', event.target.value)}
                  aria-label="Data final"
                />
              </div>
            </div>

            <label className="rdo-filter-field rdo-filter-identifier">
              <span className="rdo-filter-label">ID ou nº do RDO</span>
              <span className="rdo-filter-input-wrap">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  inputMode="numeric"
                  placeholder="Ex.: RDO-001"
                  value={filters.identificador}
                  onChange={(event) => updateFilter('identificador', event.target.value)}
                />
              </span>
            </label>

            <label className="rdo-filter-field">
              <span className="rdo-filter-label">Status</span>
              <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">Todos</option>
                <option value="Em preenchimento">Em preenchimento</option>
                <option value="Em aprovação do gestor">Em aprovação do gestor</option>
                <option value="Em aprovação do fiscal">Em aprovação do fiscal</option>
                <option value="Aprovado">Aprovado</option>
                <option value="Reprovado">Reprovado</option>
              </select>
            </label>

            <label className="rdo-filter-toggle">
              <input
                type="checkbox"
                checked={filters.somenteComOcorrencias}
                onChange={(event) => updateFilter('somenteComOcorrencias', event.target.checked)}
              />
              Com ocorrências
            </label>

            <label className="rdo-filter-toggle">
              <input
                type="checkbox"
                checked={filters.somenteImpraticaveis}
                onChange={(event) => updateFilter('somenteImpraticaveis', event.target.checked)}
              />
              Condição impraticável
            </label>

            {hasActiveFilters && (
              <button type="button" className="rdo-clear-filters" onClick={clearFilters}>
                <X size={14} />
                Limpar filtros
              </button>
            )}
          </section>
        )}

        {rdos.length === 0 ? (
          <div className="rdo-empty">
            <FileText size={40} style={{ color: '#cbd5e1' }} />
            <h3>Nenhum RDO encontrado</h3>
            <p>Crie o primeiro relatório diário para este projeto.</p>
          </div>
        ) : filteredRdos.length === 0 ? (
          <div className="rdo-empty">
            <FileText size={40} style={{ color: '#cbd5e1' }} />
            <h3>Nenhum RDO corresponde aos filtros</h3>
            <p>Revise os filtros aplicados ou limpe-os para ver todos os relatórios.</p>
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
                    const isEmAprovacaoGestor = statusNorm === 'em aprovacao do gestor';
                    const isEmAprovacaoFiscal = statusNorm === 'em aprovacao do fiscal';
                    const isVisualizacao = isAprovado || isEmAprovacaoGestor || isEmAprovacaoFiscal;
                    const temCorrecaoPendente = Number(rdo.correcao_solicitada || 0) === 1;

                    return (
                      <div
                        key={rdo.id}
                        className={`rdo-card${temCorrecaoPendente ? ' rdo-card-correcao' : ''}`}
                        onClick={() => {
                          if (isVisualizacao) {
                            if (!isGestor) info('RDO em modo de visualização.', 4500);
                            navigate(`/projeto/${projetoId}/rdos/${rdo.id}`, { state: forwardCockpitNavigationState(location) });
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
                                    navigate(`/projeto/${projetoId}/rdos/${rdo.id}`, { state: forwardCockpitNavigationState(location) });
                                  }}
                                >
                                  <Eye size={14} />
                                  Ver detalhes
                                </button>

                                {canDecidirGestor && isEmAprovacaoGestor && (
                                  <>
                                    <div className="rdo-dropdown-divider" />
                                    <button
                                      className="rdo-dropdown-item success"
                                      onClick={e => aprovarRDO(rdo.id, 'APROVAR_GESTOR', e)}
                                    >
                                      <CheckCircle size={14} />
                                      Aprovar como gestor
                                    </button>
                                  </>
                                )}
                                {canDecidirFiscal && isEmAprovacaoFiscal && (
                                  <>
                                    <div className="rdo-dropdown-divider" />
                                    <button
                                      className="rdo-dropdown-item danger"
                                      onClick={e => devolverRDO(rdo.id, 'REPROVAR', e)}
                                    >
                                      <XCircle size={14} />
                                      Reprovar
                                    </button>
                                  </>
                                )}

                                {(canDecidirGestor && isEmAprovacaoGestor) || (canDecidirFiscal && isEmAprovacaoFiscal) ? (
                                  <button
                                    className="rdo-dropdown-item warning"
                                    onClick={e => solicitarCorrecaoRDO(rdo.id, e)}
                                  >
                                    <RotateCcw size={14} />
                                    Solicitar Correção
                                  </button>
                                ) : null}

                                {canDecidirGestor && isEmAprovacaoGestor && (
                                  <button className="rdo-dropdown-item danger" onClick={e => devolverRDO(rdo.id, 'REPROVAR', e)}>
                                    <XCircle size={14} />
                                    Reprovar
                                  </button>
                                )}

                                {canDecidirFiscal && isEmAprovacaoFiscal && (
                                  <button className="rdo-dropdown-item success" onClick={e => aprovarRDO(rdo.id, 'APROVAR_FISCAL', e)}>
                                    <CheckCircle size={14} />
                                    Aprovar como fiscal
                                  </button>
                                )}

                                {/* Gestor: voltar para edição em RDOs aprovados */}

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

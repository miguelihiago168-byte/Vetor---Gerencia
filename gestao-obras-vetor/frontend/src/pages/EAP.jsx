import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { 
  getAtividadesEAP, 
  previewRecalculoEapProjeto,
  recalcularEapProjeto, 
  deleteAtividade,
  baixarModeloEAP,
  previewImportacaoEAP,
  confirmarImportacaoEAP
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { Activity, Plus, Eye, ChevronRight, ChevronDown, Trash2, ArrowLeft, Download, Upload, X, AlertTriangle, CheckCircle2, MoreHorizontal } from 'lucide-react';
import './EAP.css';

function EAP({ hideNavbar = false }) {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const { confirm, alert } = useDialog();
  const { success, error } = useNotification();
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [eapActionsOpen, setEapActionsOpen] = useState(false);
  const [recalculoModalOpen, setRecalculoModalOpen] = useState(false);
  const [recalculoPreview, setRecalculoPreview] = useState(null);
  const [recalculoResumo, setRecalculoResumo] = useState(null);
  const [recalculoLoading, setRecalculoLoading] = useState(false);

  useEffect(() => {
    carregarAtividades();
    if (isGestor) carregarResumoRecalculo();
  }, [projetoId, isGestor]);

  const showAffectedRdosAlert = async (payload) => {
    const total = Number(payload?.affectedRDOs || 0);
    if (!total) return false;
    const rdos = Array.isArray(payload?.rdos) ? payload.rdos : [];
    const nomes = rdos.map((r) => r.numero_rdo || `RDO-${String(r.id).padStart(3, '0')}`).join(', ');
    await alert({
      title: 'RDOs precisam de revisão',
      message: `${total} RDO${total === 1 ? '' : 's'} foram afetados pelo recálculo e precisam de correção.${nomes ? `\n\n${nomes}` : ''}`,
      confirmText: 'Entendi'
    });
    return true;
  };

  const carregarAtividades = async () => {
    try {
      setLoading(true);
      console.log('Carregando EAP para projeto:', projetoId);
      const response = await getAtividadesEAP(projetoId);
      console.log('EAP carregada:', response.data);
      setAtividades(response.data || []);
    } catch (err) {
      console.error('Erro ao carregar EAP:', err);
      error('Erro ao carregar EAP: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const formatarDataBr = (valor) => {
    if (!valor) return '-';
    const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return valor;
  };

  const handleExcluirAtividade = async (atividade) => {
    const ok = await confirm({
      title: 'Excluir atividade',
      message: `Deseja excluir a atividade ${atividade.codigo_eap} - ${atividade.descricao}?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await deleteAtividade(atividade.id);
      success('Atividade excluída com sucesso.', 5000);
      await carregarAtividades();
    } catch (err) {
      error('Erro ao excluir atividade: ' + (err.response?.data?.erro || err.message), 7000);
    }
  };

  const handleBaixarModelo = async () => {
    try {
      const resp = await baixarModeloEAP();
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'modelo-eap-vetor.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      error('Erro ao baixar modelo Excel: ' + (err.response?.data?.erro || err.message), 7000);
    }
  };

  const resetImportModal = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportLoading(false);
  };

  const handleCloseImportModal = () => {
    setImportModalOpen(false);
    resetImportModal();
  };

  const handlePreviewImportacao = async () => {
    if (!importFile) {
      error('Selecione uma planilha Excel para validar.', 5000);
      return;
    }

    const formData = new FormData();
    formData.append('arquivo', importFile);
    try {
      setImportLoading(true);
      const resp = await previewImportacaoEAP(projetoId, formData);
      setImportPreview(resp.data);
      if (resp.data?.valido) {
        success('Planilha validada. Revise o preview antes de confirmar.', 5000);
      } else {
        error('A planilha possui erros. Corrija o arquivo e envie novamente.', 7000);
      }
    } catch (err) {
      setImportPreview(null);
      error('Erro ao validar planilha: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmarImportacao = async () => {
    if (!importPreview?.valido || !Array.isArray(importPreview?.linhas)) return;
    const ok = await confirm({
      title: 'Confirmar importacao da EAP',
      message: 'A EAP atual sera substituida se nao houver RDO vinculado a ela. Deseja confirmar a importacao?',
      confirmText: 'Importar EAP',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      setImportLoading(true);
      const resp = await confirmarImportacaoEAP(projetoId, importPreview.linhas);
      success(resp.data?.mensagem || 'EAP importada com sucesso.', 6000);
      handleCloseImportModal();
      await carregarAtividades();
    } catch (err) {
      error('Erro ao importar EAP: ' + (err.response?.data?.erro || err.message), 9000);
    } finally {
      setImportLoading(false);
    }
  };

  const handleRecalcularEap = async () => {
    setEapActionsOpen(false);
    try {
      setRecalculoModalOpen(true);
      setRecalculoPreview(null);
      setRecalculoLoading(true);
      const resp = await previewRecalculoEapProjeto(projetoId);
      setRecalculoPreview(resp.data || { atividades: [] });
      setRecalculoResumo(resp.data || { atividades: [] });
    } catch (err) {
      setRecalculoModalOpen(false);
      error('Erro ao preparar recálculo da EAP: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setRecalculoLoading(false);
    }
  };

  const carregarResumoRecalculo = async () => {
    try {
      const resp = await previewRecalculoEapProjeto(projetoId);
      setRecalculoResumo(resp.data || { atividades: [] });
    } catch (err) {
      setRecalculoResumo(null);
    }
  };

  const handleConfirmarRecalculoEap = async () => {
    try {
      setRecalculoLoading(true);
      const resp = await recalcularEapProjeto(projetoId);
      const mostrouAfetados = await showAffectedRdosAlert(resp.data);
      success(
        mostrouAfetados
          ? `${resp.data?.affectedRDOs || 0} RDO(s) enviados para correção.`
          : (resp.data?.mensagem || 'EAP recalculada.'),
        5000
      );
      setRecalculoModalOpen(false);
      setRecalculoPreview(null);
      setRecalculoResumo({ total_atividades_afetadas: 0, atividades: [] });
      carregarAtividades();
    } catch (err) {
      error('Erro ao recalcular EAP: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setRecalculoLoading(false);
    }
  };

  const buildHierarchy = (atividades) => {
    const byId = {};
    const roots = [];

    // Indexar todas as atividades por ID
    atividades.forEach(atividade => {
      byId[atividade.id] = { ...atividade, children: [] };
    });

    // Construir hierarquia
    atividades.forEach(atividade => {
      if (atividade.pai_id) {
        if (byId[atividade.pai_id]) {
          byId[atividade.pai_id].children.push(byId[atividade.id]);
        }
      } else {
        roots.push(byId[atividade.id]);
      }
    });

    // Ordenar raízes por código EAP (numérico)
    roots.sort((a, b) => {
      return String(a.codigo_eap || '').localeCompare(String(b.codigo_eap || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

    // Ordenar filhos recursivamente por código EAP (numérico)
    const ordenarFilhos = (atividade) => {
      if (atividade.children && atividade.children.length > 0) {
        atividade.children.sort((a, b) => {
          return String(a.codigo_eap || '').localeCompare(String(b.codigo_eap || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
        });
        atividade.children.forEach(ordenarFilhos);
      }
    };

    roots.forEach(ordenarFilhos);

    return roots;
  };

  const renderAtividade = (atividade, level = 0) => {
    const hasChildren = atividade.children && atividade.children.length > 0;
    const isExpanded = expandedItems.has(atividade.id);
    const podeAdicionarFilha = true;
    const tituloAtividade = `${atividade.codigo_eap} ${atividade.nome || atividade.descricao || ''}`.trim();
    const descricaoExtra = (atividade.descricao && atividade.nome && atividade.descricao !== atividade.nome)
      ? atividade.descricao
      : '';

    return (
      <div key={atividade.id}>
        <div 
          className="card" 
          style={{ 
            padding: '15px', 
            marginBottom: '8px',
            marginLeft: `${level * 20}px`,
            borderLeft: `4px solid ${getStatusColor(atividade.status)}`
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              {hasChildren && (
                <button
                  onClick={() => toggleExpanded(atividade.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              )}
              {!hasChildren && <div style={{ width: '20px' }}></div>}
              
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <strong>{tituloAtividade}</strong>
                  {descricaoExtra && (
                    <span style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
                      {descricaoExtra}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px 15px', fontSize: '13px', color: 'var(--gray-600)', flexWrap: 'wrap' }}>
                  {/* Para atividades mãe, não exibir previsto */}
                  {!hasChildren && (
                    <span>Previsto: {atividade.quantidade_total || 0} {atividade.unidade_medida || ''}</span>
                  )}
                  <span>Peso: {atividade.peso_percentual_projeto || atividade.percentual_previsto || 0}%</span>
                  <span>
                    Planejado: <strong>{formatarDataBr(atividade.data_inicio_planejada)}</strong> até <strong>{formatarDataBr(atividade.data_fim_planejada)}</strong>
                  </span>
                  <span>Executado: {atividade.percentual_executado || 0}%</span>
                  <span>Status: {atividade.status}</span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/projeto/${projetoId}/eap/${atividade.id}`)}
                title="Editar"
              >
                <Eye size={16} />
              </button>
              {podeAdicionarFilha && (
                <button
                  className="btn btn-outline"
                  onClick={() => navigate(`/projeto/${projetoId}/eap/novo?pai=${atividade.id}`)}
                  title="Adicionar filha"
                >
                  +
                </button>
              )}
              <button
                className="btn btn-danger"
                onClick={() => handleExcluirAtividade(atividade)}
                title="Excluir atividade"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          
          {/* Barra de progresso */}
          <div style={{ marginTop: '10px' }}>
            <div className="progress-bar" style={{ height: '6px' }}>
              <div 
                className="progress-fill"
                style={{ 
                  width: `${atividade.percentual_executado || 0}%`,
                  backgroundColor: getStatusColor(atividade.status)
                }}
              ></div>
            </div>
          </div>
        </div>
        
        {/* Renderizar filhos se expandido */}
        {hasChildren && isExpanded && (
          <div>
            {atividade.children.map(child => renderAtividade(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Concluída': return '#4CAF50';
      case 'Em andamento': return '#2196F3';
      case 'Não iniciada': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  const renderImportModal = () => {
    if (!importModalOpen) return null;
    const resumo = importPreview?.resumo || {};
    const erros = importPreview?.erros || [];
    const linhas = importPreview?.linhas || [];

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        <div className="card" style={{ width: 'min(1040px, 100%)', maxHeight: '90vh', overflow: 'hidden', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--gray-200)' }}>
            <div>
              <h2 style={{ margin: 0 }}>Importar EAP por Excel</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--gray-600)' }}>Valide a planilha antes de salvar a estrutura no projeto.</p>
            </div>
            <button className="btn btn-secondary" onClick={handleCloseImportModal} title="Fechar">
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '22px', overflow: 'auto', maxHeight: 'calc(90vh - 88px)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) auto', gap: '12px', alignItems: 'end', marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Arquivo Excel</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(event) => {
                    setImportFile(event.target.files?.[0] || null);
                    setImportPreview(null);
                  }}
                  style={{ width: '100%' }}
                />
              </div>
              <button className="btn btn-primary" onClick={handlePreviewImportacao} disabled={importLoading || !importFile}>
                <Upload size={16} />
                {importLoading ? 'Validando...' : 'Validar Planilha'}
              </button>
            </div>

            {importPreview && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                  {[
                    ['Linhas', resumo.total_linhas || 0],
                    ['Raizes', resumo.atividades_raiz || 0],
                    ['Filhas', resumo.atividades_filhas || 0],
                    ['Predecessoras', resumo.predecessoras || 0],
                    ['Erros', resumo.erros || 0]
                  ].map(([label, value]) => (
                    <div key={label} style={{ border: '1px solid var(--gray-200)', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>{label}</div>
                      <strong style={{ fontSize: '22px' }}>{value}</strong>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '8px', background: importPreview.valido ? '#ecfdf5' : '#fef2f2', color: importPreview.valido ? '#065f46' : '#991b1b', marginBottom: '16px' }}>
                  {importPreview.valido ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <strong>{importPreview.valido ? 'Planilha valida. Confira o preview antes de confirmar.' : 'Planilha com erros. Nada foi salvo.'}</strong>
                </div>

                {erros.length > 0 && (
                  <div style={{ marginBottom: '18px' }}>
                    <h3 style={{ marginBottom: '8px' }}>Erros encontrados</h3>
                    <div style={{ border: '1px solid #fecaca', borderRadius: '8px', overflow: 'hidden' }}>
                      {erros.slice(0, 20).map((erroItem, index) => (
                        <div key={`${erroItem.linha}-${erroItem.campo}-${index}`} style={{ padding: '10px 12px', borderBottom: index < erros.length - 1 ? '1px solid #fee2e2' : 'none' }}>
                          <strong>Linha {erroItem.linha}</strong> - {erroItem.campo}: {erroItem.mensagem}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {linhas.length > 0 && (
                  <div>
                    <h3 style={{ marginBottom: '8px' }}>Preview da EAP</h3>
                    <div style={{ overflowX: 'auto', border: '1px solid var(--gray-200)', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
                        <thead>
                          <tr style={{ background: 'var(--gray-50)' }}>
                            {['Codigo', 'Nome', 'Pai', 'Nivel', 'Qtd.', 'Un.', 'Inicio', 'Fim', 'Peso', 'Predecessora'].map((header) => (
                              <th key={header} style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid var(--gray-200)' }}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.slice(0, 30).map((linha) => (
                            <tr key={`${linha.linha}-${linha.codigo_eap}`}>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.codigo_eap}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.nome}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.pai_codigo || '-'}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.nivel}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.quantidade_total}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.unidade_medida}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{formatarDataBr(linha.data_inicio_planejada)}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{formatarDataBr(linha.data_fim_planejada)}</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.peso_percentual_projeto}%</td>
                              <td style={{ padding: '9px', borderBottom: '1px solid var(--gray-100)' }}>{linha.predecessora_codigo || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {linhas.length > 30 && <p style={{ color: 'var(--gray-600)', marginTop: '8px' }}>Mostrando 30 de {linhas.length} atividades.</p>}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button className="btn btn-secondary" onClick={handleCloseImportModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirmarImportacao} disabled={importLoading || !importPreview?.valido}>
                Confirmar Importacao
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRecalculoModal = () => {
    if (!recalculoModalOpen) return null;
    const atividadesPreview = recalculoPreview?.atividades || [];
    const totalAfetadas = Number(recalculoPreview?.total_atividades_afetadas || atividadesPreview.length || 0);
    const totalAtividades = Number(recalculoPreview?.total_atividades || 0);

    return (
      <div className="eap-modal-backdrop">
        <div className="card eap-recalc-modal">
          <div className="eap-recalc-modal-header">
            <div>
              <h2>Recalcular EAP</h2>
              <p>Confira quais atividades terão redução de avanço antes de confirmar.</p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (recalculoLoading) return;
                setRecalculoModalOpen(false);
                setRecalculoPreview(null);
              }}
              title="Fechar"
              disabled={recalculoLoading}
            >
              <X size={16} />
            </button>
          </div>

          <div className="eap-recalc-modal-body">
            {recalculoLoading && !recalculoPreview ? (
              <div className="eap-recalc-loading">
                <div className="spinner"></div>
                <span>Calculando atividades impactadas...</span>
              </div>
            ) : (
              <>
                <div className={`eap-recalc-alert${totalAfetadas > 0 ? ' warning' : ' neutral'}`}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>
                      {totalAfetadas > 0
                        ? `${totalAfetadas} atividade${totalAfetadas === 1 ? '' : 's'} com regressão pendente`
                        : 'Nenhuma regressão de avanço encontrada'}
                    </strong>
                    <p>
                      {totalAfetadas > 0
                        ? `Foram analisadas ${totalAtividades || totalAfetadas} atividades da EAP.`
                        : 'Atividades concluídas ou com avanço maior não entram neste alerta.'}
                    </p>
                  </div>
                </div>

                {atividadesPreview.length > 0 && (
                  <div className="eap-recalc-table-wrap">
                    <table className="eap-recalc-table">
                      <thead>
                        <tr>
                          <th>Atividade</th>
                          <th>Atual</th>
                          <th>Novo</th>
                          <th>Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {atividadesPreview.map((atividade) => (
                          <tr key={atividade.id}>
                            <td>
                              <strong>{atividade.codigo_eap || atividade.id_atividade || `#${atividade.id}`}</strong>
                              <span>{atividade.nome || atividade.descricao || 'Sem nome'}</span>
                            </td>
                            <td>{Number(atividade.percentual_atual || 0).toFixed(2)}%</td>
                            <td>{Number(atividade.percentual_recalculado || 0).toFixed(2)}%</td>
                            <td className={Number(atividade.diferenca || 0) >= 0 ? 'positive' : 'negative'}>
                              {Number(atividade.diferenca || 0) > 0 ? '+' : ''}
                              {Number(atividade.diferenca || 0).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="eap-recalc-modal-footer">
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (recalculoLoading) return;
                setRecalculoModalOpen(false);
                setRecalculoPreview(null);
              }}
              disabled={recalculoLoading}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleConfirmarRecalculoEap} disabled={recalculoLoading || !recalculoPreview || totalAfetadas === 0}>
              {recalculoLoading ? 'Recalculando...' : (totalAfetadas > 0 ? 'Confirmar regressões' : 'Sem regressões')}
            </button>
          </div>
        </div>
      </div>
    );
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

  const hierarchy = buildHierarchy(atividades);
  const totalRecalculoPendente = Number(recalculoResumo?.total_atividades_afetadas || 0);

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div className={`container eap-page${hideNavbar ? ' eap-page-embedded' : ''}`}>
        <div className="eap-list-header">
          <div className="eap-list-title-wrap">
            {!hideNavbar && (
              <button className="eap-toolbar-btn eap-toolbar-btn-back" onClick={() => navigate(`/projeto/${projetoId}/planejamento`)}>
                <ArrowLeft size={16} />
                <span>Planejamento</span>
              </button>
            )}
            <h1 className="eap-list-title">EAP do Projeto</h1>
          </div>
          <div className="eap-toolbar" aria-label="Acoes da EAP">
            <button className="eap-toolbar-btn eap-toolbar-btn-primary" onClick={() => navigate(`/projeto/${projetoId}/eap/novo`)}>
              <Plus size={16} />
              <span>Nova Atividade</span>
            </button>
            <div className="eap-actions-menu">
              <button
                className="eap-toolbar-btn eap-toolbar-btn-menu"
                onClick={() => setEapActionsOpen((open) => !open)}
                aria-expanded={eapActionsOpen}
                aria-haspopup="menu"
              >
                <MoreHorizontal size={16} />
                <span>Mais ações</span>
              </button>
              {eapActionsOpen && (
                <div className="eap-actions-dropdown" role="menu">
                  <button
                    className="eap-actions-item"
                    role="menuitem"
                    onClick={() => {
                      setEapActionsOpen(false);
                      handleBaixarModelo();
                    }}
                  >
                    <Download size={15} />
                    <span>Baixar modelo Excel</span>
                  </button>
                  {isGestor && (
                    <button
                      className="eap-actions-item"
                      role="menuitem"
                      onClick={() => {
                        setEapActionsOpen(false);
                        setImportModalOpen(true);
                      }}
                    >
                      <Upload size={15} />
                      <span>Importar Excel</span>
                    </button>
                  )}
                  {isGestor && (
                    <button className="eap-actions-item" role="menuitem" onClick={handleRecalcularEap}>
                      <Activity size={15} />
                      <span>Recalcular EAP</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {isGestor && totalRecalculoPendente > 0 && (
          <div className="eap-recalc-pending">
            <AlertTriangle size={18} />
            <div>
              <strong>{totalRecalculoPendente} atividade{totalRecalculoPendente === 1 ? '' : 's'} com regressão pendente</strong>
              <p>Alterações em RDOs reduziram o avanço previsto na EAP. Use “Mais ações” para revisar e confirmar o recálculo.</p>
            </div>
          </div>
        )}

        {hierarchy.length === 0 ? (
          <div className="card text-center" style={{ padding: '60px' }}>
            <Activity size={48} style={{ color: 'var(--gray-400)', marginBottom: '16px' }} />
            <h3 style={{ color: 'var(--gray-500)' }}>Nenhuma atividade encontrada</h3>
            <p style={{ color: 'var(--gray-400)', marginTop: '8px' }}>
              Crie a primeira atividade para este projeto.
            </p>
          </div>
        ) : (
          <div>
            {hierarchy.map(atividade => renderAtividade(atividade))}
          </div>
        )}
      </div>
      {renderImportModal()}
      {renderRecalculoModal()}
    </>
  );
}

export default EAP;

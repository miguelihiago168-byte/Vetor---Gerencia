import React, { useState } from 'react';
import { X, AlertCircle, ChevronDown, CheckCircle } from 'lucide-react';
import './ConfirmDependencyModal.css';

/**
 * Componente ConfirmDependencyModal
 * Modal que exibe preview das alterações no cronograma após confirmação de dependências
 * Permite que o usuário revise antes de aplicar as mudanças
 */
const ConfirmDependencyModal = ({
  isOpen = false,
  onClose = () => {},
  onConfirm = () => {},
  preview = null,
  carregando = false
}) => {
  const [expandidos, setExpandidos] = useState(new Set());

  if (!isOpen) return null;

  const toggleExpandido = (idx) => {
    const novaSet = new Set(expandidos);
    if (novaSet.has(idx)) {
      novaSet.delete(idx);
    } else {
      novaSet.add(idx);
    }
    setExpandidos(novaSet);
  };

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="confirm-header">
          <h2>Confirmação de Cronograma</h2>
          <p>Revise as alterações antes de aplicar</p>
          <button className="confirm-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="confirm-content">
          {carregando ? (
            <div className="confirm-carregando">
              <div className="spinner"></div>
              <p>Calculando cronograma...</p>
            </div>
          ) : preview ? (
            <>
              {/* Resumo */}
              <div className="confirm-resumo">
                <div className="resumo-card">
                  <span className="resumo-label">Atividades Afetadas</span>
                  <span className="resumo-valor">{preview.alteracoes?.length || 0}</span>
                </div>
                <div className="resumo-card" style={{ borderColor: '#ff9800' }}>
                  <span className="resumo-label">Caminho Crítico</span>
                  <span className="resumo-valor">{preview.caminoCritico?.length || 0}</span>
                </div>
                <div className="resumo-card" style={{ borderColor: '#4caf50' }}>
                  <span className="resumo-label">Conclusão Estimada</span>
                  <span className="resumo-valor">
                    {preview.dataConclusao
                      ? new Date(preview.dataConclusao).toLocaleDateString('pt-BR')
                      : '-'}
                  </span>
                </div>
              </div>

              {/* Aviso */}
              {preview.alteracoes && preview.alteracoes.length > 0 && (
                <div className="confirm-aviso">
                  <AlertCircle size={18} />
                  <p>Esta operação modificará as datas das atividades selecionadas abaixo.</p>
                </div>
              )}

              {/* Detalhes das Alterações */}
              {preview.alteracoes && preview.alteracoes.length > 0 ? (
                <div className="confirm-alteracoes">
                  <h3>Alterações de Cronograma</h3>
                  <div className="alteracoes-lista">
                    {preview.alteracoes.map((alteracao, idx) => {
                      const isExpanded = expandidos.has(idx);
                      const diasDeslocamento = alteracao.dias_deslocamento || 0;

                      return (
                        <div key={idx} className="alteracao-card">
                          <div
                            className="alteracao-header"
                            onClick={() => toggleExpandido(idx)}
                          >
                            <span className="alteracao-nome">{alteracao.nome}</span>
                            <div className="alteracao-mudanca">
                              {diasDeslocamento > 0 && (
                                <span className="badge-deslocamento">
                                  +{diasDeslocamento} dias
                                </span>
                              )}
                              {diasDeslocamento === 0 && (
                                <span className="badge-sem-mudanca">Sem mudança</span>
                              )}
                            </div>
                            <ChevronDown
                              size={16}
                              style={{
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s'
                              }}
                            />
                          </div>

                          {isExpanded && (
                            <div className="alteracao-detalhes">
                              <div className="detalhe-item">
                                <span className="detalhe-label">Data Início</span>
                                <div className="detalhe-valores">
                                  <span className="data-anterior">
                                    {new Date(alteracao.data_inicio_original).toLocaleDateString('pt-BR')} →
                                  </span>
                                  <span className="data-nova">
                                    {new Date(alteracao.data_inicio_nova).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                              </div>
                              <div className="detalhe-item">
                                <span className="detalhe-label">Data Fim</span>
                                <div className="detalhe-valores">
                                  <span className="data-anterior">
                                    {new Date(alteracao.data_fim_original).toLocaleDateString('pt-BR')} →
                                  </span>
                                  <span className="data-nova">
                                    {new Date(alteracao.data_fim_nova).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="confirm-sem-alteracoes">
                  <CheckCircle size={32} />
                  <p>Nenhuma alteração necessária</p>
                  <small>Os cronogramas já estão alinhados</small>
                </div>
              )}
            </>
          ) : (
            <div className="confirm-vazio">
              <p>Nenhum dado análisa para exibir</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="confirm-footer">
          <button className="btn-cancelar" onClick={onClose} disabled={carregando}>
            Cancelar
          </button>
          <button
            className="btn-confirmar-final"
            onClick={onConfirm}
            disabled={carregando}
          >
            {carregando ? 'Processando...' : 'Aplicar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDependencyModal;

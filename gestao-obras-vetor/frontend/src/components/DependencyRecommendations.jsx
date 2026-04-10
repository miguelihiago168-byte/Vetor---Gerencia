import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, X, ChevronDown, Zap } from 'lucide-react';
import './DependencyRecommendations.css';

/**
 * Componente DependencyRecommendations
 * Exibe uma lista de sugestões de dependências automaticamente calculadas
 * Permite que o usuário aceite/rejeite cada sugestão
 */
const DependencyRecommendations = ({ 
  sugestoes = [], 
  carregando = false, 
  onAceitar = () => {}, 
  onRejeitar = () => {}, 
  onConfirmarTodas = () => {} 
}) => {
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [expandidas, setExpandidas] = useState(new Set());

  // Calcular estatísticas
  const totalSugestoes = sugestoes.length;
  const selecionadasCount = selecionadas.size;

  const toggleSelecionada = (id) => {
    const novaSet = new Set(selecionadas);
    if (novaSet.has(id)) {
      novaSet.delete(id);
    } else {
      novaSet.add(id);
    }
    setSelecionadas(novaSet);
  };

  const toggleExpandida = (id) => {
    const novaSet = new Set(expandidas);
    if (novaSet.has(id)) {
      novaSet.delete(id);
    } else {
      novaSet.add(id);
    }
    setExpandidas(novaSet);
  };

  const selecionarTodas = () => {
    if (selecionadasCount === totalSugestoes) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(sugestoes.map(s => s.id_origem + '_' + s.id_destino)));
    }
  };

  const handleConfirmarSelecionadas = () => {
    if (selecionadasCount > 0) {
      onConfirmarTodas(Array.from(selecionadas));
    }
  };

  const getClasseMotivo = (motivo) => {
    const motivos = motivo ? motivo.split(',').map(m => m.trim()) : [];
    const classes = [];

    motivos.forEach(m => {
      if (m === 'temporal') classes.push('motivo-temporal');
      if (m === 'mesmo_grupo') classes.push('motivo-grupo');
      if (m === 'palavras_chave') classes.push('motivo-palavras');
      if (m === 'ondas_paralelas') classes.push('motivo-ondas');
      if (m === 'duracao_similar') classes.push('motivo-duracao');
    });

    return classes;
  };

  const getDescricaoMotivo = (motivo) => {
    const motivoMap = {
      'temporal': '⏱️ Temporal',
      'mesmo_grupo': '📦 Mesmo Grupo',
      'palavras_chave': '🔑 Palavras-Chave',
      'ondas_paralelas': '🌊 Ondas Paralelas',
      'duracao_similar': '📏 Duração Similar'
    };

    const motivos = motivo ? motivo.split(',').map(m => m.trim()) : [];
    return motivos.map(m => motivoMap[m] || m).join(' + ');
  };

  return (
    <div className="dependency-recommendations">
      {/* Header */}
      <div className="dep-header">
        <div className="dep-titulo">
          <Zap size={20} className="icone-zap" />
          <div>
            <h3>Sugestões de Dependências</h3>
            <p>Sistema detectou {totalSugestoes} possível(is) precedência(s) entre atividades</p>
          </div>
        </div>
      </div>

      {/* Estado Carregando */}
      {carregando && (
        <div className="dep-carregando">
          <div className="spinner"></div>
          <p>Analisando atividades...</p>
        </div>
      )}

      {/* Nenhuma Sugestão */}
      {!carregando && totalSugestoes === 0 && (
        <div className="dep-vazio">
          <AlertCircle size={32} />
          <p>Nenhuma sugestão de dependência detectada</p>
          <small>Configure as datas das atividades para gerar sugestões automáticas</small>
        </div>
      )}

      {/* Sugestões Disponíveis */}
      {!carregando && totalSugestoes > 0 && (
        <>
          {/* Barra de Controle */}
          <div className="dep-controle">
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={selecionadasCount === totalSugestoes && totalSugestoes > 0}
                onChange={selecionarTodas}
              />
              <span>
                Selecionar {selecionadasCount === totalSugestoes ? 'nenhuma' : 'todas'} (
                {selecionadasCount}/{totalSugestoes})
              </span>
            </label>
            <button
              className="btn-confirmar"
              onClick={handleConfirmarSelecionadas}
              disabled={selecionadasCount === 0}
            >
              Confirmar {selecionadasCount > 0 ? `${selecionadasCount} selecionad${selecionadasCount === 1 ? 'a' : 'as'}` : 'nenhuma'}
            </button>
          </div>

          {/* Lista de Sugestões */}
          <div className="dep-lista">
            {sugestoes.map((sugestao, idx) => {
              const id = sugestao.id_origem + '_' + sugestao.id_destino;
              const isExpanded = expandidas.has(id);
              const isSelecionada = selecionadas.has(id);
              const motivos = getClasseMotivo(sugestao.motivos);

              return (
                <div
                  key={idx}
                  className={`dep-card ${isSelecionada ? 'selecionada' : ''}`}
                >
                  {/* Card Header */}
                  <div className="dep-card-header">
                    {/* Checkbox */}
                    <label className="checkbox-card">
                      <input
                        type="checkbox"
                        checked={isSelecionada}
                        onChange={() => toggleSelecionada(id)}
                      />
                      <span className="checkbox-mark"></span>
                    </label>

                    {/* Informação Principal */}
                    <div className="dep-info" onClick={() => toggleExpandida(id)}>
                      <div className="dep-fluxo">
                        <span className="atividade-origem">{sugestao.nome_origem}</span>
                        <span className="seta-fluxo">→</span>
                        <span className="atividade-destino">{sugestao.nome_destino}</span>
                      </div>
                      <div className="dep-score">
                        <span className={`score-badge score-${Math.round(sugestao.score)}`}>
                          Score: {sugestao.score.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Botões de Ação */}
                    <div className="dep-acoes">
                      <button
                        className="btn-expandir"
                        onClick={() => toggleExpandida(id)}
                        title={isExpanded ? 'Colapsar' : 'Expandir'}
                      >
                        <ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                      </button>
                    </div>
                  </div>

                  {/* Card Expandido */}
                  {isExpanded && (
                    <div className="dep-card-expandido">
                      {/* Motivos */}
                      <div className="dep-motivos">
                        <h4>Motivos da Sugestão:</h4>
                        <div className="motivos-tags">
                          {motivos.length > 0 ? (
                            motivos.map((classe, i) => (
                              <span key={i} className={`tag-motivo ${classe}`}>
                                {getDescricaoMotivo(sugestao.motivos).split(' + ')[i]}
                              </span>
                            ))
                          ) : (
                            <span className="tag-motivo">Análise automática</span>
                          )}
                        </div>
                      </div>

                      {/* Detalhes */}
                      <div className="dep-detalhes">
                        <div className="detalhe-duracao">
                          <small>Duração da origem:</small>
                          <span>{sugestao.duracao_origem} dias</span>
                        </div>
                        <div className="detalhe-duracao">
                          <small>Duração do destino:</small>
                          <span>{sugestao.duracao_destino} dias</span>
                        </div>
                        <div className="detalhe-tipo">
                          <small>Tipo de Vínculo:</small>
                          <span className="tipo-vinculo">{sugestao.tipo_vinculo_recomendado}</span>
                        </div>
                      </div>

                      {/* Botões de Aceitação */}
                      <div className="dep-card-footer">
                        <button
                          className="btn-aceitar"
                          onClick={() => {
                            toggleSelecionada(id);
                            onAceitar(sugestao);
                          }}
                        >
                          <Check size={16} />
                          Aceitar
                        </button>
                        <button
                          className="btn-rejeitar"
                          onClick={() => onRejeitar(sugestao)}
                        >
                          <X size={16} />
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Resumo de Seleção */}
          {selecionadasCount > 0 && (
            <div className="dep-resumo">
              <p>
                <strong>{selecionadasCount}</strong> dependência(s) selecionada(s) para confirmação
              </p>
              <button className="btn-confirmar-principal" onClick={handleConfirmarSelecionadas}>
                Prosseguir com Confirmação
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DependencyRecommendations;

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import GanttSidebar from '../components/GanttSidebar';
import {
  getAtividadesEAP,
  analisarCronograma,
  obterDadosGantt
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Zap, RefreshCw, CalendarDays, AlertTriangle, ArrowLeft, X } from 'lucide-react';
import './CronogramaGantt.css';

const fmtPercent = (value) => `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const fmtNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtDate = (value) => {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
};

const severityStyle = (severity) => {
  if (severity === 'critico') return { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' };
  if (severity === 'alto') return { background: '#ffedd5', color: '#9a3412', border: '1px solid #fed7aa' };
  return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
};

function CronogramaGantt({ hideNavbar = false }) {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const { success, error } = useNotification();

  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [atividades, setAtividades] = useState([]);
  const [dadosGantt, setDadosGantt] = useState(null);
  const [analise, setAnalise] = useState(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  useEffect(() => {
    carregarTudo();
  }, [projetoId]);

  const carregarTudo = async () => {
    try {
      setLoading(true);
      const [atvResp, ganttResp] = await Promise.all([
        getAtividadesEAP(projetoId),
        obterDadosGantt(projetoId, {
          incluirNaoConfirmadas: 'false',
          mostrarCaminoCritico: 'true'
        })
      ]);
      setAtividades(atvResp.data || []);
      setDadosGantt(ganttResp.data || null);
    } catch (err) {
      error('Erro ao carregar cronograma: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setLoading(false);
    }
  };

  const resumo = useMemo(() => {
    const lista = dadosGantt?.atividades || [];
    const atrasadas = lista.filter(a => a.atrasado).length;
    const criticas = lista.filter(a => a.no_caminho_critico).length;
    return {
      total: lista.length,
      atrasadas,
      criticas,
      concluidaPct: lista.length ? Math.round((lista.filter(a => Number(a.percentual_executado || 0) >= 100).length / lista.length) * 100) : 0
    };
  }, [dadosGantt]);

  const handleAnalisarCronograma = async () => {
    if (!isGestor) {
      error('Apenas gestores podem analisar o cronograma.', 5000);
      return;
    }

    try {
      setCarregando(true);
      const response = await analisarCronograma(projetoId);
      setAnalise(response.data);
      setMostrarSugestoes(false);
      success('Análise do cronograma gerada com sucesso.', 4000);
    } catch (err) {
      error('Erro ao analisar cronograma: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setCarregando(false);
    }
  };

  if (loading) {
    return (
      <>
        {!hideNavbar && <Navbar />}
        <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {!hideNavbar && (
              <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/planejamento`)}>
                <ArrowLeft size={16} />
                Voltar ao Planejamento
              </button>
            )}
            <h1 style={{ margin: 0 }}>Cronograma (Gantt)</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={carregarTudo} disabled={carregando}>
              <RefreshCw size={16} /> Atualizar
            </button>
            {isGestor && (
              <button className="btn btn-warning" onClick={handleAnalisarCronograma} disabled={carregando}>
                <Zap size={16} /> {carregando ? 'Processando...' : 'Analisar Cronograma'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <small>Total de atividades</small>
            <h2 style={{ margin: '6px 0 0 0' }}>{resumo.total}</h2>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <small>Concluídas</small>
            <h2 style={{ margin: '6px 0 0 0' }}>{resumo.concluidaPct}%</h2>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <small>No caminho crítico</small>
            <h2 style={{ margin: '6px 0 0 0' }}>{resumo.criticas}</h2>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <small>Atrasadas</small>
            <h2 style={{ margin: '6px 0 0 0', color: resumo.atrasadas ? '#dc2626' : 'inherit' }}>{resumo.atrasadas}</h2>
          </div>
        </div>

        {resumo.atrasadas > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: '4px solid #dc2626' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="#dc2626" />
              <strong>{resumo.atrasadas} atividade(s) atrasada(s)</strong>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CalendarDays size={16} />
            <strong>Visão do Cronograma</strong>
          </div>
          <GanttSidebar
            isOpen={true}
            embedded={true}
            dadosGantt={dadosGantt}
            caminhoCritico={dadosGantt?.caminhoCritico}
            folgas={dadosGantt?.folgas}
          />
        </div>
      </div>

      {analise && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 8000,
          padding: '20px'
        }}>
          <div className="cronograma-analise-modal" style={{
            backgroundColor: 'var(--cronograma-modal-bg)',
            color: 'var(--cronograma-modal-text)',
            borderRadius: '8px',
            maxWidth: '980px',
            maxHeight: '85vh',
            overflow: 'auto',
            width: '100%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Análise do Cronograma</h2>
              <p style={{ margin: '6px 0 0', opacity: 0.88 }}>
                Diagnóstico de atrasos, impacto nas sucessoras e plano de recuperação.
              </p>
              </div>
              <button type="button" className="cronograma-analise-close" onClick={() => setAnalise(null)} aria-label="Fechar análise do cronograma">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20, display: 'grid', gap: 16 }}>
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {[
                  ['Atividades', analise.resumo?.total_atividades || 0],
                  ['Atrasadas', analise.resumo?.total_atrasadas || 0],
                  ['Críticas atrasadas', analise.resumo?.total_criticas_atrasadas || 0],
                  ['Dependências', analise.resumo?.total_dependencias_confirmadas || 0]
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: 12, border: '1px solid var(--cronograma-modal-border)', borderRadius: 8 }}>
                    <small style={{ color: 'var(--cronograma-modal-muted)' }}>{label}</small>
                    <div style={{ fontSize: 24, fontWeight: 800, color: label.includes('Atrasadas') || label.includes('Críticas') ? '#dc2626' : 'var(--cronograma-modal-strong)' }}>{value}</div>
                  </div>
                ))}
              </section>

              <section style={{ padding: 16, border: '1px solid var(--cronograma-modal-border)', borderRadius: 8 }}>
                <h3 style={{ margin: '0 0 10px' }}>Resumo Executivo</h3>
                {(analise.atividades_atrasadas || []).length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--cronograma-modal-muted)' }}>Nenhuma atividade crítica atrasada foi detectada no cronograma atual.</p>
                ) : (
                  <p style={{ margin: 0, color: 'var(--cronograma-modal-text)' }}>
                    Foram encontradas <strong>{analise.resumo?.total_atrasadas}</strong> atividade(s) atrasada(s).
                    {(analise.atividades_criticas || []).length > 0 && (
                      <> A prioridade é recuperar as atividades no caminho crítico, pois elas afetam diretamente as sucessoras.</>
                    )}
                  </p>
                )}
              </section>

              <section style={{ padding: 16, border: '1px solid var(--cronograma-modal-border)', borderRadius: 8 }}>
                <h3 style={{ margin: '0 0 12px' }}>Atividades Críticas</h3>
                {(analise.atividades_atrasadas || []).length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--cronograma-modal-muted)' }}>Sem atividades atrasadas para listar.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {(analise.atividades_atrasadas || []).map((atividade) => (
                      <div key={atividade.id} style={{ border: '1px solid var(--cronograma-modal-border)', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                          <strong>{atividade.codigo_eap} - {atividade.nome}</strong>
                          <span style={{ ...severityStyle(atividade.severidade), borderRadius: 999, padding: '3px 9px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                            {atividade.severidade}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, color: 'var(--cronograma-modal-muted)', fontSize: 13 }}>
                          <span>Fim planejado: <strong>{fmtDate(atividade.data_fim_planejada)}</strong></span>
                          <span>Executado: <strong>{fmtPercent(atividade.percentual_executado)}</strong></span>
                          <span>Restante: <strong>{fmtPercent(atividade.percentual_restante)}</strong></span>
                          <span>Dias de atraso: <strong>{atividade.dias_atraso}</strong></span>
                          {atividade.quantidade_restante != null && (
                            <span>Qtd. restante: <strong>{fmtNumber(atividade.quantidade_restante)} {atividade.unidade_medida || ''}</strong></span>
                          )}
                          <span>Caminho crítico: <strong>{atividade.no_caminho_critico ? 'Sim' : 'Não'}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section style={{ padding: 16, border: '1px solid var(--cronograma-modal-border)', borderRadius: 8 }}>
                <h3 style={{ margin: '0 0 12px' }}>Impacto nas Sucessoras</h3>
                {(analise.atividades_atrasadas || []).every((a) => !a.sucessoras_impactadas?.length) ? (
                  <p style={{ margin: 0, color: 'var(--cronograma-modal-muted)' }}>Nenhuma sucessora impactada foi encontrada para as atividades atrasadas.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {(analise.atividades_atrasadas || []).filter((a) => a.sucessoras_impactadas?.length).map((atividade) => (
                      <div key={atividade.id}>
                        <strong>{atividade.codigo_eap} - {atividade.nome}</strong>
                        <ul style={{ margin: '8px 0 0 18px', color: 'var(--cronograma-modal-muted)' }}>
                          {atividade.sucessoras_impactadas.map((s) => (
                            <li key={s.id}>{s.codigo_eap} - {s.nome} ({s.tipo_vinculo})</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section style={{ padding: 16, border: '1px solid var(--cronograma-modal-border)', borderRadius: 8 }}>
                <h3 style={{ margin: '0 0 12px' }}>Plano de Recuperação</h3>
                {(analise.atividades_atrasadas || []).length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--cronograma-modal-muted)' }}>Nenhum plano necessário com o cronograma atual.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {(analise.atividades_atrasadas || []).map((atividade) => {
                      const plano = atividade.plano_recuperacao || {};
                      return (
                        <div key={atividade.id} style={{ borderLeft: '4px solid #f59e0b', paddingLeft: 12 }}>
                          <strong>{atividade.codigo_eap} - {atividade.nome}</strong>
                          <p style={{ margin: '6px 0 0', color: 'var(--cronograma-modal-muted)' }}>
                            Data-alvo: <strong>{fmtDate(plano.data_alvo)}</strong> | Dias úteis disponíveis: <strong>{plano.dias_uteis_restantes || 0}</strong>
                            {plano.producao_diaria_necessaria != null ? (
                              <> | Necessário: <strong>{fmtNumber(plano.producao_diaria_necessaria)} {plano.unidade_medida || ''}/dia útil</strong></>
                            ) : (
                              <> | Avanço necessário: <strong>{fmtPercent(plano.avanco_diario_necessario)}/dia útil</strong></>
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section style={{ padding: 16, border: '1px solid var(--cronograma-modal-border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Sugestões de Dependências</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--cronograma-modal-muted)', fontSize: 13 }}>
                      {analise.resumo?.total_sugestoes_dependencias || 0} sugestão(ões) detectada(s) pelo algoritmo atual.
                    </p>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setMostrarSugestoes(v => !v)}>
                    {mostrarSugestoes ? 'Ocultar sugestões' : 'Ver sugestões de dependências'}
                  </button>
                </div>
                {mostrarSugestoes && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    {(analise.sugestoes_dependencias || []).length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--cronograma-modal-muted)' }}>Nenhuma sugestão de dependência foi detectada.</p>
                    ) : (
                      (analise.sugestoes_dependencias || []).map((sugestao) => (
                        <div key={`${sugestao.id_origem}_${sugestao.id_destino}`} style={{ padding: 10, border: '1px solid var(--cronograma-modal-border)', borderRadius: 8 }}>
                          <strong>{sugestao.nome_origem}</strong> {'->'} <strong>{sugestao.nome_destino}</strong>
                          <div style={{ color: 'var(--cronograma-modal-muted)', fontSize: 13, marginTop: 4 }}>
                            Tipo sugerido: {sugestao.tipo_vinculo_recomendado} | Score: {fmtNumber(sugestao.score)} | Motivos: {sugestao.motivos}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            </div>

            <div style={{ padding: '12px 20px', textAlign: 'right', borderTop: '1px solid var(--cronograma-modal-border)' }}>
              <button className="btn btn-outline" onClick={() => setAnalise(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CronogramaGantt;

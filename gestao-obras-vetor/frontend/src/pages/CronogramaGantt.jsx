import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import GanttSidebar from '../components/GanttSidebar';
import AnaliseCronograma from '../components/AnaliseCronograma';
import CockpitReturnButton from '../components/CockpitReturnButton';
import Button from '../components/ui/Button';
import {
  getAtividadesEAP,
  analisarCronograma,
  obterDadosGantt
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Zap, RefreshCw, CalendarDays, AlertTriangle, CheckCircle2, GitBranch, ListChecks, TrendingUp } from 'lucide-react';
import './CronogramaGantt.css';

function CronogramaGantt({ hideNavbar = false }) {
  const { projetoId } = useParams();
  const { isGestor } = useAuth();
  const { success, error } = useNotification();

  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [atividades, setAtividades] = useState([]);
  const [dadosGantt, setDadosGantt] = useState(null);
  const [analise, setAnalise] = useState(null);

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
      success('Análise do cronograma gerada com sucesso.', 4000);
    } catch (err) {
      error('Erro ao analisar cronograma: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setCarregando(false);
    }
  };

  if (loading) {
    return <>{!hideNavbar && <Navbar />}<main className={`cronograma-page ${hideNavbar ? 'is-embedded' : ''}`}><div className="cronograma-loading"><div className="spinner" /><span>Preparando o cronograma...</span></div></main></>;
  }

  return (
    <>
      {!hideNavbar && <Navbar />}
      <main className={`cronograma-page ${hideNavbar ? 'is-embedded' : ''}`}>
        <div className="cronograma-container">
          {!hideNavbar && <header className="cronograma-page-header">
            <div>
              <span className="cronograma-eyebrow"><CalendarDays /> Planejamento</span>
              <h1>Cronograma da obra</h1>
              <p>Linha do tempo, progresso, dependências e caminho crítico</p>
            </div>
            <div className="cronograma-page-actions">
              <CockpitReturnButton fallbackTo={`/projeto/${projetoId}/planejamento`} fallbackLabel="Voltar ao Planejamento" />
              <Button startIcon={RefreshCw} onClick={carregarTudo} loading={carregando}>Atualizar</Button>
              {isGestor && <Button tone="warning" variant="soft" startIcon={Zap} onClick={handleAnalisarCronograma} loading={carregando}>Analisar cronograma</Button>}
            </div>
          </header>}

          {hideNavbar && <div className="cronograma-embedded-actions">
            <span><CalendarDays /> Visão consolidada do cronograma</span>
            <div><Button startIcon={RefreshCw} onClick={carregarTudo} loading={carregando}>Atualizar</Button>{isGestor && <Button tone="warning" variant="soft" startIcon={Zap} onClick={handleAnalisarCronograma} loading={carregando}>Analisar</Button>}</div>
          </div>}

          <section className="cronograma-summary">
            <article className="cronograma-progress-summary">
              <div><span>Conclusão das atividades</span><strong>{resumo.concluidaPct}%</strong><small>{resumo.total} atividades consideradas</small></div>
              <div className="cronograma-progress-visual"><div><span style={{ width: `${resumo.concluidaPct}%` }} /></div><small>{resumo.concluidaPct === 100 ? 'Cronograma concluído' : 'Avanço por quantidade de atividades'}</small></div>
            </article>
            <article><span className="cronograma-summary-icon is-total"><ListChecks /></span><div><small>Total</small><strong>{resumo.total}</strong><p>atividades</p></div></article>
            <article><span className="cronograma-summary-icon is-critical"><GitBranch /></span><div><small>Caminho crítico</small><strong>{resumo.criticas}</strong><p>sem folga</p></div></article>
            <article className={resumo.atrasadas ? 'has-delay' : ''}><span className="cronograma-summary-icon is-delay"><AlertTriangle /></span><div><small>Atrasadas</small><strong>{resumo.atrasadas}</strong><p>{resumo.atrasadas ? 'requerem ação' : 'nenhuma pendência'}</p></div></article>
          </section>

          {resumo.atrasadas > 0 && <div className="cronograma-warning"><AlertTriangle /><div><strong>{resumo.atrasadas} atividade(s) fora do prazo planejado</strong><span>Priorize os itens atrasados que também pertencem ao caminho crítico.</span></div></div>}

          <section className="cronograma-gantt-card">
            <header><div><span><TrendingUp /> Linha do tempo</span><h2>Visão do cronograma</h2><p>Passe o cursor sobre uma barra para consultar datas, duração e progresso.</p></div><div className="cronograma-gantt-hint"><CheckCircle2 /> Barras preenchidas indicam o percentual executado</div></header>
            <GanttSidebar
              isOpen={true}
              embedded={true}
              dadosGantt={dadosGantt}
              caminhoCritico={dadosGantt?.caminhoCritico}
              folgas={dadosGantt?.folgas}
            />
          </section>
        </div>
      </main>

      {analise && <AnaliseCronograma analise={analise} atividades={atividades} onClose={() => setAnalise(null)} />}
    </>
  );
}

export default CronogramaGantt;

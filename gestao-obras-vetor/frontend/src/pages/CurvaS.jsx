import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, CalendarClock, Clock3, Gauge, Target, TrendingUp } from 'lucide-react';
import Navbar from '../components/Navbar';
import CockpitReturnButton from '../components/CockpitReturnButton';
import { getCurvaS } from '../services/api';
import './CurvaS.css';

const fmtPercent = (value) => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;
const fmtSignedPercent = (value) => {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number.toFixed(2).replace('.', ',')} p.p.`;
};

const formatarDataBr = (valor) => {
  if (!valor) return '—';
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : valor;
};

function CurvaS({ hideNavbar = false }) {
  const { projetoId } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);

  const carregarDados = async () => {
    try {
      setErro('');
      const response = await getCurvaS(projetoId);
      setDados(response.data);
    } catch (error) {
      setDados(null);
      setErro(error.response?.data?.erro || 'Erro ao carregar Curva S.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    carregarDados();
    const timer = setInterval(carregarDados, 30000);
    return () => clearInterval(timer);
  }, [projetoId]);

  const indicadores = useMemo(() => {
    const base = dados?.indicadores || {
      avanco_planejado: 0,
      avanco_real: 0,
      desvio: 0,
      spi: 1,
      spi_status: 'amarelo'
    };
    const tone = base.spi_status === 'verde' ? 'green' : base.spi_status === 'vermelho' ? 'red' : 'yellow';
    const statusLabel = tone === 'green' ? 'Dentro do planejado' : tone === 'red' ? 'Abaixo do ritmo' : 'Acompanhar de perto';
    return { ...base, tone, statusLabel };
  }, [dados]);

  const analiseAtrasoCurva = useMemo(() => {
    const serie = dados?.serie || [];
    const enriquecida = serie.map((ponto) => {
      const planejado = Number(ponto.planejado || 0);
      const real = Number(ponto.real || 0);
      const gap = Number((planejado - real).toFixed(2));
      return { ...ponto, gap, emAtraso: gap > 0.01, dataLabel: formatarDataBr(ponto.data) };
    });
    const pontosAtraso = enriquecida.filter((ponto) => ponto.emAtraso);
    const maiorGap = pontosAtraso.reduce((acc, ponto) => Math.max(acc, ponto.gap), 0);
    const ultimoPonto = enriquecida.length ? enriquecida[enriquecida.length - 1] : null;
    const piorPonto = pontosAtraso.reduce((acc, ponto) => (ponto.gap > (acc?.gap || 0) ? ponto : acc), null);
    return { serie: enriquecida, pontosAtraso, maiorGap, ultimoPonto, piorPonto };
  }, [dados]);

  const actual = Math.max(0, Math.min(100, Number(indicadores.avanco_real || 0)));
  const planned = Math.max(0, Math.min(100, Number(indicadores.avanco_planejado || 0)));
  const isBehind = Number(indicadores.desvio || 0) < 0;
  const chartMax = Math.max(actual, planned, ...analiseAtrasoCurva.serie.flatMap((item) => [Number(item.planejado || 0), Number(item.real || 0)]));
  const chartCeiling = Math.min(100, Math.max(10, Math.ceil((chartMax + 5) / 10) * 10));

  if (loading) {
    return <>{!hideNavbar && <Navbar />}<main className={`curve-page ${hideNavbar ? 'is-embedded' : ''}`}><div className="curve-loading"><div className="spinner" /><span>Carregando evolução do projeto...</span></div></main></>;
  }

  return <>
    {!hideNavbar && <Navbar />}
    <main className={`curve-page ${hideNavbar ? 'is-embedded' : ''}`}>
      <div className="curve-container">
        {!hideNavbar && <header className="curve-page-header">
          <div>
            <span className="curve-eyebrow"><Activity /> Planejamento físico</span>
            <h1>Curva S</h1>
            <p>{dados?.projeto?.nome || `Projeto #${projetoId}`}<span>Comparativo acumulado entre avanço planejado e realizado</span></p>
          </div>
          <div className="curve-header-actions">
            <span className="curve-auto-update"><Clock3 /> Atualização automática a cada 30s</span>
            <CockpitReturnButton fallbackTo={`/projeto/${projetoId}/planejamento`} fallbackLabel="Voltar ao Planejamento" />
          </div>
        </header>}

        {erro && <div className="curve-error"><AlertTriangle />{erro}</div>}

        <section className="curve-executive-grid">
          <article className="curve-progress-card">
            <div className="curve-progress-heading"><div><span>Avanço realizado</span><strong>{fmtPercent(indicadores.avanco_real)}</strong></div><span className={`curve-status is-${indicadores.tone}`}><i />{indicadores.statusLabel}</span></div>
            <div className="curve-progress-track" aria-label={`${fmtPercent(actual)} realizado e ${fmtPercent(planned)} planejado`}>
              <span className="curve-progress-actual" style={{ width: `${actual}%` }} />
              <i className="curve-progress-planned" style={{ left: `${planned}%` }}><small>Meta {fmtPercent(planned)}</small></i>
            </div>
            <p>{isBehind ? 'O avanço executado está abaixo da referência prevista para o período.' : 'O avanço executado acompanha ou supera a referência prevista.'}</p>
          </article>

          <article className="curve-metric-card"><span className="curve-metric-icon"><Target /></span><div><small>Avanço planejado</small><strong>{fmtPercent(indicadores.avanco_planejado)}</strong><p>Meta acumulada na data de referência</p></div></article>
          <article className={`curve-metric-card ${isBehind ? 'is-attention' : 'is-positive'}`}><span className="curve-metric-icon"><TrendingUp /></span><div><small>Desvio acumulado</small><strong>{fmtSignedPercent(indicadores.desvio)}</strong><p>{isBehind ? 'Diferença a recuperar' : 'Variação favorável'}</p></div></article>
          <article className={`curve-metric-card is-${indicadores.tone}`}><span className="curve-metric-icon"><Gauge /></span><div><small>Índice SPI</small><strong>{Number(indicadores.spi || 0).toFixed(3).replace('.', ',')}</strong><p>Realizado ÷ planejado</p></div></article>
        </section>

        <section className="curve-chart-card">
          <header className="curve-section-header">
            <div><span>Evolução física</span><h2>Planejado × realizado</h2><p>Avanço acumulado ao longo do cronograma</p></div>
            <div className="curve-legend"><span className="planned"><i />Planejado</span><span className="actual"><i />Realizado</span></div>
          </header>

          {analiseAtrasoCurva.ultimoPonto && <div className={`curve-reading is-${indicadores.tone}`}>
            <div><span className="curve-reading-icon"><CalendarClock /></span><div><small>Leitura em {analiseAtrasoCurva.ultimoPonto.dataLabel}</small><strong>{Number(analiseAtrasoCurva.ultimoPonto.real || 0) < Number(analiseAtrasoCurva.ultimoPonto.planejado || 0) ? 'Execução abaixo do planejado' : 'Execução alinhada ao planejamento'}</strong></div></div>
            <div className="curve-reading-stats"><span><small>Dias abaixo da curva</small><strong>{analiseAtrasoCurva.pontosAtraso.length}</strong></span><span><small>Maior afastamento</small><strong>{fmtPercent(analiseAtrasoCurva.maiorGap)}</strong></span>{analiseAtrasoCurva.piorPonto && <span><small>Data mais crítica</small><strong>{analiseAtrasoCurva.piorPonto.dataLabel}</strong></span>}</div>
          </div>}

          {analiseAtrasoCurva.serie.length ? <div className="curve-chart-wrap"><ResponsiveContainer width="100%" height={hideNavbar ? 320 : 370}>
            <ComposedChart data={analiseAtrasoCurva.serie} margin={{ top: 22, right: 20, left: -8, bottom: 4 }}>
              <defs><linearGradient id="curveRealArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--curve-success)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--curve-success)" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="var(--curve-border)" />
              <XAxis dataKey="data" axisLine={false} tickLine={false} minTickGap={28} tick={{ fill: 'var(--curve-muted)', fontSize: 11 }} tickFormatter={formatarDataBr} />
              <YAxis domain={[0, chartCeiling]} axisLine={false} tickLine={false} tick={{ fill: 'var(--curve-muted)', fontSize: 11 }} tickFormatter={(value) => `${value}%`} />
              <Tooltip labelFormatter={(label) => formatarDataBr(label)} formatter={(value, name) => [fmtPercent(value), name === 'planejado' ? 'Planejado' : 'Realizado']} contentStyle={{ borderColor: 'var(--curve-border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(18,45,78,.12)' }} />
              <Area type="monotone" dataKey="real" fill="url(#curveRealArea)" stroke="none" tooltipType="none" />
              <Line type="monotone" dataKey="planejado" stroke="var(--curve-primary)" strokeWidth={2.5} strokeDasharray="7 5" dot={false} />
              <Line type="monotone" dataKey="real" stroke="var(--curve-success)" strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer></div> : <div className="curve-empty">Sem dados suficientes para exibir o gráfico.</div>}
        </section>

        <section className="curve-delay-card">
          <header className="curve-section-header">
            <div><span>Caminho de recuperação</span><h2>Atividades atrasadas</h2><p>Itens que exigem acompanhamento do planejamento</p></div>
            <strong className={`curve-delay-count ${(dados?.atrasos || []).length ? 'has-items' : ''}`}>{(dados?.atrasos || []).length} atividade(s)</strong>
          </header>

          {(dados?.atrasos || []).length === 0 ? <div className="curve-empty is-positive">Nenhuma atividade em atraso no momento.</div> : <div className="curve-table-wrap"><table className="curve-table">
            <thead><tr><th>Atividade</th><th>Situação</th><th>Atraso</th><th>Responsável</th><th>Execução</th></tr></thead>
            <tbody>{dados.atrasos.map((item) => {
              const progress = Math.max(0, Math.min(100, Number(item.percentual_executado || 0)));
              const critical = item.status === 'Atraso Crítico';
              return <tr key={item.id_atividade}>
                <td><span className="curve-activity-code">{item.id_atividade}</span><strong>{item.nome}</strong></td>
                <td><span className={`curve-delay-status ${critical ? 'is-critical' : 'is-warning'}`}><i />{item.status}</span></td>
                <td><strong className="curve-delay-days">{item.dias_atraso}</strong><small>dia(s)</small></td>
                <td>{item.responsavel || 'Não informado'}</td>
                <td><div className="curve-table-progress"><div><span style={{ width: `${progress}%` }} /></div><strong>{fmtPercent(progress)}</strong></div></td>
              </tr>;
            })}</tbody>
          </table></div>}
        </section>
      </div>
    </main>
  </>;
}

export default CurvaS;

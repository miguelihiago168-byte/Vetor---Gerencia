import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Scatter, ReferenceLine } from 'recharts';
import { Activity, AlertTriangle, ArrowLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import { getCurvaS } from '../services/api';

const fmtPercent = (value) => `${Number(value || 0).toFixed(2)}%`;

const formatarDataBr = (valor) => {
  if (!valor) return '-';
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return valor;
};

function CurvaS({ hideNavbar = false }) {
  const { projetoId } = useParams();
  const navigate = useNavigate();
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

    const timer = setInterval(() => {
      carregarDados();
    }, 30000);

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

    const badgeClass = base.spi_status === 'verde'
      ? 'badge-green'
      : (base.spi_status === 'vermelho' ? 'badge-red' : 'badge-yellow');

    return { ...base, badgeClass };
  }, [dados]);

  const analiseAtrasoCurva = useMemo(() => {
    const serie = dados?.serie || [];
    const enriquecida = serie.map((ponto) => {
      const planejado = Number(ponto.planejado || 0);
      const real = Number(ponto.real || 0);
      const gap = Number((planejado - real).toFixed(2));
      return {
        ...ponto,
        gap,
        emAtraso: gap > 0.01,
        dataLabel: formatarDataBr(ponto.data)
      };
    });

    const pontosAtraso = enriquecida.filter((p) => p.emAtraso);
    const maiorGap = pontosAtraso.reduce((acc, p) => Math.max(acc, p.gap), 0);
    const ultimoPonto = enriquecida.length ? enriquecida[enriquecida.length - 1] : null;
    const piorPonto = pontosAtraso.reduce((acc, p) => (p.gap > (acc?.gap || 0) ? p : acc), null);
    const pontosDestaque = [ultimoPonto, piorPonto]
      .filter(Boolean)
      .filter((p, idx, arr) => arr.findIndex((x) => x.data === p.data) === idx)
      .map((p) => ({ ...p, nome: 'Ponto de atenção' }));

    return {
      serie: enriquecida,
      pontosAtraso,
      maiorGap,
      ultimoPonto,
      piorPonto,
      pontosDestaque
    };
  }, [dados]);

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
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
              <Activity size={24} /> Curva S
            </h1>
            {!hideNavbar && (
              <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/planejamento`)}>
                <ArrowLeft size={16} />
                Voltar ao Planejamento
              </button>
            )}
          </div>
          <p style={{ color: 'var(--gray-600)', marginTop: '8px' }}>
            Projeto: {dados?.projeto?.nome || `#${projetoId}`} · Atualização automática a cada 30s
          </p>
        </div>

        {erro && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{erro}</div>}

        <div className="grid grid-4" style={{ marginBottom: '18px' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '6px' }}>Avanço Planejado</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{fmtPercent(indicadores.avanco_planejado)}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '6px' }}>Avanço Real</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{fmtPercent(indicadores.avanco_real)}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '6px' }}>Desvio</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{fmtPercent(indicadores.desvio)}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '6px' }}>SPI</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>{Number(indicadores.spi || 0).toFixed(3)}</div>
            <span className={`badge ${indicadores.badgeClass}`}>SPI {indicadores.spi_status}</span>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '20px', padding: '18px' }}>
          <h2 className="card-header" style={{ marginBottom: '14px' }}>Gráfico Curva S Planejada x Real</h2>
          {analiseAtrasoCurva.ultimoPonto && (
            <div
              style={{
                marginBottom: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: indicadores.spi_status === 'verde' ? '1px solid #bbf7d0' : (indicadores.spi_status === 'vermelho' ? '1px solid #fecaca' : '1px solid #fde68a'),
                background: indicadores.spi_status === 'verde' ? '#f0fdf4' : (indicadores.spi_status === 'vermelho' ? '#fff1f2' : '#fffbeb'),
                color: indicadores.spi_status === 'verde' ? '#166534' : (indicadores.spi_status === 'vermelho' ? '#991b1b' : '#92400e'),
                fontSize: '13px'
              }}
            >
              <strong>
                {Number(analiseAtrasoCurva.ultimoPonto.real || 0) < Number(analiseAtrasoCurva.ultimoPonto.planejado || 0)
                  ? 'Hoje estamos abaixo do planejado.'
                  : 'Hoje estamos alinhados.'}
              </strong>
              <div style={{ marginTop: '4px' }}>
                {`${analiseAtrasoCurva.ultimoPonto.dataLabel} · Planejado ${fmtPercent(analiseAtrasoCurva.ultimoPonto.planejado)} · Real ${fmtPercent(analiseAtrasoCurva.ultimoPonto.real)}`}
              </div>
            </div>
          )}
          {dados?.serie?.length ? (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={analiseAtrasoCurva.serie} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(value) => `${Number(value || 0).toFixed(2)}%`}
                  labelFormatter={(label) => `Data: ${formatarDataBr(label)}`}
                />
                <Legend />
                <ReferenceLine y={0} stroke="#e5e7eb" />
                {analiseAtrasoCurva.ultimoPonto?.data && (
                  <ReferenceLine
                    x={analiseAtrasoCurva.ultimoPonto.data}
                    stroke="#6b7280"
                    strokeDasharray="4 3"
                    label={{ value: 'Atual', position: 'top', fill: '#6b7280', fontSize: 11 }}
                  />
                )}
                <Line type="monotone" dataKey="planejado" name="Planejado acumulado" stroke="var(--info)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="real" name="Real acumulado" stroke="var(--success)" strokeWidth={2.5} dot={false} />
                <Scatter name="Pontos de referência" data={analiseAtrasoCurva.pontosDestaque} dataKey="real" fill="#dc2626" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: '20px', color: 'var(--gray-600)' }}>Sem dados suficientes para exibir o gráfico.</div>
          )}
        </div>

        <div className="card" style={{ padding: '18px' }}>
          <h2 className="card-header" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} /> Atividades atrasadas
          </h2>

          {(dados?.atrasos || []).length === 0 ? (
            <div style={{ padding: '12px', color: 'var(--gray-600)' }}>Nenhuma atividade em atraso no momento.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Atividade</th>
                    <th>Status</th>
                    <th>Dias de atraso</th>
                    <th>Responsável</th>
                    <th>% executado</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.atrasos.map((item) => (
                    <tr key={item.id_atividade}>
                      <td>
                        <strong>{item.id_atividade}</strong>
                        <div style={{ color: 'var(--gray-600)' }}>{item.nome}</div>
                      </td>
                      <td>
                        <span className={`badge ${item.status === 'Atraso Crítico' ? 'badge-red' : 'badge-yellow'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>{item.dias_atraso}</td>
                      <td>{item.responsavel}</td>
                      <td>{fmtPercent(item.percentual_executado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default CurvaS;

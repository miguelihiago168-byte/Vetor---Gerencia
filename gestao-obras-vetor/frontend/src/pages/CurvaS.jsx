import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, AlertTriangle } from 'lucide-react';
import Navbar from '../components/Navbar';
import { getCurvaS } from '../services/api';

const fmtPercent = (value) => `${Number(value || 0).toFixed(2)}%`;

function CurvaS() {
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

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={24} /> Curva S
          </h1>
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
          {dados?.serie?.length ? (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={dados.serie} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value) => `${Number(value || 0).toFixed(2)}%`} />
                <Legend />
                <Line type="monotone" dataKey="planejado" name="Planejado acumulado" stroke="var(--info)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="real" name="Real acumulado" stroke="var(--success)" strokeWidth={2.5} dot={false} />
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

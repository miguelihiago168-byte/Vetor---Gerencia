import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { getDashboardAlmoxarifado } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { formatMoneyBR } from '../utils/currency';

const formatBRL = formatMoneyBR;

function AlmoxarifadoDashboard() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { error } = useNotification();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);
        const res = await getDashboardAlmoxarifado(projetoId);
        setDados(res.data);
      } catch (err) {
        error(err?.response?.data?.erro || 'Erro ao carregar dashboard do almoxarifado.', 7000);
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [projetoId]);

  return (
    <AlmoxarifadoLayout
      title="Dashboard"
      extraHeader={(
        <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}`)}>
          Voltar para obra
        </button>
      )}
    >

        {loading && <div className="loading"><div className="spinner"></div></div>}

        {!loading && dados && (
          <>
            <div className="grid grid-4 mb-4">
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>Ativos alocados</div>
                <div style={{ fontSize: 36, fontWeight: 700 }}>{dados.ferramentas_alocadas || 0}</div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>Ativos em atraso</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--warning)' }}>{dados.ferramentas_atrasadas || 0}</div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>Em manutenção</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--info)' }}>{dados.ferramentas_manutencao || 0}</div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>Total de perdas</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--danger)' }}>{dados.total_perdas || 0}</div>
              </div>
            </div>

            <div className="card mb-4">
              <h2 className="card-header">Custo acumulado de perdas</h2>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger)' }}>
                R$ {formatBRL(dados.custo_perdas)}
              </div>
            </div>

            <div className="card mb-4">
              <h2 className="card-header">Custo acumulado de manutenção</h2>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--info)' }}>
                R$ {formatBRL(dados.custo_manutencao || 0)}
              </div>
            </div>

            <div className="card">
              <h2 className="card-header">Ativos da Obra</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ativo</th>
                      <th>Colaborador</th>
                      <th>Qtd</th>
                      <th>Previsão devolução</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dados.ativos || []).map((item) => {
                      const pendente = Number(item.quantidade || 0) - Number(item.quantidade_devolvida || 0);
                      return (
                        <tr key={item.id}>
                          <td>{item.ferramenta_nome}</td>
                          <td>{item.colaborador_nome || '-'}</td>
                          <td>{pendente}</td>
                          <td>{item.previsao_devolucao ? new Date(item.previsao_devolucao).toLocaleDateString('pt-BR') : '-'}</td>
                          <td>
                            {item.status === 'EM_MANUTENCAO' ? (
                              <span className="badge badge-blue">Manutenção</span>
                            ) : item.atrasada ? (
                              <span className="badge badge-yellow">Atraso</span>
                            ) : (
                              <span className="badge badge-green">Alocada</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {(!dados.ativos || dados.ativos.length === 0) && (
                      <tr>
                        <td colSpan={5}>Nenhum ativo nesta obra.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxarifadoDashboard;

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { getRelatorioPerdasAlmox } from '../services/api';
import { formatMoneyBR } from '../utils/currency';

const formatBRL = formatMoneyBR;

function AlmoxPerdas() {
  const { projetoId } = useParams();
  const [perdas, setPerdas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);
        const res = await getRelatorioPerdasAlmox(projetoId);
        setPerdas(res.data || []);
      } catch (error) {
        setErro(error?.response?.data?.erro || 'Erro ao carregar perdas.');
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [projetoId]);

  return (
    <AlmoxarifadoLayout title="Perdas">
      {erro && <div className="alert alert-error">{erro}</div>}
      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : (
        <div className="card">
          <h2 className="card-header">Verificação de perdas registradas</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Data</th>
                  <th>Ativo</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>NF</th>
                  <th>Responsável</th>
                  <th>Qtd</th>
                  <th>Valor unitário</th>
                  <th>Custo total</th>
                  <th>Justificativa</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {perdas.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td>{p.criado_em ? new Date(p.criado_em).toLocaleString('pt-BR') : '-'}</td>
                    <td>{p.ferramenta_nome || '-'}</td>
                    <td>{p.ferramenta_marca || '-'}</td>
                    <td>{p.ferramenta_modelo || '-'}</td>
                    <td>{p.ferramenta_nf_compra || '-'}</td>
                    <td>{p.colaborador_nome || '-'}</td>
                    <td>{p.quantidade}</td>
                    <td>R$ {formatBRL(p.valor_unitario)}</td>
                    <td>R$ {formatBRL(p.custo_total)}</td>
                    <td>{p.justificativa || '-'}</td>
                    <td>{p.usuario_nome || '-'}</td>
                  </tr>
                ))}
                {perdas.length === 0 && (
                  <tr><td colSpan={12}>Nenhuma perda registrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxPerdas;

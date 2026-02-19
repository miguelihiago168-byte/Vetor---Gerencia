import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { getRelatorioMovimentacoesAlmox } from '../services/api';

function AlmoxRelatorios() {
  const { projetoId } = useParams();
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);
        const res = await getRelatorioMovimentacoesAlmox(projetoId);
        setMovimentacoes(res.data || []);
      } catch (error) {
        setErro(error?.response?.data?.erro || 'Erro ao carregar relatório de movimentações.');
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [projetoId]);

  return (
    <AlmoxarifadoLayout title="Relatórios">
        {erro && <div className="alert alert-error">{erro}</div>}
        {loading ? (
          <div className="loading"><div className="spinner"></div></div>
        ) : (
          <div className="card">
            <h2 className="card-header">Histórico imutável de movimentações</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Ativo</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>NF</th>
                    <th>Qtd</th>
                    <th>Origem</th>
                    <th>Destino</th>
                    <th>Colaborador</th>
                    <th>Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacoes.map((m) => (
                    <tr key={m.id}>
                      <td>#{m.id}</td>
                      <td>{new Date(m.criado_em).toLocaleString('pt-BR')}</td>
                      <td>{m.tipo}</td>
                      <td>{m.ferramenta_nome}</td>
                      <td>{m.ferramenta_marca || '-'}</td>
                      <td>{m.ferramenta_modelo || '-'}</td>
                      <td>{m.ferramenta_nf_compra || '-'}</td>
                      <td>{m.quantidade}</td>
                      <td>{m.projeto_origem_nome || '-'}</td>
                      <td>{m.projeto_destino_nome || '-'}</td>
                      <td>{m.colaborador_nome || '-'}</td>
                      <td>{m.usuario_nome || '-'}</td>
                    </tr>
                  ))}
                  {movimentacoes.length === 0 && (
                    <tr><td colSpan={12}>Nenhuma movimentação registrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxRelatorios;

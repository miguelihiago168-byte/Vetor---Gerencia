import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { getRelatorioMovimentacoesAlmox } from '../services/api';

function AlmoxRelatorios() {
  const { projetoId } = useParams();
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroRelatorios, setFiltroRelatorios] = useState('');

  const movimentacoesFiltradas = useMemo(() => {
    const termo = filtroRelatorios.trim().toLowerCase();
    if (!termo) return movimentacoes;

    return movimentacoes.filter((movimentacao) => {
      const camposBusca = [
        movimentacao.tipo,
        movimentacao.ferramenta_nome,
        movimentacao.ferramenta_marca,
        movimentacao.ferramenta_modelo,
        movimentacao.ferramenta_nf_compra,
        movimentacao.projeto_origem_nome,
        movimentacao.projeto_destino_nome,
        movimentacao.colaborador_nome,
        movimentacao.usuario_nome
      ];

      return camposBusca.some((campo) => String(campo || '').toLowerCase().includes(termo));
    });
  }, [movimentacoes, filtroRelatorios]);

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
            <div className="mb-3">
              <input
                className="form-input"
                placeholder="Pesquisar por tipo, ativo, marca, modelo, NF, origem, destino, colaborador ou usuário"
                value={filtroRelatorios}
                onChange={(e) => setFiltroRelatorios(e.target.value)}
              />
            </div>
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
                  {movimentacoesFiltradas.map((m) => (
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
                  {movimentacoesFiltradas.length === 0 && (
                    <tr><td colSpan={12}>{filtroRelatorios ? 'Nenhuma movimentação encontrada para o filtro informado.' : 'Nenhuma movimentação registrada.'}</td></tr>
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

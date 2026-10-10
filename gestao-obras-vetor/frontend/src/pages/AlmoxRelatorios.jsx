import React, { useEffect, useState } from 'react';
import { fmtTs } from '../utils/date';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { AssetsPanel, AssetsState, AssetsSearch, AssetsStatus, AssetsTable } from '../components/AlmoxarifadoUI';
import { getRelatorioMovimentacoesAlmox } from '../services/api';

const tipos = {
  CADASTRO: ['Cadastro', 'blue'],
  RETIRADA: ['Retirada', 'blue'],
  DEVOLUCAO: ['Devolução', 'green'],
  MANUTENCAO_ENVIO: ['Envio à manutenção', 'yellow'],
  MANUTENCAO_RETORNO: ['Retorno da manutenção', 'green'],
  BAIXA_DEFINITIVA: ['Baixa definitiva', 'red'],
  PERDA: ['Perda', 'red'],
  TRANSFERENCIA: ['Transferência', 'blue'],
  TRANSFERENCIA_ATIVO: ['Transferência de ativo', 'blue'],
  VINCULO_RDO: ['Vínculo com RDO', 'blue']
};

function AlmoxRelatorios() {
  const { projetoId } = useParams();
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('todos');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    getRelatorioMovimentacoesAlmox(projetoId)
      .then((res) => { if (active) setMovimentacoes(res.data || []); })
      .catch((err) => { if (active) setLoadError(err?.response?.data?.erro || 'Erro ao carregar o histórico de movimentações.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projetoId, tentativa]);

  const tiposDisponiveis = [...new Set(movimentacoes.map((m) => m.tipo).filter(Boolean))];
  const filtradas = movimentacoes.filter((m) => (tipo === 'todos' || m.tipo === tipo)
    && [m.id, m.tipo, tipos[m.tipo]?.[0], m.ferramenta_nome, m.ferramenta_marca, m.ferramenta_modelo, m.ferramenta_nf_compra, m.projeto_origem_nome, m.projeto_destino_nome, m.colaborador_nome, m.usuario_nome]
      .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'))));
  const columns = [
    { key: 'ativo', label: 'Ativo', render: (m) => <div><strong className="assets-item-name">{m.ferramenta_nome || 'Não informado'}</strong><span className="assets-record-meta">{[m.ferramenta_marca, m.ferramenta_modelo].filter(Boolean).join(' · ') || 'Marca/modelo não informados'}</span><span className="assets-detail">NF: {m.ferramenta_nf_compra || 'Não informada'}</span></div> },
    { key: 'registro', label: 'Movimentação', render: (m) => <div><AssetsStatus tone={tipos[m.tipo]?.[1] || 'blue'}>{tipos[m.tipo]?.[0] || m.tipo || 'Não informado'}</AssetsStatus><span className="assets-record-meta">#{m.id} · {fmtTs(m.criado_em)}</span></div> },
    { key: 'quantidade', label: 'Quantidade', className: 'assets-number', render: (m) => m.quantidade },
    { key: 'obras', label: 'Origem e destino', render: (m) => <div><span>Origem: {m.projeto_origem_nome || 'Não informada'}</span><span className="assets-record-meta">Destino: {m.projeto_destino_nome || 'Não informado'}</span></div> },
    { key: 'pessoas', label: 'Responsáveis', render: (m) => <div><span>Colaborador: {m.colaborador_nome || 'Não informado'}</span><span className="assets-record-meta">Registrado por: {m.usuario_nome || 'Não informado'}</span></div> }
  ];

  return (
    <AlmoxarifadoLayout title="Relatórios" description="Acompanhe a movimentação dos ativos e a rastreabilidade de cada operação.">
      <AssetsPanel title="Histórico de movimentações" description="Registros imutáveis de retiradas, devoluções, manutenção e transferências." count={!loading && !loadError ? movimentacoes.length : null} footer={!loading && !loadError ? `${filtradas.length} de ${movimentacoes.length} movimentações` : null}>
        <AssetsSearch value={busca} onChange={setBusca} placeholder="Buscar ativo, NF, obra, colaborador ou usuário">
          <select className="form-select assets-status-filter" aria-label="Filtrar tipo de movimentação" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="todos">Todos os tipos</option>{tiposDisponiveis.map((value) => <option key={value} value={value}>{tipos[value]?.[0] || value}</option>)}
          </select>
        </AssetsSearch>
        {loading || loadError ? <AssetsState loading={loading} error={loadError} onRetry={() => setTentativa((value) => value + 1)} /> : filtradas.length ? <AssetsTable label="Histórico de movimentações" columns={columns} rows={filtradas} className="assets-history-table" /> :
          <AssetsState title={movimentacoes.length ? 'Nenhuma movimentação encontrada' : 'Nenhuma movimentação registrada'} description={movimentacoes.length ? 'Ajuste a busca ou o tipo de movimentação.' : 'As operações realizadas com os ativos desta obra aparecerão aqui.'}>
            {(busca || tipo !== 'todos') && <button className="btn btn-secondary" onClick={() => { setBusca(''); setTipo('todos'); }}>Limpar filtros</button>}
          </AssetsState>}
      </AssetsPanel>
    </AlmoxarifadoLayout>
  );
}

export default AlmoxRelatorios;

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert, Package, CircleDollarSign } from 'lucide-react';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { AssetsPanel, AssetsState, AssetsSearch, AssetsTable } from '../components/AlmoxarifadoUI';
import { getRelatorioPerdasAlmox } from '../services/api';
import { formatMoneyBR } from '../utils/currency';

function AlmoxPerdas() {
  const { projetoId } = useParams();
  const [perdas, setPerdas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    getRelatorioPerdasAlmox(projetoId)
      .then((res) => { if (active) setPerdas(res.data || []); })
      .catch((err) => { if (active) setLoadError(err?.response?.data?.erro || 'Erro ao carregar perdas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projetoId, tentativa]);

  const filtradas = perdas.filter((p) => [p.id, p.ferramenta_nome, p.ferramenta_marca, p.ferramenta_modelo, p.ferramenta_nf_compra, p.colaborador_nome, p.usuario_nome, p.justificativa]
    .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'))));
  const quantidade = perdas.reduce((total, p) => total + Number(p.quantidade || 0), 0);
  const custo = perdas.reduce((total, p) => total + Number(p.custo_total || 0), 0);
  const columns = [
    { key: 'ativo', label: 'Ativo', render: (p) => <div><span className="assets-code">Ocorrência #{p.id}</span><strong className="assets-item-name">{p.ferramenta_nome || 'Não informado'}</strong><span className="assets-record-meta">{[p.ferramenta_marca, p.ferramenta_modelo].filter(Boolean).join(' · ') || 'Marca/modelo não informados'}</span><span className="assets-detail">NF: {p.ferramenta_nf_compra || 'Não informada'}</span></div> },
    { key: 'registro', label: 'Registro', render: (p) => <div>{p.criado_em ? new Date(p.criado_em).toLocaleString('pt-BR') : 'Data não informada'}<span className="assets-record-meta">Registrado por: {p.usuario_nome || 'Não informado'}</span></div> },
    { key: 'responsavel', label: 'Responsável', render: (p) => p.colaborador_nome || 'Não informado' },
    { key: 'quantidade', label: 'Quantidade', className: 'assets-number', render: (p) => p.quantidade },
    { key: 'custo', label: 'Custo da perda', render: (p) => <div><strong className="assets-record-value">R$ {formatMoneyBR(p.custo_total)}</strong><span className="assets-detail">Unitário: R$ {formatMoneyBR(p.valor_unitario)}</span></div> },
    { key: 'justificativa', label: 'Justificativa', render: (p) => <div className="assets-record-note">{p.justificativa || 'Não informada'}</div> }
  ];

  return (
    <AlmoxarifadoLayout title="Perdas" description="Consulte as ocorrências e acompanhe o impacto financeiro das perdas da obra.">
      {!loading && !loadError && <section className="assets-metrics assets-metrics-three" aria-label="Resumo de perdas">
        <div className="assets-metric"><div className="assets-metric-top"><span>Ocorrências registradas</span><span className="assets-icon assets-tone-red"><ShieldAlert size={19} aria-hidden="true" /></span></div><strong>{perdas.length.toLocaleString('pt-BR')}</strong><small>Histórico desta obra</small></div>
        <div className="assets-metric"><div className="assets-metric-top"><span>Quantidade perdida</span><span className="assets-icon assets-tone-yellow"><Package size={19} aria-hidden="true" /></span></div><strong>{quantidade.toLocaleString('pt-BR')}</strong><small>Soma das quantidades registradas</small></div>
        <div className="assets-metric assets-metric-money"><div className="assets-metric-top"><span>Custo acumulado</span><span className="assets-icon assets-tone-red"><CircleDollarSign size={19} aria-hidden="true" /></span></div><strong>R$ {formatMoneyBR(custo)}</strong><small>Total de perdas da obra</small></div>
      </section>}
      <AssetsPanel title="Histórico de perdas" description="Identificação do ativo, responsáveis, custos e justificativas." count={!loading && !loadError ? perdas.length : null} footer={!loading && !loadError ? `${filtradas.length} de ${perdas.length} ocorrências · Resumo considera todo o histórico da obra` : null}>
        <AssetsSearch value={busca} onChange={setBusca} placeholder="Buscar ativo, responsável, NF ou justificativa" />
        {loading || loadError ? <AssetsState loading={loading} error={loadError} onRetry={() => setTentativa((value) => value + 1)} /> : filtradas.length ? <AssetsTable label="Histórico de perdas" columns={columns} rows={filtradas} className="assets-history-table" /> :
          <AssetsState title={perdas.length ? 'Nenhuma perda encontrada' : 'Nenhuma perda registrada'} description={perdas.length ? 'Tente outro termo para consultar o histórico.' : 'Quando uma perda for registrada, os detalhes e custos aparecerão aqui.'}>
            {busca && <button className="btn btn-secondary" onClick={() => setBusca('')}>Limpar busca</button>}
          </AssetsState>}
      </AssetsPanel>
    </AlmoxarifadoLayout>
  );
}

export default AlmoxPerdas;

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Boxes, Clock3, Wrench, ShieldAlert, Search, Package, ArrowRight, AlertCircle } from 'lucide-react';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import CockpitReturnButton from '../components/CockpitReturnButton';
import { getDashboardAlmoxarifado } from '../services/api';
import { formatMoneyBR } from '../utils/currency';

const metrics = [
  ['ferramentas_alocadas', 'Ativos alocados', 'Em uso nesta obra', Boxes, 'blue'],
  ['ferramentas_atrasadas', 'Em atraso', 'Devolução pendente', Clock3, 'yellow'],
  ['ferramentas_manutencao', 'Em manutenção', 'Aguardando liberação', Wrench, 'blue'],
  ['total_perdas', 'Perdas registradas', 'Ocorrências na obra', ShieldAlert, 'red']
];

const statusAtivo = (item) => item.status === 'EM_MANUTENCAO' ? 'manutencao' : item.atrasada ? 'atraso' : 'alocado';
const statuses = { manutencao: ['Manutenção', 'blue'], atraso: ['Em atraso', 'yellow'], alocado: ['Alocado', 'green'] };

function AlmoxarifadoDashboard() {
  const { projetoId } = useParams();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('todos');
  const base = `/projeto/${projetoId}/almoxarifado`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    getDashboardAlmoxarifado(projetoId)
      .then((res) => { if (active) setDados(res.data); })
      .catch((err) => { if (active) setLoadError(err?.response?.data?.erro || 'Não foi possível carregar os ativos da obra.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projetoId, tentativa]);

  const ativos = dados?.ativos || [];
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const filtrados = ativos.filter((item) => (
    (status === 'todos' || statusAtivo(item) === status)
    && `${item.ferramenta_nome || ''} ${item.colaborador_nome || ''}`.toLocaleLowerCase('pt-BR').includes(termo)
  ));

  return (
    <AlmoxarifadoLayout title="Ativos da obra" description="Acompanhe alocações, devoluções e custos em um só lugar."
      extraHeader={<div className="assets-header-actions">
        <CockpitReturnButton fallbackTo={`/projeto/${projetoId}`} fallbackLabel="Voltar para obra" />
        <Link className="btn btn-primary" to={`${base}/retirada`}><ArrowUpRight size={16} aria-hidden="true" />Registrar retirada</Link>
      </div>}
    >
      {loading && <div className="assets-loading" role="status"><div className="spinner" />Carregando ativos da obra…</div>}
      {!loading && loadError && <div className="card assets-empty" role="alert">
        <AlertCircle size={28} aria-hidden="true" /><h2>Não foi possível carregar o resumo</h2><p>{loadError}</p>
        <button className="btn btn-secondary" onClick={() => setTentativa((value) => value + 1)}>Tentar novamente</button>
      </div>}
      {!loading && !loadError && dados && <>
        <section className="assets-metrics" aria-label="Resumo de ativos">
          {metrics.map(([key, label, hint, Icon, tone]) => <div className="assets-metric" key={key}>
            <div className="assets-metric-top"><span>{label}</span><span className={`assets-icon assets-tone-${tone}`}><Icon size={19} aria-hidden="true" /></span></div>
            <strong>{Number(dados[key] || 0).toLocaleString('pt-BR')}</strong><small>{hint}</small>
          </div>)}
        </section>

        <section className="assets-costs" aria-labelledby="assets-costs-title">
          <div className="assets-costs-heading"><h2 id="assets-costs-title">Custos acumulados</h2><p>Histórico financeiro da obra</p></div>
          <div className="assets-cost"><span className="assets-icon assets-tone-blue"><Wrench size={19} aria-hidden="true" /></span><div><span>Manutenção</span><strong>R$ {formatMoneyBR(dados.custo_manutencao || 0)}</strong></div></div>
          <div className="assets-cost"><span className="assets-icon assets-tone-red"><ShieldAlert size={19} aria-hidden="true" /></span><div><span>Perdas</span><strong>R$ {formatMoneyBR(dados.custo_perdas || 0)}</strong></div></div>
        </section>

        <section className="card assets-panel" aria-labelledby="assets-allocations-title">
          <div className="assets-panel-heading"><div><h2 id="assets-allocations-title">Alocações da obra <span className="assets-count">{ativos.length}</span></h2><p>Responsáveis, quantidades e previsão de devolução.</p></div>
            <Link className="assets-text-link" to={`${base}/ferramentas`}>Ver cadastro<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className="assets-toolbar">
            <div className="assets-search"><Search size={18} aria-hidden="true" /><input type="search" className="form-input" aria-label="Buscar ativo ou colaborador" placeholder="Buscar ativo ou colaborador" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
            <select className="form-select assets-status-filter" aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="todos">Todos os status</option><option value="alocado">Alocado</option><option value="atraso">Em atraso</option><option value="manutencao">Manutenção</option></select>
          </div>
          {filtrados.length > 0 ? <div className="assets-table-wrap">
            <table className="table assets-table assets-responsive-table" role="table" aria-label="Alocações da obra">
              <thead role="rowgroup"><tr role="row"><th scope="col">Ativo</th><th scope="col">Colaborador</th><th scope="col">Qtd. pendente</th><th scope="col">Previsão de devolução</th><th scope="col">Status</th></tr></thead>
              <tbody role="rowgroup">{filtrados.map((item) => {
                const [label, tone] = statuses[statusAtivo(item)];
                return <tr key={item.id} role="row">
                  <td role="cell" data-label="Ativo"><strong className="assets-item-name">{item.ferramenta_nome}</strong></td>
                  <td role="cell" data-label="Colaborador">{item.colaborador_nome || 'Não informado'}</td>
                  <td role="cell" data-label="Qtd. pendente" className="assets-number">{Number(item.quantidade || 0) - Number(item.quantidade_devolvida || 0)}</td>
                  <td role="cell" data-label="Devolução">{item.previsao_devolucao ? new Date(item.previsao_devolucao).toLocaleDateString('pt-BR') : 'Sem previsão'}</td>
                  <td role="cell" data-label="Status"><span className={`assets-status assets-tone-${tone}`}><span aria-hidden="true" />{label}</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <div className="assets-empty"><Package size={30} aria-hidden="true" /><h3>{ativos.length ? 'Nenhuma alocação encontrada' : 'Nenhum ativo alocado nesta obra'}</h3><p>{ativos.length ? 'Ajuste a busca ou o status para encontrar uma alocação.' : 'As retiradas registradas aparecerão aqui para acompanhamento.'}</p>
            {ativos.length > 0 ? <button className="btn btn-secondary" onClick={() => { setBusca(''); setStatus('todos'); }}>Limpar filtros</button> : <Link className="btn btn-primary" to={`${base}/retirada`}>Registrar retirada</Link>}
          </div>}
          <div className="assets-panel-footer" role="status">{filtrados.length} de {ativos.length} alocações</div>
        </section>
      </>}
    </AlmoxarifadoLayout>
  );
}

export default AlmoxarifadoDashboard;

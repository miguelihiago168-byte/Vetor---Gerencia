import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Boxes, Camera, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, FileImage, FileText, HardHat, ShieldCheck, Users, Wrench } from 'lucide-react';
import { CockpitCard, EmptyState, MetricGrid } from './CockpitPrimitives';
import Button from '../ui/Button';
import { formatDate } from './cockpitTransforms';

const CockpitLinkButton = ({ children, onClick }) => (
  <Button size="sm" tone="primary" variant="ghost" endIcon={ArrowUpRight} onClick={onClick}>{children}</Button>
);

const rdoNumber = (rdo) => {
  const value = String(rdo?.numero_rdo ?? rdo?.id ?? '0');
  const numeric = value.match(/\d+/g)?.join('');
  return Number(numeric || 0);
};

export function AttentionPointsCard({ items, onOpen }) {
  return <CockpitCard title="Pontos de atenção" icon={AlertTriangle} className="cockpit-card-wide">
    {items.length ? <div className="cockpit-attention-list">{items.map((item, index) => <button type="button" key={`${item.source}-${item.title}-${index}`} className={`cockpit-attention attention-${item.priority}`} onClick={() => onOpen(item.href)}>
      <span>{item.source}</span><div><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</div><time>{formatDate(item.date, '')}</time>
    </button>)}</div> : <EmptyState>Nenhum ponto de atenção rastreável no momento.</EmptyState>}
  </CockpitCard>;
}

export function RecentExecutionCard({ data, onOpen }) {
  const recentRdos = [...(data?.recent || [])].sort((a, b) => rdoNumber(b) - rdoNumber(a));
  const statusTone = (status = '') => {
    const normalized = String(status).toLocaleLowerCase('pt-BR');
    if (normalized.includes('aprov') || normalized.includes('conclu')) return 'ok';
    if (normalized.includes('revis') || normalized.includes('análise')) return 'attention';
    return 'neutral';
  };

  return <CockpitCard title="Produção registrada" icon={FileText} className="cockpit-card-wide cockpit-operation-execution" action={<CockpitLinkButton onClick={() => onOpen('rdos')}>Ver todos os RDOs</CockpitLinkButton>}>
    {!data ? <EmptyState>Dados de RDO indisponíveis.</EmptyState> : <>
      <div className="cockpit-operation-summary">
        <div className="is-primary"><FileText /><span><small>RDOs nos últimos 7 dias</small><strong>{data.totals.rdos}</strong></span></div>
        <div><ClipboardCheck /><span><strong>{data.totals.activities}</strong><small>atividades registradas</small></span></div>
        <div><FileImage /><span><strong>{data.totals.photos}</strong><small>fotos adicionadas</small></span></div>
        <div className={data.totals.occurrences ? 'has-attention' : ''}><AlertTriangle /><span><strong>{data.totals.occurrences}</strong><small>ocorrências</small></span></div>
      </div>
      <div className="cockpit-rdo-section">
        <div className="cockpit-rdo-heading"><span>RDOs recentes</span><small>{recentRdos.length} em ordem numérica</small></div>
        <div className="cockpit-list cockpit-rdo-list">{recentRdos.map((rdo) => <button type="button" className="cockpit-list-row cockpit-rdo-row" key={rdo.id} onClick={() => onOpen(`rdo/${rdo.id}`)}>
          <div className="cockpit-rdo-id"><span>RDO</span><strong>{String(rdo.numero_rdo || rdo.id).padStart(3, '0')}</strong></div>
          <div className="cockpit-rdo-content"><strong>{formatDate(rdo.data_relatorio)}</strong><span>{rdo.responsavel || 'Responsável não informado'}</span></div>
          <div className="cockpit-rdo-volume"><span><ClipboardCheck /> {rdo.activity_count || 0} atividades</span><span><Camera /> {rdo.photo_count || 0} fotos</span></div>
          <span className={`cockpit-rdo-status is-${statusTone(rdo.status)}`}>{rdo.status || 'Sem status'}</span>
      </button>)}</div>
      </div>
    </>}
  </CockpitCard>;
}

export function WorkforceSummaryCard({ data }) {
  const functions = data?.by_function?.slice(0, 6) || [];
  const maxQuantity = Math.max(1, ...functions.map((item) => Number(item.quantidade || 0)));
  return <CockpitCard title="Equipe em campo" icon={HardHat} className="cockpit-workforce-card">{!data ? <EmptyState>Dados de mão de obra indisponíveis.</EmptyState> : <>
    <div className="cockpit-workforce-summary">
      <div className="cockpit-workforce-primary"><Users /><span><small>Efetivo mais recente</small><strong>{data?.latest_effective ?? '—'}<em>pessoas</em></strong></span></div>
      <div><span>Média em 7 dias</span><strong>{data?.average_effective ?? '—'}</strong></div>
      <div><span>HH no período</span><strong>{data?.hh_available ? data.hh : '—'}</strong><small>{data?.hh_available ? 'horas registradas' : 'não disponível'}</small></div>
    </div>
    {functions.length ? <div className="cockpit-workforce-functions"><header><span>Composição por função</span><small>até 6 funções</small></header>{functions.map((item) => <div key={item.funcao}><span>{item.funcao}</span><div><i style={{ width: `${(Number(item.quantidade || 0) / maxQuantity) * 100}%` }} /></div><strong>{item.quantidade}</strong></div>)}</div> : <p className="cockpit-caption">Distribuição por função indisponível: nenhum registro individual no período.</p>}
  </>}</CockpitCard>;
}

export function EquipmentSummaryCard({ data, onOpen }) {
  const items = data?.items || [];
  return <CockpitCard title="Equipamentos em uso" icon={Wrench} className="cockpit-equipment-card" action={<CockpitLinkButton onClick={() => onOpen('almoxarifado')}>Ver Ativos</CockpitLinkButton>}>
    {!data ? <EmptyState>Dados de equipamentos indisponíveis.</EmptyState> : items.length ? <div className="cockpit-equipment-list">{items.slice(0, 7).map((item) => <div className="cockpit-equipment-row" key={item.name}>
      <span className="cockpit-equipment-icon"><Wrench /></span>
      <div><strong>{item.name}</strong><span>Último uso em {formatDate(item.last_used)}</span></div>
      <div className="cockpit-equipment-usage"><strong>{item.days_used}</strong><span>dia(s) de uso</span></div>
      <div className="cockpit-equipment-quantity"><span>Máximo</span><strong>{item.max_quantity}</strong></div>
    </div>)}</div> : <EmptyState>Nenhum equipamento registrado nos RDOs.</EmptyState>}
  </CockpitCard>;
}

export function QualitySummaryCard({ data, onOpen }) {
  return <CockpitCard title="Qualidade" icon={ShieldCheck} action={<CockpitLinkButton onClick={() => onOpen('rnc')}>Ver Qualidade</CockpitLinkButton>}>
    {!data ? <EmptyState>Dados de Qualidade indisponíveis.</EmptyState> : <><MetricGrid items={[
      { label: 'Abertas', value: data.open, state: data.open ? 'attention' : 'ok' }, { label: 'Críticas abertas', value: data.critical_open, state: data.critical_open ? 'attention' : 'ok' },
      { label: 'Em aprovação', value: data.awaiting_approval }, { label: 'Encerradas em 7d', value: data.recently_closed, state: 'ok' }
    ]} /><div className="cockpit-bars">{data.by_gravity.map((item) => <div key={item.gravidade}><span>{item.gravidade}</span><strong>{item.count}</strong></div>)}</div></>}
  </CockpitCard>;
}

export function ProcurementSummaryCard({ data, onOpen }) {
  return <CockpitCard title="Suprimentos" icon={ClipboardList} action={<CockpitLinkButton onClick={() => onOpen('compras')}>Ver Suprimentos</CockpitLinkButton>}>
    {!data ? <EmptyState>Resumo indisponível para este perfil ou fonte.</EmptyState> : <MetricGrid items={[
      { label: 'Em análise', value: data.analysis, state: data.analysis ? 'attention' : 'ok' }, { label: 'Em cotação', value: data.quotation },
      { label: 'Autorizadas', value: data.authorized }, { label: 'Compradas', value: data.bought, state: 'ok' }, { label: 'Urgentes', value: data.urgent.length, state: data.urgent.length ? 'attention' : 'ok' }
    ]} />}
  </CockpitCard>;
}

export function AssetsSummaryCard({ data, onOpen }) {
  return <CockpitCard title="Ativos" icon={Boxes} action={<CockpitLinkButton onClick={() => onOpen('almoxarifado')}>Ver Ativos</CockpitLinkButton>}>
    {!data ? <EmptyState>Resumo de Ativos indisponível para este perfil ou fonte.</EmptyState> : <MetricGrid items={[
      { label: 'Total', value: data.total_ferramentas || 0 }, { label: 'Disponíveis', value: data.ferramentas_disponiveis || 0, state: 'ok' },
      { label: 'Alocados', value: data.ferramentas_alocadas || 0, state: 'info' }, { label: 'Em manutenção', value: data.ferramentas_manutencao || 0, state: data.ferramentas_manutencao ? 'attention' : 'ok' },
      { label: 'Atrasados', value: data.ferramentas_atrasadas || 0, state: data.ferramentas_atrasadas ? 'attention' : 'ok' }, { label: 'Perdas', value: data.total_perdas || 0, state: data.total_perdas ? 'attention' : 'ok' }
    ]} />}
  </CockpitCard>;
}

export function PhotoAlbumCard({ album, getUrl, loading, onOpen }) {
  const photos = useMemo(() => (album?.rdos || []).flatMap((group) => (group.fotos || []).map((photo) => ({
    ...photo,
    numero_rdo: group.numero_rdo,
    data_relatorio: group.data_relatorio
  }))), [album]);
  const photoIndexes = useMemo(() => new Map(photos.map((photo, index) => [photo.id, index])), [photos]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const selected = selectedIndex === null ? null : photos[selectedIndex];
  const move = (direction) => setSelectedIndex((current) => (current + direction + photos.length) % photos.length);

  return <CockpitCard title={`Álbum da obra${photos.length ? ` · ${photos.length} foto(s)` : ''}`} icon={Camera} className="cockpit-card-wide">
    {loading ? <EmptyState>Carregando álbum da obra...</EmptyState> : photos.length ? <div className="cockpit-album">{(album.rdos || []).map((group) => <section className="cockpit-album-group" key={group.rdo_id}>
      <header><div><strong>{group.numero_rdo}</strong><span>{formatDate(group.data_relatorio)} · {group.status}</span></div><CockpitLinkButton onClick={() => onOpen(`rdo/${group.rdo_id}`)}>Abrir RDO</CockpitLinkButton></header>
      <div className="cockpit-photo-grid">{group.fotos.map((photo) => {
        const index = photoIndexes.get(photo.id);
        return <button type="button" key={photo.id} className="cockpit-photo" onClick={() => setSelectedIndex(index)}><img src={getUrl(photo.caminho_arquivo)} loading="lazy" alt={photo.descricao || 'Foto do RDO'} /><span><strong>{photo.atividade_codigo ? `${photo.atividade_codigo} · ` : ''}{photo.atividade_descricao || photo.atividade_avulsa_descricao || 'Atividade vinculada'}</strong>{photo.descricao && <small>{photo.descricao}</small>}</span></button>;
      })}</div>
    </section>)}</div> : <EmptyState>Nenhuma foto registrada nos RDOs.</EmptyState>}
    {selected && <div className="cockpit-lightbox" role="dialog" aria-modal="true" aria-label="Álbum de fotos da obra" onClick={() => setSelectedIndex(null)}>
      <button type="button" className="cockpit-lightbox-close" aria-label="Fechar" onClick={() => setSelectedIndex(null)}>×</button>
      {photos.length > 1 && <button type="button" className="cockpit-lightbox-nav previous" aria-label="Foto anterior" onClick={(event) => { event.stopPropagation(); move(-1); }}><ChevronLeft /></button>}
      <img onClick={(event) => event.stopPropagation()} src={getUrl(selected.caminho_arquivo)} alt={selected.descricao || 'Foto do RDO'} />
      {photos.length > 1 && <button type="button" className="cockpit-lightbox-nav next" aria-label="Próxima foto" onClick={(event) => { event.stopPropagation(); move(1); }}><ChevronRight /></button>}
      <div onClick={(event) => event.stopPropagation()}><span><strong>{selected.numero_rdo} · {formatDate(selected.data_relatorio)}</strong><small>{selected.descricao || selected.atividade_descricao || selected.atividade_avulsa_descricao || 'Atividade vinculada'} · {selectedIndex + 1} de {photos.length}</small></span><CockpitLinkButton onClick={() => onOpen(`rdo/${selected.rdo_id}`)}>Abrir RDO</CockpitLinkButton></div>
    </div>}
  </CockpitCard>;
}

export function DataTraceabilityPanel({ data, external, visible }) {
  if (!visible) return null;
  const failedSources = [...new Set([...(data?.traceability?.failed_sources || []), ...(external?.failed || [])])];
  return <details className="cockpit-trace"><summary>Dados considerados</summary><div className="cockpit-trace-grid">
    <div><span>Atualização</span><strong>{data?.updated_at ? new Date(data.updated_at).toLocaleString('pt-BR') : '—'}</strong></div>
    <div><span>Atividades</span><strong>{data?.traceability?.counts?.activities ?? '—'}</strong></div>
    <div><span>RDOs recentes</span><strong>{data?.traceability?.counts?.rdos ?? '—'}</strong></div>
    <div><span>RNCs</span><strong>{data?.traceability?.counts?.rncs ?? '—'}</strong></div>
    <div><span>Requisições</span><strong>{external?.procurement ?? '—'}</strong></div>
    <div><span>Ativos</span><strong>{external?.assets ?? '—'}</strong></div>
    <div><span>Fotos</span><strong>{external?.photos ?? '—'}</strong></div>
    <div className="wide"><span>Fontes</span><strong>{(data?.traceability?.sources || []).join(', ') || '—'}</strong></div>
    <div className="wide"><span>Fontes com falha</span><strong>{failedSources.join(', ') || 'Nenhuma'}</strong></div>
  </div></details>;
}

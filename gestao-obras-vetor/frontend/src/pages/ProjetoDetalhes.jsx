import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BarChart3, Boxes, ClipboardList, FileText, GitBranch, HardHat, LayoutDashboard, ShieldCheck, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import {
  getProjectCockpit, getCurvaS, obterDadosGantt, kanbanRequisicoes,
  getDashboardAlmoxarifado, getDashboardGaleriaRdos, getUploadUrl, listarReunioesHoje
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  CockpitError, CockpitHeader, CockpitSkeleton, CockpitTabs,
  DomainStatusStrip, KpiGrid
} from '../components/cockpit/CockpitPrimitives';
import {
  ActivityStatusCard, CriticalActivitiesCard, CurvaSCard, UpcomingActivitiesCard
} from '../components/cockpit/CockpitPlanning';
import {
  AssetsSummaryCard, AttentionPointsCard, DataTraceabilityPanel, EquipmentSummaryCard,
  PhotoAlbumCard, ProcurementSummaryCard, QualitySummaryCard, RecentExecutionCard,
  WorkforceSummaryCard
} from '../components/cockpit/CockpitOperations';
import {
  buildActivityView, buildAttentionPoints, buildDomainStatus, buildProcurementView,
  formatDate, projectDeadline
} from '../components/cockpit/cockpitTransforms';
import '../components/cockpit/Cockpit.css';
import '../components/cockpit/CockpitExtras.css';

const TAB_DEFINITIONS = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'planning', label: 'Planejamento', icon: BarChart3, permission: 'eap' },
  { id: 'operation', label: 'Operação', icon: HardHat, permission: 'rdo' },
  { id: 'quality', label: 'Qualidade e Suprimentos', icon: ShieldCheck, anyPermission: ['quality', 'procurement'] },
  { id: 'resources', label: 'Recursos', icon: Boxes, anyPermission: ['rdo', 'assets'] }
];
const TAB_COPY = {
  overview: ['Visão geral da obra', 'Resumo executivo dos indicadores que exigem decisão.'],
  planning: ['Planejamento', 'Avanço físico, caminho crítico e aderência ao cronograma.'],
  operation: ['Operação', 'Execução recente, mão de obra, equipamentos e registros de campo.'],
  quality: ['Qualidade e suprimentos', 'Pendências de qualidade e situação das aquisições da obra.'],
  resources: ['Recursos', 'Disponibilidade da equipe, equipamentos e ativos da obra.']
};
const COCKPIT_INTERNAL_SOURCES = new Set(['eap_meta', 'rdos', 'workforce', 'equipment', 'quality']);

function ProjetoDetalhes() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { perfil, usuario } = useAuth();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'overview');
  const [cockpit, setCockpit] = useState(null);
  const [curve, setCurve] = useState(null);
  const [gantt, setGantt] = useState(null);
  const [kanban, setKanban] = useState(null);
  const [assets, setAssets] = useState(null);
  const [photoAlbum, setPhotoAlbum] = useState(null);
  const [photoAlbumLoading, setPhotoAlbumLoading] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [sourceErrors, setSourceErrors] = useState([]);
  const [retryingSource, setRetryingSource] = useState('');
  const initialLoadProjectRef = useRef(null);
  const photoAlbumRequestRef = useRef(null);

  const loadAll = useCallback(async ({ initial = false } = {}) => {
    if (initial) { setLoading(true); setCockpit(null); } else setRefreshing(true);
    setFatalError('');
    setPhotoAlbum(null);
    try {
      const cockpitResponse = await getProjectCockpit(projetoId);
      const nextCockpit = cockpitResponse.data;
      setCockpit(nextCockpit);
      const jobs = [];
      if (nextCockpit.permissions?.curve_s) jobs.push(['curva-s', () => getCurvaS(projetoId)]);
      if (nextCockpit.permissions?.eap) jobs.push(['gantt-data', () => obterDadosGantt(projetoId, { mostrarCaminoCritico: true })]);
      if (nextCockpit.permissions?.procurement) jobs.push(['requisicoes-kanban', () => kanbanRequisicoes(projetoId, {})]);
      if (nextCockpit.permissions?.assets) jobs.push(['almoxarifado', () => getDashboardAlmoxarifado(projetoId)]);
      jobs.push(['reunioes-hoje', () => listarReunioesHoje({ projeto_id: projetoId })]);
      const results = await Promise.allSettled(jobs.map(([, job]) => job()));
      const failures = (nextCockpit.errors || []).map((item) => item.source);
      results.forEach((result, index) => {
        const source = jobs[index][0];
        if (result.status === 'rejected') {
          failures.push(source);
          if (source === 'curva-s') setCurve(null);
          if (source === 'gantt-data') setGantt(null);
          if (source === 'requisicoes-kanban') setKanban(null);
          if (source === 'almoxarifado') setAssets(null);
          if (source === 'reunioes-hoje') setMeetings([]);
          return;
        }
        if (source === 'curva-s') setCurve(result.value.data);
        if (source === 'gantt-data') setGantt(result.value.data);
        if (source === 'requisicoes-kanban') setKanban(result.value.data);
        if (source === 'almoxarifado') setAssets(result.value.data);
        if (source === 'reunioes-hoje') setMeetings(result.value.data || []);
      });
      if (!nextCockpit.permissions?.curve_s) setCurve(null);
      if (!nextCockpit.permissions?.eap) setGantt(null);
      if (!nextCockpit.permissions?.procurement) setKanban(null);
      if (!nextCockpit.permissions?.assets) setAssets(null);
      if (!nextCockpit.permissions?.rdo) setPhotoAlbum(null);
      setSourceErrors(failures);
    } catch (error) {
      setFatalError(error?.response?.data?.erro || 'Não foi possível carregar o Cockpit da Obra.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projetoId]);

  useEffect(() => {
    if (initialLoadProjectRef.current === projetoId) return;
    initialLoadProjectRef.current = projetoId;
    loadAll({ initial: true });
  }, [loadAll, projetoId]);

  const retrySource = useCallback(async (source) => {
    const jobs = {
      'curva-s': async () => setCurve((await getCurvaS(projetoId)).data),
      'gantt-data': async () => setGantt((await obterDadosGantt(projetoId, { mostrarCaminoCritico: true })).data),
      'requisicoes-kanban': async () => setKanban((await kanbanRequisicoes(projetoId, {})).data),
      almoxarifado: async () => setAssets((await getDashboardAlmoxarifado(projetoId)).data),
      'galeria-rdos': async () => setPhotoAlbum((await getDashboardGaleriaRdos(projetoId)).data),
      'reunioes-hoje': async () => setMeetings((await listarReunioesHoje({ projeto_id: projetoId })).data || [])
    };
    if (COCKPIT_INTERNAL_SOURCES.has(source)) {
      jobs[source] = async () => {
        const nextCockpit = (await getProjectCockpit(projetoId)).data;
        const remainingInternalErrors = (nextCockpit.errors || []).map((item) => item.source);
        setCockpit(nextCockpit);
        setSourceErrors((current) => [
          ...current.filter((item) => !COCKPIT_INTERNAL_SOURCES.has(item)),
          ...remainingInternalErrors
        ]);
        if (remainingInternalErrors.includes(source)) throw new Error(`Fonte ${source} ainda indisponível.`);
      };
    }
    if (!jobs[source]) return;
    setRetryingSource(source);
    try {
      await jobs[source]();
      setSourceErrors((current) => current.filter((item) => item !== source));
    } catch {
      setSourceErrors((current) => current.includes(source) ? current : [...current, source]);
    } finally {
      setRetryingSource('');
    }
  }, [projetoId]);

  const loadPhotoAlbum = useCallback(async () => {
    if (photoAlbumRequestRef.current === projetoId) return;
    const requestProjectId = projetoId;
    photoAlbumRequestRef.current = requestProjectId;
    setPhotoAlbumLoading(true);
    try {
      const album = (await getDashboardGaleriaRdos(requestProjectId)).data;
      if (photoAlbumRequestRef.current !== requestProjectId) return;
      setPhotoAlbum(album);
      setSourceErrors((current) => current.filter((item) => item !== 'galeria-rdos'));
    } catch {
      if (photoAlbumRequestRef.current !== requestProjectId) return;
      setPhotoAlbum(null);
      setSourceErrors((current) => current.includes('galeria-rdos') ? current : [...current, 'galeria-rdos']);
    } finally {
      if (photoAlbumRequestRef.current === requestProjectId) {
        photoAlbumRequestRef.current = null;
        setPhotoAlbumLoading(false);
      }
    }
  }, [projetoId]);

  const activityView = useMemo(() => buildActivityView(gantt), [gantt]);
  const projectCompleted = Boolean(activityView?.total)
    && activityView.counts.completed === activityView.total;
  const procurement = useMemo(() => buildProcurementView(kanban), [kanban]);
  const attention = useMemo(() => buildAttentionPoints({ cockpit, activities: activityView, procurement, assets, curve }), [cockpit, activityView, procurement, assets, curve]);
  const domains = useMemo(() => buildDomainStatus({ cockpit, procurement, assets, curve }), [cockpit, procurement, assets, curve]);
  const deadline = useMemo(
    () => projectDeadline(cockpit?.project, new Date(), projectCompleted),
    [cockpit?.project, projectCompleted]
  );
  const permissions = cockpit?.permissions || {};
  const tabs = useMemo(() => TAB_DEFINITIONS.filter((tab) => {
    if (tab.permission) return permissions[tab.permission];
    if (tab.anyPermission) return tab.anyPermission.some((permission) => permissions[permission]);
    return true;
  }), [permissions]);
  useEffect(() => {
    if (!loading && !tabs.some((tab) => tab.id === activeTab)) setActiveTab('overview');
  }, [activeTab, tabs, loading]);
  useEffect(() => {
    setActiveTab(searchParams.get('tab') || 'overview');
  }, [searchParams]);
  const changeTab = (tab) => {
    setActiveTab(tab);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === 'overview') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  };
  useEffect(() => {
    if (activeTab === 'operation' && permissions.rdo && photoAlbum === null && !photoAlbumLoading && !sourceErrors.includes('galeria-rdos')) {
      loadPhotoAlbum();
    }
  }, [activeTab, permissions.rdo, photoAlbum, photoAlbumLoading, sourceErrors, loadPhotoAlbum]);
  const canTrace = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'ADM'].includes(perfil);
  const meetingStorageKey = `vetor_reunioes_banner_${usuario?.id || 'u'}_${projetoId}_${new Date().toISOString().slice(0, 10)}`;
  const [meetingDismissed, setMeetingDismissed] = useState(() => localStorage.getItem(meetingStorageKey) === 'dismissed');
  const dismissMeetings = () => { localStorage.setItem(meetingStorageKey, 'dismissed'); setMeetingDismissed(true); };

  const cockpitNavigationState = {
    cockpitReturn: {
      to: `/projeto/${projetoId}?tab=${activeTab}`,
      tab: activeTab
    }
  };
  const openModule = (suffix) => navigate(`/projeto/${projetoId}/${suffix}`, { state: cockpitNavigationState });
  const openActivity = (item) => navigate(`/projeto/${projetoId}/eap/${item.id}`, { state: cockpitNavigationState });
  const curveIndicators = curve?.indicadores;
  const quickActions = [
    { label: 'Diário de obra', description: 'Registros e produção', icon: FileText, href: 'rdos', visible: permissions.rdo },
    { label: 'Cronograma', description: 'Prazos e atividades', icon: GitBranch, href: 'gantt', visible: permissions.eap },
    { label: 'Suprimentos', description: 'Compras e requisições', icon: ClipboardList, href: 'compras', visible: permissions.procurement },
    { label: 'Almoxarifado', description: 'Estoque e ferramentas', icon: Boxes, href: 'almoxarifado', visible: permissions.assets }
  ].filter((action) => action.visible);
  const summaryKpis = [
    { icon: GitBranch, visible: Boolean(permissions.eap), label: 'Atividades críticas', value: activityView?.counts.critical ?? '—', state: activityView?.counts.critical ? 'attention' : activityView ? 'ok' : 'neutral', reference: 'No caminho crítico', onClick: () => openModule('gantt') },
    { icon: ShieldCheck, visible: Boolean(permissions.quality), label: 'RNCs abertas', value: cockpit?.quality?.open ?? '—', state: !cockpit?.quality ? 'neutral' : cockpit.quality.critical_open ? 'critical' : cockpit.quality.open ? 'attention' : 'ok', reference: cockpit?.quality?.critical_open ? `${cockpit.quality.critical_open} crítica(s)` : 'Acompanhamento da qualidade', onClick: () => openModule('rnc') },
    { icon: ClipboardList, visible: Boolean(permissions.procurement), label: 'Requisições pendentes', value: procurement ? procurement.analysis + procurement.quotation + procurement.authorized : '—', state: procurement?.urgent?.length ? 'attention' : 'neutral', reference: procurement ? `${procurement.urgent.length} urgente(s)` : 'Sem dados de suprimentos', onClick: () => openModule('compras') },
    { icon: Users, visible: Boolean(permissions.rdo), label: 'Equipe em campo', value: cockpit?.workforce?.latest_effective ?? '—', unit: cockpit?.workforce?.latest_effective != null ? 'pessoas' : '', state: cockpit?.workforce?.latest_effective == null ? 'neutral' : 'ok', reference: cockpit?.execution?.latest_rdo_date ? `RDO de ${formatDate(cockpit.execution.latest_rdo_date)}` : 'Sem RDO', onClick: () => openModule('rdos') },
  ];

  if (loading) return <><Navbar /><main className="cockpit-shell"><div className="cockpit-container"><CockpitSkeleton /></div></main></>;
  if (fatalError || !cockpit) return <><Navbar /><main className="cockpit-shell"><div className="cockpit-container"><CockpitError message={fatalError} onRetry={() => loadAll({ initial: true })} /></div></main></>;

  return <><Navbar /><main className="cockpit-shell"><div className="cockpit-container">
    <nav className="cockpit-breadcrumb" aria-label="Navegação da obra"><button type="button" onClick={() => navigate('/projetos')}><ArrowLeft size={15} /> Obras</button><span>/</span><span>Visão da obra</span></nav>
    <CockpitHeader project={cockpit.project} updatedAt={cockpit.updated_at} refreshing={refreshing} onRefresh={() => loadAll()} deadline={deadline} indicators={curveIndicators} onOpenProgress={permissions.curve_s ? () => openModule('curva-s') : null} />
    {!meetingDismissed && meetings.length > 0 && <section className="cockpit-meeting-banner"><div><span>Agenda de hoje</span><strong>{meetings[0].assunto}</strong><small>{meetings.length > 1 ? `${meetings.length} reuniões programadas neste projeto` : 'Uma reunião programada neste projeto'}</small></div><div><button type="button" onClick={() => openModule(`mensagens?tab=agenda&reuniao=${meetings[0].id}`)}>Ver agenda</button><button type="button" className="ghost" onClick={dismissMeetings}>Dispensar</button></div></section>}
    <CockpitTabs value={activeTab} onChange={changeTab} tabs={tabs} />
    <div id="cockpit-panel" role="tabpanel" aria-labelledby={`cockpit-tab-${activeTab}`} tabIndex={0}>
    <header className="cockpit-view-heading"><div><h2>{TAB_COPY[activeTab]?.[0]}</h2><p>{TAB_COPY[activeTab]?.[1]}</p></div><span className="cockpit-period">{activeTab === 'overview' ? 'Panorama atual' : 'Acompanhamento da obra'}</span></header>
    {sourceErrors.length > 0 && <div className="cockpit-source-warning"><span>Algumas fontes não responderam. Os demais dados continuam disponíveis.</span><div>{sourceErrors.map((source) => <button type="button" key={source} onClick={() => retrySource(source)} disabled={Boolean(retryingSource)}>{retryingSource === source ? 'Tentando...' : `Tentar ${source}`}</button>)}</div></div>}

    {activeTab === 'overview' && <>
      <KpiGrid items={summaryKpis} />
      <div className={`cockpit-overview-grid ${permissions.curve_s ? '' : 'without-curve'}`}>
        {permissions.curve_s && <CurvaSCard data={curve} compact onOpen={() => openModule('curva-s')} />}
        <AttentionPointsCard items={attention} onOpen={openModule} />
      </div>
      <section className="cockpit-domain-section"><header><h2>Saúde da obra</h2><p>Situação de cada frente de trabalho</p></header><DomainStatusStrip items={domains.filter((domain) => domain.name !== 'Planejamento' || permissions.curve_s)} /></section>
      {quickActions.length > 0 && <section className="cockpit-shortcuts" aria-label="Acesso rápido"><header><h2>Acesso rápido</h2><p>Continue de onde precisa</p></header><div>{quickActions.map(({ icon: Icon, ...action }) => <button type="button" key={action.href} onClick={() => openModule(action.href)}><span className="cockpit-shortcut-icon"><Icon size={21} /></span><span><strong>{action.label}</strong><small>{action.description}</small></span><ArrowUpRight size={17} /></button>)}</div></section>}
    </>}

    {activeTab === 'planning' && permissions.eap && <div className="cockpit-planning-layout">
      <ActivityStatusCard view={activityView} />
      {permissions.curve_s && <CurvaSCard data={curve} onOpen={() => openModule('curva-s')} />}
      <div className="cockpit-planning-actions">
        <CriticalActivitiesCard view={activityView} onOpen={openActivity} onOpenAll={() => openModule('gantt')} />
        <UpcomingActivitiesCard view={activityView} onOpen={openActivity} />
      </div>
    </div>}

    {activeTab === 'operation' && permissions.rdo && <div className="cockpit-operation-layout">
      <RecentExecutionCard data={cockpit.execution} onOpen={openModule} />
      <div className="cockpit-operation-resources">
        <WorkforceSummaryCard data={cockpit.workforce} />
        <EquipmentSummaryCard data={cockpit.equipment} onOpen={openModule} />
      </div>
      <PhotoAlbumCard album={photoAlbum} getUrl={getUploadUrl} loading={photoAlbumLoading} onOpen={openModule} />
    </div>}

    {activeTab === 'quality' && <div className="cockpit-grid">
      {permissions.quality && <QualitySummaryCard data={cockpit.quality} onOpen={openModule} />}
      {permissions.procurement && <ProcurementSummaryCard data={procurement} onOpen={openModule} />}
    </div>}

    {activeTab === 'resources' && <div className="cockpit-grid">
      {permissions.rdo && <WorkforceSummaryCard data={cockpit.workforce} />}
      {permissions.rdo && <EquipmentSummaryCard data={cockpit.equipment} onOpen={openModule} />}
      {permissions.assets && <AssetsSummaryCard data={assets} onOpen={openModule} />}
    </div>}
    </div>

    <DataTraceabilityPanel data={cockpit} visible={canTrace} external={{ procurement: procurement?.total ?? null, assets: assets?.total_ferramentas ?? null, photos: photoAlbum?.total_fotos ?? null, failed: sourceErrors }} />
  </div></main></>;
}

export default ProjetoDetalhes;

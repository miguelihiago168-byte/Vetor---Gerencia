import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getProjeto, getRDOStats, getRDOs, getDashboardGaleriaRdos,
  getDashboardAlmoxarifado, getCurvaS, kanbanRequisicoes, getRNCs, getUploadUrl,
  listarReunioesHoje
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FileText, AlertTriangle, Image as ImageIcon, Activity,
  TrendingUp, ShoppingCart, Wrench, BarChart2, Calendar, List, Layers, Download,
  Building2, MapPin, CircleDot, CheckCircle2
} from 'lucide-react';
import { formatMoneyBR } from '../utils/currency';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import './ProjetoDetalhes.css';

const formatBRL = formatMoneyBR;
const MS_DIA = 1000 * 60 * 60 * 24;

const statusVariant = (cor) => ({
  verde: 'ok',
  amarelo: 'warn',
  vermelho: 'danger',
  cinza: 'muted'
}[cor] || 'muted');

function diasRelativo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const hoje = new Date();
  const diff = Math.floor((hoje - d) / MS_DIA);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff > 1) return `há ${diff} dias`;
  return null;
}

function horaRelativa(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const hoje = new Date();
  const diff = Math.floor((hoje - d) / MS_DIA);
  if (diff === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Ontem';
  if (diff <= 7) return `${diff}d atrás`;
  return d.toLocaleDateString('pt-BR');
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="project-section-title">
      <Icon size={14} />
      <span>{children}</span>
    </div>
  );
}

function ProjectCard({ icon: Icon, title, action, children, className = '' }) {
  return (
    <section className={`project-card ${className}`}>
      <header className="project-card-header">
        <span className="project-icon-box">
          <Icon size={18} />
        </span>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatusPill({ cor, label }) {
  const variant = statusVariant(cor);
  return (
    <div className={`project-status-pill status-${variant}`}>
      <span className="project-status-dot" />
      <span>{label}</span>
    </div>
  );
}

function MetricBox({ label, value, variant = 'neutral' }) {
  return (
    <div className={`project-metric-box metric-${variant}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DataRow({ label, value, variant = 'neutral' }) {
  return (
    <div className={`project-data-row data-${variant}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Notice({ variant = 'neutral', children }) {
  return <div className={`project-notice notice-${variant}`}>{children}</div>;
}

function QuickTile({ icon: Icon, title, description, onClick }) {
  return (
    <button type="button" className="project-quick-tile" onClick={onClick}>
      <span className="project-quick-icon"><Icon size={22} /></span>
      <span className="project-quick-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function ProjetoDetalhes() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [projeto, setProjeto] = useState(null);
  const [stats, setStats] = useState(null);
  const [almox, setAlmox] = useState(null);
  const [rdos, setRdos] = useState([]);
  const [galeria, setGaleria] = useState({ total_fotos: 0, rdos: [] });
  const [curvaS, setCurvaS] = useState(null);
  const [kanban, setKanban] = useState(null);
  const [rncs, setRncs] = useState([]);
  const [reunioesHoje, setReunioesHoje] = useState([]);
  const [bannerReunioesVisivel, setBannerReunioesVisivel] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [projetoId]);

  const carregarDados = async () => {
    try {
      const [projetoRes, statsRes] = await Promise.all([
        getProjeto(projetoId),
        getRDOStats(projetoId)
      ]);
      setProjeto(projetoRes.data);
      setStats(statsRes.data);

      const [almoxRes, curvaSRes, rncsRes, rdosRes, galeriaRes] = await Promise.allSettled([
        getDashboardAlmoxarifado(projetoId),
        getCurvaS(projetoId),
        getRNCs(projetoId),
        getRDOs(projetoId),
        getDashboardGaleriaRdos(projetoId)
      ]);

      if (almoxRes.status === 'fulfilled') setAlmox(almoxRes.value.data);
      if (curvaSRes.status === 'fulfilled') setCurvaS(curvaSRes.value.data);
      if (rncsRes.status === 'fulfilled') setRncs(rncsRes.value.data || []);

      const rdosList = rdosRes.status === 'fulfilled' ? (rdosRes.value.data || []) : [];
      setRdos(rdosList);

      try {
        const kanbanRes = await kanbanRequisicoes(projetoId, {});
        setKanban(kanbanRes.data);
      } catch {
        setKanban(null);
      }

      try {
        const reunioesRes = await listarReunioesHoje({ projeto_id: projetoId });
        const listaReunioes = reunioesRes.data || [];
        setReunioesHoje(listaReunioes);
        const hojeKey = new Date().toISOString().slice(0, 10);
        const storageKey = `vetor_reunioes_banner_${usuario?.id || 'u'}_${projetoId}_${hojeKey}`;
        setBannerReunioesVisivel(listaReunioes.length > 0 && localStorage.getItem(storageKey) !== 'dismissed');
      } catch {
        setReunioesHoje([]);
        setBannerReunioesVisivel(false);
      }

      if (galeriaRes.status === 'fulfilled') {
        setGaleria(galeriaRes.value.data || { total_fotos: 0, rdos: [] });
      } else {
        setGaleria({ total_fotos: 0, rdos: [] });
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="loading"><div className="spinner"></div></div>
      </>
    );
  }

  const toMidnight = (val) => {
    const str = String(val).trim();
    const norm = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00` : str.replace(' ', 'T');
    const d = new Date(norm);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazoTermino = projeto?.prazo_termino ? toMidnight(projeto.prazo_termino) : null;
  const criadoEm = projeto?.criado_em ? toMidnight(projeto.criado_em) : null;
  const diasRestantes = prazoTermino ? Math.round((prazoTermino - hoje) / MS_DIA) : null;
  const prazoTotal = (prazoTermino && criadoEm) ? Math.round((prazoTermino - criadoEm) / MS_DIA) : null;
  const prazoConsumidoPct = (prazoTotal && prazoTotal > 0)
    ? Math.min(100, Math.max(0, Math.round(((hoje - criadoEm) / MS_DIA) / prazoTotal * 100)))
    : null;
  const prazoConsumidoVisualPct = prazoConsumidoPct > 0 ? Math.max(prazoConsumidoPct, 2) : 0;
  const prazoStatus = diasRestantes === null ? 'cinza'
    : diasRestantes > 30 ? 'verde'
    : diasRestantes > 0 ? 'amarelo'
    : 'vermelho';

  const rdosOrdenados = [...rdos].sort((a, b) => new Date(b.data_relatorio) - new Date(a.data_relatorio));
  const ultimoRdo = rdosOrdenados[0] || null;
  const diasSemRdo = ultimoRdo
    ? Math.floor((hoje - new Date(`${ultimoRdo.data_relatorio}T00:00:00`)) / MS_DIA)
    : null;

  const rncsAbertas = rncs.filter(r => r.status !== 'Encerrada').length;
  const ativosProblema = (almox?.ferramentas_atrasadas || 0) + (almox?.ferramentas_manutencao || 0);
  const proximaReuniaoHoje = reunioesHoje[0] || null;
  const formatHoraReuniao = (value) => {
    const date = new Date(String(value || '').replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '--:--' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const dispensarBannerReunioes = () => {
    const hojeKey = new Date().toISOString().slice(0, 10);
    const storageKey = `vetor_reunioes_banner_${usuario?.id || 'u'}_${projetoId}_${hojeKey}`;
    localStorage.setItem(storageKey, 'dismissed');
    setBannerReunioesVisivel(false);
  };

  const getKanbanColumnCount = (col) => {
    if (!col) return 0;
    if (Array.isArray(col.requisicoes)) return col.requisicoes.length;
    if (Array.isArray(col.itens)) return col.itens.length;
    return Number(col.count || 0);
  };

  let comprasSolicitadas = 0;
  let comprasEmCotacao = 0;
  let comprasLiberadas = 0;
  let comprasCompradas = 0;
  if (kanban && Array.isArray(kanban)) {
    kanban.forEach(col => {
      const count = getKanbanColumnCount(col);
      if (col.id === 'solicitado') comprasSolicitadas += count;
      if (col.id === 'em_cotacao') comprasEmCotacao += count;
      if (col.id === 'cot_recebidas' || col.id === 'cot_recebida' || col.id === 'liberado' || col.id === 'ag_aprovacao' || col.id === 'ag_decisao') comprasLiberadas += count;
      if (col.id === 'comprado') comprasCompradas += count;
    });
  }

  const comprasStatus = kanban === null ? 'cinza'
    : (comprasSolicitadas + comprasEmCotacao + comprasLiberadas) > 0 ? 'amarelo' : 'verde';
  const qualidadeStatus = rncsAbertas === 0 ? 'verde'
    : rncsAbertas <= 2 ? 'amarelo' : 'vermelho';
  const ativosStatus = ativosProblema === 0 ? 'verde' : 'amarelo';

  const curvaSDesvio = curvaS?.indicadores?.desvio || 0;
  const curvaSStatus = curvaS?.indicadores?.spi_status || 'cinza';
  const curvaSerie = curvaS?.serie ? curvaS.serie.slice(-15) : [];
  const curvaSPlanejado = Math.round(curvaS?.indicadores?.avanco_planejado || 0);
  const curvaSReal = Math.round(curvaS?.indicadores?.avanco_real || 0);

  const formatNumeroRdo = (rdo) => {
    const raw = rdo?.numero_rdo ?? rdo?.id ?? rdo?.rdo_id;
    const match = String(raw || '').match(/(\d+)$/);
    const numero = match ? Number(match[1]) : Number(raw || 0);
    return `RDO-${String(numero || rdo?.id || rdo?.rdo_id).padStart(3, '0')}`;
  };

  const getFotoUrl = (foto) => getUploadUrl(foto.caminho_arquivo);
  const getFotoDownloadName = (foto) => foto.nome_arquivo || foto.caminho_arquivo?.split(/[\\/]/).pop() || 'foto-rdo';
  const getFotoAtividadeLabel = (foto) => (
    foto.atividade_descricao
      ? `${foto.atividade_codigo ? `${foto.atividade_codigo} - ` : ''}${foto.atividade_descricao}`
      : (foto.atividade_avulsa_descricao ? `Avulsa - ${foto.atividade_avulsa_descricao}` : 'Sem atividade')
  );

  const feedItems = [];
  if (ultimoRdo) {
    feedItems.push({
      icon: FileText,
      texto: `${formatNumeroRdo(ultimoRdo)} criado`,
      data: ultimoRdo.criado_em || `${ultimoRdo.data_relatorio}T12:00:00`,
      variant: 'info',
    });
  }
  if (kanban && Array.isArray(kanban)) {
    const comprados = kanban.find(c => c.id === 'comprado');
    const itemComprado = (comprados?.requisicoes || comprados?.itens || []).slice(-1)[0];
    if (itemComprado) {
      feedItems.push({
        icon: CheckCircle2,
      texto: `Compra concluída: ${itemComprado.descricao_item || 'item'}`,
        data: itemComprado.atualizado_em || itemComprado.criado_em,
        variant: 'ok',
      });
    }
  }
  const rncMaisRecente = [...rncs].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0];
  if (rncMaisRecente) {
    feedItems.push({
      icon: AlertTriangle,
      texto: `RNC aberta: ${rncMaisRecente.titulo || 'sem título'}`,
      data: rncMaisRecente.criado_em,
      variant: 'warn',
    });
  }

  const tooltipStyle = {
    border: '1px solid var(--project-border)',
    borderRadius: 8,
    color: 'var(--project-text)',
    background: 'var(--project-surface)',
    fontSize: 12,
    boxShadow: '0 10px 22px rgba(16, 21, 31, 0.10)'
  };

  return (
    <>
      <Navbar />
      <main className="project-dashboard-shell">
        <div className="project-dashboard-container">
          <section className="project-hero-card">
            <div className="project-hero-grid" aria-hidden="true" />
            <div className="project-hero-copy">
              <span className="project-eyebrow">Painel do Projeto</span>
              <h1>{projeto?.nome}</h1>
              <div className="project-meta-list">
                {projeto?.empresa_responsavel && (
                  <span><Building2 size={15} /> {projeto.empresa_responsavel}</span>
                )}
                {projeto?.empresa_executante && (
                  <span><Activity size={15} /> {projeto.empresa_executante}</span>
                )}
                {projeto?.cidade && (
                  <span><MapPin size={15} /> {projeto.cidade}</span>
                )}
              </div>
            </div>

            {diasRestantes !== null && (
              <div className={`project-deadline-panel status-${statusVariant(prazoStatus)}`}>
                <span>Prazo</span>
                <strong>{diasRestantes >= 0 ? diasRestantes : 0}</strong>
                <small>dias restantes</small>
                {diasRestantes < 0 && <em>Vencido</em>}
              </div>
            )}
          </section>

          {bannerReunioesVisivel && proximaReuniaoHoje && (
            <section className="project-meeting-banner">
              <div className="project-meeting-banner-main">
                <span className="project-meeting-kicker">Agenda de hoje</span>
                <strong>{formatHoraReuniao(proximaReuniaoHoje.inicio_em)} - {proximaReuniaoHoje.assunto}</strong>
                <small>
                  {reunioesHoje.length > 1
                    ? `${reunioesHoje.length} reuniões hoje: ${reunioesHoje.map((r) => formatHoraReuniao(r.inicio_em)).join(', ')}`
                    : 'Você tem uma reunião marcada neste projeto.'}
                </small>
              </div>
              <div className="project-meeting-banner-actions">
                <button type="button" onClick={() => navigate(`/projeto/${projetoId}/mensagens?tab=agenda&reuniao=${proximaReuniaoHoje.id}`)}>
                  Ver agenda
                </button>
                <button type="button" className="ghost" onClick={dispensarBannerReunioes}>
                  Dispensar
                </button>
              </div>
            </section>
          )}

          <SectionTitle icon={Activity}>Status da obra</SectionTitle>
          <div className="project-dashboard-grid grid-2">
            <ProjectCard icon={Calendar} title="Prazo da Obra">
              {prazoConsumidoPct !== null ? (
                <>
                  <div className="project-date-row">
                    <span>Início: {criadoEm ? criadoEm.toLocaleDateString('pt-BR') : '-'}</span>
                    <span>Término: {prazoTermino ? prazoTermino.toLocaleDateString('pt-BR') : '-'}</span>
                  </div>
                  <div className="project-progress-track">
                    <div
                      className={`project-progress-fill status-${statusVariant(prazoStatus)}`}
                      style={{ width: `${prazoConsumidoVisualPct}%` }}
                    />
                  </div>
                  <div className="project-progress-meta">
                    <strong>{prazoConsumidoPct}% do prazo consumido</strong>
                    <span>{prazoTotal}d total</span>
                  </div>
                  <Notice variant={statusVariant(prazoStatus)}>
                    {diasRestantes > 0
                      ? `Restam ${diasRestantes} dias para o término`
                      : `Prazo vencido há ${Math.abs(diasRestantes)} dias`}
                  </Notice>
                </>
              ) : (
                <div className="project-empty-inline">Prazo não informado</div>
              )}
            </ProjectCard>

            <ProjectCard icon={CircleDot} title="Saúde da Obra">
              <div className="project-status-grid">
                <StatusPill cor={prazoStatus} label="Prazo" />
                <StatusPill cor={comprasStatus} label="Compras" />
                <StatusPill cor={qualidadeStatus} label="Qualidade" />
                <StatusPill cor={ativosStatus} label="Ativos" />
              </div>
              <div className="project-status-legend">
                <span><i className="legend-ok" /> Ok</span>
                <span><i className="legend-warn" /> Atenção</span>
                <span><i className="legend-danger" /> Crítico</span>
              </div>
            </ProjectCard>
          </div>

          <SectionTitle icon={TrendingUp}>Progresso</SectionTitle>
          <div className="project-dashboard-grid grid-2">
            <ProjectCard icon={FileText} title="Relatórios Diários (RDO)">
              {stats ? (
                <>
                  <div className="project-metric-grid grid-3">
                    <MetricBox label="Total" value={stats.total_rdos || 0} variant="neutral" />
                    <MetricBox label="Aprovados" value={stats.aprovados || 0} variant="ok" />
                    <MetricBox label="Em análise" value={stats.em_analise || 0} variant="info" />
                  </div>
                  {stats.em_preenchimento > 0 && (
                    <Notice variant="warn">{stats.em_preenchimento} em preenchimento</Notice>
                  )}
                  <div className="project-card-divider">
                    {ultimoRdo ? (
                      <>
                        <p className="project-subtle-line">
                          Último RDO: <strong>{new Date(`${ultimoRdo.data_relatorio}T12:00:00`).toLocaleDateString('pt-BR')}</strong>
                          {diasSemRdo !== null && <span> ({diasRelativo(`${ultimoRdo.data_relatorio}T12:00:00`)})</span>}
                        </p>
                        {diasSemRdo !== null && diasSemRdo >= 3 && (
                          <Notice variant="danger">
                            A obra está há <strong>{diasSemRdo} dias</strong> sem registro de atividade
                          </Notice>
                        )}
                      </>
                    ) : (
                      <div className="project-empty-inline">Nenhum RDO registrado ainda.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="project-empty-inline">Indicadores de RDO indisponíveis.</div>
              )}
            </ProjectCard>

            <ProjectCard
              icon={TrendingUp}
              title="Curva S - Progresso"
              action={curvaS && (
                <span className={`project-chip status-${statusVariant(curvaSStatus)}`}>
                  SPI {curvaS.indicadores?.spi?.toFixed(2) || '-'}
                </span>
              )}
            >
              {!curvaS ? (
                <div className="project-empty-chart">
                  <BarChart2 size={34} />
                  <span>EAP não configurada</span>
                </div>
              ) : curvaSerie.length === 0 ? (
                <div className="project-empty-chart">
                  <BarChart2 size={34} />
                  <span>Sem dados de progresso ainda</span>
                </div>
              ) : (
                <>
                  <div className="project-metric-grid grid-2">
                    <MetricBox label="Planejado" value={`${curvaSPlanejado}%`} variant="info" />
                    <MetricBox label="Executado" value={`${curvaSReal}%`} variant="ok" />
                  </div>
                  <div className="project-chart-frame">
                    <ResponsiveContainer width="100%" height={118}>
                      <LineChart data={curvaSerie} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--project-chart-grid)" />
                        <XAxis dataKey="data" tick={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--project-muted)' }} domain={[0, 100]} />
                        <Tooltip
                          formatter={(val, name) => [`${Math.round(val)}%`, name === 'planejado' ? 'Planejado' : 'Executado']}
                          labelFormatter={() => ''}
                          contentStyle={tooltipStyle}
                        />
                        <Line type="monotone" dataKey="planejado" stroke="var(--project-accent)" strokeWidth={2} dot={false} name="planejado" />
                        <Line type="monotone" dataKey="real" stroke="var(--project-ok)" strokeWidth={2} dot={false} name="real" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {curvaSDesvio < -3 && (
                    <Notice variant="danger">Obra {Math.abs(Math.round(curvaSDesvio))}% atrás do planejado</Notice>
                  )}
                </>
              )}
            </ProjectCard>
          </div>

          <SectionTitle icon={List}>Operação</SectionTitle>
          <div className={`project-dashboard-grid ${kanban !== null ? 'grid-3' : 'grid-2'}`}>
            {kanban !== null && (
              <ProjectCard icon={ShoppingCart} title="Compras">
                <div className="project-data-stack">
                  <DataRow label="Solicitado" value={comprasSolicitadas} variant="warn" />
                  <DataRow label="Em cotação" value={comprasEmCotacao} variant="warn" />
                  <DataRow label="Ag. liberação/compra" value={comprasLiberadas} variant="info" />
                  <DataRow label="Comprado" value={comprasCompradas} variant="ok" />
                </div>
                {comprasSolicitadas > 0 && (
                  <Notice variant="warn">
                    {comprasSolicitadas} {comprasSolicitadas === 1 ? 'solicitação aguardando análise' : 'solicitações aguardando análise'}
                  </Notice>
                )}
                {comprasLiberadas > 0 && (
                  <Notice variant="warn">
                    {comprasLiberadas} {comprasLiberadas === 1 ? 'item aguardando' : 'itens aguardando'} compra
                  </Notice>
                )}
                {comprasSolicitadas === 0 && comprasEmCotacao === 0 && comprasLiberadas === 0 && comprasCompradas === 0 && (
                  <div className="project-empty-inline">Nenhuma requisição ativa.</div>
                )}
              </ProjectCard>
            )}

            <ProjectCard icon={Wrench} title="Ativos">
              <div className="project-data-stack">
                <DataRow label="Alocados" value={almox?.ferramentas_alocadas || 0} variant="info" />
                <DataRow label="Em manutenção" value={almox?.ferramentas_manutencao || 0} variant="warn" />
                <DataRow label="Atrasados" value={almox?.ferramentas_atrasadas || 0} variant="danger" />
              </div>
              {almox?.total_perdas > 0 && (
                <Notice variant="danger">
                  {almox.total_perdas} perda(s) - R$ {formatBRL(almox.custo_perdas)}
                </Notice>
              )}
              {ativosProblema > 0 && (
                <Notice variant="warn">
                  {ativosProblema} {ativosProblema === 1 ? 'ativo em atenção' : 'ativos em atenção'}
                </Notice>
              )}
            </ProjectCard>

            <ProjectCard icon={List} title="Atividade Recente">
              {feedItems.length === 0 ? (
                <div className="project-empty-inline">Nenhuma atividade registrada.</div>
              ) : (
                <div className="project-feed">
                  {feedItems.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <div className={`project-feed-item feed-${item.variant}`} key={`${item.texto}-${idx}`}>
                        <span className="project-feed-dot" />
                        <div>
                          <strong>{item.texto}</strong>
                          {item.data && <small>{horaRelativa(item.data)}</small>}
                        </div>
                        <Icon size={16} />
                      </div>
                    );
                  })}
                </div>
              )}
            </ProjectCard>
          </div>

          <SectionTitle icon={Layers}>Acesso rápido</SectionTitle>
          <div className="project-quick-grid">
            <QuickTile
              icon={Activity}
              title="Ativos"
              description={`Alocados: ${almox?.ferramentas_alocadas || 0} - Manutenção: ${almox?.ferramentas_manutencao || 0}`}
              onClick={() => navigate(`/projeto/${projetoId}/almoxarifado`)}
            />
            <QuickTile
              icon={Layers}
              title="Gerenciar EAP"
              description="Estrutura Analítica do Projeto"
              onClick={() => navigate(`/projeto/${projetoId}/eap`)}
            />
            <QuickTile
              icon={FileText}
              title="Lista de RDOs"
              description="Relatórios Diários de Obra"
              onClick={() => navigate(`/projeto/${projetoId}/rdos`)}
            />
            <QuickTile
              icon={AlertTriangle}
              title="RNC"
              description={`Relatórios de Não Conformidade${rncsAbertas > 0 ? ` - ${rncsAbertas} aberta(s)` : ''}`}
              onClick={() => navigate(`/projeto/${projetoId}/rnc`)}
            />
          </div>

          <SectionTitle icon={ImageIcon}>Galeria de fotos</SectionTitle>
          <section className="project-card project-photo-gallery-card">
            {(galeria.rdos || []).length === 0 ? (
              <div className="project-photo-gallery-empty">
                <ImageIcon size={36} />
                Nenhuma foto enviada nos RDOs deste projeto.
              </div>
            ) : (
              <>
                {(galeria.rdos || []).map((grupo) => (
                  <div key={grupo.rdo_id} className="project-photo-group">
                    <div className="project-photo-group-header">
                      <strong>{formatNumeroRdo(grupo)}</strong>
                      <span>{grupo.data_relatorio ? new Date(`${grupo.data_relatorio}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem data'}</span>
                      <span>{grupo.status || 'Sem status'}</span>
                      <span>{grupo.total_fotos || 0} foto(s)</span>
                    </div>
                    <div className="project-photo-grid">
                      {(grupo.fotos || []).map((item) => (
                        <article key={`${grupo.rdo_id}-${item.id}`} className="project-photo-card">
                          <a className="project-photo-thumb" href={getFotoUrl(item)} target="_blank" rel="noopener noreferrer" title="Abrir foto">
                            <img src={getFotoUrl(item)} alt={item.nome_arquivo || 'foto'} />
                          </a>
                          <div className="project-photo-name" title={item.descricao || item.nome_arquivo}>
                            {item.descricao || item.nome_arquivo}
                          </div>
                          <div className="project-photo-activity" title={getFotoAtividadeLabel(item)}>
                            {item.atividade_descricao ? `${item.atividade_codigo ? `${item.atividade_codigo} - ` : ''}${item.atividade_descricao}` : (item.atividade_avulsa_descricao ? `Avulsa - ${item.atividade_avulsa_descricao}` : 'Sem atividade')}
                          </div>
                          <a
                            className="project-photo-download"
                            href={getFotoUrl(item)}
                            download={getFotoDownloadName(item)}
                            title="Baixar foto"
                            aria-label={`Baixar ${getFotoDownloadName(item)}`}
                          >
                            <Download size={15} />
                          </a>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
                {Number(galeria.total_fotos || 0) > 0 && (
                  <div className="project-photo-total">
                    Total de {galeria.total_fotos} foto(s) distribuídas por RDO.
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

export default ProjetoDetalhes;

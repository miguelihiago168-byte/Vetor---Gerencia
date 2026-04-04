import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getProjeto, getRDOStats, getRDOs, getDashboardGaleriaRdos,
  getDashboardAlmoxarifado, getCurvaS, kanbanRequisicoes, getRNCs
} from '../services/api';
import {
  FileText, AlertTriangle, Image as ImageIcon, Activity,
  TrendingUp, ShoppingCart, Wrench, BarChart2, Calendar, List, Layers
} from 'lucide-react';
import { formatMoneyBR } from '../utils/currency';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const formatBRL = formatMoneyBR;
const MS_DIA = 1000 * 60 * 60 * 24;

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

function SemaforoPill({ cor, label, icone }) {
  const colors = {
    verde:    { bg: '#e6f9ee', text: '#1a7a40', border: '#4CAF50' },
    amarelo:  { bg: '#fff8e1', text: '#7a5c00', border: '#FF9800' },
    vermelho: { bg: '#fdecea', text: '#7a1a1a', border: '#f44336' },
    cinza:    { bg: '#f5f5f5', text: '#666',    border: '#ccc' },
  };
  const c = colors[cor] || colors.cinza;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 12px', borderRadius: '8px',
      background: c.bg, border: `1.5px solid ${c.border}`,
    }}>
      <span style={{ fontSize: '16px' }}>{icone}</span>
      <span style={{ fontSize: '12px', color: c.text, fontWeight: 600 }}>{label}</span>
      <div style={{
        marginLeft: 'auto', width: '10px', height: '10px', borderRadius: '50%',
        background: c.border, boxShadow: `0 0 6px ${c.border}`
      }} />
    </div>
  );
}

function ProjetoDetalhes() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [projeto, setProjeto] = useState(null);
  const [stats, setStats] = useState(null);
  const [almox, setAlmox] = useState(null);
  const [rdos, setRdos] = useState([]);
  const [galeria, setGaleria] = useState({ total_fotos: 0, rdos: [] });
  const [curvaS, setCurvaS] = useState(null);
  const [kanban, setKanban] = useState(null);
  const [rncs, setRncs] = useState([]);
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
      if (rncsRes.status  === 'fulfilled') setRncs(rncsRes.value.data || []);

      const rdosList = rdosRes.status === 'fulfilled' ? (rdosRes.value.data || []) : [];
      setRdos(rdosList);

      // Kanban pode retornar 403 se sem permissão → fica null silenciosamente
      try {
        const kanbanRes = await kanbanRequisicoes(projetoId, {});
        setKanban(kanbanRes.data);
      } catch {
        setKanban(null);
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

  // ── Cálculos derivados ────────────────────────────────────────────────────

  // Normaliza para meia-noite local para contagem por dia-calendário (00:00 → 00:00)
  const toMidnight = (val) => { const str = String(val).trim(); const norm = /^\d{4}-\d{2}-\d{2}$/.test(str) ? str + 'T00:00:00' : str.replace(' ', 'T'); const d = new Date(norm); d.setHours(0, 0, 0, 0); return d; };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const prazoTermino = projeto?.prazo_termino ? toMidnight(projeto.prazo_termino) : null;
  const criadoEm     = projeto?.criado_em     ? toMidnight(projeto.criado_em)     : null;
  const diasRestantes = prazoTermino ? Math.round((prazoTermino - hoje) / MS_DIA) : null;
  const prazoTotal    = (prazoTermino && criadoEm) ? Math.round((prazoTermino - criadoEm) / MS_DIA) : null;
  const prazoConsumidoPct = (prazoTotal && prazoTotal > 0)
    ? Math.min(100, Math.max(0, Math.round(((hoje - criadoEm) / MS_DIA) / prazoTotal * 100)))
    : null;
  const prazoStatus = diasRestantes === null ? 'cinza'
    : diasRestantes > 30 ? 'verde'
    : diasRestantes > 0  ? 'amarelo'
    : 'vermelho';

  // RDO insights
  const rdosOrdenados = [...rdos].sort((a, b) => new Date(b.data_relatorio) - new Date(a.data_relatorio));
  const ultimoRdo = rdosOrdenados[0] || null;
  const diasSemRdo = ultimoRdo
    ? Math.floor((hoje - new Date(ultimoRdo.data_relatorio + 'T00:00:00')) / MS_DIA)
    : null;

  // RNC insights
  const rncsAbertas = rncs.filter(r => r.status !== 'Encerrada').length;

  // Ativos insights
  const ativosProblema = (almox?.ferramentas_atrasadas || 0) + (almox?.ferramentas_manutencao || 0);

  // Compras insights
  let comprasEmCotacao = 0, comprasLiberadas = 0, comprasCompradas = 0;
  if (kanban && Array.isArray(kanban)) {
    kanban.forEach(col => {
      if (col.id === 'em_cotacao' || col.id === 'cot_recebida') comprasEmCotacao += (col.itens || []).length;
      if (col.id === 'liberado'   || col.id === 'ag_decisao')   comprasLiberadas  += (col.itens || []).length;
      if (col.id === 'comprado')                                 comprasCompradas  += (col.itens || []).length;
    });
  }

  // Semáforos
  const comprasStatus  = kanban === null     ? 'cinza'
    : comprasLiberadas > 0 ? 'amarelo' : 'verde';
  const qualidadeStatus = rncsAbertas === 0  ? 'verde'
    : rncsAbertas <= 2    ? 'amarelo'  : 'vermelho';
  const ativosStatus    = ativosProblema === 0 ? 'verde' : 'amarelo';

  // Curva S
  const curvaSDesvio    = curvaS?.indicadores?.desvio        || 0;
  const curvaSStatus    = curvaS?.indicadores?.spi_status    || 'cinza';
  const curvaSerie      = curvaS?.serie ? curvaS.serie.slice(-15) : [];
  const curvaSPlanejado = Math.round(curvaS?.indicadores?.avanco_planejado || 0);
  const curvaSReal      = Math.round(curvaS?.indicadores?.avanco_real      || 0);

  // Feed de atividade recente
  const feedItems = [];
  if (ultimoRdo) {
    feedItems.push({
      icone: '📋',
      texto: `RDO ${ultimoRdo.numero_rdo || '#' + ultimoRdo.id} criado`,
      data:  ultimoRdo.criado_em || (ultimoRdo.data_relatorio + 'T12:00:00'),
      cor:   '#2196F3',
    });
  }
  if (kanban && Array.isArray(kanban)) {
    const comprados    = kanban.find(c => c.id === 'comprado');
    const itemComprado = (comprados?.itens || []).slice(-1)[0];
    if (itemComprado) {
      feedItems.push({
        icone: '🛒',
        texto: `Compra concluída: ${itemComprado.descricao_item || 'item'}`,
        data:  itemComprado.atualizado_em || itemComprado.criado_em,
        cor:   '#4CAF50',
      });
    }
  }
  const rncMaisRecente = [...rncs].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0];
  if (rncMaisRecente) {
    feedItems.push({
      icone: '⚠️',
      texto: `RNC aberta: ${rncMaisRecente.titulo || 'sem título'}`,
      data:  rncMaisRecente.criado_em,
      cor:   '#FF9800',
    });
  }

  // ── Estilos base ─────────────────────────────────────────────────────────
  const cardBase = {
    background: 'var(--card-bg)',
    borderRadius: '12px',
    padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: '1px solid var(--border-default)',
  };

  const sectionLabel = {
    fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
    marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px',
  };

  const actionCard = {
    ...cardBase,
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  };

  const iconBox = (gradient) => ({
    width: '36px', height: '36px', borderRadius: '9px',
    background: gradient, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0,
  });

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 48px' }}>

        {/* ── CABEÇALHO ──────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, var(--project-panel-bg-start) 0%, var(--project-panel-bg-end) 100%)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: 'var(--text-primary)',
          marginBottom: '28px',
          boxShadow: 'var(--shadow-soft)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Painel do Projeto
              </div>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700 }}>{projeto?.nome}</h1>
              <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--gray-500)', display: 'flex', gap: '18px', flexWrap: 'wrap', fontWeight: 600 }}>
                <span>🏢 {projeto?.empresa_responsavel}</span>
                <span>🏗️ {projeto?.empresa_executante}</span>
                <span>📍 {projeto?.cidade}</span>
              </div>
            </div>
            {diasRestantes !== null && (
              <div style={{
                background: diasRestantes < 0
                  ? 'var(--badge-red-bg)'
                  : diasRestantes <= 30
                    ? 'var(--badge-yellow-bg)'
                    : 'var(--badge-blue-bg)',
                border: diasRestantes < 0
                  ? '1px solid var(--badge-red-color)'
                  : diasRestantes <= 30
                    ? '1px solid var(--badge-yellow-color)'
                    : '1px solid var(--badge-blue-color)',
                borderRadius: '12px',
                padding: '12px 18px',
                textAlign: 'center',
                minWidth: '120px',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Prazo</div>
                <div style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  lineHeight: 1,
                  color: diasRestantes < 0
                    ? 'var(--badge-red-color)'
                    : diasRestantes <= 30
                      ? 'var(--badge-yellow-color)'
                      : 'var(--badge-blue-color)'
                }}>
                  {diasRestantes >= 0 ? diasRestantes : 0}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)', fontWeight: 600 }}>dias restantes</div>
                {diasRestantes < 0 && (
                  <div style={{ fontSize: '11px', background: 'var(--badge-red-color)', color: 'white', borderRadius: '4px', padding: '2px 6px', marginTop: '6px', fontWeight: 700 }}>
                    VENCIDO
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            BLOCO 1 — STATUS DA OBRA
        ══════════════════════════════════════════════════════════════════ */}
        <div style={sectionLabel}><span>🏗️</span> STATUS DA OBRA</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>

          {/* Prazo da Obra */}
          <div style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={iconBox('linear-gradient(135deg,#3b82f6,#1e40af)')}><Calendar size={18} color="white" /></div>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Prazo da Obra</span>
            </div>
            {prazoConsumidoPct !== null ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                  <span>Início: {criadoEm ? criadoEm.toLocaleDateString('pt-BR') : '—'}</span>
                  <span>Término: {prazoTermino ? prazoTermino.toLocaleDateString('pt-BR') : '—'}</span>
                </div>
                <div style={{ background: 'var(--gray-100)', borderRadius: '999px', height: '12px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{
                    width: `${prazoConsumidoPct}%`, height: '100%', borderRadius: '999px',
                    background: prazoStatus === 'verde' ? '#22c55e' : prazoStatus === 'amarelo' ? '#f59e0b' : '#ef4444',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569' }}>
                  <span style={{ fontWeight: 600, color: prazoStatus === 'verde' ? '#15803d' : prazoStatus === 'amarelo' ? '#92400e' : '#b91c1c' }}>
                    {prazoConsumidoPct}% do prazo consumido
                  </span>
                  <span style={{ color: '#94a3b8' }}>{prazoTotal}d total</span>
                </div>
                <div style={{
                  marginTop: '14px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: prazoStatus === 'verde' ? '#f0fdf4' : prazoStatus === 'amarelo' ? '#fffbeb' : '#fef2f2',
                  color: prazoStatus === 'verde' ? '#15803d' : prazoStatus === 'amarelo' ? '#92400e' : '#b91c1c',
                }}>
                  {diasRestantes > 0
                    ? `✅ Restam ${diasRestantes} dias para o término`
                    : `🔴 Prazo vencido há ${Math.abs(diasRestantes)} dias`}
                </div>
              </>
            ) : (
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Prazo não informado</div>
            )}
          </div>

          {/* Saúde da Obra */}
          <div style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={iconBox('linear-gradient(135deg,#6366f1,#8b5cf6)')}><Activity size={18} color="white" /></div>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Saúde da Obra</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <SemaforoPill cor={prazoStatus}    label="Prazo"     icone="📅" />
              <SemaforoPill cor={comprasStatus}  label="Compras"   icone="🛒" />
              <SemaforoPill cor={qualidadeStatus} label="Qualidade" icone="✅" />
              <SemaforoPill cor={ativosStatus}   label="Ativos"    icone="🔧" />
            </div>
            <div style={{ marginTop: '14px', fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '14px', justifyContent: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--badge-green-color)', display: 'inline-block' }} /> Ok
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--badge-yellow-color)', display: 'inline-block' }} /> Atenção
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--badge-red-color)', display: 'inline-block' }} /> Crítico
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            BLOCO 2 — PROGRESSO
        ══════════════════════════════════════════════════════════════════ */}
        <div style={sectionLabel}><span>📈</span> PROGRESSO</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>

          {/* RDOs */}
          <div style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={iconBox('linear-gradient(135deg,#f093fb,#f5576c)')}><FileText size={18} color="white" /></div>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Relatórios Diários (RDO)</span>
            </div>
            {stats && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '14px' }}>
                  {[
                    { label: 'Total',       value: stats.total_rdos      || 0, cor: '#6366f1', bg: '#f0f0fe' },
                    { label: '🟢 Aprovados', value: stats.aprovados       || 0, cor: '#15803d', bg: '#f0fdf4' },
                    { label: '🔵 Em análise', value: stats.em_analise     || 0, cor: '#1d4ed8', bg: '#eff6ff' },
                  ].map(m => (
                    <div key={m.label} style={{ background: m.bg, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: m.cor }}>{m.value}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                {stats.em_preenchimento > 0 && (
                  <div style={{ fontSize: '12px', color: '#92400e', background: '#fffbeb', padding: '7px 10px', borderRadius: '6px', marginBottom: '12px' }}>
                    🟡 {stats.em_preenchimento} em preenchimento
                  </div>
                )}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  {ultimoRdo ? (
                    <>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Último RDO:{' '}
                        <strong style={{ color: '#334155' }}>
                          {new Date(ultimoRdo.data_relatorio + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </strong>
                        {diasSemRdo !== null && (
                          <span style={{ color: '#94a3b8' }}> ({diasRelativo(ultimoRdo.data_relatorio + 'T12:00:00')})</span>
                        )}
                      </div>
                      {diasSemRdo !== null && diasSemRdo >= 3 && (
                        <div style={{ marginTop: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#b91c1c' }}>
                          ⚠️ A obra está há <strong>{diasSemRdo} dias</strong> sem registro de atividade
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '13px' }}>Nenhum RDO registrado ainda.</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Curva S Mini */}
          <div style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={iconBox('linear-gradient(135deg,#0ea5e9,#0284c7)')}><TrendingUp size={18} color="white" /></div>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Curva S — Progresso</span>
              {curvaS && (
                <span style={{
                  marginLeft: 'auto', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px',
                  background: curvaSStatus === 'verde' ? '#f0fdf4' : curvaSStatus === 'amarelo' ? '#fffbeb' : '#fef2f2',
                  color:      curvaSStatus === 'verde' ? '#15803d' : curvaSStatus === 'amarelo' ? '#92400e' : '#b91c1c',
                  border: `1px solid ${curvaSStatus === 'verde' ? '#86efac' : curvaSStatus === 'amarelo' ? '#fde68a' : '#fca5a5'}`,
                }}>
                  SPI {curvaS.indicadores?.spi?.toFixed(2) || '–'}
                </span>
              )}
            </div>
            {!curvaS ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', color: '#94a3b8', gap: '10px' }}>
                <BarChart2 size={40} color="#cbd5e1" />
                <span style={{ fontSize: '13px' }}>EAP não configurada</span>
              </div>
            ) : curvaSerie.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', color: '#94a3b8', gap: '10px' }}>
                <BarChart2 size={40} color="#cbd5e1" />
                <span style={{ fontSize: '13px' }}>Sem dados de progresso ainda</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#1d4ed8' }}>{curvaSPlanejado}%</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Planejado</div>
                  </div>
                  <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#15803d' }}>{curvaSReal}%</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Executado</div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={curvaSerie} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="data" tick={false} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip
                      formatter={(val, name) => [`${Math.round(val)}%`, name === 'planejado' ? 'Planejado' : 'Executado']}
                      labelFormatter={() => ''}
                      contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
                    />
                    <Line type="monotone" dataKey="planejado" stroke="#3b82f6" strokeWidth={2} dot={false} name="planejado" />
                    <Line type="monotone" dataKey="real"      stroke="#22c55e" strokeWidth={2} dot={false} name="real" />
                  </LineChart>
                </ResponsiveContainer>
                {curvaSDesvio < -3 && (
                  <div style={{ marginTop: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#b91c1c' }}>
                    ⚠️ Obra {Math.abs(Math.round(curvaSDesvio))}% atrás do planejado
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            BLOCO 3 — OPERAÇÃO
        ══════════════════════════════════════════════════════════════════ */}
        <div style={sectionLabel}><span>⚙️</span> OPERAÇÃO</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: kanban !== null ? '1fr 1fr 1fr' : '1fr 1fr',
          gap: '16px',
          marginBottom: '32px',
        }}>

          {/* Compras (apenas se tiver permissão) */}
          {kanban !== null && (
            <div style={cardBase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={iconBox('linear-gradient(135deg,#f59e0b,#d97706)')}><ShoppingCart size={18} color="white" /></div>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>Compras</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {[
                  { label: 'Em cotação',         value: comprasEmCotacao, cor: '#d97706', bg: '#fffbeb', icon: '🔄' },
                  { label: 'Ag. liberação/compra', value: comprasLiberadas, cor: '#1d4ed8', bg: '#eff6ff', icon: '⏳' },
                  { label: 'Comprado',            value: comprasCompradas, cor: '#15803d', bg: '#f0fdf4', icon: '✅' },
                ].map(m => (
                  <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: m.bg, padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#475569' }}>{m.icon} {m.label}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: m.cor }}>{m.value}</span>
                  </div>
                ))}
              </div>
              {comprasLiberadas > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#92400e' }}>
                  ⚠️ {comprasLiberadas} {comprasLiberadas === 1 ? 'item aguardando' : 'itens aguardando'} compra
                </div>
              )}
              {comprasEmCotacao === 0 && comprasLiberadas === 0 && comprasCompradas === 0 && (
                <div style={{ color: '#94a3b8', fontSize: '13px' }}>Nenhuma requisição ativa.</div>
              )}
            </div>
          )}

          {/* Ativos */}
          <div style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={iconBox('linear-gradient(135deg,#36d1dc,#5b86e5)')}><Wrench size={18} color="white" /></div>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Ativos</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {[
                { label: 'Alocados',      value: almox?.ferramentas_alocadas    || 0, cor: '#1d4ed8', bg: '#eff6ff', icon: '🔧' },
                { label: 'Em manutenção', value: almox?.ferramentas_manutencao  || 0, cor: '#d97706', bg: '#fffbeb', icon: '🛠️' },
                { label: 'Atrasados',     value: almox?.ferramentas_atrasadas   || 0, cor: '#b91c1c', bg: '#fef2f2', icon: '⏰' },
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: m.bg, padding: '8px 12px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>{m.icon} {m.label}</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: m.cor }}>{m.value}</span>
                </div>
              ))}
            </div>
            {almox?.total_perdas > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}>
                🔴 {almox.total_perdas} perda(s) · R$ {formatBRL(almox.custo_perdas)}
              </div>
            )}
            {ativosProblema > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#92400e' }}>
                ⚠️ {ativosProblema} {ativosProblema === 1 ? 'ativo em atenção' : 'ativos em atenção'}
              </div>
            )}
          </div>

          {/* Atividade Recente */}
          <div style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={iconBox('linear-gradient(135deg,#a855f7,#7c3aed)')}><List size={18} color="white" /></div>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Atividade Recente</span>
            </div>
            {feedItems.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Nenhuma atividade registrada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {feedItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', marginTop: '5px', flexShrink: 0, background: item.cor }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{item.texto}</div>
                      {item.data && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{horaRelativa(item.data)}</div>
                      )}
                    </div>
                    <span style={{ fontSize: '16px' }}>{item.icone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── ACESSO RÁPIDO ──────────────────────────────────────────────── */}
        <div style={sectionLabel}><span>🔗</span> ACESSO RÁPIDO</div>
        <div className="grid grid-2" style={{ marginBottom: '32px' }}>
          <div
            className="card"
            onClick={() => navigate(`/projeto/${projetoId}/almoxarifado`)}
            style={actionCard}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(135deg,#36d1dc,#5b86e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={28} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Ativos</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>
                  Alocados: {almox?.ferramentas_alocadas || 0} · Manutenção: {almox?.ferramentas_manutencao || 0}
                </p>
              </div>
            </div>
          </div>

          <div
            className="card"
            onClick={() => navigate(`/projeto/${projetoId}/eap`)}
            style={actionCard}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(135deg,#667eea,#764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Layers size={28} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Gerenciar EAP</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>Estrutura Analítica do Projeto</p>
              </div>
            </div>
          </div>

          <div
            className="card"
            onClick={() => navigate(`/projeto/${projetoId}/rdos`)}
            style={actionCard}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(135deg,#f093fb,#f5576c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={28} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Lista de RDOs</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>Relatórios Diários de Obra</p>
              </div>
            </div>
          </div>

          <div
            className="card"
            onClick={() => navigate(`/projeto/${projetoId}/rnc`)}
            style={actionCard}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(135deg,#fa709a,#fee140)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={28} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px' }}>RNC</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>
                  Relatórios de Não Conformidade{rncsAbertas > 0 ? ` · ${rncsAbertas} aberta(s)` : ''}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── GALERIA DE FOTOS ──────────────────────────────────────────── */}
        <div style={sectionLabel}><span>📷</span> GALERIA DE FOTOS</div>
        <div style={cardBase}>
          {(galeria.rdos || []).length === 0 ? (
            <div style={{ padding: '24px', color: '#94a3b8', fontSize: '14px', textAlign: 'center' }}>
              <ImageIcon size={36} color="#cbd5e1" style={{ marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
              Nenhuma foto enviada nos RDOs deste projeto.
            </div>
          ) : (
            <>
              {(galeria.rdos || []).map((grupo) => (
                <div key={grupo.rdo_id} style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                    {grupo.numero_rdo || `RDO-${String(grupo.rdo_id).padStart(3, '0')}`} • {grupo.data_relatorio ? new Date(grupo.data_relatorio + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data'} • {grupo.status || 'Sem status'} • {grupo.total_fotos || 0} foto(s)
                  </div>
                  <div className="grid grid-4" style={{ gap: '12px' }}>
                    {(grupo.fotos || []).map((item) => (
                      <div key={`${grupo.rdo_id}-${item.id}`} className="card" style={{ padding: '8px' }}>
                        <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', borderRadius: '6px', background: '#f1f5f9' }}>
                          <img src={`/uploads/${item.caminho_arquivo}`} alt={item.nome_arquivo || 'foto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#334155', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.descricao || item.nome_arquivo}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.atividade_descricao ? `${item.atividade_codigo ? `${item.atividade_codigo} — ` : ''}${item.atividade_descricao}` : (item.atividade_avulsa_descricao ? `Avulsa — ${item.atividade_avulsa_descricao}` : 'Sem atividade')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Number(galeria.total_fotos || 0) > 0 && (
                <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '13px', color: '#64748b' }}>
                  Total de {galeria.total_fotos} foto(s) distribuídas por RDO.
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </>
  );
}

export default ProjetoDetalhes;

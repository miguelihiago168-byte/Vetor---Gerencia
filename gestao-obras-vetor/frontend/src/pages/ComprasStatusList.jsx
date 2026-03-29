import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import { listarRequisicoesProjeto, listarRequisicoes } from '../services/api';
import { Search, FileText, Clock } from 'lucide-react';

// Mapeamento: slug → { label, statuses[] }
// "aguardando-decisao" consolida Cotações recebidas + Aguardando decisão gestor geral
const SLUG_MAP = {
  'solicitado':         { label: 'Solicitado',           statuses: ['Em análise'] },
  'em-cotacao':         { label: 'Em cotação',           statuses: ['Em cotação'] },
  'aguardando-decisao': { label: 'Aguardando decisão',   statuses: ['Cotações recebidas', 'Aguardando decisão gestor geral'] },
  'aprovado-compra':    { label: 'Aprovado para compra', statuses: ['Compra autorizada'] },
  'comprado':           { label: 'Comprado',             statuses: ['Finalizada'] },
};

// Botão de ação contextual por perfil + slug
const ACAO_MAP = {
  'solicitado':         { perfis: ['Gestor Geral'], label: 'Analisar' },
  'em-cotacao':         { perfis: ['ADM', 'Gestor Geral'],                                   label: 'Cotar' },
  'aguardando-decisao': { perfis: ['Gestor Geral'],                                          label: 'Decidir' },
  'aprovado-compra':    { perfis: ['ADM', 'Gestor Geral'],                                   label: 'Registrar compra' },
  'comprado':           { perfis: [],                                                         label: null },
};

const URG_ROW = {
  Emergencial: { background: '#fee2e2', borderLeft: '3px solid #ef4444' },
  Urgente:     { background: '#fef3c7', borderLeft: '3px solid #fbbf24' },
  Normal:      { background: 'var(--card-bg)', borderLeft: '3px solid transparent' },
};
const URG_BADGE = {
  Emergencial: { background: '#fee2e2', color: '#dc2626', fontWeight: 700 },
  Urgente:     { background: '#fef3c7', color: '#d97706', fontWeight: 700 },
  Normal:      { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontWeight: 600 },
};

const diasDesde = (iso) => {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'há 1 dia';
  return `há ${d} dias`;
};
const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

export default function ComprasStatusList() {
  const { projetoId, statusSlug, statusItem } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const perfil = usuario?.perfil || '';

  // Suporta ambos os nomes de param (:statusSlug e :statusItem legacy)
  const slug   = statusSlug || statusItem || 'solicitado';
  const config = SLUG_MAP[slug] || SLUG_MAP['solicitado'];
  const acao   = ACAO_MAP[slug];
  const showAcao = acao?.label && acao.perfis.includes(perfil);

  const [requisicoes, setRequisicoes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [busca,       setBusca]       = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const fetchStatus = async (status) => {
        if (projetoId) {
          const r = await listarRequisicoesProjeto(projetoId, { status_requisicao: status });
          return Array.isArray(r.data) ? r.data : (r.data?.requisicoes || []);
        } else {
          const r = await listarRequisicoes({ status_requisicao: status });
          return Array.isArray(r.data) ? r.data : (r.data?.requisicoes || []);
        }
      };
      const resultados = await Promise.all(config.statuses.map(fetchStatus));
      const merged = resultados.flat();
      merged.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
      setRequisicoes(merged);
    } catch {
      setRequisicoes([]);
    } finally {
      setLoading(false);
    }
  }, [projetoId, slug]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = busca
    ? requisicoes.filter((r) =>
        r.numero_requisicao?.toLowerCase().includes(busca.toLowerCase()) ||
        r.tipo_material?.toLowerCase().includes(busca.toLowerCase()) ||
        r.solicitante_nome?.toLowerCase().includes(busca.toLowerCase()) ||
        r.projeto_nome?.toLowerCase().includes(busca.toLowerCase())
      )
    : requisicoes;

  const verDetalhe = (req) =>
    navigate(projetoId ? `/projeto/${projetoId}/compras/${req.id}` : `/compras/${req.id}`);

  const breadcrumb = projetoId
    ? <><Link to={`/projeto/${projetoId}/compras`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>Requisições</Link>{' / '}{config.label}</>
    : <><Link to="/compras" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Compras</Link>{' / '}{config.label}</>;

  return (
    <ComprasLayout title={config.label}>
      <p style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem', color: 'var(--gray-500)' }}>
        {breadcrumb}
        <span style={{ marginLeft: 8, color: 'var(--gray-400)' }}>
          ({filtradas.length} {filtradas.length === 1 ? 'requisição' : 'requisições'})
        </span>
      </p>

      {/* Barra de busca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', maxWidth: 480 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 32, width: '100%' }}
            placeholder="Código, tipo de material, solicitante..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {busca && (
          <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '0.82rem' }}>
            Limpar
          </button>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
          <p style={{ marginTop: 12, color: 'var(--gray-500)', fontSize: '0.88rem' }}>Carregando...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center' }}>
          <FileText size={32} style={{ color: 'var(--gray-300)', marginBottom: 12 }} />
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', margin: 0 }}>>
            Nenhuma requisição com status <strong>{config.label}</strong>
            {busca ? ` correspondendo a "${busca}"` : ''}.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 175 }}>Código</th>
                {!projetoId && <th>Projeto</th>}
                <th>Tipo de material</th>
                <th style={{ textAlign: 'center', width: 70 }}>Itens</th>
                <th>Solicitante</th>
                <th style={{ width: 105 }}>Data</th>
                <th style={{ width: 115 }}>Urgência</th>
                <th style={{ width: 95 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> Tempo
                  </span>
                </th>
                <th style={{ width: showAcao ? 175 : 85, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((req) => {
                const rowStyle = slug === 'comprado' ? URG_ROW.Normal : (URG_ROW[req.urgencia] || URG_ROW.Normal);
                const badgeStyle = URG_BADGE[req.urgencia] || URG_BADGE.Normal;
                return (
                  <tr
                    key={req.id}
                    style={{ ...rowStyle, cursor: 'pointer', transition: 'filter 0.1s' }}
                    onClick={() => verDetalhe(req)}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.97)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
                  >
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary)' }}>
                        {req.numero_requisicao}
                      </span>
                    </td>
                    {!projetoId && (
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.projeto_nome || '—'}
                      </td>
                    )}
                    <td style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      {req.tipo_material}
                      {req.descricao_itens && (
                        <div style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 1 }}>{req.descricao_itens}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {req.total_itens ?? 0}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {req.solicitante_nome || '—'}
                    </td>
                    <td style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                      {fmtData(req.criado_em)}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', borderRadius: 99, padding: '2px 9px', ...badgeStyle }}>
                        {req.urgencia}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {diasDesde(req.atualizado_em || req.criado_em)}
                    </td>
                    <td
                      onClick={(e) => e.stopPropagation()}
                      style={{ textAlign: 'right', padding: '6px 12px' }}
                    >
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        {showAcao && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                            onClick={() => verDetalhe(req)}
                          >
                            {acao.label}
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          onClick={() => verDetalhe(req)}
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ComprasLayout>
  );
}

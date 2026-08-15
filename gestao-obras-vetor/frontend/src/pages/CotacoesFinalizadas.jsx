import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { listarCotacoesFinalizadas, getProjetos, listarRequisicoesEncerradas } from '../services/api';

const fmt = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
const numeroFinito = (v) => {
  const numero = Number(v);
  return Number.isFinite(numero) ? numero : 0;
};

const STATUS_BADGE = {
  'Finalizada':         { cls: 'badge badge-green', label: 'Finalizada' },
  'Encerrada sem compra': { cls: 'badge badge-red', label: 'Encerrada sem compra' },
};

export default function CotacoesFinalizadas() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [itens, setItens] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ projeto_id: projetoId || '' });
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtros.projeto_id ? { projeto_id: filtros.projeto_id } : {};
      const [res, projRes, reqsRes] = await Promise.all([
        listarCotacoesFinalizadas(params),
        getProjetos(),
        listarRequisicoesEncerradas(params),
      ]);
      setItens(res.data);
      setProjetos(projRes.data);
      setReqs(reqsRes.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  const itensFiltrados = busca
    ? itens.filter((i) => i.item_descricao?.toLowerCase().includes(busca.toLowerCase()) || i.fornecedor_nome?.toLowerCase().includes(busca.toLowerCase()))
    : itens;

  const reqsFiltradas = busca
    ? reqs.filter((r) => r.numero_requisicao?.toLowerCase().includes(busca.toLowerCase()) || r.tipo_material?.toLowerCase().includes(busca.toLowerCase()) || r.solicitante_nome?.toLowerCase().includes(busca.toLowerCase()))
    : reqs;

  const totalGasto = itensFiltrados.reduce((acc, i) => acc + numeroFinito(i.valor_total), 0);
  const economiaMedia = itensFiltrados.length
    ? itensFiltrados.reduce((acc, i) => acc + numeroFinito(i.economia_pct), 0) / itensFiltrados.length : 0;

  const irParaReq = (id) => {
    if (projetoId) navigate(`/projeto/${projetoId}/compras/${id}`);
    else navigate(`/compras/${id}`);
  };

  return (
    <ComprasLayout title="Finalizadas">
      <p style={{ marginTop: -8, marginBottom: 16, color: 'var(--gray-500)', fontSize: '0.88rem' }}>
        Compras concluídas e requisições encerradas
      </p>

      {/* Resumo */}
      <div className="suprimentos-kpi-grid">
        {[
          { label: 'Itens comprados', valor: itensFiltrados.length, cls: 'badge badge-blue' },
          { label: 'Valor total gasto', valor: fmt(totalGasto), cls: 'badge badge-green' },
          { label: 'Economia média', valor: `${economiaMedia.toFixed(1)}%`, cls: 'badge badge-yellow' },
          { label: 'Requisições encerradas', valor: reqsFiltradas.length, cls: 'badge badge-gray' },
        ].map((c) => (
          <div key={c.label} className="card suprimentos-kpi-card">
            <p className="suprimentos-kpi-label">{c.label}</p>
            <p className="suprimentos-kpi-value">{c.valor}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card suprimentos-filter-card">
      <div className="suprimentos-filter-row">
        <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar item, requisição ou fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {!projetoId && (
          <select className="form-input" style={{ width: 'auto' }} value={filtros.projeto_id} onChange={(e) => setFiltros({ ...filtros, projeto_id: e.target.value })}>
            <option value="">Todas as obras</option>
            {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
      </div>
      </div>

      {loading ? (
        <div className="card suprimentos-empty-card"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <>
          {/* ── Seção: Requisições encerradas ── */}
          {reqsFiltradas.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 className="suprimentos-section-title">
                Requisições encerradas ({reqsFiltradas.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {reqsFiltradas.map((r) => {
                  const badge = STATUS_BADGE[r.status_requisicao] || { cls: 'badge badge-gray', label: r.status_requisicao };
                  return (
                    <div
                      key={r.id}
                      className="card suprimentos-request-card"
                      style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}
                      onClick={() => irParaReq(r.id)}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>{r.numero_requisicao}</span>
                        <strong style={{ fontSize: '0.9rem' }}>{r.tipo_material}</strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Solicitante: {r.solicitante_nome || '—'} · {fmtData(r.atualizado_em)}</span>
                      </div>
                      <span className={badge.cls}>{badge.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Seção: Itens comprados ── */}
          <h3 className="suprimentos-section-title">
            Itens comprados ({itensFiltrados.length})
          </h3>
          {itensFiltrados.length === 0 ? (
            <div className="card suprimentos-empty-card">Nenhuma compra finalizada encontrada.</div>
          ) : (
            <div className="card suprimentos-table-card" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    {['Requisição','Item','Qtd','Fornecedor','Valor Unit.','Valor Total','Economia','Tipo/Obra','Data','Responsável'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((i) => (
                    <tr key={`${i.origem || 'requisicao'}-${i.item_id}`}>
                      <td><span style={{ color: 'var(--primary)', fontSize: '0.82rem' }}>{i.numero_requisicao}</span></td>
                      <td><strong>{i.item_descricao}</strong></td>
                      <td style={{ textAlign: 'center' }}>{i.quantidade} {i.unidade || ''}</td>
                      <td>
                        <div>{i.fornecedor_nome || '—'}</div>
                        {i.fornecedor_cnpj && <div style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>{i.fornecedor_cnpj}</div>}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmt(i.valor_unitario)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmt(i.valor_total)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {i.economia_pct != null ? (
                          <span style={{ color: i.economia_pct >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                            {i.economia_pct >= 0 ? '▼' : '▲'} {Math.abs(i.economia_pct).toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.82rem' }}>{i.tipo_material}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>{i.projeto_nome}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{fmtData(i.data_compra)}</td>
                      <td style={{ fontSize: '0.82rem' }}>{i.responsavel_nome || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ComprasLayout>
  );
}

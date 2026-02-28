import React, { useEffect, useState, useCallback } from 'react';
import ComprasLayout from '../components/ComprasLayout';
import { listarCotacoesFinalizadas, getProjetos } from '../services/api';

const fmt = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

export default function CotacoesFinalizadas() {
  const [itens, setItens] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ projeto_id: '' });
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [res, projRes] = await Promise.all([
        listarCotacoesFinalizadas(filtros.projeto_id ? { projeto_id: filtros.projeto_id } : {}),
        getProjetos(),
      ]);
      setItens(res.data);
      setProjetos(projRes.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  const itensFiltrados = busca
    ? itens.filter((i) => i.item_descricao?.toLowerCase().includes(busca.toLowerCase()) || i.fornecedor_nome?.toLowerCase().includes(busca.toLowerCase()))
    : itens;

  const totalGasto = itensFiltrados.reduce((acc, i) => acc + (i.valor_total || 0), 0);
  const economiaMedia = itensFiltrados.length
    ? itensFiltrados.reduce((acc, i) => acc + (i.economia_pct || 0), 0) / itensFiltrados.length : 0;

  return (
    <ComprasLayout title="Cotações Finalizadas">
      <p style={{ marginTop: -8, marginBottom: 16, color: 'var(--gray-500)', fontSize: '0.88rem' }}>
        Itens comprados com fornecedor selecionado
      </p>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total comprados', valor: itensFiltrados.length, cls: 'badge badge-blue' },
          { label: 'Valor total gasto', valor: fmt(totalGasto), cls: 'badge badge-green' },
          { label: 'Economia média', valor: `${economiaMedia.toFixed(1)}%`, cls: 'badge badge-yellow' },
        ].map((c) => (
          <div key={c.label} className="card" style={{ flex: '1 1 160px', padding: '1rem' }}>
            <p style={{ margin: 0, color: 'var(--gray-400)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</p>
            <p style={{ margin: '0.3rem 0 0', fontWeight: 700, fontSize: '1.25rem', color: 'var(--secondary)' }}>{c.valor}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar item ou fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="form-input" style={{ width: 'auto' }} value={filtros.projeto_id} onChange={(e) => setFiltros({ ...filtros, projeto_id: e.target.value })}>
          <option value="">Todas as obras</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : itensFiltrados.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>Nenhuma compra finalizada encontrada.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
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
                <tr key={i.item_id}>
                  <td><span style={{ color: 'var(--primary)', fontSize: '0.82rem' }}>{i.numero_requisicao}</span></td>
                  <td><strong>{i.item_descricao}</strong></td>
                  <td style={{ textAlign: 'center' }}>{i.quantidade} {i.unidade || ''}</td>
                  <td>
                    <div>{i.fornecedor_nome || '—'}</div>
                    {i.fornecedor_cnpj && <div style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>{i.fornecedor_cnpj}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmt(i.valor_unitario)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{fmt(i.valor_total)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {i.economia_pct != null ? (
                      <span style={{ color: i.economia_pct >= 0 ? '#047857' : 'var(--danger)', fontWeight: 600 }}>
                        {i.economia_pct >= 0 ? '▼' : '▲'} {Math.abs(i.economia_pct).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem' }}>{i.tipo_material}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>{i.projeto_nome}</div>
                  </td>
                  <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{i.data_compra ? new Date(i.data_compra).toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{ fontSize: '0.82rem' }}>{i.responsavel_nome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ComprasLayout>
  );
}

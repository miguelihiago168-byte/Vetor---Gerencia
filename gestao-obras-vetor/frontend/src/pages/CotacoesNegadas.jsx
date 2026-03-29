import React, { useEffect, useState, useCallback } from 'react';
import ComprasLayout from '../components/ComprasLayout';
import { listarCotacoesNegadas, getProjetos } from '../services/api';

export default function CotacoesNegadas() {
  const [itens, setItens] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ projeto_id: '', status_item: '' });
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [res, projRes] = await Promise.all([
        listarCotacoesNegadas(filtros.projeto_id ? { projeto_id: filtros.projeto_id } : {}),
        getProjetos(),
      ]);
      setItens(res.data);
      setProjetos(projRes.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filtros.projeto_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const itensFiltrados = itens.filter((i) => {
    if (filtros.status_item && i.status_item !== filtros.status_item) return false;
    if (busca && !i.item_descricao?.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const totalReprovados = itensFiltrados.filter((i) => i.status_item === 'Reprovado').length;
  const totalCancelados = itensFiltrados.filter((i) => i.status_item === 'Cancelado').length;

  return (
    <ComprasLayout title="Cotações Negadas">
      <p style={{ marginTop: -8, marginBottom: 16, color: 'var(--gray-500)', fontSize: '0.88rem' }}>
        Itens reprovados e cancelados no processo de compra
      </p>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total negados',    valor: itensFiltrados.length },
          { label: 'Reprovados',       valor: totalReprovados },
          { label: 'Cancelados',       valor: totalCancelados },
        ].map((c) => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', padding: '1rem' }}>
            <p style={{ margin: 0, color: 'var(--gray-400)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</p>
            <p style={{ margin: '0.3rem 0 0', fontWeight: 700, fontSize: '1.25rem', color: 'var(--secondary)' }}>{c.valor}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar por descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="form-input" style={{ width: 'auto' }} value={filtros.projeto_id} onChange={(e) => setFiltros({ ...filtros, projeto_id: e.target.value })}>
          <option value="">Todas as obras</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={filtros.status_item} onChange={(e) => setFiltros({ ...filtros, status_item: e.target.value })}>
          <option value="">Reprovados e Cancelados</option>
          <option value="Reprovado">Apenas Reprovados</option>
          <option value="Cancelado">Apenas Cancelados</option>
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : itensFiltrados.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>Nenhum item negado encontrado.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                {['Requisição','Item','Qtd','Situação','Motivo','Urgência','Tipo/Obra','Responsável','Data'].map((h) => (
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
                    <span className={i.status_item === 'Reprovado' ? 'badge badge-red' : 'badge badge-gray'}>{i.status_item}</span>
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    {i.motivo_reprovacao
                      ? <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{i.motivo_reprovacao}</span>
                      : <span style={{ color: 'var(--gray-400)' }}>—</span>}
                  </td>
                  <td><span className={i.urgencia === 'Emergencial' ? 'badge badge-red' : i.urgencia === 'Urgente' ? 'badge badge-yellow' : 'badge badge-gray'}>{i.urgencia}</span></td>
                  <td>
                    <div style={{ fontSize: '0.82rem' }}>{i.tipo_material}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>{i.projeto_nome}</div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{i.responsavel_nome || '—'}</td>
                  <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{i.data_evento ? new Date(i.data_evento).toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ComprasLayout>
  );
}

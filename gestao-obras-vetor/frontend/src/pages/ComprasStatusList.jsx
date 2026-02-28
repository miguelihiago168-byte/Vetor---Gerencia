import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { kanbanRequisicoes } from '../services/api';

const SLUG_MAP = {
  'aguardando-analise':   'Aguardando análise',
  'em-cotacao':           'Em cotação',
  'cotacao-finalizada':   'Cotação finalizada',
  'aguardando-gestor':    'Aguardando decisão gestor geral',
  'aprovado-compra':      'Aprovado para compra',
  'comprado':             'Comprado',
};

const URG_BADGE = {
  Normal:      'badge badge-gray',
  Urgente:     'badge badge-yellow',
  Emergencial: 'badge badge-red',
};

const fmt = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

export default function ComprasStatusList() {
  const { projetoId, statusItem } = useParams();
  const navigate = useNavigate();
  const label = SLUG_MAP[statusItem] || statusItem;

  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await kanbanRequisicoes(projetoId, {});
      // Flatten all columns, filter by matching label
      const todas = (res.data || []).flatMap((col) =>
        col.itens.map((item) => ({ ...item, coluna: col.label }))
      );
      setItens(todas.filter((i) => i.coluna === label));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [projetoId, label]);

  useEffect(() => { carregar(); }, [carregar]);

  const itensFiltrados = busca
    ? itens.filter((i) =>
        i.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
        i.numero_requisicao?.toLowerCase().includes(busca.toLowerCase())
      )
    : itens;

  return (
    <ComprasLayout title={label}>
      <p style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem', color: 'var(--gray-500)' }}>
        <Link to={`/projeto/${projetoId}/compras`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>Requisições</Link>
        {' / '}{label}
        <span style={{ marginLeft: 8, color: 'var(--gray-400)' }}>({itensFiltrados.length} itens)</span>
      </p>

      {/* Busca */}
      <div style={{ marginBottom: '1.25rem' }}>
        <input
          className="form-input"
          style={{ maxWidth: 400 }}
          placeholder="Buscar por item ou requisição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : itensFiltrados.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
          Nenhum item com status <strong>{label}</strong> nesta obra.
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Requisição</th>
                <th>Descrição</th>
                <th>Qtd</th>
                <th>Urgência</th>
                <th>Tipo material</th>
                <th>Menor cotação</th>
                <th>Cotações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map((item) => (
                <tr key={item.id}>
                  <td><span style={{ color: 'var(--primary)', fontSize: '0.82rem' }}>{item.numero_requisicao}</span></td>
                  <td><strong>{item.descricao}</strong></td>
                  <td style={{ textAlign: 'center' }}>{item.quantidade} {item.unidade || ''}</td>
                  <td><span className={URG_BADGE[item.urgencia] || 'badge badge-gray'}>{item.urgencia}</span></td>
                  <td style={{ fontSize: '0.85rem' }}>{item.tipo_material}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>
                    {fmt(item.menor_cotacao)}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--gray-500)', fontSize: '0.85rem' }}>
                    {item.total_cotacoes ?? 0}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      onClick={() => navigate(`/projeto/${projetoId}/compras/${item.requisicao_id}`)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ComprasLayout>
  );
}

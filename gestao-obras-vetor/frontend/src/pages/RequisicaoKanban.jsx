import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import { kanbanRequisicoes, getProjeto } from '../services/api';

const TIPOS_MATERIAL = ['Materiais Elétricos','Materiais Civis','Materiais Eletrônicos','Ferramentas','EPIs','Serviços','Outros'];
const URGENCIAS = ['Normal','Urgente','Emergencial'];

const COL_COLORS = {
  'Em cotação':           { border: '#0ea5e9', badge: 'badge badge-blue' },
  'Cotação finalizada':   { border: '#6366f1', badge: 'badge badge-blue' },
  'Aguardando decisão gestor': { border: '#f59e0b', badge: 'badge badge-yellow' },
  'Aprovado para compra': { border: '#10b981', badge: 'badge badge-green' },
  'Comprado':             { border: '#22c55e', badge: 'badge badge-green' },
};

const URG_BADGE = { Normal: 'badge badge-gray', Urgente: 'badge badge-yellow', Emergencial: 'badge badge-red' };

export default function RequisicaoKanban() {
  const { projetoId } = useParams();
  const navigate = useNavigate();

  const [projeto, setProjeto] = useState(null);
  const [colunas, setColunas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ tipo_material: '', urgencia: '', data_inicio: '', data_fim: '', valor_max: '' });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtros.tipo_material) params.tipo_material = filtros.tipo_material;
      if (filtros.urgencia)      params.urgencia      = filtros.urgencia;
      if (filtros.data_inicio)   params.data_inicio   = filtros.data_inicio;
      if (filtros.data_fim)      params.data_fim      = filtros.data_fim;
      if (filtros.valor_max)     params.valor_max     = filtros.valor_max;
      const [projRes, kanRes] = await Promise.all([getProjeto(projetoId), kanbanRequisicoes(projetoId, params)]);
      setProjeto(projRes.data);
      setColunas(kanRes.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [projetoId, filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalItens = colunas.reduce((acc, c) => acc + c.itens.length, 0);
  const temFiltros = Object.values(filtros).some(Boolean);

  return (
    <ComprasLayout title={`Kanban — ${projeto?.nome || `Obra #${projetoId}`}`}>
      <p style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem', color: 'var(--gray-500)' }}>
        <Link to={`/projeto/${projetoId}/compras`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>Requisições</Link>
        {' / Kanban'} · <span style={{ color: 'var(--gray-400)' }}>{totalItens} itens</span>
      </p>

      {/* Filtros */}
      <div className="card" style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-input" style={{ flex: '0 0 auto', width: 'auto', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }} value={filtros.tipo_material} onChange={(e) => setFiltros({ ...filtros, tipo_material: e.target.value })}>
          <option value="">Todos os tipos</option>
          {TIPOS_MATERIAL.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="form-input" style={{ flex: '0 0 auto', width: 'auto', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }} value={filtros.urgencia} onChange={(e) => setFiltros({ ...filtros, urgencia: e.target.value })}>
          <option value="">Qualquer urgência</option>
          {URGENCIAS.map((u) => <option key={u}>{u}</option>)}
        </select>
        <input type="date" className="form-input" style={{ flex: '0 0 auto', width: 'auto', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }} value={filtros.data_inicio} onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })} title="Data início" />
        <input type="date" className="form-input" style={{ flex: '0 0 auto', width: 'auto', padding: '0.4rem 0.7rem', fontSize: '0.85rem' }} value={filtros.data_fim} onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })} title="Data fim" />
        <input type="number" className="form-input" style={{ flex: '0 0 auto', width: 150, padding: '0.4rem 0.7rem', fontSize: '0.85rem' }} placeholder="Valor máx (R$)" value={filtros.valor_max} onChange={(e) => setFiltros({ ...filtros, valor_max: e.target.value })} />
        {temFiltros && (
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }} onClick={() => setFiltros({ tipo_material: '', urgencia: '', data_inicio: '', data_fim: '', valor_max: '' })}>
            Limpar
          </button>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1.5rem', alignItems: 'flex-start' }}>
          {colunas.map((col) => {
            const cor = COL_COLORS[col.label] || { border: 'var(--gray-300)', badge: 'badge badge-gray' };
            return (
              <div key={col.id} className="card" style={{ flex: '0 0 270px', padding: 0, overflow: 'hidden', borderTop: `4px solid ${cor.border}`, minHeight: 280 }}>
                <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-100)' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--secondary)' }}>{col.label}</span>
                  <span className={cor.badge} style={{ fontSize: '0.72rem' }}>{col.itens.length}</span>
                </div>
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {col.itens.length === 0 ? (
                    <p style={{ color: 'var(--gray-400)', fontSize: '0.82rem', textAlign: 'center', margin: '1rem 0' }}>Nenhum item</p>
                  ) : col.itens.map((item) => (
                    <div key={item.id} onClick={() => navigate(`/projeto/${projetoId}/compras/${item.requisicao_id}`)}
                      style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '0.65rem 0.8rem', cursor: 'pointer', transition: 'box-shadow .15s' }}
                      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.3rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--secondary)', lineHeight: 1.3 }}>{item.descricao}</span>
                        <span className={URG_BADGE[item.urgencia] || 'badge badge-gray'} style={{ fontSize: '0.69rem', flexShrink: 0 }}>{item.urgencia}</span>
                      </div>
                      <div style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>{item.numero_requisicao}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--gray-500)', marginTop: '0.3rem' }}>
                        <span>{item.tipo_material}</span>
                        {item.menor_cotacao != null && (
                          <span style={{ color: '#047857', fontWeight: 600 }}>
                            R$ {Number(item.menor_cotacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      {item.total_cotacoes > 0 && (
                        <div style={{ fontSize: '0.73rem', color: 'var(--gray-400)', marginTop: '0.2rem' }}>{item.total_cotacoes} cotação(ões)</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ComprasLayout>
  );
}

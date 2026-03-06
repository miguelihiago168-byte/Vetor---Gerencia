import React, { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import Navbar from './Navbar';
import { useAuth } from '../context/AuthContext';
import { getRequisicoesBadges } from '../services/api';
import {
  ShoppingCart, List, CheckCircle, XCircle, Users,
  Clock, Tag, ThumbsUp, Package, AlertCircle,
} from 'lucide-react';

// Configuração dos 5 status do fluxo
const STATUS_FLOW = [
  { slug: 'solicitado',         label: 'Solicitado',           icon: <Tag size={13} />,          statuses: ['Em análise'] },
  { slug: 'em-cotacao',         label: 'Em cotação',           icon: <Clock size={13} />,        statuses: ['Em cotação'] },
  { slug: 'aguardando-decisao', label: 'Aguard. decisão',      icon: <AlertCircle size={13} />,  statuses: ['Cotações recebidas', 'Aguardando decisão gestor geral'] },
  { slug: 'aprovado-compra',    label: 'Aprovado p/ compra',   icon: <ThumbsUp size={13} />,     statuses: ['Compra autorizada'] },
  { slug: 'comprado',           label: 'Comprado',             icon: <Package size={13} />,      statuses: ['Finalizada'] },
];

// Slugs com badge colorido (requer ação) por perfil
const BADGE_PERFIL = {
  'ADM':            new Set(['em-cotacao', 'aprovado-compra']),
  'Gestor Geral':   new Set(['solicitado', 'aguardando-decisao']),
  'Gestor da Obra': new Set(['solicitado', 'aguardando-decisao']),
  'Gestor Local':   new Set(['solicitado']),
  'Almoxarife':     new Set(['solicitado']),
};

function useBadges(projetoId) {
  const [badgeMap, setBadgeMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await getRequisicoesBadges(projetoId ? Number(projetoId) : undefined);
        const rows = res.data || [];
        // Agrupa contagem por slug (um slug pode cobrir múltiplos status)
        const map = {};
        STATUS_FLOW.forEach((sf) => {
          map[sf.slug] = rows
            .filter((r) => sf.statuses.includes(r.status))
            .reduce((sum, r) => sum + Number(r.count), 0);
        });
        if (!cancelled) setBadgeMap(map);
      } catch { /* silencioso */ }
    };
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projetoId]);

  return badgeMap;
}

function ComprasLayout({ title, children, extraHeader }) {
  const { projetoId } = useParams();
  const { usuario } = useAuth();
  const perfil = usuario?.perfil || '';
  const isGestorAdm = ['ADM', 'Gestor Geral'].includes(perfil);
  const badgeMap = useBadges(projetoId);
  const meusBadges = BADGE_PERFIL[perfil] || new Set();

  const statusLink = (slug) =>
    projetoId ? `/projeto/${projetoId}/compras/status/${slug}` : `/compras/status/${slug}`;

  return (
    <>
      <Navbar />
      <div className="container almox-container">
        <div className="almox-layout">
          <aside className="almox-sidebar card">
            <h3 className="card-header" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} /> Compras
            </h3>
            <nav className="almox-nav">
              {/* Link para lista geral de requisições */}
              <NavLink
                to={projetoId ? `/projeto/${projetoId}/compras` : '/compras'}
                end
                className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <List size={14} /> Requisições
                </span>
              </NavLink>

              {/* Seção Por Status */}
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px 4px', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                Por Status
              </div>

              {STATUS_FLOW.map((sf) => {
                const count = badgeMap[sf.slug] || 0;
                const isDestaque = meusBadges.has(sf.slug) && count > 0;
                return (
                  <NavLink
                    key={sf.slug}
                    to={statusLink(sf.slug)}
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {sf.icon} {sf.label}
                      </span>
                      {count > 0 && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, borderRadius: 99,
                          padding: '1px 6px', minWidth: 18, textAlign: 'center',
                          background: isDestaque ? '#ef4444' : '#e2e8f0',
                          color: isDestaque ? '#fff' : '#64748b',
                          flexShrink: 0,
                        }}>
                          {count}
                        </span>
                      )}
                    </span>
                  </NavLink>
                );
              })}

              {/* Histórico */}
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px 4px', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                Histórico
              </div>

              <NavLink
                to={projetoId ? `/projeto/${projetoId}/compras/finalizadas` : '/compras/finalizadas'}
                className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> Finalizadas
                </span>
              </NavLink>

              <NavLink
                to={projetoId ? `/projeto/${projetoId}/compras/negadas` : '/compras/negadas'}
                className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <XCircle size={14} /> Negadas/Canceladas
                </span>
              </NavLink>

              {/* Cadastros (ADM e Gestor Geral) */}
              {isGestorAdm && (
                <>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px 4px', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                    Cadastros
                  </div>
                  <NavLink
                    to={projetoId ? `/projeto/${projetoId}/compras/fornecedores` : '/fornecedores'}
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={14} /> Fornecedores
                    </span>
                  </NavLink>
                </>
              )}
            </nav>
          </aside>

          <main className="almox-content">
            <div className="flex-between mb-4">
              <h1>{title}</h1>
              {extraHeader || null}
            </div>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

export default ComprasLayout;

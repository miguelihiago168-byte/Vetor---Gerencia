import React, { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import Navbar from './Navbar';
import { useAuth } from '../context/AuthContext';
import { getRequisicoesBadges } from '../services/api';
import {
  ShoppingCart, List, CheckCircle, XCircle, Users,
  Clock, Tag, ThumbsUp, AlertCircle,
} from 'lucide-react';
import './ComprasLayout.css';

// Configuração dos status do fluxo ativo (finalizadas ficam no Histórico)
const STATUS_FLOW = [
  { slug: 'solicitado',         label: 'Solicitado',           icon: <Tag size={13} />,          statuses: ['Em análise'] },
  { slug: 'em-cotacao',         label: 'Em cotação',           icon: <Clock size={13} />,        statuses: ['Em cotação'] },
  { slug: 'cotacoes-recebidas', label: 'Cotações recebidas',   icon: <AlertCircle size={13} />,  statuses: ['Cotações recebidas'] },
  { slug: 'aprovado-compra',    label: 'Aprovado p/ compra',   icon: <ThumbsUp size={13} />,     statuses: ['Compra autorizada'] },
];

// Slugs com badge colorido (requer ação) por perfil
const BADGE_PERFIL = {
  'ADM':            new Set(['em-cotacao', 'aprovado-compra']),
  'Gestor Geral':   new Set(['solicitado', 'cotacoes-recebidas']),
  'Gestor da Obra': new Set(['solicitado', 'cotacoes-recebidas']),
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
      <div className="container almox-container suprimentos-shell">
        <div className="almox-layout">
          <aside className="almox-sidebar card suprimentos-sidebar">
            <h3 className="card-header suprimentos-sidebar-title">
              <ShoppingCart size={18} /> Suprimentos
            </h3>
            <nav className="almox-nav suprimentos-nav">
              {/* Link para lista geral de requisições */}
              <NavLink
                to={projetoId ? `/projeto/${projetoId}/compras` : '/compras'}
                end
                className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
              >
                <span className="suprimentos-nav-row">
                  <List size={14} /> Requisições
                </span>
              </NavLink>

              {/* Seção Por Status */}
              <div className="suprimentos-nav-section">
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
                    <span className="suprimentos-nav-row suprimentos-nav-row-between">
                      <span className="suprimentos-nav-row">
                        {sf.icon} {sf.label}
                      </span>
                      {count > 0 && (
                        <span className={`suprimentos-count-badge${isDestaque ? ' is-destaque' : ''}`}>
                          {count}
                        </span>
                      )}
                    </span>
                  </NavLink>
                );
              })}

              {/* Histórico */}
              <div className="suprimentos-nav-section">
                Histórico
              </div>

              <NavLink
                to={projetoId ? `/projeto/${projetoId}/compras/finalizadas` : '/compras/finalizadas'}
                className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
              >
                <span className="suprimentos-nav-row">
                  <CheckCircle size={14} /> Finalizadas
                </span>
              </NavLink>

              <NavLink
                to={projetoId ? `/projeto/${projetoId}/compras/negadas` : '/compras/negadas'}
                className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
              >
                <span className="suprimentos-nav-row">
                  <XCircle size={14} /> Negadas/Canceladas
                </span>
              </NavLink>

              {/* Cadastros (ADM e Gestor Geral) */}
              {isGestorAdm && (
                <>
                  <div className="suprimentos-nav-section">
                    Cadastros
                  </div>
                  <NavLink
                    to={projetoId ? `/projeto/${projetoId}/compras/fornecedores` : '/fornecedores'}
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span className="suprimentos-nav-row">
                      <Users size={14} /> Fornecedores
                    </span>
                  </NavLink>
                </>
              )}
            </nav>
          </aside>

          <main className="almox-content suprimentos-content">
            <div className="flex-between mb-4 suprimentos-page-header">
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

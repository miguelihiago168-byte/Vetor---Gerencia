import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import Navbar from './Navbar';
import { useAuth } from '../context/AuthContext';
import { ShoppingCart, LayoutGrid, Package, CheckCircle, Clock, TrendingUp, XCircle, Users } from 'lucide-react';

function ComprasLayout({ title, children, extraHeader }) {
  const { projetoId } = useParams();
  const { usuario } = useAuth();
  const perfil = usuario?.perfil || '';
  const isGestorAdm = ['ADM', 'Gestor Geral'].includes(perfil);

  const STATUS_LINKS = [
    { label: 'Aguardando Análise', slug: 'aguardando-analise', icon: <Clock size={14} /> },
    { label: 'Em Cotação',         slug: 'em-cotacao',         icon: <TrendingUp size={14} /> },
    { label: 'Cotação Finalizada', slug: 'cotacao-finalizada', icon: <Package size={14} /> },
    { label: 'Ag. Decisão Gestor', slug: 'aguardando-gestor',  icon: <Clock size={14} /> },
    { label: 'Aprovado p/ Compra', slug: 'aprovado-compra',    icon: <CheckCircle size={14} /> },
    { label: 'Comprado',           slug: 'comprado',           icon: <CheckCircle size={14} /> },
  ];

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
              {projetoId ? (
                <>
                  <NavLink
                    to={`/projeto/${projetoId}/compras`}
                    end
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LayoutGrid size={14} /> Requisições
                    </span>
                  </NavLink>

                  <NavLink
                    to={`/projeto/${projetoId}/compras/kanban`}
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LayoutGrid size={14} /> Kanban
                    </span>
                  </NavLink>

                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px 4px', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                    Por Status
                  </div>

                  {STATUS_LINKS.map(({ label, slug, icon }) => (
                    <NavLink
                      key={slug}
                      to={`/projeto/${projetoId}/compras/status/${slug}`}
                      className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {icon} {label}
                      </span>
                    </NavLink>
                  ))}

                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px 4px', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                    Global
                  </div>

                  <NavLink
                    to={`/projeto/${projetoId}/compras/finalizadas`}
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={14} /> Finalizadas
                    </span>
                  </NavLink>

                  <NavLink
                    to={`/projeto/${projetoId}/compras/negadas`}
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <XCircle size={14} /> Negadas
                    </span>
                  </NavLink>

                  {isGestorAdm && (
                    <>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px 4px', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                        Cadastros
                      </div>
                      <NavLink
                        to={`/projeto/${projetoId}/compras/fornecedores`}
                        className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Users size={14} /> Fornecedores
                        </span>
                      </NavLink>
                    </>
                  )}
                </>
              ) : (
                /* Sidebar quando não há projeto (ex: /compras/finalizadas) */
                <>
                  <NavLink
                    to="/compras"
                    end
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LayoutGrid size={14} /> Painel Geral
                    </span>
                  </NavLink>
                  <NavLink
                    to="/compras/finalizadas"
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={14} /> Finalizadas
                    </span>
                  </NavLink>
                  <NavLink
                    to="/compras/negadas"
                    className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <XCircle size={14} /> Negadas
                    </span>
                  </NavLink>
                  {isGestorAdm && (
                    <>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px 4px', borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                        Cadastros
                      </div>
                      <NavLink
                        to="/fornecedores"
                        className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Users size={14} /> Fornecedores
                        </span>
                      </NavLink>
                    </>
                  )}
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

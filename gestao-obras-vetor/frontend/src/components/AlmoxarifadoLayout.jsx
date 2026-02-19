import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import Navbar from './Navbar';

function AlmoxarifadoLayout({ title, children, extraHeader }) {
  const { projetoId } = useParams();

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="almox-layout">
          <aside className="almox-sidebar card">
            <h3 className="card-header" style={{ marginBottom: 12 }}>Ativos</h3>
            <nav className="almox-nav">
              <NavLink to={`/projeto/${projetoId}/almoxarifado`} end className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                Dashboard
              </NavLink>
              <NavLink to={`/projeto/${projetoId}/almoxarifado/ferramentas`} className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                Cadastro de Ativos
              </NavLink>
              <NavLink to={`/projeto/${projetoId}/almoxarifado/retirada`} className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                Retirada
              </NavLink>
              <NavLink to={`/projeto/${projetoId}/almoxarifado/devolucao`} className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                Devolução
              </NavLink>
              <NavLink to={`/projeto/${projetoId}/almoxarifado/manutencao`} className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                Manutenção
              </NavLink>
              <NavLink to={`/projeto/${projetoId}/almoxarifado/perdas`} className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                Perdas
              </NavLink>
              <NavLink to={`/projeto/${projetoId}/almoxarifado/relatorios`} className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                Relatórios
              </NavLink>
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

export default AlmoxarifadoLayout;

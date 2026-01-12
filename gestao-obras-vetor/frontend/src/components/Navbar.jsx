import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User } from 'lucide-react';

function Navbar() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // tenta extrair projetoId da rota atual (/projeto/:projetoId/...)
  const projetoMatch = (location.pathname || '').match(/\/projeto\/(\d+)/);
  const projetoId = projetoMatch ? projetoMatch[1] : null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-content">
          <NavLink to="/dashboard" className="navbar-brand">
            <span>Vetor</span> Gestão de Obras
          </NavLink>
          
          <div className="navbar-menu">
            <NavLink to="/dashboard" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/projetos" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
              Projetos
            </NavLink>
            <NavLink to={projetoId ? `/projeto/${projetoId}/rdos` : '/projetos'} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
              RDOs
            </NavLink>
            <NavLink to={projetoId ? `/projeto/${projetoId}/rnc` : '/projetos'} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
              RNC
            </NavLink>
            {usuario?.is_gestor === 1 && (
              <>
                <NavLink to={projetoId ? `/projeto/${projetoId}/eap` : '/projetos'} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  EAP
                </NavLink>
                <NavLink to="/usuarios" className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Usuários
                </NavLink>
              </>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="navbar-user">
                <User size={16} />
                {usuario?.nome}
                {usuario?.is_gestor === 1 && ' · Gestor'}
              </span>
              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '10px 14px' }}>
                <LogOut size={16} />
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;

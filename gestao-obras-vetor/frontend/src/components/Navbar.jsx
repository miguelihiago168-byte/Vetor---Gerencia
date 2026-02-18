import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User } from 'lucide-react';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { listarPedidosPorProjeto, getRDOs } from '../services/api';

function Navbar() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDirty } = useLeaveGuard();

  // tenta extrair projetoId da rota atual (/projeto/:projetoId/...)
  const projetoMatch = (location.pathname || '').match(/\/projeto\/(\d+)/);
  const projetoId = projetoMatch ? projetoMatch[1] : null;

  const [pendCompras, setPendCompras] = useState(0);
  const [pendComprasAdm, setPendComprasAdm] = useState(0);
  const [pendRdos, setPendRdos] = useState(0);

  useEffect(() => {
    const loadCounts = async () => {
      if (!(usuario?.is_gestor === 1) || !projetoId) {
        setPendCompras(0);
        setPendRdos(0);
        return;
      }
      try {
        const pedidosRes = await listarPedidosPorProjeto(projetoId);
        const pedidos = pedidosRes.data || [];
        const comprasCountGestor = pedidos.filter(p => p.status === 'SOLICITADO').length;
        setPendCompras(comprasCountGestor);

        const comprasCountAdm = pedidos.filter(p => p.status === 'APROVADO_GESTOR_INICIAL').length;
        setPendComprasAdm(comprasCountAdm);

        const rdosRes = await getRDOs(projetoId);
        const rdos = rdosRes.data || [];
        const rdosCount = rdos.filter(r => (r.status === 'Em análise' || r.status === 'Em analise')).length;
        setPendRdos(rdosCount);
      } catch (e) {
        // Silencia erros de contagem no navbar
      }
    };
    loadCounts();
  }, [usuario, projetoId, location.pathname]);

  const confirmNav = (e, to) => {
    if (isDirty) {
      const ok = window.confirm('Você tem alterações não salvas. Deseja sair desta página?');
      if (!ok) {
        e.preventDefault();
        return false;
      }
    }
    return true;
  };

  const handleLogout = (e) => {
    if (!confirmNav(e)) return;
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-content">
          <NavLink to="/projetos" className="navbar-brand">
            <span>Vetor</span> Gestão de Obras
          </NavLink>
          
          <div className="navbar-menu">
            <NavLink to="/projetos" onClick={(e) => confirmNav(e, '/projetos')} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
              Projetos
            </NavLink>
            {projetoId && (
              <>
                <NavLink to={`/projeto/${projetoId}/rdos`} onClick={(e) => confirmNav(e, `/projeto/${projetoId}/rdos`)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  RDOs {usuario?.is_gestor === 1 && pendRdos > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRdos}</span>)}
                </NavLink>
                <NavLink to={`/projeto/${projetoId}/rnc`} onClick={(e) => confirmNav(e, `/projeto/${projetoId}/rnc`)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  RNC
                </NavLink>
                <NavLink to={`/projeto/${projetoId}/pedidos`} onClick={(e) => confirmNav(e, `/projeto/${projetoId}/pedidos`)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Compras
                  {usuario?.is_gestor === 1 && pendCompras > 0 && (
                    <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendCompras}</span>
                  )}
                  {usuario?.is_adm === 1 && pendComprasAdm > 0 && (
                    <span className="badge badge-yellow" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendComprasAdm}</span>
                  )}
                </NavLink>
                {usuario?.is_gestor === 1 && (
                  <NavLink to={`/projeto/${projetoId}/eap`} onClick={(e) => confirmNav(e, `/projeto/${projetoId}/eap`)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                    EAP
                  </NavLink>
                )}
                {usuario?.is_gestor === 1 && (
                  <NavLink to={`/projeto/${projetoId}/usuarios`} onClick={(e) => confirmNav(e, `/projeto/${projetoId}/usuarios`)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                    Usuários
                  </NavLink>
                )}
              </>
            )}
            {usuario?.is_gestor === 1 && !projetoId && (
              <NavLink to="/usuarios" onClick={(e) => confirmNav(e, '/usuarios')} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                Usuários
              </NavLink>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="navbar-user">
                <User size={16} />
                {usuario?.nome}
                {usuario?.is_gestor === 1 && ' · Gestor'}
              </span>
              <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '10px 14px' }}>
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

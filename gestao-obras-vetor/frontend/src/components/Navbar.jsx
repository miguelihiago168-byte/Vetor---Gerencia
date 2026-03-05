import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, LineChart } from 'lucide-react';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { listarPedidosPorProjeto, getRDOs, getRNCs, getNotificacoes, marcarNotificacaoLida } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';

function Navbar() {
  const { usuario, logout, isGestor, isAdm, perfil } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDirty } = useLeaveGuard();
  const { confirm } = useDialog();

  // tenta extrair projetoId da rota atual (/projeto/:projetoId/...)
  const projetoMatch = (location.pathname || '').match(/\/projeto\/(\d+)/);
  const projetoId = projetoMatch ? projetoMatch[1] : null;
  const temProjetoSelecionado = Boolean(projetoId);

  const [pendCompras, setPendCompras] = useState(0);
  const [pendComprasAdm, setPendComprasAdm] = useState(0);
  const [pendRdos, setPendRdos] = useState(0);
  const [pendRnc, setPendRnc] = useState(0);
  const [notifCompras, setNotifCompras] = useState(0);
  const { info } = useNotification();

  useEffect(() => {
    const loadCounts = async () => {
      if (!isGestor || !projetoId) {
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

        const rncRes = await getRNCs(projetoId);
        const rncs = rncRes.data || [];
        const rncCount = rncs.filter(r => (r.status === 'Em análise' || r.status === 'Em analise')).length;
        setPendRnc(rncCount);
      } catch (e) {
        // Silencia erros de contagem no navbar
      }
    };
    loadCounts();
  }, [usuario, projetoId, location.pathname]);

  // Buscar notificações e exibir como toast; marcar como lidas após exibir
  useEffect(() => {
    const fetchNotifs = async () => {
      if (!usuario?.id) return;
      try {
        const res = await getNotificacoes();
        const notifs = res.data || [];
        const comprasPendentes = notifs.filter((n) => n.referencia_tipo === 'pedido').length;
        setNotifCompras(comprasPendentes);
        for (const n of notifs) {
          info(n.mensagem, 7000);
          // marcar como lida para não repetir
          try { await marcarNotificacaoLida(n.id); } catch {}
        }
        setNotifCompras(0);
      } catch (e) {
        // silenciar falhas de notificação
      }
    };
    fetchNotifs();
  }, [usuario?.id, location.pathname]);

  const confirmNav = async (e, to) => {
    if (!isDirty) return true;
    if (e?.preventDefault) e.preventDefault();

    const ok = await confirm({
      title: 'Alterações não salvas',
      message: 'Você tem alterações não salvas. Deseja sair desta página?',
      confirmText: 'Sair da página',
      cancelText: 'Continuar editando'
    });

    if (ok && to) navigate(to);
    return ok;
  };

  const handleLogout = async (e) => {
    const ok = await confirmNav(e);
    if (!ok) return;
    logout();
    navigate('/login');
  };

  const rotaRdos = projetoId ? `/projeto/${projetoId}/rdos` : '/rdos';
  const rotaRnc = projetoId ? `/projeto/${projetoId}/rnc` : '/rnc';
  const rotaCompras = projetoId ? `/projeto/${projetoId}/compras` : '/compras';
  const rotaFinanceiro = projetoId ? `/projeto/${projetoId}/financeiro` : '/financeiro';
  const rotaAlmox = projetoId ? `/projeto/${projetoId}/almoxarifado` : '/ativos';
  const rotaEap = projetoId ? `/projeto/${projetoId}/eap` : '/eap';
  const rotaCurvaS = projetoId ? `/projeto/${projetoId}/curva-s` : '/curva-s';
  const rotaUsuarios = projetoId ? `/projeto/${projetoId}/usuarios` : '/usuarios';
  const identificacaoTopo = usuario?.funcao || perfil || '';

  const isGestorGeral = perfil === 'Gestor Geral';
  const isGestorObra = perfil === 'Gestor da Obra' || perfil === 'Gestor Local';
  const isGestorQualidade = perfil === 'Gestor da Qualidade' || perfil === 'Gestor de Qualidade';
  const isAdministrativo = perfil === 'ADM';
  const isAlmoxarife = perfil === 'Almoxarife';
  const isFiscal = perfil === 'Fiscal';

  const canViewRdo = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewRnc = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewCurvaS = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewCompras = isGestorGeral || isGestorObra || isAdministrativo || isAlmoxarife;
  const canViewFinanceiro = false; // FINANCEIRO DESATIVADO (era: isGestorGeral || isGestorObra || isAdministrativo)
  const canViewAtivos = isGestorGeral || isGestorObra || isGestorQualidade || isAdministrativo || isAlmoxarife;
  const canViewEap = isGestorGeral || isGestorObra || isGestorQualidade;
  const canViewUsuarios = isGestorGeral || isAdministrativo;

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-content">
          <NavLink to="/projetos" className="navbar-brand">
            <span>Vetor</span> Gestão de Obras
          </NavLink>

          <div className="navbar-main">
            <div className="navbar-menu">
            <NavLink to="/projetos" onClick={(e) => confirmNav(e, '/projetos')} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
              Projetos
            </NavLink>
            {temProjetoSelecionado && (
              <>
                <NavLink
                  to={`/projeto/${projetoId}`}
                  end
                  onClick={(e) => confirmNav(e, `/projeto/${projetoId}`)}
                  className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
                >
                  Dashboard
                </NavLink>
                {canViewRdo && (
                <NavLink to={rotaRdos} onClick={(e) => confirmNav(e, rotaRdos)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  RDOs {isGestor && pendRdos > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRdos}</span>)}
                </NavLink>
                )}
                {canViewRnc && (
                <NavLink to={rotaRnc} onClick={(e) => confirmNav(e, rotaRnc)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  RNC {isGestor && pendRnc > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRnc}</span>)}
                </NavLink>
                )}
                {canViewFinanceiro && (
                <NavLink to={rotaFinanceiro} onClick={(e) => confirmNav(e, rotaFinanceiro)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Financeiro
                </NavLink>
                )}
                {canViewCompras && (
                <NavLink to={rotaCompras} onClick={(e) => confirmNav(e, rotaCompras)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Compras
                  {isGestor && pendCompras > 0 && (
                    <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendCompras}</span>
                  )}
                  {isAdm && pendComprasAdm > 0 && (
                    <span className="badge badge-yellow" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendComprasAdm}</span>
                  )}
                  {notifCompras > 0 && (
                    <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{notifCompras}</span>
                  )}
                </NavLink>
                )}
                {canViewAtivos && (
                <NavLink to={rotaAlmox} onClick={(e) => confirmNav(e, rotaAlmox)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Ativos
                </NavLink>
                )}
                {canViewEap && (
                  <NavLink to={rotaEap} onClick={(e) => confirmNav(e, rotaEap)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                    EAP
                  </NavLink>
                )}
                {canViewCurvaS && (
                <NavLink to={rotaCurvaS} onClick={(e) => confirmNav(e, rotaCurvaS)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  <LineChart size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                  Curva S
                </NavLink>
                )}
              </>
            )}
            {!temProjetoSelecionado && canViewCompras && (
            <NavLink to={rotaCompras} onClick={(e) => confirmNav(e, rotaCompras)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
              Compras
              {isGestor && pendCompras > 0 && (
                <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendCompras}</span>
              )}
              {isAdm && pendComprasAdm > 0 && (
                <span className="badge badge-yellow" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendComprasAdm}</span>
              )}
              {notifCompras > 0 && (
                <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{notifCompras}</span>
              )}
            </NavLink>
            )}
            {canViewUsuarios && (
              <NavLink to={rotaUsuarios} onClick={(e) => confirmNav(e, rotaUsuarios)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                Usuários
              </NavLink>
            )}
            </div>
          </div>

          <div className="navbar-account">
            <span className="navbar-user">
              <User size={16} />
              {usuario?.nome}
              {identificacaoTopo ? ` · ${identificacaoTopo}` : ''}
            </span>
            <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '10px 14px' }}>
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;

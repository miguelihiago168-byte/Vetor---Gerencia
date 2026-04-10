import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut } from 'lucide-react';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { listarPedidosPorProjeto, getRDOs, getRNCs, getNotificacoes, marcarNotificacaoLida, getRequisicoesBadges } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import ThemeToggle from './ThemeToggle';

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
  const [pendRequisicoes, setPendRequisicoes] = useState(0);
  const [pendRdos, setPendRdos] = useState(0);
  const [pendRnc, setPendRnc] = useState(0);
  const [notifCompras, setNotifCompras] = useState(0);
  const [notifTotal, setNotifTotal] = useState(0);
  const { info } = useNotification();

  useEffect(() => {
    const loadCounts = async () => {
      if (!projetoId) {
        setPendCompras(0);
        setPendRdos(0);
        setPendRequisicoes(0);
        return;
      }
      try {
        // Badges de requisições por perfil
        const BADGE_PERFIL = {
          'ADM':            new Set(['em-cotacao', 'aprovado-compra']),
          'Gestor Geral':   new Set(['solicitado', 'aguardando-decisao']),
          'Gestor da Obra': new Set(['solicitado', 'aguardando-decisao']),
          'Gestor Local':   new Set(['solicitado']),
          'Almoxarife':     new Set(['solicitado']),
        };
        const STATUS_FLOW = [
          { slug: 'solicitado',         statuses: ['Em análise'] },
          { slug: 'em-cotacao',         statuses: ['Em cotação'] },
          { slug: 'aguardando-decisao', statuses: ['Cotações recebidas', 'Aguardando decisão gestor geral'] },
          { slug: 'aprovado-compra',    statuses: ['Compra autorizada'] },
        ];
        try {
          const badgesRes = await getRequisicoesBadges(Number(projetoId));
          const rows = badgesRes.data || [];
          const meusBadges = BADGE_PERFIL[perfil] || new Set();
          let totalReq = 0;
          STATUS_FLOW.forEach((sf) => {
            if (meusBadges.has(sf.slug)) {
              totalReq += rows
                .filter((r) => sf.statuses.includes(r.status))
                .reduce((sum, r) => sum + Number(r.count), 0);
            }
          });
          setPendRequisicoes(totalReq);
        } catch { setPendRequisicoes(0); }

        if (!isGestor) { setPendCompras(0); setPendComprasAdm(0); }
        else {
        const pedidosRes = await listarPedidosPorProjeto(projetoId);
        const pedidos = pedidosRes.data || [];
        const comprasCountGestor = pedidos.filter(p => p.status === 'SOLICITADO').length;
        setPendCompras(comprasCountGestor);

        const comprasCountAdm = pedidos.filter(p => p.status === 'APROVADO_GESTOR_INICIAL').length;
        setPendComprasAdm(comprasCountAdm);
        }

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

  // Buscar contagem de notificações não lidas; exibe como badge junto ao nome
  useEffect(() => {
    const fetchNotifs = async () => {
      if (!usuario?.id) return;
      try {
        const res = await getNotificacoes();
        const notifs = res.data || [];
        setNotifTotal(notifs.length);
        const comprasPendentes = notifs.filter((n) => n.referencia_tipo === 'pedido').length;
        setNotifCompras(comprasPendentes);
      } catch (e) {
        // silenciar falhas de notificação
      }
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30000);
    return () => clearInterval(id);
  }, [usuario?.id]);

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
  const rotaDashboardProjeto = projetoId ? `/projeto/${projetoId}` : '/projetos';
  const rotaAlmox = projetoId ? `/projeto/${projetoId}/almoxarifado` : '/ativos';
  const rotaExecucao = projetoId ? `/projeto/${projetoId}/rdos` : '/rdos';
  const rotaQualidade = projetoId ? `/projeto/${projetoId}/rnc` : '/rnc';
  const rotaPlanejamento = projetoId ? `/projeto/${projetoId}/planejamento` : '/planejamento';
  const rotaUsuarios = projetoId ? `/projeto/${projetoId}/usuarios` : '/usuarios';
  const rotaEmail = projetoId ? `/projeto/${projetoId}/email-dashboard` : '/email-dashboard';
  const rotaPerfil = '/perfil';
  const isGestorGeral = perfil === 'Gestor Geral';
  const isGestorObra = perfil === 'Gestor da Obra' || perfil === 'Gestor Local';
  const isGestorQualidade = perfil === 'Gestor da Qualidade' || perfil === 'Gestor de Qualidade';
  const isAdministrativo = perfil === 'ADM';
  const isAlmoxarife = perfil === 'Almoxarife';
  const isFiscal = perfil === 'Fiscal';

  const canViewRdo = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewRnc = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewPlanejamento = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewCompras = isGestorGeral || isGestorObra || isAdministrativo || isAlmoxarife;
  const canViewAtivos = isGestorGeral || isGestorObra || isAdministrativo || isAlmoxarife;
  const canViewExecucao = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewQualidade = isGestorGeral || isGestorObra || isGestorQualidade || isFiscal;
  const canViewUsuarios = isGestorGeral || isAdministrativo;

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-content">
          <NavLink to="/projetos" className="navbar-brand">
            <div className="navbar-brand-left">
              <img src="/logo_vetor.png" alt="Vetor" className="navbar-logo-img" />
              <span className="navbar-brand-name">Vetor</span>
            </div>
            <span className="navbar-brand-subtitle">Gestão de Obras</span>
          </NavLink>

          <div className="navbar-main">
            <div className="navbar-menu grouped-menu">
              <NavLink to="/projetos" onClick={(e) => confirmNav(e, '/projetos')} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                Projetos
              </NavLink>

              {temProjetoSelecionado && !isAlmoxarife && (
                <NavLink to={rotaDashboardProjeto} end onClick={(e) => confirmNav(e, rotaDashboardProjeto)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Dashboard
                </NavLink>
              )}

              {canViewExecucao && (
                <NavLink to={rotaExecucao} onClick={(e) => confirmNav(e, rotaExecucao)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  RDOs
                  {isGestor && pendRdos > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRdos}</span>)}
                </NavLink>
              )}

              {canViewPlanejamento && (
                <NavLink to={rotaPlanejamento} onClick={(e) => confirmNav(e, rotaPlanejamento)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Planejamento
                </NavLink>
              )}

              {canViewQualidade && (
                <NavLink to={rotaQualidade} onClick={(e) => confirmNav(e, rotaQualidade)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Qualidade
                  {isGestor && pendRnc > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRnc}</span>)}
                </NavLink>
              )}

              {canViewCompras && (
                <NavLink to={rotaCompras} onClick={(e) => confirmNav(e, rotaCompras)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Suprimentos
                  {pendRequisicoes > 0 && (
                    <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRequisicoes}</span>
                  )}
                  {isGestor && pendCompras > 0 && (
                    <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendCompras}</span>
                  )}
                  {isAdm && pendComprasAdm > 0 && (
                    <span className="badge badge-yellow" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendComprasAdm}</span>
                  )}
                </NavLink>
              )}

              {canViewAtivos && (
                <NavLink to={rotaAlmox} onClick={(e) => confirmNav(e, rotaAlmox)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Ativos
                </NavLink>
              )}

              <NavLink to={rotaEmail} onClick={(e) => confirmNav(e, rotaEmail)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                Email
              </NavLink>

              {canViewUsuarios && (
                <NavLink to={rotaUsuarios} onClick={(e) => confirmNav(e, rotaUsuarios)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                  Usuários
                </NavLink>
              )}

              <NavLink to={rotaPerfil} onClick={(e) => confirmNav(e, rotaPerfil)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
                Perfil
              </NavLink>
            </div>
          </div>
          <div className="navbar-account">
            <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '10px 14px' }}>
              <LogOut size={16} />
              Sair
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;

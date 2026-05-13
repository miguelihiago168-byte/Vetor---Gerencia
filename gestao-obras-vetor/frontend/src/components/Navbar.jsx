import React, { useEffect, useState, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, ChevronDown, Menu, X } from 'lucide-react';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { listarPedidosPorProjeto, getRDOs, getRNCs, getNotificacoes, marcarNotificacaoLida, getRequisicoesBadges, getMensagensNaoLidasCount } from '../services/api';
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
  const projetoIdAtual = projetoMatch ? projetoMatch[1] : null;
  const [projetoIdPersistido, setProjetoIdPersistido] = useState(() => {
    try {
      return localStorage.getItem('navbar_last_project_id');
    } catch (_) {
      return null;
    }
  });

  useEffect(() => {
    if (!projetoIdAtual) return;
    setProjetoIdPersistido(projetoIdAtual);
    try {
      localStorage.setItem('navbar_last_project_id', projetoIdAtual);
    } catch (_) {
      // ignorar falha de persistencia
    }
  }, [projetoIdAtual]);

  const projetoId = projetoIdAtual || projetoIdPersistido || null;
  const temProjetoSelecionado = Boolean(projetoId);

  const [pendCompras, setPendCompras] = useState(0);
  const [pendComprasAdm, setPendComprasAdm] = useState(0);
  const [pendRequisicoes, setPendRequisicoes] = useState(0);
  const [pendRdos, setPendRdos] = useState(0);
  const [pendRnc, setPendRnc] = useState(0);
  const [pendMensagens, setPendMensagens] = useState(0);
  const [notifCompras, setNotifCompras] = useState(0);
  const [notifTotal, setNotifTotal] = useState(0);
  const [perfilDropdownOpen, setPerfilDropdownOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const perfilDropdownRef = useRef(null);
  const mobileDrawerRef = useRef(null);
  const { info } = useNotification();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const onMediaChange = (event) => {
      setIsMobileViewport(event.matches);
      if (!event.matches) setIsMobileMenuOpen(false);
    };

    setIsMobileViewport(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', onMediaChange);
      return () => mediaQuery.removeEventListener('change', onMediaChange);
    }

    mediaQuery.addListener(onMediaChange);
    return () => mediaQuery.removeListener(onMediaChange);
  }, []);

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

      try {
        const msgRes = await getMensagensNaoLidasCount();
        setPendMensagens(Number(msgRes.data?.total || 0));
      } catch (_) {
        setPendMensagens(0);
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
    setPerfilDropdownOpen(false);
    setIsMobileMenuOpen(false);
    const ok = await confirmNav(e);
    if (!ok) return;
    logout();
    navigate('/login');
  };

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (perfilDropdownRef.current && !perfilDropdownRef.current.contains(e.target)) {
        setPerfilDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    mobileDrawerRef.current?.focus();
  }, [isMobileMenuOpen]);

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
  const rotaMensagens = projetoId ? `/projeto/${projetoId}/mensagens` : '/mensagens';
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

  const handleMenuNavigation = async (e, to) => {
    const ok = await confirmNav(e, to);
    if (ok) {
      setIsMobileMenuOpen(false);
      setPerfilDropdownOpen(false);
    }
    return ok;
  };

  const renderMainLinks = () => (
    <>
      <NavLink to="/projetos" onClick={(e) => handleMenuNavigation(e, '/projetos')} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
        Projetos
      </NavLink>

      {temProjetoSelecionado && !isAlmoxarife && (
        <NavLink to={rotaDashboardProjeto} end onClick={(e) => handleMenuNavigation(e, rotaDashboardProjeto)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Dashboard
        </NavLink>
      )}

      {canViewExecucao && (
        <NavLink to={rotaExecucao} onClick={(e) => handleMenuNavigation(e, rotaExecucao)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          RDOs
          {isGestor && pendRdos > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRdos}</span>)}
        </NavLink>
      )}

      {canViewPlanejamento && (
        <NavLink to={rotaPlanejamento} onClick={(e) => handleMenuNavigation(e, rotaPlanejamento)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Planejamento
        </NavLink>
      )}

      {canViewQualidade && (
        <NavLink to={rotaQualidade} onClick={(e) => handleMenuNavigation(e, rotaQualidade)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Qualidade
          {isGestor && pendRnc > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRnc}</span>)}
        </NavLink>
      )}

      {canViewCompras && (
        <NavLink to={rotaCompras} onClick={(e) => handleMenuNavigation(e, rotaCompras)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
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
        <NavLink to={rotaAlmox} onClick={(e) => handleMenuNavigation(e, rotaAlmox)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Ativos
        </NavLink>
      )}

      <NavLink to={rotaEmail} onClick={(e) => handleMenuNavigation(e, rotaEmail)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
        Email
      </NavLink>

      <NavLink to={rotaMensagens} onClick={(e) => handleMenuNavigation(e, rotaMensagens)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
        Mensagens
        {pendMensagens > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendMensagens}</span>)}
      </NavLink>

      {canViewUsuarios && (
        <NavLink to={rotaUsuarios} onClick={(e) => handleMenuNavigation(e, rotaUsuarios)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Usuários
        </NavLink>
      )}
    </>
  );

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
            {!isMobileViewport && (
              <div className="navbar-menu grouped-menu">
                {renderMainLinks()}
              </div>
            )}
          </div>

          <button
            type="button"
            className="navbar-mobile-toggle"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="navbar-mobile-drawer"
            aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="navbar-account navbar-account-desktop">
            <div className="navbar-perfil-dropdown" ref={perfilDropdownRef} style={{ position: 'relative' }}>
              <button
                className={`navbar-link navbar-perfil-btn${perfilDropdownOpen ? ' active' : ''}`}
                onClick={() => setPerfilDropdownOpen((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <User size={16} />
                Perfil
                <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: perfilDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>
              {perfilDropdownOpen && (
                <div className="navbar-perfil-menu" style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 6,
                  background: 'var(--bg-card, #fff)',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  minWidth: 160,
                  zIndex: 1000,
                  overflow: 'hidden'
                }}>
                  {usuario && (
                    <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted, #6b7280)', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                      {usuario.nome || usuario.login}
                    </div>
                  )}
                  <NavLink
                    to={rotaPerfil}
                    onClick={async (e) => { setPerfilDropdownOpen(false); await confirmNav(e, rotaPerfil); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', textDecoration: 'none', color: 'inherit', fontSize: 14 }}
                  >
                    <User size={14} />
                    Meu Perfil
                  </NavLink>
                  <button
                    onClick={handleLogout}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-danger, #ef4444)', fontSize: 14, textAlign: 'left' }}
                  >
                    <LogOut size={14} />
                    Sair
                  </button>
                </div>
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {isMobileViewport && (
        <>
          <div
            className={`navbar-mobile-backdrop${isMobileMenuOpen ? ' open' : ''}`}
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden={!isMobileMenuOpen}
          />

          <aside
            id="navbar-mobile-drawer"
            className={`navbar-mobile-drawer${isMobileMenuOpen ? ' open' : ''}`}
            aria-hidden={!isMobileMenuOpen}
            tabIndex={-1}
            ref={mobileDrawerRef}
          >
            <div className="navbar-mobile-header">
              <span className="navbar-mobile-title">Menu</span>
              <button
                type="button"
                className="navbar-mobile-close"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>
            <div className="navbar-mobile-menu" role="navigation" aria-label="Menu principal mobile">
              {renderMainLinks()}
            </div>

            <div className="navbar-mobile-account">
              {usuario && (
                <div className="navbar-mobile-user">
                  {usuario.nome || usuario.login}
                </div>
              )}

              <NavLink
                to={rotaPerfil}
                className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
                onClick={(e) => handleMenuNavigation(e, rotaPerfil)}
              >
                <User size={16} />
                Meu Perfil
              </NavLink>

              <button
                type="button"
                className="navbar-mobile-logout"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                Sair
              </button>

              <div className="navbar-mobile-theme-toggle">
                <ThemeToggle />
              </div>
            </div>
          </aside>
        </>
      )}
    </nav>
  );
}

export default Navbar;

import React, { useEffect, useState, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, User, ChevronDown, Menu, X } from 'lucide-react';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { getRDOs, getRNCs, getRequisicoesBadges, getMensagensNaoLidasCount } from '../services/api';
import { useDialog } from '../context/DialogContext';
import ThemeToggle from './ThemeToggle';

function Navbar() {
  const { usuario, logout, isGestor, perfil } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDirty } = useLeaveGuard();
  const { confirm } = useDialog();

  // tenta extrair projetoId da rota atual (/projeto/:projetoId/...)
  const projetoMatch = (location.pathname || '').match(/\/projeto\/(\d+)/);
  const projetoIdAtual = projetoMatch ? projetoMatch[1] : null;
  const [, setProjetoIdPersistido] = useState(() => {
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

  const isProjectContext = Boolean(projetoIdAtual);
  const projetoId = isProjectContext ? projetoIdAtual : null;
  const isProjetoEntryActive = location.pathname === '/projetos' || /^\/projeto\/\d+\/?$/.test(location.pathname);

  const [pendRequisicoes, setPendRequisicoes] = useState(0);
  const [pendRdos, setPendRdos] = useState(0);
  const [pendRnc, setPendRnc] = useState(0);
  const [pendMensagens, setPendMensagens] = useState(0);
  const [perfilDropdownOpen, setPerfilDropdownOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const perfilDropdownRef = useRef(null);
  const mobileDrawerRef = useRef(null);

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
        setPendRdos(0);
        setPendRnc(0);
        return;
      }
      try {
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

  useEffect(() => {
    const loadPendenciasSuprimentos = async () => {
      if (!usuario?.id) return;
      try {
        const response = await getRequisicoesBadges(projetoId ? Number(projetoId) : undefined);
        const statusAbertos = new Set(['Em análise', 'Em cotação', 'Cotações recebidas', 'Compra autorizada']);
        const total = (response.data || [])
          .filter((item) => statusAbertos.has(item.status))
          .reduce((sum, item) => sum + Number(item.count || 0), 0);
        setPendRequisicoes(total);
      } catch (_) {
        setPendRequisicoes(0);
      }
    };
    loadPendenciasSuprimentos();
    const id = setInterval(loadPendenciasSuprimentos, 30000);
    return () => clearInterval(id);
  }, [usuario?.id, projetoId, location.pathname]);

  useEffect(() => {
    const loadMensagens = async () => {
      if (!usuario?.id) return;
      try {
        const msgRes = await getMensagensNaoLidasCount();
        setPendMensagens(Number(msgRes.data?.total || 0));
      } catch (_) {
        setPendMensagens(0);
      }
    };
    loadMensagens();
    const id = setInterval(loadMensagens, 30000);
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

  const rotaDashboard = isProjectContext ? `/projeto/${projetoId}` : '/projetos';
  const rotaCompras = isProjectContext ? `/projeto/${projetoId}/compras` : '/compras';
  const rotaUsuarios = isProjectContext ? `/projeto/${projetoId}/usuarios` : '/usuarios';
  const rotaAlmox = isProjectContext ? `/projeto/${projetoId}/almoxarifado` : '/ativos';
  const rotaExecucao = isProjectContext ? `/projeto/${projetoId}/rdos` : '/rdos';
  const rotaQualidade = isProjectContext ? `/projeto/${projetoId}/rnc` : '/rnc';
  const rotaPlanejamento = isProjectContext ? `/projeto/${projetoId}/planejamento` : '/planejamento';
  const rotaEmail = isProjectContext ? `/projeto/${projetoId}/email-dashboard` : '/email-dashboard';
  const rotaMensagens = isProjectContext ? `/projeto/${projetoId}/mensagens` : '/mensagens';
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

  const abrirSuprimentosPendentes = async () => {
    setIsMobileMenuOpen(false);
    setPerfilDropdownOpen(false);
    if (isDirty) {
      await confirmNav(null, rotaCompras);
      return;
    }
    navigate(rotaCompras);
  };

  const renderMainLinks = () => (
    <>
      {isProjectContext && (
        <NavLink
          to="/projetos"
          onClick={(e) => handleMenuNavigation(e, '/projetos')}
          className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
        >
          Projetos
        </NavLink>
      )}

      {isProjectContext && (
        <NavLink to={rotaDashboard} end onClick={(e) => handleMenuNavigation(e, rotaDashboard)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Dashboard
        </NavLink>
      )}

      {!isProjectContext && (
        <NavLink
          to="/projetos"
          onClick={(e) => handleMenuNavigation(e, '/projetos')}
          className={({ isActive }) => `navbar-link${(isActive || isProjetoEntryActive) ? ' active' : ''}`}
        >
          Projetos
        </NavLink>
      )}

      {!isProjectContext && canViewCompras && (
        <NavLink to={rotaCompras} onClick={(e) => handleMenuNavigation(e, rotaCompras)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Suprimentos
          {pendRequisicoes > 0 && (
            <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRequisicoes}</span>
          )}
        </NavLink>
      )}

      {!isProjectContext && canViewUsuarios && (
        <NavLink to={rotaUsuarios} onClick={(e) => handleMenuNavigation(e, rotaUsuarios)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Usuários
        </NavLink>
      )}

      {isProjectContext && canViewExecucao && (
        <NavLink to={rotaExecucao} onClick={(e) => handleMenuNavigation(e, rotaExecucao)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          RDOs
          {isGestor && pendRdos > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRdos}</span>)}
        </NavLink>
      )}

      {isProjectContext && canViewPlanejamento && (
        <NavLink to={rotaPlanejamento} onClick={(e) => handleMenuNavigation(e, rotaPlanejamento)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Planejamento
        </NavLink>
      )}

      {isProjectContext && canViewQualidade && (
        <NavLink to={rotaQualidade} onClick={(e) => handleMenuNavigation(e, rotaQualidade)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Qualidade
          {isGestor && pendRnc > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRnc}</span>)}
        </NavLink>
      )}

      {isProjectContext && canViewAtivos && (
        <NavLink to={rotaAlmox} onClick={(e) => handleMenuNavigation(e, rotaAlmox)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Ativos
        </NavLink>
      )}

      {isProjectContext && canViewCompras && (
        <NavLink to={rotaCompras} onClick={(e) => handleMenuNavigation(e, rotaCompras)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Suprimentos
          {pendRequisicoes > 0 && (
            <span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendRequisicoes}</span>
          )}
        </NavLink>
      )}

      {isProjectContext && (
        <NavLink to={rotaEmail} onClick={(e) => handleMenuNavigation(e, rotaEmail)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Email
        </NavLink>
      )}

      {isProjectContext && (
        <NavLink to={rotaMensagens} onClick={(e) => handleMenuNavigation(e, rotaMensagens)} className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}>
          Mensagens
          {pendMensagens > 0 && (<span className="badge badge-red" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 11 }}>{pendMensagens}</span>)}
        </NavLink>
      )}

      {isProjectContext && canViewUsuarios && (
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
              <span className="navbar-brand-subtitle">Gestão de Obras</span>
            </div>
          </NavLink>

          <div className="navbar-main">
            {!isMobileViewport && (
              <div className="navbar-menu grouped-menu">
                {renderMainLinks()}
              </div>
            )}
          </div>

          {canViewCompras && (
            <div className="navbar-mobile-supply-bell">
              <button
                type="button"
                className="notif-bell-btn"
                onClick={abrirSuprimentosPendentes}
                aria-label={pendRequisicoes > 0
                  ? `${pendRequisicoes} processo(s) de suprimentos em aberto`
                  : 'Abrir suprimentos'}
                title={pendRequisicoes > 0
                  ? `${pendRequisicoes} processo(s) de suprimentos em aberto`
                  : 'Suprimentos'}
              >
                <Bell size={19} />
                {pendRequisicoes > 0 && (
                  <span className="notif-bell-badge">{pendRequisicoes > 99 ? '99+' : pendRequisicoes}</span>
                )}
              </button>
            </div>
          )}

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
            {canViewCompras && (
              <div className="notif-bell-wrapper">
                <button
                  type="button"
                  className="notif-bell-btn"
                  onClick={abrirSuprimentosPendentes}
                  aria-label={pendRequisicoes > 0
                    ? `${pendRequisicoes} processo(s) de suprimentos em aberto`
                    : 'Abrir suprimentos'}
                  title={pendRequisicoes > 0
                    ? `${pendRequisicoes} processo(s) de suprimentos em aberto`
                    : 'Suprimentos'}
                >
                  <Bell size={19} />
                  {pendRequisicoes > 0 && (
                    <span className="notif-bell-badge">{pendRequisicoes > 99 ? '99+' : pendRequisicoes}</span>
                  )}
                </button>
              </div>
            )}
            <div className="navbar-perfil-dropdown" ref={perfilDropdownRef}>
              <button
                className={`navbar-link navbar-perfil-btn${perfilDropdownOpen ? ' active' : ''}`}
                onClick={() => setPerfilDropdownOpen((v) => !v)}
              >
                <User size={16} />
                Perfil
                <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: perfilDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>
              {perfilDropdownOpen && (
                <div className="navbar-perfil-menu">
                  {usuario && (
                    <div className="navbar-perfil-menu-user">
                      {usuario.nome || usuario.login}
                    </div>
                  )}
                  <NavLink
                    to={rotaPerfil}
                    onClick={async (e) => { setPerfilDropdownOpen(false); await confirmNav(e, rotaPerfil); }}
                    className="navbar-perfil-menu-link"
                  >
                    <User size={14} />
                    Meu Perfil
                  </NavLink>
                  <button
                    onClick={handleLogout}
                    className="navbar-perfil-menu-logout"
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

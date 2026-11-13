import React, { useCallback, useEffect, useState, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, User, Settings, SlidersHorizontal, Sparkles, Menu, X, CalendarDays, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import {
  getRDOs, getRNCs, getRequisicoesBadges, getMensagensNaoLidasCount,
  getNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas
} from '../services/api';
import { useDialog } from '../context/DialogContext';
import './AccountSettings.css';
import MeetingReminderNotice from './agenda/MeetingReminderNotice';
import SidebarLinks from './SidebarLinks';

function Navbar() {
  const { usuario, logout, selecionarTenant, isGestor, perfil } = useAuth();
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

  const [pendRequisicoes, setPendRequisicoes] = useState(0);
  const [supplyCounts, setSupplyCounts] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return sessionStorage.getItem('vetor_sidebar_collapsed') === 'true'; } catch { return false; } });
  const [openGroups, setOpenGroups] = useState({});
  const [pendRdos, setPendRdos] = useState(0);
  const [pendRnc, setPendRnc] = useState(0);
  const [pendMensagens, setPendMensagens] = useState(0);
  const [notificacoes, setNotificacoes] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isMarkingNotifications, setIsMarkingNotifications] = useState(false);
  const [perfilDropdownOpen, setPerfilDropdownOpen] = useState(false);
  const settingsTriggerRef=useRef(null);
  useEffect(()=>{if(!perfilDropdownOpen)return;const onKey=e=>{if(e.key==='Escape'){setPerfilDropdownOpen(false);settingsTriggerRef.current?.focus();}};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[perfilDropdownOpen]);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const perfilDropdownRef = useRef(null);
  const notificationRequest = useRef(0);
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
        const rdosCount = rdos.filter((r) => {
          if (['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'].includes(perfil)) return r.status === 'Em aprovação do gestor';
          if (perfil === 'Fiscal') return r.status === 'Em aprovação do fiscal';
          return false;
        }).length;
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
        const counts = {};
        (response.data || []).forEach((item) => { counts[item.status] = (counts[item.status] || 0) + Number(item.count || 0); });
        setSupplyCounts(counts);
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

  const carregarNotificacoes = useCallback(async () => {
    if (!usuario?.id) return;
    const request = ++notificationRequest.current;
    try {
      const response = await getNotificacoes();
      if (request === notificationRequest.current) setNotificacoes(response.data || []);
    } catch (_) {
      // Preserva os avisos na falha de rede; a próxima consulta tenta novamente.
    }
  }, [usuario?.id, usuario?.tenant_id]);

  useEffect(() => {
    setNotificacoes([]);
    carregarNotificacoes();
    const id = setInterval(carregarNotificacoes, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') carregarNotificacoes(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('vetor:notificacoes-atualizar', carregarNotificacoes);
    return () => {
      clearInterval(id); notificationRequest.current++;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('vetor:notificacoes-atualizar', carregarNotificacoes);
    };
  }, [carregarNotificacoes]);

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
    setNotifOpen(false);
    const ok = await confirmNav(e);
    if (!ok) return;
    logout();
    navigate('/login');
  };

  const handleTenantChange = async (event) => {
    const tenantId = Number(event.target.value);
    if (!tenantId || tenantId === Number(usuario?.tenant_id)) return;
    const ok = await confirmNav();
    if (!ok) return;
    selecionarTenant(tenantId);
    setPerfilDropdownOpen(false);
    navigate('/projetos');
  };

  const renderTenantSelector = () => {
    if (!Array.isArray(usuario?.tenants) || usuario.tenants.length < 2) return null;
    return (
      <select
        value={Number(usuario.tenant_id) || ''}
        onChange={handleTenantChange}
        aria-label="Selecionar empresa"
        title="Selecionar empresa/CNPJ"
        style={{ maxWidth: 170, padding: '6px 8px', borderRadius: 6 }}
      >
        {usuario.tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>{tenant.nome}</option>
        ))}
      </select>
    );
  };

  useEffect(() => {
    const handler = (e) => {
      if (perfilDropdownRef.current && !perfilDropdownRef.current.contains(e.target)) {
        setPerfilDropdownOpen(false);
      }
      if (!e.target.closest('.notif-bell-wrapper')) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!notifOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [notifOpen]);

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

  const rotaPerfil = '/perfil';
  const isGestorGeral = perfil === 'Gestor Geral';
  const isGestorObra = perfil === 'Gestor da Obra' || perfil === 'Gestor Local';
  const isAdministrativo = perfil === 'ADM';
  const isFinanceiro = perfil === 'Financeiro';
  const isAlmoxarife = perfil === 'Almoxarife';

  const canViewCompras = isGestorGeral || isGestorObra || isAdministrativo || isFinanceiro || isAlmoxarife;

  const handleMenuNavigation = async (e, to) => {
    const ok = await confirmNav(e, to);
    if (ok) {
      setIsMobileMenuOpen(false);
      setPerfilDropdownOpen(false);
      setNotifOpen(false);
    }
    return ok;
  };

  const toggleNotificacoes = () => {
    setIsMobileMenuOpen(false);
    setPerfilDropdownOpen(false);
    setNotifOpen((open) => !open);
    carregarNotificacoes();
  };

  const marcarNotificacao = async (id) => {
    try {
      await marcarNotificacaoLida(id);
      setNotificacoes((items) => items.filter((item) => item.id !== id));
    } catch (_) {
      // Mantém a notificação visível para uma nova tentativa.
    }
  };

  const marcarTodasNotificacoes = async () => {
    if (notificacoes.length === 0 || isMarkingNotifications) return;
    setIsMarkingNotifications(true);
    try {
      await marcarTodasNotificacoesLidas();
      setNotificacoes([]);
    } finally {
      setIsMarkingNotifications(false);
    }
  };

  const formatarDataNotificacao = (value) => {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
  };

  const notificationBadgeCount = notificacoes.length + (canViewCompras ? pendRequisicoes : 0);

  const abrirNotificacao = async (notificacao) => {
    if(notificacao?.referencia_tipo==='sistema_atualizacao' && notificacao?.nota_slug){
      const to=`/notas-de-atualizacao?nota=${encodeURIComponent(notificacao.nota_slug)}`;
      if(!await confirmNav(null,to))return;
      setNotifOpen(false);navigate(to);return;
    }
    if (notificacao?.referencia_tipo === 'reuniao' && notificacao?.projeto_id) {
      if (!await confirmNav()) return;
      await marcarNotificacao(notificacao.id);
      setNotifOpen(false);
      navigate(`/projeto/${notificacao.projeto_id}/mensagens?tab=agenda&reuniao=${notificacao.referencia_id}`);
      return;
    }
    if (notificacao?.referencia_tipo === 'estoque_transferencia') {
      await marcarNotificacao(notificacao.id);
      setNotifOpen(false);
      navigate(notificacao.projeto_id ? `/projeto/${notificacao.projeto_id}/compras/estoque` : '/compras/estoque');
      return;
    }
    await marcarNotificacao(notificacao.id);
  };

  const renderNotificationBell = () => (
    <div className="notif-bell-wrapper">
      <button
        type="button"
        className="notif-bell-btn"
        onClick={toggleNotificacoes}
        aria-label={notificationBadgeCount > 0
          ? `${notificationBadgeCount} notificação(ões) pendente(s)`
          : 'Abrir notificações'}
        aria-expanded={notifOpen}
        title="Notificações"
      >
        <Bell size={19} />
        {notificationBadgeCount > 0 && (
          <span className="notif-bell-badge">{notificationBadgeCount > 99 ? '99+' : notificationBadgeCount}</span>
        )}
      </button>

      {notifOpen && (
        <div className="notif-dropdown" role="dialog" aria-label="Notificações">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notificações</span>
            <button
              type="button"
              className="notif-mark-all-btn"
              onClick={marcarTodasNotificacoes}
              disabled={notificacoes.length === 0 || isMarkingNotifications}
            >
              {isMarkingNotifications ? 'Lendo...' : 'Marcar todas como lidas'}
            </button>
          </div>
          {canViewCompras && (
          <div className="notif-supply-summary">
            <Bell size={16} aria-hidden="true" />
            <span>
              {pendRequisicoes > 0
                ? `${pendRequisicoes} processo(s) de suprimentos em aberto.`
                : 'Nenhum processo de suprimentos em aberto.'}
            </span>
          </div>
          )}
          <div className="notif-dropdown-list">
            {notificacoes.length === 0 ? (
              <div className="notif-empty">Não há notificações não lidas.</div>
            ) : notificacoes.map((notificacao) => (
              <div
                className={`notif-item${['reuniao', 'estoque_transferencia','sistema_atualizacao'].includes(notificacao.referencia_tipo) ? ' notif-item-clickable' : ''}`}
                key={notificacao.id}
                onClick={() => abrirNotificacao(notificacao)}
                role={['reuniao', 'estoque_transferencia','sistema_atualizacao'].includes(notificacao.referencia_tipo) ? 'button' : undefined}
                tabIndex={['reuniao', 'estoque_transferencia','sistema_atualizacao'].includes(notificacao.referencia_tipo) ? 0 : undefined}
                onKeyDown={(event) => {
                  if(event.target===event.currentTarget && (event.key==='Enter'||event.key===' ')){event.preventDefault();abrirNotificacao(notificacao);}
                }}
              >
                <div className="notif-item-icon">
                  {notificacao.referencia_tipo==='sistema_atualizacao'?<Sparkles size={16} aria-hidden="true"/>:notificacao.referencia_tipo === 'reuniao'
                    ? <CalendarDays size={16} aria-hidden="true" />
                    : <Bell size={16} aria-hidden="true" />}
                </div>
                <div className="notif-item-body">
                  {notificacao.titulo && <span className="notif-item-title">{notificacao.titulo}</span>}
                  <span className="notif-item-msg">{notificacao.mensagem}</span>
                  <span className="notif-item-time">{formatarDataNotificacao(notificacao.criado_em)}</span>
                </div>
                <button
                  type="button"
                  className="notif-item-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    marcarNotificacao(notificacao.id);
                  }}
                  aria-label="Marcar notificação como lida"
                  title="Marcar como lida"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  useEffect(() => {
    document.body.classList.add('has-app-sidebar');
    document.body.classList.toggle('app-sidebar-collapsed', sidebarCollapsed);
    try { sessionStorage.setItem('vetor_sidebar_collapsed', String(sidebarCollapsed)); } catch (_) { /* armazenamento opcional */ }
    return () => document.body.classList.remove('has-app-sidebar', 'app-sidebar-collapsed');
  }, [sidebarCollapsed]);
  const renderMainLinks = () => <SidebarLinks projetoId={projetoId} perfil={perfil} isGestor={isGestor} counts={{ supply: pendRequisicoes, status: supplyCounts, rdos: pendRdos, rnc: pendRnc, messages: pendMensagens }} onNavigate={handleMenuNavigation} collapsed={!isMobileViewport && sidebarCollapsed} onExpand={() => setSidebarCollapsed(false)} />;

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-content">
          <NavLink to="/projetos" onClick={(e) => handleMenuNavigation(e, "/projetos")} className="navbar-brand">
            <div className="navbar-brand-left">
              <img src={`${import.meta.env.BASE_URL}logo_vetor.png`} alt="Vetor" className="navbar-logo-img" />
              <span className="navbar-brand-name">Vetor</span>
              <span className="navbar-brand-subtitle">Gestão de Obras</span>
            </div>
          </NavLink>

          <div className="navbar-main" />

          <div className="navbar-mobile-supply-bell">
            {renderNotificationBell()}
          </div>

          <button
            type="button"
            className="navbar-mobile-toggle"
            onClick={() => {
              setNotifOpen(false);
              setIsMobileMenuOpen((prev) => !prev);
            }}
            aria-expanded={isMobileMenuOpen}
            aria-controls="navbar-mobile-drawer"
            aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="navbar-account navbar-account-desktop">
            {renderTenantSelector()}
            {renderNotificationBell()}
            <div className="navbar-perfil-dropdown" ref={perfilDropdownRef}>
              <button
                type="button"
                ref={settingsTriggerRef}
                aria-label="Configurações e conta"
                title="Configurações e conta"
                aria-expanded={perfilDropdownOpen}
                aria-controls="navbar-settings-menu"
                className={`navbar-link navbar-perfil-btn${perfilDropdownOpen ? ' active' : ''}`}
                onClick={() => {setNotifOpen(false);setPerfilDropdownOpen((v) => !v);}}
              >
                <Settings size={20} />
                {notificacoes.some(n=>n.referencia_tipo==='sistema_atualizacao')&&<span className="account-settings-dot" aria-label="Novas notas de atualização"/>}
              </button>
              {perfilDropdownOpen && (
                <div className="navbar-perfil-menu" id="navbar-settings-menu">
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
                  <NavLink to="/configuracoes" onClick={e=>handleMenuNavigation(e,'/configuracoes')} className="navbar-perfil-menu-link"><SlidersHorizontal size={14}/>Configurações do sistema</NavLink>
                  <NavLink to="/notas-de-atualizacao" onClick={e=>handleMenuNavigation(e,'/notas-de-atualizacao')} className="navbar-perfil-menu-link"><Sparkles size={14}/>Notas de atualização{notificacoes.some(n=>n.referencia_tipo==='sistema_atualizacao')&&<span className="account-settings-new">Nova</span>}</NavLink>
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
          </div>
        </div>
      </div>

      {!isMobileViewport && <aside className={`app-sidebar${sidebarCollapsed ? ' collapsed' : ''}`} aria-label="Menu principal">
        <div className="app-sidebar-heading"><span>Navegação</span><button type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}>{sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button></div>
        <div className="app-sidebar-links" role="navigation" aria-label="Navegação principal">{renderMainLinks()}</div>
      </aside>}
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
              {renderTenantSelector()}
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

              <NavLink to="/configuracoes" className="navbar-link" onClick={e=>handleMenuNavigation(e,'/configuracoes')}><SlidersHorizontal size={16}/>Configurações do sistema</NavLink>
              <NavLink to="/notas-de-atualizacao" className="navbar-link" onClick={e=>handleMenuNavigation(e,'/notas-de-atualizacao')}><Sparkles size={16}/>Notas de atualização{notificacoes.some(n=>n.referencia_tipo==='sistema_atualizacao')&&<span className="account-settings-new">Nova</span>}</NavLink>
            </div>
          </aside>
        </>
      )}
      <MeetingReminderNotice key={`${usuario?.tenant_id}:${usuario?.id}`} scope={`${usuario?.tenant_id}:${usuario?.id}`} notifications={notificacoes} onOpen={abrirNotificacao} />
    </nav>
  );
}

export default Navbar;

import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { Boxes, LayoutDashboard, Package, ArrowUpRight, ArrowDownLeft, Wrench, ShieldAlert, BarChart3 } from 'lucide-react';
import Navbar from './Navbar';
import './Almoxarifado.css';

const navigation = [
  ['', 'Visão geral', LayoutDashboard],
  ['/ferramentas', 'Cadastro de ativos', Package],
  ['/retirada', 'Retirada', ArrowUpRight],
  ['/devolucao', 'Devolução', ArrowDownLeft],
  ['/manutencao', 'Manutenção', Wrench],
  ['/perdas', 'Perdas', ShieldAlert],
  ['/relatorios', 'Relatórios', BarChart3]
];

function AlmoxarifadoLayout({ title, description, children, extraHeader }) {
  const { projetoId } = useParams();
  const { pathname } = useLocation();
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    const mostrarSecaoAtual = () => {
      const active = nav.querySelector('[aria-current="page"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const itemBounds = active.getBoundingClientRect();
      nav.scrollLeft += itemBounds.left - nav.getBoundingClientRect().left - (nav.clientWidth - itemBounds.width) / 2;
    };
    mostrarSecaoAtual();
    const observer = new ResizeObserver(mostrarSecaoAtual);
    observer.observe(nav);
    nav.querySelectorAll('a').forEach((link) => observer.observe(link));
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <>
      <Navbar />
      <div className="container almox-container assets-workspace">
        <div className="almox-layout">
          <aside className="almox-sidebar card">
            <div className="assets-nav-heading">
              <span className="assets-nav-symbol"><Boxes size={21} aria-hidden="true" /></span>
              <div><strong>Ativos</strong><span>Controle da obra</span></div>
            </div>
            <nav ref={navRef} className="almox-nav" aria-label="Navegação de ativos">
              {navigation.map(([path, label, Icon]) => (
                <NavLink key={path} to={`/projeto/${projetoId}/almoxarifado${path}`} end={!path} className={({ isActive }) => `almox-nav-link${isActive ? ' active' : ''}`}>
                  <Icon size={17} aria-hidden="true" /><span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </aside>

          <main className="almox-content">
            <header className="assets-page-heading">
              <div>
                <span className="assets-eyebrow">Gestão de ativos</span>
                <h1>{title}</h1>
                {description && <p>{description}</p>}
              </div>
              {extraHeader || null}
            </header>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

export default AlmoxarifadoLayout;

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, FolderKanban, LayoutDashboard, ClipboardList, Layers, ShieldCheck, Boxes, ShoppingCart, Mail, MessageSquare, Users } from 'lucide-react';

export default function SidebarLinks({ projetoId, perfil, isGestor, counts, onNavigate, collapsed, onExpand }) {
  const location = useLocation();
  const [open, setOpen] = useState({});
  const project = Boolean(projetoId);
  const base = `/projeto/${projetoId}`;
  const compras = project ? `${base}/compras` : '/compras';
  const manager = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'].includes(perfil);
  const quality = manager || perfil === 'Fiscal';
  const supply = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'ADM', 'Financeiro', 'Almoxarife'].includes(perfil);
  const assets = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'ADM', 'Almoxarife'].includes(perfil);
  const supplierAdmin = ['Gestor Geral', 'ADM', 'Financeiro'].includes(perfil);
  const statuses = [['solicitado', 'Solicitado', 'Em análise'], ['em-cotacao', 'Em cotação', 'Em cotação'], ['cotacoes-recebidas', 'Cotações recebidas', 'Cotações recebidas'], ['aprovado-compra', 'Aprovado p/ compra', 'Compra autorizada']];
  const highlight = { ADM: ['em-cotacao', 'aprovado-compra'], Financeiro: ['em-cotacao', 'aprovado-compra'], 'Gestor Geral': ['solicitado', 'cotacoes-recebidas'], 'Gestor da Obra': ['solicitado', 'cotacoes-recebidas'], 'Gestor Local': ['solicitado'], Almoxarife: ['solicitado'] };
  const groups = [
    ...(project && manager ? [{ id: 'planejamento', label: 'Planejamento', Icon: Layers, match: /\/(planejamento|eap|curva-s|gantt)(\/|$)/, items: [['EAP', `${base}/planejamento?aba=eap`], ['Curva S', `${base}/planejamento?aba=curva-s`], ['Cronograma', `${base}/planejamento?aba=gantt`]] }] : []),
    ...(project && (quality || perfil === 'ADM' || perfil === 'Almoxarife') ? [{ id: 'qualidade', label: 'Qualidade', Icon: ShieldCheck, badge: isGestor && counts.rnc, match: /\/(qualidade|rnc|rastreabilidade-materiais)(\/|$)/, items: [
      ...(quality ? [['Visão geral', `${base}/qualidade`], ['RNC', `${base}/rnc`]] : []),
      ...(perfil !== 'Almoxarife' ? [['Folhas de verificação', `${base}/qualidade/folhas`]] : []),
      ...(['Gestor Geral', 'Gestor da Qualidade', 'Gestor de Qualidade', 'ADM'].includes(perfil) ? [['Modelos de folhas', `${base}/qualidade/modelos`]] : []),
      ...(perfil !== 'Gestor Local' ? [['Rastreabilidade de materiais', `${base}/rastreabilidade-materiais`]] : []),
    ] }] : []),
    ...(project && assets ? [{ id: 'ativos', label: 'Ativos', Icon: Boxes, match: /\/almoxarifado(\/|$)/, items: [['Visão geral', `${base}/almoxarifado`], ['Cadastro de ativos', `${base}/almoxarifado/ferramentas`], ['Retirada', `${base}/almoxarifado/retirada`], ['Devolução', `${base}/almoxarifado/devolucao`], ['Manutenção', `${base}/almoxarifado/manutencao`], ['Perdas', `${base}/almoxarifado/perdas`], ['Relatórios', `${base}/almoxarifado/relatorios`]] }] : []),
    ...(supply ? [{ id: 'suprimentos', label: 'Suprimentos', Icon: ShoppingCart, badge: counts.supply, match: /\/(compras|fornecedores)(\/|$)/, items: [['Requisições', compras], ['Estoque', `${compras}/estoque`], ...statuses.map(([slug, label, status]) => [label, `${compras}/status/${slug}`, counts.status[status], (highlight[perfil] || []).includes(slug)]), ['Finalizadas', `${compras}/finalizadas`], ['Negadas/Canceladas', `${compras}/negadas`], ...(supplierAdmin ? [['Fornecedores', project ? `${compras}/fornecedores` : '/fornecedores']] : [])] }] : []),
  ];
  const activeGroup = groups.find((group) => group.match.test(location.pathname))?.id;
  useEffect(() => { if (activeGroup) setOpen((current) => ({ ...current, [activeGroup]: true })); }, [activeGroup, location.pathname, location.search]);

  const isActive = (to) => {
    const [path, query] = to.split('?');
    if (query) {
      const tab = new URLSearchParams(query).get('aba');
      const selected = new URLSearchParams(location.search).get('aba') || 'eap';
      return (location.pathname === path && selected === tab) || location.pathname === `${base}/${tab}` || (tab === 'eap' && location.pathname.startsWith(`${base}/eap/`));
    }
    if (location.pathname === path) return true;
    return ![compras, `${base}/qualidade`, `${base}/almoxarifado`, '/projetos', base].includes(path) && location.pathname.startsWith(`${path}/`);
  };
  const link = (label, to, Icon, badge) => <Link key={to} to={to} onClick={(e) => onNavigate(e, to)} className={`sidebar-link${isActive(to) ? ' active' : ''}`} aria-current={isActive(to) ? 'page' : undefined} title={label}><Icon size={19} aria-hidden="true" /><span>{label}</span>{badge > 0 && <span className="sidebar-badge">{badge}</span>}</Link>;
  return <>
    {link('Projetos', '/projetos', FolderKanban)}
    {project && link('Dashboard', base, LayoutDashboard)}
    {project && quality && link('RDOs', `${base}/rdos`, ClipboardList, isGestor && counts.rdos)}
    {groups.map(({ id, label, Icon, badge, items }) => <div className="sidebar-group" key={id}>
      <button type="button" className={`sidebar-group-toggle${activeGroup === id ? ' active' : ''}`} aria-expanded={!!open[id]} title={label} onClick={() => { if (collapsed) { onExpand(); setOpen((current) => ({ ...current, [id]: true })); } else setOpen((current) => ({ ...current, [id]: !current[id] })); }}><Icon size={19} aria-hidden="true" /><span>{label}</span>{badge > 0 && <span className="sidebar-badge">{badge}</span>}<ChevronDown className={`sidebar-chevron${open[id] ? ' open' : ''}`} size={16} aria-hidden="true" /></button>
      {open[id] && <div className="sidebar-submenu">{items.map(([name, to, count, emphasized]) => <Link key={to} to={to} onClick={(e) => onNavigate(e, to)} className={`sidebar-sublink${isActive(to) ? ' active' : ''}`} aria-current={isActive(to) ? 'page' : undefined}><span>{name}</span>{count > 0 && <span className={`sidebar-badge${emphasized ? ' highlight' : ''}`}>{count}</span>}</Link>)}</div>}
    </div>)}
    {project && link('Email', `${base}/email-dashboard`, Mail)}
    {project && link('Mensagens', `${base}/mensagens`, MessageSquare, counts.messages)}
    {['Gestor Geral', 'ADM'].includes(perfil) && link('Usuários', project ? `${base}/usuarios` : '/usuarios', Users)}
  </>;
}

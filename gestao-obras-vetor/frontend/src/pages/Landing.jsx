import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  HardHat,
  Layers3,
  Mail,
  Menu,
  PackageCheck,
  ShieldCheck,
  X,
} from 'lucide-react';
import './Landing.css';

const CONTACT_EMAIL = 'contatovetorgerenciamento@gmail.com';

const modules = [
  { icon: Layers3, title: 'Projetos e EAP', text: 'Estruture etapas, atividades, responsaveis e avancos em uma unica visao.' },
  { icon: Clock3, title: 'RDO', text: 'Registre diarios de obra com historico, revisoes e evidencias de campo.' },
  { icon: ClipboardCheck, title: 'RNC', text: 'Acompanhe nao conformidades, tratativas e correcoes com rastreabilidade.' },
  { icon: PackageCheck, title: 'Compras e ativos', text: 'Controle requisicoes, cotacoes, ferramentas, retiradas e devolucoes.' },
];

const features = [
  'Planejamento fisico e acompanhamento por projeto',
  'Indicadores para gestores, fiscais e equipes de qualidade',
  'Fluxos de compras, almoxarifado, RDO e RNC conectados',
];

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const mailTo = `mailto:${CONTACT_EMAIL}?subject=Quero%20conhecer%20a%20Vetor`;

  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-nav">
          <a className="landing-brand" href="#inicio" onClick={closeMenu}>
            <img src="/logo_externo_vetor.png" alt="Vetor" />
          </a>

          <nav className={`landing-nav-links ${menuOpen ? 'open' : ''}`} aria-label="Navegacao principal">
            <a href="#solucoes" onClick={closeMenu}>Solucoes</a>
            <a href="#modulos" onClick={closeMenu}>Modulos</a>
            <a href="#seguranca" onClick={closeMenu}>Seguranca</a>
            <a href="#contato" onClick={closeMenu}>Contato</a>
          </nav>

          <div className="landing-nav-actions">
            <Link className="landing-btn landing-btn-outline" to="/login">Entrar</Link>
            <button
              type="button"
              className="landing-menu-btn"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero" id="inicio">
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-kicker">Gerenciamento, consultoria e tecnologia</span>
            <h1>Gestao de obras com controle real, do planejamento ao campo.</h1>
            <p>
              A Vetor centraliza projetos, RDO, RNC, compras, ativos e indicadores para equipes que precisam
              decidir rapido sem perder rastreabilidade.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-btn landing-btn-primary" to="/login">
                Entrar no sistema
                <ArrowRight size={18} />
              </Link>
              <a className="landing-btn landing-btn-light" href={mailTo}>
                <Mail size={18} />
                Falar com a Vetor
              </a>
            </div>
            <div className="landing-hero-points">
              {features.map((feature) => (
                <span key={feature}>
                  <CheckCircle2 size={18} />
                  {feature}
                </span>
              ))}
            </div>
          </div>

          <div className="landing-product" aria-label="Previa visual do sistema Vetor">
            <div className="landing-product-top">
              <img src="/logo_vetor.png" alt="" />
              <span>Obra Residencial Aurora</span>
            </div>
            <div className="landing-product-stats">
              <div>
                <small>Avanco fisico</small>
                <strong>74%</strong>
              </div>
              <div>
                <small>RDOs no mes</small>
                <strong>28</strong>
              </div>
              <div>
                <small>RNCs abertas</small>
                <strong>05</strong>
              </div>
            </div>
            <div className="landing-product-body">
              <div className="landing-chart">
                <div style={{ height: '54%' }} />
                <div style={{ height: '72%' }} />
                <div style={{ height: '48%' }} />
                <div style={{ height: '88%' }} />
                <div style={{ height: '66%' }} />
                <div style={{ height: '79%' }} />
              </div>
              <div className="landing-timeline">
                <span><b>Fundacao</b><i>Concluido</i></span>
                <span><b>Estrutura</b><i>Em andamento</i></span>
                <span><b>Acabamento</b><i>Planejado</i></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-strip" id="solucoes">
        <div className="landing-container landing-strip-inner">
          <span>Uma plataforma para acompanhar obra, suprimentos e qualidade com clareza operacional.</span>
          <div>
            <b>RDO</b>
            <b>RNC</b>
            <b>EAP</b>
            <b>Compras</b>
            <b>Ativos</b>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container landing-split">
          <div>
            <span className="landing-kicker">Controle integrado</span>
            <h2>Menos planilhas soltas. Mais contexto para gerir a obra.</h2>
            <p>
              A Vetor conecta rotinas que normalmente ficam dispersas: planejamento, acompanhamento diario,
              nao conformidades, compras e ativos. O resultado e uma leitura mais precisa do que esta acontecendo.
            </p>
          </div>
          <div className="landing-checklist">
            <span><CheckCircle2 size={20} /> Historico por projeto e por usuario</span>
            <span><CheckCircle2 size={20} /> Indicadores de prazo, qualidade e suprimentos</span>
            <span><CheckCircle2 size={20} /> Perfis de acesso para cada papel da equipe</span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-dark" id="modulos">
        <div className="landing-container">
          <div className="landing-section-head">
            <span className="landing-kicker">Modulos do sistema</span>
            <h2>Ferramentas para a rotina de quem executa e acompanha obras.</h2>
          </div>
          <div className="landing-modules">
            {modules.map(({ icon: Icon, title, text }) => (
              <article className="landing-module" key={title}>
                <Icon size={28} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="seguranca">
        <div className="landing-container landing-security">
          <div>
            <span className="landing-kicker">Gestao com governanca</span>
            <h2>Dados organizados, acessos definidos e decisoes rastreaveis.</h2>
            <p>
              O sistema foi estruturado para equipes com multiplos perfis, mantendo cada usuario no fluxo certo
              e preservando o registro das acoes importantes.
            </p>
          </div>
          <div className="landing-security-grid">
            <span><ShieldCheck size={24} /> Controle por perfil</span>
            <span><FileText size={24} /> Documentos e evidencias</span>
            <span><BarChart3 size={24} /> Indicadores executivos</span>
            <span><HardHat size={24} /> Rotina de campo</span>
          </div>
        </div>
      </section>

      <section className="landing-contact" id="contato">
        <div className="landing-container landing-contact-inner">
          <div>
            <span className="landing-kicker">Contato</span>
            <h2>Quer adaptar a Vetor para sua operacao?</h2>
            <p>Fale com a equipe e solicite uma demonstracao do sistema.</p>
          </div>
          <a className="landing-btn landing-btn-primary" href={mailTo}>
            <Mail size={18} />
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <img src="/logo_externo_vetor.png" alt="Vetor" />
          <span>© {new Date().getFullYear()} Vetor. Todos os direitos reservados.</span>
        </div>
      </footer>
    </main>
  );
}

export default Landing;

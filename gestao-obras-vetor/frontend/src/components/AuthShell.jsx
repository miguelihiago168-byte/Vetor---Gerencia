import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AuthShell({ mode = 'login', children }) {
  const creating = mode === 'register';
  const visual = creating
    ? {
      image: `${import.meta.env.BASE_URL}auth-substation.png`,
      label: 'OPERAÇÃO CONECTADA',
      title: <>Conecte pessoas,<br /><em>projetos e decisões.</em></>,
      description: 'Comece com uma base organizada para acompanhar cada etapa da obra.',
      mantra: <>CONECTAR<br />PADRONIZAR<br />COORDENAR<br />ENTREGAR</>,
    }
    : {
      image: `${import.meta.env.BASE_URL}auth-solar-plant.png`,
      label: 'ENERGIA PARA EXECUTAR',
      title: <>Sua obra em movimento,<br /><em>todos os dias.</em></>,
      description: 'Tenha visibilidade para planejar, controlar e entregar com confiança.',
      mantra: <>PLANEJAR<br />CONECTAR<br />MONITORAR<br />ENTREGAR</>,
    };

  return (
    <main className="auth-page">
      <aside className={`auth-showcase auth-showcase-${mode}`}>
        <img className="auth-showcase-art" src={visual.image} alt="" aria-hidden="true" />
        <Link className="auth-showcase-brand" to="/" aria-label="Vetor Gestão de Obras — início">
          <img src={`${import.meta.env.BASE_URL}logo_vetor_transparente.png`} alt="" />
          <span><b>Vetor</b><small>Gestão de Obras</small></span>
        </Link>
        <div className="auth-showcase-copy">
          <span className="auth-showcase-label">{visual.label}</span>
          <h1>{visual.title}</h1>
          <i aria-hidden="true" />
          <p>{visual.description}</p>
        </div>
        <span className="auth-showcase-mantra">{visual.mantra}</span>
        <span className="auth-showcase-footer">Vetor <small>Gestão de Obras</small></span>
      </aside>

      <section className="auth-content">
        <div className="auth-content-inner">
          <div className="auth-switch">
            <span>{creating ? 'Já tem uma conta?' : 'Ainda não tem conta?'}</span>
            <Link to={creating ? '/login' : '/criar-conta'}>
              {creating ? 'Entrar' : 'Criar conta'} <ArrowRight size={16} />
            </Link>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

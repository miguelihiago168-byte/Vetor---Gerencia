import React from 'react';
import Navbar from './Navbar';
import './Almoxarifado.css';

function AlmoxarifadoLayout({ title, description, children, extraHeader }) {
  return (
    <>
      <Navbar />
      <div className="container almox-container assets-workspace">
        <div className="almox-layout">

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

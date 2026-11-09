import React from 'react';
import Navbar from './Navbar';
import './ComprasLayout.css';

function ComprasLayout({ title, children, extraHeader }) {
  return (
    <>
      <Navbar />
      <div className="container almox-container suprimentos-shell">
        <div className="almox-layout">

          <main className="almox-content suprimentos-content">
            <div className="flex-between mb-4 suprimentos-page-header">
              <h1>{title}</h1>
              {extraHeader || null}
            </div>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

export default ComprasLayout;

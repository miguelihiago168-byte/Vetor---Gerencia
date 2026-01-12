import React from 'react';

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: 8, width: '90%', maxWidth: 640, padding: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

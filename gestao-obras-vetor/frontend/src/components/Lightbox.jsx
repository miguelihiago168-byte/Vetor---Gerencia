import React from 'react';

export default function Lightbox({ open, src, alt, onClose }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
      <img src={src} alt={alt || ''} style={{ maxWidth: '95%', maxHeight: '95%', boxShadow: '0 12px 48px rgba(0,0,0,0.6)' }} />
    </div>
  );
}

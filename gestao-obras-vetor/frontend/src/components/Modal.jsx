import React from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui/Button';

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <IconButton label="Fechar" icon={X} tone="neutral" variant="ghost" onClick={onClose} />
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

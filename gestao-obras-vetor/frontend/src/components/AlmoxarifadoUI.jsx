import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Package, Search, X } from 'lucide-react';

export function AssetsPanel({ title, description, count, action, children, footer, className = '' }) {
  const headingId = useId();
  return <section className={`card assets-panel ${className}`} aria-labelledby={headingId}>
    <div className="assets-panel-heading"><div><h2 id={headingId}>{title}{count != null && <span className="assets-count">{count}</span>}</h2>{description && <p>{description}</p>}</div>{action}</div>
    {children}
    {footer != null && <div className="assets-panel-footer" role="status">{footer}</div>}
  </section>;
}

export function AssetsSearch({ value, onChange, placeholder = 'Buscar ativo ou colaborador', label = placeholder, children }) {
  return <div className="assets-toolbar"><div className="assets-search"><Search size={18} aria-hidden="true" /><input type="search" className="form-input" aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></div>{children}</div>;
}

export function AssetsState({ loading, error, onRetry, title = 'Nenhum registro encontrado', description, children }) {
  if (loading) return <div className="assets-loading" role="status"><div className="spinner" />Carregando informações…</div>;
  return <div className="assets-empty" role={error ? 'alert' : 'status'}>
    {error ? <AlertCircle size={28} aria-hidden="true" /> : <Package size={30} aria-hidden="true" />}
    <h3>{error ? 'Não foi possível carregar os dados' : title}</h3><p>{error || description}</p>
    {error && onRetry ? <button className="btn btn-secondary" onClick={onRetry}>Tentar novamente</button> : children}
  </div>;
}

export function AssetsStatus({ children, tone = 'blue' }) {
  return <span className={`assets-status assets-tone-${tone}`}><span aria-hidden="true" />{children}</span>;
}

export function AssetsTable({ label, columns, rows, className = '' }) {
  return <div className="assets-table-wrap"><table className={`table assets-table assets-responsive-table ${className}`} role="table" aria-label={label}>
    <thead role="rowgroup"><tr role="row">{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody role="rowgroup">{rows.map((row) => <tr key={row.id} role="row">{columns.map((column) => <td key={column.key} role="cell" data-label={column.label} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function AssetsModal({ title, description, onClose, closeDisabled = false, children }) {
  const titleId = useId();
  const modalRef = useRef(null);
  const closeRef = useRef({ onClose, closeDisabled });
  closeRef.current = { onClose, closeDisabled };
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const modal = modalRef.current;
    modal.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !closeRef.current.closeDisabled) {
        event.preventDefault();
        closeRef.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter((el) => !el.disabled && el.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) { event.preventDefault(); first.focus(); }
    };
    modal.addEventListener('keydown', onKeyDown);
    return () => {
      modal.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="modal-overlay assets-modal-overlay" onClick={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
    <div ref={modalRef} className="modal-card assets-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="assets-modal-heading"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button className="btn btn-ghost" type="button" aria-label="Fechar janela" disabled={closeDisabled} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
      {children}
    </div>
  </div>, document.body);
}

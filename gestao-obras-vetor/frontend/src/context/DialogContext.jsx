import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import Button from '../components/ui/Button';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialog) return undefined;
    const previous = document.activeElement;
    dialogRef.current?.querySelector('input, button')?.focus();
    return () => {
      requestAnimationFrame(() => {
        if (!document.querySelector('.modal-overlay') && previous?.isConnected && !previous.disabled) previous.focus();
      });
    };
  }, [dialog]);

  const closeWith = (value) => {
    if (dialog?.resolve) dialog.resolve(value);
    setDialog(null);
    setInputValue('');
  };

  const handleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWith(dialog.type === 'confirm' ? false : dialog.type === 'prompt' ? null : undefined);
    }
    if (event.key !== 'Tab') return;
    const elements = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const showAlert = ({ title = 'Aviso', message = '', confirmText = 'OK' } = {}) => (
    new Promise((resolve) => {
      setDialog({
        type: 'alert',
        title,
        message,
        confirmText,
        resolve
      });
    })
  );

  const showConfirm = ({ title = 'Confirmação', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', confirmTone } = {}) => (
    new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        confirmTone,
        resolve
      });
    })
  );

  const showPrompt = ({
    title = 'Informar valor',
    message = '',
    defaultValue = '',
    placeholder = '',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar'
  } = {}) => (
    new Promise((resolve) => {
      setInputValue(defaultValue ?? '');
      setDialog({
        type: 'prompt',
        title,
        message,
        placeholder,
        confirmText,
        cancelText,
        resolve
      });
    })
  );

  const value = useMemo(() => ({
    alert: showAlert,
    confirm: showConfirm,
    prompt: showPrompt
  }), []);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <div className="modal-overlay fade-in" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown} onClick={() => {
          if (dialog.type === 'alert') closeWith(undefined);
          else closeWith(dialog.type === 'confirm' ? false : null);
        }}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 id={titleId} style={{ marginTop: 0, marginBottom: 10 }}>{dialog.title}</h3>
            {dialog.message ? <p style={{ marginTop: 0, color: 'var(--gray-600)', whiteSpace: 'pre-line' }}>{dialog.message}</p> : null}

            {dialog.type === 'prompt' && (
              <input
                className="form-input"
                autoFocus
                value={inputValue}
                placeholder={dialog.placeholder || ''}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); closeWith(inputValue); }
                }}
              />
            )}

            <div className="dialog-actions" style={{ marginTop: 18 }}>
              {dialog.type !== 'alert' && (
                <Button tone="neutral" variant="outline" startIcon={X} onClick={() => closeWith(dialog.type === 'confirm' ? false : null)}>
                  {dialog.cancelText || 'Cancelar'}
                </Button>
              )}
              <Button
                tone={dialog.confirmTone || (/excluir|remover|apagar|reprovar|cancelar conta/i.test(`${dialog.title} ${dialog.confirmText}`) ? 'danger' : 'primary')}
                variant="solid"
                startIcon={/excluir|remover|apagar/i.test(`${dialog.title} ${dialog.confirmText}`) ? Trash2 : Check}
                onClick={() => {
                  if (dialog.type === 'confirm') return closeWith(true);
                  if (dialog.type === 'prompt') return closeWith(inputValue);
                  return closeWith(undefined);
                }}
              >
                {dialog.confirmText || 'OK'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog deve ser usado dentro de DialogProvider');
  }
  return ctx;
}

import React, { createContext, useContext, useMemo, useState } from 'react';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [inputValue, setInputValue] = useState('');

  const closeWith = (value) => {
    if (dialog?.resolve) dialog.resolve(value);
    setDialog(null);
    setInputValue('');
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

  const showConfirm = ({ title = 'Confirmação', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar' } = {}) => (
    new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
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
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={() => {
          if (dialog.type === 'alert') closeWith(undefined);
          else closeWith(dialog.type === 'confirm' ? false : null);
        }}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>{dialog.title}</h3>
            {dialog.message ? <p style={{ marginTop: 0, color: 'var(--gray-600)' }}>{dialog.message}</p> : null}

            {dialog.type === 'prompt' && (
              <input
                className="form-input"
                autoFocus
                value={inputValue}
                placeholder={dialog.placeholder || ''}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') closeWith(inputValue);
                  if (e.key === 'Escape') closeWith(null);
                }}
              />
            )}

            <div className="dialog-actions" style={{ marginTop: 18 }}>
              {dialog.type !== 'alert' && (
                <button className="btn btn-secondary" onClick={() => closeWith(dialog.type === 'confirm' ? false : null)}>
                  {dialog.cancelText || 'Cancelar'}
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (dialog.type === 'confirm') return closeWith(true);
                  if (dialog.type === 'prompt') return closeWith(inputValue);
                  return closeWith(undefined);
                }}
              >
                {dialog.confirmText || 'OK'}
              </button>
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

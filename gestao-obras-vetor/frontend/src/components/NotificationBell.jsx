import React, { useEffect, useRef, useState } from 'react';
import { Bell, FileText, ShoppingCart, CheckCircle, X } from 'lucide-react';
import { getNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas } from '../services/api';

const TIPO_ICONE = {
  rdo_criado:       { icon: FileText,     cor: '#3b82f6' },
  rdo_reprovado:    { icon: FileText,     cor: '#ef4444' },
  requisicao_status:{ icon: ShoppingCart, cor: '#f59e0b' },
  pedido:           { icon: ShoppingCart, cor: '#f59e0b' },
};

function formatarTempo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default function NotificationBell() {
  const [notifs, setNotifs]     = useState([]);
  const [aberto, setAberto]     = useState(false);
  const [carregando, setCarregando] = useState(false);
  const ref = useRef(null);

  const naoLidas = notifs.filter(n => !n.lido).length;

  const carregar = async () => {
    try {
      const res = await getNotificacoes();
      setNotifs(res.data || []);
    } catch { /* silencioso */ }
  };

  // polling a cada 30s
  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 30000);
    return () => clearInterval(id);
  }, []);

  // fechar ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const marcarLida = async (id) => {
    try {
      await marcarNotificacaoLida(id);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, lido: 1 } : n));
    } catch { /* silencioso */ }
  };

  const marcarTodas = async () => {
    if (carregando) return;
    setCarregando(true);
    try {
      await marcarTodasNotificacoesLidas();
      setNotifs(prev => prev.map(n => ({ ...n, lido: 1 })));
    } catch { /* silencioso */ }
    finally { setCarregando(false); }
  };

  return (
    <div className="notif-bell-wrapper" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={() => setAberto(v => !v)}
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell size={20} />
        {naoLidas > 0 && (
          <span className="notif-bell-badge">{naoLidas > 99 ? '99+' : naoLidas}</span>
        )}
      </button>

      {aberto && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notificações</span>
            {naoLidas > 0 && (
              <button
                className="notif-mark-all-btn"
                onClick={marcarTodas}
                disabled={carregando}
              >
                <CheckCircle size={13} style={{ marginRight: 4 }} />
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="notif-dropdown-list">
            {notifs.length === 0 ? (
              <div className="notif-empty">Nenhuma notificação</div>
            ) : (
              notifs.map(n => {
                const cfg  = TIPO_ICONE[n.tipo] || TIPO_ICONE['pedido'];
                const Icon = cfg.icon;
                return (
                  <div
                    key={n.id}
                    className={`notif-item${n.lido ? ' notif-item--lida' : ''}`}
                  >
                    <div className="notif-item-icon" style={{ color: cfg.cor }}>
                      <Icon size={16} />
                    </div>
                    <div className="notif-item-body">
                      <span className="notif-item-msg">{n.mensagem}</span>
                      <span className="notif-item-time">{formatarTempo(n.criado_em)}</span>
                    </div>
                    {!n.lido && (
                      <button
                        className="notif-item-close"
                        title="Marcar como lida"
                        onClick={() => marcarLida(n.id)}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

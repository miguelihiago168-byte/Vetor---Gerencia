let broadcaster = null;

const setMensageriaBroadcaster = (fn) => {
  broadcaster = typeof fn === 'function' ? fn : null;
};

const emitMensageriaEvent = (eventName, payload) => {
  if (!broadcaster) return;
  try {
    broadcaster(eventName, payload);
  } catch (error) {
    console.warn('Falha ao publicar evento de mensageria:', error?.message || error);
  }
};

module.exports = {
  setMensageriaBroadcaster,
  emitMensageriaEvent
};

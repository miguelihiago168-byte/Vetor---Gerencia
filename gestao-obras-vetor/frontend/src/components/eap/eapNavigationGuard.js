// O BrowserRouter pode desmontar a tela no próprio callback de popstate.
// Este listener é instalado ao carregar o módulo (antes do Router), mas só
// bloqueia navegação enquanto um editor da EAP registra um rascunho ativo.
let activeGuard = null;
let restoring = false;

const onPop = (event) => {
  if (restoring) {
    restoring = false;
    event.stopImmediatePropagation();
    return;
  }
  const guard = activeGuard;
  const destinationIndex = event.state?.idx;
  if (!guard || typeof guard.index !== 'number' || typeof destinationIndex !== 'number' || guard.index === destinationIndex) return;
  if (guard.canLeave()) return;
  event.stopImmediatePropagation();
  restoring = true;
  window.history.go(guard.index - destinationIndex);
};

if (typeof window !== 'undefined') window.addEventListener('popstate', onPop, true);
if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('popstate', onPop, true));

export function registerEapNavigationGuard(canLeave) {
  const guard = { index: window.history.state?.idx, canLeave };
  activeGuard = guard;
  return () => { if (activeGuard === guard) activeGuard = null; };
}

export const purchaseInfo = (item) => {
  if (!item.compras) return { label: 'Compras indisponível', restante: null };
  const live = item.compras.filter((link) => !['Cancelado', 'Reprovado'].includes(link.status_item));
  const uncertain = live.some((link) => !link.requisicao_item_id || Number(link.quantidade_item) !== Number(link.total_vinculado));
  const requested = live.reduce((sum, link) => sum + Number(link.quantidade), 0);
  const bought = uncertain ? null : live.filter((link) => link.status_item === 'Comprado').reduce((sum, link) => sum + Number(link.quantidade), 0);
  const canMeasureReceived = live.every((link) => Number(link.vinculos_item) === 1 && link.quantidade_recebida != null);
  const received = canMeasureReceived ? live.reduce((sum, link) => sum + Number(link.quantidade_recebida), 0) : null;
  const restante = Math.max(0, Math.round((Number(item.quantidade) - requested) * 10000) / 10000);
  let label = uncertain ? 'Requisição alterada — conferir' : requested === 0 ? 'Não encaminhado' : 'Encaminhado para Compras';
  if (!uncertain && bought >= Number(item.quantidade)) label = 'Atendido';
  else if (!uncertain && (bought > 0 || received > 0)) label = 'Parcialmente atendido';
  return { label, restante: uncertain ? null : restante, requested, bought, received };
};

export const atividadeSuprimentosConcluida = (items) =>
  items.length > 0 && items.every((item) => purchaseInfo(item).label === 'Atendido');

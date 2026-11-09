export function resumoQuantidade(recebida, total) {
  if (recebida === '' || recebida == null || total === '' || total == null) return null;
  const r = Number(recebida); const t = Number(total);
  if (!Number.isFinite(r) || !Number.isFinite(t) || r < 0 || t <= 0) return null;
  const saldo = Number((t - r).toFixed(4));
  const percentual = (r / t) * 100;
  return { saldo, percentual, status: saldo < 0 ? 'Recebido acima do total' : saldo === 0 ? 'Recebimento completo' : r === 0 ? 'Aguardando recebimento' : 'Recebimento parcial' };
}

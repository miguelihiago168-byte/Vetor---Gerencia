// Remove apenas zeros finais; não converte para Number para preservar precisão.
export function quantidadeParaEdicao(value) {
  if (value == null || value === '') return '';
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

export function resumoQuantidade(recebida, total) {
  if (recebida === '' || recebida == null || total === '' || total == null) return null;
  const r = Number(recebida); const t = Number(total);
  if (!Number.isFinite(r) || !Number.isFinite(t) || r < 0 || t <= 0) return null;
  const saldo = Number((t - r).toFixed(4));
  const percentual = (r / t) * 100;
  return { saldo, percentual, status: saldo < 0 ? 'Recebido acima do total' : saldo === 0 ? 'Recebimento completo' : r === 0 ? 'Aguardando recebimento' : 'Recebimento parcial' };
}

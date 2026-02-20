const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const formatMoneyBR = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '0,00';
  return moneyFormatter.format(numero);
};

export const parseMoneyBR = (valor) => {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : 0;
  }

  const texto = String(valor ?? '').trim();
  if (!texto) return 0;

  const normalizado = texto
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/[^\d,.-]/g, '');

  if (!normalizado) return 0;

  let numeroTexto = normalizado;
  if (numeroTexto.includes(',')) {
    numeroTexto = numeroTexto.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = numeroTexto.split('.');
    if (partes.length > 2) {
      const decimal = partes.pop();
      numeroTexto = `${partes.join('')}.${decimal}`;
    }
  }

  const numero = Number(numeroTexto);
  return Number.isFinite(numero) ? numero : 0;
};

export const formatMoneyInputBR = (valor) => {
  const digits = String(valor ?? '').replace(/\D/g, '');
  if (!digits) return '';

  return formatMoneyBR(Number(digits) / 100);
};

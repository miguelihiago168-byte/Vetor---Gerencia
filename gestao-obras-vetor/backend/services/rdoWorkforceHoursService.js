const normalizarTexto = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const ehMaoObraDireta = (colaborador) =>
  normalizarTexto(colaborador?.tipo ?? colaborador?.classificacao) === 'direta';

const minutosDoHorario = (valor) => {
  const correspondencia = String(valor || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!correspondencia) return null;
  const horas = Number(correspondencia[1]);
  const minutos = Number(correspondencia[2]);
  if (!Number.isInteger(horas) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
};

const valorOuPadrao = (valor, padrao) => {
  if (valor !== undefined && valor !== null && String(valor).trim() !== '') return valor;
  return padrao;
};

const calcularHorasLiquidasColaborador = (colaborador = {}, horarioRdo = {}) => {
  const entrada = minutosDoHorario(colaborador.entrada);
  const saida = minutosDoHorario(colaborador.saida_final ?? colaborador.saida);
  if (entrada === null || saida === null || saida <= entrada) return 0;

  const inicioIntervaloValor = valorOuPadrao(colaborador.saida_almoco, horarioRdo.intervalo_almoco_inicio);
  const fimIntervaloValor = valorOuPadrao(colaborador.retorno_almoco, horarioRdo.intervalo_almoco_fim);
  const temInicioIntervalo = inicioIntervaloValor !== undefined && inicioIntervaloValor !== null && String(inicioIntervaloValor).trim() !== '';
  const temFimIntervalo = fimIntervaloValor !== undefined && fimIntervaloValor !== null && String(fimIntervaloValor).trim() !== '';

  let minutosLiquidos = saida - entrada;
  if (temInicioIntervalo || temFimIntervalo) {
    const inicioIntervalo = minutosDoHorario(inicioIntervaloValor);
    const fimIntervalo = minutosDoHorario(fimIntervaloValor);
    if (
      inicioIntervalo === null || fimIntervalo === null || fimIntervalo <= inicioIntervalo ||
      inicioIntervalo < entrada || fimIntervalo > saida
    ) return 0;
    minutosLiquidos -= fimIntervalo - inicioIntervalo;
  }

  return Math.round(Math.max(0, minutosLiquidos) / 60 * 100) / 100;
};

const calcularHhMaoObraDireta = (maoObraDetalhada, horarioRdo = {}) => {
  if (!Array.isArray(maoObraDetalhada)) return 0;
  const total = maoObraDetalhada
    .filter(ehMaoObraDireta)
    .reduce((soma, colaborador) => soma + calcularHorasLiquidasColaborador(colaborador, horarioRdo), 0);
  return Math.round(total * 100) / 100;
};

module.exports = {
  normalizarTexto,
  ehMaoObraDireta,
  minutosDoHorario,
  calcularHorasLiquidasColaborador,
  calcularHhMaoObraDireta
};

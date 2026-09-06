const HORARIO_PADRAO = Object.freeze({
  entrada_saida_inicio: '07:00',
  entrada_saida_fim: '17:00',
  intervalo_almoco_inicio: '12:00',
  intervalo_almoco_fim: '13:00'
});

const CAMPOS_HORARIO = Object.freeze(Object.keys(HORARIO_PADRAO));

const horarioValido = (valor) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor || ''));

const normalizarHorarioRdo = (dados = {}) => Object.fromEntries(
  CAMPOS_HORARIO.map((campo) => [
    campo,
    horarioValido(dados[campo]) ? dados[campo] : HORARIO_PADRAO[campo]
  ])
);

const emMinutos = (horario) => {
  const [horas, minutos] = horario.split(':').map(Number);
  return (horas * 60) + minutos;
};

const calcularHorasTrabalhadas = (dados = {}) => {
  const horario = normalizarHorarioRdo(dados);
  const jornada = Math.max(0, emMinutos(horario.entrada_saida_fim) - emMinutos(horario.entrada_saida_inicio));
  const intervalo = Math.max(0, emMinutos(horario.intervalo_almoco_fim) - emMinutos(horario.intervalo_almoco_inicio));
  return Math.round(((Math.max(0, jornada - intervalo) / 60) * 100)) / 100;
};

const houveAlteracaoHorario = (anterior = {}, proximo = {}) => {
  const horarioAnterior = normalizarHorarioRdo(anterior);
  const horarioProximo = normalizarHorarioRdo(proximo);
  return CAMPOS_HORARIO.some((campo) => horarioAnterior[campo] !== horarioProximo[campo]);
};

module.exports = {
  CAMPOS_HORARIO,
  HORARIO_PADRAO,
  normalizarHorarioRdo,
  calcularHorasTrabalhadas,
  houveAlteracaoHorario
};

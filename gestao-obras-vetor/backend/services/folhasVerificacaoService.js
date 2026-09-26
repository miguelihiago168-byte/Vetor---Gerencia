const ACCEPTANCE = {
  C_ZERO: 'C_ZERO',
  MAX_NC: 'MAX_NC',
  CEM_PORCENTO: 'CEM_PORCENTO',
  MODELO: 'MODELO'
};

const STATUS = {
  RASCUNHO: 'RASCUNHO',
  EM_ANALISE: 'EM_ANALISE',
  REPROVADA_BLOQUEADA: 'REPROVADA_BLOQUEADA',
  EM_CORRECAO: 'EM_CORRECAO',
  EM_REINSPECAO: 'EM_REINSPECAO',
  APROVADA: 'APROVADA',
  CANCELADA: 'CANCELADA'
};

const RESULT = {
  PENDENTE: 'PENDENTE',
  CONFORME: 'CONFORME',
  NAO_CONFORME: 'NAO_CONFORME',
  NAO_APLICAVEL: 'NAO_APLICAVEL',
  BLOQUEADO: 'BLOQUEADO',
  COM_RESSALVAS: 'CONFORME_COM_RESSALVAS'
};

// Decimal fixed point avoids binary floating point rounding in acceptance limits.
const SCALE = 1000000n;
const decimalToScaled = (input, field = 'valor') => {
  const raw = String(input ?? '').trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,6})?$/.test(raw)) throw new Error(`${field} deve possuir no máximo 6 casas decimais.`);
  const negative = raw.startsWith('-');
  const [integer, fraction = ''] = (negative ? raw.slice(1) : raw).split('.');
  const value = BigInt(integer) * SCALE + BigInt((fraction + '000000').slice(0, 6));
  return negative ? -value : value;
};
const scaledToDecimal = (value) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / SCALE;
  const fraction = String(absolute % SCALE).padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
};
const scaledMultiply = (a, b) => (a * b) / SCALE;

const calculateLimits = ({ expected, toleranceType, tolerance, lowerLimit, upperLimit, fieldName = 'Torque esperado', positiveOnly = true }) => {
  const nominal = decimalToScaled(expected, fieldName);
  if (positiveOnly && nominal <= 0n) throw new Error(`${fieldName} deve ser maior que zero.`);
  let lower;
  let upper;
  if (toleranceType === 'PERCENTUAL') {
    const percentage = decimalToScaled(tolerance, 'Tolerância');
    if (percentage < 0n) throw new Error('Tolerância não pode ser negativa.');
    const nominalMagnitude = nominal < 0n ? -nominal : nominal;
    const variation = scaledMultiply(nominalMagnitude, percentage) / 100n;
    lower = nominal - variation;
    upper = nominal + variation;
  } else if (toleranceType === 'ABSOLUTA') {
    const absolute = decimalToScaled(tolerance, 'Tolerância');
    if (absolute < 0n) throw new Error('Tolerância não pode ser negativa.');
    lower = nominal - absolute;
    upper = nominal + absolute;
  } else if (toleranceType === 'MANUAL') {
    lower = decimalToScaled(lowerLimit, 'Limite inferior');
    upper = decimalToScaled(upperLimit, 'Limite superior');
  } else {
    throw new Error('Tipo de tolerância inválido.');
  }
  if (positiveOnly && lower < 0n) throw new Error('Limite inferior não pode ser negativo.');
  if (upper < lower) throw new Error('Limite superior deve ser maior ou igual ao inferior.');
  return { expected: scaledToDecimal(nominal), lower: scaledToDecimal(lower), upper: scaledToDecimal(upper) };
};

const calculateMeasurementResult = ({ value, lower, upper, notApplicable = false, justification }) => {
  if (notApplicable) {
    if (!String(justification || '').trim()) throw new Error('Justificativa obrigatória para medição não aplicável.');
    return RESULT.NAO_APLICAVEL;
  }
  if (value === null || value === undefined || String(value).trim() === '') return RESULT.PENDENTE;
  const actual = decimalToScaled(value, 'Valor medido');
  const minimum = decimalToScaled(lower, 'Limite inferior');
  const maximum = decimalToScaled(upper, 'Limite superior');
  return actual >= minimum && actual <= maximum ? RESULT.CONFORME : RESULT.NAO_CONFORME;
};

const summarizeLot = ({ population, sampleSize, acceptanceCriterion = ACCEPTANCE.C_ZERO, maxNonConformities = 0, measurements = [], requiredTorqueLinks = [] }) => {
  const expectedSample = Number(sampleSize || 0);
  const totalPopulation = Number(population || 0);
  if (!Number.isInteger(expectedSample) || expectedSample < 0 || !Number.isInteger(totalPopulation) || totalPopulation < 0) throw new Error('População e amostra devem ser números inteiros não negativos.');
  const quantityOf = (item) => {
    const quantity = Number(item.quantity ?? item.quantidade_verificada ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('A quantidade verificada deve ser um número inteiro maior que zero.');
    return quantity;
  };
  const totalOf = (items) => items.reduce((total, item) => total + quantityOf(item), 0);
  const counted = measurements.filter((item) => item.result !== RESULT.NAO_APLICAVEL);
  const complete = counted.filter((item) => item.result !== RESULT.PENDENTE);
  const conforming = totalOf(complete.filter((item) => item.result === RESULT.CONFORME));
  const nonConforming = totalOf(complete.filter((item) => item.result === RESULT.NAO_CONFORME));
  const measured = totalOf(complete);
  const pending = totalOf(counted.filter((item) => item.result === RESULT.PENDENTE));
  const torqueBlocked = requiredTorqueLinks.some((link) => link.required && (link.status !== STATUS.APROVADA || [RESULT.NAO_CONFORME, RESULT.BLOQUEADO].includes(link.result)));
  const target = acceptanceCriterion === ACCEPTANCE.CEM_PORCENTO ? totalPopulation : expectedSample;
  const sampleIncomplete = measured < target || pending > 0;
  const allowed = acceptanceCriterion === ACCEPTANCE.C_ZERO ? 0 : Number(maxNonConformities || 0);
  const rejected = nonConforming > allowed;
  const result = torqueBlocked ? RESULT.BLOQUEADO : sampleIncomplete ? RESULT.PENDENTE : rejected ? RESULT.NAO_CONFORME : nonConforming ? RESULT.COM_RESSALVAS : RESULT.CONFORME;
  return {
    population: totalPopulation, sampleSize: target, measured, pending: Math.max(0, target - measured) + pending,
    conforming, nonConforming, compliancePercentage: measured ? ((conforming / measured) * 100).toFixed(2) : '0.00',
    sampleIncomplete, torqueBlocked, result
  };
};

const assertInstrument = ({ expectedTorque, rangeMin, rangeMax, calibrationValidUntil, status, exceptionReleased, exceptionJustification, now = new Date() }) => {
  const blockedStatuses = ['EM_MANUTENCAO', 'PERDIDO', 'INDISPONIVEL'];
  const reasons = [];
  if (status && blockedStatuses.includes(String(status).toUpperCase())) reasons.push('ativo indisponível');
  if (calibrationValidUntil && new Date(`${String(calibrationValidUntil).slice(0, 10)}T23:59:59`).getTime() < now.getTime()) reasons.push('calibração vencida');
  if (expectedTorque !== undefined && expectedTorque !== null && rangeMin !== undefined && rangeMax !== undefined) {
    const torque = decimalToScaled(expectedTorque, 'Torque esperado');
    if (torque < decimalToScaled(rangeMin, 'Faixa mínima') || torque > decimalToScaled(rangeMax, 'Faixa máxima')) reasons.push('torque fora da faixa do instrumento');
  }
  if (reasons.length && !(exceptionReleased && String(exceptionJustification || '').trim())) throw new Error(`Inspeção bloqueada: ${reasons.join(', ')}.`);
  return { allowed: true, exceptional: reasons.length > 0, reasons };
};

const assertTransition = (from, to) => {
  const transitions = {
    [STATUS.RASCUNHO]: [STATUS.EM_ANALISE, STATUS.CANCELADA],
    [STATUS.EM_ANALISE]: [STATUS.APROVADA, STATUS.REPROVADA_BLOQUEADA, STATUS.CANCELADA],
    [STATUS.REPROVADA_BLOQUEADA]: [STATUS.EM_CORRECAO],
    [STATUS.EM_CORRECAO]: [STATUS.EM_REINSPECAO],
    [STATUS.EM_REINSPECAO]: [STATUS.APROVADA, STATUS.REPROVADA_BLOQUEADA]
  };
  if (!transitions[from]?.includes(to)) throw new Error('Transição de status inválida.');
};

const isImmutable = (status) => ![STATUS.RASCUNHO, STATUS.EM_CORRECAO, STATUS.EM_REINSPECAO].includes(status);

module.exports = { ACCEPTANCE, STATUS, RESULT, calculateLimits, calculateMeasurementResult, summarizeLot, assertInstrument, assertTransition, isImmutable };

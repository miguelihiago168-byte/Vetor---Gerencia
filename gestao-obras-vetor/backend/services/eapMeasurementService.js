// Valores financeiros são calculados em centavos inteiros. A razão física usa
// frações decimais, sem arredondar previamente o percentual de execução.
const normalizeMeasurementValue = (value) => {
  if (value === null || value === undefined) return null;
  const text = (typeof value === 'number' || typeof value === 'string') ? String(value).trim() : '';
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text)) {
    const error = new Error('valor_total_medicao deve ser um valor não negativo, com até 2 casas decimais e no máximo R$ 9.999.999.999.999,99.');
    error.status = 400;
    throw error;
  }
  const [whole, decimal = ''] = text.split('.');
  return `${BigInt(whole)}.${decimal.padEnd(2, '0')}`;
};

const cents = (value) => BigInt(normalizeMeasurementValue(value).replace('.', ''));
const currency = (value) => Number(value) / 100;
const fraction = (value) => {
  const match = String(value ?? 0).match(/^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) throw new Error('Quantidade de medição inválida.');
  const decimals = match[3] || '';
  const scale = decimals.length - Number(match[4] || 0);
  const numerator = BigInt(`${match[1]}${match[2]}${decimals}`);
  return scale >= 0 ? [numerator, 10n ** BigInt(scale)] : [numerator * 10n ** BigInt(-scale), 1n];
};

const calculateLeaf = (activity, execution = {}) => {
  if (activity.valor_total_medicao == null) return { previsto: 0n, medido: 0n, semValor: 1 };
  const previsto = cents(activity.valor_total_medicao);
  const byQuantity = Number(activity.quantidade_total || 0) > 0;
  const [executed, executedScale] = fraction(byQuantity ? execution.quantidade : execution.percentual);
  const [total, totalScale] = fraction(byQuantity ? activity.quantidade_total : 100);
  const denominator = executedScale * total;
  const numerator = executed * totalScale;
  const bounded = numerator < 0n ? 0n : numerator > denominator ? denominator : numerator;
  const medido = (previsto * bounded * 2n + denominator) / (denominator * 2n);
  return { previsto, medido, semValor: 0 };
};

const consolidateMeasurements = (activities, executions = []) => {
  const executed = new Map(executions.map((item) => [String(item.atividade_eap_id), item]));
  const children = new Map();
  for (const activity of activities) {
    const parent = String(activity.pai_id);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(activity);
  }
  const totals = new Map();
  const visiting = new Set();
  const calculate = (activity) => {
    const id = String(activity.id);
    if (totals.has(id)) return totals.get(id);
    if (visiting.has(id)) throw new Error('Hierarquia circular na EAP.');
    visiting.add(id);
    const descendants = children.get(id) || [];
    const result = descendants.length
      ? descendants.map(calculate).reduce((sum, item) => ({
        previsto: sum.previsto + item.previsto,
        medido: sum.medido + item.medido,
        semValor: sum.semValor + item.semValor
      }), { previsto: 0n, medido: 0n, semValor: 0 })
      : calculateLeaf(activity, executed.get(id));
    visiting.delete(id);
    totals.set(id, result);
    return result;
  };
  return activities.map((activity) => {
    const result = calculate(activity);
    const unpricedLeaf = !(children.get(String(activity.id)) || []).length && result.semValor > 0;
    return {
      ...activity,
      valor_total_medicao: activity.valor_total_medicao == null ? null : Number(activity.valor_total_medicao),
      medicao: {
        valor_previsto: unpricedLeaf ? null : currency(result.previsto),
        valor_medido: unpricedLeaf ? null : currency(result.medido),
        saldo: unpricedLeaf ? null : currency(result.previsto - result.medido),
        atividades_sem_valor: result.semValor
      }
    };
  });
};

const getProjectMeasurements = async ({ projectId, tenantId, activities, allQuery }) => {
  if (!tenantId || !projectId) throw new Error('Projeto e tenant são obrigatórios para a medição.');
  // A consulta não usa o avanço em cache da EAP e não grava nos RDOs.
  // CAST antes do SUM evita acumulação em ponto flutuante de colunas legadas REAL.
  const executions = await allQuery(`
    SELECT ra.atividade_eap_id,
           SUM(COALESCE(ra.quantidade_executada, 0)::numeric) AS quantidade,
           SUM(COALESCE(ra.percentual_executado, 0)::numeric) AS percentual
    FROM rdo_atividades ra
    INNER JOIN rdos r ON r.id = ra.rdo_id
    INNER JOIN atividades_eap ae ON ae.id = ra.atividade_eap_id
    WHERE r.status = 'Aprovado'
      AND r.projeto_id = ? AND ae.projeto_id = ?
      AND r.tenant_id = ? AND ae.tenant_id = ?
    GROUP BY ra.atividade_eap_id
  `, [projectId, projectId, tenantId, tenantId]);
  return consolidateMeasurements(activities, executions);
};

// O editor envia os campos básicos completos. Compare os valores efetivos,
// incluindo datas e números normalizados, para reconhecer uma edição de preço.
const isMeasurementOnlyUpdate = (previous, body) => {
  if (!Object.hasOwn(body, 'valor_total_medicao')) return false;
  const numeric = ['quantidade_total', 'peso_percentual_projeto', 'percentual_previsto', 'ordem'];
  const identifiers = ['pai_id', 'predecessora_id'];
  const dates = ['data_inicio_planejada', 'data_fim_planejada'];
  const fields = [...numeric, ...identifiers, ...dates, 'codigo_eap', 'descricao', 'unidade_medida', 'id_atividade', 'nome', 'tipo_vinculo_dependencia'];
  return fields.every((key) => {
    if (!Object.hasOwn(body, key)) return true;
    let before = previous[key];
    if (key === 'nome') before = before || previous.descricao || '';
    if (numeric.includes(key)) return Number(body[key] || 0) === Number(before || 0);
    if (identifiers.includes(key)) return String(body[key] || '') === String(before || '');
    if (dates.includes(key)) return String(body[key] || '').slice(0, 10) === String(before || '').slice(0, 10);
    return String(body[key] || '').trim() === String(before || '').trim();
  });
};

module.exports = { normalizeMeasurementValue, consolidateMeasurements, getProjectMeasurements, isMeasurementOnlyUpdate };

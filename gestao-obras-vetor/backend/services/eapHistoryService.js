// A snapshot describes the current RDO record, not a reconstructed audit event.
const mergeActivityHistory = (events = [], legacy = [], executions = []) => {
  const key = (row) => `${row.atividade_eap_id}:${row.rdo_id}`;
  const recordedRdos = new Set([...events, ...legacy]
    .filter((row) => row.rdo_id && (row.fonte === 'historico_atividades' || row.origem === 'rdo_criado'))
    .map(key));

  const snapshots = executions.filter((row) => !recordedRdos.has(key(row))).map((row) => ({
    ...row,
    fonte: 'rdo_atividades',
    origem: 'execucao_rdo',
    rdo_label: `RDO-${String(row.numero_rdo || row.rdo_id).padStart(3, '0')}`,
    percentual_novo: row.percentual_executado,
    quantidade_nova: row.quantidade_executada,
    mensagem: `Registro atual da execução no RDO${row.status ? ` (${row.status})` : ''}; o percentual anterior não foi registrado.${row.observacao ? ` ${row.observacao}` : ''}`
  }));
  return [...events, ...legacy, ...snapshots];
};

// Reconstituição aproximada com a estrutura e os pesos atuais, em ordem de aprovação.
const reconstructGroupHistory = (rootId, activities, executions, cutoff = null) => {
  const children = new Map();
  const nodes = new Map(activities.map((activity) => [String(activity.id), activity]));
  for (const activity of activities) {
    const parent = String(activity.pai_id);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(activity);
  }
  if (!children.get(String(rootId))?.length) return [];
  const totals = new Map();
  const progress = (id, path = new Set()) => {
    const key = String(id);
    if (path.has(key)) return 0;
    const next = new Set(path).add(key);
    const descendants = children.get(key) || [];
    if (!descendants.length) {
      const total = totals.get(key) || { quantity: 0, percent: 0 };
      const planned = Number(nodes.get(key)?.quantidade_total || 0);
      return Math.min(100, planned > 0 && total.quantity > 0 ? total.quantity / planned * 100 : total.percent);
    }
    const weights = descendants.map((child) => Number(child.peso_percentual_projeto ?? child.percentual_previsto ?? 0));
    const weighted = weights.some((weight) => weight > 0);
    const value = descendants.reduce((sum, child, index) => sum + progress(child.id, next) * (weighted ? Math.max(0, weights[index]) / 100 : 1 / descendants.length), 0);
    return Math.min(100, value);
  };
  const groups = new Map();
  for (const row of executions) {
    if (!row.aprovado_em || (cutoff && new Date(row.aprovado_em) >= new Date(cutoff))) continue;
    const key = String(row.rdo_id);
    if (!groups.has(key)) groups.set(key, { ...row, items: [] });
    groups.get(key).items.push(row);
  }
  let previous = 0;
  return [...groups.values()].sort((a, b) => new Date(a.aprovado_em) - new Date(b.aprovado_em)).flatMap((group) => {
    for (const item of group.items) {
      const key = String(item.atividade_eap_id);
      const total = totals.get(key) || { quantity: 0, percent: 0 };
      total.quantity += Number(item.quantidade_executada || 0);
      total.percent += Number(item.percentual_executado || 0);
      totals.set(key, total);
    }
    const current = Math.round(progress(rootId) * 100) / 100;
    if (Math.abs(current - previous) < 0.0001) return [];
    const event = { id: group.rdo_id, atividade_eap_id: rootId, rdo_id: group.rdo_id,
      rdo_label: `RDO-${String(group.numero_rdo || group.rdo_id).padStart(3, '0')}`,
      fonte: 'estimativa_rdo', origem: 'estimativa_rdo', criado_em: group.aprovado_em,
      percentual_anterior: previous, percentual_novo: current,
      mensagem: 'Estimativa a partir dos RDOs aprovados e dos pesos atuais das atividades filhas.' };
    previous = current;
    return [event];
  });
};

module.exports = { mergeActivityHistory, reconstructGroupHistory };

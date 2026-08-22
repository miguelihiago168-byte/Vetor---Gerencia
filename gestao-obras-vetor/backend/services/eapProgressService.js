const asPercent = (value) => Math.min(Math.max(Number(value) || 0, 0), 100);

const getWeight = (activity) => Number(
  activity.peso_percentual_projeto ?? activity.percentual_previsto ?? 0
);

/**
 * Consolida a EAP a partir das atividades-filhas.
 *
 * O percentual salvo em uma atividade-pai pode estar defasado enquanto seus
 * filhos já foram recalculados pelos RDOs. Por isso, a leitura de progresso
 * deve sempre percorrer a árvore, como a tela de Planejamento faz.
 */
const calculateProjectProgress = (activities = []) => {
  const nodes = new Map();

  activities.forEach((activity) => {
    nodes.set(String(activity.id), { ...activity, children: [] });
  });

  const roots = [];
  nodes.forEach((node) => {
    const parent = node.pai_id == null ? null : nodes.get(String(node.pai_id));
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const calculateActivityProgress = (activity) => {
    if (!activity.children.length) return asPercent(activity.percentual_executado);

    const childrenProgress = activity.children.map(calculateActivityProgress);
    if (childrenProgress.every((percent) => percent >= 100)) return 100;

    let weightedProgress = 0;
    let totalWeight = 0;
    let simpleProgress = 0;

    activity.children.forEach((child, index) => {
      const percent = childrenProgress[index];
      const weight = getWeight(child);
      simpleProgress += percent;
      if (weight > 0) {
        weightedProgress += (percent * weight) / 100;
        totalWeight += weight;
      }
    });

    return asPercent(totalWeight > 0
      ? weightedProgress
      : simpleProgress / activity.children.length);
  };

  const rootProgress = roots.map((root) => ({
    id: root.id,
    percentual_executado: calculateActivityProgress(root)
  }));

  if (!rootProgress.length) return { percentual: 0, atividadesPrincipais: [] };

  if (rootProgress.every((activity) => activity.percentual_executado >= 100)) {
    return { percentual: 100, atividadesPrincipais: rootProgress };
  }

  const rootWeights = roots.map(getWeight);
  const totalRootWeight = rootWeights.reduce((total, weight) => total + (weight > 0 ? weight : 0), 0);
  const useRootWeights = totalRootWeight > 0 && Math.abs(totalRootWeight - 100) < 0.01;
  const percentual = useRootWeights
    ? rootProgress.reduce((total, activity, index) => total + ((activity.percentual_executado * rootWeights[index]) / 100), 0)
    : rootProgress.reduce((total, activity) => total + activity.percentual_executado, 0) / rootProgress.length;

  return {
    percentual: Math.round(asPercent(percentual) * 100) / 100,
    atividadesPrincipais: rootProgress
  };
};

module.exports = { calculateProjectProgress };

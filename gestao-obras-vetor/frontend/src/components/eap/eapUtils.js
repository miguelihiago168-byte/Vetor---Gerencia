export const dateOnly = (value) => String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
export const formatDate = (value) => dateOnly(value).split('-').reverse().join('/') || '—';
export const formatNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const activityLabel = (activity) => `${activity.codigo_eap || ''} — ${activity.nome || activity.descricao || 'Sem nome'}`;
export const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const sortActivities = (items) => [...items].sort((a, b) => String(a.codigo_eap || '').localeCompare(String(b.codigo_eap || ''), 'pt-BR', { numeric: true, sensitivity: 'base' }));
export const activityWeight = (activity) => Number(activity.peso_percentual_projeto || activity.percentual_previsto || 0);
export const activityStatus = (percent) => percent >= 100 ? 'done' : percent > 0 ? 'active' : 'idle';
export const STATUS_LABELS = { idle: 'Não iniciada', active: 'Em andamento', done: 'Concluída' };

// Mesma consolidação da listagem anterior. Nunca calcular a partir da árvore filtrada.
export function activityProgress(activity) {
  const children = activity.children || [];
  if (!children.length) return Number(activity.percentual_executado || 0);
  const percentages = children.map(activityProgress);
  if (percentages.every((percent) => percent >= 100)) return 100;
  let contribution = 0, weight = 0, simple = 0;
  children.forEach((child, index) => {
    simple += percentages[index] || 0;
    const childWeight = activityWeight(child);
    if (childWeight > 0) {
      contribution += ((percentages[index] || 0) * childWeight) / 100;
      weight += childWeight;
    }
  });
  return Math.min(Math.round((weight > 0 ? contribution : simple / children.length) * 100) / 100, 100);
}

export function buildHierarchy(activities) {
  const byId = new Map(activities.map((activity) => [String(activity.id), { ...activity, children: [] }]));
  const roots = [];
  byId.forEach((activity) => {
    if (activity.pai_id) byId.get(String(activity.pai_id))?.children.push(activity);
    else roots.push(activity);
  });
  const prepare = (nodes) => sortActivities(nodes).map((node) => {
    node.children = prepare(node.children);
    node.progress = activityProgress(node);
    node.tone = activityStatus(node.progress);
    return node;
  });
  return prepare(roots);
}

export function activityCounts(activities) {
  const parents = new Set(activities.map((a) => String(a.pai_id)).filter((id) => id !== 'null'));
  return activities.filter((a) => !parents.has(String(a.id))).reduce((counts, activity) => {
    counts.total += 1;
    counts[activityStatus(Number(activity.percentual_executado || 0))] += 1;
    return counts;
  }, { total: 0, idle: 0, active: 0, done: 0 });
}

export function visibleActivities(tree, expanded, search = '', status = '') {
  const query = normalizeSearch(search);
  const filtered = Boolean(query || status);
  const visit = (nodes, level = 0, parentMatches = false) => nodes.flatMap((node) => {
    const textMatches = parentMatches || !query || normalizeSearch(`${node.codigo_eap} ${node.nome || node.descricao || ''}`).includes(query);
    const matches = textMatches && (!status || node.tone === status);
    const descendants = visit(node.children, level + 1, textMatches);
    if (filtered && !matches && !descendants.length) return [];
    const row = { ...node, level, contextOnly: !matches };
    return [row, ...((filtered || expanded.has(String(node.id))) ? descendants : [])];
  });
  return visit(tree);
}

export function nextChildCode(parentId, activities) {
  const parent = activities.find((a) => String(a.id) === String(parentId));
  if (!parent) return '';
  const prefix = `${String(parent.codigo_eap || '').trim()}.`;
  const numbers = activities.filter((a) => String(a.pai_id) === String(parentId)).map((a) => {
    const code = String(a.codigo_eap || '').trim();
    const suffix = code.startsWith(prefix) ? code.slice(prefix.length) : '';
    return /^\d+$/.test(suffix) ? Number(suffix) : 0;
  });
  return `${prefix}${Math.max(0, ...numbers) + 1}`;
}

export function initialDraft(activity = null, parentId = '', activities = []) {
  return {
    codigo_eap: activity?.codigo_eap || (parentId ? nextChildCode(parentId, activities) : ''),
    nome: activity?.nome || activity?.descricao || '',
    descricao: activity?.descricao || '',
    data_inicio_planejada: dateOnly(activity?.data_inicio_planejada),
    data_fim_planejada: dateOnly(activity?.data_fim_planejada),
    unidade_medida: activity?.unidade_medida || '',
    quantidade_total: String(activity?.quantidade_total ?? ''),
    peso_percentual_projeto: String(activity?.peso_percentual_projeto ?? activity?.percentual_previsto ?? ''),
    pai_id: String(activity?.pai_id || parentId || ''),
    predecessora_id: String(activity?.predecessora_id || ''),
    tipo_vinculo_dependencia: activity?.tipo_vinculo_dependencia || 'FS'
  };
}

export function validateDraft(draft, editing = false) {
  const errors = {};
  if (!draft.codigo_eap.trim()) errors.codigo_eap = 'Informe o código.';
  if (!draft.nome.trim()) errors.nome = 'Informe o nome da atividade.';
  if (draft.pai_id) {
    if (!draft.data_inicio_planejada) errors.data_inicio_planejada = 'Informe a data de início.';
    if (!draft.data_fim_planejada) errors.data_fim_planejada = 'Informe a data de fim.';
    if (!draft.unidade_medida) errors.unidade_medida = 'Selecione a unidade.';
    if (draft.peso_percentual_projeto === '') errors.peso_percentual_projeto = 'Informe o peso.';
  }
  if (draft.data_inicio_planejada && draft.data_fim_planejada && draft.data_fim_planejada < draft.data_inicio_planejada) errors.data_fim_planejada = 'O fim deve ser igual ou posterior ao início.';
  if (draft.peso_percentual_projeto !== '' && (!Number.isFinite(Number(draft.peso_percentual_projeto)) || Number(draft.peso_percentual_projeto) < 0 || Number(draft.peso_percentual_projeto) > 100)) errors.peso_percentual_projeto = 'Informe um peso entre 0 e 100%.';
  if (draft.quantidade_total !== '' && (!Number.isFinite(Number(draft.quantidade_total)) || (editing && Number(draft.quantidade_total) < 0))) errors.quantidade_total = 'Informe uma quantidade válida.';
  return errors;
}

export function activityPayload(draft, projectId, original = null) {
  const payload = {
    projeto_id: projectId,
    codigo_eap: draft.codigo_eap,
    nome: draft.nome,
    descricao: draft.descricao,
    pai_id: draft.pai_id || null,
    unidade_medida: draft.unidade_medida,
    quantidade_total: draft.quantidade_total === '' ? null : Number(draft.quantidade_total),
    peso_percentual_projeto: draft.peso_percentual_projeto === '' ? (draft.pai_id ? undefined : 0) : Number(draft.peso_percentual_projeto),
    percentual_previsto: draft.peso_percentual_projeto === '' ? (draft.pai_id ? undefined : 0) : Number(draft.peso_percentual_projeto),
    data_inicio_planejada: draft.data_inicio_planejada || (original ? dateOnly(original.data_inicio_planejada) || null : ''),
    data_fim_planejada: draft.data_fim_planejada || (original ? dateOnly(original.data_fim_planejada) || null : '')
  };
  // O PUT sincroniza as dependências quando recebe predecessora_id. Omitir o
  // vínculo intacto evita substituir outras predecessoras existentes.
  if (!original || String(original.predecessora_id || '') !== draft.predecessora_id || (original.tipo_vinculo_dependencia || 'FS') !== draft.tipo_vinculo_dependencia) {
    payload.predecessora_id = draft.predecessora_id || null;
    payload.tipo_vinculo_dependencia = draft.tipo_vinculo_dependencia || 'FS';
  }
  return payload;
}

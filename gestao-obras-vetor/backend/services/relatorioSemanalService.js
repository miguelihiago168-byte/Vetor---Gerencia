const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const validPeriod = (start, end) => validDate(start) && validDate(end) && end >= start && (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) <= 6 * 86400000;
const parseArray = (value) => { try { const result = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(result) ? result : []; } catch { return []; } };
function supplySnapshot(items, links, cutoff) {
  return items.map(item => {
    const live = links.filter(link => String(link.necessidade_id) === String(item.id) && !['Cancelado','Reprovado'].includes(link.status_item));
    const ambiguous = live.some(link => !link.requisicao_item_id || Number(link.quantidade_item) !== Number(link.total_vinculado) || Number(link.vinculos_item) !== 1 || link.quantidade_recebida == null);
    const received = ambiguous ? null : live.reduce((sum,link) => sum + Number(link.quantidade_recebida || 0),0);
    const needed=Number(item.quantidade || 0);
    const remaining=received == null ? null : Math.max(0,needed-received);
    const due=item.data_necessidade_efetiva || null;
    const expected=item.data_entrega_prevista || null;
    const delayed=remaining !== 0 && ((due && due < cutoff) || (expected && expected < cutoff) || (due && expected && expected > due));
    const color=remaining===0?'verde':delayed?'vermelho':'amarelo';
    return {id:item.id, descricao:item.descricao, unidade:item.unidade, atividade:item.atividade_codigo, quantidade:needed, recebida:received, restante:remaining, necessidade:due, previsao:expected, cor:color, situacao:remaining===0?'Recebido':received==null?'Recebimento a conferir':delayed?'Pendente / em atraso':received>0?'Recebimento parcial':'Aguardando recebimento'};
  });
}
function buildSnapshot({ project, start, end, rdos, activities, entries, photos, weather, supplies=[], supplyLinks=[], supplyAvailable=true }) {
  const parentIds = new Set(activities.map(a => String(a.pai_id)).filter(id => id !== 'null'));
  const eap = new Map(activities.map(a => [String(a.id), a]));
  const progress = new Map();
  const reported = new Set();
  for (const entry of entries) {
    const key = String(entry.atividade_eap_id); const activity = eap.get(key); if (!activity) continue;
    const item = progress.get(key) || { quantity: 0, percent: 0, completed: null };
    item.quantity += Number(entry.quantidade_executada || 0); item.percent += Number(entry.percentual_executado || 0);
    const percent = Number(activity.quantidade_total) > 0 && item.quantity > 0 ? item.quantity / Number(activity.quantidade_total) * 100 : item.percent;
    if (!item.completed && percent >= 99.9999) item.completed = entry.data_relatorio;
    progress.set(key, item);
    if (entry.data_relatorio >= start) reported.add(key);
  }
  const label = (a) => `${a.codigo_eap ? `${a.codigo_eap} — ` : ''}${a.nome || a.descricao || 'Atividade'}`;
  const items = [...reported].map(id => {
    const a = eap.get(id); const p = progress.get(id);
    return { key: `eap:${id}`, nome: label(a), status: p.completed ? 'Concluída' : 'Em andamento', data_conclusao: p.completed, incluir: null, previsao: '' };
  });
  for (const rdo of rdos) parseArray(rdo.atividades_avulsas).forEach((a, i) => {
    const completed = Number(a.quantidade_prevista) > 0 && Number(a.quantidade_executada) >= Number(a.quantidade_prevista);
    items.push({ key: `avulsa:${rdo.id}:${i}`, nome: a.descricao || 'Atividade avulsa', status: completed ? 'Concluída' : 'Em andamento', data_conclusao: completed ? rdo.data_relatorio : null, incluir: null, previsao: '' });
  });
  const proximas = activities.filter(a => !parentIds.has(String(a.id)) && !reported.has(String(a.id)) && !progress.get(String(a.id))?.completed)
    .map(a => ({ key: `eap:${a.id}`, nome: label(a), inicio: a.data_inicio_planejada, fim: a.data_fim_planejada, incluir: false }));
  const efetivo = [];
  for (const rdo of rdos) {
    const counts = new Map();
    for (const person of parseArray(rdo.mao_obra_detalhada)) { const role = String(person.funcao || 'Não informada').trim() || 'Não informada'; counts.set(role, (counts.get(role) || 0) + 1); }
    for (const [funcao, quantidade] of counts) efetivo.push({ data: rdo.data_relatorio, funcao, quantidade });
  }
  const estrutura=activities.map(a=>({id:a.id,pai_id:a.pai_id,codigo:a.codigo_eap,nome:a.nome||a.descricao||'Atividade',status:a.status||'Não iniciada',percentual:Number(a.percentual_executado||0),inicio:a.data_inicio_planejada,fim:a.data_fim_planejada}));
  return { projeto: project.nome, inicio: start, fim: end, problemas:[], eap:estrutura, suprimentos:supplyAvailable?supplySnapshot(supplies,supplyLinks,end):null, atividades: items, proximas, fotos: photos.map(p => ({ id: p.id, rdo_id: p.rdo_id, data: p.data_relatorio, atividade:[p.atividade_codigo,p.atividade_nome||p.atividade_avulsa_descricao].filter(Boolean).join(' — ')||'Atividade não informada', descricao: p.descricao || '', selecionada: false })), clima: weather, efetivo, rdo_count: rdos.length };
}
function mergeChoices(fresh, previous) {
  fresh.problemas=Array.isArray(previous.problemas)?previous.problemas.map(p=>({ problema:String(p.problema||'').trim(), solucao:String(p.solucao||'').trim(), data:String(p.data||'') })):[];
  for (const field of ['atividades', 'proximas']) {
    const old = new Map((previous[field] || []).map(x => [x.key, x]));
    for (const item of fresh[field]) { const saved = old.get(item.key); if (!saved) continue; if (field === 'atividades' && item.status !== 'Concluída' && saved.status !== 'Concluída') { item.incluir = saved.incluir; item.previsao = saved.previsao; } if (field === 'proximas') item.incluir = !!saved.incluir; }
  }
  const oldPhotos = new Map((previous.fotos || []).map(x => [String(x.id), x]));
  for (const photo of fresh.fotos) { const saved = oldPhotos.get(String(photo.id)); if (saved) { photo.selecionada = !!saved.selecionada; photo.descricao = saved.descricao; } }
  return fresh;
}
function validateChoices(data) {
  if (!data || !validPeriod(data.inicio, data.fim) || !Array.isArray(data.atividades) || !Array.isArray(data.proximas) || !Array.isArray(data.fotos) || !Array.isArray(data.clima) || !Array.isArray(data.efetivo)) return 'Dados do relatório inválidos.';
  if (data.fotos.filter(p => p.selecionada).length > 2) return 'Selecione no máximo duas fotos.';
  if (data.problemas && (!Array.isArray(data.problemas) || data.problemas.length>50 || data.problemas.some(p=>!p || !String(p.problema||'').trim() || !String(p.solucao||'').trim() || !validDate(p.data) || String(p.problema).length>2000 || String(p.solucao).length>2000))) return 'Preencha problema, solução e data válida em cada apontamento.';
  if (data.curva_s != null && (!data.curva_s || !Array.isArray(data.curva_s.serie) || data.curva_s.serie.length>250 || data.curva_s.serie.some(p=>!p || !validDate(p.data) || !Number.isFinite(Number(p.planejado)) || Number(p.planejado)<0 || Number(p.planejado)>100 || !Number.isFinite(Number(p.real)) || Number(p.real)<0 || Number(p.real)>100))) return 'Dados da Curva S inválidos.';
  for (const a of data.atividades) if (a.status !== 'Concluída' && (typeof a.incluir !== 'boolean' || (a.incluir && (!validDate(a.previsao) || a.previsao <= data.fim)))) return 'Informe para cada pendência se será programada e, se for, uma previsão após o corte.';
  return null;
}
module.exports = { validDate, validPeriod, buildSnapshot, mergeChoices, validateChoices, supplySnapshot };

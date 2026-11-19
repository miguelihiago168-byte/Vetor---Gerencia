const {photoFields, applyPhotoChoices, validatePhotoLimits} = require('./relatorioSemanalFotos');
﻿const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
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
// Approval advances and explicit recalculations change the accumulated EAP value.
// RDO creation/edit events can describe just one day's entry. A proposed decrease
// on approval/reversal is also logged, even when the EAP value stays unchanged.
async function physicalHistory(allQuery, tenant, project) {
  return allQuery(`WITH scope AS (
      SELECT id,tenant_id,projeto_id FROM atividades_eap WHERE tenant_id=? AND projeto_id=?
    )
    SELECT e.atividade_eap_id, e.id, e.criado_em, e.percentual_anterior, e.percentual_novo,
           'evento' AS fonte
      FROM atividade_eap_eventos e JOIN scope s ON s.id=e.atividade_eap_id AND s.tenant_id=e.tenant_id
      LEFT JOIN rdos r ON r.id=e.rdo_id
      WHERE (e.rdo_id IS NULL OR (r.projeto_id=s.projeto_id AND r.tenant_id=s.tenant_id))
        AND ((e.origem IN ('rdo_aprovado','rdo_revertido') AND e.percentual_novo > e.percentual_anterior)
         OR (e.origem='recalculo_manual' AND e.rdo_id IS NULL)
         OR e.mensagem='Avanço da atividade calculado a partir das atividades filhas.')
    UNION ALL
    SELECT h.atividade_eap_id,h.id,h.criado_em,h.percentual_anterior,h.percentual_novo,
           'historico'
      FROM historico_atividades h JOIN scope s ON s.id=h.atividade_eap_id AND s.tenant_id=h.tenant_id
      JOIN rdos r ON r.id=h.rdo_id AND r.tenant_id=? AND r.projeto_id=?
    UNION ALL
    SELECT a.registro_id,a.id,a.criado_em,
           (a.dados_anteriores::jsonb->>'percentual_executado')::numeric,
           CASE WHEN a.acao='RECALCULAR' THEN (a.dados_novos::jsonb->>'percentual_executado')::numeric END,
           'auditoria'
      FROM auditoria a JOIN scope s ON s.id=a.registro_id
      WHERE a.tenant_id=? AND a.tabela='atividades_eap' AND a.acao IN ('UPDATE','RECALCULAR')
    ORDER BY criado_em,id,fonte`, [tenant,project,tenant,project,tenant]);
}
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.APP_TIME_ZONE || 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit'
});
const dayOf = time => time && dayFormat.format(new Date(time));
const percent = value => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};
const completedActivity = (activity, row = {}) => {
  const isComplete = status => String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'concluida';
  return isComplete(activity?.status) || isComplete(activity?.fisico?.situacao) ||
    percent(activity?.percentual) === 100 || percent(activity?.fisico?.atual) === 100 || isComplete(row.status);
};
function physicalAtPeriod(activity, rows, start, end, isParent, today) {
  const created = dayOf(activity.criado_em);
  const updated = dayOf(activity.atualizado_em);
  const current = percent(activity.percentual_executado);
  const reference = row => row && { fonte:row.fonte, id:row.id, data:row.criado_em };
  function at(included, openingDay) {
    if (created && !included(created)) return {};
    const following = rows.findIndex(row => !included(row.dia));
    const previous = rows[following < 0 ? rows.length - 1 : following - 1];
    const next = rows[following];
    const after = percent(previous?.percentual_novo);
    const before = percent(next?.percentual_anterior);
    // The dated row can establish a leaf value. A group's cached value alone
    // cannot establish the historical aggregation of its children.
    const dated = updated && included(updated);
    const latest = !previous || new Date(activity.atualizado_em) >= new Date(previous.criado_em);
    if (dated && ((!isParent && latest) || (current != null && current === after))) {
      if (before != null && before !== current) return {};
      return { value:current, status:activity.status, ref:{fonte:'eap', id:activity.id, data:activity.atualizado_em} };
    }
    if (after != null && before != null && after !== before) return {};
    // An UPDATE audit contains the old state, and does not establish the result.
    if (previous && after == null) return {};
    if (after != null) {
      if (!next && updated && !included(updated) && current !== after) return {};
      return { value:after, ref:reference(previous) };
    }
    // The first change on opening day can document the opening balance. Its
    // previous value cannot establish a balance weeks before the event.
    if (before != null && created && next.dia === openingDay &&
        before !== percent(next.percentual_novo) && next.fonte !== 'auditoria') {
      return { value:before, ref:reference(next) };
    }
    return {};
  }
  const initial = start <= today ? at(day => day < start, start) : {};
  const final = end <= today ? at(day => day <= end) : {};
  const actual = final.value ?? null;
  const normal = actual == null ? null : actual >= 100 ? 'Concluída' : actual === 0 ? 'Não iniciada' : 'Em andamento';
  return {
    anterior:initial.value ?? null, atual:actual, situacao:final.status || normal,
    evolucao:initial.value == null || actual == null ? null : Math.round((actual-initial.value)*100)/100,
    fonte_anterior:initial.ref ?? null, fonte_atual:final.ref ?? null
  };
}
function buildSnapshot({ project, start, end, rdos, activities, entries, history=[], photos, weather, supplies=[], supplyLinks=[], supplyAvailable=true }) {
  const timelines = new Map();
  for (const row of history) {
    if (!row.criado_em) continue;
    const id = String(row.atividade_eap_id);
    if (!timelines.has(id)) timelines.set(id, []);
    timelines.get(id).push({...row, dia:dayOf(row.criado_em)});
  }
  const eap = new Map(activities.map(a => [String(a.id), a]));
  const progress = new Map();
  const reported = new Set();
  for (const entry of entries) {
    if (entry.data_relatorio > end) continue;
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
    return { key: `eap:${id}`, nome: label(a), executada:true, status: p.completed ? 'Concluída' : 'Em andamento', data_conclusao: p.completed, incluir: null, previsao: '' };
  });
  for (const rdo of rdos) parseArray(rdo.atividades_avulsas).forEach((a, i) => {
    const completed = Number(a.quantidade_prevista) > 0 && Number(a.quantidade_executada) >= Number(a.quantidade_prevista);
    items.push({ key: `avulsa:${rdo.id}:${i}`, nome: a.descricao || 'Atividade avulsa', status: completed ? 'Concluída' : 'Em andamento', data_conclusao: completed ? rdo.data_relatorio : null, incluir: null, previsao: '' });
  });
  const efetivo = [];
  for (const rdo of rdos) {
    const counts = new Map();
    for (const person of parseArray(rdo.mao_obra_detalhada)) { const role = String(person.funcao || 'Não informada').trim() || 'Não informada'; counts.set(role, (counts.get(role) || 0) + 1); }
    for (const [funcao, quantidade] of counts) efetivo.push({ data: rdo.data_relatorio, funcao, quantidade });
  }
  const parentIds = new Set(activities.map(a => String(a.pai_id)));
  const today = dayOf(new Date());
  const estrutura=activities.map(a=>({id:a.id,pai_id:a.pai_id,codigo:a.codigo_eap,nome:a.nome||a.descricao||'Atividade',status:a.status,percentual:percent(a.percentual_executado),inicio:a.data_inicio_planejada,fim:a.data_fim_planejada,
    fisico:physicalAtPeriod(a,timelines.get(String(a.id)) || [],start,end,parentIds.has(String(a.id)),today)}));
  const catalog = new Map(estrutura.map(a => [`eap:${a.id}`,a]));
  const proximas = estrutura.filter(a => {
    if (reported.has(String(a.id))) return false;
    return !completedActivity(a) && !progress.get(String(a.id))?.completed;
  }).map(a => ({key:`eap:${a.id}`, nome:[a.codigo,a.nome].filter(Boolean).join(' — '),
    inicio:a.inicio, fim:a.fim, incluir:false}));
  for (const item of items) {
    const status = catalog.get(item.key)?.fisico.situacao;
    if (status) {
      item.status = status;
      if (status !== 'Concluída') item.data_conclusao = null;
    }
  }
  return { projeto: project.nome, inicio: start, fim: end, problemas:[], eap:estrutura, suprimentos:supplyAvailable?supplySnapshot(supplies,supplyLinks,end):null, atividades: items, proximas, fotos: photos.map(p => ({ id: p.id, rdo_id: p.rdo_id, data: p.data_relatorio, ...photoFields(p), ordem_selecao: null, descricao: p.descricao || '', selecionada: false })), clima: weather, efetivo, rdo_count: rdos.length };
}
function restoreSavedActivities(fresh, saved) {
  // Only a server-loaded snapshot may supply metadata for an item that disappeared.
  const catalog = new Map((fresh.eap || []).map(a => [`eap:${a.id}`,a]));
  const selected = new Set();
  for (const field of ['atividades','proximas']) {
    const keys = new Set(fresh[field].map(a => a.key));
    for (const row of saved[field] || []) {
      if (!(row.incluir || (field === 'atividades' && row.executada !== false))) continue;
      selected.add(row.key);
      if (keys.has(row.key)) continue;
      const activity = catalog.get(row.key);
      if (field === 'proximas' && completedActivity(activity, row)) continue;
      const restored = {...row, fonte_ausente:!activity || (!row.manual && field==='atividades')};
      if (activity) {
        restored.nome = [activity.codigo,activity.nome].filter(Boolean).join(' — ');
        if (activity.fisico.situacao) restored.status = activity.fisico.situacao;
        if (field === 'proximas') {
          restored.inicio = activity.inicio;
          restored.fim = activity.fim;
        }
      }
      fresh[field].push(restored);
    }
  }
  for (const row of saved.eap || []) {
    if (!catalog.has(`eap:${row.id}`) && selected.has(`eap:${row.id}`)) {
      fresh.eap.push({...row, fonte_ausente:true});
    }
  }
  return fresh;
}
function mergeChoices(fresh, previous) {
  const catalog = new Map((fresh.eap || []).map(a => [`eap:${a.id}`,a]));
  const existing = new Set(fresh.atividades.map(row => row.key));
  for (const choice of previous.atividades || []) {
    const activity = catalog.get(choice.key);
    if (!activity || existing.has(choice.key) || choice.executada !== true) continue;
    fresh.atividades.push({key:choice.key, nome:[activity.codigo,activity.nome].filter(Boolean).join(' — '),
      status:activity.fisico?.situacao || 'Indisponível', manual:true, executada:true, incluir:false, previsao:''});
    existing.add(choice.key);
  }
  fresh.problemas=Array.isArray(previous.problemas)?previous.problemas.map(p=>({ problema:String(p.problema||'').trim(), solucao:String(p.solucao||'').trim(), data:String(p.data||'') })):[];
  for (const field of ['atividades', 'proximas']) {
    const old = new Map((previous[field] || []).map(x => [x.key, x]));
    for (const item of fresh[field]) {
      const saved = old.get(item.key);
      if (!saved) {
        if (field === 'proximas' && Array.isArray(previous.proximas)) item.incluir = false;
        continue;
      }
      if (field === 'proximas') item.incluir = saved.incluir === true;
      else {
        item.executada = saved.executada !== false;
        if (completedActivity(catalog.get(item.key), item)) {
          item.incluir = false;
          item.previsao = '';
        } else {
          item.incluir = saved.incluir;
          item.previsao = saved.previsao || '';
        }
      }
    }
  }
  if (previous.fotos !== undefined) applyPhotoChoices(fresh.fotos, previous.fotos);
  return fresh;
}
function validateChoices(data) {
  if (!data || !validPeriod(data.inicio, data.fim) || !Array.isArray(data.atividades) || !Array.isArray(data.proximas) || !Array.isArray(data.fotos) || !Array.isArray(data.clima) || !Array.isArray(data.efetivo)) return 'Dados do relatório inválidos.';
  const photoError = validatePhotoLimits(data.fotos);
  if (photoError) return photoError;
  if (data.problemas && (!Array.isArray(data.problemas) || data.problemas.length>50 || data.problemas.some(p=>!p || !String(p.problema||'').trim() || !String(p.solucao||'').trim() || !validDate(p.data) || String(p.problema).length>2000 || String(p.solucao).length>2000))) return 'Preencha problema, solução e data válida em cada apontamento.';
  if (data.curva_s != null && (!data.curva_s || !Array.isArray(data.curva_s.serie) || data.curva_s.serie.length>250 || data.curva_s.serie.some(p=>!p || !validDate(p.data) || !Number.isFinite(Number(p.planejado)) || Number(p.planejado)<0 || Number(p.planejado)>100 || !Number.isFinite(Number(p.real)) || Number(p.real)<0 || Number(p.real)>100))) return 'Dados da Curva S inválidos.';
  const catalog = new Map((data.eap || []).map(a => [`eap:${a.id}`,a]));
  for (const a of data.atividades) if (!completedActivity(catalog.get(a.key), a) && (a.executada !== false || a.incluir) && (typeof a.incluir !== 'boolean' || (a.incluir && (!validDate(a.previsao) || a.previsao <= data.fim)))) return 'Informe para cada pendência se será programada e, se for, uma previsão após o corte.';
  return null;
}
function selectedActivities(report) {
  const catalog = new Map((report.eap || []).map(a => [`eap:${a.id}`,a]));
  function describe(row) {
    const a = catalog.get(row.key);
    const avulsa = row.key?.startsWith('avulsa:');
    const legacy = !a && !avulsa && /^(\d+(?:\.\d+)*) — (.+)$/.exec(row.nome);
    return {...row, codigo:a?.codigo || (avulsa ? 'Avulsa' : legacy?.[1] || '—'), descricao:a?.nome || legacy?.[2] || row.nome,
      fisico:a?.fisico || {}, situacao:a?.fisico?.situacao || (avulsa && row.status) || 'Indisponível'};
  }
  const activities = (report.atividades || []).map(describe);
  const executed = activities.filter(a => a.executada !== false);
  const next = new Map((report.proximas || []).filter(a => a.incluir && !completedActivity(catalog.get(a.key), a)).map(a => [a.key, describe(a)]));
  for (const a of activities) if (a.incluir && !completedActivity(catalog.get(a.key), a)) next.set(a.key,a);
  const summary = new Map([...executed,...next.values()].map(a => [a.key,a]));
  return {executed, next:[...next.values()], summary:[...summary.values()]};
}
module.exports = { validDate, validPeriod, physicalHistory, buildSnapshot, mergeChoices, restoreSavedActivities, selectedActivities, validateChoices, supplySnapshot };

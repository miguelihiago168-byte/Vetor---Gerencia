const key = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
const parsePeople = value => {
  if (value == null || value === '') return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) && parsed.every(person => person && key(person.nome) && key(person.funcao)) ? parsed : null;
  }
  catch { return null; }
};

function compararMaoObra({inicio,fim,calendario,previsoes,rdos}) {
  const scheduledDay = date => {
    if (!calendario) return null;
    if (Object.hasOwn(calendario.excecoes || {},date)) return calendario.excecoes[date];
    return calendario.dias.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  };
  const explicitNonWorkingPeriod = plan => {
    const start = Date.parse(`${plan.inicio}T00:00:00Z`);
    const end = Date.parse(`${plan.fim}T00:00:00Z`);
    if (end-start > 30*86400000) return false;
    for (let time=start;time<=end;time+=86400000) {
      if (scheduledDay(new Date(time).toISOString().slice(0,10)) !== false) return false;
    }
    return true;
  };
  const labels = new Map();
  const role = name => { const label = String(name || '').trim(); if (label) labels.set(key(label), labels.get(key(label)) || label); };
  previsoes.forEach(p => role(p.funcao));
  rdos.forEach(r => (parsePeople(r.mao_obra_detalhada) || []).forEach(p => role(p.funcao)));
  const dias = [];
  for (let time = Date.parse(`${inicio}T00:00:00Z`); time <= Date.parse(`${fim}T00:00:00Z`); time += 86400000) {
    const date = new Date(time).toISOString().slice(0,10);
    const dayRdos = rdos.filter(r => r.data_relatorio === date);
    const approved = dayRdos.filter(r => r.status === 'Aprovado');
    const peopleLists = approved.map(r => parsePeople(r.mao_obra_detalhada));
    let rdoState = !dayRdos.length ? 'ausente' : !approved.length || dayRdos.some(r => r.status !== 'Aprovado') || peopleLists.some(p => p === null) ? 'incompleto' : 'completo';
    const active = previsoes.filter(p => p.inicio <= date && p.fim >= date);
    const normal = scheduledDay(date);
    const counts = new Map();
    const personRoles = new Map();
    for (const person of peopleLists.flat().filter(Boolean)) {
      const roleKey = key(person.funcao);
      if (!roleKey) continue;
      if (!counts.has(roleKey)) counts.set(roleKey,new Set());
      const identity = person.usuario_id ? `u:${person.usuario_id}` : person.mao_obra_direta_id ? `m:${person.mao_obra_direta_id}` : key(person.nome);
      if (personRoles.has(identity) && personRoles.get(identity) !== roleKey) rdoState = 'incompleto';
      personRoles.set(identity,roleKey);
      if (identity) counts.get(roleKey).add(identity);
    }
    for (const [roleKey,funcao] of labels) {
      const plans = active.filter(p => key(p.funcao) === roleKey);
      const scheduled = normal === true || (normal === false && plans.some(explicitNonWorkingPeriod));
      const planned = plans.length ? plans.reduce((sum,p) => sum + Number(p.quantidade),0) : null;
      const actual = rdoState === 'completo' ? (counts.get(roleKey)?.size || 0) : null;
      dias.push({data:date,funcao,operacao:normal === null ? 'calendario_ausente' : scheduled ? 'prevista' : 'sem_operacao',
        previsto:planned,real:actual,rdo:rdoState,previsoes:plans.map(p => p.id),comparavel:normal !== null && scheduled && planned !== null && actual !== null});
    }
  }
  const funcoes = [...labels.values()].map(funcao => {
    const rows = dias.filter(d => key(d.funcao) === key(funcao));
    const eligible = rows.filter(d => d.operacao !== 'sem_operacao');
    const comparable = eligible.filter(d => d.comparavel);
    const totalPrevisto = comparable.reduce((sum,d) => sum+d.previsto,0);
    const totalReal = comparable.reduce((sum,d) => sum+d.real,0);
    const count = comparable.length;
    return {funcao,dias_considerados:eligible.length,dias_comparaveis:count,total_previsto:totalPrevisto,total_real:totalReal,
      previsto:count ? totalPrevisto/count : null,real:count ? totalReal/count : null,
      diferenca:count ? (totalReal-totalPrevisto)/count : null,atendimento:totalPrevisto>0 ? totalReal/totalPrevisto*100 : null,
      incompleto:eligible.some(d => !d.comparavel)};
  });
  const totalPrevisto = funcoes.reduce((sum,r) => sum+r.total_previsto,0);
  const totalReal = funcoes.reduce((sum,r) => sum+r.total_real,0);
  return {dias,funcoes,atendimento_global:totalPrevisto>0 ? totalReal/totalPrevisto*100 : null,
    incompleto:!calendario || !previsoes.length || funcoes.some(r => r.incompleto),calendario_configurado:!!calendario};
}
module.exports = { compararMaoObra };

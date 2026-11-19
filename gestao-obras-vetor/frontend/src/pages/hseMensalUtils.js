export const scopeKey = row => [row.funcao,row.empresa,row.fase].map(value => String(value || '').trim().toLocaleLowerCase('pt-BR')).join('\u0000');

export function monthRange(start, end) {
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) return [];
  const [year,month] = start.split('-').map(Number);
  const [endYear,endMonth] = end.split('-').map(Number);
  if (month<1 || month>12 || endMonth<1 || endMonth>12 || (endYear-year)*12+endMonth-month>119) return [];
  const result=[];
  for (let current=year*12+month-1; current<=endYear*12+endMonth-1; current++) {
    result.push(`${String(Math.floor(current/12)).padStart(4,'0')}-${String(current%12+1).padStart(2,'0')}`);
  }
  return result;
}

export function monthBounds(month, obra) {
  const [year,index] = month.split('-').map(Number);
  let inicio = `${month}-01`;
  let fim = new Date(Date.UTC(year,index,0)).toISOString().slice(0,10);
  if (obra?.data_inicio?.slice(0,7) === month) inicio = obra.data_inicio.slice(0,10);
  if (obra?.prazo_termino?.slice(0,7) === month) fim = obra.prazo_termino.slice(0,10);
  return {inicio,fim};
}

export function datesBetween(inicio,fim) {
  const result=[];
  for (let time=Date.parse(`${inicio}T00:00:00Z`);time<=Date.parse(`${fim}T00:00:00Z`);time+=86400000) result.push(new Date(time).toISOString().slice(0,10));
  return result;
}

export function valueOnDate(plans,scope,date) {
  const found=plans.filter(plan => scopeKey(plan)===scope && plan.inicio<=date && plan.fim>=date);
  return found.length===1 ? Number(found[0].quantidade) : null;
}

export function monthlyCell(plans,scope,bounds) {
  const values=datesBetween(bounds.inicio,bounds.fim).map(date=>valueOnDate(plans,scope,date));
  if (values.every(value=>value===null)) return {value:'',mixed:false};
  if (values.some(value=>value===null) || values.some(value=>value!==values[0])) return {value:'',mixed:true};
  return {value:String(values[0]),mixed:false};
}

export function monthlyCurve(months, rows, plans, calendar, obra) {
  if (!calendar) return [];
  const workday = date => Object.hasOwn(calendar.excecoes || {},date) ? calendar.excecoes[date] : calendar.dias.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const explicit = plan => {
    const start=Date.parse(`${plan.inicio}T00:00:00Z`), end=Date.parse(`${plan.fim}T00:00:00Z`);
    return end-start<=30*86400000 && datesBetween(plan.inicio,plan.fim).every(date=>!workday(date));
  };
  const explicitPlans=plans.filter(explicit);
  return months.map(month => {
    const {inicio,fim}=monthBounds(month,obra);
    const dates=datesBetween(inicio,fim).filter(date => workday(date) || explicitPlans.some(plan=>plan.inicio<=date && plan.fim>=date));
    const byRole = new Map();
    for (const row of rows) {
      const values=dates.map(date=>valueOnDate(plans,scopeKey(row),date));
      const role=String(row.funcao).trim();
      const roleKey=role.toLocaleLowerCase('pt-BR');
      const previous=byRole.get(roleKey) || {funcao:role,values:[]};
      previous.values.push(values.length && values.every(value=>value!==null) ? values.reduce((a,b)=>a+b,0)/values.length : null);
      byRole.set(roleKey,previous);
    }
    const roles=[...byRole.values()].map(({funcao,values}) => ({funcao,valor:values.every(value=>value!==null) ? values.reduce((a,b)=>a+b,0) : null}));
    return {month,roles,total:roles.length && roles.every(role=>role.valor!==null) ? roles.reduce((sum,role)=>sum+role.valor,0) : null};
  });
}

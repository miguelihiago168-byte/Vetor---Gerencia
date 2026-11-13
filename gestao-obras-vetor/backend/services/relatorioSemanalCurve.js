const {recalcularCronograma}=require('./ganttService');
const DAY=86400000;
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'') && !Number.isNaN(Date.parse(s)) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const dateAt=n=>new Date(n).toISOString().slice(0,10);
function buildCutoffCurve(activities,entries,cutoff,dependencies=[]) {
  const base={corte:cutoff,versao_corte:1,serie:[]};
  if(!validDate(cutoff))return base;
  const parents=new Set(activities.filter(a=>a.pai_id!=null).map(a=>String(a.pai_id)));
  const leaves=activities.filter(a=>!parents.has(String(a.id)));
  if(!leaves.length)return base;
  if(leaves.some(a=>!validDate(a.data_inicio_planejada)||!validDate(a.data_fim_planejada))){base.motivo='EAP com datas incompletas para a Curva S.';return base;}
  const planned=recalcularCronograma(leaves,dependencies).novasAtividades;
  const sum=planned.reduce((n,a)=>n+Number(a.peso_percentual_projeto??a.percentual_previsto??0),0);
  if(sum<=0){base.motivo='EAP sem pesos válidos para a Curva S.';return base;}
  const end=Date.parse(cutoff+'T00:00:00Z'), perDay=new Map(),weights=new Map(),byId=new Map(planned.map(a=>[String(a.id),a]));
  let start=Math.min(...planned.map(a=>Date.parse(a.data_inicio_planejada+'T00:00:00Z')),end);
  for(const a of planned){const weight=Number(a.peso_percentual_projeto??a.percentual_previsto??0)*100/sum;weights.set(String(a.id),weight);const first=Date.parse(a.data_inicio_planejada+'T00:00:00Z'),last=Date.parse(a.data_fim_planejada+'T00:00:00Z');const days=[];for(let n=first;n<=last;n+=DAY){const d=new Date(n).getUTCDay();if(d!==0&&d!==6)days.push(n);}if(!days.length)days.push(first);for(const n of days){if(n>end)continue;const key=dateAt(n);perDay.set(key,(perDay.get(key)||0)+weight/days.length);}}
  const realDays=new Map();
  for(const row of entries){if(!validDate(row.data_relatorio)||row.data_relatorio>cutoff)continue;const id=String(row.atividade_eap_id),a=byId.get(id);if(!a)continue;const n=Date.parse(row.data_relatorio+'T00:00:00Z');start=Math.min(start,n);const percent=Number(a.quantidade_total)>0?Number(row.quantidade_executada||0)/Number(a.quantidade_total)*100:Number(row.percentual_executado||0);const key=row.data_relatorio;if(!realDays.has(key))realDays.set(key,new Map());const daily=realDays.get(key);daily.set(id,(daily.get(id)||0)+percent);}
  const accumulated=new Map();let plan=0,real=0;
  const series=[];
  for(let n=start;n<=end;n+=DAY){const date=dateAt(n);plan=Math.min(100,plan+(perDay.get(date)||0));for(const [id,percent]of realDays.get(date)||[]){const prev=accumulated.get(id)||0,next=Math.max(0,Math.min(100,prev+percent));real+=(weights.get(id)||0)*(next-prev)/100;accumulated.set(id,next);}series.push({data:date,planejado:Math.round(plan*100)/100,real:Math.round(Math.max(0,Math.min(100,real))*100)/100});}
  const step=Math.max(1,Math.ceil(series.length/249));base.serie=series.filter((_,i)=>i%step===0);if(series.length&&base.serie.at(-1)!==series.at(-1))base.serie.push(series.at(-1));
  return base;
}
module.exports={buildCutoffCurve};

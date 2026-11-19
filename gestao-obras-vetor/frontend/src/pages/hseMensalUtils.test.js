import assert from 'node:assert/strict';
import { monthRange, monthBounds, monthlyCell, monthlyCurve, scopeKey } from './hseMensalUtils.js';

assert.deepEqual(monthRange('2026-11','2027-02'),['2026-11','2026-12','2027-01','2027-02']);
assert.deepEqual(monthBounds('2026-11',{data_inicio:'2026-11-15',prazo_termino:'2027-02-14'}),{inicio:'2026-11-15',fim:'2026-11-30'});
assert.equal(monthRange('2020-01','2030-01').length,0);
const row={funcao:'Eletricista',empresa:'A',fase:''};
const plan=[{...row,inicio:'2026-11-15',fim:'2026-11-30',quantidade:0}];
assert.deepEqual(monthlyCell(plan,scopeKey(row),{inicio:'2026-11-15',fim:'2026-11-30'}),{value:'0',mixed:false});
assert.deepEqual(monthlyCell(plan,scopeKey(row),{inicio:'2026-11-01',fim:'2026-11-30'}),{value:'',mixed:true});
assert.deepEqual(monthlyCell([],scopeKey(row),{inicio:'2026-11-01',fim:'2026-11-30'}),{value:'',mixed:false});
const changing=[{...row,inicio:'2026-11-02',fim:'2026-11-04',quantidade:5},{...row,inicio:'2026-11-05',fim:'2026-11-06',quantidade:8}];
const curve=monthlyCurve(['2026-11'],[row],changing,{dias:[1,2,3,4,5],excecoes:{}},{data_inicio:'2026-11-02',prazo_termino:'2026-11-06'});
assert.equal(curve[0].total,6.2);
assert.equal(monthlyCurve(['2026-11'],[row],changing,{dias:[1,2,3,4,5],excecoes:{}},null)[0].total,null);
console.log('Grade mensal: meses, períodos parciais, zero, lacunas e médias aprovados.');

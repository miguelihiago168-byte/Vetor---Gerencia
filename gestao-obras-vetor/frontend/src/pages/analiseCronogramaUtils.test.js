import assert from 'node:assert/strict';
import { prepararPrioridades } from './analiseCronogramaUtils.js';

const analise = {
  atividades_atrasadas: [
    { id: 1, codigo_eap: '1', dias_atraso: 20, sucessoras_impactadas: [] },
    { id: 2, codigo_eap: '1.1', dias_atraso: 9, sucessoras_impactadas: [{ id: 7, percentual_executado: 100 }, { id: 8, percentual_executado: 0 }] },
    { id: 3, codigo_eap: '1.2', dias_atraso: 2, no_caminho_critico: true, sucessoras_impactadas: [] }
  ],
  predecessoras_pendentes: [{ atividade: { id: 3 }, pendentes: [{ id: 2 }] }]
};
const resultado = prepararPrioridades(analise, [{ id: 1 }, { id: 2, pai_id: 1 }, { id: 3, pai_id: 1 }]);
assert.equal(resultado.agrupadoras, 1);
assert.deepEqual(resultado.prioridades.map(a => a.id), [3, 2]);
assert.equal(resultado.prioridades[0].bloqueios[0].id, 2);
assert.deepEqual(resultado.prioridades[1].sucessorasAbertas.map(a => a.id), [8]);
assert.deepEqual(prepararPrioridades({}, []).prioridades, []);
console.log('Análise de cronograma: prioridades, agrupadoras e dependências verificadas.');

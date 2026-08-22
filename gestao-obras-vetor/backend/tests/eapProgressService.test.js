const assert = require('assert');
const { calculateProjectProgress } = require('../services/eapProgressService');

const result = calculateProjectProgress([
  { id: 1, pai_id: null, percentual_executado: 80, peso_percentual_projeto: 100 },
  { id: 2, pai_id: 1, percentual_executado: 100, peso_percentual_projeto: 50 },
  { id: 3, pai_id: 1, percentual_executado: 100, peso_percentual_projeto: 50 },
  { id: 4, pai_id: null, percentual_executado: 100, peso_percentual_projeto: 100 },
  { id: 5, pai_id: 4, percentual_executado: 100, peso_percentual_projeto: 100 }
]);

assert.strictEqual(result.percentual, 100, 'atividades-filhas concluídas devem concluir o projeto');
assert.deepStrictEqual(
  result.atividadesPrincipais.map((activity) => activity.percentual_executado),
  [100, 100],
  'o percentual das atividades-pai deve ser consolidado pelos filhos'
);

console.log('eapProgressService tests passed');

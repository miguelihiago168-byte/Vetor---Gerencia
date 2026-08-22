const assert = require('assert');
const {
  dateKey,
  businessDaysBetween,
  summarizeExecution,
  summarizeWorkforce,
  summarizeEquipment,
  summarizeQuality,
  loadCockpit
} = require('../services/cockpitService');

const now = new Date('2026-07-15T15:00:00-03:00');

const main = async () => {
  assert.strictEqual(dateKey('2026-07-15'), '2026-07-15');
  assert.strictEqual(dateKey(now), '2026-07-15');
  assert.strictEqual(businessDaysBetween('2026-07-17', '2026-07-20'), 1, 'fim de semana não deve contar como dia obrigatório de RDO');
  assert.strictEqual(businessDaysBetween('2026-07-17', '2026-07-21'), 2);

  const rdos = [
    { id: 2, data_relatorio: '2026-07-15', status: 'Em aprovação do gestor', mao_obra_direta: 4, mao_obra_indireta: 1, activity_count: 2, photo_count: 3, occurrence_count: 1 },
    { id: 1, data_relatorio: '2026-07-10', status: 'Aprovado', mao_obra_direta: 2, mao_obra_terceiros: 2, activity_count: 1, photo_count: 1, occurrence_count: 0 },
    { id: 0, data_relatorio: '2026-07-01', status: 'Aprovado', mao_obra_direta: 9 }
  ];
  const execution = summarizeExecution(rdos, now);
  assert.deepStrictEqual(execution.totals, { rdos: 2, activities: 3, photos: 4, occurrences: 1, awaiting_analysis: 1, awaiting_manager: 1, awaiting_fiscal: 0 });
  assert.strictEqual(execution.days_since_latest, 0);

  const fridayRdo = summarizeExecution([{ id: 3, data_relatorio: '2026-07-17', status: 'Aprovado' }], new Date('2026-07-20T15:00:00-03:00'));
  assert.strictEqual(fridayRdo.days_since_latest, 1, 'segunda-feira deve ser o primeiro dia útil sem RDO após sexta-feira');

  const weekendRdo = summarizeExecution([
    { id: 4, data_relatorio: '2026-07-09', criado_em: '2026-07-12T10:30:00-03:00', status: 'Aprovado' }
  ], new Date('2026-07-14T15:00:00-03:00'));
  assert.strictEqual(weekendRdo.latest_rdo_activity_date, '2026-07-12', 'RDO lançado no fim de semana deve atualizar a referência de novo RDO');
  assert.strictEqual(weekendRdo.days_since_latest, 2, 'somente segunda e terça devem contar como dias úteis após o RDO de domingo');

  const unavailable = summarizeWorkforce(rdos, [], now);
  assert.strictEqual(unavailable.hh, null);
  assert.strictEqual(unavailable.hh_available, false);
  assert.strictEqual(unavailable.latest_effective, 5);
  assert.strictEqual(unavailable.average_effective, 4.5);

  const workforce = summarizeWorkforce(rdos, [
    { data_relatorio: '2026-07-15', horas_trabalhadas: 8, funcao: 'Eletricista' },
    { data_relatorio: '2026-07-15', horas_trabalhadas: 7.5, funcao: 'Eletricista' },
    { data_relatorio: '2026-07-10', horas_trabalhadas: 6, funcao: 'Ajudante' }
  ], now);
  assert.strictEqual(workforce.hh, 21.5);
  assert.deepStrictEqual(workforce.by_function[0], { funcao: 'Eletricista', quantidade: 2 });

  const equipment = summarizeEquipment([
    { nome: ' Retroescavadeira ', quantidade: 1, data_relatorio: '2026-07-10' },
    { nome: 'retroescavadeira', quantidade: 2, data_relatorio: '2026-07-15' },
    { nome: 'Guindaste', quantidade: 1, data_relatorio: '2026-07-15' }
  ]);
  assert.deepStrictEqual(equipment.find((item) => item.name.toLowerCase() === 'retroescavadeira'), {
    name: 'Retroescavadeira', max_quantity: 2, days_used: 2, last_used: '2026-07-15'
  });

  const quality = summarizeQuality([
    { id: 1, status: 'Aberta', gravidade: 'Crítica', criado_em: '2026-07-14' },
    { id: 2, status: 'Em análise', gravidade: 'Alta', criado_em: '2026-07-10' },
    { id: 3, status: 'Encerrada', gravidade: 'Baixa', resolvido_em: '2026-07-13' }
  ], now);
  assert.strictEqual(quality.open, 2);
  assert.strictEqual(quality.critical_open, 1);
  assert.strictEqual(quality.recently_closed, 1);

  const queries = [];
  const allQuery = async (sql) => {
    queries.push(sql);
    if (sql.includes('FROM atividades_eap WHERE')) return [{ total: 0, planned_start: null, latest_update: null }];
    return [];
  };
  const empty = await loadCockpit({
    project: { id: 99, nome: 'Projeto vazio' },
    permissions: { rdo: false, quality: false, curve_s: false, eap: false, procurement: false, assets: false },
    allQuery,
    now
  });
  assert.strictEqual(empty.execution, null);
  assert.strictEqual(empty.quality, null);
  assert.strictEqual(queries.some((sql) => sql.includes('FROM rdos')), false, 'bloco sem permissão não deve consultar RDO');
  assert.strictEqual(queries.some((sql) => sql.includes('FROM atividades_eap')), false, 'bloco sem permissão não deve consultar EAP');
  assert.strictEqual(empty.project.activity_count, null);

  const partial = await loadCockpit({
    project: { id: 100, nome: 'Projeto parcial' },
    permissions: { rdo: true, quality: true, curve_s: false, eap: false, procurement: false, assets: false },
    allQuery: async (sql) => {
      if (sql.includes('FROM atividades_eap WHERE')) return [{ total: 0 }];
      if (sql.includes('FROM rnc WHERE')) throw new Error('RNC indisponível');
      return [];
    },
    now
  });
  assert.ok(partial.execution, 'falha de Qualidade não deve derrubar Execução');
  assert.strictEqual(partial.quality, null, 'falha de Qualidade não pode ser apresentada como zero');
  assert.ok(partial.errors.some((item) => item.source === 'quality'));

  const rdoFailure = await loadCockpit({
    project: { id: 101, nome: 'Falha de RDO' },
    permissions: { rdo: true, quality: false, curve_s: false, eap: false, procurement: false, assets: false },
    allQuery: async (sql) => {
      if (sql.includes('FROM rdos r LEFT JOIN')) throw new Error('RDO indisponível');
      return [];
    },
    now
  });
  assert.strictEqual(rdoFailure.execution, null, 'falha de RDO não pode ser apresentada como lista vazia');
  assert.ok(rdoFailure.errors.some((item) => item.source === 'rdos'));

  console.log(JSON.stringify({ ok: true, scenarios: 14 }));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

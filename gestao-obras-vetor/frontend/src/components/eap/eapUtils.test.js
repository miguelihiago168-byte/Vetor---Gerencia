import assert from 'node:assert/strict';
import { activityPayload, activityCounts, activityProgress, buildHierarchy, initialDraft, nextChildCode, validateDraft, visibleActivities, parseMeasurementInput, isMeasurementOnlyDraft, measurementSummary, formatCurrency } from './eapUtils.js';

const activities = [
  { id: 1, codigo_eap: '1', nome: 'Fundação', pai_id: null, percentual_executado: 95 },
  { id: 2, codigo_eap: '1.1', nome: 'Escavação', pai_id: 1, peso_percentual_projeto: 40, percentual_executado: 100 },
  { id: 3, codigo_eap: '1.2', nome: 'Concreto', pai_id: 1, peso_percentual_projeto: 60, percentual_executado: 50 },
  { id: 4, codigo_eap: '2', nome: 'Cobertura', pai_id: null, percentual_executado: 0 },
  { id: 5, codigo_eap: '2.10', nome: 'Telhas', pai_id: 4, peso_percentual_projeto: 0, percentual_executado: 0 },
  { id: 6, codigo_eap: '2.2', nome: 'Estrutura', pai_id: 4, peso_percentual_projeto: 0, percentual_executado: 100 },
  { id: 7, codigo_eap: '2.2.1', nome: 'Montagem', pai_id: 6, peso_percentual_projeto: 20, percentual_executado: 100 }
];
const before = JSON.stringify(activities);
const tree = buildHierarchy(activities);
assert.equal(tree[0].progress, 70, 'consolida os filhos, sem usar o valor salvo no agrupador');
assert.equal(tree[1].progress, 50, 'mantém média simples quando os filhos não possuem pesos');
assert.equal(tree[1].children[0].codigo_eap, '2.2', 'ordena códigos numericamente');
assert.equal(tree[1].children[0].progress, 100, 'todos os filhos concluídos encerram o pai mesmo sem soma de pesos de 100%');
assert.deepEqual(activityCounts(activities), { total: 4, idle: 1, active: 1, done: 2 });
assert.deepEqual(visibleActivities(tree, new Set()).map((a) => a.id), [1, 4]);
const filtered = visibleActivities(tree, new Set(), 'ESCAVACAO', 'done');
assert.deepEqual(filtered.map((a) => a.id), [1, 2], 'busca sem acentos encontra a filha e mantém seu pai');
assert.equal(filtered[0].progress, 70, 'filtro de concluídas não faz o pai parecer concluído');
assert.equal(filtered[0].contextOnly, true);
assert.deepEqual(visibleActivities(tree, new Set(), 'montagem').map((a) => a.id), [4, 6, 7], 'mantém ancestrais em vários níveis');
assert.deepEqual(visibleActivities(tree, new Set(), 'fundacao').map((a) => a.id), [1, 2, 3], 'buscar agrupador permite inspecionar seu conteúdo');
assert.equal(JSON.stringify(activities), before, 'consultas não modificam dados recebidos');
assert.equal(activityProgress({ children: [{ peso_percentual_projeto: 20, percentual_executado: 50 }, { peso_percentual_projeto: 30, percentual_executado: 50 }] }), 25, 'não normaliza pesos que somam menos de 100%');
assert.equal(nextChildCode(4, activities), '2.11');
assert.equal(nextChildCode(3, activities), '1.2.1');

const original = {
  id: 8, codigo_eap: '1.3', nome: 'Armação', descricao: 'Aço CA-50', pai_id: 1,
  unidade_medida: 'kg', quantidade_total: '1234.56', peso_percentual_projeto: '12.34',
  data_inicio_planejada: '2026-10-01T00:00:00.000Z', data_fim_planejada: '2026-11-30',
  predecessora_id: 2, predecessoras_ids: [2, 3], tipo_vinculo_dependencia: 'SS',
  percentual_executado: 45, status: 'Em andamento', id_atividade: 'ATV-8', ordem: 11
};
const draft = initialDraft(original);
const payload = activityPayload({ ...draft, nome: 'Armação revisada' }, '42', original);
assert.equal(payload.quantidade_total, 1234.56, 'editar apenas o nome não zera a quantidade no PUT');
assert.equal(payload.nome, 'Armação revisada');
assert.equal(payload.descricao, 'Aço CA-50');
assert.equal(payload.peso_percentual_projeto, 12.34, 'preserva a precisão do peso existente');
assert.equal(payload.percentual_previsto, 12.34);
assert.equal(payload.data_inicio_planejada, '2026-10-01');
assert.equal(payload.data_fim_planejada, '2026-11-30');
assert.equal(payload.pai_id, '1');
assert.equal(payload.unidade_medida, 'kg');
for (const key of ['percentual_executado', 'status', 'children', 'predecessora_id', 'tipo_vinculo_dependencia', 'predecessoras_ids']) assert.equal(key in payload, false, `${key} não deve ser enviado por uma edição básica`);
assert.equal(activityPayload({ ...draft, data_inicio_planejada: '' }, 42, original).data_inicio_planejada, '2026-10-01', 'preserva comportamento de datas vazias na edição');
assert.equal(activityPayload({ ...draft, predecessora_id: '' }, 42, original).predecessora_id, null, 'remoção explícita da predecessora continua funcionando');
assert.equal(activityPayload({ ...draft, tipo_vinculo_dependencia: 'FF' }, 42, original).tipo_vinculo_dependencia, 'FF');

const root = { ...initialDraft(), codigo_eap: '3', nome: 'Acabamento' };
assert.deepEqual(validateDraft(root), {}, 'datas, peso e unidade são opcionais na raiz');
assert.equal(activityPayload(root, 42).peso_percentual_projeto, 0);
const child = { ...initialDraft(null, '1', activities), nome: 'Nova filha' };
assert.deepEqual(Object.keys(validateDraft(child)).sort(), ['data_fim_planejada', 'data_inicio_planejada', 'peso_percentual_projeto', 'unidade_medida'].sort());
assert.ok(validateDraft({ ...draft, data_fim_planejada: '2026-09-30' }).data_fim_planejada);
assert.ok(validateDraft({ ...draft, peso_percentual_projeto: '101' }).peso_percentual_projeto);
assert.deepEqual(validateDraft({ ...draft, peso_percentual_projeto: '0' }), {}, 'peso zero continua permitido');
console.log('EAP: hierarquia, filtros, contadores, códigos e preservação do payload validados.');

assert.equal(parseMeasurementInput('10.000,50'), 10000.5);
assert.equal(parseMeasurementInput('10000.50'), 10000.5);
assert.equal(parseMeasurementInput('0,00'), 0);
assert.equal(parseMeasurementInput(''), null);
for (const value of ['-1', '1,001', 'abc', '1e3', '10000000000000']) assert.equal(parseMeasurementInput(value), undefined);
assert.equal(initialDraft({ valor_total_medicao: '123.45' }).valor_total_medicao, '123,45');
assert.equal(activityPayload({ ...root, valor_total_medicao: '10.000,50' }, 42).valor_total_medicao, 10000.5);
assert.equal(activityPayload({ ...root, valor_total_medicao: '' }, 42).valor_total_medicao, null);
assert.equal('valor_total_medicao' in activityPayload(root, 42, original, true), false, 'agrupador não envia preço próprio');
assert.ok(validateDraft({ ...root, valor_total_medicao: '1,001' }).valor_total_medicao);
assert.equal(isMeasurementOnlyDraft({ ...draft, valor_total_medicao: '500' }, draft), true);
assert.equal(isMeasurementOnlyDraft({ ...draft, valor_total_medicao: '500', nome: 'Outro' }, draft), false);
const priced = [
  { id: 1, pai_id: null, medicao: { valor_previsto: 1000, valor_medido: 300, atividades_sem_valor: 1 } },
  { id: 2, pai_id: 1, medicao: { valor_previsto: 1000, valor_medido: 300, atividades_sem_valor: 0 } },
  { id: 3, pai_id: 1, medicao: { valor_previsto: null, valor_medido: null, atividades_sem_valor: 1 } }
];
assert.deepEqual(measurementSummary(priced), { valor_previsto: 1000, valor_medido: 300, saldo: 700, atividades_sem_valor: 1 });
assert.equal(formatCurrency(null), 'Não precificada');
assert.match(formatCurrency(0), /0,00/);
console.log('EAP medição: entrada em reais, payload, edição monetária e totais sem dupla contagem validados.');

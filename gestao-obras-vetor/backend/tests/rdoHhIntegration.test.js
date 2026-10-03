const assert = require('assert');
const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(backendRoot, ...parts), 'utf8');

const route = read('routes', 'rdos.js');
const pdf = read('services', 'rdoPdfService.js');
const cockpit = read('services', 'cockpitService.js');
const migration = read('scripts', 'migrations', '000024_rdo_hh_mao_obra_direta.js');

assert.match(migration, /ADD COLUMN IF NOT EXISTS hh_mao_obra_direta NUMERIC\(10,2\)/);
assert.doesNotMatch(migration, /UPDATE\s+rdos/i, 'a migration nao deve recalcular o historico');

assert.match(route, /calcularHhMaoObraDireta\(maoObraDetalhada,/);
assert.match(route, /calcularHhMaoObraDireta\(maoObraDetalhadaEfetiva,/);
assert.match(route, /mao_obra_detalhada, hh_mao_obra_direta, atividades_avulsas/);
assert.match(route, /mao_obra_detalhada = \?, hh_mao_obra_direta = \?/);
assert.doesNotMatch(route, /const\s*\{[^}]*hh_mao_obra_direta[^}]*\}\s*=\s*req\.body/s, 'HH enviado pelo cliente nao deve ser aceito');

assert.match(pdf, /rdo\.hh_mao_obra_direta/);
assert.match(pdf, /HH mão de obra direta/);
assert.doesNotMatch(pdf, /horasHomem\s*=/, 'PDF nao deve recalcular HH com todas as categorias');
assert.doesNotMatch(pdf, /horasTrabalhadas\s*=/, 'PDF nao deve usar a jornada geral como fallback');

assert.match(cockpit, /hh_rdos_count:/);
assert.match(cockpit, /hh_rdos_total:/);
assert.match(cockpit, /hh_partial:/);
assert.match(cockpit, /r\.hh_mao_obra_direta/);

console.log(JSON.stringify({ ok: true, suite: 'rdoHhIntegration', scenarios: 13 }));

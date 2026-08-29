const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const migration = read('scripts', 'migrations', '000012_estoque_rastreabilidade_unificada.js');
const route = read('routes', 'estoque.js');

assert.match(migration, /quantidade_quarentena/);
assert.match(migration, /estoque_inspecoes/);
assert.match(migration, /estoque_aplicacoes/);
assert.match(migration, /estoque_lote_rncs/);
assert.match(route, /ENTRADA_COMPRA/);
assert.match(route, /AGUARDANDO_INSPECAO/);
assert.match(route, /quantidade_reservada\) - Number\(balance\.quantidade_quarentena/);
assert.match(route, /router\.post\('\/saidas'/);
assert.match(route, /frente de serviço ou a atividade EAP/);
assert.match(route, /router\.post\('\/rastreabilidade\/:loteId\/inspecoes'/);
assert.match(route, /router\.post\('\/rastreabilidade\/:loteId\/rnc'/);
assert.match(route, /COALESCE\(u\.is_adm::TEXT, 'false'\)/);
assert.match(route, /Falha de notificação não pode fazer/);

console.log(JSON.stringify({ ok: true, suite: 'estoqueRastreabilidadeUnificada', scenarios: 7 }));

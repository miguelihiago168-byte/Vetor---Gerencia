const assert = require('assert');
const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const relatedRoute = fs.readFileSync(path.join(backendRoot, 'routes', 'rdo_related.js'), 'utf8');
const rdoRoute = fs.readFileSync(path.join(backendRoot, 'routes', 'rdos.js'), 'utf8');
const rdoForm = fs.readFileSync(path.join(backendRoot, '..', 'frontend', 'src', 'pages', 'RDOForm2.jsx'), 'utf8');

// Every active collaborator linked to the project belongs in the RDO attendance list.
assert.doesNotMatch(relatedRoute, /\.filter\(ehMaoObraDeExecucao\)/);
assert.match(rdoForm, /return colaboradoresDisponiveis\.filter\(item =>/);

// Only activity-resource allocation remains restricted to execution labour.
assert.match(rdoForm, /\(formData\.mao_obra_detalhada \|\| \[\]\)\.filter\(colaboradorEhExecucao\)/);
assert.doesNotMatch(rdoForm, /if \(!colaboradorEhExecucao\(draftColab\)\)/);
assert.match(rdoForm, /String\(item\?\.tipo \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'indireta'/);
assert.match(rdoRoute, /Apenas mão de obra de execução pode ser vinculada às atividades/);

console.log(JSON.stringify({ ok: true, suite: 'rdoAttendanceEligibility', scenarios: 6 }));

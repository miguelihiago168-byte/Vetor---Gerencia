const fs = require('fs');
const path = require('path');
const parser = require('../frontend/node_modules/@babel/parser');
const file = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'RDOForm.jsx');
const code = fs.readFileSync(file, 'utf8');
try {
  parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'classProperties', 'optionalChaining'] });
  console.log('PARSE_OK');
} catch (e) {
  console.error('PARSE_ERR::', e.message);
  if (e.loc) console.error('LOC:', e.loc);
  process.exit(1);
}

const fs=require('fs');
const s=fs.readFileSync('./frontend/src/pages/RDOForm.jsx','utf8');
const openDiv=(s.match(/<div(\s|>|\/>)/g)||[]).length;
const closeDiv=(s.match(/<\/div>/g)||[]).length;
const openModal=(s.match(/<Modal(\s|>|\/)/g)||[]).length;
const closeModal=(s.match(/<\/Modal>/g)||[]).length;
console.log('openDiv',openDiv,'closeDiv',closeDiv,'delta',openDiv-closeDiv);
console.log('openModal',openModal,'closeModal',closeModal,'delta',openModal-closeModal);

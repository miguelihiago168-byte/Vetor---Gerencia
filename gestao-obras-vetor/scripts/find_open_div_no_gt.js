const fs=require('fs');
const lines=fs.readFileSync('./frontend/src/pages/RDOForm.jsx','utf8').split('\n');
lines.forEach((l,i)=>{ if(l.includes('<div') && !l.includes('>')) console.log('no_gt',i+1,l); });

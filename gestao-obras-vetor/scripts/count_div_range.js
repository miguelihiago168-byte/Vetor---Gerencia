const fs=require('fs');
const lines=fs.readFileSync('./frontend/src/pages/RDOForm.jsx','utf8').split('\n');
const start=472, end=814;
let open=0, close=0;
for(let i=start-1;i<end;i++){
  const l=lines[i];
  const o=(l.match(/<div(\s|>|$)/g)||[]).length;
  const c=(l.match(/<\/div>/g)||[]).length;
  open+=o; close+=c;
}
console.log('From',start,'to',end,'open',open,'close',close,'delta',open-close);

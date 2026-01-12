const fs=require('fs');
const lines=fs.readFileSync('./frontend/src/pages/RDOForm.jsx','utf8').split('\n');
const start=548, end=814;
let stack=[];
for(let i=start-1;i<end;i++){
  const l=lines[i];
  const openMatches=[...l.matchAll(/<div(\s|>|$)/g)];
  for(const m of openMatches){ if(/<div[^>]*\/\>/.test(l)) continue; stack.push({line:i+1,text:l.trim()}); }
  const closeMatches=[...l.matchAll(/<\/div>/g)];
  for(const m of closeMatches){ if(stack.length>0) stack.pop(); else console.log('Unmatched close at', i+1,l.trim()); }
}
if(stack.length>0){ console.log('Unmatched opens in range:', stack.length); stack.forEach(s=>console.log(s.line,s.text)); } else console.log('All matched in range');

const fs=require('fs');
const lines=fs.readFileSync('./frontend/src/pages/RDOForm.jsx','utf8').split('\n');
let stack=[];
for(let i=0;i<lines.length;i++){
  const l=lines[i];
  // detect opening <div ...> but ignore self-closing <div />
  const openMatches = [...l.matchAll(/<div(\s|>|$)/g)];
  for(const m of openMatches){
    // if self closing in same line like <div /> consider closed
    if(/<div[^>]*\/\>/.test(l)) continue;
    stack.push({line: i+1, text: l.trim()});
  }
  const closeMatches = [...l.matchAll(/<\/div>/g)];
  for(const m of closeMatches){
    if(stack.length>0) stack.pop();
    else console.log('Unmatched close at', i+1, l.trim());
  }
}
if(stack.length>0){
  console.log('Unmatched opens:', stack.length);
  stack.forEach(s=>console.log('OPEN at', s.line, s.text));
} else console.log('All matched');

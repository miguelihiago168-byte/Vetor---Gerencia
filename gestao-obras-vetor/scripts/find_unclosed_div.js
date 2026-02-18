const fs = require('fs');
const path = process.argv[2];
const text = fs.readFileSync(path,'utf8');
// remove template literal contents to avoid HTML inside strings
let cleaned = text.replace(/`[\s\S]*?`/g, '');
// remove JS comments
cleaned = cleaned.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const lines = cleaned.split(/\r?\n/);
let stack = [];
for(let i=0;i<lines.length;i++){
  const line = lines[i];
  // find all tags in line
  const regex = /<\/?([A-Za-z0-9_\-]+)([^>]*)>/g;
  let m;
  while((m = regex.exec(line))!==null){
    const full = m[0];
    const name = m[1];
    const isClosing = full.startsWith('</');
    const selfClosing = /\/\s*>$/.test(full) || /\/\s*>$/.test(full);
    if(!isClosing){
      if(!selfClosing){
        stack.push({name, line:i+1, col:m.index+1});
      }
    } else {
      // pop matching
      for(let j=stack.length-1;j>=0;j--){
        if(stack[j].name===name){
          stack.splice(j,1); break;
        }
      }
    }
  }
}
console.log('Unclosed tags count:', stack.length);
stack.slice(-10).forEach(s=> console.log(`${s.name} opened at line ${s.line} col ${s.col}`));
if(stack.length>0) process.exit(1);
else process.exit(0);

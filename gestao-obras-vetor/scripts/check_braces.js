const fs=require('fs');
const s=fs.readFileSync('./frontend/src/pages/RDOForm.jsx','utf8');
let stack=[];
for(let i=0;i<s.length;i++){
  const ch=s[i];
  if(ch==='\''){} // noop
  if(ch==='{') stack.push(i);
  if(ch==='}'){
    if(stack.length===0){
      console.log('Unmatched closing } at index', i, 'line', s.slice(0,i).split('\n').length);
      break;
    } else stack.pop();
  }
}
console.log('Remaining unmatched { count:', stack.length);
if(stack.length>0){ console.log('First unmatched { at line', s.slice(0,stack[0]).split('\n').length); }

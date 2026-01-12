const fs=require('fs');
const path=require('path');
const parser=require('../frontend/node_modules/@babel/parser');
const file=path.join(__dirname,'..','frontend','src','pages','RDOForm.jsx');
const code=fs.readFileSync(file,'utf8');
try{parser.parse(code,{sourceType:'module',plugins:['jsx','classProperties','optionalChaining']});console.log('OK');}
catch(e){
  console.error('ERR',e.message);
  if(e.loc){
    const {line,column} = e.loc;
    const lines=code.split('\n');
    const start=Math.max(0,line-6);
    const end=Math.min(lines.length,line+4);
    console.log('--- context ---');
    for(let i=start;i<end;i++){
      const num=(i+1).toString().padStart(4,' ');
      console.log(num+': '+lines[i]);
    }
  }
  process.exit(1);
}

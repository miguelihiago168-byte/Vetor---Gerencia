const fs=require('fs'),path=require('path');
function resolveReportUpload(stored,tenantId){
  let value=String(stored||'').replace(/\\/g,'/').split('?')[0];
  const at=value.toLowerCase().lastIndexOf('/uploads/');if(at>=0)value=value.slice(at+9);
  value=value.replace(/^\/+/, '').replace(/^(?:api\/)?uploads\//i,'');
  if(!value || value.split('/').includes('..'))return null;
  const tenant=value.match(/^tenant_(\d+)\//i);if(tenant&&Number(tenant[1])!==Number(tenantId))return null;
  const roots=[path.resolve(__dirname,'../uploads'),...(process.env.REPORT_UPLOADS_READ_ROOTS||'').split(path.delimiter).filter(Boolean).map(p=>path.resolve(p))];
  for(const root of roots){const full=path.resolve(root,value);if(full.startsWith(root+path.sep)&&fs.existsSync(full)&&fs.statSync(full).isFile())return full;}
  return null;
}
function companyLogos(project,tenantId){
  return [['logo_empresa_responsavel','empresa_responsavel','Contratante'],['logo_empresa_executante','empresa_executante','Executante']].flatMap(([field,name,role])=>{const file=resolveReportUpload(project?.[field],tenantId);return file?[{nome:project[name]||role,papel:role,imagem:fs.readFileSync(file).toString('base64')}]:[];});
}
module.exports={resolveReportUpload,companyLogos};

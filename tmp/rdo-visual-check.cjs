const puppeteer = require('../gestao-obras-vetor/backend/node_modules/puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page = await browser.newPage();
    const report = {id:8,numero_rdo:8,status:'Aprovado',projeto_nome:'SE MESQUITA',data_relatorio:'2026-11-13',criado_por_nome:'Ihiago Arruda',gestor_aprovado_por_nome:'Ihiago Arruda',cidade:'MESQUITA',uf:'MG',empresa_responsavel:'VETOR ENGENHARIA',logo_empresa_responsavel:'vetor.png',empresa_executante:'DLA ENERGIA',clima_manha:'Claro',clima_tarde:'Claro',praticabilidade_manha:'Praticável',praticabilidade_tarde:'Praticável',horario_inicio:'08:00',horario_fim:'17:00',intervalo:'12:00 às 13:00',horas_trabalhadas:8,mao_obra_direta:9,hh_mao_obra_direta:48,atividades:Array.from({length:5},(_,i)=>({id:i+1,descricao:'Atividade de campo'})),ocorrencias:[]};
    const problems=[];
    page.on('pageerror',err=>problems.push(err.message));
    await page.setRequestInterception(true);
    page.on('request', req=>{
      const url=new URL(req.url());
      if(url.hostname !== '127.0.0.1') return req.abort();
      if(url.pathname === '/api/uploads/vetor.png') return req.respond({contentType:'image/png',body:fs.readFileSync(path.resolve('gestao-obras-vetor/frontend/public/logo_vetor.png'))});
      if(url.pathname.startsWith('/api/')) return req.respond({contentType:'application/json',body:JSON.stringify(url.pathname==='/api/rdos/8'?report:[])});
      return req.continue();
    });
    await page.evaluateOnNewDocument(()=>{localStorage.setItem('app_version','3');localStorage.setItem('token','local-fixture');localStorage.setItem('usuario',JSON.stringify({id:1,nome:'Ihiago Arruda',perfil:'Gestor Geral',tenant_id:1}));});
    await page.setViewport({width:1536,height:960});
    await page.goto('http://127.0.0.1:4191/projeto/1/rdo/8');
    await page.waitForSelector('.rdo-cover-title h1');
    assert.deepEqual(await page.$$eval('.rdo-kpi-value',els=>els.map(e=>e.textContent)),['9','48','5','0']);
    await page.screenshot({path:'tmp/rdo-desktop.png'});
    for(const id of ['equipe','atividades','ocorrencias']){
      await page.click('.rdo-kpi-card[href="#'+id+'"]');
      assert.equal(await page.evaluate(()=>location.hash),'#'+id);
      assert.ok(await page.$eval('#'+id,el=>el.getBoundingClientRect().top<innerHeight));
    }
    await page.click('.rdo-report-actions-menu > button');
    assert.match(await page.$eval('.rdo-report-actions-menu-panel',e=>e.innerText),/Voltar para correção/);
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.rdo-report-actions-menu-panel'),null);
    await page.evaluate(()=>localStorage.setItem('theme','dark'));
    report.status='Em aprovação do gestor'; report.ocorrencias=[{id:1,descricao:'Ocorrência de exemplo'}];
    await page.goto('http://127.0.0.1:4191/projeto/1/rdos/8');
    await page.waitForSelector('body.dark-mode .rdo-kpi-card.is-warning');
    await page.screenshot({path:'tmp/rdo-escuro.png'});
    await page.click('.rdo-report-actions-menu > button');
    assert.match(await page.$eval('.rdo-report-actions-menu-panel',e=>e.innerText),/Aprovar como gestor/);
    await page.keyboard.press('Escape');
    report.status='Aprovado'; report.ocorrencias=[];
    await page.evaluate(()=>localStorage.setItem('theme','light'));
    await page.setViewport({width:390,height:844});
    await page.reload();
    await page.waitForSelector('.rdo-cover');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'tmp/rdo-celular.png'});
    await page.setViewport({width:320,height:700});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(problems,[]);
    console.log('Desktop, celular 320/390px, temas, indicadores, links e menu verificados.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

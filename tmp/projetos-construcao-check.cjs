const puppeteer = require('../gestao-obras-vetor/backend/node_modules/puppeteer');
const assert = require('node:assert/strict');
(async () => {
  const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page = await browser.newPage();
    const project = {id:1,nome:'SE MESQUITA',cidade:'MESQUITA - MG',empresa_responsavel:'VETOR ENGENHARIA',empresa_executante:'DLA ENERGIA',arquivado:0,prazo_termino:'2027-07-06',planned_start:'2026-08-15'};
    const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const {pathname,hostname}=new URL(req.url());
      if(hostname !== 'localhost' && hostname!=='127.0.0.1') return req.abort();
      if(!pathname.startsWith('/api/')) return req.continue();
      const data = pathname.endsWith('/cockpit') ? {project,permissions:{curve_s:true},updated_at:new Date().toISOString()}
        : pathname.endsWith('/avanco') ? {avanco_geral:{avanco_medio:32}}
        : pathname.endsWith('/curva-s') ? {indicadores:{avanco_real:32,avanco_planejado:34}}
        : pathname==='/api/projetos' ? [project] : [];
      return req.respond({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.evaluateOnNewDocument(()=>{
      localStorage.setItem('app_version','3');
      localStorage.setItem('token','local-fixture');
      localStorage.setItem('usuario',JSON.stringify({id:1,nome:'Exemplo',perfil:'Gestor Geral',tenant_id:1}));
    });
    for (const [width,height,theme,device] of [[1536,864,'light','desktop'],[390,844,'dark','mobile']]) {
      await page.setViewport({width,height});
      await page.goto('http://localhost:3000/projetos');
      await page.evaluate(theme=>localStorage.setItem('theme',theme),theme);
      await page.reload();
      await page.waitForSelector('.projeto-card-main');
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.$eval('.projeto-progress-label strong',e=>e.textContent),'32%');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'tmp/projetos-'+device+'.png'});
      await page.click('.projetos-btn-toggle');
      await page.waitForSelector('.projetos-archive-note');
      await page.click('.projetos-btn-toggle');
      await page.click('.projetos-btn-new');
      await page.waitForSelector('[role=dialog]');
      await page.click('[role=dialog] button');
      await page.focus('.projeto-card-main');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.cockpit-header');
      assert.ok(await page.$eval('.cockpit-header',e=>getComputedStyle(e,'::before').backgroundImage.includes('blueprint-v3')));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'tmp/dashboard-construcao-'+device+'.png'});
    }
    assert.deepEqual(errors,[]);
    console.log('Desktop claro e celular escuro: projetos, arquivo vazio, cadastro, navegação e dashboard verificados.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});

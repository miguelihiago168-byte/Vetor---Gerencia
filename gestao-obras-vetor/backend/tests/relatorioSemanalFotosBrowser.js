const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer');

module.exports = async function checkBrowser(app,port,reportId) {
  const frontend = path.resolve(__dirname,'../../frontend');
  const esbuild = require(require.resolve('esbuild',{paths:[frontend]}));
  const build = await esbuild.build({stdin:{contents:`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {MemoryRouter,Routes,Route} from 'react-router-dom';
    import RelatorioSemanal from './src/pages/RelatorioSemanal';
    createRoot(document.querySelector('main')).render(<MemoryRouter initialEntries={['/10']}><Routes>
      <Route path="/:projetoId" element={<RelatorioSemanal/>}/></Routes></MemoryRouter>);
    `,resolveDir:frontend,loader:'jsx'},outfile:'weekly.js',bundle:true,write:false,
    define:{'process.env.NODE_ENV':'"production"'}});
  app.get('/ui',(_req,res)=>res.type('html').send('<meta charset="utf-8"><link rel="stylesheet" href="/weekly.css"><main></main><script src="/weekly.js"></script>'));
  for (const file of build.outputFiles) app.get('/'+path.basename(file.path),(_req,res)=>res.type(path.extname(file.path)).send(Buffer.from(file.contents)));
  const browser = await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined});
  try {
    const page = await browser.newPage();
    await page.setViewport({width:1250,height:860});
    await page.goto('http://127.0.0.1:'+port+'/ui');
    // Pass labels as arguments to the browser context.
    async function clickButton(text) {
      await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(el=>!el.disabled && el.textContent.trim()===label),{},text);
      await page.evaluate(label=>[...document.querySelectorAll('button')].find(el=>!el.disabled && el.textContent.trim()===label).click(),text);
    }
    async function openReport() {
      await clickButton('02/03/2026 a 08/03/2026 · #'+reportId);
      await page.waitForSelector('.rs-workflow');
      await page.click('.rs-workflow button:last-child');
    }
    async function toggle(id) {
      await page.evaluate(n=>{
        const label=[...document.querySelectorAll('#rs-fotos .rs-check')].find(el=>el.querySelector('strong').textContent==='Foto #'+n);
        label.querySelector('input').click();
      },id);
    }
    async function state(id) {
      return page.evaluate(n=>{
        const label=[...document.querySelectorAll('#rs-fotos .rs-check')].find(el=>el.querySelector('strong').textContent==='Foto #'+n);
        const input=label.querySelector('input');
        return [input.checked,input.disabled,label.closest('fieldset').querySelector('.rs-count').textContent];
      },id);
    }
    await openReport();
    assert.deepEqual(await state(1),[false,false,'0/2']);
    await toggle(21);await toggle(1);
    assert.deepEqual(await state(21),[true,false,'2/2']);
    assert.deepEqual(await state(2),[false,true,'2/2']);
    assert.deepEqual(await state(3),[false,false,'0/2']);
    await toggle(3);await toggle(4);
    await toggle(21);assert.deepEqual(await state(1),[true,false,'1/2']);
    await toggle(2);assert.deepEqual(await state(21),[false,true,'2/2']);
    await page.click('.rs-workflow button:nth-child(2)');
    await page.click('.rs-workflow button:last-child');assert.deepEqual(await state(3),[true,false,'2/2']);
    await clickButton('Salvar relatório');
    await page.waitForFunction(()=>document.querySelector('.rs-notice')?.textContent.includes('salvo'));
    await page.reload();await openReport();assert.deepEqual(await state(3),[true,false,'2/2']);
    await clickButton('Atualizar fontes');
    await page.waitForFunction(()=>document.querySelector('.rs-notice')?.textContent.includes('atualizadas'));
    assert.deepEqual(await state(1),[true,false,'2/2']);
    await clickButton('Pré-visualizar PDF');
    await page.waitForSelector('iframe[title*="PDF"]');
    console.log('Chrome: contadores independentes, edição, navegação, reabertura, fontes e prévia aprovados.');
  } finally { await browser.close(); }
};

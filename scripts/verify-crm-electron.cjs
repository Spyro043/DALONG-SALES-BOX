const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {_electron}=require(process.env.DSB_PLAYWRIGHT_PATH||'playwright');
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsb-desktop-crm-')),qa=path.join(__dirname,'..','tmp','crm-qa');fs.mkdirSync(qa,{recursive:true});
  const env={...process.env,DSB_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:process.env.DSB_EXE||require('electron'),args:process.env.DSB_EXE?[]:[path.join(__dirname,'..')],env,timeout:60000});
  try{
    const p=await app.firstWindow();await p.getByRole('heading',{name:'客户跟进',exact:true}).waitFor();
    assert.equal(await app.evaluate(({Menu})=>Menu.getApplicationMenu()),null);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.isVisible()).some(w=>w.isMenuBarVisible())),false);
    const api=async(route,body)=>{const r=await fetch(new URL('/api/workspace/'+route,p.url()),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();assert(r.ok,JSON.stringify(d));return d;};
    const customer=await api('save',{collection:'customers',record:{company:'Desktop fixture',name:'Jane Smith',email:'jane@example.com',tradeRegion:'中东'}});
    await p.reload();await p.locator('[data-page=mail]').click();await p.locator('[name=mailSubject]').fill('Desktop focus test');await p.locator('#mailEditor').fill('Hello');await p.locator('#mailEditor').press('Control+End');
    await p.locator('[data-action=mailLink]').click();await p.locator('#modal [name=url]').fill('https://example.com');await p.locator('#modal [name=label]').fill('Link');await p.locator('#modalForm button[type=submit]').click();await p.waitForFunction(()=>document.activeElement?.id==='mailEditor');await p.keyboard.type(' after link');
    await p.locator('[data-action=aiMail]').click();await p.locator('#modal [data-action=close]').first().click();await p.waitForFunction(()=>document.activeElement?.id==='mailEditor');await p.keyboard.type(' after dialog');
    await p.locator('[data-recipient="'+customer.id+'"]').check();await p.locator('#mailEditor').click();await p.locator('#mailEditor').press('Control+End');await p.locator('[data-action=sendMail]').click();await p.locator('#modal [data-action=close]').first().click();await p.waitForFunction(()=>document.activeElement?.id==='mailEditor');await p.keyboard.type(' after send cancel');assert((await p.locator('#mailEditor').innerText()).includes('after send cancel'));
    await p.route('**/api/workspace/smtp-test',r=>r.fulfill({json:{ok:true}}));await p.locator('[data-action=smtpTest]').click();await p.waitForFunction(()=>document.activeElement?.id==='mailEditor');await p.keyboard.type(' after notification');assert((await p.locator('#mailEditor').innerText()).includes('after notification'));
    const img='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'..','assets','dsb.png')).toString('base64');
    const doc=await api('save',{collection:'documents',record:{type:'QT',number:'DESKTOP-IMAGE-TEST',date:'2026-09-14',language:'both',currency:'USD',showProductImages:true,buyer:customer,seller:{company:'Test seller'},items:[{name:'Product image fixture',quantity:2,price:20,image:img}]}});
    const pdf=await fetch(new URL('/api/workspace/document?id='+doc.id+'&format=pdf',p.url()));const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');assert(bytes.includes(Buffer.from('/Subtype /Image')),'PDF must contain embedded product image');fs.writeFileSync(path.join(qa,'quotation-image-desktop.pdf'),bytes);
    await p.locator('[data-page=customers]').click();await p.screenshot({path:path.join(qa,'desktop-no-menu.png'),fullPage:true});
    console.log('PASS: Electron native menu removed, typing continues after link / AI / send / notification dialogs, isolated customer persistence and actual PDF export with embedded product image ('+bytes.length+' bytes)');
  }finally{await app.close();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});

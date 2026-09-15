const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {_electron}=require(process.env.DSB_PLAYWRIGHT_PATH||'playwright');
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsb-migration-'));
  const env={...process.env,DSB_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
  const server=require('http').createServer((req,res)=>res.end('<html><body>Migration fixture</body></html>'));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const fixtureUrl='http://localhost:'+server.address().port;
  let app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..')],env});
  try{
    await (await app.firstWindow()).getByRole('heading',{name:'客户跟进',exact:true}).waitFor();
    await app.evaluate(async ({BrowserWindow,session},fixtureUrl)=>{
      const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true}});
      await window.loadURL(fixtureUrl);
      await window.webContents.executeJavaScript('localStorage.setItem("outreach-desk-leads",JSON.stringify([{id:"legacy-customer",company:"Legacy fixture",email:"legacy@example.com",status:"已回复"}]))');
      session.defaultSession.flushStorageData();window.destroy();
    },fixtureUrl);
  }finally{await app.close();await new Promise(r=>server.close(r));}
  const marker=path.join(dir,'dsb-legacy-migration.json');
  if(fs.existsSync(marker))fs.unlinkSync(marker);
  app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..')],env});
  try{
    let window;for(let i=0;i<100;i++){for(const candidate of app.windows()){try{if(!candidate.isClosed()&&await candidate.locator('#nav').count()){window=candidate;break;}}catch{}}if(window)break;await new Promise(r=>setTimeout(r,100));}
    if(!window)throw new Error('Migration startup failed');
    await window.locator('#nav').waitFor();
    const state=await (await fetch(new URL('/api/workspace/state',window.url()))).json();
    assert.equal(state.customers.filter(c=>c.id==='legacy-customer').length,1);assert.equal(state.customers[0].status,'已回复');
    console.log('PASS: actual Electron localStorage migration across random localhost ports');
  }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

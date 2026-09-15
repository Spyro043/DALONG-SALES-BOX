const assert=require('assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const nodemailer=require('nodemailer');
const sent=[];
nodemailer.createTransport=()=>({verify:async()=>true,close(){},sendMail:async mail=>{sent.push(mail);if(mail.to==='fail@example.com')throw new Error('Fixture rejection');return {accepted:[mail.to],messageId:'test-message'};}});
const {startServer}=require('../server');
const {totals,margin,documentHtml}=require('../workspace-api');
const Excel=require('exceljs');
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsb-test-'));
  const server=await startServer({port:0,configDir:dir});
  const request=async(route,body)=>{const r=await fetch(server.url+'/api/workspace/'+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
  try{
    assert.equal(totals({items:[{quantity:3,price:12.5}],freight:2}).total,39.5);
    assert.equal(margin({purchase:80,rate:1,target:20}).suggested,100);
    assert.throws(()=>margin({rate:1,platform:40,target:60}));
    const c=await request('save',{collection:'customers',record:{company:'Test & Co',name:'Jane',email:'jane@example.com',grade:'A',nextFollowUp:'2026-09-14'}});
    await assert.rejects(()=>request('save',{collection:'customers',record:{company:'Duplicate',email:'JANE@example.com'}}));
    await request('migrate',{customers:[c,c]});assert.equal((await request('state')).customers.length,1);
    await request('communication',{id:c.id,summary:'Phone call',complete:true});assert.equal((await request('state')).customers[0].nextFollowUp,'');
    const p=await request('save',{collection:'products',record:{name:'Containment boom',sku:'DSB-01',price:12.5}});
    let doc=await request('save',{collection:'documents',record:{type:'QT',number:'QT-TEST',date:'2026-09-14',buyer:c,seller:{company:'Seller'},currency:'USD',items:[{...p,quantity:3}],freight:2,template:{color:'#123456',columns:['name','amount']}}});
    assert.equal(doc.total,39.5);doc=await request('save',{collection:'documents',record:{...doc,notes:'Updated'}});assert.equal(doc.version,2);assert.equal(doc.history.length,1);
    const html=documentHtml(doc);assert(html.includes('Test &amp; Co'));assert(html.includes('39.50'));assert(html.includes('#123456'));
    const exported=await fetch(server.url+'/api/workspace/document?id='+doc.id+'&format=xlsx');const wb=new Excel.Workbook();await wb.xlsx.load(Buffer.from(await exported.arrayBuffer()));assert.equal(wb.worksheets[0].getCell('A1').value,'QUOTATION');
    const originalFetch=global.fetch,dns=require('dns').promises,originalLookup=dns.lookup;
    try{
      dns.lookup=async(host,...args)=>host==='fixture.company'?[{address:'93.184.216.34',family:4}]:originalLookup.call(dns,host,...args);
      global.fetch=async(url,options)=>String(url).startsWith('https://fixture.company')?new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /':'<html><head><title>Fixture Ltd</title></head><body><nav><a href="/contact">Contact</a></nav><a href="mailto:hello@fixture.company">Email us</a><footer>sales@fixture.company</footer></body></html>'):originalFetch(url,options);
      const crawl=await request('crawl',{website:'https://fixture.company'});assert(crawl.emails.includes('hello@fixture.company'));assert(crawl.emails.includes('sales@fixture.company'));assert(crawl.pages.length<=3);
    }finally{global.fetch=originalFetch;dns.lookup=originalLookup;}
    await request('settings',{smtpHost:'fixture',smtpUser:'sender@example.com',smtpPassword:'secret'});assert.equal((await request('settings')).smtpPassword,'');
    const fail=await request('save',{collection:'customers',record:{company:'Failure',email:'fail@example.com'}});
    const opted=await request('save',{collection:'customers',record:{company:'Opted out',email:'opt@example.com',status:'已退订'}});
    const job=await request('send',{ids:[c.id,fail.id,opted.id],subject:'Hello {公司}',html:'Dear {姓名}',text:'Dear {姓名}',interval:1});
    let status;for(let i=0;i<40;i++){status=await request('job?id='+job.id);if(status.status!=='running')break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(status.total,2);assert.equal(status.results[0].status,'sent');assert.equal(status.results[1].status,'failed');assert.equal(sent.length,2);assert.equal(sent[0].html,'Dear Jane');
    const db=await request('state');assert.equal(db.customers.find(x=>x.id===c.id).communications.length,2);assert.equal(db.customers.find(x=>x.id===fail.id).lastContact,undefined);
    const secret=await fetch(server.url+'/workspace-settings.json');assert.equal(secret.status,404);
    console.log('PASS: persistence, migration dedupe, follow-up, document versions, totals, margins, XLSX, SMTP success/failure/opt-out, secrets');
  }finally{await new Promise(r=>server.server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
